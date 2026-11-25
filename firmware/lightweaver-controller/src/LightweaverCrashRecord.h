#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

// What the card remembers about an abnormal reset.
//
// Two unexplained resets (2026-11-23, software panic after a config save;
// 2026-11-24, task watchdog after 7.57 hours) left nothing behind: the card
// came back in its warm-white recovery state with a reset reason and no other
// evidence. This file is the record that now survives.
//
// How it survives: a small "breadcrumb" lives in memory the chip does not
// clear on a reset (RTC no-init memory). The running card keeps it current
// (up-time, free memory, last request, current pattern); the panic hook adds
// the task, program address and call trace at the moment of the crash. The
// next start-up reads it, turns it into a record and stores the last three in
// NVS. Pulling the power wipes the breadcrumb, so a crash followed by a power
// cut before the card restarts leaves only the reset reason.
//
// Pure data and arithmetic, no Arduino dependency: tests/crash-record.cpp runs
// the shipped record, rotate, store and report code on a host.
//
// Nothing here ever holds a Wi-Fi name, password, token or request body: the
// only text is a request path, a pattern id, a task name and a fault name.

static constexpr uint32_t LW_CRASH_CRUMB_MAGIC = 0x4C574342u;  // "LWCB"
static constexpr uint32_t LW_CRASH_HOOK_MAGIC = 0x4C574850u;   // "LWHP"
static constexpr uint32_t LW_CRASH_BLOB_MAGIC = 0x4C574352u;   // "LWCR"
static constexpr uint16_t LW_CRASH_BLOB_VERSION = 1;
static constexpr uint8_t LW_CRASH_RING_SIZE = 3;
static constexpr uint8_t LW_CRASH_BACKTRACE_MAX = 16;
static constexpr size_t LW_CRASH_ACTIVITY_BYTES = 40;
static constexpr size_t LW_CRASH_PATTERN_BYTES = 24;
static constexpr size_t LW_CRASH_TASK_BYTES = 16;
static constexpr size_t LW_CRASH_FAULT_BYTES = 32;
static constexpr size_t LW_CRASH_VERSION_BYTES = 16;

// esp_reset_reason_t values, kept numeric so the host test needs no SDK.
static constexpr uint8_t LW_RESET_PANIC = 4;
static constexpr uint8_t LW_RESET_INT_WATCHDOG = 5;
static constexpr uint8_t LW_RESET_TASK_WATCHDOG = 6;
static constexpr uint8_t LW_RESET_OTHER_WATCHDOG = 7;
static constexpr uint8_t LW_RESET_BROWNOUT = 9;

inline bool lwCrashReasonAbnormal(uint8_t resetReason) {
  return resetReason == LW_RESET_PANIC || resetReason == LW_RESET_INT_WATCHDOG ||
      resetReason == LW_RESET_TASK_WATCHDOG || resetReason == LW_RESET_OTHER_WATCHDOG ||
      resetReason == LW_RESET_BROWNOUT;
}

inline const char* lwCrashReasonName(uint8_t resetReason) {
  switch (resetReason) {
    case LW_RESET_PANIC: return "panic";
    case LW_RESET_INT_WATCHDOG: return "interrupt-watchdog";
    case LW_RESET_TASK_WATCHDOG: return "task-watchdog";
    case LW_RESET_OTHER_WATCHDOG: return "watchdog";
    case LW_RESET_BROWNOUT: return "brownout";
    default: return "none";
  }
}

// Copies text into a fixed field as plain printable ASCII. Quotes, backslashes
// and control bytes become '_', so a field can go into JSON unescaped and a
// stray byte from a damaged breadcrumb cannot break a report.
inline void lwCrashSetText(char* destination, size_t capacity, const char* source) {
  if (destination == nullptr || capacity == 0) return;
  size_t index = 0;
  if (source != nullptr) {
    for (; index + 1 < capacity && source[index] != 0; index++) {
      const char value = source[index];
      destination[index] = (value < 0x20 || value > 0x7e || value == '"' || value == '\\')
          ? '_' : value;
    }
  }
  for (; index < capacity; index++) destination[index] = 0;
}

