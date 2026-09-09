#pragma once

#include <ArduinoJson.h>
#include <cstddef>
#include <cstdint>
#include <cstring>

// ---------------------------------------------------------------------------
// Live-look resume record
// ---------------------------------------------------------------------------
// POST /api/control mutates the live in-memory zone state only (see
// applyToZones() in main.cpp) — it never touches the installed project JSON,
// because that JSON's fingerprint is how Studio verifies what is on the card.
// That means every brightness/hue/pattern tweak an owner makes from the
// phone was, until this record existed, lost at the next power-cycle: boot
// always resumed startupLookId with the project's stock zone defaults.
//
// This record captures just the live per-zone modifiers (+ syncZones and the
// currently selected look id) into their OWN small NVS key, separate from
// the project JSON, so it can never eat into that JSON's fingerprinted bytes
// or its 3968-byte budget (LW_WEB_CONFIG_MAX_BODY_BYTES). It is written
// debounced (see runtimeServiceLiveLookPersist() in main.cpp), and restored
// on boot only when it demonstrably belongs to the project that just loaded
// (exact project id + revision match — see liveLookRecordMatchesProject()).
// A mismatch (different project installed, or no record at all) is silently
// ignored: the installed project's own defaults stand.
//
// Deliberately Arduino/Preferences/SD-free (ArduinoJson + cstdint/cstring
// only), the same way LightweaverRecipe's NativeRecipe stays host-testable —
// see test/test_live_look for its native unit tests, run with:
//   pio test -d firmware/lightweaver-controller \
//     -c firmware/lightweaver-controller/test/platformio-live-look-test.ini \
//     -e native_live_look
// (a separate project-conf file rather than an edit to the real
// platformio.ini — see that file for why.)

// Mirrors LW_MAX_ZONES (LightweaverTypes.h) — kept as an independent literal
// here so this model never needs to include LightweaverTypes.h (which pulls
// in Arduino.h/FastLED.h/SD.h and is not host-testable). main.cpp static_asserts
// the two stay equal.
constexpr uint8_t LW_LIVE_LOOK_MAX_ZONES = 12;

// Holds slug-style zone/pattern/project ids (15 usable chars + NUL). Every
// real id in this codebase is well under that — the longest compiled pattern
// id is "custom-color" (12) and zone ids are short installer-chosen slugs
// ("outer-ring", "inner-disc"). An id longer than this is truncated on
// capture (copyBounded) rather than corrupting storage or overflowing a
// fixed buffer; a truncated id simply fails to match on restore (silently —
// the installed look's own defaults stand, same as any other mismatch).
// Sized this tight because 24 id fields (12 zones x 2 ids each) plus the
// project/look ids all add up fast against NVS's own ~4000-byte single-string
// ceiling — see the worst-case measurement on LW_LIVE_LOOK_RECORD_MAX_BYTES.
constexpr size_t LW_LIVE_LOOK_ID_BYTES = 16;

// Hard ceiling for the encoded record, enforced by encodeLiveLookRecord()
// returning 0 (a hard failure, never a silent truncation) past this size.
// Measured worst case — LW_LIVE_LOOK_MAX_ZONES (12) zones, every id field
// filled to LW_LIVE_LOOK_ID_BYTES-1 (15) characters — is 3697 bytes (see
// test_live_look's "worst-case record fits the documented byte budget",
// which asserts the real measurement, not this literal). Set to the SAME
// value as NVS_STRING_LIMIT in LightweaverStorage.cpp — not because this
// record shares that key or budget (it never does; it is its own NVS key,
// entirely separate from the project JSON), but because 3968 is this
// codebase's already-proven safe margin under NVS's own ~4000-byte
// single-string entry ceiling, and reusing it means this bound and that one
// can never silently drift apart.
constexpr size_t LW_LIVE_LOOK_RECORD_MAX_BYTES = 3968;

struct LiveLookZoneRecord {
  char zoneId[LW_LIVE_LOOK_ID_BYTES] = {};
  char patternId[LW_LIVE_LOOK_ID_BYTES] = {};
  float brightness = 1.0f;
  float speed = 1.0f;
  int16_t hueShift = 0;
  uint8_t customHue = 32;
  uint8_t customSaturation = 230;
  bool customBreathe = false;
  uint8_t breatheLowerPct = 85;
  uint8_t breatheUpperPct = 100;
  uint8_t breatheCycleSeconds = 9;
  bool customDrift = false;
  uint8_t driftHueMin = 0;
  uint8_t driftHueMax = 255;
  bool blackout = false;
};

struct LiveLookRecord {
  char projectId[LW_LIVE_LOOK_ID_BYTES] = {};
  uint32_t projectRevision = 0;
  char currentLookId[LW_LIVE_LOOK_ID_BYTES] = {};
  bool syncZones = true;
  uint8_t zoneCount = 0;
  LiveLookZoneRecord zones[LW_LIVE_LOOK_MAX_ZONES];
};

