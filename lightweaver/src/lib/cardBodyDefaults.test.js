// The Save-to-card body is capped at 3968 bytes. Studio leaves out fields the
// card fills in itself with the same value. These tests keep that honest:
// the defaults are read from the firmware source (never typed twice), the real
// 2026-11-24 card project shrinks and fits a one-strip change, and the card's
// own read-back of the shorter body adopts into identical looks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareCardDeployment } from './cardDeployment.js';
import {
  CARD_CONFIG_STORAGE_LIMIT_BYTES,
  CARD_FIRMWARE_DEFAULTS,
  compactCardStorageConfig,
  prepareCardStoragePayload,
} from './cardStoragePayload.js';
import { reconstructInstalledCardState } from './cardProjectAdoption.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const firmwareSrc = path.resolve(here, '../../../firmware/lightweaver-controller/src');
const read = file => fs.readFileSync(path.join(firmwareSrc, file), 'utf8');
const storage = read('LightweaverStorage.cpp');
const fixturePath = path.resolve(here, '../../tests/fixtures/real-card-project-2026-11-24.json');
const realProject = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const byteLength = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));

function prepared(snapshot) {
  return prepareCardDeployment({
    projectId: snapshot.id,
    projectName: snapshot.name,
    projectRevision: 1,
    projectFingerprint: 'a'.repeat(64),
    strips: snapshot.layout?.strips || [],
    patchBoard: snapshot.layout?.patchBoard,
    wiring: snapshot.layout?.wiring,
    symmetry: snapshot.layout?.symmetry || null,
    sidesMirrored: snapshot.pattern?.sidesMirrored !== false,
    standaloneController: snapshot.devices?.standaloneController,
  });
}

// ---- 1. the defaults, read from the firmware ------------------------------

// `encoder["a"] | 4` or `controlsJson["previous"] | 7` inside applyJsonToConfig.
function firmwareDefault(source, expression) {
  const match = source.match(new RegExp(`${expression.replace(/[[\]]/g, '\\$&')}\\s*\\|\\s*([^;,)\\s]+)`));
  assert.ok(match, `firmware no longer has a default for ${expression}`);
  return match[1];
}

test('control defaults Studio leaves out equal the firmware defaults', () => {
  const applyJson = storage.slice(storage.indexOf('void applyJsonToConfig'));
  const wanted = {
    a: ['encoder["a"]', 4], b: ['encoder["b"]', 5], press: ['encoder["press"]', 0],
    alternatePress: ['encoder["alternatePress"]', 6], brightnessStep: ['encoder["brightnessStep"]', 18],
    previous: ['controlsJson["previous"]', 7], next: ['controlsJson["next"]', 8],
    blackout: ['controlsJson["blackout"]', 9], brightness: ['controlsJson["brightness"]', -1],
  };
  for (const [field, [expression, expected]] of Object.entries(wanted)) {
    assert.equal(Number(firmwareDefault(applyJson, expression)), expected, field);
  }
  assert.match(applyJson, /encoder\["rotateDirection"\] \| "clockwise-brighter"/);
  const pin = read('LightweaverTypes.h').match(/DEFAULT_STATUS_LED_PIN\s*=\s*(\d+)/);
  assert.equal(Number(pin[1]), 2);

  const { encoder, ...flat } = CARD_FIRMWARE_DEFAULTS.controls;
  assert.deepEqual({ ...encoder, ...flat }, {
    a: 4, b: 5, press: 0, alternatePress: 6, rotateDirection: 'clockwise-brighter', brightnessStep: 18,
    previous: 7, next: 8, blackout: 9, brightness: -1, statusLed: 2,
  });
});

