#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#include "LightweaverCrashNote.h"
#include "LightweaverCrashRecord.h"

class WebServer;

// Card-side crash recorder. See LightweaverCrashRecord.h for what is kept.
//
// Boot() must run once in setup(), before anything that could itself crash,
// so the evidence from the previous start-up is stored first. It only reads
// the reset reason, reads and writes two small NVS values, and clears the
// breadcrumb: no allocation it depends on, nothing that can hold the card.
void lightweaverCrashRecorderBoot();
// Every pass of the main loop: one store, plus a once-a-second sample of free
// memory and the current pattern.
void lightweaverCrashRecorderTick(uint32_t nowMs);
// Short summary for /api/status and /api/firmware-info.
void lightweaverCrashReportSummary(JsonObject crash);
// The newest record as raw JSON text ("null" if the card has never crashed),
// in the shape Studio's reader expects for /api/status "lastCrash".
String lightweaverCrashLastCrashJson();
// Read-only GET /api/crash-log: the last three records in full.
void registerLightweaverCrashRecorder(WebServer& server);
