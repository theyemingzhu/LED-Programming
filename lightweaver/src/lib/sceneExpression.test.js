import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSceneExpression,
  resolveSceneExpression,
} from './sceneExpression.js';
import { buildSceneExpressionAreaCatalog } from './sceneExpressionTargets.js';

function fixtureCatalog({ missingCenter = false } = {}) {
  const strips = [
    { id: 'ribbon-left', name: 'Left', pixelCount: 2 },
    ...(!missingCenter ? [{ id: 'ribbon-center', name: 'Center', pixelCount: 2 }] : []),
    { id: 'ribbon-right', name: 'Right', pixelCount: 2 },
    { id: 'petal-a', name: 'Petal A', pixelCount: 1 },
    { id: 'petal-b', name: 'Petal B', pixelCount: 1 },
  ];
  return buildSceneExpressionAreaCatalog({
    strips,
    sectionFamilies: [{
      id: 'ribbon-family',
      parentName: 'Ribbon',
      memberIds: ['ribbon-left', 'ribbon-center', 'ribbon-right'],
    }],
    layerGroups: [
      { groupId: 'petals', name: 'Petals', members: ['petal-a', 'petal-b'] },
      { groupId: 'ribbon-pair', name: 'Ribbon pair', members: ['ribbon-left', 'ribbon-center'] },
    ],
  });
}

function cardColor(overrides = {}) {
  return {
    kind: 'card-controls',
    hueShift: 0,
    customHue: 32,
    customSaturation: 230,
    customBreathe: false,
    breatheLowerPct: 85,
    breatheUpperPct: 100,
    breatheCycleSeconds: 9,
    customDrift: false,
    ...overrides,
  };
}

function baseScene(overrides = {}) {
  return {
    format: 'lightweaver-expression-scene',
    version: 1,
    id: 'sunset-gate',
    name: 'Sunset gate',
    defaults: {
      pattern: { rendererId: 'aurora', speed: 1 },
      color: cardColor(),
      intensity: { brightness: 0.7 },
    },
    steps: [{
      id: 'opening',
      label: 'Opening',
      holdMs: 30000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [],
    }],
    loop: { mode: 'repeat' },
    ...overrides,
  };
}

test('normalization preserves unresolved Layout IDs and unsupported visual intent without mutating source', () => {
  const source = baseScene({
    steps: [{
      id: 'draft',
      label: 'Draft',
      holdMs: 1250,
      transitionFromPrevious: { mode: 'dip-swap-rise', durationMs: 750 },
      assignments: [{
        selection: { areaIds: ['strip:removed-section'], domain: 'continuous' },
        pattern: { rendererId: 'aurora', movement: { kind: 'lab-transform', amount: 0.75 } },
        color: { kind: 'palette', colors: ['#112233', '#abcdef'] },
      }],
    }],
  });
  const before = structuredClone(source);
  const normalized = normalizeSceneExpression(source);

  assert.deepEqual(source, before);
  assert.notEqual(normalized, source);
  assert.deepEqual(normalized.steps[0].assignments[0].selection.areaIds, ['strip:removed-section']);
  assert.deepEqual(normalized.steps[0].assignments[0].pattern.movement, { kind: 'lab-transform', amount: 0.75 });
  assert.deepEqual(normalized.steps[0].assignments[0].color, { kind: 'palette', colors: ['#112233', '#abcdef'] });

  const resolved = resolveSceneExpression(normalized, fixtureCatalog());
  assert.equal(resolved.ok, false);
  assert.ok(resolved.reasons.some(reason => reason.code === 'unresolved-areas'));
  assert.deepEqual(resolved.source.steps[0].assignments[0].selection.areaIds, ['strip:removed-section']);
});

test('assignments inherit independent leaf fields with all, family/group, then strip precedence', () => {
  const source = baseScene({
    steps: [{
      id: 'voices', label: 'Three voices', holdMs: 30000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [
        { selection: { areaIds: ['all'], domain: 'repeat' }, color: { customHue: 10 } },
        { selection: { areaIds: ['family:ribbon-family'], domain: 'repeat' }, pattern: { rendererId: 'fire', speed: 1.2 } },
        { selection: { areaIds: ['strip:ribbon-center'], domain: 'repeat' }, pattern: { speed: 0.45 } },
        { selection: { areaIds: ['group:petals'], domain: 'repeat' }, intensity: { brightness: 0.25 } },
      ],
    }],
  });

  const result = resolveSceneExpression(source, fixtureCatalog());
  assert.equal(result.ok, true);
  const states = result.steps[0].states;
  assert.equal(states['ribbon-left'].pattern.rendererId, 'fire');
  assert.equal(states['ribbon-left'].pattern.speed, 1.2);
  assert.equal(states['ribbon-center'].pattern.rendererId, 'fire');
  assert.equal(states['ribbon-center'].pattern.speed, 0.45);
  assert.equal(states['ribbon-right'].color.customHue, 10);
  assert.equal(states['petal-a'].pattern.rendererId, 'aurora');
  assert.equal(states['petal-a'].intensity.brightness, 0.25);
});

