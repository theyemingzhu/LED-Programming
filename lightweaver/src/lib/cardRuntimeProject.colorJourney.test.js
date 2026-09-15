import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { prepareCardStoragePayload } from './cardStoragePayload.js';
import { createPatternLabRecipe } from './patternLabRecipe.js';

const strips = [{ id: 'art', name: 'Art', pixels: [{ x: 0, y: 0 }, { x: 10, y: 4 }] }];
const wiring = {
  version: 1, locked: true, verified: true,
  outputs: [{ id: 'out', name: 'Out', pin: 16, runIds: ['art'] }],
  runs: [{ id: 'art', type: 'strip', verified: true, source: { stripId: 'art', from: 0, to: 1 }, physicalDirection: 'source-reverse' }],
};
const authored = createPatternLabRecipe({
  id: 'authored-journey',
  name: 'Authored journey',
  base: { kind: 'color-journey', id: 'slow-color-drift', params: {} },
  journey: {
    stops: [
      { id: 'warm', color: '#ffaa00', holdMs: 10_000, fadeMs: 40_000 },
      { id: 'cool', color: '#0044ff', holdMs: 20_000, fadeMs: 50_000 },
    ],
    easing: 'linear', loop: false, motionSpeedSeconds: 22, character: 'expressive',
  },
  evolution: { enabled: false },
});

function project(recipe = authored) {
  return {
    projectId: 'journey-project',
    projectName: 'Journey Project',
    strips,
    wiring,
    standaloneController: {
      looks: [{ id: 'journey', label: 'Journey', defaultLook: { patternId: 'aurora', brightness: 0.7 }, patternLabRecipe: recipe }],
      playlist: [{ id: 'combo-journey', type: 'combo', lookId: 'journey', label: 'Journey', enabled: true }],
    },
  };
}

test('runtime package compiles a saved authored journey and survives compact config serialization', () => {
  const before = structuredClone(authored);
  const runtimePackage = buildCardRuntimePackageFromProject(project());
  const look = runtimePackage.config.looks[0];
  assert.equal(look.preset, look.id);
  assert.equal(look.nativeRecipe.id, look.id);
  assert.equal(look.nativeRecipe.kind, 'color-journey');
  assert.equal(look.nativeRecipe.journey.phase16.length, 8);
  assert.equal(look.nativeRecipe.journey.loop, false);
  assert.equal(look.nativeRecipe.journey.depth, 0.42);
  assert.equal(look.brightness, 1, 'global brightness stays neutral so firmware applies authored brightness once');
  assert.equal(look.zones[0].brightness, 0.7);
  assert.equal(look.zones[0].patternId, look.id, 'journey activation replaces any prior zone route');
  assert.ok(prepareCardStoragePayload(runtimePackage).bytes <= 3968);
  assert.deepEqual(authored, before, 'layout-derived phase must not mutate the authored project recipe');
});

test('changing physical direction recompiles phase without changing the saved authored journey', () => {
  const forward = project();
  forward.wiring = structuredClone(wiring);
  forward.wiring.runs[0].physicalDirection = 'source-forward';
  const reversePhase = buildCardRuntimePackageFromProject(project()).config.looks[0].nativeRecipe.journey.phase16;
  const forwardPhase = buildCardRuntimePackageFromProject(forward).config.looks[0].nativeRecipe.journey.phase16;
  assert.notEqual(reversePhase, forwardPhase);
  assert.deepEqual(forward.standaloneController.looks[0].patternLabRecipe, authored);
});
