// Studio -> card contract for symmetry sides (lightweaver/todo/plans/symmetry-sides.md).
// Builds 2-side and 4-side projects, prepares the card deployment, and checks the
// resulting runtime config against the rules the firmware enforces:
//   1. every looks[].zones[] patternId is a pattern the card can play
//      (firmware: isSupportedCompiledPattern in LightweaverPatterns.cpp)
//   2. mirrorOf names an existing zone, not itself, not a zone that itself mirrors,
//      and shares no pixels (firmware: lwValidateZoneMirrors in LightweaverZoneSymmetry.h,
//      compiled and run natively here against the Studio zones)
//   3. continuous / mirrorFlip are booleans; no kaleidoscope mapping targets a continuous zone
//   4. the storage payload is at most 3968 bytes (firmware NVS_STRING_LIMIT)
// Run from lightweaver/:  node tests/symmetry-card-contract.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';
import { makeComboPlaylistItem } from '../src/lib/cardPlaylist.js';
import { prepareCardStoragePayload } from '../src/lib/cardStoragePayload.js';
import { CARD_PATTERN_BANK } from '../src/lib/cardPatternBank.js';
import { assertCardSymmetrySupport } from '../src/lib/cardPushClient.js';
import { createDefaultPatchBoard } from '../src/lib/patchBoard.js';
import { validateSymmetry } from '../src/lib/pieceSymmetry.js';
import { makeDefaultWiring } from '../src/lib/wiringModel.js';

const firmwareRoot = resolve(import.meta.dirname, '../../firmware/lightweaver-controller');
const CARD_LIMIT = 3968;

// ── the firmware's playable set, read from its own source ────────────────────
const patternsCpp = readFileSync(resolve(firmwareRoot, 'src/LightweaverPatterns.cpp'), 'utf8');
function firmwareIds(fnName) {
  const start = patternsCpp.indexOf(fnName);
  assert.ok(start >= 0, `${fnName} found in LightweaverPatterns.cpp`);
  const body = patternsCpp.slice(start, patternsCpp.indexOf('\n}', start));
  return [...body.matchAll(/patternId == "([^"]+)"/g)].map(match => match[1]);
}
const firmwareSupported = new Set([
  ...firmwareIds('static bool isSupportedLegacyProceduralPattern'),
  ...firmwareIds('bool isSupportedPresetPattern'),
]);
assert.ok(firmwareSupported.size > 20 && firmwareSupported.has('aurora') && firmwareSupported.has('ember'));

// ── fixtures ─────────────────────────────────────────────────────────────────
const strip = (id, pixelCount = 12, extra = {}) => ({
  id, name: `Strip ${id}`, pixelCount,
  pixels: Array.from({ length: pixelCount }, (_, index) => ({ x: index, y: 0 })),
  ...extra,
});
const sideOf = (id, label, stripIds) => ({ id, label, stripIds });

function makeProject({ ids, symmetry, extra = {} }) {
  const strips = ids.map(id => strip(id, 12, extra[id]));
  const patchBoard = createDefaultPatchBoard(strips);
  const patchIdOf = stripId => patchBoard.patches.find(patch => patch.source.stripId === stripId).id;
  const wiring = makeDefaultWiring(strips);
  const sideIds = new Set((symmetry?.sides || []).flatMap(side => side.stripIds));
  const ownIds = ids.filter(id => !sideIds.has(id));
  const sectionLooks = (mirrored, ownPattern) => ({
    ...(mirrored
      ? { 'side-1': { patternId: 'ember' } }
      : Object.fromEntries((symmetry?.sides || []).map((side, index) => [side.id, { patternId: index % 2 ? 'aurora' : 'ember' }]))),
    ...Object.fromEntries(ownIds.map(id => [patchIdOf(id), { patternId: ownPattern }])),
  });
  const looks = [
    { id: 'look-mirror', label: 'Mirror', sectionSnapshotVersion: 1, sidesMirrored: true,
      defaultLook: { patternId: 'aurora' }, sectionLooks: sectionLooks(true, 'ocean') },
    { id: 'look-own', label: 'Own', sectionSnapshotVersion: 1, sidesMirrored: false,
      defaultLook: { patternId: 'aurora' }, sectionLooks: sectionLooks(false, 'fire') },
  ];
  return {
    projectName: 'Symmetry contract', strips, wiring, patchBoard, symmetry, sidesMirrored: true,
    standaloneController: { defaultLook: { patternId: 'aurora' }, looks, playlist: looks.map(makeComboPlaylistItem) },
  };
}