test('adapter overlap inside one selection and same-specificity field overlap across assignments stay distinct', () => {
  const withinSelection = baseScene({
    steps: [{
      id: 'bad-selection', label: 'Bad selection', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['family:ribbon-family', 'strip:ribbon-left'], domain: 'repeat' },
        pattern: { rendererId: 'fire' },
      }],
    }],
  });
  const within = resolveSceneExpression(withinSelection, fixtureCatalog());
  assert.equal(within.ok, false);
  assert.ok(within.reasons.some(reason => reason.code === 'overlapping-areas'));

  const acrossAssignments = baseScene({
    steps: [{
      id: 'ambiguous', label: 'Ambiguous', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [
        { selection: { areaIds: ['family:ribbon-family'], domain: 'repeat' }, pattern: { rendererId: 'fire' } },
        { selection: { areaIds: ['group:ribbon-pair'], domain: 'repeat' }, pattern: { rendererId: 'ocean' } },
      ],
    }],
  });
  const across = resolveSceneExpression(acrossAssignments, fixtureCatalog());
  assert.equal(across.ok, false);
  assert.ok(across.reasons.some(reason => reason.code === 'ambiguous-assignment'
    && reason.stripId === 'ribbon-left'
    && reason.field === 'pattern.rendererId'));
});

test('step order controls inheritance while stable step IDs survive reorder', () => {
  const patternStep = {
    id: 'pattern', label: 'Pattern', holdMs: 1000,
    transitionFromPrevious: { mode: 'cut', durationMs: 0 },
    assignments: [{
      selection: { areaIds: ['all'], domain: 'repeat' },
      pattern: { rendererId: 'fire' },
    }],
  };
  const colorStep = {
    id: 'color', label: 'Color', holdMs: 1000,
    transitionFromPrevious: { mode: 'cut', durationMs: 0 },
    assignments: [{
      selection: { areaIds: ['strip:ribbon-center'], domain: 'repeat' },
      color: { customHue: 180 },
    }],
  };

  const forward = resolveSceneExpression(baseScene({ steps: [patternStep, colorStep] }), fixtureCatalog());
  const reversed = resolveSceneExpression(baseScene({ steps: [colorStep, patternStep] }), fixtureCatalog());
  assert.deepEqual(forward.steps.map(step => step.id), ['pattern', 'color']);
  assert.deepEqual(reversed.steps.map(step => step.id), ['color', 'pattern']);
  assert.equal(forward.steps[1].states['ribbon-center'].pattern.rendererId, 'fire');
  assert.equal(reversed.steps[0].states['ribbon-center'].pattern.rendererId, 'aurora');
  assert.equal(reversed.steps[1].states['ribbon-center'].color.customHue, 180);
});

test('changed family membership preserves source and blocks current resolution', () => {
  const source = baseScene({
    steps: [{
      id: 'family', label: 'Family', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['family:ribbon-family'], domain: 'repeat' },
        pattern: { rendererId: 'fire' },
      }],
    }],
  });
  const normalized = normalizeSceneExpression(source);
  const result = resolveSceneExpression(normalized, fixtureCatalog({ missingCenter: true }));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some(reason => reason.code === 'unresolved-areas'));
  assert.deepEqual(result.source, normalized);
});

test('JSON extension keys cannot traverse Object.prototype during assignment resolution', () => {
  delete Object.prototype.expressionProbe;
  const source = baseScene({
    steps: [{
      id: 'prototype-key', label: 'Prototype key', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['strip:ribbon-left'], domain: 'repeat' },
        pattern: JSON.parse('{"__proto__":{"expressionProbe":true}}'),
      }],
    }],
  });

  try {
    const result = resolveSceneExpression(source, fixtureCatalog());
    assert.equal(result.ok, true);
    assert.equal(Object.prototype.expressionProbe, undefined);
    assert.equal(Object.hasOwn(result.steps[0].states['ribbon-left'].pattern, '__proto__'), true);
    assert.deepEqual(result.steps[0].states['ribbon-left'].pattern.__proto__, { expressionProbe: true });
  } finally {
    delete Object.prototype.expressionProbe;
  }
});

test('constructor/prototype and literal dotted extension keys remain own distinct JSON fields', () => {
  const pattern = JSON.parse(`{
    "constructor":{"prototype":{"safe":true}},
    "motion.phase":0.4,
    "motion":{"phase":0.8}
  }`);
  const result = resolveSceneExpression(baseScene({
    steps: [{
      id: 'special-keys', label: 'Special keys', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['strip:ribbon-left'], domain: 'repeat' },
        pattern,
      }],
    }],
  }), fixtureCatalog());

  assert.equal(result.ok, true, JSON.stringify(result.reasons));
  const resolved = result.steps[0].states['ribbon-left'].pattern;
  assert.equal(Object.hasOwn(resolved, 'constructor'), true);
  assert.deepEqual(resolved.constructor, { prototype: { safe: true } });
  assert.equal(Object.prototype.safe, undefined);
  assert.equal(resolved['motion.phase'], 0.4);
  assert.deepEqual(resolved.motion, { phase: 0.8 });
});

test('ordinary nested extension leaves inherit independently across steps', () => {
  const result = resolveSceneExpression(baseScene({
    steps: [
      {
        id: 'nested-one', label: 'Nested one', holdMs: 1000,
        transitionFromPrevious: { mode: 'cut', durationMs: 0 },
        assignments: [{
          selection: { areaIds: ['strip:ribbon-left'], domain: 'repeat' },
          pattern: { tuning: { phase: 0.2, depth: 0.7 } },
        }],
      },
      {
        id: 'nested-two', label: 'Nested two', holdMs: 1000,
        transitionFromPrevious: { mode: 'cut', durationMs: 0 },
        assignments: [{
          selection: { areaIds: ['strip:ribbon-left'], domain: 'repeat' },
          pattern: { tuning: { phase: 0.9 } },
        }],
      },
    ],
  }), fixtureCatalog());

  assert.equal(result.ok, true);
  assert.deepEqual(result.steps[1].states['ribbon-left'].pattern.tuning, { phase: 0.9, depth: 0.7 });
});
