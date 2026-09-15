#pragma once

#include <cstddef>
#include <cstdint>

#include "LightweaverHardwareContract.h"

namespace lightweaver {

constexpr uint8_t LW_RECIPE_SCHEMA_VERSION = 1;
constexpr uint8_t LW_RECIPE_MAX_LAYERS = 3;
constexpr uint8_t LW_RECIPE_MIN_PALETTE_COLORS = 2;
constexpr uint8_t LW_RECIPE_MAX_PALETTE_COLORS = 8;
constexpr uint8_t LW_RECIPE_MAX_TRANSFORMS = 4;
constexpr uint8_t LW_RECIPE_MAX_MODULATORS = 2;
constexpr uint8_t LW_RECIPE_MAX_ID_BYTES = 64;
constexpr size_t LW_RECIPE_MAX_CONFIG_BYTES = 3968;
static_assert(LW_RECIPE_MAX_CONFIG_BYTES == LW_CARD_HARDWARE_CONFIG_CAPACITY_BYTES,
              "recipe capacity must match the generated hardware contract");
constexpr uint32_t LW_RECIPE_MAX_OPERATIONS_PER_FRAME = 250000;
constexpr uint16_t LW_RECIPE_MAX_STATE_BYTES = 2048;
constexpr uint8_t LW_RECIPE_REGISTRY_SIZE = 32;
constexpr uint8_t LW_COLOR_JOURNEY_VERSION = 1;
constexpr uint8_t LW_COLOR_JOURNEY_MIN_STOPS = 2;
constexpr uint8_t LW_COLOR_JOURNEY_MAX_STOPS = 8;
constexpr uint16_t LW_COLOR_JOURNEY_MAX_PIXELS = 256;
constexpr uint8_t LW_COLOR_JOURNEY_V2_VERSION = 2;
constexpr uint8_t LW_COLOR_JOURNEY_V3_VERSION = 3;
constexpr uint8_t LW_COLOR_JOURNEY_MAX_PHASE_SPANS = 64;
constexpr uint16_t LW_COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS = 194;
struct ColorJourneyPhaseSpan {
  uint16_t count;
  uint16_t start;
  int32_t delta;
};
static_assert(sizeof(ColorJourneyPhaseSpan) == 8, "phase spans must stay compact");

enum class NativeRecipeKind : uint8_t {
  Layered,
  ColorJourney,
};

enum class RecipeSourceNode : uint8_t {
  Solid,
  Palette,
  Wave,
  FastLedNoise,
  HashSparkle,
};

enum class RecipeBlendMode : uint8_t {
  Add,
  Max,
  Multiply,
  Crossfade,
};

enum class RecipeTransformNode : uint8_t {
  Scale,
  Offset,
  Repeat,
  Mirror,
};

enum class RecipeMaskNode : uint8_t {
  None,
  Radial,
  Linear,
};

enum class RecipeModulatorNode : uint8_t {
  Lfo,
  NoiseClock,
};

enum class RecipeParseErrorCode : uint8_t {
  None,
  InvalidType,
  InvalidValue,
  UnsupportedVersion,
  UnsupportedNode,
  UnsupportedLiveInput,
  BakeOnly,
  LimitExceeded,
};

struct RecipeParseError {
  RecipeParseErrorCode code = RecipeParseErrorCode::None;
  const char* path = nullptr;
  const char* message = nullptr;
};

struct RecipeColor {
  uint8_t red = 0;
  uint8_t green = 0;
  uint8_t blue = 0;
};

struct ColorJourneyStop {
  RecipeColor color;
  uint32_t holdMs = 0;
  uint32_t fadeMs = 1000;
};

struct ColorJourneyRecipe {
  uint8_t version = LW_COLOR_JOURNEY_VERSION;
  ColorJourneyStop stops[LW_COLOR_JOURNEY_MAX_STOPS];
  uint8_t stopCount = 0;
  bool smooth = false;
  bool loop = true;
  uint32_t motionSpeedMs = 18000;
  float depth = 0.25f;
  uint16_t phaseCount = 0;
  uint8_t phaseSpanCount = 0;
};

struct RecipeTransform {
  RecipeTransformNode node = RecipeTransformNode::Scale;
  float amount = 1.0f;
};

struct RecipeModulator {
  RecipeModulatorNode node = RecipeModulatorNode::Lfo;
  uint32_t seed = 1;
  float rate = 0.1f;
  float depth = 0.0f;
  float offset = 0.5f;
};

struct NativeRecipeLayer {
  RecipeSourceNode source = RecipeSourceNode::Solid;
  RecipeBlendMode blend = RecipeBlendMode::Crossfade;
  RecipeMaskNode mask = RecipeMaskNode::None;
  uint8_t colorIndex = 0;
  float frequency = 1.0f;
  float speed = 0.1f;
  float phase = 0.0f;
  float scale = 1.0f;
  float density = 0.08f;
  float brightness = 1.0f;
  float opacity = 1.0f;
  bool thresholdEnabled = false;
  float threshold = 0.0f;
  float maskCenter = 0.5f;
  float maskRadius = 0.5f;
  float maskSoftness = 0.0f;
  float maskStart = 0.0f;
  float maskEnd = 1.0f;
  RecipeTransform transforms[LW_RECIPE_MAX_TRANSFORMS];
  uint8_t transformCount = 0;
  RecipeModulator modulators[LW_RECIPE_MAX_MODULATORS];
  uint8_t modulatorCount = 0;
};

struct NativeRecipe {
  NativeRecipe() : layers{} {}
  uint8_t version = LW_RECIPE_SCHEMA_VERSION;
  NativeRecipeKind kind = NativeRecipeKind::Layered;
  char id[LW_RECIPE_MAX_ID_BYTES + 1] = {};
  uint32_t seed = 1;
  RecipeColor palette[LW_RECIPE_MAX_PALETTE_COLORS];
  uint8_t paletteCount = 0;
  // Layer recipes and journey phases are mutually exclusive wire kinds. Their
  // largest fixed arrays share storage so 32 looks/config copies do not each
  // pay for both representations.
  union {
    NativeRecipeLayer layers[LW_RECIPE_MAX_LAYERS];
    uint16_t colorJourneyPhases[LW_COLOR_JOURNEY_MAX_PIXELS];
    ColorJourneyPhaseSpan colorJourneyPhaseSpans[LW_COLOR_JOURNEY_MAX_PHASE_SPANS];
  };
  uint8_t layerCount = 0;
  uint32_t estimatedOperationsPerFrame = 0;
  uint16_t estimatedStateBytes = 0;
  ColorJourneyRecipe colorJourney;
  // RAM-only activation clock. The 64-bit elapsed value is advanced from
  // uint32 tick deltas, so millis() rollover never restarts a journey.
  mutable uint64_t activationElapsedMs = 0;
  mutable uint32_t activationLastTickMs = 0;
};

void clearNativeRecipes();
bool registerNativeRecipe(const char* routeId, const NativeRecipe& recipe);
const NativeRecipe* findNativeRecipe(const char* routeId);
bool restartNativeRecipe(const char* routeId, uint32_t nowMs);

// Keep the fixed recipe data model usable by host-side tests which include
// LightweaverTypes.h with only Arduino/FastLED stubs. JSON boundary functions
// are declared when the caller has explicitly included ArduinoJson first.
#if defined(ARDUINOJSON_VERSION_MAJOR)
bool parseNativeRecipeV1(
    JsonVariantConst value,
    size_t serializedBytes,
    NativeRecipe& destination,
    RecipeParseError& error,
    uint16_t expectedPixels = 0);
bool writeNativeRecipeJson(JsonObject destination, const NativeRecipe& recipe);
void writeNativeRecipeCapabilities(
    JsonObject destination,
    const char* firmwareVersion,
    const char* buildId);
#endif

}  // namespace lightweaver
