// Runs the shipped LightweaverCrashRecord.h on a host: what an abnormal reset
// leaves behind, how the last three are kept and stored, and what the two
// reports say.

#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>

#include "LightweaverCrashRecord.h"

namespace {

LwCrashBreadcrumb runningCard(uint32_t bootCount) {
  LwCrashBreadcrumb crumb;
  lwCrashBreadcrumbStart(crumb, bootCount);
  crumb.uptimeMs = 27252000;  // 7.57 hours, the 2026-11-24 watchdog reset
  crumb.freeHeap = 181000;
  crumb.minFreeHeap = 64000;
  crumb.activityAtMs = 27250000;
  lwCrashSetText(crumb.activity, sizeof(crumb.activity), "/api/config");
  lwCrashSetText(crumb.pattern, sizeof(crumb.pattern), "fire");
  return crumb;
}

void addTrace(LwCrashBreadcrumb& crumb, uint8_t depth) {
  crumb.hookMagic = LW_CRASH_HOOK_MAGIC;
  crumb.programCounter = 0x4200abcd;
  crumb.core = 1;
  crumb.backtraceDepth = depth;
  for (uint8_t i = 0; i < LW_CRASH_BACKTRACE_MAX; i++) crumb.backtrace[i] = 0x42000000u + i;
  lwCrashSetText(crumb.task, sizeof(crumb.task), "loopTask");
  lwCrashSetText(crumb.fault, sizeof(crumb.fault), "LoadProhibited");
}

void reasons() {
  // Panic, both watchdogs and brownout are recorded; a normal restart, a
  // power-on and a deliberate reset are not.
  for (uint8_t reason : {4, 5, 6, 7, 9}) assert(lwCrashReasonAbnormal(reason));
  for (uint8_t reason : {0, 1, 2, 3, 8, 10}) assert(!lwCrashReasonAbnormal(reason));
  assert(std::string(lwCrashReasonName(4)) == "panic");
  assert(std::string(lwCrashReasonName(6)) == "task-watchdog");
  assert(std::string(lwCrashReasonName(5)) == "interrupt-watchdog");
  assert(std::string(lwCrashReasonName(9)) == "brownout");
}

void record() {
  LwCrashBreadcrumb crumb = runningCard(41);
  crumb.saveInProgress = 1;
  addTrace(crumb, 12);
  const LwCrashRecord made = lwCrashRecordFromBreadcrumb(crumb, 4, 40, 2824, "1.2.6");
  assert(made.resetReason == 4 && made.breadcrumb == 1 && made.hook == 1);
  assert(made.bootCount == 41 && made.uptimeMs == 27252000);
  assert(made.freeHeap == 181000 && made.minFreeHeap == 64000);
  assert(made.activityAgeMs == 2000 && made.saveInProgress == 1);
  assert(std::string(made.activity) == "/api/config");
  assert(std::string(made.pattern) == "fire");
  assert(std::string(made.task) == "loopTask");
  assert(std::string(made.fault) == "LoadProhibited");
  assert(made.programCounter == 0x4200abcd && made.core == 1);
  assert(made.backtraceDepth == 12 && made.backtrace[11] == 0x4200000bu);
  assert(made.buildNumber == 2824 && std::string(made.firmwareVersion) == "1.2.6");

  // A brownout or a hang caught by the hardware watchdog has no panic hook:
  // the running state is kept and the trace is marked absent, not invented.
  LwCrashBreadcrumb noHook = runningCard(42);
  const LwCrashRecord brownout = lwCrashRecordFromBreadcrumb(noHook, 9, 41, 2824, "1.2.6");
  assert(brownout.breadcrumb == 1 && brownout.hook == 0);
  assert(brownout.backtraceDepth == 0 && brownout.programCounter == 0 && brownout.task[0] == 0);

  // Power was cut before the restart (or first start on this firmware): the
  // breadcrumb is whatever was in memory. Only the reset reason is kept.
  LwCrashBreadcrumb garbage;
  memset(&garbage, 0xA5, sizeof(garbage));
  const LwCrashRecord bare = lwCrashRecordFromBreadcrumb(garbage, 6, 77, 2824, "1.2.6");
  assert(bare.resetReason == 6 && bare.breadcrumb == 0 && bare.hook == 0);
  assert(bare.bootCount == 77 && bare.uptimeMs == 0 && bare.activity[0] == 0);

  // A damaged breadcrumb cannot overrun a record: depth is clamped and text
  // with no terminator is cut and cleaned.
  LwCrashBreadcrumb damaged = runningCard(43);
  addTrace(damaged, 200);
  memset(damaged.activity, '"', sizeof(damaged.activity));
  memset(damaged.task, 0x01, sizeof(damaged.task));
  const LwCrashRecord safe = lwCrashRecordFromBreadcrumb(damaged, 4, 42, 2824, "1.2.6");
  assert(safe.backtraceDepth == LW_CRASH_BACKTRACE_MAX);
  assert(strlen(safe.activity) == LW_CRASH_ACTIVITY_BYTES - 1);
  assert(strchr(safe.activity, '"') == nullptr);
  assert(strlen(safe.task) == LW_CRASH_TASK_BYTES - 1 && safe.task[0] == '_');
}

void rotate() {
  LwCrashRing ring;
  lwCrashRingClear(ring);
  for (uint32_t boot = 1; boot <= 5; boot++) {
    LwCrashBreadcrumb crumb = runningCard(boot);
    lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(crumb, 4, boot, 2824, "1.2.6"));
    assert(ring.total == boot);
    assert(ring.count == (boot < 3 ? boot : 3));
    assert(ring.records[0].bootCount == boot);  // newest first
  }
  // The last three are kept, oldest dropped.
  assert(ring.records[0].bootCount == 5 && ring.records[1].bootCount == 4 &&
      ring.records[2].bootCount == 3);
}

