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
#include "LightweaverClientPolicy.h"
#include "LightweaverClientPattern.h"
#include "LightweaverClientLibrary.h"
#include "LightweaverLookModePolicy.h"

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

void test_startup_saved_controls_win_over_other_look_resume() {
  ClientPatternOverride savedA;
  savedA.fields = 1; savedA.brightness = 0.4f;
  ClientPatternBase resumed;
  resumed.brightness = 0.9f; resumed.speed = 1.7f;
  if (clientPatternNeedsSavedRestore(7, 7, "B", "A"))
    applyClientPatternToZone(savedA, resumed);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 0.4, resumed.brightness);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 1.7, resumed.speed);
  // An unsaved tweak for the same look/generation still resumes unchanged.
  resumed.brightness = 0.6f;
  if (clientPatternNeedsSavedRestore(7, 7, "A", "A"))
    applyClientPatternToZone(savedA, resumed);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 0.6, resumed.brightness);
  TEST_ASSERT_TRUE(clientPatternNeedsSavedRestore(6, 7, "A", "A"));
}

void test_named_pattern_overlay_does_not_bleed_into_next_plain_pattern() {
  ClientPatternBase baseline;
  baseline.brightness = 0.8f; baseline.speed = 1.3f; baseline.hueShift = 12;
  ClientPatternBase zone = baseline;
  ClientPatternOverride savedA;
  savedA.fields = 1; savedA.brightness = 0.4f;
  applyClientPatternToZone(savedA, zone);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 0.4, zone.brightness);
  removeClientPatternFromZone(savedA, baseline, zone);
  ClientPatternOverride plainB;
  applyClientPatternToZone(plainB, zone);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 0.8, zone.brightness);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 1.3, zone.speed);
  TEST_ASSERT_EQUAL_INT16(12, zone.hueShift);
  applyClientPatternToZone(savedA, zone);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 0.4, zone.brightness);
  zone.brightness = 0.6f;  // subsequent unsaved live tweak retains old semantics
  removeClientPatternFromZone(savedA, baseline, zone);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 0.6, zone.brightness);
}

void test_client_pattern_patch_is_atomic_and_preserves_unedited_controls() {
  ClientPatternOverride entry;
  entry.fields = 2; entry.speed = 1.7f;
  JsonDocument doc; doc["brightness"] = 0.25;
  TEST_ASSERT_TRUE(patchClientPattern(doc.as<JsonVariantConst>(), entry));
  TEST_ASSERT_EQUAL_UINT8(3, entry.fields);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 1.7, entry.speed);
  TEST_ASSERT_FLOAT_WITHIN(0.001, 0.25, entry.brightness);
  doc["brightness"] = 0;
  TEST_ASSERT_FALSE(patchClientPattern(doc.as<JsonVariantConst>(), entry));
  TEST_ASSERT_FLOAT_WITHIN(0.001, 0.25, entry.brightness);
  doc["brightness"] = 0.5; doc["patternId"] = "replacement";
  TEST_ASSERT_FALSE(patchClientPattern(doc.as<JsonVariantConst>(), entry));
  doc.remove("patternId"); doc["hueShift"] = 2.5;
  TEST_ASSERT_FALSE(patchClientPattern(doc.as<JsonVariantConst>(), entry));
  doc["hueShift"] = 128; doc["speed"] = 3.0;
  TEST_ASSERT_TRUE(patchClientPattern(doc.as<JsonVariantConst>(), entry));
  TEST_ASSERT_EQUAL_UINT8(7, entry.fields);
}