test('output colour defaults Studio leaves out equal the firmware defaults', () => {
  const header = read('LightweaverOutputColorConfig.h');
  const value = name => header.match(new RegExp(`${name}\\s*=\\s*([^;]+);`))[1].trim();
  assert.equal(value('gammaEnabled'), String(CARD_FIRMWARE_DEFAULTS.led.outputGammaEnabled));
  assert.equal(parseFloat(value('gammaValue')), CARD_FIRMWARE_DEFAULTS.led.outputGammaValue);
  for (const channel of ['red', 'green', 'blue']) {
    assert.equal(parseFloat(value(channel)), CARD_FIRMWARE_DEFAULTS.led.calibration[channel], channel);
  }
  // A missing led.calibration object is not an error in the parser: it starts
  // from the struct defaults above and only overwrites fields that are present.
  const parser = read('LightweaverOutputColorParser.cpp');
  assert.match(parser, /OutputColorConfig parsed;/);
  assert.match(parser, /if \(hasField\(led, "calibration"\)\)/);
  assert.match(parser, /if \(hasField\(led, "outputGammaEnabled"\)\)/);
});

test('colour order and config mode defaults equal the firmware defaults', () => {
  assert.match(storage, /config\.ledColorOrder = String\(led\["colorOrder"\] \| "RGB"\)/);
  assert.equal(CARD_FIRMWARE_DEFAULTS.led.colorOrder, 'RGB');
  // The wiring digest reads colorOrder through the same default, so leaving it
  // out cannot change the digest.
  assert.match(storage, /canonicalLed\["colorOrder"\] = String\(doc\["led"\]\["colorOrder"\] \| "RGB"\)/);
  assert.match(storage, /doc\["mode"\] \| \(source == SOURCE_SD \? "sd-sequence" : "website-flash"\)/);
  assert.equal(CARD_FIRMWARE_DEFAULTS.mode, 'website-flash');
});

test('a look section label is only echoed back by the card, never used to play', () => {
  // The firmware defaults the label to the id...
  assert.match(storage, /zone\.label = String\(zoneJson\["label"\] \| zone\.id\.c_str\(\)\)/);
  // ...and nothing in the renderer, the zone matcher or the validators reads it.
  const main = read('main.cpp');
  assert.doesNotMatch(main, /lookZone\.label|look\.zones\[[^\]]*\]\.label/);
  const validate = storage.slice(storage.indexOf('bool validateRuntimeConfigJsonStrict'));
  assert.doesNotMatch(validate, /lookZone\["label"\]|zoneValue\["label"\]/);
});

// ---- 2. the compaction itself ---------------------------------------------

function fullConfig() {
  return {
    mode: 'website-flash',
    led: {
      type: 'WS2812B', pixels: 4, colorOrder: 'RGB', maxMilliamps: 2000,
      outputGammaEnabled: false, outputGammaValue: 2.2, calibration: { red: 1, green: 1, blue: 1 },
      outputs: [{ id: 'out1', pin: 18, pixels: 4 }],
    },
    controls: {
      encoder: { a: 4, b: 5, press: 6, alternatePress: -1, rotateDirection: 'clockwise-brighter', brightnessStep: 18 },
      previous: 7, next: 8, blackout: 9, brightness: -1, statusLed: 2,
    },
    looks: [{ id: 'l', label: 'L', mode: 'combo', brightness: 1, zones: [
      { id: 'z1', label: 'Zone 1', patternId: 'fire' },
      { id: 'z2', label: 'Custom', patternId: 'fire' },
      { id: 'z3', label: 'Zone 3', patternId: 'fire' },
    ] }],
    startupPatternId: 'l',
    zones: [
      { id: 'z1', label: 'Zone 1', patternId: 'fire', ranges: [{ start: 0, count: 2 }] },
      { id: 'z2', label: 'Zone 2', patternId: 'fire', ranges: [{ start: 2, count: 1 }] },
      { id: 'z3', label: 'Zone 3', patternId: 'fire', ranges: [{ start: 3, count: 1 }] },
    ],
  };
}

