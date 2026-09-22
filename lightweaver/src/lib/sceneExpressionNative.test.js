import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { normalizeCardPlaylist } from './cardPlaylist.js';
import { normalizeSavedLooks } from './sectionLookModel.js';
import { compileWiring } from './wiringCompiler.js';
import { buildSceneExpressionAreaCatalog } from './sceneExpressionTargets.js';
import { compileSceneExpressionNative } from './sceneExpressionNative.js';

function cardColor(overrides = {}) {
  return {
    kind: 'card-controls', hueShift: 0, customHue: 32, customSaturation: 230,
    customBreathe: false, breatheLowerPct: 85, breatheUpperPct: 100,
    breatheCycleSeconds: 9, customDrift: false, ...overrides,
  };
}

function fixture(pixelCounts = [4, 4, 4]) {
  const ids = ['ribbon-left', 'ribbon-center', 'ribbon-right'];
  const strips = ids.map((id, index) => ({ id, name: id, pixelCount: pixelCounts[index] }));
  const wiring = {
    version: 1,
    locked: true,
    verified: true,
    outputs: [{ id: 'out1', pin: 16, runIds: ids.map(id => `run-${id}`) }],
    runs: ids.map((id, index) => ({
      id: `run-${id}`,
      type: 'strip',
      source: { stripId: id, from: 0, to: pixelCounts[index] - 1 },
      physicalDirection: 'source-forward',
      verified: true,
    })),
  };
  const compiledWiring = compileWiring({ wiring, strips });
  assert.equal(compiledWiring.ok, true);
  const layout = {
    strips,
    sectionFamilies: [{ id: 'ribbon-family', parentName: 'Ribbon', memberIds: ids }],
    layerGroups: [{ groupId: 'outer-pair', name: 'Outer pair', members: ['ribbon-left', 'ribbon-right'] }],
    compiledWiring,
  };
  return { ...layout, catalog: buildSceneExpressionAreaCatalog(layout) };
}

function scene(overrides = {}) {
  return {
    format: 'lightweaver-expression-scene', version: 1, id: 'sunset-gate', name: 'Sunset gate',
    defaults: {
      pattern: { rendererId: 'aurora', speed: 1 },
      color: cardColor(),
      intensity: { brightness: 0.7 },
    },
    steps: [
      {
        id: 'three-voices', label: 'Three voices', holdMs: 30000,
        transitionFromPrevious: { mode: 'cut', durationMs: 0 },
        assignments: [
          { selection: { areaIds: ['strip:ribbon-left'], domain: 'repeat' }, pattern: { rendererId: 'fire', speed: 0.6 }, color: { customHue: 20 } },
          { selection: { areaIds: ['strip:ribbon-center'], domain: 'repeat' }, pattern: { rendererId: 'breathe', speed: 0.4 }, color: { customHue: 140 } },
          { selection: { areaIds: ['strip:ribbon-right'], domain: 'repeat' }, pattern: { rendererId: 'comet', speed: 0.9 }, color: { customHue: 210 } },
        ],
      },
      {
        id: 'warm-shift', label: 'Warm shift', holdMs: 45000,
        transitionFromPrevious: { mode: 'cut', durationMs: 0 },
        assignments: [
          { selection: { areaIds: ['group:outer-pair'], domain: 'repeat' }, color: { customHue: 8 } },
          { selection: { areaIds: ['strip:ribbon-center'], domain: 'repeat' }, intensity: { brightness: 0.3 } },
        ],
      },
    ],
    loop: { mode: 'repeat' },
    ...overrides,
  };
}

function compile(source, fx = fixture()) {
  return compileSceneExpressionNative(source, {
    catalog: fx.catalog,
    strips: fx.strips,
    compiledWiring: fx.compiledWiring,
    projectId: 'project-expression',
    projectName: 'Expression fixture',
  });
}

function singleStripCoverageFixture({ partial = false, duplicate = false } = {}) {
  const strips = [{ id: 'only-strip', name: 'Only strip', pixelCount: 3 }];
  const wiring = {
    version: 1,
    locked: true,
    verified: true,
    outputs: [{ id: 'out1', pin: 16, runIds: ['run-only'] }],
    runs: [{
      id: 'run-only', type: 'strip',
      source: { stripId: 'only-strip', from: 0, to: partial ? 1 : 2 },
      physicalDirection: 'source-forward', verified: true,
    }],
  };
  const compiledWiring = compileWiring({ wiring, strips });
  assert.equal(compiledWiring.ok, true);
  if (duplicate) {
    compiledWiring.pixels.push({ ...compiledWiring.pixels[0], index: compiledWiring.pixels.length });
    compiledWiring.totalPixels = compiledWiring.pixels.length;
  }
  return {
    strips,
    compiledWiring,
    catalog: buildSceneExpressionAreaCatalog({ strips, compiledWiring }),
  };
}

