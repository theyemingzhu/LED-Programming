import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addSceneStep,
  createSceneExpression,
  effectiveSceneFlowAt,
  moveSceneStep,
  moveSceneFlowArea,
  patchOrCreateSceneAssignment,
  patchSceneAssignment,
  repeatPatternPerSectionAreaIds,
  repeatSceneAssignmentPerSection,
  reverseSceneFlowArea,
  scenePreviewAvailability,
  scenePlaybackAt,
  setSceneAssignmentDomain,
  selectionDisplayState,
} from './sceneExpressionEditorModel.js';
import { applyPatternPreviewSegmentLooks } from '../lib/patternPiecePreview.js';

test('field patches preserve sibling pattern, color, and unknown source fields', () => {
  const scene = createSceneExpression({ id: 'scene-1', name: 'Quiet tide' });
  scene.steps[0].assignments.push({
    selection: { areaIds: ['strip:first'], domain: 'repeat' },
    pattern: { rendererId: 'aurora', speed: 1 }, color: structuredClone(scene.defaults.color),
  });
  scene.steps[0].assignments[0].futureField = { untouched: true };
  const originalColor = structuredClone(scene.steps[0].assignments[0].color);
  const patternEdit = patchSceneAssignment(scene, scene.steps[0].id, 0, {
    pattern: { rendererId: 'fire' },
  });
  assert.deepEqual(patternEdit.steps[0].assignments[0].color, originalColor);
  assert.deepEqual(patternEdit.steps[0].assignments[0].futureField, { untouched: true });

  const originalPattern = structuredClone(patternEdit.steps[0].assignments[0].pattern);
  const colorEdit = patchSceneAssignment(patternEdit, patternEdit.steps[0].id, 0, {
    color: { customHue: 190 },
  });
  assert.deepEqual(colorEdit.steps[0].assignments[0].pattern, originalPattern);
  assert.equal(colorEdit.steps[0].assignments[0].color.customHue, 190);
});

test('adding and moving steps preserves stable IDs and ordered source', () => {
  const scene = createSceneExpression({ id: 'scene-1', name: 'Quiet tide' });
  const added = addSceneStep(scene, { id: 'scene-1-step-2' });
  assert.deepEqual(added.steps.map(step => step.id), ['scene-1-step-1', 'scene-1-step-2']);
  const moved = moveSceneStep(added, 'scene-1-step-2', -1);
  assert.deepEqual(moved.steps.map(step => step.id), ['scene-1-step-2', 'scene-1-step-1']);
});

test('playback changes steps exactly at hold boundaries and loops', () => {
  const scene = createSceneExpression({ id: 'clock' });
  scene.steps[0].holdMs = 1000;
  const two = addSceneStep(scene, { id: 'clock-step-2' });
  two.steps[1].holdMs = 2000;
  assert.deepEqual(scenePlaybackAt(two, 999), { stepIndex: 0, stepId: 'clock-step-1', localMs: 999, totalMs: 3000, ended: false });
  assert.deepEqual(scenePlaybackAt(two, 1000), { stepIndex: 1, stepId: 'clock-step-2', localMs: 0, totalMs: 3000, ended: false });
  assert.deepEqual(scenePlaybackAt(two, 3001), { stepIndex: 0, stepId: 'clock-step-1', localMs: 1, totalMs: 3000, ended: false });
  two.loop.mode = 'once';
  assert.deepEqual(scenePlaybackAt(two, 3001), { stepIndex: 1, stepId: 'clock-step-2', localMs: 2000, totalMs: 3000, ended: true });
});

test('an inherited sparse step gains only the field the owner edits', () => {
  const scene = createSceneExpression({ id: 'sparse' });
  scene.steps[0].assignments = [];
  const next = patchOrCreateSceneAssignment(scene, scene.steps[0].id, 0, { color: { customHue: 71 } });
  assert.deepEqual(next.steps[0].assignments, [{
    selection: { areaIds: ['all'], domain: 'repeat' },
    color: { customHue: 71 },
  }]);
});

test('firmware preview modifiers apply hue, breathe, and drift deterministically', () => {
  const segment = { pixels: [{}, {}], visualLook: {
    customHue: 90, customSaturation: 180, hueShift: 12,
    customBreathe: true, breatheLowerPct: 40, breatheUpperPct: 80,
    breatheCycleSeconds: 8, customDrift: true, speed: 1,
  } };
  const beginning = [{ r: 220, g: 80, b: 20 }, { r: 20, g: 130, b: 230 }];
  const later = structuredClone(beginning);
  applyPatternPreviewSegmentLooks(beginning, [segment], 0);
  applyPatternPreviewSegmentLooks(later, [segment], 2300);
  assert.deepEqual(beginning, [{ r: 88, g: 25, b: 34 }, { r: 26, g: 91, b: 92 }]);
  assert.deepEqual(later, [{ r: 142, g: 91, b: 40 }, { r: 42, g: 77, b: 149 }]);
});

