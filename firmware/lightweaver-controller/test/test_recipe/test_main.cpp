#include <ArduinoJson.h>
#include <unity.h>

#include <cmath>
#include <cstring>

#include "LightweaverRecipe.h"
#include "LightweaverColorJourney.h"

namespace {

using lightweaver::NativeRecipe;
using lightweaver::RecipeParseError;
using lightweaver::RecipeParseErrorCode;

const char* kValidRecipe = R"json({
  "version": 1,
  "id": "native-dawn",
  "seed": 42,
  "palette": ["#12051f", "#ff6b35", "#ffe7a0"],
  "estimates": {"operationsPerFrame": 4200, "stateBytes": 96},
  "requirements": [{"capability": "time", "required": true}],
  "layers": [{
    "source": {"node": "wave", "frequency": 2.5, "speed": 0.2, "phase": 0.1},
    "transforms": [
      {"node": "scale", "amount": 1.5},
      {"node": "offset", "amount": 0.1},
      {"node": "repeat", "count": 3},
      {"node": "mirror"}
    ],
    "mask": {"node": "radial-mask", "center": 0.5, "radius": 0.45, "softness": 0.1},
    "threshold": 0.15,
    "blend": "add",
    "opacity": 0.8,
    "modulators": [
      {"node": "lfo", "seed": 7, "rate": 0.08, "depth": 0.3, "offset": 0.5},
      {"node": "noise-clock", "seed": 9, "rate": 0.03, "depth": 0.2, "offset": 0.4}
    ]
  }]
})json";

bool parseText(const char* json, NativeRecipe& destination, RecipeParseError& error,
               size_t reportedBytes = 0) {
  JsonDocument doc;
  const DeserializationError jsonError = deserializeJson(doc, json);
  TEST_ASSERT_FALSE_MESSAGE(jsonError, jsonError.c_str());
  return lightweaver::parseNativeRecipeV1(
      doc.as<JsonVariantConst>(),
      reportedBytes == 0 ? measureJson(doc) : reportedBytes,
      destination,
      error);
}

void expectRejected(const char* json, RecipeParseErrorCode code, const char* path) {
  NativeRecipe destination;
  destination.version = 99;
  destination.seed = 0xdeadbeef;
  RecipeParseError error;
  TEST_ASSERT_FALSE(parseText(json, destination, error));
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(code), static_cast<uint8_t>(error.code));
  TEST_ASSERT_EQUAL_STRING(path, error.path);
  TEST_ASSERT_EQUAL_UINT8(99, destination.version);
  TEST_ASSERT_EQUAL_UINT32(0xdeadbeef, destination.seed);
}

}  // namespace

void test_parses_complete_bounded_v1_recipe() {
  NativeRecipe recipe;
  RecipeParseError error;
  TEST_ASSERT_TRUE(parseText(kValidRecipe, recipe, error));
  TEST_ASSERT_EQUAL_UINT8(1, recipe.version);
  TEST_ASSERT_EQUAL_STRING("native-dawn", recipe.id);
  TEST_ASSERT_EQUAL_UINT32(42, recipe.seed);
  TEST_ASSERT_EQUAL_UINT8(3, recipe.paletteCount);
  TEST_ASSERT_EQUAL_UINT8(1, recipe.layerCount);
  TEST_ASSERT_EQUAL_UINT8(4, recipe.layers[0].transformCount);
  TEST_ASSERT_EQUAL_UINT8(2, recipe.layers[0].modulatorCount);
  TEST_ASSERT_EQUAL_UINT32(4200, recipe.estimatedOperationsPerFrame);
  TEST_ASSERT_EQUAL_UINT16(96, recipe.estimatedStateBytes);
  TEST_ASSERT_EQUAL_UINT8(
      static_cast<uint8_t>(lightweaver::RecipeSourceNode::Wave),
      static_cast<uint8_t>(recipe.layers[0].source));
  TEST_ASSERT_EQUAL_UINT8(
      static_cast<uint8_t>(lightweaver::RecipeBlendMode::Add),
      static_cast<uint8_t>(recipe.layers[0].blend));
  TEST_ASSERT_EQUAL_UINT8(
      static_cast<uint8_t>(lightweaver::RecipeMaskNode::Radial),
      static_cast<uint8_t>(recipe.layers[0].mask));
  TEST_ASSERT_EQUAL_UINT8(
      static_cast<uint8_t>(RecipeParseErrorCode::None),
      static_cast<uint8_t>(error.code));
}

