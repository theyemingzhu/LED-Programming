#pragma once

#include <Arduino.h>

class WebServer;

static constexpr uint32_t LW_SEQUENCE_MEDIA_VERSION = 2;
static constexpr size_t LW_SEQUENCE_MEDIA_MAX_BYTES = 16777216;
static constexpr size_t LW_SEQUENCE_MEDIA_CHUNK_BYTES = 2048;
static constexpr size_t LW_SEQUENCE_MEDIA_HTTP_MAX_BODY_BYTES = 4096;

void registerLightweaverMedia(WebServer& server);
