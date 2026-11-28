#pragma once

#include <cmath>
#include <cstdint>

struct WarmFadeColor {
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

inline WarmFadeColor sampleWarmFade(uint32_t elapsedMs) {
  constexpr WarmFadeColor palette[] = {
      {232, 191, 112}, {227, 154, 89}, {200, 94, 67}, {220, 133, 79},
  };
  constexpr uint32_t stopCount = sizeof(palette) / sizeof(palette[0]);
  constexpr uint32_t stopDurationMs = 120000;
  constexpr uint32_t loopDurationMs = stopCount * stopDurationMs;
  constexpr double tau = 6.28318530717958647692;

  const uint32_t loopTime = elapsedMs % loopDurationMs;
  const uint32_t stop = loopTime / stopDurationMs;
  const WarmFadeColor& from = palette[stop];
  const WarmFadeColor& to = palette[(stop + 1) % stopCount];
  const double progress = double(loopTime % stopDurationMs) / stopDurationMs;
  const double blend = progress * progress * (3.0 - 2.0 * progress);
  const double luminance = 0.94 + 0.06 * std::cos(tau * (double(loopTime) / loopDurationMs));
  const auto channel = [blend, luminance](int a, int b) {
    return static_cast<uint8_t>(std::lround((a + (b - a) * blend) * luminance));
  };
  return {channel(from.r, to.r), channel(from.g, to.g), channel(from.b, to.b)};
}