test('preview gate rejects source that the editor cannot render truthfully', () => {
  const scene = createSceneExpression({ id: 'gate' });
  scene.steps[0].assignments.push({
    selection: { areaIds: ['strip:one'], domain: 'repeat' },
    pattern: { rendererId: 'aurora', speed: 1 },
  });
  const resolved = { ok: true, steps: [{ states: { strip: scene.defaults } }] };
  assert.equal(scenePreviewAvailability(scene, resolved).ok, true);
  scene.steps[0].transitionFromPrevious.durationMs = 1;
  assert.match(scenePreviewAvailability(scene, resolved).message, /transition/i);
  scene.steps[0].transitionFromPrevious.durationMs = 0;
  scene.steps[0].assignments[0].selection.domain = 'continuous';
  assert.match(scenePreviewAvailability(scene, resolved).message, /no longer present/i);
  scene.steps[0].assignments[0].selection.domain = 'repeat';
  scene.steps[0].assignments[0].pattern.movement = { kind: 'custom', amount: 1 };
  assert.match(scenePreviewAvailability(scene, resolved).message, /movement/i);
  delete scene.steps[0].assignments[0].pattern.movement;
  scene.steps[0].assignments[0].pattern.rendererId = 'future-pattern';
  assert.match(scenePreviewAvailability(scene, resolved).message, /pattern/i);
  assert.equal(scenePreviewAvailability(scene, { ok: false, reasons: [{ message: 'Missing Layout area.' }] }).message, 'Missing Layout area.');
});

test('preview gate accepts resolved Flow and rejects divergent pattern clocks', () => {
  const scene = createSceneExpression({ id: 'flow-preview' });
  scene.steps[0].assignments.push({
    selection: { areaIds: ['strip:a', 'strip:b'], domain: 'continuous', flow: { version: 1, directions: {} } },
    pattern: { rendererId: 'chase', speed: 1 },
  });
  const catalog = { areas: [
    { id: 'strip:a', kind: 'strip', stripIds: ['a'], sourceRefs: [{ stripId: 'a', sourceLeds: [0] }] },
    { id: 'strip:b', kind: 'strip', stripIds: ['b'], sourceRefs: [{ stripId: 'b', sourceLeds: [0] }] },
  ], physicalOrderAvailable: true, physicalOrder: [
    { stripId: 'a', sourceLed: 0, outputIndex: 0 }, { stripId: 'b', sourceLed: 0, outputIndex: 1 },
  ] };
  const states = { a: { ...scene.defaults, pattern: { rendererId: 'chase', speed: 1 } },
    b: { ...scene.defaults, pattern: { rendererId: 'chase', speed: 1 } } };
  const resolved = { ok: true, steps: [{ id: scene.steps[0].id, states }] };
  assert.equal(scenePreviewAvailability(scene, resolved, catalog).ok, true);
  states.b.pattern = { rendererId: 'chase', speed: 2 };
  assert.match(scenePreviewAvailability(scene, resolved, catalog).message, /shared pattern and speed/i);
});

test('sparse and color-only steps keep an earlier Flow route; subset pattern reset is explicit error', () => {
  const scene = createSceneExpression({ id: 'flow-steps' });
  scene.steps[0].assignments.push({
    selection: { areaIds: ['strip:a', 'strip:b'], domain: 'continuous', flow: { version: 1, directions: {} } },
    pattern: { rendererId: 'chase', speed: 1 },
  });
  const next = addSceneStep(scene, { id: 'second' });
  next.steps[1].assignments = [{ selection: { areaIds: ['strip:a'], domain: 'repeat' }, color: { customHue: 120 } }];
  const catalog = { areas: [
    { id: 'strip:a', kind: 'strip', stripIds: ['a'], sourceRefs: [{ stripId: 'a', sourceLeds: [0] }] },
    { id: 'strip:b', kind: 'strip', stripIds: ['b'], sourceRefs: [{ stripId: 'b', sourceLeds: [0] }] },
  ], physicalOrderAvailable: true, physicalOrder: [
    { stripId: 'a', sourceLed: 0, outputIndex: 0 }, { stripId: 'b', sourceLed: 0, outputIndex: 1 },
  ] };
  assert.equal(effectiveSceneFlowAt(next, 'second', catalog).assignments.length, 1);
  next.steps[1].assignments[0].pattern = { rendererId: 'fire' };
  assert.match(effectiveSceneFlowAt(next, 'second', catalog).errors[0].message, /repeat pattern/i);
  next.steps[1].assignments[0].selection.areaIds = ['strip:a', 'strip:b'];
  assert.deepEqual(effectiveSceneFlowAt(next, 'second', catalog), { assignments: [], errors: [] }, 'full repeat assignment exits Flow');
  next.steps[1].assignments[0].selection.domain = 'continuous';
  next.steps[1].assignments[0].selection.flow = { version: 1, directions: {} };
  next.steps[1].assignments[0].selection.areaIds = ['strip:a'];
  assert.match(effectiveSceneFlowAt(next, 'second', catalog).errors[0].message, /only part/i, 'partial new Flow cannot drop the old remainder');
  next.steps[1].assignments[0].selection.areaIds = ['strip:a', 'strip:b'];
  next.steps[1].assignments.push(structuredClone(next.steps[1].assignments[0]));
  assert.match(effectiveSceneFlowAt(next, 'second', catalog).errors[0].message, /same LED/i, 'two new overlapping routes are not silently overwritten');
});

