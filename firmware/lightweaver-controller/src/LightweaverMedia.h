#pragma once

#include <Arduino.h>

class WebServer;

static constexpr uint32_t LW_SEQUENCE_MEDIA_VERSION = 2;
static constexpr size_t LW_SEQUENCE_MEDIA_MAX_BYTES = 16777216;
static constexpr size_t LW_SEQUENCE_MEDIA_CHUNK_BYTES = 2048;
static constexpr size_t LW_SEQUENCE_MEDIA_HTTP_MAX_BODY_BYTES = 4096;

void registerLightweaverMedia(WebServer& server);

#if defined(ARDUINO_ARCH_ESP32)
#include <ArduinoJson.h>
#include <FS.h>

// Opens a recorded look for playback: from the microSD when it holds the
// file, otherwise from the card's built-in memory. Invalid File when neither
// has it.
fs::File lightweaverOpenRecordedMedia(const char* path);
// Writes capabilities.recordedMediaStore ("sd" | "flash" | "none") and the
// byte limits that go with it, so Studio can tell where a recording will live.
void lightweaverReportRecordedMedia(JsonObject capabilities);
#endif
