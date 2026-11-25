#pragma once

#include <ArduinoJson.h>
#include <esp_flash.h>
#include <sdkconfig.h>
#if CONFIG_IDF_TARGET_ESP32S3 && CONFIG_SPIRAM_SUPPORT
#include <esp32s3/spiram.h>
#endif

#include "LightweaverTypes.h"

inline void writeOutputTopologyCapabilities(JsonObject topology) {
  topology["version"] = 1;
  topology["sequenceVersion"] = LW_EXPERIMENTAL_MULTI_OUTPUT ? 2 : 1;
  topology["experimental"] = LW_EXPERIMENTAL_MULTI_OUTPUT != 0;
  JsonArray pins = topology["outputPins"].to<JsonArray>();
  for (uint8_t pin : LW_CARD_HARDWARE_OUTPUT_GPIOS) {
    pins.add(pin);
  }
}

// Runtime sizes describe hardware that was actually detected. They are clues
// for identifying compatible profiles. The carrier PCB is not discoverable
// from the chip model and memory sizes.
inline void writeBoardHardwareHints(JsonDocument& doc) {
  doc["chipName"] = ESP.getChipModel();
  const static uint32_t flashBytes = [] {
    uint32_t bytes = 0;
    return esp_flash_get_physical_size(nullptr, &bytes) == ESP_OK ? bytes : 0;
  }();
  if (flashBytes > 0) doc["flashBytes"] = flashBytes;
#if CONFIG_IDF_TARGET_ESP32S3 && CONFIG_SPIRAM_SUPPORT
  if (esp_spiram_is_initialized()) {
    const size_t psramBytes = esp_spiram_get_size();
    if (psramBytes > 0) doc["psramBytes"] = psramBytes;
  }
#endif
}
