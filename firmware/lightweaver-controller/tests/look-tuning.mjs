import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const src = resolve(import.meta.dirname, '../src');
const main = readFileSync(join(src, 'main.cpp'), 'utf8');
const web = readFileSync(join(src, 'LightweaverWeb.cpp'), 'utf8');
const storage = readFileSync(join(src, 'LightweaverStorage.cpp'), 'utf8');

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  const end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, signature);
  return source.slice(start, end + 2);
}

const select = functionBody(main, 'void selectLookTuning(const String& patternId) {');
const setup = functionBody(main, 'void setup() {');
const startLook = functionBody(main, 'bool startLook(uint8_t index, PreparedSequence* prepared) {');
const renderZone = functionBody(main, 'bool renderZone(const ZoneConfig& zone,');
const brightness = functionBody(main, 'uint8_t computeBrightnessByte() {');

assert.match(setup, /loadSavedLookTuning\(runtimeConfig\)/);
assert.match(setup, /currentLookIndex = findStartupLook\(\)[\s\S]*startLook\(currentLookIndex\)[\s\S]*fadeTo\(1\.0f/);
assert.doesNotMatch(setup, /restoreLiveLook|loadPersistedLiveLookRecord/);
assert.match(startLook, /applyLookToRuntimeZones\(look\);\s*selectLookTuning\(look.id\);\s*applySequenceFrameBufferToLeds\(\)/);
assert.match(startLook, /applyLookToRuntimeZones\(look\);\s*selectLookTuning\(look.id\);\s*bool rendered = renderCurrentLook/);
assert.match(brightness, /input.lookBrightness = [\s\S]*\*\s*liveLookTuning.brightnessScale/);
assert.match(renderZone, /mods.speed = zone.speed \* speedScale/);
assert.match(renderZone, /advanceZoneAnimationClock\(zoneIndex, now, mods.speed\)/);
assert.match(renderZone, /wrapLookHue\(zone.hueShift, liveLookTuning.hueOffset\)/);
assert.match(web, /key != "lookTuning"\) valid = false/);
assert.match(web, /'expectedRevision','lookTuning'\]/);
assert.match(functionBody(web, 'bool matchesLookTuningSession('),
  /runtimeBootId\(\)[\s\S]*runtimeLookTuningSession\(\)[\s\S]*runtimeCurrentPatternId\(\)/);
const save = functionBody(web, 'void handleClientPatternPost() {');
assert.match(save, /runtimePlaylistPlaying\(\)[\s\S]*savedLookTuningRevision[\s\S]*sameLookTuning[\s\S]*saveLookTuning/);
assert.match(save, /clientPatternRevision[\s\S]*saveClientPattern/);
assert.match(storage, /LOOK_TUNING_KEY = "lookTuningV1"/);
assert.match(functionBody(storage, 'bool saveLookTuning('), /putString\(LOOK_TUNING_KEY[\s\S]*getString\(LOOK_TUNING_KEY[\s\S]*savedLookTunings\[index\] = tuning/);

const cpp = `
#include <cassert>
#include <limits>
#include <string>
#include "LightweaverLookTuning.h"
#include "LightweaverOutputPolicy.h"

using String = std::string;
int runtimeConfig;
LookTuning liveLookTuning;
uint32_t lookTuningSession = 0;
bool tuningInstalledLook = false;
int installedClientPatternIndex(int, const String& id) { return id.empty() ? -1 : 0; }

LookTuning savedA;
LookTuning savedLookTuning(int, const String& id) {
  return id == "A" ? savedA : LookTuning{};
}
${select}

int main() {
  assert(!lookBrightnessScaleValid(std::numeric_limits<float>::quiet_NaN()));
  assert(!lookSpeedScaleValid(std::numeric_limits<float>::infinity()));
  assert(!lookHueOffsetValid(128));

  selectLookTuning("A");
  const auto firstSession = lookTuningSession;
  assert(sameLookTuning(liveLookTuning, LookTuning{}));

  liveLookTuning = LookTuning{0.5f, 1.5f, 20};
  LookTuningSpeedRange range;
  range.include(1.0f);
  range.include(0.60f);
  assert(std::fabs(range.clamp(liveLookTuning.speedScale) * 1.0f - 1.5f) < 0.0001f);
  assert(std::fabs(range.clamp(liveLookTuning.speedScale) * 0.60f - 0.90f) < 0.0001f);
  assert(wrapLookHue(0, 20) == 20 && wrapLookHue(-15, 20) == 5);
  assert(wrapLookHue(120, 20) == -116 && wrapLookHue(-120, -20) == 116);

  OutputBrightnessInputs output;
  output.lookBrightness = liveLookTuning.brightnessScale;
  const float master = float(composeOutputBrightness(output, OUTPUT_LOCAL)) / 255.0f;
  assert(std::fabs(master * 0.80f - 0.40f) < 0.002f);
  assert(std::fabs(master * 0.30f - 0.15f) < 0.002f);
  assert(composeOutputBrightness(output, OUTPUT_EXTERNAL) == 255);
  output.fadeScale = 0.5f;
  assert(composeOutputBrightness(output, OUTPUT_LOCAL) == 64);
  output.blackedOut = true;
  assert(composeOutputBrightness(output, OUTPUT_LOCAL) == 0);

  LookTuningSpeedRange tight;
  tight.include(0.10f);
  tight.include(2.0f);
  assert(tight.clamp(0.05f) == 0.5f && tight.clamp(3.0f) == 1.5f);

  savedA = liveLookTuning;
  liveLookTuning.hueOffset = 50;
  selectLookTuning("B");
  assert(sameLookTuning(liveLookTuning, LookTuning{}));
  selectLookTuning("A");
  assert(lookTuningSession != firstSession && sameLookTuning(liveLookTuning, savedA));
  liveLookTuning.speedScale = 2.0f;
  selectLookTuning("A");
  assert(sameLookTuning(liveLookTuning, savedA));
}
`;

const dir = mkdtempSync(join(tmpdir(), 'lightweaver-look-tuning-'));
try {
  const file = join(dir, 'look-tuning.cpp');
  const binary = join(dir, 'look-tuning');
  writeFileSync(file, cpp);
  execFileSync(process.env.CXX || 'c++', ['-std=c++11', '-I', src, file, '-o', binary], { stdio: 'inherit' });
  execFileSync(binary, [], { stdio: 'inherit' });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('relative look tuning host and firmware source checks passed');
