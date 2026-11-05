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

// Saved recordings keep choice provenance separately from immutable media.
async function savedRecording(kind = 'lab', mirrored = true) {
  const snapshot = { ...input, sidesMirrored: mirrored };
  if (kind === 'flow') {
    const { bakeSceneExpressionFlow } = await import('./sceneExpressionRecording.js');
    const { createRecordedSequenceAsset, applyRecordedSequenceAsset } = await import('./recordedSequenceAsset.js');
    snapshot.scene = { format: 'lightweaver-expression-scene', version: 1, id: 'mode-flow', name: 'Mode Flow',
      defaults: { pattern: { rendererId: 'chase', speed: 1 }, color: { kind: 'palette', colors: ['#ff0000', '#000000'] }, intensity: { brightness: 1 } },
      steps: [{ id: 'one', label: 'One', holdMs: 1000, transitionFromPrevious: { mode: 'cut', durationMs: 0 },
        assignments: [{ selection: { domain: 'continuous', areaIds: ['strip:left', 'strip:right'], flow: { version: 1, directions: {} } } }] }], loop: { mode: 'once' } };
    const pending = bakeSceneExpressionFlow(snapshot);
    snapshot.sidesMirrored = !mirrored; // mutation after preparation cannot change the stamp
    const bake = await pending;
    const result = await createRecordedSequenceAsset({ kind: 'expression-scene', bakeResult: bake });
    const controller = await applyRecordedSequenceAsset({}, result);
    return { bake, asset: controller.sequenceAssets[0], context: { ...snapshot, sidesMirrored: mirrored } };
  }
  const { createPatternLabHandoff, applyPatternLabHandoff } = await import('./patternLabHandoff.js');
  const { classifyPatternLabCompatibility } = await import('./patternLabCompatibility.js');
  const pending = bakePatternLabRecipe(snapshot);
  snapshot.sidesMirrored = !mirrored;
  const bake = await pending;
  const compatibility = classifyPatternLabCompatibility(recipe, { metrics: { pixelCount: 4, fps: 1,
    operationsPerFrame: 100, stateBytes: 256, framebufferBytes: 12, nativeConfigBytes: 256, microSdBytes: 1_000_000 } });
  const result = await createPatternLabHandoff({ ...input, sidesMirrored: mirrored,
    compatibility: { ...compatibility, classification: 'bake-to-card' }, bakeResult: bake });
  assert.equal(result.kind, 'sequence', JSON.stringify(result));
  const controller = await applyPatternLabHandoff({}, result);
  return { bake, asset: controller.sequenceAssets[0], context: { ...snapshot, sidesMirrored: mirrored } };
}

