// Native (host) unit tests for the live-look resume record — the record that
// lets an owner's /api/control tweaks (brightness, hue, pattern, breathe,
// drift, blackout, syncZones) survive a power-cycle without ever touching the
// installed project JSON or its fingerprint. See LiveLookRecord in
// LightweaverStorage.h for the full design rationale.
//
// Run with:
//   pio test -d firmware/lightweaver-controller \
//     -c firmware/lightweaver-controller/test/platformio-live-look-test.ini \
//     -e native_live_look
//
// This env is defined in a SEPARATE project-conf file rather than in the
// real platformio.ini — see that file's header comment for why — and passes
// -DLW_STORAGE_NATIVE_TEST so LightweaverStorage.h never reaches its
// Arduino/Preferences/SD includes.
#include <ArduinoJson.h>
#include <unity.h>

#include <cstdint>
#include <cstring>

#include "LightweaverStorage.h"

namespace {

LiveLookZoneRecord makeZone(const char* id, const char* patternId, float brightness = 0.7f) {
  LiveLookZoneRecord z;
  strncpy(z.zoneId, id, sizeof(z.zoneId) - 1);
  strncpy(z.patternId, patternId, sizeof(z.patternId) - 1);
  z.brightness = brightness;
  z.speed = 1.4f;
  z.hueShift = -37;
  z.customHue = 190;
  z.customSaturation = 210;
  z.customBreathe = true;
  z.breatheLowerPct = 60;
  z.breatheUpperPct = 95;
  z.breatheCycleSeconds = 12;
  z.customDrift = true;
  z.driftHueMin = 20;
  z.driftHueMax = 200;
  z.blackout = false;
  return z;
}

}  // namespace

// ---------------------------------------------------------------------------
// 1. Measurement: a representative 4-zone PROJECT JSON (the thing that must
//    stay under the 3968-byte NVS budget the live-look record must never
//    share). This is the task's required first measurement, kept as a native
//    test so it re-runs and re-prints on every CI run rather than rotting as
//    a one-off log line.
// ---------------------------------------------------------------------------
void test_representative_4_zone_project_json_measurement() {
  JsonDocument doc;
  doc["piece"]["id"] = "prj-gallery-04";
  doc["piece"]["name"] = "Threshold Piece";
  doc["projectRevision"] = 7;
  doc["startupPatternId"] = "aurora";
  doc["syncZones"] = false;
  JsonObject led = doc["led"].to<JsonObject>();
  led["type"] = "WS2812B";
  led["colorOrder"] = "GRB";
  led["maxMilliamps"] = 12000;
  led["brightnessLimit"] = 0.65f;
  JsonArray outputs = led["outputs"].to<JsonArray>();
  const char* outputIds[2] = {"strip-a", "strip-b"};
  for (uint8_t i = 0; i < 2; i++) {
    JsonObject out = outputs.add<JsonObject>();
    out["id"] = outputIds[i];
    out["pin"] = i == 0 ? 18 : 19;
    out["pixels"] = 420;
  }
  JsonArray looks = doc["looks"].to<JsonArray>();
  const char* lookIds[3] = {"aurora", "ocean-breathe", "custom-color"};
  const char* lookLabels[3] = {"Aurora", "Ocean Breathe", "Custom Color"};
  for (uint8_t i = 0; i < 3; i++) {
    JsonObject look = looks.add<JsonObject>();
    look["id"] = lookIds[i];
    look["label"] = lookLabels[i];
    look["mode"] = "compiled";
  }
  JsonArray zones = doc["zones"].to<JsonArray>();
  const char* zoneIds[4] = {"outer-ring", "inner-disc", "base-glow", "accent-strip"};
  const char* zoneLabels[4] = {"Outer Ring", "Inner Disc", "Base Glow", "Accent Strip"};
  const char* zonePatterns[4] = {"aurora", "ocean-breathe", "custom-color", "aurora"};
  for (uint8_t i = 0; i < 4; i++) {
    JsonObject zone = zones.add<JsonObject>();
    zone["id"] = zoneIds[i];
    zone["label"] = zoneLabels[i];
    zone["patternId"] = zonePatterns[i];
    zone["brightness"] = 0.82f;
    zone["speed"] = 1.1f;
    zone["hueShift"] = 12;
    zone["customHue"] = 40;
    zone["customSaturation"] = 220;
    zone["customBreathe"] = false;
    zone["breatheLowerPct"] = 85;
    zone["breatheUpperPct"] = 100;
    zone["breatheCycleSeconds"] = 9;
    zone["customDrift"] = false;
    zone["driftHueMin"] = 0;
    zone["driftHueMax"] = 255;
    zone["blackout"] = false;
    JsonArray ranges = zone["ranges"].to<JsonArray>();
    JsonObject range = ranges.add<JsonObject>();
    range["start"] = i * 105;
    range["count"] = 105;
  }
  size_t measured = measureJson(doc);
  char message[160];
  snprintf(message, sizeof(message),
           "representative 4-zone project JSON measures %u bytes "
           "(NVS project budget is 3968 bytes; leaves %ld bytes headroom)",
           static_cast<unsigned>(measured),
           static_cast<long>(3968) - static_cast<long>(measured));
  TEST_MESSAGE(message);
  // This is a finding to report, not a tight bound: a real 4-zone project
  // with several looks stays a small fraction of the 3968-byte budget.
  TEST_ASSERT_TRUE_MESSAGE(measured < 3968, "representative project JSON must fit the real NVS budget");
}

