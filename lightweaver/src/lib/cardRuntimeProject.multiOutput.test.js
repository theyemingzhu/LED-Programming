import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { compileWiring } from './wiringCompiler.js';
import { makeDefaultWiring } from './wiringModel.js';
import { prepareCardStoragePayload } from './cardStoragePayload.js';
import { migrateRunSectionReferences } from './sectionRunConversion.js';

test('legacy zone-keyed saved combo follows both sections after run separation', () => {
  const strips = [
    { id: 'piece', name: 'Piece 1', pixelCount: 4 },
    { id: 'part', name: 'Piece 2', pixelCount: 5 },
  ];
  const wiring = makeDefaultWiring(strips);
  wiring.outputs = [
    { id: 'out1', pin: 16, runIds: ['run-piece'] },
    { id: 'out2', pin: 17, runIds: ['run-part'] },
  ];
  const patchBoard = { patches: strips.map(strip => ({
    id: `patch-${strip.id}`, source: { type: 'strip', stripId: strip.id, startLed: 0, endLed: strip.pixelCount - 1 },
    output: { mode: 'normal' }, playback: {},
  })) };
  const before = { defaultLook: { patternId: 'aurora' }, looks: [{
    id: 'native', label: 'Native', defaultLook: { patternId: 'aurora' },
    sectionLooks: { piece: { patternId: 'fire' } },
  }], playlist: [{ type: 'combo', lookId: 'native' }] };
  const controller = migrateRunSectionReferences({ controller: before,
    identityMap: { piece: ['piece', 'part'] }, patchIdentityMap: { 'patch-piece': ['patch-piece', 'patch-part'] },
  }).controller;
  const config = buildCardRuntimePackageFromProject({ strips, wiring, patchBoard, standaloneController: controller }).config;
  const combo = config.looks.find(look => look.id === 'combo-native');
  assert.equal(combo.mode, 'combo');
  assert.deepEqual(combo.zones.map(zone => zone.patternId), ['fire', 'fire']);
});

function twoGpioConfig({ left = { patternId: 'fire' }, right = { patternId: 'ocean' }, autoplay = false } = {}) {
  const strips = [
    { id: 'left', name: 'Left', pixelCount: 8 },
    { id: 'right', name: 'Right', pixelCount: 8 },
  ];
  const patchBoard = {
    patches: strips.map((strip, index) => ({
      id: `patch-${strip.id}`,
      name: strip.name,
      source: { type: 'strip', stripId: strip.id, startLed: 0, endLed: 7 },
      output: { mode: 'normal' },
      playback: index === 0 ? left : right,
    })),
  };
  const config = buildCardRuntimePackageFromProject({
    projectName: 'Two GPIOs',
    strips,
    patchBoard,
    standaloneController: {
      outputs: [
        { id: 'left-output', name: 'Left output', pin: 16, pixels: 8 },
        { id: 'right-output', name: 'Right output', pin: 17, pixels: 8 },
      ],
      defaultLook: { patternId: 'aurora' },
      playlist: [{ type: 'pattern', patternId: 'aurora' }],
      controls: { playlist: { enabled: autoplay } },
    },
  }).config;
  return config;
}

test('two independently patterned GPIO sections boot as a combined look', () => {
  const config = twoGpioConfig();

  assert.deepEqual(config.led.outputs.map(output => output.pin), [16, 17]);
  assert.deepEqual(config.zones.map(zone => zone.patternId), ['fire', 'ocean']);
  const startup = config.looks.find(look => look.id === config.startupPatternId);
  assert.equal(startup?.mode, 'combo');
  assert.deepEqual(startup.zones.map(zone => zone.patternId), ['fire', 'ocean']);
  assert.equal(config.playlist, undefined, 'ordinary project does not start timed playback');
  assert.deepEqual(config.controls.encoder.patternCycleIds, ['aurora'], 'authored dial order stays intact');
});

