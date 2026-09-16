#pragma once

#include <cstdint>

#include "LightweaverRecipe.h"

namespace lightweaver {

// Pure sampling helpers shared by the firmware renderer and native host tests.
// elapsedMs is literal activation-relative wall time; generic pattern speed is
// deliberately absent from this interface.
RecipeColor sampleColorJourneyBase(const NativeRecipe& recipe, uint64_t elapsedMs);
RecipeColor sampleColorJourneyPixel(const NativeRecipe& recipe, uint16_t phaseQ16,
                                    uint64_t elapsedMs);
uint64_t advanceColorJourneyElapsedMs(const NativeRecipe& recipe, uint32_t nowMs);
uint16_t sampleColorJourneyPhaseSpan(const ColorJourneyPhaseSpan& span, uint16_t offset);
uint16_t sampleColorJourneyPhase(const NativeRecipe& recipe, uint16_t physicalPixel);
void reverseColorJourneyPhaseSpan(NativeRecipe& recipe, uint16_t start, uint16_t count);

}  // namespace lightweaver