const fixtures = {
  'two sides, one strip on its own': makeProject({
    ids: ['a', 'b', 'c'],
    symmetry: { fold: 2, orientation: 'mirror', sides: [sideOf('side-1', 'Left side', ['a']), sideOf('side-2', 'Right side', ['b'])] },
  }),
  'two sides of two strips, one on its own': makeProject({
    ids: ['a', 'b', 'c', 'd', 'e'],
    symmetry: { fold: 2, orientation: 'mirror', sides: [sideOf('side-1', 'Left side', ['a', 'b']), sideOf('side-2', 'Right side', ['c', 'd'])] },
  }),
  'four sides (mirror image), one strip on its own': makeProject({
    ids: ['a', 'b', 'c', 'd', 'e'],
    symmetry: { fold: 4, orientation: 'mirror', sides: ['a', 'b', 'c', 'd'].map((id, i) => sideOf(`side-${i + 1}`, `Side ${i + 1}`, [id])) },
  }),
  'four sides (same way round), one strip on its own': makeProject({
    ids: ['a', 'b', 'c', 'd', 'e'],
    symmetry: { fold: 4, orientation: 'same', sides: ['a', 'b', 'c', 'd'].map((id, i) => sideOf(`side-${i + 1}`, `Side ${i + 1}`, [id])) },
  }),
  'four sides of two strips': makeProject({
    ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    symmetry: { fold: 4, orientation: 'mirror', sides: [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']].map((pair, i) => sideOf(`side-${i + 1}`, `Side ${i + 1}`, pair)) },
  }),
};

// ── firmware rule 2, run natively: the header's own validator ────────────────
// The header is Arduino-free; the harness reads "CASE / ZONE id start:count,.. source / END" and
// prints the LwZoneMirrorError for each case.
const harness = `
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <iostream>
#include <sstream>
#include "LightweaverZoneSymmetry.h"
struct R { uint32_t start; uint32_t count; };
struct Z { std::string id; R ranges[16]; uint8_t rangeCount = 0; };
int main() {
  std::string line; std::string name; std::vector<Z> zones; std::vector<int> src;
  while (std::getline(std::cin, line)) {
    if (line.rfind("CASE ", 0) == 0) { name = line.substr(5); zones.clear(); src.clear(); continue; }
    if (line.rfind("ZONE ", 0) == 0) {
      std::istringstream in(line.substr(5)); Z z; std::string ranges; int source;
      in >> z.id >> ranges >> source;
      std::istringstream rs(ranges); std::string part;
      while (std::getline(rs, part, ',')) { unsigned s, c; std::sscanf(part.c_str(), "%u:%u", &s, &c); z.ranges[z.rangeCount++] = {s, c}; }
      zones.push_back(z); src.push_back(source); continue;
    }
    if (line == "END") {
      std::vector<uint8_t> sources;
      for (int s : src) sources.push_back(s < 0 ? LW_ZONE_NO_MIRROR : (uint8_t)s);
      uint8_t bad = 0;
      LwZoneMirrorError e = lwValidateZoneMirrors(zones.data(), (uint8_t)zones.size(), sources.data(), bad);
      std::printf("%s|%s\\n", name.c_str(), e == LwZoneMirrorError::None ? "ok" : lwZoneMirrorErrorText(e));
    }
  }
}
`;
const temp = mkdtempSync(resolve(os.tmpdir(), 'lw-symmetry-contract-'));
let nativeCases = [];
const nativeInput = [];
const nativeResult = () => {
  const source = resolve(temp, 'harness.cpp');
  const binary = resolve(temp, 'harness');
  writeFileSync(source, harness);
  const compile = spawnSync('c++', ['-std=c++17', '-Wall', '-Wextra', '-I', resolve(firmwareRoot, 'src'), source, '-o', binary], { encoding: 'utf8' });
  assert.equal(compile.status, 0, `host compile of LightweaverZoneSymmetry.h harness failed:\n${compile.stderr}`);
  const run = spawnSync(binary, [], { input: nativeInput.join('\n') + '\n', encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return new Map(run.stdout.trim().split('\n').map(line => line.split('|')));
};

// Firmware semantics for looks[].zones[]: start from the live sources, then every listed zone
// takes its entry's mirrorOf (none when absent).
function queueMirrorCase(name, zones, sourceOf) {
  nativeInput.push(`CASE ${name}`);
  zones.forEach(zone => nativeInput.push(
    `ZONE ${zone.id} ${zone.ranges.map(range => `${range.start}:${range.count}`).join(',')} ${sourceOf(zone) ?? -1}`,
  ));
  nativeInput.push('END');
  nativeCases.push(name);
}

const report = [];
const failures = [];
const check = (rule, fixture, ok, evidence) => {
  report.push({ rule, fixture, ok, evidence });
  if (!ok) failures.push(`${rule} | ${fixture} | ${evidence}`);
};

for (const [name, fixture] of Object.entries(fixtures)) {
  const compiledSymmetry = validateSymmetry(fixture.symmetry, fixture.strips, fixture.wiring);
  assert.equal(compiledSymmetry.ok, true, `${name}: fixture symmetry is valid (${JSON.stringify(compiledSymmetry.errors)})`);

  const prepared = prepareCardDeployment(fixture);
  const { config } = prepared;
  const zoneIds = config.zones.map(zone => zone.id);
  const sideIds = fixture.symmetry.sides.map(side => side.id);
  const lookIds = config.looks.map(look => look.id);
  assert.ok(lookIds.includes('combo-look-mirror') && lookIds.includes('combo-look-own'), `${name}: both looks reach the card (${lookIds})`);

  // rule 1: every look-zone pattern is playable by the card, and Studio's own bank agrees
  const studioBankIds = new Set(CARD_PATTERN_BANK.map(pattern => pattern.id));
  const lookZones = config.looks.flatMap(look => (look.zones || []).map(zone => ({ look: look.id, ...zone })));
  const unplayable = lookZones.filter(zone => !firmwareSupported.has(zone.patternId));
  const liveUnplayable = config.zones.filter(zone => !firmwareSupported.has(zone.patternId));
  const notInStudioBank = lookZones.filter(zone => !studioBankIds.has(zone.patternId));
  check('1 look-zone patternId supported by firmware', name, unplayable.length === 0 && liveUnplayable.length === 0 && notInStudioBank.length === 0,
    `${lookZones.length} look zones, ids ${[...new Set(lookZones.map(zone => zone.patternId))].join(',')}; unplayable ${unplayable.map(zone => `${zone.look}/${zone.id}=${zone.patternId}`)}`);
  const mirroredLook = config.looks.find(look => look.id === 'combo-look-mirror');
  const mirroredLater = mirroredLook.zones.filter(zone => sideIds.slice(1).includes(zone.id));
  check('1 sides 2..n in a mirrored look still carry a pattern id', name,
    mirroredLater.length === sideIds.length - 1 && mirroredLater.every(zone => firmwareSupported.has(zone.patternId)),
    mirroredLater.map(zone => `${zone.id}:${zone.patternId}:mirrorOf=${zone.mirrorOf}`).join(' '));

  // rule 2 shape checks on the JSON, then the native validator for live and every look
  const zoneById = new Map(config.zones.map(zone => [zone.id, zone]));
  const indexOf = id => config.zones.findIndex(zone => zone.id === id);
  queueMirrorCase(`${name} / live`, config.zones, zone => (zone.mirrorOf ? indexOf(zone.mirrorOf) : -1));
  for (const look of config.looks.filter(entry => entry.zones)) {
    const entries = new Map(look.zones.map(zone => [zone.id, zone]));
    queueMirrorCase(`${name} / look ${look.id}`, config.zones, zone => {
      const entry = entries.get(zone.id);
      if (entry) return entry.mirrorOf ? indexOf(entry.mirrorOf) : -1;   // listed: entry wins
      return zone.mirrorOf ? indexOf(zone.mirrorOf) : -1;                // unlisted: keeps live
    });
    for (const zone of look.zones) {
      if (zone.mirrorOf === undefined) continue;
      const source = zoneById.get(zone.mirrorOf);
      const entrySource = entries.get(zone.mirrorOf);
      const ok = Boolean(source) && zone.mirrorOf !== zone.id && !entrySource?.mirrorOf && !source?.mirrorOf;
      check('2 mirrorOf names a real, non-chained, non-self zone (JSON)', `${name} / ${look.id}`, ok, `${zone.id} -> ${zone.mirrorOf}`);
    }
  }
  for (const zone of config.zones) {
    if (zone.mirrorOf === undefined) continue;
    const source = zoneById.get(zone.mirrorOf);
    check('2 mirrorOf names a real, non-chained, non-self zone (JSON)', `${name} / live`,
      Boolean(source) && zone.mirrorOf !== zone.id && !source.mirrorOf, `${zone.id} -> ${zone.mirrorOf}`);
  }

  // rule 3: booleans, and no kaleidoscope mapping on a continuous zone
  const flagged = [...config.zones, ...lookZones];
  const badTypes = flagged.filter(zone =>
    ('continuous' in zone && typeof zone.continuous !== 'boolean') || ('mirrorFlip' in zone && typeof zone.mirrorFlip !== 'boolean'));
  const flipRule = config.zones.filter(zone => zone.mirrorOf).every(zone => {
    const index = sideIds.indexOf(zone.id);
    return zone.mirrorFlip === (fixture.symmetry.orientation === 'mirror' && index % 2 === 1);
  });
  const continuousIds = config.zones.filter(zone => zone.continuous === true).map(zone => zone.id);
  check('3 continuous/mirrorFlip are booleans', name, badTypes.length === 0 && flipRule,
    `continuous on ${continuousIds.join(',')}; mirrorFlip ${config.zones.filter(zone => zone.mirrorOf).map(zone => `${zone.id}=${zone.mirrorFlip}`).join(' ')}; flip rule ${flipRule}`);
  check('3 continuous exactly on the side zones', name,
    JSON.stringify(continuousIds) === JSON.stringify(sideIds), `${continuousIds} vs ${sideIds}`);
  const mappings = config.kaleidoscopeMappings || config.kaleidoscope?.mappings || [];
  check('3 no kaleidoscope mapping targets a continuous zone', name,
    mappings.every(mapping => !continuousIds.includes(mapping.zoneId)), `${mappings.length} mappings`);

  // rule 4: size
  const payload = prepareCardStoragePayload(prepared.runtimePackage);
  check('4 config <= 3968 bytes', name, payload.bytes <= CARD_LIMIT, `${payload.bytes} bytes (${zoneIds.length} zones, ${lookIds.length} looks)`);

  // capability gate travels with the config
  assert.throws(() => assertCardSymmetrySupport(prepared.runtimePackage, { capabilities: {} }), /Update this card/);
  assert.equal(assertCardSymmetrySupport(prepared.runtimePackage, { capabilities: { symmetrySides: 1 } }), true);
}

// rule 3, refusal side: a kaleidoscope strip cannot be placed in a side
{
  const kaleido = makeProject({
    ids: ['a', 'b', 'c'],
    symmetry: { fold: 2, orientation: 'mirror', sides: [sideOf('side-1', 'Left side', ['a']), sideOf('side-2', 'Right side', ['b'])] },
    extra: { a: { kaleidoscope: { enabled: true } } },
  });
  const result = validateSymmetry(kaleido.symmetry, kaleido.strips, kaleido.wiring);
  check('3 kaleidoscope strip in a side is refused by Studio', 'two sides + kaleidoscope strip',
    !result.ok && result.errors.some(error => error.code === 'symmetry-strip-kaleidoscope'), JSON.stringify(result.errors.map(error => error.code)));
}

// run the firmware's own validator over every queued case
const native = nativeResult();
for (const name of nativeCases) {
  const outcome = native.get(name);
  check('2 lwValidateZoneMirrors (native, firmware header)', name, outcome === 'ok', outcome);
}
// sanity: the harness does fail a bad config (guards against a validator that says ok to everything)
{
  nativeCases = []; nativeInput.length = 0;
  const zones = [
    { id: 'x', ranges: [{ start: 0, count: 4 }] },
    { id: 'y', ranges: [{ start: 4, count: 4 }] },
    { id: 'z', ranges: [{ start: 2, count: 4 }] },
  ];
  queueMirrorCase('overlap', zones, zone => (zone.id === 'z' ? 0 : -1));
  queueMirrorCase('chain', zones, zone => (zone.id === 'y' ? 0 : zone.id === 'z' ? 1 : -1));
  queueMirrorCase('self', zones, zone => (zone.id === 'y' ? 1 : -1));
  const control = nativeResult();
  assert.match(control.get('overlap'), /shares pixels/);
  assert.match(control.get('chain'), /itself mirrors/);
  assert.match(control.get('self'), /cannot mirror itself/);
}
rmSync(temp, { recursive: true, force: true });

for (const row of report) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.rule}  [${row.fixture}]  ${row.evidence}`);
if (failures.length) {
  console.error(`\n${failures.length} contract failure(s)`);
  process.exit(1);
}
console.log(`\nsymmetry card contract: ${report.length} checks passed`);
