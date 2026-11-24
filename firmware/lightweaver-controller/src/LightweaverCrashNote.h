#pragma once

// The two calls request handlers make into the crash recorder. Kept apart from
// LightweaverCrashRecorder.h so files that are also compiled on a host (with
// no ArduinoJson) can include it.

// The path of the request being answered. Never a query string or a body.
void lightweaverCrashNoteActivity(const char* path);
void lightweaverCrashNoteSave(bool inProgress);