void test_rejects_unknown_version_and_nodes() {
  expectRejected(
      R"({"version":2,"id":"future","palette":["#000000","#ffffff"],"layers":[]})",
      RecipeParseErrorCode::UnsupportedVersion,
      "recipe.version");
  expectRejected(
      R"({"version":1,"id":"bad-source","palette":["#000000","#ffffff"],"layers":[{"source":{"node":"voronoi"}}]})",
      RecipeParseErrorCode::UnsupportedNode,
      "recipe.layers[].source.node");
  expectRejected(
      R"({"version":1,"id":"bad-transform","palette":["#000000","#ffffff"],"layers":[{"source":{"node":"solid"},"transforms":[{"node":"rotate"}]}]})",
      RecipeParseErrorCode::UnsupportedNode,
      "recipe.layers[].transforms[].node");
  expectRejected(
      R"({"version":1,"id":"bad-mask","palette":["#000000","#ffffff"],"layers":[{"source":{"node":"solid"},"mask":{"node":"path-distance"}}]})",
      RecipeParseErrorCode::UnsupportedNode,
      "recipe.layers[].mask.node");
  expectRejected(
      R"({"version":1,"id":"bad-mod","palette":["#000000","#ffffff"],"layers":[{"source":{"node":"solid"},"modulators":[{"node":"beat"}]}]})",
      RecipeParseErrorCode::UnsupportedNode,
      "recipe.layers[].modulators[].node");
}

void test_rejects_resource_limit_violations() {
  expectRejected(
      R"({"version":1,"id":"layers","palette":["#000000","#ffffff"],"layers":[{"source":{"node":"solid"}},{"source":{"node":"solid"}},{"source":{"node":"solid"}},{"source":{"node":"solid"}}]})",
      RecipeParseErrorCode::LimitExceeded,
      "recipe.layers");
  expectRejected(
      R"({"version":1,"id":"ops","palette":["#000000","#ffffff"],"estimates":{"operationsPerFrame":250001},"layers":[]})",
      RecipeParseErrorCode::LimitExceeded,
      "recipe.estimates.operationsPerFrame");
  expectRejected(
      R"({"version":1,"id":"state","palette":["#000000","#ffffff"],"estimates":{"stateBytes":2049},"layers":[]})",
      RecipeParseErrorCode::LimitExceeded,
      "recipe.estimates.stateBytes");

  NativeRecipe destination;
  destination.version = 77;
  RecipeParseError error;
  TEST_ASSERT_FALSE(parseText(kValidRecipe, destination, error,
                              lightweaver::LW_RECIPE_MAX_CONFIG_BYTES + 1));
  TEST_ASSERT_EQUAL_UINT8(
      static_cast<uint8_t>(RecipeParseErrorCode::LimitExceeded),
      static_cast<uint8_t>(error.code));
  TEST_ASSERT_EQUAL_STRING("recipe", error.path);
  TEST_ASSERT_EQUAL_UINT8(77, destination.version);
}

void test_rejects_invalid_palette_sizes_and_colors() {
  expectRejected(
      R"({"version":1,"id":"one","palette":["#000000"],"layers":[]})",
      RecipeParseErrorCode::InvalidValue,
      "recipe.palette");
  expectRejected(
      R"({"version":1,"id":"nine","palette":["#000000","#111111","#222222","#333333","#444444","#555555","#666666","#777777","#888888"],"layers":[]})",
      RecipeParseErrorCode::InvalidValue,
      "recipe.palette");
  expectRejected(
      R"({"version":1,"id":"color","palette":["#000000","red"],"layers":[]})",
      RecipeParseErrorCode::InvalidValue,
      "recipe.palette[]");
}