void persist() {
  LwCrashRing ring;
  lwCrashRingClear(ring);
  LwCrashBreadcrumb crumb = runningCard(9);
  addTrace(crumb, 8);
  lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(crumb, 6, 8, 2824, "1.2.6"));
  uint8_t blob[LW_CRASH_BLOB_BYTES];
  assert(lwCrashRingEncode(ring, blob, sizeof(blob) - 1) == 0);  // too small: nothing written
  assert(lwCrashRingEncode(ring, blob, sizeof(blob)) == sizeof(blob));
  // The blob has to fit the card's small settings store with room to spare.
  assert(sizeof(blob) < 1024);

  LwCrashRing back;
  assert(lwCrashRingDecode(blob, sizeof(blob), back));
  assert(memcmp(&back, &ring, sizeof(ring)) == 0);

  // Missing, short, damaged or other-version data reads as "no records" and
  // never as a failure that could stop the card starting.
  LwCrashRing empty;
  assert(!lwCrashRingDecode(nullptr, 0, empty) && empty.count == 0);
  assert(!lwCrashRingDecode(blob, sizeof(blob) - 1, empty) && empty.count == 0);
  uint8_t flipped[LW_CRASH_BLOB_BYTES];
  memcpy(flipped, blob, sizeof(blob));
  flipped[sizeof(blob) - 5] ^= 0x10;
  assert(!lwCrashRingDecode(flipped, sizeof(flipped), empty) && empty.count == 0 && empty.total == 0);
  memcpy(flipped, blob, sizeof(blob));
  flipped[4] ^= 0x01;  // version
  assert(!lwCrashRingDecode(flipped, sizeof(flipped), empty) && empty.count == 0);
}

