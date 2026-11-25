#include "LightweaverCrashRecorder.h"

#if defined(ARDUINO_ARCH_ESP32)
#include <Preferences.h>
#include <WebServer.h>
#include <esp_attr.h>
#include <esp_core_dump.h>
#include <esp_debug_helpers.h>
#include <esp_private/panic_internal.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/xtensa_context.h>

#include "LightweaverRuntimeApi.h"
#include "LightweaverWeb.h"

#ifndef LW_BUILD_NUMBER
#define LW_BUILD_NUMBER 0
#endif
#ifndef LW_FIRMWARE_VERSION
#define LW_FIRMWARE_VERSION "0.0.0"
#endif

namespace {

// Not cleared by a reset; cleared by losing power. Validated by its magic.
RTC_NOINIT_ATTR LwCrashBreadcrumb g_crumb;

LwCrashRing g_ring;
uint32_t g_bootCount = 0;
uint32_t g_lastSampleMs = 0;
WebServer* g_crashServer = nullptr;

const char* kNamespace = "lwcrash";

void loadRing(Preferences& prefs) {
  uint8_t blob[LW_CRASH_BLOB_BYTES];
  lwCrashRingClear(g_ring);
  if (prefs.getBytesLength("ring") != sizeof(blob)) return;
  if (prefs.getBytes("ring", blob, sizeof(blob)) != sizeof(blob)) return;
  lwCrashRingDecode(blob, sizeof(blob), g_ring);
}

void saveRing(Preferences& prefs) {
  uint8_t blob[LW_CRASH_BLOB_BYTES];
  if (lwCrashRingEncode(g_ring, blob, sizeof(blob)) == sizeof(blob))
    prefs.putBytes("ring", blob, sizeof(blob));
}

void sampleRunningState() {
  g_crumb.freeHeap = esp_get_free_heap_size();
  g_crumb.minFreeHeap = esp_get_minimum_free_heap_size();
  lwCrashSetText(g_crumb.pattern, sizeof(g_crumb.pattern), runtimeCurrentPatternId().c_str());
}

void handleCrashLog() {
  const String origin = g_crashServer->header("Origin");
  if (corsOriginAllowed(origin)) {
    g_crashServer->sendHeader("Access-Control-Allow-Origin", origin);
    g_crashServer->sendHeader("Vary", "Origin");
    g_crashServer->sendHeader("Access-Control-Allow-Private-Network", "true");
  }
  g_crashServer->sendHeader("Cache-Control", "no-store");
  size_t dumpAddress = 0;
  size_t dumpBytes = 0;
  // Reads the stored dump's header only. Present means the system's own core
  // dump reached the flash area the partition table already reserves for it.
  const bool dumpPresent = esp_core_dump_image_get(&dumpAddress, &dumpBytes) == ESP_OK && dumpBytes > 0;
  char* report = static_cast<char*>(malloc(LW_CRASH_REPORT_BYTES));
  if (report == nullptr || lwCrashFullReport(g_ring, g_bootCount, dumpPresent,
          dumpPresent ? static_cast<uint32_t>(dumpBytes) : 0, report, LW_CRASH_REPORT_BYTES) == 0) {
    free(report);
    g_crashServer->send(500, "application/json", "{\"ok\":false,\"error\":\"crash log unavailable\"}");
    return;
  }
  g_crashServer->send(200, "application/json", report);
  free(report);
}

}  // namespace

void lightweaverCrashRecorderBoot() {
  const uint8_t resetReason = static_cast<uint8_t>(esp_reset_reason());
  Preferences prefs;
  if (!prefs.begin(kNamespace, false)) {
    // No NVS: still keep the breadcrumb current so a later start can use it.
    lwCrashBreadcrumbStart(g_crumb, 0);
    return;
  }
  loadRing(prefs);
  const uint32_t previousBoot = prefs.getUInt("boots", 0);
  g_bootCount = previousBoot == UINT32_MAX ? previousBoot : previousBoot + 1;
  prefs.putUInt("boots", g_bootCount);
  if (lwCrashReasonAbnormal(resetReason)) {
    lwCrashRingPush(g_ring, lwCrashRecordFromBreadcrumb(
        g_crumb, resetReason, previousBoot, LW_BUILD_NUMBER, LW_FIRMWARE_VERSION));
    saveRing(prefs);
  }
  prefs.end();
  lwCrashBreadcrumbStart(g_crumb, g_bootCount);
}

void lightweaverCrashRecorderTick(uint32_t nowMs) {
  g_crumb.uptimeMs = nowMs;
  if (g_lastSampleMs != 0 && nowMs - g_lastSampleMs < 1000U) return;
  g_lastSampleMs = nowMs ? nowMs : 1;
  sampleRunningState();
}

void lightweaverCrashNoteActivity(const char* path) {
  lwCrashSetText(g_crumb.activity, sizeof(g_crumb.activity), path);
  g_crumb.activityAtMs = millis();
  g_crumb.uptimeMs = g_crumb.activityAtMs;
}