test('native compiler emits existing combo-look and playlist shapes with exact per-zone behavior', () => {
  const fx = fixture([1365, 1365, 1366]);
  const input = scene();
  const before = structuredClone(input);
  const result = compile(input, fx);

  assert.equal(result.ok, true, JSON.stringify(result.reasons));
  assert.deepEqual(input, before, 'compile leaves editable source untouched');
  assert.equal(result.runtimePackage.config.led.pixels, 4096);
  assert.equal(result.storage.bytes <= result.storage.maxBytes, true);
  assert.equal(result.savedLooks.length, 2);
  assert.deepEqual(result.savedLooks.map(look => look.id), [
    'sunset-gate-three-voices',
    'sunset-gate-warm-shift',
  ]);
  assert.deepEqual(result.playlist.map(item => item.id), [
    'combo-sunset-gate-three-voices',
    'combo-sunset-gate-warm-shift',
  ]);
  assert.deepEqual(normalizeSavedLooks(result.savedLooks), result.savedLooks);
  assert.deepEqual(normalizeCardPlaylist(result.playlist, { savedLooks: result.savedLooks }), result.playlist);

  const rebuilt = buildCardRuntimePackageFromProject({
    projectId: 'project-expression', projectName: 'Expression fixture',
    strips: fx.strips, compiledWiring: fx.compiledWiring,
    standaloneController: result.controller,
  });
  assert.deepEqual(rebuilt.config.looks, result.runtimePackage.config.looks);
  assert.deepEqual(rebuilt.config.playlist, result.runtimePackage.config.playlist);

  const first = result.runtimePackage.config.looks[0];
  const zones = Object.fromEntries(first.zones.map(zone => [zone.id, zone]));
  assert.equal(zones['ribbon-left'].patternId, 'fire');
  assert.equal(zones['ribbon-left'].customHue, 20);
  assert.equal(zones['ribbon-center'].patternId, 'breathe');
  assert.equal(zones['ribbon-center'].customHue, 140);
  assert.equal(result.savedLooks[0].sectionLooks['ribbon-right'].patternId, 'comet');
  assert.equal(zones['ribbon-right'].patternId, 'meteor');
  assert.equal(zones['ribbon-right'].customHue, 210);
  assert.deepEqual(result.runtimePackage.config.playlist, {
    enabled: true,
    fadeMs: 0,
    entries: [
      { patternId: result.playlist[0].id, dwellSeconds: 30 },
      { patternId: result.playlist[1].id, dwellSeconds: 45 },
    ],
  });
});

test('native compiler preserves repeat-instance boundaries instead of flattening grouped patterns', () => {
  const groupedPattern = scene({
    steps: [{
      id: 'grouped-pattern', label: 'Grouped pattern', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['group:outer-pair'], domain: 'repeat' },
        pattern: { rendererId: 'comet', speed: 0.9 },
      }],
    }],
  });
  const grouped = compile(groupedPattern);
  assert.equal(grouped.ok, false);
  assert.ok(grouped.reasons.some(item => item.code === 'repeat-instance-native-unsupported'));
  assert.deepEqual(grouped.source.steps[0].assignments[0].selection.areaIds, ['group:outer-pair']);

  const explicitLeaves = compile(scene({
    steps: [{
      id: 'leaf-patterns', label: 'Leaf patterns', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['strip:ribbon-left', 'strip:ribbon-right'], domain: 'repeat' },
        pattern: { rendererId: 'comet', speed: 0.9 },
      }],
    }],
  }));
  assert.equal(explicitLeaves.ok, true, JSON.stringify(explicitLeaves.reasons));

  const groupedColor = compile(scene({
    steps: [{
      id: 'grouped-color', label: 'Grouped color', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['group:outer-pair'], domain: 'repeat' },
        color: { customHue: 8 },
      }],
    }],
  }));
  assert.equal(groupedColor.ok, true, JSON.stringify(groupedColor.reasons));
});

test('continuous, nonzero transition, full palette, and unsupported movement report reasons without reducing source', () => {
  const source = scene({
    steps: [{
      id: 'unsupported', label: 'Unsupported', holdMs: 30000,
      transitionFromPrevious: { mode: 'dip-swap-rise', durationMs: 1500 },
      assignments: [{
        selection: { areaIds: ['family:ribbon-family'], domain: 'continuous' },
        pattern: { rendererId: 'comet', movement: { kind: 'lab-transform', amount: 0.8 } },
        color: { kind: 'palette', colors: ['#ff0000', '#0000ff'] },
      }],
    }],
  });
  const result = compile(source);
  assert.equal(result.ok, false);
  assert.deepEqual(new Set(result.reasons.map(reason => reason.code)), new Set([
    'continuous-native-unsupported',
    'transition-native-unsupported',
    'movement-native-unsupported',
    'palette-native-unsupported',
  ]));
  assert.deepEqual(result.source.steps[0].assignments[0].color.colors, ['#ff0000', '#0000ff']);
  assert.equal(result.runtimePackage, null);
});