void reports() {
  LwCrashRing ring;
  lwCrashRingClear(ring);
  char report[LW_CRASH_REPORT_BYTES];

  // A card that has never crashed.
  LwCrashSummary none = lwCrashSummarize(ring, 12);
  assert(none.total == 0 && none.kept == 0 && none.lastReason == 0);
  size_t length = lwCrashFullReport(ring, 12, false, 0, report, sizeof(report));
  assert(length > 0);
  assert(std::string(report) ==
      "{\"ok\":true,\"bootCount\":12,\"total\":0,\"kept\":0,"
      "\"coreDump\":{\"present\":false,\"bytes\":0},\"records\":[]}");

  // Three full records, each with the deepest trace and the longest text: the
  // worst case must fit the report buffer.
  for (uint32_t boot = 20; boot < 24; boot++) {
    LwCrashBreadcrumb crumb = runningCard(boot);
    memset(crumb.activity, 'r', sizeof(crumb.activity) - 1);
    memset(crumb.pattern, 'p', sizeof(crumb.pattern) - 1);
    addTrace(crumb, LW_CRASH_BACKTRACE_MAX);
    memset(crumb.task, 't', sizeof(crumb.task) - 1);
    memset(crumb.fault, 'f', sizeof(crumb.fault) - 1);
    crumb.uptimeMs = 4000000000u;
    crumb.freeHeap = 4000000000u;
    crumb.minFreeHeap = 4000000000u;
    crumb.activityAtMs = 1;
    lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(crumb, 5, boot, 4000000000u, "111.222.333-dev"));
  }
  length = lwCrashFullReport(ring, 4000000000u, true, 65536, report, sizeof(report));
  assert(length > 0 && length == strlen(report) && length < sizeof(report));
  std::printf("worst-case full report: %zu of %zu bytes\n", length, sizeof(report));
  const std::string text(report);
  assert(text.find("\"total\":4") != std::string::npos);
  assert(text.find("\"kept\":3") != std::string::npos);
  assert(text.find("\"coreDump\":{\"present\":true,\"bytes\":65536}") != std::string::npos);
  assert(text.find("\"reason\":\"interrupt-watchdog\"") != std::string::npos);
  assert(text.find("\"programCounter\":\"0x4200abcd\"") != std::string::npos);
  assert(text.find("\"0x4200000f\"]") != std::string::npos);  // 16th frame
  // Balanced and free of raw control bytes: it is valid to hand to a browser.
  int braces = 0, brackets = 0;
  for (char c : text) {
    assert(static_cast<unsigned char>(c) >= 0x20);
    if (c == '{') braces++;
    if (c == '}') braces--;
    if (c == '[') brackets++;
    if (c == ']') brackets--;
  }
  assert(braces == 0 && brackets == 0);
  // Too small a buffer returns nothing, never a cut-off report.
  char tiny[64];
  assert(lwCrashFullReport(ring, 1, false, 0, tiny, sizeof(tiny)) == 0 && tiny[0] == 0);

  // The short summary: newest record, and how many starts ago it was.
  const LwCrashSummary summary = lwCrashSummarize(ring, 30);
  assert(summary.total == 4 && summary.kept == 3);
  assert(summary.lastReason == 5 && summary.lastBootCount == 23);
  assert(summary.bootsSince == 6);          // starts 24..29 came between
  assert(lwCrashSummarize(ring, 24).bootsSince == 0);  // the start right after
  assert(lwCrashSummarize(ring, 3).bootsSince == 0);   // a reset counter never underflows

  // A record without running state or a trace says so instead of printing zeros.
  LwCrashRing bare;
  lwCrashRingClear(bare);
  LwCrashBreadcrumb garbage;
  memset(&garbage, 0xFF, sizeof(garbage));
  lwCrashRingPush(bare, lwCrashRecordFromBreadcrumb(garbage, 9, 3, 2824, "1.2.6"));
  assert(lwCrashFullReport(bare, 4, false, 0, report, sizeof(report)) > 0);
  const std::string bareText(report);
  assert(bareText.find("\"runningState\":false,\"trace\":false}") != std::string::npos);
  assert(bareText.find("freeHeap") == std::string::npos);
  assert(bareText.find("backtrace") == std::string::npos);
}