// Kept current by the running card. Plain fields only: it is read after a
// reset, when no constructor has run.
struct LwCrashBreadcrumb {
  uint32_t magic;
  uint32_t bootCount;
  uint32_t uptimeMs;
  uint32_t freeHeap;
  uint32_t minFreeHeap;
  uint32_t activityAtMs;
  uint8_t saveInProgress;
  uint8_t reserved[3];
  char activity[LW_CRASH_ACTIVITY_BYTES];
  char pattern[LW_CRASH_PATTERN_BYTES];
  // Written only by the panic hook.
  uint32_t hookMagic;
  uint32_t programCounter;
  uint32_t backtrace[LW_CRASH_BACKTRACE_MAX];
  uint8_t backtraceDepth;
  uint8_t core;
  uint8_t hookReserved[2];
  char task[LW_CRASH_TASK_BYTES];
  char fault[LW_CRASH_FAULT_BYTES];
};

inline void lwCrashBreadcrumbStart(LwCrashBreadcrumb& crumb, uint32_t bootCount) {
  memset(&crumb, 0, sizeof(crumb));
  crumb.magic = LW_CRASH_CRUMB_MAGIC;
  crumb.bootCount = bootCount;
}

struct LwCrashRecord {
  uint32_t bootCount;        // which start-up crashed (counts every start)
  uint32_t uptimeMs;         // how long that start-up had been running
  uint32_t freeHeap;
  uint32_t minFreeHeap;
  uint32_t activityAgeMs;    // how long before the crash the last request came
  uint32_t programCounter;
  uint32_t buildNumber;
  uint32_t backtrace[LW_CRASH_BACKTRACE_MAX];
  uint8_t resetReason;
  uint8_t backtraceDepth;
  uint8_t core;
  uint8_t saveInProgress;
  uint8_t breadcrumb;        // 1 when the running-state fields are real
  uint8_t hook;              // 1 when task, address and trace are real
  uint8_t reserved[2];
  char activity[LW_CRASH_ACTIVITY_BYTES];
  char pattern[LW_CRASH_PATTERN_BYTES];
  char task[LW_CRASH_TASK_BYTES];
  char fault[LW_CRASH_FAULT_BYTES];
  char firmwareVersion[LW_CRASH_VERSION_BYTES];
};

// Builds the record for the start-up that just ended abnormally. A breadcrumb
// that does not carry the magic (power was lost, or first start on this
// firmware) still gives a record: the reset reason alone is worth keeping.
inline LwCrashRecord lwCrashRecordFromBreadcrumb(const LwCrashBreadcrumb& crumb,
                                                 uint8_t resetReason,
                                                 uint32_t fallbackBootCount,
                                                 uint32_t buildNumber,
                                                 const char* firmwareVersion) {
  LwCrashRecord record;
  memset(&record, 0, sizeof(record));
  record.resetReason = resetReason;
  record.bootCount = fallbackBootCount;
  record.buildNumber = buildNumber;
  lwCrashSetText(record.firmwareVersion, sizeof(record.firmwareVersion), firmwareVersion);
  if (crumb.magic != LW_CRASH_CRUMB_MAGIC) return record;
  record.breadcrumb = 1;
  record.bootCount = crumb.bootCount;
  record.uptimeMs = crumb.uptimeMs;
  record.freeHeap = crumb.freeHeap;
  record.minFreeHeap = crumb.minFreeHeap;
  record.activityAgeMs = crumb.uptimeMs >= crumb.activityAtMs
      ? crumb.uptimeMs - crumb.activityAtMs : 0;
  record.saveInProgress = crumb.saveInProgress ? 1 : 0;
  char bounded[LW_CRASH_ACTIVITY_BYTES];
  memcpy(bounded, crumb.activity, sizeof(bounded));
  bounded[sizeof(bounded) - 1] = 0;
  lwCrashSetText(record.activity, sizeof(record.activity), bounded);
  char boundedPattern[LW_CRASH_PATTERN_BYTES];
  memcpy(boundedPattern, crumb.pattern, sizeof(boundedPattern));
  boundedPattern[sizeof(boundedPattern) - 1] = 0;
  lwCrashSetText(record.pattern, sizeof(record.pattern), boundedPattern);
  if (crumb.hookMagic != LW_CRASH_HOOK_MAGIC) return record;
  record.hook = 1;
  record.programCounter = crumb.programCounter;
  record.core = crumb.core;
  record.backtraceDepth = crumb.backtraceDepth > LW_CRASH_BACKTRACE_MAX
      ? LW_CRASH_BACKTRACE_MAX : crumb.backtraceDepth;
  for (uint8_t index = 0; index < record.backtraceDepth; index++)
    record.backtrace[index] = crumb.backtrace[index];
  char boundedTask[LW_CRASH_TASK_BYTES];
  memcpy(boundedTask, crumb.task, sizeof(boundedTask));
  boundedTask[sizeof(boundedTask) - 1] = 0;
  lwCrashSetText(record.task, sizeof(record.task), boundedTask);
  char boundedFault[LW_CRASH_FAULT_BYTES];
  memcpy(boundedFault, crumb.fault, sizeof(boundedFault));
  boundedFault[sizeof(boundedFault) - 1] = 0;
  lwCrashSetText(record.fault, sizeof(record.fault), boundedFault);
  return record;
}