test('compaction leaves out exactly the fields equal to the card defaults', () => {
  const body = compactCardStorageConfig(fullConfig());
  assert.equal(body.mode, undefined);
  assert.equal(body.led.colorOrder, undefined);
  assert.equal(body.led.outputGammaEnabled, undefined);
  assert.equal(body.led.outputGammaValue, undefined);
  assert.equal(body.led.calibration, undefined);
  // Not defaults, or bound into the wiring digest: kept.
  assert.equal(body.led.type, 'WS2812B');
  assert.equal(body.led.maxMilliamps, 2000);
  assert.deepEqual(body.controls, { encoder: { press: 6, alternatePress: -1 } });
  // A look section label survives only where it differs from the card's own.
  assert.equal(body.looks[0].zones[0].label, undefined);
  assert.equal(body.looks[0].zones[1].label, 'Custom');
  assert.equal(body.zones[0].label, 'Zone 1');
});

test('compaction keeps every value that is not the card default', () => {
  const config = fullConfig();
  config.mode = 'sd-sequence';
  config.led.colorOrder = 'GRB';
  config.led.outputGammaEnabled = true;
  config.led.outputGammaValue = 2.4;
  config.led.calibration = { red: 1, green: 0.9, blue: 1 };
  config.controls.encoder.a = 10;
  config.controls.statusLed = 48;
  const body = compactCardStorageConfig(config);
  assert.equal(body.mode, 'sd-sequence');
  assert.equal(body.led.colorOrder, 'GRB');
  assert.equal(body.led.outputGammaEnabled, true);
  assert.equal(body.led.outputGammaValue, 2.4);
  assert.deepEqual(body.led.calibration, { red: 1, green: 0.9, blue: 1 });
  assert.equal(body.controls.encoder.a, 10);
  assert.equal(body.controls.statusLed, 48);
});

test('a look section label is kept when the card has no live section of that id', () => {
  const config = fullConfig();
  config.looks[0].zones.push({ id: 'ghost', label: 'Ghost', patternId: 'fire' });
  assert.equal(compactCardStorageConfig(config).looks[0].zones[3].label, 'Ghost');
});

test('compaction does not change the package Studio keeps', () => {
  const config = fullConfig();
  const before = JSON.stringify(config);
  compactCardStorageConfig(config);
  assert.equal(JSON.stringify(config), before);
});

// ---- 3. the real project --------------------------------------------------

test('the real 2026-11-24 card project body shrinks by at least 20 percent', () => {
  const { config, bytes } = prepareCardStoragePayload(prepared(realProject()).runtimePackage, { maxBytes: 1e9 });
  assert.equal(byteLength(JSON.stringify(config)), bytes);
  // Measured before this change with the same inputs: 3895 bytes.
  assert.ok(bytes <= 3895 - 780, `body is ${bytes} bytes`);
  assert.ok(bytes < CARD_CONFIG_STORAGE_LIMIT_BYTES);
});

function withStripTwoOcean(snapshot) {
  const project = JSON.parse(JSON.stringify(snapshot));
  const controller = project.devices.standaloneController;
  for (const look of controller.looks) {
    if (look.sectionLooks?.['patch-strip-2']) {
      // Ocean with the tuning an owner sets on it, in every look that shows strip 2.
      look.sectionLooks['patch-strip-2'] = {
        patternId: 'ocean', brightness: 0.8, speed: 1.2, hueShift: 20, customHue: 40, customSaturation: 200,
      };
    }
  }
  return project;
}

test('the real project with strip 2 changed to Ocean fits under 3968', () => {
  const { runtimePackage } = prepared(withStripTwoOcean(realProject()));
  const { bytes } = prepareCardStoragePayload(runtimePackage);
  assert.ok(bytes < CARD_CONFIG_STORAGE_LIMIT_BYTES, `body is ${bytes} bytes`);
  // The test means something only if the change was refused before. Measured
  // with the previous compaction on the same inputs: 4293 bytes, over the cap.
  const BEFORE = 4293;
  assert.ok(BEFORE > CARD_CONFIG_STORAGE_LIMIT_BYTES);
  assert.ok(bytes <= BEFORE - 800, `saved only ${BEFORE - bytes} bytes`);
});

// ---- 4. round trip through the card read-back and adoption -----------------