void test_rejects_non_finite_and_out_of_range_parameters() {
  expectRejected(
      R"({"version":1,"id":"range","palette":["#000000","#ffffff"],"layers":[{"source":{"node":"wave","frequency":33}}]})",
      RecipeParseErrorCode::InvalidValue,
      "recipe.layers[].source.frequency");

  JsonDocument doc;
  TEST_ASSERT_FALSE(deserializeJson(
      doc,
      R"({"version":1,"id":"nan","palette":["#000000","#ffffff"],"layers":[{"source":{"node":"wave"}}]})"));
  doc["layers"][0]["source"]["frequency"] = NAN;
  NativeRecipe destination;
  destination.version = 55;
  RecipeParseError error;
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(
      doc.as<JsonVariantConst>(), measureJson(doc), destination, error));
  TEST_ASSERT_EQUAL_UINT8(
      static_cast<uint8_t>(RecipeParseErrorCode::InvalidValue),
      static_cast<uint8_t>(error.code));
  TEST_ASSERT_EQUAL_STRING("recipe.layers[].source.frequency", error.path);
  TEST_ASSERT_EQUAL_UINT8(55, destination.version);
}

void test_rejects_bake_only_and_live_inputs() {
  for (const char* node : {"particles", "reaction-diffusion", "graph", "shader", "audio"}) {
    JsonDocument doc;
    doc["version"] = 1;
    doc["id"] = "bake-only";
    doc["palette"].add("#000000");
    doc["palette"].add("#ffffff");
    doc["layers"][0]["source"]["node"] = node;
    NativeRecipe recipe;
    RecipeParseError error;
    TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(
        doc.as<JsonVariantConst>(), measureJson(doc), recipe, error));
    TEST_ASSERT_EQUAL_UINT8(
        static_cast<uint8_t>(RecipeParseErrorCode::BakeOnly),
        static_cast<uint8_t>(error.code));
  }
  expectRejected(
      R"({"version":1,"id":"live","palette":["#000000","#ffffff"],"requirements":[{"capability":"live-audio","required":true}],"layers":[]})",
      RecipeParseErrorCode::UnsupportedLiveInput,
      "recipe.requirements[].capability");
  expectRejected(
      R"({"version":1,"id":"unknown","palette":["#000000","#ffffff"],"requirements":[{"capability":"future-sensor","required":true}],"layers":[]})",
      RecipeParseErrorCode::UnsupportedLiveInput,
      "recipe.requirements[].capability");
  expectRejected(
      R"({"version":1,"id":"malformed","palette":["#000000","#ffffff"],"requirements":[{"required":true}],"layers":[]})",
      RecipeParseErrorCode::InvalidType,
      "recipe.requirements[].capability");
  expectRejected(
      R"({"version":1,"id":"malformed-required","palette":["#000000","#ffffff"],"requirements":[{"capability":"time","required":"yes"}],"layers":[]})",
      RecipeParseErrorCode::InvalidType,
      "recipe.requirements[].required");
}

void test_capability_descriptor_is_versioned_and_bounded() {
  JsonDocument doc;
  lightweaver::writeNativeRecipeCapabilities(
      doc.to<JsonObject>(), "1.2.3", "build-abc");
  TEST_ASSERT_EQUAL_UINT8(1, doc["version"].as<uint8_t>());
  TEST_ASSERT_EQUAL_UINT8(1, doc["schemaVersions"][0].as<uint8_t>());
  TEST_ASSERT_EQUAL_STRING("1.2.3", doc["firmwareVersion"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING("build-abc", doc["buildId"].as<const char*>());
  TEST_ASSERT_EQUAL_UINT8(lightweaver::LW_RECIPE_MAX_LAYERS,
                          doc["maxLayers"].as<uint8_t>());
  TEST_ASSERT_EQUAL_UINT32(lightweaver::LW_RECIPE_MAX_CONFIG_BYTES,
                           doc["maxConfigBytes"].as<uint32_t>());
  TEST_ASSERT_EQUAL_UINT32(lightweaver::LW_RECIPE_MAX_OPERATIONS_PER_FRAME,
                           doc["maxOperationsPerFrame"].as<uint32_t>());
  TEST_ASSERT_EQUAL_UINT16(lightweaver::LW_RECIPE_MAX_STATE_BYTES,
                           doc["maxEstimatedStateBytes"].as<uint16_t>());
  TEST_ASSERT_FALSE(doc["physicalParityVerified"].as<bool>());
  TEST_ASSERT_EQUAL_UINT8(12, doc["supportedNodes"].size());
  TEST_ASSERT_EQUAL_UINT8(4, doc["supportedBlends"].size());
  TEST_ASSERT_EQUAL_UINT8(2, doc["supportedModulators"].size());
}

void test_registry_is_additive_bounded_and_resettable() {
  NativeRecipe recipe;
  RecipeParseError error;
  TEST_ASSERT_TRUE(parseText(kValidRecipe, recipe, error));
  lightweaver::clearNativeRecipes();
  TEST_ASSERT_NULL(lightweaver::findNativeRecipe("aurora"));
  TEST_ASSERT_TRUE(lightweaver::registerNativeRecipe("native-dawn", recipe));
  const NativeRecipe* found = lightweaver::findNativeRecipe("native-dawn");
  TEST_ASSERT_NOT_NULL(found);
  TEST_ASSERT_EQUAL_UINT32(42, found->seed);
  TEST_ASSERT_NULL(lightweaver::findNativeRecipe("not-registered"));
  lightweaver::clearNativeRecipes();
  TEST_ASSERT_NULL(lightweaver::findNativeRecipe("native-dawn"));
}

const char* kValidColorJourney = R"json({
  "version":1,
  "kind":"color-journey",
  "id":"gallery-dawn",
  "journey":{
    "version":1,
    "stops":[
      {"color":"#ff0000","holdMs":1000,"fadeMs":2000},
      {"color":"#00ff00","holdMs":0,"fadeMs":1000},
      {"color":"#0000ff","holdMs":1500,"fadeMs":3000}
    ],
    "easing":"linear",
    "loop":true,
    "restart":"restart",
    "motionSpeedMs":18000,
    "depth":0.25,
    "phase16":"0000599a8333"
  }
})json";