// The last three records, newest first, plus how many there have ever been.
struct LwCrashRing {
  uint32_t total;
  uint8_t count;
  uint8_t reserved[3];
  LwCrashRecord records[LW_CRASH_RING_SIZE];
};

inline void lwCrashRingClear(LwCrashRing& ring) { memset(&ring, 0, sizeof(ring)); }

inline void lwCrashRingPush(LwCrashRing& ring, const LwCrashRecord& record) {
  if (ring.count > LW_CRASH_RING_SIZE) ring.count = LW_CRASH_RING_SIZE;
  for (uint8_t index = LW_CRASH_RING_SIZE - 1; index > 0; index--)
    ring.records[index] = ring.records[index - 1];
  ring.records[0] = record;
  if (ring.count < LW_CRASH_RING_SIZE) ring.count++;
  if (ring.total != UINT32_MAX) ring.total++;
}

// ---- Stored form (one NVS blob) --------------------------------------------

inline uint32_t lwCrashCrc32(const uint8_t* bytes, size_t length) {
  uint32_t crc = 0xFFFFFFFFu;
  for (size_t index = 0; index < length; index++) {
    crc ^= bytes[index];
    for (uint8_t bit = 0; bit < 8; bit++)
      crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
  }
  return ~crc;
}

struct LwCrashBlobHeader {
  uint32_t magic;
  uint16_t version;
  uint16_t ringBytes;
  uint32_t crc32;
};

static constexpr size_t LW_CRASH_BLOB_BYTES = sizeof(LwCrashBlobHeader) + sizeof(LwCrashRing);

inline size_t lwCrashRingEncode(const LwCrashRing& ring, uint8_t* out, size_t capacity) {
  if (out == nullptr || capacity < LW_CRASH_BLOB_BYTES) return 0;
  LwCrashBlobHeader header;
  header.magic = LW_CRASH_BLOB_MAGIC;
  header.version = LW_CRASH_BLOB_VERSION;
  header.ringBytes = static_cast<uint16_t>(sizeof(LwCrashRing));
  memcpy(out + sizeof(header), &ring, sizeof(ring));
  header.crc32 = lwCrashCrc32(out + sizeof(header), sizeof(ring));
  memcpy(out, &header, sizeof(header));
  return LW_CRASH_BLOB_BYTES;
}

// A missing, short, damaged or other-version blob reads as "no records": the
// recorder must never stop a card from starting.
inline bool lwCrashRingDecode(const uint8_t* bytes, size_t length, LwCrashRing& ring) {
  lwCrashRingClear(ring);
  if (bytes == nullptr || length != LW_CRASH_BLOB_BYTES) return false;
  LwCrashBlobHeader header;
  memcpy(&header, bytes, sizeof(header));
  if (header.magic != LW_CRASH_BLOB_MAGIC || header.version != LW_CRASH_BLOB_VERSION ||
      header.ringBytes != sizeof(LwCrashRing) ||
      header.crc32 != lwCrashCrc32(bytes + sizeof(header), sizeof(LwCrashRing))) return false;
  memcpy(&ring, bytes + sizeof(header), sizeof(ring));
  if (ring.count > LW_CRASH_RING_SIZE) { lwCrashRingClear(ring); return false; }
  return true;
}