test('distinct section color and brightness also keep their independent startup appearance', () => {
  const config = twoGpioConfig({
    left: { patternId: 'fire', brightness: 0.35, customHue: 18 },
    right: { patternId: 'fire', brightness: 0.8, customHue: 160 },
  });
  const startup = config.looks.find(look => look.id === config.startupPatternId);
  assert.equal(startup?.mode, 'combo');
  assert.deepEqual(startup.zones.map(zone => [zone.patternId, zone.brightness, zone.customHue]), [
    ['fire', 0.35, 18],
    ['fire', 0.8, 160],
  ]);
});

test('identical section overrides still beat a different plain startup pattern', () => {
  const config = twoGpioConfig({ left: { patternId: 'fire' }, right: { patternId: 'fire' } });
  const startup = config.looks.find(look => look.id === config.startupPatternId);
  assert.equal(startup?.mode, 'combo');
  assert.deepEqual(startup.zones.map(zone => zone.patternId), ['fire', 'fire']);
});

test('explicit autoplay keeps its authored first global pattern and timed order', () => {
  const config = twoGpioConfig({ autoplay: true });
  assert.equal(config.startupPatternId, 'aurora');
  assert.equal(config.looks[0].mode, 'procedural');
  assert.deepEqual(config.playlist.entries.map(entry => entry.patternId), ['aurora']);
});

test('three unequal compiled GPIO runs keep their section patterns through compact card storage', () => {
  const counts = [7, 11, 19];
  const pins = [16, 17, 18];
  const patterns = ['fire', 'ocean', 'scanner'];
  const strips = counts.map((pixelCount, index) => ({ id: `strip-${index}`, name: `Strip ${index}`, pixelCount }));
  const wiring = makeDefaultWiring(strips);
  wiring.outputs = strips.map((strip, index) => ({
    id: `out${index + 1}`, name: `Output ${index + 1}`, pin: pins[index], runIds: [`run-${strip.id}`],
  }));
  const patchBoard = { patches: strips.map((strip, index) => ({
    id: `patch-${strip.id}`, name: strip.name,
    source: { type: 'strip', stripId: strip.id, startLed: 0, endLed: strip.pixelCount - 1 },
    output: { mode: 'normal' }, playback: { patternId: patterns[index] },
  })) };
  const compiledWiring = compileWiring({ wiring, strips });
  assert.equal(compiledWiring.ok, true);
  const runtime = buildCardRuntimePackageFromProject({
    projectName: 'Three GPIOs', strips, patchBoard, compiledWiring,
    standaloneController: { defaultLook: { patternId: 'aurora' } },
  });
  const config = JSON.parse(prepareCardStoragePayload(runtime).json);
  assert.deepEqual(config.led.outputs.map(output => [output.pin, output.pixels]), [[16, 7], [17, 11], [18, 19]]);
  assert.deepEqual(config.zones.map(zone => zone.patternId), patterns);
  const startup = config.looks.find(look => look.id === config.startupPatternId);
  assert.equal(startup.mode, 'combo');
  assert.deepEqual(startup.zones.map(zone => zone.patternId), patterns);

  const reloadedProject = JSON.parse(JSON.stringify({ strips, patchBoard, wiring }));
  const namedCombo = buildCardRuntimePackageFromProject({
    projectName: 'Three GPIOs',
    strips: reloadedProject.strips,
    patchBoard: reloadedProject.patchBoard,
    wiring: reloadedProject.wiring,
    standaloneController: {
      defaultLook: { patternId: 'aurora' },
      looks: [{
        id: 'saved-three-way', label: 'Three way', defaultLook: { patternId: 'aurora' },
        sectionLooks: Object.fromEntries(strips.map((strip, index) => [
          `patch-${strip.id}`, { patternId: patterns[index] },
        ])),
      }],
      playlist: [{ type: 'combo', lookId: 'saved-three-way' }],
    },
  }).config;
  const savedStartup = namedCombo.looks.find(look => look.id === namedCombo.startupPatternId);
  assert.equal(savedStartup.mode, 'combo');
  assert.deepEqual(savedStartup.zones.map(zone => zone.patternId), patterns);
});
