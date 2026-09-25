#pragma once

#include <cstdint>
#include <ArduinoJson.h>

// Provisional projects boot dark. The native renderer may be released one
// measured zone at a time; unarmed zones remain black even after the shared
// fade multiplier has been restored for an armed zone.
constexpr uint16_t nativeArmZoneBit(uint8_t zoneIndex) {
  return zoneIndex < 12 ? uint16_t(1U << zoneIndex) : 0;
}

constexpr uint16_t nativeArmAllZones(uint8_t zoneCount) {
  return zoneCount == 0 ? 0 :
      zoneCount >= 12 ? 0x0fff : uint16_t((1U << zoneCount) - 1U);
}

constexpr uint16_t nativeArmSetZone(uint16_t mask, uint8_t zoneIndex, bool armed) {
  return armed ? uint16_t(mask | nativeArmZoneBit(zoneIndex))
               : uint16_t(mask & ~nativeArmZoneBit(zoneIndex));
}

constexpr bool nativeArmZoneVisible(bool provisional, uint16_t mask, uint8_t zoneIndex) {
  return !provisional || (mask & nativeArmZoneBit(zoneIndex)) != 0;
}

constexpr bool nativeArmSafeToEnable(bool provisional, bool outputReady,
                                     bool currentLimitExplicit, uint32_t maxMilliamps,
                                     float lookBrightness, float zoneBrightness) {
  return provisional && outputReady && currentLimitExplicit &&
         maxMilliamps > 0 && maxMilliamps <= 2000 &&
         lookBrightness >= 0.0f && lookBrightness <= 0.25f &&
         zoneBrightness >= 0.0f && zoneBrightness <= 0.25f;
}

inline bool nativeArmEnvelopeValid(JsonVariantConst body) {
  JsonObjectConst command = body.as<JsonObjectConst>();
  return !command.isNull() && command.size() == 2 &&
         command["zone"].is<const char*>() &&
         command["zone"].as<const char*>()[0] != '\0' &&
         command["armNative"].is<bool>();
}