// ---- Reports ----------------------------------------------------------------

// The short form carried on /api/status and /api/firmware-info.
struct LwCrashSummary {
  uint32_t total;
  uint8_t kept;
  uint8_t lastReason;
  uint32_t lastBootCount;
  uint32_t lastUptimeMs;
  uint32_t bootsSince;  // starts since the last crash; 0 = this start followed it
};

inline LwCrashSummary lwCrashSummarize(const LwCrashRing& ring, uint32_t currentBootCount) {
  LwCrashSummary summary;
  memset(&summary, 0, sizeof(summary));
  summary.total = ring.total;
  summary.kept = ring.count > LW_CRASH_RING_SIZE ? LW_CRASH_RING_SIZE : ring.count;
  if (summary.kept == 0) return summary;
  const LwCrashRecord& last = ring.records[0];
  summary.lastReason = last.resetReason;
  summary.lastBootCount = last.bootCount;
  summary.lastUptimeMs = last.uptimeMs;
  // The crashed start-up is `last.bootCount`; the one that followed is +1.
  summary.bootsSince = currentBootCount > last.bootCount + 1u
      ? currentBootCount - last.bootCount - 1u : 0;
  return summary;
}

struct LwCrashText {
  char* out;
  size_t capacity;
  size_t length;
  bool overflow;
};

inline void lwCrashAppend(LwCrashText& text, const char* piece) {
  if (text.overflow || piece == nullptr) return;
  const size_t add = strlen(piece);
  if (text.length + add + 1 > text.capacity) { text.overflow = true; return; }
  memcpy(text.out + text.length, piece, add);
  text.length += add;
  text.out[text.length] = 0;
}

inline void lwCrashAppendNumber(LwCrashText& text, const char* key, uint32_t value, bool comma = true) {
  char piece[48];
  snprintf(piece, sizeof(piece), "\"%s\":%lu%s", key, static_cast<unsigned long>(value), comma ? "," : "");
  lwCrashAppend(text, piece);
}

inline void lwCrashAppendText(LwCrashText& text, const char* key, const char* value, size_t valueCapacity) {
  // Stored text is already sanitised; sanitise again so a report can never be
  // broken by bytes that reached NVS some other way.
  char clean[LW_CRASH_ACTIVITY_BYTES];
  char bounded[LW_CRASH_ACTIVITY_BYTES];
  memset(bounded, 0, sizeof(bounded));
  // Stops at the first NUL, so a short string literal is never over-read.
  for (size_t index = 0; value != nullptr && index < valueCapacity &&
       index + 1 < sizeof(bounded) && value[index] != 0; index++) bounded[index] = value[index];
  lwCrashSetText(clean, sizeof(clean), bounded);
  lwCrashAppend(text, "\"");
  lwCrashAppend(text, key);
  lwCrashAppend(text, "\":\"");
  lwCrashAppend(text, clean);
  lwCrashAppend(text, "\",");
}

inline void lwCrashAppendAddress(LwCrashText& text, uint32_t address) {
  char piece[16];
  snprintf(piece, sizeof(piece), "\"0x%08lx\"", static_cast<unsigned long>(address));
  lwCrashAppend(text, piece);
}

// ---- Crash loop: the one case that still starts in warm white ------------
//
// After an abnormal reset the card comes back to its saved look (Adrian,
// 2026-11-25): one crash in hours of running should not leave a gallery piece
// white until someone restarts it. Only a crash LOOP keeps the low, visible
// warm-white fallback: the start-up that just crashed had itself begun right
// after a crash, and crashed again within LW_CRASH_LOOP_WINDOW_MS. Records are
// newest first, and `bootCount` names which start-up crashed.
static constexpr uint32_t LW_CRASH_LOOP_WINDOW_MS = 60000;

inline bool lwCrashLoopDetected(const LwCrashRing& ring, uint32_t currentBootCount) {
  const uint8_t kept = ring.count > LW_CRASH_RING_SIZE ? LW_CRASH_RING_SIZE : ring.count;
  if (kept < 2) return false;
  const LwCrashRecord& last = ring.records[0];
  const LwCrashRecord& before = ring.records[1];
  if (last.bootCount + 1 != currentBootCount) return false;  // not the start that just ended
  if (last.uptimeMs >= LW_CRASH_LOOP_WINDOW_MS) return false;
  return before.bootCount + 1 == last.bootCount;
}

