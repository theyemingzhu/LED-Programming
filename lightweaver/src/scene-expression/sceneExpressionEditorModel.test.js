import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addSceneStep,
  createSceneExpression,
  moveSceneStep,
  patchOrCreateSceneAssignment,
  patchSceneAssignment,
  scenePreviewAvailability,
  scenePlaybackAt,
  selectionDisplayState,
} from './sceneExpressionEditorModel.js';
import { applyPatternPreviewSegmentLooks } from '../lib/patternPiecePreview.js';

test('field patches preserve sibling pattern, color, and unknown source fields', () => {
  const scene = createSceneExpression({ id: 'scene-1', name: 'Quiet tide' });
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
  const resolved = { ok: true, steps: [{ states: { strip: scene.defaults } }] };
  assert.equal(scenePreviewAvailability(scene, resolved).ok, true);
  scene.steps[0].transitionFromPrevious.durationMs = 1;
  assert.match(scenePreviewAvailability(scene, resolved).message, /transition/i);
  scene.steps[0].transitionFromPrevious.durationMs = 0;
  scene.steps[0].assignments[0].selection.domain = 'continuous';
  assert.match(scenePreviewAvailability(scene, resolved).message, /continuous/i);
  scene.steps[0].assignments[0].selection.domain = 'repeat';
  scene.steps[0].assignments[0].pattern.movement = { kind: 'custom', amount: 1 };
  assert.match(scenePreviewAvailability(scene, resolved).message, /movement/i);
  delete scene.steps[0].assignments[0].pattern.movement;
  scene.steps[0].assignments[0].pattern.rendererId = 'future-pattern';
  assert.match(scenePreviewAvailability(scene, resolved).message, /pattern/i);
  assert.equal(scenePreviewAvailability(scene, { ok: false, reasons: [{ message: 'Missing Layout area.' }] }).message, 'Missing Layout area.');
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
