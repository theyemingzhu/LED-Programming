// Symmetry sides: host tests over the exact functions the card calls.
//   - continuous zones: slices rendered with a logical offset stitch into the
//     same frame one render of the whole run produces (LightweaverPatterns.cpp)
//   - mirror copy index math, stretch, flip, multi-range order
//     (LightweaverZoneSymmetry.h)
//   - mirror validation rules (LightweaverZoneSymmetry.h)
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>

#include "LightweaverPatterns.h"
#include "LightweaverZoneSymmetry.h"

KaleidoscopeSample sampleKaleidoscope(const KaleidoscopeMappingConfig*, uint16_t) {
  return KaleidoscopeSample{};
}

namespace lightweaver {
const NativeRecipe* findNativeRecipe(const char*) { return nullptr; }
}

struct TestRange {
  uint16_t start;
  uint16_t count;
};

struct TestZone {
  TestRange ranges[6];
  uint8_t rangeCount;
};

static int checks = 0;
#define CHECK(condition)                                                     \
  do {                                                                       \
    if (!(condition)) {                                                      \
      std::fprintf(stderr, "FAILED %s:%d  %s\n", __FILE__, __LINE__, #condition); \
      return false;                                                          \
    }                                                                        \
    checks++;                                                                \
  } while (0)

// A 30-pixel side made of two strips (12 + 18) must render exactly as one
// 30-pixel run: pixel 12 of the run lands on pixel 0 of the second strip.
static bool continuousIndexingSpansTwoRanges() {
  const char* patterns[] = {"aurora", "rainbow", "meteor", "chase", "sunset",
                            "ripple", "sparkle", "drift", "wave", "scanner"};
  const uint32_t now = 987654U;
  for (const char* pattern : patterns) {
    PatternModifiers mods;
    CRGB whole[30] = {};
    CRGB first[12] = {};
    CRGB second[18] = {};
    CRGB restarted[18] = {};
    CHECK(renderProceduralPattern(String(pattern), whole, 30, now, mods));

    PatternCoordinateContext firstSlice;
    firstSlice.logicalStart = 0;
    firstSlice.logicalCount = 30;
    PatternCoordinateContext secondSlice;
    secondSlice.logicalStart = 12;
    secondSlice.logicalCount = 30;
    CHECK(renderProceduralPattern(String(pattern), first, 12, now, mods, &firstSlice));
    CHECK(renderProceduralPattern(String(pattern), second, 18, now, mods, &secondSlice));
    for (uint16_t i = 0; i < 12; i++) CHECK(first[i] == whole[i]);
    for (uint16_t i = 0; i < 18; i++) CHECK(second[i] == whole[12 + i]);

    // Guard against a vacuous pass: the per-range default (each strip starts
    // its own run at 0) really does differ from the continuous run. Only for
    // gradient patterns: sparkle, chase, scanner and meteor can be uniformly
    // dark over a whole strip on any given frame.
    CHECK(renderProceduralPattern(String(pattern), restarted, 18, now, mods));
    const bool gradient = std::strcmp(pattern, "sparkle") != 0 && std::strcmp(pattern, "chase") != 0 &&
                          std::strcmp(pattern, "scanner") != 0 && std::strcmp(pattern, "meteor") != 0;
    if (gradient) {
      bool differs = false;
      for (uint16_t i = 0; i < 18; i++) differs = differs || restarted[i] != whole[12 + i];
      CHECK(differs);
    }
  }
  // No context, or a zero logicalCount, is today's behaviour exactly.
  PatternModifiers mods;
  CRGB plain[10] = {};
  CRGB zeroed[10] = {};
  PatternCoordinateContext unset;
  CHECK(renderProceduralPattern(String("rainbow"), plain, 10, 5000U, mods));
  CHECK(renderProceduralPattern(String("rainbow"), zeroed, 10, 5000U, mods, &unset));
  for (uint16_t i = 0; i < 10; i++) CHECK(plain[i] == zeroed[i]);
  return true;
}

static bool mirrorIndexMath() {
  // Equal lengths: identity, and flip is the exact reverse.
  for (uint32_t i = 0; i < 20; i++) {
    CHECK(lwMirrorSourceIndex(i, 20, 20, false) == i);
    CHECK(lwMirrorSourceIndex(i, 20, 20, true) == 19 - i);
  }
  // 24 -> 30: round(i * 23 / 29), ends pinned to the source's ends.
  const uint16_t expected[30] = {0, 1, 2, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 10, 11,
                                 12, 13, 13, 14, 15, 16, 17, 17, 18, 19, 20, 21, 21, 22, 23};
  for (uint32_t i = 0; i < 30; i++) {
    CHECK(lwMirrorSourceIndex(i, 30, 24, false) == expected[i]);
    CHECK(lwMirrorSourceIndex(i, 30, 24, true) == expected[29 - i]);
  }
  // 30 -> 24 shrinks; one-pixel target reads source 0; empty source reads 0.
  CHECK(lwMirrorSourceIndex(0, 24, 30, false) == 0);
  CHECK(lwMirrorSourceIndex(23, 24, 30, false) == 29);
  CHECK(lwMirrorSourceIndex(0, 1, 30, false) == 0);
  CHECK(lwMirrorSourceIndex(3, 10, 0, false) == 0);
  // Large pieces do not overflow the intermediate product.
  CHECK(lwMirrorSourceIndex(65534, 65535, 65535, false) == 65534);
  return true;
}

static CRGB marker(uint16_t index) {
  return CRGB(static_cast<uint8_t>(index + 1), static_cast<uint8_t>(200 - index), 7);
}

static bool mirrorCopyEqualLengths() {
  // Source side: strips [0,10) then [20,30) -> logical 0..19.
  // Target side: strips [40,55) then [60,65) -> 20 pixels.
  CRGB leds[70] = {};
  const TestRange source[2] = {{0, 10}, {20, 10}};
  const TestRange target[2] = {{40, 15}, {60, 5}};
  for (uint16_t i = 0; i < 10; i++) leds[i] = marker(i);
  for (uint16_t i = 0; i < 10; i++) leds[20 + i] = marker(10 + i);
  const CRGB untouched(9, 9, 9);
  for (uint16_t i = 55; i < 60; i++) leds[i] = untouched;
  for (uint16_t i = 65; i < 70; i++) leds[i] = untouched;

  CHECK(lwCopyMirroredZone(leds, 70, source, 2, target, 2, false) == 20);
  for (uint16_t i = 0; i < 15; i++) CHECK(leds[40 + i] == marker(i));
  for (uint16_t i = 0; i < 5; i++) CHECK(leds[60 + i] == marker(15 + i));
  // Pixels between and after the target's strips are never written.
  for (uint16_t i = 55; i < 60; i++) CHECK(leds[i] == untouched);
  for (uint16_t i = 65; i < 70; i++) CHECK(leds[i] == untouched);
  // Source untouched.
  for (uint16_t i = 0; i < 10; i++) CHECK(leds[i] == marker(i));

  CHECK(lwCopyMirroredZone(leds, 70, source, 2, target, 2, true) == 20);
  for (uint16_t i = 0; i < 15; i++) CHECK(leds[40 + i] == marker(19 - i));
  for (uint16_t i = 0; i < 5; i++) CHECK(leds[60 + i] == marker(4 - i));
  return true;
}

static bool mirrorCopyStretches24To30() {
  CRGB leds[70] = {};
  const TestRange source[1] = {{0, 24}};
  const TestRange target[2] = {{30, 12}, {45, 18}};
  for (uint16_t i = 0; i < 24; i++) leds[i] = marker(i);
  CHECK(lwCopyMirroredZone(leds, 70, source, 1, target, 2, false) == 30);
  CHECK(leds[30] == marker(0));
  CHECK(leds[45 + 17] == marker(23));
  for (uint32_t i = 0; i < 30; i++) {
    const uint16_t physical = i < 12 ? 30 + i : 45 + (i - 12);
    CHECK(leds[physical] == marker(lwMirrorSourceIndex(i, 30, 24, false)));
  }
  CHECK(lwCopyMirroredZone(leds, 70, source, 1, target, 2, true) == 30);
  CHECK(leds[30] == marker(23));
  CHECK(leds[45 + 17] == marker(0));
  return true;
}

static bool mirrorCopySkipsUnusableRanges() {
  CRGB leds[20] = {};
  const TestRange source[2] = {{0, 5}, {18, 10}};  // second range runs off the canvas
  const TestRange target[1] = {{10, 5}};
  for (uint16_t i = 0; i < 5; i++) leds[i] = marker(i);
  CHECK(lwZoneLogicalLength(source, 2, 20) == 5);
  CHECK(lwCopyMirroredZone(leds, 20, source, 2, target, 1, false) == 5);
  for (uint16_t i = 0; i < 5; i++) CHECK(leds[10 + i] == marker(i));
  const TestRange empty[1] = {{0, 0}};
  CHECK(lwCopyMirroredZone(leds, 20, empty, 1, target, 1, false) == 0);
  CRGB* noLeds = nullptr;
  CHECK(lwCopyMirroredZone(noLeds, 20, source, 2, target, 1, false) == 0);
  return true;
}

static bool validationRules() {
  // zone 0 = side-1 [0,10), zone 1 = side-2 [10,20), zone 2 = on its own [20,25),
  // zone 3 overlaps zone 0.
  const TestZone zones[4] = {
      {{{0, 10}}, 1}, {{{10, 10}}, 1}, {{{20, 5}}, 1}, {{{5, 10}}, 1}};
  uint8_t bad = 0;

  uint8_t none[4] = {LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR};
  CHECK(lwValidateZoneMirrors(zones, 4, none, bad) == LwZoneMirrorError::None);

  uint8_t valid[4] = {LW_ZONE_NO_MIRROR, 0, 0, LW_ZONE_NO_MIRROR};  // one source, two mirrors
  CHECK(lwValidateZoneMirrors(zones, 4, valid, bad) == LwZoneMirrorError::None);

  uint8_t self[4] = {LW_ZONE_NO_MIRROR, 1, LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR};
  CHECK(lwValidateZoneMirrors(zones, 4, self, bad) == LwZoneMirrorError::SelfSource);
  CHECK(bad == 1);

  uint8_t chain[4] = {LW_ZONE_NO_MIRROR, 0, 1, LW_ZONE_NO_MIRROR};  // 2 -> 1 -> 0
  CHECK(lwValidateZoneMirrors(zones, 4, chain, bad) == LwZoneMirrorError::ChainedSource);
  CHECK(bad == 2);

  uint8_t loop[4] = {1, 0, LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR};
  CHECK(lwValidateZoneMirrors(zones, 4, loop, bad) == LwZoneMirrorError::ChainedSource);

  uint8_t missing[4] = {LW_ZONE_NO_MIRROR, LW_ZONE_UNKNOWN_MIRROR, LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR};
  CHECK(lwValidateZoneMirrors(zones, 4, missing, bad) == LwZoneMirrorError::UnknownSource);
  CHECK(bad == 1);

  uint8_t outOfRange[4] = {LW_ZONE_NO_MIRROR, 9, LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR};
  CHECK(lwValidateZoneMirrors(zones, 4, outOfRange, bad) == LwZoneMirrorError::UnknownSource);

  uint8_t overlap[4] = {LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR, LW_ZONE_NO_MIRROR, 0};
  CHECK(lwValidateZoneMirrors(zones, 4, overlap, bad) == LwZoneMirrorError::OverlapsSource);
  CHECK(bad == 3);
  CHECK(std::strlen(lwZoneMirrorErrorText(LwZoneMirrorError::ChainedSource)) > 0);
  return true;
}

int main() {
  const bool ok = continuousIndexingSpansTwoRanges() && mirrorIndexMath() &&
                  mirrorCopyEqualLengths() && mirrorCopyStretches24To30() &&
                  mirrorCopySkipsUnusableRanges() && validationRules();
  if (!ok) return 1;
  std::printf("zone symmetry host tests: %d checks passed\n", checks);
  return 0;
}
