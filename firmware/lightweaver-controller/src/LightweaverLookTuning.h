#pragma once

#include <cmath>
#include <cstdint>

struct LookTuning {
  constexpr LookTuning(float brightness = 1.0f, float speed = 1.0f, int16_t hue = 0)
      : brightnessScale(brightness), speedScale(speed), hueOffset(hue) {}

  float brightnessScale;
  float speedScale;
  int16_t hueOffset;
};

inline bool lookBrightnessScaleValid(float scale) { return scale >= 0.02f && scale <= 1.0f; }
inline bool lookSpeedScaleValid(float scale) { return scale >= 0.05f && scale <= 3.0f; }
inline bool lookHueOffsetValid(int offset) { return offset >= -128 && offset <= 127; }

struct LookTuningSpeedRange {
  float min = 0.05f;
  float max = 3.0f;

  void include(float baseSpeed) {
    const float lower = 0.05f / baseSpeed;
    const float upper = 3.0f / baseSpeed;
    if (min < lower) min = lower;
    if (max > upper) max = upper;
  }

  float clamp(float scale) const {
    return scale < min ? min : scale > max ? max : scale;
  }
};

inline int16_t wrapLookHue(int16_t base, int16_t offset) {
  return int16_t(uint8_t(base + offset + 128)) - 128;
}

inline bool sameLookTuning(const LookTuning& a, const LookTuning& b) {
  return std::fabs(a.brightnessScale - b.brightnessScale) < 0.00001f &&
      std::fabs(a.speedScale - b.speedScale) < 0.00001f &&
      a.hueOffset == b.hueOffset;
}