bool parseJourney(const char* json, uint16_t expectedPixels, NativeRecipe& destination,
                  RecipeParseError& error, size_t reportedBytes = 0) {
  JsonDocument doc;
  const DeserializationError jsonError = deserializeJson(doc, json);
  TEST_ASSERT_FALSE_MESSAGE(jsonError, jsonError.c_str());
  return lightweaver::parseNativeRecipeV1(
      doc.as<JsonVariantConst>(),
      reportedBytes == 0 ? measureJson(doc) : reportedBytes,
      destination, error, expectedPixels);
}

void test_parses_strict_color_journey_and_capability() {
  NativeRecipe recipe;
  RecipeParseError error;
  TEST_ASSERT_TRUE(parseJourney(kValidColorJourney, 3, recipe, error));
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(lightweaver::NativeRecipeKind::ColorJourney),
                          static_cast<uint8_t>(recipe.kind));
  TEST_ASSERT_EQUAL_UINT8(3, recipe.colorJourney.stopCount);
  TEST_ASSERT_EQUAL_UINT16(0x0000, recipe.colorJourneyPhases[0]);
  TEST_ASSERT_EQUAL_UINT16(0x599a, recipe.colorJourneyPhases[1]);
  TEST_ASSERT_EQUAL_UINT16(0x8333, recipe.colorJourneyPhases[2]);
  lightweaver::clearNativeRecipes();
  TEST_ASSERT_TRUE(lightweaver::registerNativeRecipe("gallery-dawn", recipe));
  TEST_ASSERT_TRUE(lightweaver::restartNativeRecipe("gallery-dawn", 0xfffffff0U));
  TEST_ASSERT_EQUAL_UINT32(0xfffffff0U,
      lightweaver::findNativeRecipe("gallery-dawn")->activationLastTickMs);
  TEST_ASSERT_EQUAL_UINT64(0,
      lightweaver::findNativeRecipe("gallery-dawn")->activationElapsedMs);

  JsonDocument doc;
  lightweaver::writeNativeRecipeCapabilities(doc.to<JsonObject>(), "1", "b");
  JsonObject journey = doc["colorJourney"];
  TEST_ASSERT_EQUAL_UINT8(1, journey["version"].as<uint8_t>());
  TEST_ASSERT_EQUAL_UINT16(256, journey["maxPixels"].as<uint16_t>());
  TEST_ASSERT_EQUAL_STRING("q0.16-hex", journey["phaseEncoding"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING("restart", journey["restart"].as<const char*>());
  JsonObject v2 = doc["colorJourneyV2"];
  TEST_ASSERT_EQUAL_UINT8(2, v2["version"].as<uint8_t>());
  TEST_ASSERT_EQUAL_UINT16(65535, v2["maxPixels"].as<uint16_t>());
  TEST_ASSERT_EQUAL_UINT8(64, v2["maxPhaseSpans"].as<uint8_t>());
  TEST_ASSERT_EQUAL_STRING("q0.16-affine", v2["phaseEncoding"].as<const char*>());
}

void test_rejects_color_journey_boundaries_without_mutating_destination() {
  NativeRecipe destination;
  destination.version = 77;
  destination.seed = 0xdecafbad;
  RecipeParseError error;
  TEST_ASSERT_FALSE(parseJourney(kValidColorJourney, 2, destination, error));
  TEST_ASSERT_EQUAL_STRING("recipe.journey.phase16", error.path);
  TEST_ASSERT_EQUAL_UINT8(77, destination.version);
  TEST_ASSERT_EQUAL_UINT32(0xdecafbad, destination.seed);

  TEST_ASSERT_FALSE(parseJourney(
      R"({"version":1,"kind":"color-journey","id":"bad","journey":{"version":1,"stops":[{"color":"#000000","holdMs":0,"fadeMs":999},{"color":"#ffffff","holdMs":0,"fadeMs":1000}],"easing":"smooth","loop":false,"restart":"restart","motionSpeedMs":4000,"depth":0.12,"phase16":"0000"}})",
      1, destination, error));
  TEST_ASSERT_EQUAL_STRING("recipe.journey.stops[].fadeMs", error.path);
  TEST_ASSERT_EQUAL_UINT8(77, destination.version);

  TEST_ASSERT_FALSE(parseJourney(
      R"({"version":1,"kind":"color-journey","id":"bad","journey":{"version":1,"stops":[{"color":"#000000","holdMs":0,"fadeMs":1000},{"color":"#ffffff","holdMs":0,"fadeMs":1000}],"easing":"smooth","loop":false,"restart":"resume","motionSpeedMs":4000,"depth":0.12,"phase16":"0000"}})",
      1, destination, error));
  TEST_ASSERT_EQUAL_STRING("recipe.journey.restart", error.path);

  TEST_ASSERT_FALSE(parseJourney(kValidColorJourney, 257, destination, error));
  TEST_ASSERT_EQUAL_STRING("recipe.journey.phase16", error.path);

  JsonDocument composite;
  TEST_ASSERT_FALSE(deserializeJson(composite, kValidColorJourney));
  composite["layers"].to<JsonArray>();
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(
      composite.as<JsonVariantConst>(), measureJson(composite), destination, error, 3));
  TEST_ASSERT_EQUAL_STRING("recipe.kind", error.path);
  TEST_ASSERT_EQUAL_UINT8(77, destination.version);
}