// ---------------------------------------------------------------------------
// 2. Encode/decode round-trip
// ---------------------------------------------------------------------------
void test_encode_decode_round_trip() {
  LiveLookRecord record;
  strncpy(record.projectId, "prj-gallery-04", sizeof(record.projectId) - 1);
  record.projectRevision = 7;
  strncpy(record.currentLookId, "ocean-breathe", sizeof(record.currentLookId) - 1);
  record.syncZones = false;
  record.zones[0] = makeZone("outer-ring", "custom-color", 0.55f);
  record.zones[1] = makeZone("inner-disc", "aurora", 0.9f);
  record.zoneCount = 2;

  char buffer[LW_LIVE_LOOK_RECORD_MAX_BYTES];
  size_t written = encodeLiveLookRecord(record, buffer, sizeof(buffer));
  TEST_ASSERT_TRUE_MESSAGE(written > 0, "encode should succeed for a normal 2-zone record");
  TEST_ASSERT_TRUE(liveLookRecordFitsBudget(written));

  LiveLookRecord decoded;
  TEST_ASSERT_TRUE(decodeLiveLookRecord(buffer, written, decoded));
  TEST_ASSERT_EQUAL_STRING("prj-gallery-04", decoded.projectId);
  TEST_ASSERT_EQUAL_UINT32(7, decoded.projectRevision);
  TEST_ASSERT_EQUAL_STRING("ocean-breathe", decoded.currentLookId);
  TEST_ASSERT_FALSE(decoded.syncZones);
  TEST_ASSERT_EQUAL_UINT8(2, decoded.zoneCount);

  const LiveLookZoneRecord& z0 = decoded.zones[0];
  TEST_ASSERT_EQUAL_STRING("outer-ring", z0.zoneId);
  TEST_ASSERT_EQUAL_STRING("custom-color", z0.patternId);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.55f, z0.brightness);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 1.4f, z0.speed);
  TEST_ASSERT_EQUAL_INT16(-37, z0.hueShift);
  TEST_ASSERT_EQUAL_UINT8(190, z0.customHue);
  TEST_ASSERT_EQUAL_UINT8(210, z0.customSaturation);
  TEST_ASSERT_TRUE(z0.customBreathe);
  TEST_ASSERT_EQUAL_UINT8(60, z0.breatheLowerPct);
  TEST_ASSERT_EQUAL_UINT8(95, z0.breatheUpperPct);
  TEST_ASSERT_EQUAL_UINT8(12, z0.breatheCycleSeconds);
  TEST_ASSERT_TRUE(z0.customDrift);
  TEST_ASSERT_EQUAL_UINT8(20, z0.driftHueMin);
  TEST_ASSERT_EQUAL_UINT8(200, z0.driftHueMax);
  TEST_ASSERT_FALSE(z0.blackout);

  const LiveLookZoneRecord& z1 = decoded.zones[1];
  TEST_ASSERT_EQUAL_STRING("inner-disc", z1.zoneId);
  TEST_ASSERT_EQUAL_STRING("aurora", z1.patternId);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.9f, z1.brightness);
}