test('missing or changed Layout IDs block compilation but preserve the normalized draft', () => {
  const source = scene({
    steps: [{
      id: 'missing', label: 'Missing', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['strip:removed'], domain: 'repeat' },
        pattern: { rendererId: 'fire' },
      }],
    }],
  });
  const result = compile(source);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some(reason => reason.code === 'unresolved-areas'));
  assert.deepEqual(result.source.steps[0].assignments[0].selection.areaIds, ['strip:removed']);
});

test('native compilation requires every authored source pixel exactly once', () => {
  const source = scene({
    steps: [{
      id: 'coverage', label: 'Coverage', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 }, assignments: [],
    }],
  });

  const missing = compile(source, singleStripCoverageFixture({ partial: true }));
  assert.equal(missing.ok, false);
  assert.ok(missing.reasons.some(item => item.code === 'physical-coverage-incomplete'));

  const duplicate = compile(source, singleStripCoverageFixture({ duplicate: true }));
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.reasons.some(item => item.code === 'physical-coverage-duplicate'));
});

test('native Movement accepts only the exact empty native shape', () => {
  const withMovement = movement => scene({
    steps: [{
      id: 'movement-shape', label: 'Movement shape', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['all'], domain: 'repeat' },
        pattern: { movement },
      }],
    }],
  });

  const scalarParams = compile(withMovement({ kind: 'native', params: 0 }));
  assert.equal(scalarParams.ok, false);
  assert.ok(scalarParams.reasons.some(item => item.code === 'movement-native-unsupported'));
  assert.equal(scalarParams.source.steps[0].assignments[0].pattern.movement.params, 0);

  const unknownField = compile(withMovement({ kind: 'native', params: {}, easing: 'linear' }));
  assert.equal(unknownField.ok, false);
  assert.ok(unknownField.reasons.some(item => item.code === 'movement-native-unsupported'));
  assert.equal(unknownField.source.steps[0].assignments[0].pattern.movement.easing, 'linear');

  const exactNative = compile(withMovement({ kind: 'native', params: {} }));
  assert.equal(exactNative.ok, true, JSON.stringify(exactNative.reasons));
});

test('native card color values reject lossy clamping and unknown visual fields', () => {
  const source = scene({
    defaults: {
      pattern: { rendererId: 'aurora', speed: 1, spatialScale: 2 },
      color: cardColor({ customHue: 300, blendMode: 'screen' }),
      intensity: { brightness: 0.7, floor: 0.1 },
    },
    steps: [{
      id: 'invalid-native', label: 'Invalid native', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [],
    }],
  });
  const result = compile(source);
  assert.equal(result.ok, false);
  assert.deepEqual(new Set(result.reasons.map(item => item.code)), new Set([
    'pattern-field-native-unsupported',
    'color-field-native-unsupported',
    'color-value-native-invalid',
    'intensity-field-native-unsupported',
  ]));
  assert.equal(result.source.defaults.color.customHue, 300);
  assert.equal(result.runtimePackage, null);
});

test('capacity gates use current saved-look and compact runtime helpers', () => {
  const unsupportedClock = compile(scene({
    steps: [{
      id: 'fractional', label: 'Fractional', holdMs: 1250,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 }, assignments: [],
    }],
    loop: { mode: 'once' },
  }));
  assert.equal(unsupportedClock.ok, false);
  assert.ok(unsupportedClock.reasons.some(reason => reason.code === 'hold-native-unsupported'));
  assert.ok(unsupportedClock.reasons.some(reason => reason.code === 'loop-native-unsupported'));

  const steps = Array.from({ length: 13 }, (_, index) => ({
    id: `step-${index + 1}`,
    label: `Step ${index + 1}`,
    holdMs: 1000,
    transitionFromPrevious: { mode: 'cut', durationMs: 0 },
    assignments: [],
  }));
  const tooMany = compile(scene({ steps }));
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.reasons.some(reason => reason.code === 'saved-look-capacity'));

  const verbose = compile(scene({
    name: 'X'.repeat(700),
    steps: Array.from({ length: 12 }, (_, index) => ({
      id: `verbose-${index + 1}`,
      label: `${index + 1}-${'Y'.repeat(700)}`,
      holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [],
    })),
  }));
  assert.equal(verbose.ok, false);
  assert.ok(verbose.reasons.some(reason => reason.code === 'config-too-large'));
});
