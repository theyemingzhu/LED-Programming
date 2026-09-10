#pragma once

#include <ArduinoJson.h>

#include "LightweaverOutputColorConfig.h"

bool parseOutputColorConfig(
    JsonVariantConst ledValue,
    OutputColorConfig& destination,
    const char*& errorPath,
    const char*& errorReason);

// Parses the transient RGB gain object accepted by /api/control. This is
// deliberately separate from the persisted `led` config so a live preview can
// borrow the Studio's strip profile without changing the installed project.
bool parseTransientOutputCalibration(
    JsonVariantConst value,
    OutputColorConfig& destination,
    const char*& errorPath,
    const char*& errorReason);