namespace lightweaver_live_look_detail {
inline void copyBounded(char* dest, size_t destSize, const char* source) {
  if (!dest || destSize == 0) return;
  if (!source) {
    dest[0] = '\0';
    return;
  }
  size_t n = strlen(source);
  if (n >= destSize) n = destSize - 1;
  memcpy(dest, source, n);
  dest[n] = '\0';
}
}  // namespace lightweaver_live_look_detail

// Encodes `record` as JSON into `outBuffer`. Returns the number of bytes
// written (excluding the NUL terminator serializeJson() always adds within
// bounds), or 0 on any failure — buffer too small, or nothing to encode.
// ArduinoJson's serializeJson(..., buffer, size) returns the length it WOULD
// have written even when the buffer is too small, with no guaranteed NUL in
// that case, so a would-be-truncated write is treated as a hard failure
// rather than ever being persisted partially.
inline size_t encodeLiveLookRecord(const LiveLookRecord& record, char* outBuffer, size_t outBufferSize) {
  if (!outBuffer || outBufferSize == 0) return 0;
  JsonDocument doc;
  doc["projectId"] = record.projectId;
  doc["projectRevision"] = record.projectRevision;
  doc["currentLookId"] = record.currentLookId;
  doc["syncZones"] = record.syncZones;
  JsonArray zones = doc["zones"].to<JsonArray>();
  uint8_t count = record.zoneCount < LW_LIVE_LOOK_MAX_ZONES ? record.zoneCount : LW_LIVE_LOOK_MAX_ZONES;
  for (uint8_t i = 0; i < count; i++) {
    const LiveLookZoneRecord& z = record.zones[i];
    JsonObject zo = zones.add<JsonObject>();
    zo["id"] = z.zoneId;
    zo["patternId"] = z.patternId;
    zo["brightness"] = z.brightness;
    zo["speed"] = z.speed;
    zo["hueShift"] = z.hueShift;
    zo["customHue"] = z.customHue;
    zo["customSaturation"] = z.customSaturation;
    zo["customBreathe"] = z.customBreathe;
    zo["breatheLowerPct"] = z.breatheLowerPct;
    zo["breatheUpperPct"] = z.breatheUpperPct;
    zo["breatheCycleSeconds"] = z.breatheCycleSeconds;
    zo["customDrift"] = z.customDrift;
    zo["driftHueMin"] = z.driftHueMin;
    zo["driftHueMax"] = z.driftHueMax;
    zo["blackout"] = z.blackout;
  }
  size_t written = serializeJson(doc, outBuffer, outBufferSize);
  if (written == 0 || written >= outBufferSize) return 0;
  return written;
}

// Decodes a JSON-encoded record. Returns false (and leaves outRecord
// untouched) on malformed JSON or a missing/non-array "zones" field. A zone
// entry with no id is dropped — it could never be matched back to a live
// zone on restore.
inline bool decodeLiveLookRecord(const char* json, size_t jsonLength, LiveLookRecord& outRecord) {
  if (!json || jsonLength == 0) return false;
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, json, jsonLength);
  if (error) return false;
  JsonArrayConst zones = doc["zones"].as<JsonArrayConst>();
  if (zones.isNull()) return false;
  LiveLookRecord parsed;
  lightweaver_live_look_detail::copyBounded(parsed.projectId, LW_LIVE_LOOK_ID_BYTES, doc["projectId"] | "");
  parsed.projectRevision = doc["projectRevision"] | 0U;
  lightweaver_live_look_detail::copyBounded(parsed.currentLookId, LW_LIVE_LOOK_ID_BYTES, doc["currentLookId"] | "");
  parsed.syncZones = doc["syncZones"] | true;
  for (JsonVariantConst zoneValue : zones) {
    if (parsed.zoneCount >= LW_LIVE_LOOK_MAX_ZONES) break;
    JsonObjectConst zo = zoneValue.as<JsonObjectConst>();
    LiveLookZoneRecord z;
    lightweaver_live_look_detail::copyBounded(z.zoneId, LW_LIVE_LOOK_ID_BYTES, zo["id"] | "");
    if (z.zoneId[0] == '\0') continue;
    lightweaver_live_look_detail::copyBounded(z.patternId, LW_LIVE_LOOK_ID_BYTES, zo["patternId"] | "");
    z.brightness = zo["brightness"] | 1.0f;
    z.speed = zo["speed"] | 1.0f;
    z.hueShift = zo["hueShift"] | 0;
    z.customHue = zo["customHue"] | 32;
    z.customSaturation = zo["customSaturation"] | 230;
    z.customBreathe = zo["customBreathe"] | false;
    z.breatheLowerPct = zo["breatheLowerPct"] | 85;
    z.breatheUpperPct = zo["breatheUpperPct"] | 100;
    z.breatheCycleSeconds = zo["breatheCycleSeconds"] | 9;
    z.customDrift = zo["customDrift"] | false;
    z.driftHueMin = zo["driftHueMin"] | 0;
    z.driftHueMax = zo["driftHueMax"] | 255;
    z.blackout = zo["blackout"] | false;
    parsed.zones[parsed.zoneCount] = z;
    parsed.zoneCount++;
  }
  outRecord = parsed;
  return true;
}