void test_client_library_distinct_section_placements() {
  const char* ids[] = {"source", "mirror", "center"}; const uint8_t mirrors[] = {255, 0, 255};
  bool targets[3] = {}; const char* presets[3] = {}; ClientPatternOverride patches[3];
  JsonDocument doc;
  deserializeJson(doc, R"({"presetId":"aurora","targetIds":["source","center"],"tuning":{},"assignments":[{"targetId":"source","presetId":"aurora","tuning":{"brightness":0.4}},{"targetId":"center","presetId":"ocean","tuning":{"speed":0.7}}]})");
  TEST_ASSERT_TRUE(clientLibraryPlacementsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets, presets, patches));
  TEST_ASSERT_EQUAL_STRING("aurora", presets[0]); TEST_ASSERT_EQUAL_STRING("ocean", presets[2]);
  TEST_ASSERT_FLOAT_WITHIN(.0001f, .4f, patches[0].brightness); TEST_ASSERT_FLOAT_WITHIN(.0001f, .7f, patches[2].speed);
  TEST_ASSERT_NULL(presets[1]); TEST_ASSERT_EQUAL_UINT8(0, patches[1].fields);
  doc["assignments"][1]["targetId"] = "mirror";
  TEST_ASSERT_FALSE(clientLibraryPlacementsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets, presets, patches));
  doc["assignments"][1]["targetId"] = "source";
  TEST_ASSERT_FALSE(clientLibraryPlacementsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets, presets, patches));
  doc["assignments"][1]["targetId"] = "center"; doc["assignments"][1]["tuning"]["pin"] = 4;
  TEST_ASSERT_FALSE(clientLibraryPlacementsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets, presets, patches));
  doc["assignments"][1]["tuning"].remove("pin"); doc["assignments"][1]["presetId"] = "foreign";
  TEST_ASSERT_FALSE(clientLibraryPlacementsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets, presets, patches));
}

void test_saved_library_look_passes_runtime_playability_shape() {
  // Creation and boot decode use this exact mode. The runtime selection and
  // playlist admission call this same shape policy before checking effects.
  TEST_ASSERT_EQUAL_STRING("combo", CLIENT_LIBRARY_LOOK_MODE);
  TEST_ASSERT_TRUE(loadedLookZoneShapePlayable(CLIENT_LIBRARY_LOOK_MODE, false, true, 3));
  TEST_ASSERT_FALSE(loadedLookZoneShapePlayable("procedural", false, true, 3));
  TEST_ASSERT_FALSE(loadedLookZoneShapePlayable(CLIENT_LIBRARY_LOOK_MODE, true, true, 3));
  TEST_ASSERT_FALSE(loadedLookZoneShapePlayable(CLIENT_LIBRARY_LOOK_MODE, false, true, 0));
  for (const char* preset : CLIENT_LIBRARY_PRESETS) TEST_ASSERT_TRUE(clientLibraryPreset(preset));
}

void test_client_library_targets_preserve_mirror_map() {
  const char* ids[] = {"source", "mirror", "center"};
  const uint8_t mirrors[] = {255, 0, 255}; bool targets[3] = {};
  JsonDocument doc; deserializeJson(doc, "[\"source\",\"center\"]");
  TEST_ASSERT_TRUE(clientLibraryTargetsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets));
  TEST_ASSERT_TRUE(targets[0]); TEST_ASSERT_FALSE(targets[1]); TEST_ASSERT_TRUE(targets[2]);
  deserializeJson(doc, "[\"mirror\"]");
  TEST_ASSERT_FALSE(clientLibraryTargetsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets));
  deserializeJson(doc, "[\"source\",\"source\"]");
  TEST_ASSERT_FALSE(clientLibraryTargetsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets));
  deserializeJson(doc, "[\"foreign\"]");
  TEST_ASSERT_FALSE(clientLibraryTargetsValid(doc.as<JsonVariantConst>(), ids, mirrors, 3, targets));
  TEST_ASSERT_EQUAL_UINT8(0, mirrors[1]);
}

