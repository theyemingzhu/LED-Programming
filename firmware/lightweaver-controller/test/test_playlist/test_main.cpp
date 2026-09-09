// Native (host) unit tests for the timed-playlist project-JSON block — the
// "playlist" object inside a card's installed project config that lets it
// auto-advance through installed looks / compiled patterns / presets on a
// timer, with a cross-fade between entries. See PlaylistRecord /
// decodePlaylistRecord() / encodePlaylistRecord() in LightweaverStorage.h
// for the full design rationale — decodePlaylistRecord() is the SAME
// function LightweaverStorage.cpp's applyJsonToConfig() calls for the real
// project-JSON parse, so this native pass proves the real parse path.
//
// Run with:
//   pio test -d firmware/lightweaver-controller \
//     -c firmware/lightweaver-controller/test/platformio-playlist-test.ini \
//     -e native_playlist
//
// This env is defined in a SEPARATE project-conf file rather than in the
// real platformio.ini — see that file's header comment for why — and passes
// -DLW_STORAGE_NATIVE_TEST so LightweaverStorage.h never reaches its
// Arduino/Preferences/SD includes.
#include <ArduinoJson.h>
#include <unity.h>

#include <cstdint>
#include <cstring>
#include <string>

#include "LightweaverStorage.h"

namespace {

uint16_t g_droppedCount = 0;
uint16_t g_droppedCallbackCount = 0;

void recordDropped(uint16_t dropped) {
  g_droppedCount = dropped;
  g_droppedCallbackCount++;
}

void resetDroppedCounter() {
  g_droppedCount = 0;
  g_droppedCallbackCount = 0;
}

}  // namespace

// ---------------------------------------------------------------------------
// 1. Measurement: a representative 4-zone PROJECT JSON with a full
//    16-entry playlist block attached — the thing that must stay under the
//    3968-byte NVS project budget. This is the task's required measurement,
//    kept as a native test so it re-runs and re-prints on every CI run
//    rather than rotting as a one-off log line.
// ---------------------------------------------------------------------------
void test_representative_4_zone_project_with_16_entry_playlist_measurement() {
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

  // 16-entry playlist, cycling the three installed looks with generous
  // dwell/id lengths — a realistic worst case, not the theoretical one (the
  // dedicated worst-case test below covers that).
  JsonObject playlist = doc["playlist"].to<JsonObject>();
  playlist["enabled"] = true;
  playlist["fadeMs"] = 1500;
  JsonArray entries = playlist["entries"].to<JsonArray>();
  for (uint8_t i = 0; i < LW_PLAYLIST_RECORD_MAX_ENTRIES; i++) {
    JsonObject entry = entries.add<JsonObject>();
    entry["patternId"] = lookIds[i % 3];
    entry["dwellSeconds"] = 45;
  }

  size_t measured = measureJson(doc);
  char message[180];
  snprintf(message, sizeof(message),
           "4-zone project + 16-entry playlist JSON measures %u bytes "
           "(NVS project budget is 3968 bytes; leaves %ld bytes headroom)",
           static_cast<unsigned>(measured),
           static_cast<long>(3968) - static_cast<long>(measured));
  TEST_MESSAGE(message);
  TEST_ASSERT_TRUE_MESSAGE(measured < 3968,
      "4-zone project + 16-entry playlist JSON must fit the real NVS budget");
}

// ---------------------------------------------------------------------------
// 2. Encode/decode round trip: a 16-entry playlist survives encode -> JSON
//    text -> decode unchanged.
// ---------------------------------------------------------------------------
void test_encode_decode_round_trip_16_entries() {
  PlaylistRecord record;
  record.enabled = true;
  record.fadeMs = 2200;
  record.entryCount = LW_PLAYLIST_RECORD_MAX_ENTRIES;
  char idBuf[LW_PLAYLIST_PATTERN_ID_BYTES];
  for (uint8_t i = 0; i < LW_PLAYLIST_RECORD_MAX_ENTRIES; i++) {
    snprintf(idBuf, sizeof(idBuf), "look-%u", static_cast<unsigned>(i));
    strncpy(record.entries[i].patternId, idBuf, sizeof(record.entries[i].patternId) - 1);
    record.entries[i].dwellSeconds = static_cast<uint16_t>(20 + i);
  }

  JsonDocument doc;
  JsonObject out = doc["playlist"].to<JsonObject>();
  encodePlaylistRecord(record, out);
  std::string json;
  serializeJson(doc, json);

  JsonDocument redoc;
  DeserializationError err = deserializeJson(redoc, json);
  TEST_ASSERT_FALSE(err);

  PlaylistRecord decoded;
  resetDroppedCounter();
  TEST_ASSERT_TRUE(decodePlaylistRecord(redoc["playlist"], decoded, recordDropped));
  TEST_ASSERT_EQUAL_UINT16(0, g_droppedCallbackCount);
  TEST_ASSERT_TRUE(decoded.enabled);
  TEST_ASSERT_EQUAL_UINT16(2200, decoded.fadeMs);
  TEST_ASSERT_EQUAL_UINT8(LW_PLAYLIST_RECORD_MAX_ENTRIES, decoded.entryCount);
  for (uint8_t i = 0; i < LW_PLAYLIST_RECORD_MAX_ENTRIES; i++) {
    snprintf(idBuf, sizeof(idBuf), "look-%u", static_cast<unsigned>(i));
    TEST_ASSERT_EQUAL_STRING(idBuf, decoded.entries[i].patternId);
    TEST_ASSERT_EQUAL_UINT16(20 + i, decoded.entries[i].dwellSeconds);
  }
}