void test_samples_color_journey_timing_easing_and_motion() {
  NativeRecipe recipe;
  RecipeParseError error;
  TEST_ASSERT_TRUE(parseJourney(kValidColorJourney, 3, recipe, error));

  lightweaver::RecipeColor color = lightweaver::sampleColorJourneyBase(recipe, 1500);
  TEST_ASSERT_EQUAL_UINT8(191, color.red);
  TEST_ASSERT_EQUAL_UINT8(64, color.green);
  TEST_ASSERT_EQUAL_UINT8(0, color.blue);
  color = lightweaver::sampleColorJourneyPixel(recipe, 0x0000, 0);
  TEST_ASSERT_EQUAL_UINT8(223, color.red);
  TEST_ASSERT_EQUAL_UINT8(0, color.green);
  TEST_ASSERT_EQUAL_UINT8(0, color.blue);
  color = lightweaver::sampleColorJourneyPixel(recipe, 0x599a, 1500);
  TEST_ASSERT_UINT8_WITHIN(1, 143, color.red);
  TEST_ASSERT_UINT8_WITHIN(1, 48, color.green);
  TEST_ASSERT_EQUAL_UINT8(0, color.blue);

  lightweaver::reverseColorJourneyPhaseSpan(recipe, 0, 3);
  TEST_ASSERT_EQUAL_UINT16(0x8333, recipe.colorJourneyPhases[0]);
  TEST_ASSERT_EQUAL_UINT16(0x599a, recipe.colorJourneyPhases[1]);
  TEST_ASSERT_EQUAL_UINT16(0x0000, recipe.colorJourneyPhases[2]);
}

