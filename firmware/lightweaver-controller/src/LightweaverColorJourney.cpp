#include "LightweaverColorJourney.h"

#include <cmath>

namespace lightweaver {
namespace {

uint8_t mixChannel(uint8_t from, uint8_t to, float amount) {
  return static_cast<uint8_t>(std::floor(
      static_cast<float>(from) +
      (static_cast<float>(to) - static_cast<float>(from)) * amount + 0.5f));
}

RecipeColor mixColor(const RecipeColor& from, const RecipeColor& to, float amount) {
  RecipeColor mixed;
  mixed.red = mixChannel(from.red, to.red, amount);
  mixed.green = mixChannel(from.green, to.green, amount);
  mixed.blue = mixChannel(from.blue, to.blue, amount);
  return mixed;
}

uint8_t scaleChannel(uint8_t channel, float intensity) {
  return static_cast<uint8_t>(std::floor(static_cast<float>(channel) * intensity + 0.5f));
}

}  // namespace

RecipeColor sampleColorJourneyBase(const NativeRecipe& recipe, uint64_t elapsedMs) {
  const ColorJourneyRecipe& journey = recipe.colorJourney;
  if (recipe.kind != NativeRecipeKind::ColorJourney || journey.stopCount == 0) {
    return RecipeColor{};
  }

  uint32_t durationMs = 0;
  for (uint8_t index = 0; index < journey.stopCount; index++) {
    durationMs += journey.stops[index].holdMs;
    if (journey.loop || index + 1 < journey.stopCount) {
      durationMs += journey.stops[index].fadeMs;
    }
  }
  if (durationMs == 0) return journey.stops[0].color;
  const uint32_t time = journey.loop
      ? static_cast<uint32_t>(elapsedMs % durationMs)
      : static_cast<uint32_t>(elapsedMs < durationMs ? elapsedMs : durationMs);
  uint32_t cursor = 0;
  for (uint8_t index = 0; index < journey.stopCount; index++) {
    const ColorJourneyStop& stop = journey.stops[index];
    if (!journey.loop && index + 1 == journey.stopCount) return stop.color;
    const uint32_t holdEnd = cursor + stop.holdMs;
    const uint32_t fadeEnd = holdEnd + stop.fadeMs;
    if (time < holdEnd) return stop.color;
    if (time < fadeEnd || index + 1 == journey.stopCount) {
      float amount = static_cast<float>(time - holdEnd) /
                     static_cast<float>(stop.fadeMs);
      if (amount < 0.0f) amount = 0.0f;
      if (amount > 1.0f) amount = 1.0f;
      if (journey.smooth) amount = amount * amount * (3.0f - 2.0f * amount);
      const RecipeColor& next = journey.stops[(index + 1) % journey.stopCount].color;
      return mixColor(stop.color, next, amount);
    }
    cursor = fadeEnd;
  }
  return journey.stops[journey.stopCount - 1].color;
}

RecipeColor sampleColorJourneyPixel(const NativeRecipe& recipe, uint16_t phaseQ16,
                                    uint64_t elapsedMs) {
  RecipeColor base = sampleColorJourneyBase(recipe, elapsedMs);
  const ColorJourneyRecipe& journey = recipe.colorJourney;
  if (recipe.kind != NativeRecipeKind::ColorJourney || journey.motionSpeedMs == 0) return base;
  constexpr float kTau = 6.28318530717958647692f;
  const float phase = static_cast<float>(phaseQ16) / 65536.0f;
  const float motion = static_cast<float>(elapsedMs % journey.motionSpeedMs) /
                       static_cast<float>(journey.motionSpeedMs);
  const float intensity = 1.0f - journey.depth *
      (0.5f + 0.5f * std::sin((phase - motion) * kTau));
  RecipeColor scaled;
  scaled.red = scaleChannel(base.red, intensity);
  scaled.green = scaleChannel(base.green, intensity);
  scaled.blue = scaleChannel(base.blue, intensity);
  return scaled;
}

uint64_t advanceColorJourneyElapsedMs(const NativeRecipe& recipe, uint32_t nowMs) {
  const uint32_t delta = nowMs - recipe.activationLastTickMs;
  recipe.activationLastTickMs = nowMs;
  recipe.activationElapsedMs += static_cast<uint64_t>(delta);
  return recipe.activationElapsedMs;
}

void reverseColorJourneyPhaseSpan(NativeRecipe& recipe, uint16_t start, uint16_t count) {
  if (recipe.kind != NativeRecipeKind::ColorJourney || count < 2 ||
      start >= recipe.colorJourney.phaseCount ||
      static_cast<uint32_t>(start) + count > recipe.colorJourney.phaseCount) return;
  for (uint16_t offset = 0; offset < count / 2; offset++) {
    const uint16_t left = start + offset;
    const uint16_t right = start + count - 1U - offset;
    const uint16_t phase = recipe.colorJourneyPhases[left];
    recipe.colorJourneyPhases[left] = recipe.colorJourneyPhases[right];
    recipe.colorJourneyPhases[right] = phase;
  }
}

}  // namespace lightweaver
