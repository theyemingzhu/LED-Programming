#include <ArduinoJson.h>
#include <unity.h>

#include "LightweaverNativeArmPolicy.h"

void setUp() {}
void tearDown() {}

void test_command_envelope_requires_one_explicit_zone_and_boolean() {
  JsonDocument body;
  deserializeJson(body, "{\"zone\":\"gpio-16\",\"armNative\":true}");
  TEST_ASSERT_TRUE(nativeArmEnvelopeValid(body.as<JsonVariantConst>()));
  deserializeJson(body, "{\"zone\":\"gpio-16\",\"armNative\":false}");
  TEST_ASSERT_TRUE(nativeArmEnvelopeValid(body.as<JsonVariantConst>()));
  deserializeJson(body, "{\"zone\":\"gpio-16\",\"armNative\":true,\"patternId\":\"aurora\"}");
  TEST_ASSERT_FALSE(nativeArmEnvelopeValid(body.as<JsonVariantConst>()));
  deserializeJson(body, "{\"zone\":\"\",\"armNative\":true}");
  TEST_ASSERT_FALSE(nativeArmEnvelopeValid(body.as<JsonVariantConst>()));
  deserializeJson(body, "{\"zone\":\"gpio-16\",\"armNative\":1}");
  TEST_ASSERT_FALSE(nativeArmEnvelopeValid(body.as<JsonVariantConst>()));
  deserializeJson(body, "{\"armNative\":true}");
  TEST_ASSERT_FALSE(nativeArmEnvelopeValid(body.as<JsonVariantConst>()));
}

void test_only_selected_provisional_zone_becomes_visible_and_disarm_restores_dark() {
  uint16_t mask = 0;
  for (uint8_t i = 0; i < 4; i++)
    TEST_ASSERT_FALSE(nativeArmZoneVisible(true, mask, i));
  mask = nativeArmSetZone(mask, 1, true);
  TEST_ASSERT_FALSE(nativeArmZoneVisible(true, mask, 0));
  TEST_ASSERT_TRUE(nativeArmZoneVisible(true, mask, 1));
  TEST_ASSERT_FALSE(nativeArmZoneVisible(true, mask, 2));
  mask = nativeArmSetZone(mask, 3, true);
  TEST_ASSERT_TRUE(nativeArmZoneVisible(true, mask, 3));
  mask = nativeArmSetZone(mask, 1, false);
  TEST_ASSERT_FALSE(nativeArmZoneVisible(true, mask, 1));
  TEST_ASSERT_TRUE(nativeArmZoneVisible(true, mask, 3));
  mask = nativeArmSetZone(mask, 3, false);
  TEST_ASSERT_EQUAL_UINT16(0, mask);
  TEST_ASSERT_TRUE(nativeArmZoneVisible(false, mask, 0));
}

void test_arm_admission_keeps_bench_current_and_brightness_limits() {
  TEST_ASSERT_TRUE(nativeArmSafeToEnable(true, true, true, 2000, .25f, .25f));
  TEST_ASSERT_FALSE(nativeArmSafeToEnable(false, true, true, 2000, .25f, .25f));
  TEST_ASSERT_FALSE(nativeArmSafeToEnable(true, false, true, 2000, .25f, .25f));
  TEST_ASSERT_FALSE(nativeArmSafeToEnable(true, true, false, 2000, .25f, .25f));
  TEST_ASSERT_FALSE(nativeArmSafeToEnable(true, true, true, 2001, .25f, .25f));
  TEST_ASSERT_FALSE(nativeArmSafeToEnable(true, true, true, 2000, .251f, .25f));
  TEST_ASSERT_FALSE(nativeArmSafeToEnable(true, true, true, 2000, .25f, .251f));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_command_envelope_requires_one_explicit_zone_and_boolean);
  RUN_TEST(test_only_selected_provisional_zone_becomes_visible_and_disarm_restores_dark);
  RUN_TEST(test_arm_admission_keeps_bench_current_and_brightness_limits);
  return UNITY_END();
}