// What the card reports back for a stored body: every omitted field filled with
// the firmware default the tests above pin, every look section label defaulted
// to its id. This is the card's own read-back (/api/patterns) in miniature.
function cardReadBack(body) {
  const looks = body.looks.map(look => ({
    id: look.id,
    label: look.label ?? look.id,
    mode: look.mode ?? 'procedural',
    runtimePatternId: look.preset ?? look.id,
    preset: look.preset ?? look.id,
    zones: (look.zones || []).map(zone => ({
      id: zone.id,
      label: zone.label ?? zone.id,
      patternId: zone.patternId ?? 'aurora',
      brightness: zone.brightness ?? 1,
      speed: zone.speed ?? 1,
      hueShift: zone.hueShift ?? 0,
      customHue: zone.customHue ?? 32,
      customSaturation: zone.customSaturation ?? 230,
      customBreathe: zone.customBreathe ?? false,
      breatheLowerPct: zone.breatheLowerPct ?? 85,
      breatheUpperPct: zone.breatheUpperPct ?? 100,
      breatheCycleSeconds: zone.breatheCycleSeconds ?? 9,
      customDrift: zone.customDrift ?? false,
    })),
  }));
  const zones = body.zones.map(zone => ({
    ...zone,
    brightness: zone.brightness ?? 1,
    speed: zone.speed ?? 1,
    hueShift: zone.hueShift ?? 0,
    customHue: zone.customHue ?? 32,
    customSaturation: zone.customSaturation ?? 230,
    customBreathe: zone.customBreathe ?? false,
    breatheLowerPct: zone.breatheLowerPct ?? 85,
    breatheUpperPct: zone.breatheUpperPct ?? 100,
    breatheCycleSeconds: zone.breatheCycleSeconds ?? 9,
    customDrift: zone.customDrift ?? false,
  }));
  return { patterns: { currentId: looks[0].id, patterns: looks }, zones: { startupPatternId: body.startupPatternId, zones } };
}

function adoptedLooks(config, skeleton) {
  const { patterns, zones } = cardReadBack(config);
  const state = reconstructInstalledCardState({ skeleton, patterns, zones, cardId: 'lw-b0fe81f61b44' });
  return state.devices.standaloneController.looks.map(({ id, label, defaultLook, sectionLooks }) => (
    { id, label, defaultLook, sectionLooks }
  ));
}

test('the shorter body is adopted back into identical looks', () => {
  const snapshot = realProject();
  const { runtimePackage } = prepared(snapshot);
  const skeleton = { strips: snapshot.layout.strips, patchBoard: snapshot.layout.patchBoard, wiring: snapshot.layout.wiring };

  const shortBody = prepareCardStoragePayload(runtimePackage, { maxBytes: 1e9 }).config;
  // The old body: the same compaction without the five new omissions.
  const longBody = JSON.parse(JSON.stringify(runtimePackage.config));
  for (const look of longBody.looks) delete look.patterns;
  const fromShort = adoptedLooks(shortBody, skeleton);
  const fromLong = adoptedLooks(longBody, skeleton);

  assert.equal(fromShort.length, 6);
  assert.deepEqual(fromShort, fromLong);
  // The looks themselves, not just their count: the Ocean-free originals.
  assert.deepEqual(fromShort.map(look => look.label), longBody.looks.map(look => look.label));
});

test('the card stores the same looks and zones from the shorter body', () => {
  const { runtimePackage } = prepared(realProject());
  const shortBody = prepareCardStoragePayload(runtimePackage, { maxBytes: 1e9 }).config;
  const full = runtimePackage.config;
  const shortBack = cardReadBack(shortBody);
  const fullBack = cardReadBack(full);
  // Every play-affecting field of every look section and every live section.
  const strip = back => JSON.parse(JSON.stringify(back, (key, value) => (key === 'label' ? undefined : value)));
  assert.deepEqual(strip(shortBack.patterns), strip(fullBack.patterns));
  assert.deepEqual(strip(shortBack.zones), strip(fullBack.zones));
  // Live section labels (shown on the card's own page) are untouched.
  assert.deepEqual(shortBack.zones.zones.map(zone => zone.label), fullBack.zones.zones.map(zone => zone.label));
});