test('Flow UI edits preserve stable area IDs, route direction and unrelated source fields', () => {
  const scene = createSceneExpression({ id: 'flow-ui' });
  scene.steps[0].assignments.push({
    selection: { areaIds: ['strip:a', 'group:petals', 'strip:b'], domain: 'repeat' },
    pattern: { rendererId: 'aurora', speed: 1 }, futureField: { intact: true },
  });
  const stepId = scene.steps[0].id;
  const enabled = setSceneAssignmentDomain(scene, stepId, 0, 'continuous');
  assert.deepEqual(enabled.steps[0].assignments[0].selection.flow, { version: 1, directions: {} });
  const moved = moveSceneFlowArea(enabled, stepId, 0, 'strip:b', -1);
  assert.deepEqual(moved.steps[0].assignments[0].selection.areaIds, ['strip:a', 'strip:b', 'group:petals']);
  const reversed = reverseSceneFlowArea(moved, stepId, 0, 'strip:b');
  assert.equal(reversed.steps[0].assignments[0].selection.flow.directions['strip:b'], 'reverse');
  assert.deepEqual(reversed.steps[0].assignments[0].futureField, { intact: true });
  assert.equal(scene.steps[0].assignments[0].selection.domain, 'repeat');
  const repeated = setSceneAssignmentDomain(reversed, stepId, 0, 'repeat');
  assert.equal(Object.hasOwn(repeated.steps[0].assignments[0].selection, 'flow'), false);
});

test('group pattern preview requires an explicit repeat-per-section transform', () => {
  const scene = createSceneExpression({ id: 'group' });
  const catalog = { areas: [
    { id: 'all', kind: 'all', stripIds: ['first', 'second'] },
    { id: 'strip:first', kind: 'strip', stripIds: ['first'] },
    { id: 'strip:second', kind: 'strip', stripIds: ['second'] },
  ] };
  const resolved = { ok: true, steps: [{ states: {
    first: structuredClone(scene.defaults), second: structuredClone(scene.defaults),
  } }] };
  scene.steps[0].assignments.push({
    selection: { areaIds: ['all'], domain: 'repeat' },
    pattern: { rendererId: 'fire', speed: 0.7 },
    color: { ...structuredClone(scene.defaults.color), customHue: 144 },
  });
  assert.match(scenePreviewAvailability(scene, resolved, catalog).message, /shared domain/i);
  assert.deepEqual(repeatPatternPerSectionAreaIds(scene.steps[0].assignments[0], catalog), ['strip:first', 'strip:second']);
  const repeated = repeatSceneAssignmentPerSection(scene, scene.steps[0].id, 0, catalog);
  assert.deepEqual(repeated.steps[0].assignments[0].selection.areaIds, ['strip:first', 'strip:second']);
  assert.deepEqual(repeated.steps[0].assignments[0].pattern, { rendererId: 'fire', speed: 0.7 });
  assert.equal(repeated.steps[0].assignments[0].color.customHue, 144);
  assert.equal(scenePreviewAvailability(repeated, resolved, catalog).ok, true);

  const colorOnly = structuredClone(scene);
  delete colorOnly.steps[0].assignments[0].pattern;
  assert.equal(scenePreviewAvailability(colorOnly, resolved, catalog).ok, true);
});

test('fresh scenes use per-strip defaults and scalar movement params cannot preview', () => {
  const scene = createSceneExpression({ id: 'fresh' });
  assert.deepEqual(scene.steps[0].assignments, []);
  const resolved = { ok: true, steps: [{ states: { first: structuredClone(scene.defaults), second: structuredClone(scene.defaults) } }] };
  assert.equal(scenePreviewAvailability(scene, resolved).ok, true);
  scene.defaults.pattern.movement = { kind: 'native', params: 1 };
  assert.match(scenePreviewAvailability(scene, resolved).message, /movement/i);
});

test('sparse assignment displays inherited state from its selected nonfirst area', () => {
  const defaults = createSceneExpression({ id: 'display' }).defaults;
  const catalog = { areas: [
    { id: 'all', stripIds: ['first', 'second'] },
    { id: 'strip:second', stripIds: ['second'] },
  ] };
  const step = { states: {
    first: { ...defaults, pattern: { rendererId: 'fire', speed: 1 } },
    second: { ...defaults, pattern: { rendererId: 'ocean', speed: 0.5 } },
  } };
  const display = selectionDisplayState(step, catalog, { selection: { areaIds: ['strip:second'] } }, defaults);
  assert.equal(display.state.pattern.rendererId, 'ocean');
  assert.deepEqual(display.mixed, { pattern: false, color: false, intensity: false });
  const whole = selectionDisplayState(step, catalog, null, defaults);
  assert.equal(whole.mixed.pattern, true);
});