for (const kind of ['lab', 'flow']) {
  test(`${kind}: a new Own recording retains its own prepared choice`, async () => {
    const { asset, bake, context } = await savedRecording(kind, false);
    const { recordedSequenceSideMode } = await import('./recordingSideMode.js');
    assert.equal(asset.bakedSideMode, 'own');
    assert.equal(bake.bakedSideMode, 'own');
    assert.equal((await recordedSequenceSideMode(asset, context)).state, 'matches');
    assert.equal((await recordedSequenceSideMode(asset, { ...context, sidesMirrored: true })).state, 'changed');
  });
  test(`${kind}: saved mode comes from the prepared bake and survives project round trips`, async () => {
    const { normalizePatternLabSequenceAssets } = await import('./patternLabHandoff.js');
    const { createDefaultProject } = await import('./projectModel.js');
    const { makePortableProject, importPortableProjectMedia } = await import('./projectTransfer.js');
    const { verifyStoredSequenceAsset } = await import('./recordedSequenceAsset.js');
    const { asset, bake } = await savedRecording(kind);
    assert.equal(asset.bakedSideMode, 'mirrored');
    assert.equal(bake.bakedSideMode, 'mirrored');
    assert.equal(Object.hasOwn(asset.manifest, 'bakedSideMode'), false);
    const normalized = normalizePatternLabSequenceAssets(JSON.parse(JSON.stringify([asset])))[0];
    assert.equal(normalized.bakedSideMode, 'mirrored');
    const project = createDefaultProject();
    project.devices.standaloneController.sequenceAssets = [normalized];
    const imported = await importPortableProjectMedia(await makePortableProject(project));
    const reloaded = imported.devices.standaloneController.sequenceAssets[0];
    assert.equal(reloaded.bakedSideMode, 'mirrored');
    assert.deepEqual(await verifyStoredSequenceAsset(reloaded), bake.bytes);
    assert.deepEqual(reloaded.manifest, asset.manifest);
  });

  test(`${kind}: saved Mirrored -> Own -> Mirrored follows the owner without changing playback`, async () => {
    const { recordedSequenceSideMode } = await import('./recordingSideMode.js');
    const { assertRecordedMediaCurrentLayout } = await import('./cardRecordedMedia.js');
    const { asset, bake, context } = await savedRecording(kind);
    const { buildCardRuntimePackageFromProject } = await import('./cardRuntimeProject.js');
    const controller = { sequenceAssets: [asset], playlist: [{ id: asset.id,
      type: 'sequence', sequenceAssetId: asset.id, dwellSeconds: 30, enabled: true }] };
    const runtime = buildCardRuntimePackageFromProject({ ...context, standaloneController: controller });
    const legacyAsset = structuredClone(asset); delete legacyAsset.bakedSideMode;
    const legacyRuntime = buildCardRuntimePackageFromProject({ ...context,
      standaloneController: { ...controller, sequenceAssets: [legacyAsset] } });
    assert.deepEqual(runtime.config, legacyRuntime.config, 'choice metadata never changes controller wire configuration');
    assert.equal(JSON.stringify(runtime.config).includes('bakedSideMode'), false);
    const original = JSON.stringify(asset);
    assert.equal((await recordedSequenceSideMode(asset, context)).state, 'matches');
    assert.equal((await recordedSequenceSideMode(asset, { ...context, sidesMirrored: false })).state, 'changed');
    const owner = { id: asset.id, sidesMirrored: true };
    assert.equal((await recordedSequenceSideMode(asset, { ...context, sidesMirrored: false,
      looks: [owner, { id: 'unrelated-selected-look', sidesMirrored: false }], activeLookId: 'unrelated-selected-look' })).state, 'matches');
    assert.equal((await recordedSequenceSideMode(asset, { ...context, sidesMirrored: true,
      looks: [{ ...owner, id: 'owner-by-file', file: asset.file, sidesMirrored: false }] })).state, 'changed');
    assert.equal((await recordedSequenceSideMode(asset, context)).state, 'matches');
    assert.equal(await assertRecordedMediaCurrentLayout(asset, { ...context, sidesMirrored: false }, bake.bytes), true);
    assert.equal(JSON.stringify(asset), original);
  });

  test(`${kind}: legacy mode inference requires a unique exact hash; drift stays unknown`, async () => {
    const { recordedSequenceSideMode } = await import('./recordingSideMode.js');
    const { asset, context } = await savedRecording(kind);
    const legacy = structuredClone(asset); delete legacy.bakedSideMode;
    const inferred = await recordedSequenceSideMode(legacy, { ...context, sidesMirrored: false });
    assert.equal(inferred.bakedMode, 'mirrored');
    assert.equal(inferred.state, 'changed');
    assert.equal(Object.hasOwn(legacy, 'bakedSideMode'), false, 'inference never backfills assets');
    const drift = { ...context, strips: context.strips.map(s => ({ ...s, pixels: s.pixels.map(p => ({ ...p, x: p.x + 10 })) })) };
    assert.equal((await recordedSequenceSideMode(legacy, drift)).state, 'unknown');
    const malformed = { ...legacy, bakedSideMode: 'guess' };
    assert.equal((await recordedSequenceSideMode(malformed, drift)).state, 'unknown');
  });
}