// ---- "lastCrash" on /api/status -------------------------------------------
//
// The shape Studio's reader (lightweaver/src/lib/cardCrashReport.js, contract
// in todo/plans/crash-recorder.md) already expects: null for a card that has
// never crashed, otherwise the newest record. `sequence` counts every crash
// this card has recorded. Addresses are hex strings because JSON numbers may
// be rounded.

inline const char* lwCrashStudioReason(uint8_t resetReason) {
  switch (resetReason) {
    case LW_RESET_PANIC: return "panic";
    case LW_RESET_INT_WATCHDOG: return "interruptWatchdog";
    case LW_RESET_TASK_WATCHDOG: return "taskWatchdog";
    case LW_RESET_OTHER_WATCHDOG: return "watchdog";
    case LW_RESET_BROWNOUT: return "brownout";
    default: return "unknown";
  }
}

inline bool lwCrashPathStarts(const char* path, const char* prefix) {
  return strncmp(path, prefix, strlen(prefix)) == 0;
}

// One word for what the card was doing, worked out from what the breadcrumb
// holds. A request counts only if it came in the two seconds before the reset;
// otherwise the card was on its own, which the reader calls "idle".
static constexpr uint32_t LW_CRASH_RECENT_REQUEST_MS = 2000;

inline const char* lwCrashPhase(const LwCrashRecord& record) {
  if (!record.breadcrumb) return "unknown";
  if (record.saveInProgress) return "configSave";
  if (record.activity[0] == 0 || record.activityAgeMs > LW_CRASH_RECENT_REQUEST_MS) return "idle";
  if (lwCrashPathStarts(record.activity, "/api/config") ||
      lwCrashPathStarts(record.activity, "/api/wiring")) return "configSave";
  if (lwCrashPathStarts(record.activity, "/api/update")) return "update";
  if (lwCrashPathStarts(record.activity, "/api/wifi") ||
      lwCrashPathStarts(record.activity, "/api/reset-wifi")) return "wifi";
  if (lwCrashPathStarts(record.activity, "/api/projects") ||
      lwCrashPathStarts(record.activity, "/api/media")) return "storage";
  return "http";
}

static constexpr size_t LW_CRASH_LAST_BYTES = 640;

// Returns the length written, or 0 if `capacity` is too small.
inline size_t lwCrashLastCrashJson(const LwCrashRing& ring, char* out, size_t capacity) {
  if (out == nullptr || capacity == 0) return 0;
  LwCrashText text{out, capacity, 0, false};
  out[0] = 0;
  if (ring.count == 0 || ring.total == 0) {
    lwCrashAppend(text, "null");
    if (text.overflow) { out[0] = 0; return 0; }
    return text.length;
  }
  const LwCrashRecord& record = ring.records[0];
  lwCrashAppend(text, "{");
  lwCrashAppendNumber(text, "sequence", ring.total);
  lwCrashAppendNumber(text, "resetReason", record.resetReason);
  lwCrashAppendText(text, "reason", lwCrashStudioReason(record.resetReason), LW_CRASH_ACTIVITY_BYTES);
  lwCrashAppendText(text, "phase", lwCrashPhase(record), LW_CRASH_ACTIVITY_BYTES);
  lwCrashAppendText(text, "task", record.task, sizeof(record.task));
  lwCrashAppendNumber(text, "uptimeMs", record.uptimeMs);
  lwCrashAppendNumber(text, "freeHeap", record.freeHeap);
  lwCrashAppendNumber(text, "minFreeHeap", record.minFreeHeap);
  lwCrashAppend(text, "\"pc\":");
  lwCrashAppendAddress(text, record.hook ? record.programCounter : 0);
  lwCrashAppend(text, ",\"backtrace\":[");
  const uint8_t depth = !record.hook ? 0 : record.backtraceDepth > LW_CRASH_BACKTRACE_MAX
      ? LW_CRASH_BACKTRACE_MAX : record.backtraceDepth;
  for (uint8_t frame = 0; frame < depth; frame++) {
    if (frame) lwCrashAppend(text, ",");
    lwCrashAppendAddress(text, record.backtrace[frame]);
  }
  lwCrashAppend(text, "]}");
  if (text.overflow) { out[0] = 0; return 0; }
  return text.length;
}

