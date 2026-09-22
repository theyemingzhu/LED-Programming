import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultProject, migrateProject } from './projectModel.js';
import { createProjectEnvelope } from './projectRepository.js';
import {
  EXPRESSION_SCENES_VERSION,
  applyExpressionScenesUpdate,
  createEmptyExpressionScenes,
  inspectExpressionScenes,
  normalizeExpressionScenesForProject,
} from './sceneExpressionProject.js';

function scene(id = 'scene-sunset') {
  return {
    format: 'lightweaver-expression-scene',
    version: 1,
    id,
    name: 'Sunset',
    defaults: {
      pattern: { rendererId: 'aurora', speed: 1 },
      color: {
        kind: 'card-controls', hueShift: 0, customHue: 32, customSaturation: 230,
        customBreathe: false, breatheLowerPct: 85, breatheUpperPct: 100,
        breatheCycleSeconds: 9, customDrift: false,
      },
      intensity: { brightness: 0.7 },
    },
    steps: [{
      id: 'opening', label: 'Opening', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['strip:missing-after-layout-edit'], domain: 'repeat' },
        pattern: { rendererId: 'fire' },
      }],
    }],
    loop: { mode: 'repeat' },
  };
}

test('version-1 project collection normalizes canonical scenes without resolving Layout references', () => {
  const collection = normalizeExpressionScenesForProject({
    version: EXPRESSION_SCENES_VERSION,
    activeSceneId: 'scene-sunset',
    scenes: [scene()],
  });

  assert.equal(collection.version, 1);
  assert.equal(collection.activeSceneId, 'scene-sunset');
  assert.equal(collection.scenes[0].id, 'scene-sunset');
  assert.deepEqual(
    collection.scenes[0].steps[0].assignments[0].selection.areaIds,
    ['strip:missing-after-layout-edit'],
  );
  assert.equal(inspectExpressionScenes(collection).editable, true);
});

test('functional collection updates normalize scenes and retain stable scene IDs', () => {
  const empty = createEmptyExpressionScenes();
  const updated = applyExpressionScenesUpdate(empty, current => ({
    ...current,
    activeSceneId: 'scene-stable',
    scenes: [scene('scene-stable')],
  }));

  assert.equal(updated.activeSceneId, 'scene-stable');
  assert.deepEqual(updated.scenes.map(item => item.id), ['scene-stable']);
  assert.notEqual(updated, empty);
});

test('future and malformed collection objects remain opaque while edits reject explicitly', () => {
  const future = {
    version: 7,
    activeSceneId: 'future-scene',
    scenes: [{ id: 'future-scene', rendererGraph: { nodes: [1, 2, 3] } }],
    futureFlag: true,
  };
  const futureLoaded = normalizeExpressionScenesForProject(future);
  assert.deepEqual(futureLoaded, future);
  assert.notEqual(futureLoaded, future);
  assert.deepEqual(inspectExpressionScenes(futureLoaded), {
    editable: false,
    code: 'unsupported-expression-scenes-version',
    message: 'Expression scenes version 7 is not supported by this Studio.',
  });
  assert.throws(
    () => applyExpressionScenesUpdate(futureLoaded, value => value),
    error => error?.code === 'unsupported-expression-scenes-version',
  );
  const futureProject = createDefaultProject();
  futureProject.id = 'future-expression-project';
  futureProject.expressionScenes = future;
  const futureEnvelope = createProjectEnvelope(futureProject);
  assert.deepEqual(futureEnvelope.project.expressionScenes, future);

  const malformed = { version: 1, activeSceneId: 'broken', scenes: [{ id: 'broken' }], keepMe: 'opaque' };
  const malformedLoaded = normalizeExpressionScenesForProject(malformed);
  assert.deepEqual(malformedLoaded, malformed);
  assert.equal(inspectExpressionScenes(malformedLoaded).code, 'invalid-expression-scenes');
  assert.throws(
    () => applyExpressionScenesUpdate(malformedLoaded, value => value),
    error => error?.code === 'invalid-expression-scenes',
  );
});

test('compiler outputs cannot become editable scene source', () => {
  const compiledShape = {
    version: 1,
    activeSceneId: 'scene-sunset',
    scenes: [{ ...scene(), runtimePackage: { format: 'lightweaver-card-runtime-package' } }],
  };
  const loaded = normalizeExpressionScenesForProject(compiledShape);

  assert.deepEqual(loaded, compiledShape, 'existing invalid data remains available for recovery');
  assert.equal(inspectExpressionScenes(loaded).code, 'derived-expression-data');
  assert.throws(
    () => applyExpressionScenesUpdate(createEmptyExpressionScenes(), compiledShape),
    error => error?.code === 'derived-expression-data',
  );
});

test('project migration, repository hashing, and legacy defaults include expression source', () => {
  const legacyShape = createDefaultProject();
  delete legacyShape.expressionScenes;
  assert.deepEqual(migrateProject(legacyShape).expressionScenes, createEmptyExpressionScenes());

  const projectWithScenes = createDefaultProject();
  projectWithScenes.id = 'project-scenes';
  projectWithScenes.expressionScenes = {
    version: 1,
    activeSceneId: 'scene-sunset',
    scenes: [scene()],
  };
  const loaded = migrateProject(JSON.parse(JSON.stringify(projectWithScenes)));
  assert.equal(loaded.expressionScenes.scenes[0].id, 'scene-sunset');
  assert.deepEqual(
    loaded.expressionScenes.scenes[0].steps[0].assignments[0].selection.areaIds,
    ['strip:missing-after-layout-edit'],
  );

  const withoutHash = createProjectEnvelope({ ...loaded, expressionScenes: createEmptyExpressionScenes() }).contentHash;
  const withHash = createProjectEnvelope(loaded).contentHash;
  assert.notEqual(withHash, withoutHash);
});

test('loading another project replaces scenes instead of leaking the previous collection', () => {
  const first = createDefaultProject();
  first.expressionScenes = { version: 1, activeSceneId: 'scene-first', scenes: [scene('scene-first')] };
  const second = createDefaultProject();
  second.id = 'project-second';
  delete second.expressionScenes;

  const firstLoaded = migrateProject(first);
  const secondLoaded = migrateProject(second);
  assert.deepEqual(firstLoaded.expressionScenes.scenes.map(item => item.id), ['scene-first']);
  assert.deepEqual(secondLoaded.expressionScenes, createEmptyExpressionScenes());
});