// ---------------------------------------------------------------------------
// 3. Size bound: the documented worst case (LW_LIVE_LOOK_MAX_ZONES zones,
//    every id field filled to its capacity) must still fit
//    LW_LIVE_LOOK_RECORD_MAX_BYTES, and encodeLiveLookRecord must fail
//    (return 0) rather than silently truncate when the destination buffer is
//    smaller than that.
// ---------------------------------------------------------------------------
void test_worst_case_record_fits_documented_budget() {
  LiveLookRecord record;
  // LW_LIVE_LOOK_ID_BYTES - 1 characters, the longest id copyBounded ever
  // stores without truncating.
  char longId[LW_LIVE_LOOK_ID_BYTES];
  memset(longId, 'a', sizeof(longId) - 1);
  longId[sizeof(longId) - 1] = '\0';
  strncpy(record.projectId, longId, sizeof(record.projectId) - 1);
  record.projectRevision = 4294967295U;  // UINT32_MAX — worst-case digit count
  strncpy(record.currentLookId, longId, sizeof(record.currentLookId) - 1);
  record.syncZones = true;
  record.zoneCount = LW_LIVE_LOOK_MAX_ZONES;
  for (uint8_t i = 0; i < LW_LIVE_LOOK_MAX_ZONES; i++) {
    LiveLookZoneRecord z = makeZone(longId, longId);
    z.hueShift = -128;      // 4 characters incl. sign — worst case
    z.driftHueMax = 255;    // 3 digits — worst case for a uint8_t
    record.zones[i] = z;
  }

  char buffer[LW_LIVE_LOOK_RECORD_MAX_BYTES];
  size_t written = encodeLiveLookRecord(record, buffer, sizeof(buffer));
  char message[128];
  snprintf(message, sizeof(message),
           "worst-case record (%u zones, %u-byte ids) measures %u bytes; budget is %u",
           static_cast<unsigned>(LW_LIVE_LOOK_MAX_ZONES),
           static_cast<unsigned>(LW_LIVE_LOOK_ID_BYTES),
           static_cast<unsigned>(written),
           static_cast<unsigned>(LW_LIVE_LOOK_RECORD_MAX_BYTES));
  TEST_MESSAGE(message);
  TEST_ASSERT_TRUE_MESSAGE(written > 0, "the documented worst case must not overflow the NVS write buffer");
  TEST_ASSERT_TRUE(liveLookRecordFitsBudget(written));
  // Well under NVS's own ~4000-byte single-string entry ceiling too.
  TEST_ASSERT_TRUE_MESSAGE(written < 4000, "worst-case record must stay under the platform's NVS string limit");

  // A destination buffer smaller than what's needed must fail hard, never
  // return a truncated (unparseable, or worse, silently-wrong) write.
  char tooSmall[16];
  TEST_ASSERT_EQUAL_UINT32(0, encodeLiveLookRecord(record, tooSmall, sizeof(tooSmall)));
}

// ---------------------------------------------------------------------------
// 4. Decode rejects malformed input and input with no zones array, and drops
//    a zone entry with no id (it could never be matched back on restore).
// ---------------------------------------------------------------------------
void test_decode_rejects_malformed_and_id_less_zones() {
  LiveLookRecord decoded;
  TEST_ASSERT_FALSE(decodeLiveLookRecord("not json", 8, decoded));
  TEST_ASSERT_FALSE(decodeLiveLookRecord("", 0, decoded));
  TEST_ASSERT_FALSE(decodeLiveLookRecord(nullptr, 0, decoded));
  TEST_ASSERT_FALSE(decodeLiveLookRecord("{\"projectId\":\"x\"}", 18, decoded));  // no zones array at all

  const char* withIdLessZone =
      R"({"projectId":"p","projectRevision":1,"currentLookId":"","syncZones":true,)"
      R"("zones":[{"id":"outer","patternId":"aurora"},{"patternId":"no-id-here"}]})";
  LiveLookRecord parsed;
  TEST_ASSERT_TRUE(decodeLiveLookRecord(withIdLessZone, strlen(withIdLessZone), parsed));
  TEST_ASSERT_EQUAL_UINT8(1, parsed.zoneCount);
  TEST_ASSERT_EQUAL_STRING("outer", parsed.zones[0].zoneId);
}

// ---------------------------------------------------------------------------
// 5. Project-mismatch discard: a record only ever restores against the exact
//    project id + revision it was captured under.
// ---------------------------------------------------------------------------
void test_project_match_and_mismatch() {
  LiveLookRecord record;
  strncpy(record.projectId, "prj-gallery-04", sizeof(record.projectId) - 1);
  record.projectRevision = 7;

  TEST_ASSERT_TRUE(liveLookRecordMatchesProject(record, "prj-gallery-04", 7));
  TEST_ASSERT_FALSE_MESSAGE(
      liveLookRecordMatchesProject(record, "prj-gallery-04", 8),
      "a bumped revision (a re-save of the same project) must discard the record");
  TEST_ASSERT_FALSE_MESSAGE(
      liveLookRecordMatchesProject(record, "prj-different-project", 7),
      "a different installed project must discard the record");
  TEST_ASSERT_FALSE_MESSAGE(
      liveLookRecordMatchesProject(record, nullptr, 7),
      "a null project id must never match");
}

int main(int argc, char** argv) {
  (void)argc;
  (void)argv;
  UNITY_BEGIN();
  RUN_TEST(test_representative_4_zone_project_json_measurement);
  RUN_TEST(test_encode_decode_round_trip);
  RUN_TEST(test_worst_case_record_fits_documented_budget);
  RUN_TEST(test_decode_rejects_malformed_and_id_less_zones);
  RUN_TEST(test_project_match_and_mismatch);
  return UNITY_END();
}
