import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingSideMode, recordingSideModeMatches } from './recordingSideMode.js';
import { bakePatternLabRecipe, patternLabBakeLayoutHashCandidates } from './lwseqBake.js';
import { createPatternLabRecipe } from './patternLabRecipe.js';
import { compileWiring } from './wiringCompiler.js';

const strips = ['left', 'right'].map((id, index) => ({ id, name: id,
  pixels: [{ x: index * 3, y: 0 }, { x: index * 3 + 1, y: 0 }] }));
const symmetry = { fold: 2, orientation: 'mirror', sides: strips.map((strip, index) => ({
  id: `side-${index + 1}`, label: strip.name, stripIds: [strip.id],
})) };
const wiring = { version: 1, locked: true, verified: true,
  outputs: [{ id: 'one', name: 'One', pin: 16, runIds: strips.map(strip => strip.id) }],
  runs: strips.map(strip => ({ id: strip.id, type: 'strip', verified: true,
    directionPolicy: 'fixed', physicalDirection: 'source-forward', seamLed: null,
    source: { stripId: strip.id, from: 0, to: 1 } })),
};
const compiledWiring = compileWiring({ strips, wiring, symmetry });
const recipe = createPatternLabRecipe({ id: 'side-choice', name: 'Synthetic sides',
  evolution: { enabled: false, durationSeconds: 300 } });
const input = { recipe, strips, wiring, compiledWiring, symmetry, fps: 1 };

test('a completed mirrored bake is not current for own sides; undo restores readiness', async () => {
  const project = { layoutSymmetry: symmetry, sidesMirrored: true };
  const stamp = recordingSideMode(project);
  const baked = await bakePatternLabRecipe({ ...input, sidesMirrored: true });
  const bytes = baked.bytes.slice();
  const manifest = baked.sidecarJson;
  assert.equal(recordingSideModeMatches(stamp, project), true);
  assert.equal(recordingSideModeMatches(stamp, { ...project, sidesMirrored: false }), false);
  assert.equal(recordingSideModeMatches(stamp, { ...project, sidesMirrored: true }), true);
  // Currentness is a UI distinction: legacy/frozen playback compatibility still
  // recognizes both choices, and inspecting the choice cannot rewrite media.
  const compatible = await patternLabBakeLayoutHashCandidates({ ...input, sidesMirrored: false });
  assert.ok(compatible.includes(baked.sidecar.layoutPhysicalOrderSha256));
  assert.deepEqual(baked.bytes, bytes);
  assert.equal(baked.sidecarJson, manifest);
});

test('a fresh own bake is current for own sides and differs from the mirrored stamp', async () => {
  const mirrored = await bakePatternLabRecipe({ ...input, sidesMirrored: true });
  const own = await bakePatternLabRecipe({ ...input, sidesMirrored: false });
  assert.notEqual(own.sidecar.layoutPhysicalOrderSha256, mirrored.sidecar.layoutPhysicalOrderSha256);
  const project = { layoutSymmetry: symmetry, sidesMirrored: false };
  assert.equal(recordingSideModeMatches(recordingSideMode(project), project), true);
  assert.equal(recordingSideModeMatches(recordingSideMode(project), { ...project, sidesMirrored: true }), false);
});

test('an unchanged/default choice stays current, and mode has no effect without symmetry', () => {
  const mirrored = { layoutSymmetry: symmetry };
  assert.equal(recordingSideModeMatches(recordingSideMode(mirrored), { ...mirrored, sidesMirrored: true }), true);
  assert.equal(recordingSideModeMatches(recordingSideMode({}), { sidesMirrored: false }), true);
  assert.equal(recordingSideModeMatches(recordingSideMode(mirrored), {}), false);
});