void lightweaverCrashNoteSave(bool inProgress) {
  g_crumb.saveInProgress = inProgress ? 1 : 0;
}

void lightweaverCrashReportSummary(JsonObject crash) {
  const LwCrashSummary summary = lwCrashSummarize(g_ring, g_bootCount);
  crash["bootCount"] = g_bootCount;
  crash["count"] = summary.total;
  crash["kept"] = summary.kept;
  if (summary.kept == 0) return;
  crash["lastReason"] = summary.lastReason;
  crash["lastReasonName"] = lwCrashReasonName(summary.lastReason);
  crash["lastBootCount"] = summary.lastBootCount;
  crash["lastUptimeMs"] = summary.lastUptimeMs;
  crash["bootsSince"] = summary.bootsSince;
}

bool lightweaverCrashLoopDetected() {
  return lwCrashLoopDetected(g_ring, g_bootCount);
}

String lightweaverCrashLastCrashJson() {
  char text[LW_CRASH_LAST_BYTES];
  if (lwCrashLastCrashJson(g_ring, text, sizeof(text)) == 0) return String("null");
  return String(text);
}

void registerLightweaverCrashRecorder(WebServer& server) {
  g_crashServer = &server;
  server.on("/api/crash-log", HTTP_GET, handleCrashLog);
}

// ---- Panic hook --------------------------------------------------------------
//
// The linker flag -Wl,--wrap=esp_panic_handler routes every panic (illegal
// access, abort, failed check, stack overflow, and the task and interrupt
// watchdogs, which abort) through here before the system's own handler prints
// and restarts. It copies the task, program address and call trace into the
// breadcrumb and hands over. It allocates nothing, takes no lock and writes
// only to memory that is always mapped. A brownout does not pass through a
// panic, so that record carries the running state only.

extern "C" void __real_esp_panic_handler(panic_info_t* info);

// Return addresses carry the register-window size in their top two bits, and
// point just past the call. A macro, so no helper lands outside IRAM.
#define LW_CRASH_CODE_ADDRESS(pc) \
  ((((pc) & 0x80000000u) ? (((pc) & 0x3fffffffu) | 0x40000000u) : (pc)) - 3u)

extern "C" void IRAM_ATTR __wrap_esp_panic_handler(panic_info_t* info) {
  // A second panic while handling the first keeps the first one's evidence.
  if (g_crumb.magic == LW_CRASH_CRUMB_MAGIC && g_crumb.hookMagic != LW_CRASH_HOOK_MAGIC &&
      info != nullptr) {
    g_crumb.core = static_cast<uint8_t>(info->core);
    const char* fault = info->reason;
    size_t index = 0;
    for (; fault != nullptr && index + 1 < sizeof(g_crumb.fault) && fault[index] != 0; index++)
      g_crumb.fault[index] = fault[index];
    g_crumb.fault[index] = 0;
    const char* task = pcTaskGetName(nullptr);
    index = 0;
    for (; task != nullptr && index + 1 < sizeof(g_crumb.task) && task[index] != 0; index++)
      g_crumb.task[index] = task[index];
    g_crumb.task[index] = 0;
    g_crumb.programCounter = reinterpret_cast<uint32_t>(info->addr);
    uint8_t depth = 0;
    const XtExcFrame* frame = static_cast<const XtExcFrame*>(info->frame);
    if (frame != nullptr) {
      esp_backtrace_frame_t walk = {};
      walk.pc = static_cast<uint32_t>(frame->pc);
      walk.sp = static_cast<uint32_t>(frame->a1);
      walk.next_pc = static_cast<uint32_t>(frame->a0);
      walk.exc_frame = frame;
      if (g_crumb.programCounter == 0) g_crumb.programCounter = walk.pc;
      g_crumb.backtrace[depth++] = LW_CRASH_CODE_ADDRESS(walk.pc);
      while (depth < LW_CRASH_BACKTRACE_MAX && walk.next_pc != 0) {
        if (!esp_backtrace_get_next_frame(&walk)) break;
        g_crumb.backtrace[depth++] = LW_CRASH_CODE_ADDRESS(walk.pc);
      }
    }
    g_crumb.backtraceDepth = depth;
    g_crumb.hookMagic = LW_CRASH_HOOK_MAGIC;
  }
  __real_esp_panic_handler(info);
}

#else
void lightweaverCrashRecorderBoot() {}
bool lightweaverCrashLoopDetected() { return false; }
void lightweaverCrashRecorderTick(uint32_t) {}
void lightweaverCrashNoteActivity(const char*) {}
void lightweaverCrashNoteSave(bool) {}
void lightweaverCrashReportSummary(JsonObject) {}
String lightweaverCrashLastCrashJson() { return String("null"); }
void registerLightweaverCrashRecorder(WebServer&) {}
#endif
