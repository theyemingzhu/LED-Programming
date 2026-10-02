#pragma once
#include <cstring>
#include <cmath>
#include <cstdint>
constexpr const char* CLIENT_LIBRARY_LOOK_MODE = "combo";
constexpr const char* CLIENT_LIBRARY_PRESETS[] = {"aurora","custom-color","ember","plasma","fire","ocean","ripple","lava","rainbow","sparkle","breathe","meteor","chase","scanner","candle","lightning","neon","matrix","heartbeat","stained","confetti","warp","pulse-ring","blocks","bloom","calm","drift","sunset","twinkle","wave"};
inline bool clientLibraryPreset(const char* id) {
  if (!id) return false;
  for (const char* preset : CLIENT_LIBRARY_PRESETS) if (!strcmp(preset, id)) return true;
  return false;
}

#if defined(ARDUINOJSON_VERSION_MAJOR)
#include "LightweaverClientPattern.h"
inline bool clientLibraryTargetsValid(JsonVariantConst values, const char* const* ids, const uint8_t* mirrors, uint8_t count, bool* targets) {
  if (!values.is<JsonArrayConst>() || !values.size() || values.size() > count || count > 12) return false;
  for (uint8_t i = 0; i < count; ++i) targets[i] = false;
  for (JsonVariantConst value : values.as<JsonArrayConst>()) {
    if (!value.is<const char*>()) return false;
    int target = -1;
    for (uint8_t i = 0; i < count; ++i) if (!strcmp(value.as<const char*>(), ids[i])) target = i;
    if (target < 0 || targets[target] || mirrors[target] != 255) return false;
    targets[target] = true;
  }
  return true;
}

// Decode requested appearance into source-section slots. No caller-supplied
// topology enters this structure; mirrors and untargeted sections stay intact.
inline bool clientLibraryPlacementsValid(JsonVariantConst request, const char* const* ids,
    const uint8_t* mirrors, uint8_t count, bool* targets, const char** presets, ClientPatternOverride* patches) {
  if (!clientLibraryTargetsValid(request["targetIds"], ids, mirrors, count, targets) ||
      !clientLibraryPreset(request["presetId"].as<const char*>()) || !request["tuning"].is<JsonObjectConst>()) return false;
  for (uint8_t i = 0; i < count; ++i) { presets[i] = nullptr; patches[i] = ClientPatternOverride(); }
  ClientPatternOverride scalar;
  if (request["tuning"].size() && !patchClientPattern(request["tuning"], scalar)) return false;
  const bool hasAssignments = request.as<JsonObjectConst>().containsKey("assignments");
  if (!hasAssignments) {
    for (uint8_t i = 0; i < count; ++i) if (targets[i]) { presets[i] = request["presetId"]; patches[i] = scalar; }
    return true;
  }
  JsonArrayConst assignments = request["assignments"].as<JsonArrayConst>();
  if (assignments.isNull() || assignments.size() != request["targetIds"].size()) return false;
  bool assigned[12] = {};
  for (JsonVariantConst assignment : assignments) {
    if (!assignment.is<JsonObjectConst>() || assignment.size() != 3 || !assignment["targetId"].is<const char*>() ||
        !clientLibraryPreset(assignment["presetId"].as<const char*>()) || !assignment["tuning"].is<JsonObjectConst>()) return false;
    int target = -1;
    for (uint8_t i = 0; i < count; ++i) if (!strcmp(ids[i], assignment["targetId"])) target = i;
    if (target < 0 || !targets[target] || assigned[target]) return false;
    if (assignment["tuning"].size() && !patchClientPattern(assignment["tuning"], patches[target])) return false;
    presets[target] = assignment["presetId"]; assigned[target] = true;
  }
  return true;
}

inline bool clientLibrarySnapshotValid(JsonVariantConst row, uint8_t zoneCount) {
  if (!row.is<JsonObjectConst>() || row.size() != 5 || !row["id"].is<const char*>() ||
      !row["label"].is<const char*>() || !clientLibraryPreset(row["preset"].as<const char*>()) || !row["brightness"].is<float>() ||
      !row["zones"].is<JsonArrayConst>() || row["zones"].size() != zoneCount || !zoneCount || zoneCount > 12) return false;
  const char* id = row["id"]; const char* label = row["label"];
  if (strncmp(id, "client-", 7) || strlen(id) > 64 || !strlen(label) || strlen(label) > 64) return false;
  const float brightness = row["brightness"];
  if (!std::isfinite(brightness) || brightness < 0 || brightness > 1) return false;
  for (JsonArrayConst a : row["zones"].as<JsonArrayConst>()) {
    if (a.size() != 12 || !clientLibraryPreset(a[0].as<const char*>()) ||
        !a[1].is<float>() || !a[2].is<float>() || !a[3].is<int>() ||
        !a[4].is<uint8_t>() || !a[5].is<uint8_t>() || !a[6].is<bool>() ||
        !a[7].is<uint8_t>() || !a[8].is<uint8_t>() || !a[9].is<uint8_t>() || !a[10].is<bool>() || !a[11].is<bool>()) return false;
    const float b = a[1]; const float speed = a[2]; const int hue = a[3];
    if (!std::isfinite(b) || b < 0 || b > 1 || !std::isfinite(speed) || speed < .05f || speed > 3 || hue < -128 || hue > 128 ||
        a[7].as<int>() > a[8].as<int>() || a[8].as<int>() > 100 || a[9].as<int>() < 2 || a[9].as<int>() > 60) return false;
  }
  return true;
}
#endif