void test_client_library_snapshot_persists_appearance_only() {
  JsonDocument doc;
  deserializeJson(doc, R"({"id":"client-exact","label":"Petals","preset":"ocean","brightness":0.35,"zones":[["aurora",0.4,1.0,0,32,230,false,85,100,9,false,false]]})");
  TEST_ASSERT_TRUE(clientLibrarySnapshotValid(doc.as<JsonVariantConst>(), 1));
  std::string encoded; serializeJson(doc, encoded);
  JsonDocument readback; deserializeJson(readback, encoded);
  TEST_ASSERT_TRUE(clientLibrarySnapshotValid(readback.as<JsonVariantConst>(), 1));
  TEST_ASSERT_EQUAL_STRING("ocean", readback["preset"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING("aurora", readback["zones"][0][0].as<const char*>());
  doc["outputs"][0]["pin"] = 12;
  TEST_ASSERT_FALSE(clientLibrarySnapshotValid(doc.as<JsonVariantConst>(), 1));
  doc.remove("outputs"); doc["zones"][0][0] = "studio-unsupported";
  TEST_ASSERT_FALSE(clientLibrarySnapshotValid(doc.as<JsonVariantConst>(), 1));
  doc["zones"][0][0] = "aurora"; doc["zones"][0][2] = 4;
  TEST_ASSERT_FALSE(clientLibrarySnapshotValid(doc.as<JsonVariantConst>(), 1));
  doc["zones"][0][2] = 1;
  TEST_ASSERT_FALSE(clientLibrarySnapshotValid(doc.as<JsonVariantConst>(), 2));
  TEST_ASSERT_TRUE(clientHttpRouteAllowed("POST", "/api/client-library"));
  TEST_ASSERT_FALSE(clientHttpRouteAllowed("POST", "/api/config"));
}

void test_client_origin_routes() {
  TEST_ASSERT_TRUE(clientHttpRouteAllowed("POST", "/api/client-playlist"));
  TEST_ASSERT_TRUE(clientHttpRouteAllowed("POST", "/api/client-pattern"));
  TEST_ASSERT_TRUE(clientHttpRouteAllowed("GET", "/api/client-pattern"));
  TEST_ASSERT_TRUE(clientHttpRouteAllowed("GET", "/api/status"));
  TEST_ASSERT_FALSE(clientHttpRouteAllowed("POST", "/api/config"));
  TEST_ASSERT_FALSE(clientHttpRouteAllowed("GET", "/api/reboot"));
  TEST_ASSERT_FALSE(clientHttpRouteAllowed("POST", "/api/wiring/activate"));
  TEST_ASSERT_FALSE(clientHttpRouteAllowed("POST", "/api/owner/capability"));
  TEST_ASSERT_FALSE(clientHttpRouteAllowed("OPTIONS", "/api/config"));
}
void test_client_playlist_strict_validation() {
  JsonDocument doc;
  deserializeJson(doc, R"({"enabled":true,"fadeMs":1500,"entries":[{"patternId":"installed","dwellSeconds":30}]})");
  PlaylistRecord record;
  auto installed = [](const char* id) { return strcmp(id, "installed") == 0; };
  TEST_ASSERT_TRUE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  doc["entries"][0]["patternId"] = "default-only";
  TEST_ASSERT_FALSE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  doc["entries"][0]["patternId"] = "installed";
  doc["entries"][0]["dwellSeconds"] = 0;
  TEST_ASSERT_FALSE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  doc["entries"][0]["dwellSeconds"] = 3601;
  TEST_ASSERT_FALSE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  doc["entries"][0]["dwellSeconds"] = 30;
  doc["fadeMs"] = 10001;
  TEST_ASSERT_FALSE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  doc["fadeMs"] = 1000;
  doc["wiring"] = true;
  TEST_ASSERT_FALSE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  TEST_ASSERT_EQUAL_UINT16(30, record.entries[0].dwellSeconds);
  doc.remove("wiring");
  doc["entries"].to<JsonArray>();
  TEST_ASSERT_FALSE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  doc["enabled"] = false;
  TEST_ASSERT_TRUE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  for (int i = 0; i < 17; ++i) {
    JsonObject e = doc["entries"].as<JsonArray>().add<JsonObject>();
    e["patternId"] = "installed"; e["dwellSeconds"] = 30;
  }
  TEST_ASSERT_FALSE(decodeClientPlaylist(doc.as<JsonVariantConst>(), record, installed));
  TEST_ASSERT_EQUAL_UINT8(0, record.entryCount);

}

int main(int argc, char** argv) {
  (void)argc;
  (void)argv;
  UNITY_BEGIN();
  RUN_TEST(test_client_playlist_strict_validation);
  RUN_TEST(test_client_origin_routes);
  RUN_TEST(test_client_library_snapshot_persists_appearance_only);
  RUN_TEST(test_client_library_targets_preserve_mirror_map);
  RUN_TEST(test_saved_library_look_passes_runtime_playability_shape);
  RUN_TEST(test_client_library_distinct_section_placements);
  RUN_TEST(test_client_pattern_patch_is_atomic_and_preserves_unedited_controls);
  RUN_TEST(test_named_pattern_overlay_does_not_bleed_into_next_plain_pattern);
  RUN_TEST(test_startup_saved_controls_win_over_other_look_resume);
  RUN_TEST(test_representative_4_zone_project_with_16_entry_playlist_measurement);
  RUN_TEST(test_encode_decode_round_trip_16_entries);
  RUN_TEST(test_seventeen_entries_drops_the_seventeenth);
  RUN_TEST(test_missing_playlist_defaults_and_non_object_rejected);
  RUN_TEST(test_id_less_entry_skipped_and_bounds_clamped);
  return UNITY_END();
}
