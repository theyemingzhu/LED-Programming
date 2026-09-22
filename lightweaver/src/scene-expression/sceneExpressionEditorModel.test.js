import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addSceneStep,
  createSceneExpression,
  moveSceneStep,
  patchSceneAssignment,
} from './sceneExpressionEditorModel.js';

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
