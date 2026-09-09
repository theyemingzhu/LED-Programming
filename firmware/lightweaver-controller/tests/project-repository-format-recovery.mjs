import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// F38: a card whose LittleFS project-repository partition was never
// formatted (factory-flashed before the subsystem existed) failed
// LittleFS.begin(false) on every boot forever, and the reason never left
// Serial. This test pins three things: the repository retries once with
// format-on-fail, the retry is skipped during firmware-boot probation (a
// mutation should not run on a boot that might still roll back), and the
// outcome — success or failure — is always recorded where /api/status and
// /api/firmware-info can read it back.

const src = resolve(import.meta.dirname, '../src');
const read = name => readFileSync(join(src, name), 'utf8');
const repository = read('LightweaverProjectRepository.cpp');
const repositoryHeader = read('LightweaverProjectRepository.h');

assert.match(repository, /LittleFS\.begin\(false\)/,
  'the first mount attempt must never format — only a genuine failure earns a retry');
assert.match(repository,
  /!LittleFS\.begin\(false\)[\s\S]{0,2000}readOnlyProbation \|\| !LittleFS\.begin\(true\)/,
  'a failed first mount retries once with format-on-fail, but not during firmware-boot probation');

// Partition safety: this must stay the only LittleFS.begin() call in the
// firmware, and the WiFi/config/settings path must stay on Preferences
// (the "nvs" partition), never LittleFS — otherwise formatting on a mount
// failure could erase more than the project repository.
for (const name of [
  'main.cpp', 'LightweaverWeb.cpp', 'LightweaverStorage.cpp',
  'LightweaverFirmwareUpdate.cpp', 'LightweaverCardStudio.cpp',
  'LightweaverOwnerCapability.cpp',
]) {
  assert.doesNotMatch(read(name), /LittleFS\.begin\(/,
    `${name} must not mount LittleFS itself — the repository is the only owner`);
}
assert.match(read('LightweaverStorage.cpp'), /Preferences\s+prefs/,
  'WiFi/config/settings must be read through Preferences (the separate nvs partition)');
assert.doesNotMatch(read('LightweaverStorage.cpp'), /LittleFS/,
  'storage.cpp must never touch LittleFS — a format-on-fail retry there must be unable to reach it');

// The outcome (success or failure, and why) must always be recorded, on
// every return path, so a caller reading lastMessage() after begin() never
// sees a stale message from a previous boot's earlier failure branch.
const lastMessageAssignments = (repository.match(/lastMessage_\s*=/g) || []).length;
assert.ok(lastMessageAssignments >= 4,
  `expected lastMessage_ to be set on every begin() return path (mount failure, ` +
  `directory failure, head-load failure, success); found ${lastMessageAssignments}`);
assert.match(repositoryHeader, /lastMessage\(\)\s*const/,
  'the repository must expose the recorded message via an accessor');

// Compile the mount-retry decision in isolation, host-side, against a tiny
// fake LittleFS so the branch logic (not the real ESP32 filesystem) is
// verified deterministically.
const temp = mkdtempSync(join(tmpdir(), 'lw-repo-format-'));
try {
  writeFileSync(join(temp, 'test.cpp'), `
#include <cassert>
#include <string>
// Mirrors the exact branch this firmware executes in
// LightweaverProjectRepository::begin() — kept in lockstep with the source
// assertions above rather than re-including ESP32-only headers.
struct FakeLittleFS {
  bool failPlain = false;
  bool failFormatted = false;
  bool formatCalled = false;
  bool begin(bool formatOnFail) {
    if (!formatOnFail) return !failPlain;
    formatCalled = true;
    return !failFormatted;
  }
};

bool projectRepositoryBegin(FakeLittleFS& fs, bool readOnlyProbation, std::string& message) {
  if (!fs.begin(false)) {
    if (readOnlyProbation || !fs.begin(true)) {
      message = "project filesystem unavailable";
      return false;
    }
  }
  message = "project repository ready";
  return true;
}

int main() {
  { // Healthy first mount: no format attempted.
    FakeLittleFS fs; std::string message;
    assert(projectRepositoryBegin(fs, false, message));
    assert(!fs.formatCalled);
    assert(message == "project repository ready");
  }
  { // First mount fails, format succeeds: recovers and formats exactly once.
    FakeLittleFS fs; fs.failPlain = true; std::string message;
    assert(projectRepositoryBegin(fs, false, message));
    assert(fs.formatCalled);
  }
  { // First mount fails, format also fails: reports unavailable, never available.
    FakeLittleFS fs; fs.failPlain = true; fs.failFormatted = true; std::string message;
    assert(!projectRepositoryBegin(fs, false, message));
    assert(message == "project filesystem unavailable");
  }
  { // Firmware-boot probation: a failed mount must NOT format.
    FakeLittleFS fs; fs.failPlain = true; std::string message;
    assert(!projectRepositoryBegin(fs, true, message));
    assert(!fs.formatCalled);
  }
}
`);
  execFileSync('c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', join(temp, 'test.cpp'), '-o', join(temp, 'test')]);
  execFileSync(join(temp, 'test'));
} finally { rmSync(temp, { recursive: true, force: true }); }

// /api/status and /api/firmware-info both publish the repository's exact
// last message, sourced from the same accessor, so a healthy card that
// still refuses an update (F37) can be told apart from a truly broken one.
for (const name of ['main.cpp', 'LightweaverStorage.cpp']) {
  assert.match(read(name),
    /doc\["projectRepositoryMessage"\]\s*=\s*lightweaverProjectRepository\(\)\.lastMessage\(\)/,
    `${name} must publish projectRepositoryMessage from the repository's own accessor`);
}

console.log('project repository format-recovery tests passed');