// "lastCrash" on /api/status, in the shape Studio's reader already expects.
// Each line printed here is parsed and checked by crash-record.mjs with the
// reader's own rules.
void lastCrash() {
  char text[LW_CRASH_LAST_BYTES];
  LwCrashRing ring;
  lwCrashRingClear(ring);
  assert(lwCrashLastCrashJson(ring, text, sizeof(text)) == 4 && std::string(text) == "null");
  std::printf("LASTCRASH never %s\n", text);

  // 2026-11-23: a panic while a project save was being answered.
  LwCrashBreadcrumb panic = runningCard(7);
  panic.saveInProgress = 1;
  addTrace(panic, LW_CRASH_BACKTRACE_MAX);
  lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(panic, 4, 6, 2824, "1.2.6"));
  assert(lwCrashLastCrashJson(ring, text, sizeof(text)) > 0);
  std::printf("LASTCRASH panic %s\n", text);
  assert(std::string(lwCrashPhase(ring.records[0])) == "configSave");

  // 2026-11-24: a task watchdog after 7.57 hours with nobody talking to it.
  LwCrashBreadcrumb stall = runningCard(8);
  stall.activityAtMs = 1000;  // the last request was hours earlier
  addTrace(stall, 9);
  lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(stall, 6, 7, 2824, "1.2.6"));
  assert(lwCrashLastCrashJson(ring, text, sizeof(text)) > 0);
  std::printf("LASTCRASH watchdog %s\n", text);
  assert(std::string(lwCrashPhase(ring.records[0])) == "idle");

  // A brownout: running state, no trace. Zero address and an empty list.
  LwCrashBreadcrumb brownout = runningCard(9);
  lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(brownout, 9, 8, 2824, "1.2.6"));
  assert(lwCrashLastCrashJson(ring, text, sizeof(text)) > 0);
  std::printf("LASTCRASH brownout %s\n", text);

  // Power lost before the restart: reason only.
  LwCrashBreadcrumb garbage;
  memset(&garbage, 0x5A, sizeof(garbage));
  lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(garbage, 5, 9, 2824, "1.2.6"));
  assert(lwCrashLastCrashJson(ring, text, sizeof(text)) > 0);
  std::printf("LASTCRASH bare %s\n", text);
  assert(std::string(lwCrashPhase(ring.records[0])) == "unknown");

  // What the card was doing, from the last request when it was recent.
  struct Case { const char* path; const char* phase; };
  for (const Case& c : {Case{"/api/config", "configSave"}, Case{"/api/wiring/candidate", "configSave"},
      Case{"/api/update/chunk", "update"}, Case{"/api/wifi", "wifi"}, Case{"/api/reset-wifi", "wifi"},
      Case{"/api/projects/commit", "storage"}, Case{"/api/media/chunk", "storage"},
      Case{"/api/status", "http"}, Case{"/json/state", "http"}}) {
    LwCrashBreadcrumb crumb = runningCard(1);
    lwCrashSetText(crumb.activity, sizeof(crumb.activity), c.path);
    crumb.activityAtMs = crumb.uptimeMs - 500;
    const LwCrashRecord made = lwCrashRecordFromBreadcrumb(crumb, 4, 1, 1, "1.2.6");
    assert(std::string(lwCrashPhase(made)) == c.phase);
  }

  // Worst case fits, and too small a buffer returns nothing.
  LwCrashBreadcrumb full = runningCard(4000000000u);
  addTrace(full, LW_CRASH_BACKTRACE_MAX);
  memset(full.task, 't', sizeof(full.task) - 1);
  full.uptimeMs = full.freeHeap = full.minFreeHeap = 4000000000u;
  full.saveInProgress = 1;
  ring.total = 4000000000u;
  lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(full, 5, 1, 1, "1.2.6"));
  const size_t worst = lwCrashLastCrashJson(ring, text, sizeof(text));
  assert(worst > 0 && worst < sizeof(text));
  std::printf("worst-case lastCrash: %zu of %zu bytes\n", worst, sizeof(text));
  char tiny[32];
  assert(lwCrashLastCrashJson(ring, tiny, sizeof(tiny)) == 0 && tiny[0] == 0);
}

void noSecrets() {
  // The record has no field a credential could go in, and the report names
  // none. The only free text is a path, a pattern id, a task and a fault name.
  LwCrashRing ring;
  lwCrashRingClear(ring);
  LwCrashBreadcrumb crumb = runningCard(1);
  addTrace(crumb, 4);
  lwCrashRingPush(ring, lwCrashRecordFromBreadcrumb(crumb, 4, 1, 2824, "1.2.6"));
  char report[LW_CRASH_REPORT_BYTES];
  assert(lwCrashFullReport(ring, 2, false, 0, report, sizeof(report)) > 0);
  std::string lower(report);
  for (char& c : lower) c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
  for (const char* word : {"password", "ssid", "wifi", "token", "capability", "secret", "psk"})
    assert(lower.find(word) == std::string::npos);
}

}  // namespace

int main() {
  reasons();
  record();
  rotate();
  persist();
  reports();
  lastCrash();
  noSecrets();
  std::puts("crash record: 7 groups passed");
  return 0;
}