inline bool liveLookRecordFitsBudget(size_t encodedBytes, size_t maxBytes = LW_LIVE_LOOK_RECORD_MAX_BYTES) {
  return encodedBytes > 0 && encodedBytes <= maxBytes;
}

// A record restores only when it demonstrably belongs to the project that
// just booted: exact project id AND exact project revision. Either mismatch
// means a different (or re-saved) project is installed and the record must
// be treated as stale, never partially applied.
inline bool liveLookRecordMatchesProject(const LiveLookRecord& record, const char* projectId, uint32_t projectRevision) {
  if (!projectId) return false;
  if (record.projectRevision != projectRevision) return false;
  return strncmp(record.projectId, projectId, LW_LIVE_LOOK_ID_BYTES) == 0 &&
         strlen(projectId) < LW_LIVE_LOOK_ID_BYTES;
}

// ---------------------------------------------------------------------------
// Everything below needs the full Arduino/ESP32 runtime and is not part of
// the host-testable live-look model above. LW_STORAGE_NATIVE_TEST is defined
// only by the native_live_look test env (see test/platformio-live-look-test.ini)
// so the real esp32-s3 firmware build is completely unaffected.
// ---------------------------------------------------------------------------
#ifndef LW_STORAGE_NATIVE_TEST

#include <Arduino.h>
#include <Preferences.h>
#include <SD.h>
#include "LightweaverTypes.h"

struct RuntimeLoadResult {
  bool ok = false;
  RuntimeSource source = SOURCE_DEFAULTS;
  bool bootedCandidate = false;
  bool storageKnownBlank = false;
  bool safeMode = false;
  bool configValid = false;
  bool knownGoodProject = false;
  ProvisioningPhase runtimePhase = ProvisioningPhase::Factory;
  String message;
};

enum class RuntimeStorageAccessMode : uint8_t {
  Normal,
  ReadOnlyProbation,
};

void applyDefaultRuntimeConfig(RuntimeConfig& config);
void ensureDefaultZone(RuntimeConfig& config);
RuntimeLoadResult loadRuntimeConfig(
    RuntimeConfig& config,
    RuntimeStorageAccessMode accessMode = RuntimeStorageAccessMode::Normal);
bool saveRuntimeConfigJson(const String& json, RuntimeConfig& config, String& message);
bool suppressSdProjectAutorunAfterFactoryReset(String& message);
bool clearRuntimeProjectStorage(String& message);
bool stageRuntimeConfigJson(const String& json, String& activationId, String& message);
bool activateStagedRuntimeConfig(const String& activationId, String& message);
bool confirmCandidateRuntimeConfig(const String& activationId, String& message);
bool rollbackCandidateRuntimeConfig(const String& activationId, String& message);
bool runtimeConfigJsonChangesWiring(const String& json, const RuntimeConfig& current, bool& changes, String& message);
bool setRuntimeWiringDiscoveryBatch(uint8_t batchIndex, String& message);
bool clearRuntimeWiringDiscovery(String& message);
bool armRuntimeRecoveryAfterRestart(String& message);
bool runtimeRecoveryAfterRestartPending();
bool clearRuntimeRecoveryAfterRestart(String& message);
WiringSafetyStatus getRuntimeWiringSafetyStatus();
String runtimeWiringSafetyStatusJson();
bool saveWifiConfigJson(const String& json, RuntimeConfig& config, String& message);
bool markWifiCredentialsProven(RuntimeConfig& config, uint8_t channel = 0);
String runtimeStatusJson(const RuntimeConfig& config, ErrorCode errorCode, uint16_t totalPixels, uint8_t currentLookIndex);

// Live-look NVS persistence. main.cpp owns WHEN to capture/restore (it holds
// the live globals — runtimeConfig, looks[], currentLookIndex); this owns
// HOW the record gets to and from flash, in its own "liveLook" NVS key,
// entirely separate from the project JSON's keys.
bool persistLiveLookRecord(const LiveLookRecord& record, String& message);
bool loadPersistedLiveLookRecord(LiveLookRecord& outRecord);
void clearPersistedLiveLookRecord();

#endif  // LW_STORAGE_NATIVE_TEST
