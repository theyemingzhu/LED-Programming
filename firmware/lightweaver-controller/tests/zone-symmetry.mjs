// Symmetry sides (lightweaver/todo/plans/symmetry-sides.md, "Card runtime
// config"): continuous zones, mirrorOf / mirrorFlip on zones and look zones,
// the capability flag, and the wiring that keeps mirrors out of stream paths.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const temp = mkdtempSync(resolve(os.tmpdir(), 'lw-zone-symmetry-'));
try {
  const binary = resolve(temp, 'zone-symmetry');
  execFileSync('c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', resolve(import.meta.dirname, 'host-stubs'),
    '-I', resolve(root, 'src'),
    resolve(root, 'src/LightweaverPatterns.cpp'),
    resolve(root, 'src/LightweaverColorJourney.cpp'),
    resolve(import.meta.dirname, 'zone-symmetry.cpp'),
    '-o', binary,
  ], { stdio: 'inherit' });
  execFileSync(binary, { stdio: 'inherit' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const read = (file) => readFileSync(resolve(root, file), 'utf8');
const types = read('src/LightweaverTypes.h');
const storage = read('src/LightweaverStorage.cpp');
const main = read('src/main.cpp');
const web = read('src/LightweaverWeb.cpp');
const slice = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} .. ${end} must be present`);
  return source.slice(from, to);
};

// Stored as an index + flag bits, not strings, in both per-copy structs.
for (const struct of ['ZoneConfig', 'LookZoneConfig']) {
  const body = slice(types, `struct ${struct} {`, '};');
  assert.match(body, /uint8_t mirrorSource = LW_ZONE_NO_MIRROR;/, `${struct} stores the mirror source as an index`);
  assert.match(body, /uint8_t symmetryFlags = 0;/, `${struct} stores symmetry as flag bits`);
  assert.doesNotMatch(body, /String\s+mirrorOf/, `${struct} must not store mirrorOf as a String`);
}
assert.match(main, /static_assert\(sizeof\(ZoneConfig\) == 96/, 'ZoneConfig size is pinned');
assert.match(main, /static_assert\(sizeof\(LookZoneConfig\) == 68/, 'LookZoneConfig size is pinned');

// Parse + strict validation.
const applyJson = slice(storage, 'void applyJsonToConfig(', '\nbool loadJsonString(');
assert.match(applyJson, /zoneJson\["continuous"\] \| false\) zone\.symmetryFlags \|= LW_ZONE_FLAG_CONTINUOUS/);
assert.match(applyJson, /resolveZoneSymmetry\(doc, config\);/, 'mirrorOf resolves after the live zones are parsed');
assert.ok(applyJson.indexOf('resolveZoneSymmetry(doc, config);') > applyJson.indexOf('config.zoneCount++'),
  'mirrorOf must resolve against the final zone list');
const strict = slice(storage, 'bool validateRuntimeConfigJsonStrict(', '\nbool mountRuntimeSd(');
assert.ok(strict.indexOf('validateZoneSymmetryStrict(doc, parsed, message)') >
  strict.indexOf('validateKaleidoscopeMappingsStrict('),
  'symmetry validation runs on the parsed config, after kaleidoscope mappings are known');
const strictSymmetry = slice(storage, 'static bool validateZoneSymmetryStrict(', '\nvoid applyJsonToConfig(');
assert.match(strictSymmetry, /lwValidateZoneMirrors\(|zoneMirrorErrorMessage\(parsed, liveSources/,
  'live zones use the shared mirror rules');
assert.match(strictSymmetry, /zoneMirrorErrorMessage\(parsed, lookSources/, 'every saved look is validated as it will play');
assert.match(strictSymmetry, /cannot target continuous zone/, 'kaleidoscope on a continuous zone is refused');
assert.match(strictSymmetry, /mirrors unknown zone/);
assert.match(storage, /zone\.mirrorSource = LW_ZONE_NO_MIRROR;\n  zone\.symmetryFlags = 0;/, 'reset clears symmetry state');

// Render order: every source is drawn before any mirror copies it.
const renderCurrent = slice(main, 'bool renderCurrentLook(bool force) {', '\nbool renderSequenceFrame(');
const ownPass = renderCurrent.indexOf('renderZone(runtimeConfig.zones[i], i, now)');
const mirrorPass = renderCurrent.indexOf('renderMirrorZone(runtimeConfig.zones[i], i)');
assert.ok(ownPass >= 0 && mirrorPass > ownPass, 'mirror pass must run after every source zone rendered');
assert.match(renderCurrent, /if \(activeZoneMirrorSource\[i\] != LW_ZONE_NO_MIRROR\) continue;/,
  'a mirroring zone renders no pattern of its own');
const renderZone = slice(main, 'bool renderZone(', '\nbool renderCurrentLook(');
assert.match(renderZone, /zone\.symmetryFlags & LW_ZONE_FLAG_CONTINUOUS[\s\S]*context\.logicalStart[\s\S]*context\.logicalCount/,
  'a continuous zone renders each range as a slice of one run');

// Internal rendering only: streams write leds[] directly and never mirror.
const mirrorCallers = main.match(/renderMirrorZone\(/g) || [];
assert.equal(mirrorCallers.length, 3, 'renderMirrorZone: one declaration, one definition, one call (renderCurrentLook)');
for (const file of ['src/LightweaverArtnet.cpp', 'src/LightweaverWledRealtime.cpp',
  'src/LightweaverHttpFrameStream.cpp', 'src/LightweaverWledWebSocket.cpp', 'src/LightweaverFrameSource.cpp']) {
  assert.doesNotMatch(read(file), /renderMirrorZone|lwCopyMirroredZone|activeZoneMirror|renderCurrentLook/,
    `${file} must never apply a zone mirror`);
}
const sequence = slice(main, 'bool renderSequenceFrame(bool force) {', '\nbool renderProceduralFrame(');
assert.doesNotMatch(sequence, /renderMirrorZone|lwCopyMirroredZone|activeZoneMirror/,
  'recorded sequences play exactly as recorded');

// Looks carry their own mirroring; applying a config resets it.
assert.match(slice(main, 'void applyLookToRuntimeZones(const LookConfig& look) {', '\n}'),
  /resolveActiveZoneMirrors\(runtimeConfig, &look\)/);
assert.match(slice(main, 'void applyRuntimeConfig(const RuntimeConfig& config) {', '\n}'),
  /resolveActiveZoneMirrors\(config, nullptr\)/);
assert.match(slice(main, 'bool restoreLiveLookIfMatching() {', '\n}'),
  /resolveActiveZoneMirrors\(runtimeConfig, resumedLook\)/, 'a power cycle keeps the look\'s mirroring');

// Capability flag on both identity payloads.
const firmwareInfo = main.match(/String runtimeFirmwareInfo\(\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
const runtimeStatus = storage.match(/String runtimeStatusJson\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
for (const [source, name] of [[firmwareInfo, '/api/firmware-info'], [runtimeStatus, '/api/status']]) {
  assert.match(source, /doc\["capabilities"\]\["symmetrySides"\] = LW_SYMMETRY_SIDES_VERSION;/,
    `${name} must report capabilities.symmetrySides`);
}
assert.match(read('src/LightweaverZoneSymmetry.h'), /constexpr uint8_t LW_SYMMETRY_SIDES_VERSION = 1;/);

// Readback: installed symmetry round-trips, and only when set.
const zonesJson = slice(main, 'String runtimeZonesJson() {', '\n}');
assert.match(zonesJson, /if \(z\.symmetryFlags & LW_ZONE_FLAG_CONTINUOUS\) obj\["continuous"\] = true;/);
assert.match(zonesJson, /obj\["mirrorOf"\] = runtimeConfig\.zones\[z\.mirrorSource\]\.id;/);
assert.match(web, /z\["mirrorOf"\] = cfg\.zones\[lookZone\.mirrorSource\]\.id;/);

console.log('zone symmetry contract tests passed');
