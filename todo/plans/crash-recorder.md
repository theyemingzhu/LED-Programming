# Crash recorder: a crash that explains itself

> **Superseded 2026-11-24.** The recorder that ships is PR #522 (branch `claude/crash-recorder`, released in 1.2.7). It reports a `crash` object and `GET /api/crash-log`, not the `lastCrash` field below, and the `crash-recorder-codec` patch and Studio parser described here were dropped. Its design and bench steps are in the shared note `crash-recorder.md`. This page is kept for the problem statement and the reasoning.

## What is wrong today

The real card has restarted by itself twice in two days, and neither time left a cause.

| When | Build | resetReason | What was happening | What survived |
|---|---|---|---|---|
| 2026-11-23 | 1.2.6 candidate | 4, panic | right after a six-look /api/config save | nothing but the number |
| 2026-11-24 | signed 1.2.5 | 6, task watchdog | idle, 7.57 h after boot, no control events | nothing but the number |

`/api/status` and `/api/firmware-info` report `resetReason` (LightweaverStorage.cpp, main.cpp), so Studio can see that the card crashed. They cannot say why, because the reason is the only thing the reset leaves behind. Twenty faithful repeats of the first crash on 1.2.5 and 1.2.6 did not reproduce it, so waiting for it to happen on a bench with a serial cable open is not a plan.

The second crash matters more: a watchdog reset gives the firmware no chance to run any code, so no handler can write anything at that moment. Whatever we learn about it has to have been written before it happened.

## The design: two records, one codec

**Breadcrumb (RTC memory).** The running firmware refreshes one small struct in `RTC_NOINIT` memory every few seconds: uptime, free heap, minimum free heap, the name of the running task, and a `phase` marker set around the risky operations (render, config save, Wi-Fi, storage, update, HTTP). RTC memory survives a panic, a watchdog reset and `ESP.restart()`, costs no flash wear, and is lost only on a power cut. `LightweaverFirmwareBootHealth.cpp` already keeps its handoff record the same way (`RTC_NOINIT_ATTR g_bootHandoff`, FNV checksum), so the pattern and its failure modes are known. This is the only witness a watchdog reset can have.

**Crash record (NVS).** At boot, `esp_reset_reason()` decides. If it is panic, interrupt watchdog, task watchdog, other watchdog or brownout, the breadcrumb is promoted to a `CrashRecord`, written to NVS once, and the RTC breadcrumb is cleared so one crash is never counted twice. Power-on, external, software restart and deep sleep are not crashes and write nothing. The record keeps a sequence number (1 for the first crash ever, then counting up), the reset reason, the phase, the task, uptime, free and minimum free heap, and, when available, a program counter and up to 16 backtrace addresses. A breadcrumb that is unreadable (power cut during the crash) still records the crash and its reason; only the detail is empty. One crash, one flash write: far below the project store's wear budget.

**Reporting.** `/api/status` gains `lastCrash`: `null` when the card has never crashed, otherwise an object. Addresses are hex strings, because they are 32-bit and JSON numbers must not be rounded.

```json
"lastCrash": {
  "sequence": 2, "resetReason": 6, "reason": "taskWatchdog", "phase": "configSave",
  "task": "loopTask", "uptimeMs": 27252000, "freeHeap": 91234, "minFreeHeap": 40960,
  "pc": "0x420a1b2c", "backtrace": ["0x420a1b2c", "0x4037f001"]
}
```

Cards without the recorder omit the field. Studio treats a missing field and `null` the same ("nothing to show"), and a malformed field as unreadable, never guessed. The record stays until the next crash replaces it; there is no "clear" button in v1.

## Getting a backtrace: the part that needs a bench card

A software panic can be explained by a program counter and backtrace; a task watchdog usually cannot, because nothing crashed, a task just stopped yielding. So the breadcrumb's phase and task name carry the watchdog case, and the backtrace is for panics. There are two ways to fill `pc` and `backtrace`, in order of preference:

1. **ESP-IDF core dump to flash.** The 16 MB partition table (`default_16MB.csv`) is expected to have a `coredump` partition. At boot, `esp_core_dump_image_check()` then `esp_core_dump_get_summary()` return the exception PC and backtrace of the last panic, which are copied into the record. **Unverified:** whether the prebuilt Arduino-ESP32 libraries were compiled with `CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH`. If they were not, this path is closed without a custom framework build.
2. **A panic hook that writes into the breadcrumb.** If core dump is closed, hook the panic path to store the faulting PC and a short frame walk in RTC memory before the reset. This is more fragile (it runs in a crashed system) and is the fallback, not the plan.

The first job on the bench card is one question: does `esp_core_dump_image_check()` exist and succeed after a deliberate `abort()`? Everything else in this design works without the answer; only `pc` and `backtrace` depend on it.

Task watchdog resets (reason 6) never produce a backtrace this way unless `CONFIG_ESP_TASK_WDT_PANIC` is on, which would turn them into reason 4 and make them restart through the panic path. Decide that at the bench: a panic with a backtrace is more useful than a quiet watchdog reset, but it changes what the card does on a stall, so it is Adrian's call, not an implementation detail.

## What is built now (host only, no card)

Parked in `firmware-queue/queue.json` as `crash-recorder-codec`, a patch because it touches firmware sources and so would otherwise force a signed release by itself:

- `firmware/lightweaver-controller/src/LightweaverCrashRecord.h`: the breadcrumb and record structs, checksum seal and validation, `resetReasonIsCrash`, `promoteBreadcrumb`, and `crashRecordToJson` for the `/api/status` value. No Arduino or ESP-IDF includes, so it compiles on the host.
- `firmware/lightweaver-controller/tests/crash-record.cpp` and `.mjs`: record encode/decode and tamper detection, which resets count as crashes, persistence across a simulated restart (RTC and NVS as byte buffers, the restart as a copy), the 7.57 h watchdog case, a second crash counting up, a crash with a lost breadcrumb, a damaged stored record, a clean boot over garbage RTC, and the JSON shape including a full backtrace and a too-small buffer. The `.mjs` then reads the JSON the C++ prints with Studio's parser. Added to `test:core` in the same patch.

In this pull request, because Studio code is not firmware-sensitive: `lightweaver/src/lib/cardCrashReport.js` (the read-back parser and a plain-language line) with its unit test, picked up by `test:unit`. Nothing in Studio shows it yet; that is the last step below.

## What is not built

1. **Wire it in** (needs a bench card): the breadcrumb refresh in the main loop, phase markers around config save and render, the boot-time promotion and NVS write, the `lastCrash` field in `/api/status` (main.cpp, next to `resetReason`), and `capabilities.crashRecorder = 1` so Studio can tell a card with no crashes from a card without the recorder.
2. **Bench check** (needs the real card): the core-dump question above; one deliberate `abort()` and one deliberate stall to see a panic record and a watchdog record arrive on `/api/status` and survive a power cycle.
3. **Studio line**: show `describeCardCrash` in the Card Home health fold, only when a crash is recorded, and include the record in the support code. Not a status banner: a crash is a diagnosis for support, not a thing the owner must act on.
4. **Decision for Adrian**: whether a task watchdog stall should panic (backtrace, restart) or reset quietly as today.

## Not doing

- A crash log of many entries. One record plus a counter answers "what happened last, and how often"; a ring buffer is a bigger NVS footprint for a question nobody has asked.
- Uploading crash records anywhere. They are read from the card by the owner's Studio, nothing leaves the LAN.
- Writing to flash from inside a panic handler. Flash writes in a crashed system are exactly what corrupts the evidence.