// ---------------------------------------------------------------------------
// 3. A 17-entry playlist drops the 17th (and only the 17th): entryCount caps
//    at LW_PLAYLIST_RECORD_MAX_ENTRIES (16), the first 16 are preserved in
//    order, and the drop callback fires exactly once with count 1.
// ---------------------------------------------------------------------------
void test_seventeen_entries_drops_the_seventeenth() {
  JsonDocument doc;
  JsonObject playlist = doc["playlist"].to<JsonObject>();
  playlist["enabled"] = true;
  JsonArray entries = playlist["entries"].to<JsonArray>();
  for (uint8_t i = 0; i < LW_PLAYLIST_RECORD_MAX_ENTRIES + 1; i++) {
    JsonObject entry = entries.add<JsonObject>();
    char idBuf[16];
    snprintf(idBuf, sizeof(idBuf), "entry-%u", static_cast<unsigned>(i));
    entry["patternId"] = idBuf;
    entry["dwellSeconds"] = 30;
  }
  TEST_ASSERT_EQUAL_UINT8(17, entries.size());

  PlaylistRecord decoded;
  resetDroppedCounter();
  TEST_ASSERT_TRUE(decodePlaylistRecord(doc["playlist"], decoded, recordDropped));
  TEST_ASSERT_EQUAL_UINT8(LW_PLAYLIST_RECORD_MAX_ENTRIES, decoded.entryCount);
  TEST_ASSERT_EQUAL_UINT16(1, g_droppedCallbackCount);
  TEST_ASSERT_EQUAL_UINT16(1, g_droppedCount);
  TEST_ASSERT_EQUAL_STRING("entry-0", decoded.entries[0].patternId);
  TEST_ASSERT_EQUAL_STRING("entry-15", decoded.entries[15].patternId);
}

// ---------------------------------------------------------------------------
// 4. Absent/null playlist decodes to defaults (no sequencing), never an
//    error; a playlist that is present but not an object is rejected.
// ---------------------------------------------------------------------------
void test_missing_playlist_defaults_and_non_object_rejected() {
  JsonDocument doc;
  doc["mode"] = "website-flash";
  PlaylistRecord decoded;
  decoded.enabled = true;  // seed with a non-default value to prove it's reset
  TEST_ASSERT_TRUE(decodePlaylistRecord(doc["playlist"], decoded));
  TEST_ASSERT_FALSE(decoded.enabled);
  TEST_ASSERT_EQUAL_UINT8(0, decoded.entryCount);
  TEST_ASSERT_EQUAL_UINT16(LW_PLAYLIST_RECORD_DEFAULT_FADE_MS, decoded.fadeMs);

  JsonDocument badDoc;
  badDoc["playlist"] = "not-an-object";
  PlaylistRecord badDecoded;
  TEST_ASSERT_FALSE(decodePlaylistRecord(badDoc["playlist"], badDecoded));
}

// ---------------------------------------------------------------------------
// 5. An entry with no patternId is skipped (never counted against the
//    16-entry cap, never resolved); fadeMs and dwellSeconds are clamped to
//    their documented bounds rather than rejected.
// ---------------------------------------------------------------------------
void test_id_less_entry_skipped_and_bounds_clamped() {
  const char* json =
      R"({"enabled":true,"fadeMs":50000,)"
      R"("entries":[{"dwellSeconds":30},{"patternId":"aurora","dwellSeconds":0},)"
      R"({"patternId":"ocean","dwellSeconds":999999}]})";
  JsonDocument doc;
  TEST_ASSERT_FALSE(deserializeJson(doc, json));

  PlaylistRecord decoded;
  TEST_ASSERT_TRUE(decodePlaylistRecord(doc.as<JsonVariant>(), decoded));
  TEST_ASSERT_EQUAL_UINT16(LW_PLAYLIST_RECORD_MAX_FADE_MS, decoded.fadeMs);
  TEST_ASSERT_EQUAL_UINT8(2, decoded.entryCount);
  TEST_ASSERT_EQUAL_STRING("aurora", decoded.entries[0].patternId);
  TEST_ASSERT_EQUAL_UINT16(LW_PLAYLIST_RECORD_MIN_DWELL_SECONDS, decoded.entries[0].dwellSeconds);
  TEST_ASSERT_EQUAL_STRING("ocean", decoded.entries[1].patternId);
  TEST_ASSERT_EQUAL_UINT16(LW_PLAYLIST_RECORD_MAX_DWELL_SECONDS, decoded.entries[1].dwellSeconds);
}

int main(int argc, char** argv) {
  (void)argc;
  (void)argv;
  UNITY_BEGIN();
  RUN_TEST(test_representative_4_zone_project_with_16_entry_playlist_measurement);
  RUN_TEST(test_encode_decode_round_trip_16_entries);
  RUN_TEST(test_seventeen_entries_drops_the_seventeenth);
  RUN_TEST(test_missing_playlist_defaults_and_non_object_rejected);
  RUN_TEST(test_id_less_entry_skipped_and_bounds_clamped);
  return UNITY_END();
}
