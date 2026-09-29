#pragma once
#include <ArduinoJson.h>
#include <cmath>
#include <cstdint>
#include <cstring>

// Only these zone controls may be saved; no authoring or installation fields.
struct ClientPatternOverride {
  uint8_t fields = 0;
  float brightness = 1.0f;
  float speed = 1.0f;
  int16_t hueShift = 0;
};
inline bool patchClientPattern(JsonVariantConst value, ClientPatternOverride& out) {
  JsonObjectConst changes = value.as<JsonObjectConst>();
  if (changes.isNull() || changes.size() == 0 || changes.size() > 3) return false;
  ClientPatternOverride candidate = out;
  for (JsonPairConst field : changes) {
    const char* key = field.key().c_str();
    JsonVariantConst v = field.value();
    if (!strcmp(key, "brightness") || !strcmp(key, "speed")) {
      if (!v.is<float>()) return false;
      const float n = v.as<float>();
      if (!std::isfinite(n)) return false;
      if (!strcmp(key, "brightness")) {
        if (n < 0.02f || n > 1.0f) return false;
        candidate.brightness = n; candidate.fields |= 1;
      } else {
        if (n < 0.05f || n > 3.0f) return false;
        candidate.speed = n; candidate.fields |= 2;
      }
    } else if (!strcmp(key, "hueShift")) {
      if (!v.is<int>() || v.as<int>() < -128 || v.as<int>() > 128) return false;
      candidate.hueShift = v.as<int>(); candidate.fields |= 4;
    } else return false;
  }
  out = candidate;
  return true;
}
inline void encodeClientPattern(const ClientPatternOverride& entry, JsonObject out) {
  if (entry.fields & 1) out["brightness"] = entry.brightness;
  if (entry.fields & 2) out["speed"] = entry.speed;
  if (entry.fields & 4) out["hueShift"] = entry.hueShift;
}

struct ClientPatternBase {
  float brightness = 1.0f;
  float speed = 1.0f;
  int16_t hueShift = 0;
};
template <typename Zone>
inline void applyClientPatternToZone(const ClientPatternOverride& saved, Zone& zone) {
  if (saved.fields & 1) zone.brightness = saved.brightness;
  if (saved.fields & 2) zone.speed = saved.speed;
  if (saved.fields & 4) zone.hueShift = saved.hueShift;
}
// Undo only the named pattern's saved overlay. A later, different live tweak
// retains the existing carry-over behavior for plain patterns.
template <typename Zone>
inline void removeClientPatternFromZone(const ClientPatternOverride& applied,
                                        const ClientPatternBase& base, Zone& zone) {
  if ((applied.fields & 1) && std::fabs(zone.brightness - applied.brightness) < 0.000001f)
    zone.brightness = base.brightness;
  if ((applied.fields & 2) && std::fabs(zone.speed - applied.speed) < 0.000001f)
    zone.speed = base.speed;
  if ((applied.fields & 4) && zone.hueShift == applied.hueShift)
    zone.hueShift = base.hueShift;
}

inline bool clientPatternNeedsSavedRestore(uint32_t resumedGeneration,
    uint32_t savedGeneration, const char* resumedLookId, const char* startupLookId) {
  return resumedGeneration != savedGeneration || !resumedLookId || !startupLookId ||
      strcmp(resumedLookId, startupLookId) != 0;
}