void test_rejected_journey_candidate_preserves_active_registry() {
  NativeRecipe active;
  RecipeParseError error;
  TEST_ASSERT_TRUE(parseJourney(kValidColorJourney, 3, active, error));
  lightweaver::clearNativeRecipes();
  TEST_ASSERT_TRUE(lightweaver::registerNativeRecipe("gallery-dawn", active));
  TEST_ASSERT_TRUE(lightweaver::restartNativeRecipe("gallery-dawn", 4242));

  // Config transactions validate into a separate destination before storage or
  // registry synchronization. Both a truncated body and a budget-rejected body
  // leave the active registered recipe and its activation epoch untouched.
  JsonDocument truncated;
  TEST_ASSERT_TRUE(deserializeJson(truncated, "{\"version\":1,\"kind\":\"color-journey\""));
  NativeRecipe candidate;
  candidate.version = 99;
  TEST_ASSERT_FALSE(parseJourney(kValidColorJourney, 3, candidate, error,
                                 lightweaver::LW_RECIPE_MAX_CONFIG_BYTES + 1));
  TEST_ASSERT_EQUAL_UINT8(99, candidate.version);
  const NativeRecipe* stillActive = lightweaver::findNativeRecipe("gallery-dawn");
  TEST_ASSERT_NOT_NULL(stillActive);
  TEST_ASSERT_EQUAL_UINT32(4242, stillActive->activationLastTickMs);
  TEST_ASSERT_EQUAL_UINT64(0, stillActive->activationElapsedMs);
  TEST_ASSERT_EQUAL_UINT16(0x599a, stillActive->colorJourneyPhases[1]);
}

void test_journey_clock_crosses_millis_rollover_without_restarting() {
  NativeRecipe looped;
  RecipeParseError error;
  TEST_ASSERT_TRUE(parseJourney(kValidColorJourney, 3, looped, error));
  lightweaver::clearNativeRecipes();
  TEST_ASSERT_TRUE(lightweaver::registerNativeRecipe("long-running", looped));
  TEST_ASSERT_TRUE(lightweaver::restartNativeRecipe("long-running", 0U));
  const NativeRecipe* active = lightweaver::findNativeRecipe("long-running");
  TEST_ASSERT_NOT_NULL(active);
  TEST_ASSERT_EQUAL_UINT64(UINT32_MAX,
      lightweaver::advanceColorJourneyElapsedMs(*active, UINT32_MAX));
  TEST_ASSERT_EQUAL_UINT64(1ULL << 32,
      lightweaver::advanceColorJourneyElapsedMs(*active, 0U));
  TEST_ASSERT_EQUAL_UINT64(1ULL << 32,
      lightweaver::advanceColorJourneyElapsedMs(*active, 0U));

  const lightweaver::RecipeColor continued =
      lightweaver::sampleColorJourneyPixel(*active, 0x599a, 1ULL << 32);
  const lightweaver::RecipeColor restarted =
      lightweaver::sampleColorJourneyPixel(*active, 0x599a, 0);
  TEST_ASSERT_TRUE(continued.red != restarted.red || continued.green != restarted.green ||
                   continued.blue != restarted.blue);

  NativeRecipe once;
  TEST_ASSERT_TRUE(parseJourney(
      R"({"version":1,"kind":"color-journey","id":"once","journey":{"version":1,"stops":[{"color":"#ff0000","holdMs":0,"fadeMs":1000},{"color":"#0000ff","holdMs":0,"fadeMs":1000}],"easing":"smooth","loop":false,"restart":"restart","motionSpeedMs":18000,"depth":0.25,"phase16":"0000"}})",
      1, once, error));
  const lightweaver::RecipeColor final =
      lightweaver::sampleColorJourneyBase(once, (1ULL << 32) + 5000ULL);
  TEST_ASSERT_EQUAL_UINT8(0, final.red);
  TEST_ASSERT_EQUAL_UINT8(0, final.green);
  TEST_ASSERT_EQUAL_UINT8(255, final.blue);
}

