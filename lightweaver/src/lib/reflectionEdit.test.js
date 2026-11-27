import test from 'node:test';
import assert from 'node:assert/strict';
import { reflectionEditorPoints, removeReflectionPoint } from './reflectionEdit.js';
import { reprojectStripKaleidoscope } from './kaleidoscope.js';
import { compileCardKaleidoscopeMappings } from './cardKaleidoscope.js';
import { createProjectEnvelope } from './projectRepository.js';
import { serializeProjectFile, parseProjectFile } from './projectFiles.js';
import { createDefaultProject, migrateProject } from './projectModel.js';
import { createLayoutState, createLayoutHistory, commitLayout, undoLayout, redoLayout, layoutActions } from '../state/layoutReducer.js';

const original = { id: 'strip-1', pixelCount: 12, kaleidoscope: { enabled: true, pointCount: 4, startLed: 10, offsets: [1, 0, 1, 0] } };
for (let index = 0; index < 4; index++) {
  test(`removing point ${index} preserves each remaining LED across the strip wrap`, () => {
    const expected = reflectionEditorPoints(original).filter((_, at) => at !== index);
    const next = removeReflectionPoint(original, index);
    assert.deepEqual(reflectionEditorPoints({ ...original, ...next }), expected);
    assert.equal(original.kaleidoscope.pointCount, 4);
  });
}

test('2 → 1 → 0 uses project history and never compiles a one-point card mapping', () => {
  let state = createLayoutState({ strips: [original] });
  let history = createLayoutHistory();
  const remove = () => {
    const next = removeReflectionPoint(state.strips[0], 0);
    ({ state, history } = commitLayout(history, state, layoutActions.updateKaleidoscope('strip-1', next.kaleidoscope, next.reflectionPointDraft)));
  };
  remove(); remove(); remove();
  const point = reflectionEditorPoints(state.strips[0]);
  assert.deepEqual(point, [7]);
  assert.equal(state.strips[0].kaleidoscope, undefined);
  assert.deepEqual(compileCardKaleidoscopeMappings({ strips: state.strips }).mappings, []);
  const project = createDefaultProject();
  project.layout.strips = state.strips;
  const envelope = parseProjectFile(serializeProjectFile(createProjectEnvelope(project)));
  const migrated = migrateProject(envelope.project);
  assert.deepEqual(reflectionEditorPoints(migrated.layout.strips[0]), point);
  remove();
  assert.deepEqual(reflectionEditorPoints(state.strips[0]), []);
  ({ state, history } = undoLayout(history, state));
  assert.deepEqual(reflectionEditorPoints(state.strips[0]), point);
  ({ state, history } = redoLayout(history, state));
  assert.deepEqual(reflectionEditorPoints(state.strips[0]), []);
});


test('resize and reverse keep a single draft valid and undoable', () => {
  const strip = { id: 'strip-1', pixelCount: 12, reflectionPointDraft: 11 };
  const smaller = reprojectStripKaleidoscope(strip, 5).strip;
  assert.deepEqual(reflectionEditorPoints(smaller), [0]);
  assert.equal(smaller.kaleidoscope, undefined);
  const state = createLayoutState({ strips: [strip] });
  const reversed = commitLayout(createLayoutHistory(), state, layoutActions.reverseStrip(strip.id));
  assert.deepEqual(reflectionEditorPoints(reversed.state.strips[0]), [0]);
  assert.deepEqual(reflectionEditorPoints(undoLayout(reversed.history, reversed.state).state.strips[0]), [11]);
  assert.deepEqual(reflectionEditorPoints(reprojectStripKaleidoscope(strip, 0).strip), []);
});