// Sized from the worst case, which tests/crash-record.cpp builds and measures:
// three records, each with 16 frames and every text field full.
static constexpr size_t LW_CRASH_REPORT_BYTES = 4096;

// The full report, as JSON text, served by the read-only /api/crash-log.
// Returns the length written, or 0 if `capacity` is too small (nothing partial
// is ever returned).
inline size_t lwCrashFullReport(const LwCrashRing& ring, uint32_t currentBootCount,
                                bool coreDumpPresent, uint32_t coreDumpBytes,
                                char* out, size_t capacity) {
  if (out == nullptr || capacity == 0) return 0;
  LwCrashText text{out, capacity, 0, false};
  out[0] = 0;
  const LwCrashSummary summary = lwCrashSummarize(ring, currentBootCount);
  lwCrashAppend(text, "{\"ok\":true,");
  lwCrashAppendNumber(text, "bootCount", currentBootCount);
  lwCrashAppendNumber(text, "total", summary.total);
  lwCrashAppendNumber(text, "kept", summary.kept);
  lwCrashAppend(text, "\"coreDump\":{\"present\":");
  lwCrashAppend(text, coreDumpPresent ? "true," : "false,");
  lwCrashAppendNumber(text, "bytes", coreDumpBytes, false);
  lwCrashAppend(text, "},\"records\":[");
  for (uint8_t index = 0; index < summary.kept; index++) {
    const LwCrashRecord& record = ring.records[index];
    lwCrashAppend(text, index ? ",{" : "{");
    lwCrashAppendNumber(text, "resetReason", record.resetReason);
    lwCrashAppendText(text, "reason", lwCrashReasonName(record.resetReason), LW_CRASH_ACTIVITY_BYTES);
    lwCrashAppendNumber(text, "bootCount", record.bootCount);
    lwCrashAppendNumber(text, "uptimeMs", record.uptimeMs);
    lwCrashAppendText(text, "firmwareVersion", record.firmwareVersion, sizeof(record.firmwareVersion));
    lwCrashAppendNumber(text, "buildNumber", record.buildNumber);
    lwCrashAppend(text, record.breadcrumb ? "\"runningState\":true," : "\"runningState\":false,");
    if (record.breadcrumb) {
      lwCrashAppendNumber(text, "freeHeap", record.freeHeap);
      lwCrashAppendNumber(text, "minFreeHeap", record.minFreeHeap);
      lwCrashAppendText(text, "lastRequest", record.activity, sizeof(record.activity));
      lwCrashAppendNumber(text, "lastRequestAgeMs", record.activityAgeMs);
      lwCrashAppend(text, record.saveInProgress ? "\"saveInProgress\":true," : "\"saveInProgress\":false,");
      lwCrashAppendText(text, "pattern", record.pattern, sizeof(record.pattern));
    }
    lwCrashAppend(text, record.hook ? "\"trace\":true" : "\"trace\":false");
    if (record.hook) {
      lwCrashAppend(text, ",");
      lwCrashAppendText(text, "task", record.task, sizeof(record.task));
      lwCrashAppendText(text, "fault", record.fault, sizeof(record.fault));
      lwCrashAppendNumber(text, "core", record.core);
      lwCrashAppend(text, "\"programCounter\":");
      lwCrashAppendAddress(text, record.programCounter);
      lwCrashAppend(text, ",\"backtrace\":[");
      const uint8_t depth = record.backtraceDepth > LW_CRASH_BACKTRACE_MAX
          ? LW_CRASH_BACKTRACE_MAX : record.backtraceDepth;
      for (uint8_t frame = 0; frame < depth; frame++) {
        if (frame) lwCrashAppend(text, ",");
        lwCrashAppendAddress(text, record.backtrace[frame]);
      }
      lwCrashAppend(text, "]");
    }
    lwCrashAppend(text, "}");
  }
  lwCrashAppend(text, "]}");
  if (text.overflow) { out[0] = 0; return 0; }
  return text.length;
}