void test_v2_rejects_malformed_spans_and_preserves_destination() {
  const char* cases[] = {"[]", "[[0,0,0]]", "[[1,0,1]]", "[[1,-1,0]]", "[[1,65536,0]]",
    "[[1,0,0,0]]", "[[1.5,0,0]]", "[[1,0.5,0]]", "[[2,0,0.5]]", "[[2,0,32769]]",
    "[[2,0,-32769]]", "[[65536,0,0]]", "[[65535,0,2147483648]]", "[[65535,0,-2147483649]]",
    "[[65535,0,0],[1,0,0]]", "[{}]", "null", "[[true,0,0]]"};
  for (const char* phases : cases) {
    JsonDocument doc, values;
    TEST_ASSERT_FALSE(deserializeJson(doc, kValidColorJourney));
    TEST_ASSERT_FALSE(deserializeJson(values, phases));
    doc["journey"]["version"] = 2;
    doc["journey"].remove("phase16");
    doc["journey"]["phases"].set(values.as<JsonVariantConst>());
    NativeRecipe destination;
    destination.version = 77;
    RecipeParseError error;
    uint32_t expected = 0;
    for (JsonVariantConst span : values.as<JsonArrayConst>()) expected += span[0].as<uint32_t>();
    if (!expected || expected > 65535) expected = 65535;
    TEST_ASSERT_FALSE_MESSAGE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), destination, error, expected), phases);
    TEST_ASSERT_EQUAL_UINT8(77, destination.version);
  }
  JsonDocument doc;
  TEST_ASSERT_FALSE(deserializeJson(doc, kValidColorJourney));
  doc["journey"]["version"] = 2;
  doc["journey"].remove("phase16");
  JsonArray spans = doc["journey"]["phases"].to<JsonArray>();
  for (unsigned i = 0; i < 65; ++i) {
    JsonArray span = spans.add<JsonArray>(); span.add(1); span.add(i); span.add(0);
  }
  NativeRecipe recipe;
  RecipeParseError error;
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 65));
  spans.remove(64);
  TEST_ASSERT_TRUE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 64));
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 63));
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 65));
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 0));
  doc["journey"]["phase16"] = "0000";
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 64));
  doc["journey"]["version"] = 1;
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 1));
}

void test_v2_affine_journey_capacity_and_rejection() {
  JsonDocument doc;
  TEST_ASSERT_FALSE(deserializeJson(doc, kValidColorJourney));
  doc["journey"]["version"] = 2;
  doc["journey"].remove("phase16");
  JsonArray spans = doc["journey"]["phases"].to<JsonArray>();
  JsonArray span = spans.add<JsonArray>();
  span.add(65535); span.add(65535); span.add(-2147418112);
  NativeRecipe recipe;
  RecipeParseError error;
  TEST_ASSERT_TRUE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 65535));
  TEST_ASSERT_EQUAL_UINT8(2, recipe.colorJourney.version);
  TEST_ASSERT_EQUAL_UINT16(65535, recipe.colorJourney.phaseCount);
  span[2] = -2147418113LL;
  recipe.version = 77;
  TEST_ASSERT_FALSE(lightweaver::parseNativeRecipeV1(doc.as<JsonVariantConst>(), measureJson(doc), recipe, error, 65535));
  TEST_ASSERT_EQUAL_UINT8(77, recipe.version);
}

int main(int argc, char** argv) {
  (void)argc;
  (void)argv;
  UNITY_BEGIN();
  RUN_TEST(test_v2_affine_journey_capacity_and_rejection);
  RUN_TEST(test_v2_rejects_malformed_spans_and_preserves_destination);
  RUN_TEST(test_parses_complete_bounded_v1_recipe);
  RUN_TEST(test_rejects_unknown_version_and_nodes);
  RUN_TEST(test_rejects_resource_limit_violations);
  RUN_TEST(test_rejects_invalid_palette_sizes_and_colors);
  RUN_TEST(test_rejects_non_finite_and_out_of_range_parameters);
  RUN_TEST(test_rejects_bake_only_and_live_inputs);
  RUN_TEST(test_capability_descriptor_is_versioned_and_bounded);
  RUN_TEST(test_registry_is_additive_bounded_and_resettable);
  RUN_TEST(test_parses_strict_color_journey_and_capability);
  RUN_TEST(test_rejects_color_journey_boundaries_without_mutating_destination);
  RUN_TEST(test_samples_color_journey_timing_easing_and_motion);
  RUN_TEST(test_rejected_journey_candidate_preserves_active_registry);
  RUN_TEST(test_journey_clock_crosses_millis_rollover_without_restarting);
  return UNITY_END();
}
