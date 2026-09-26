import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { compileWiring } from './wiringCompiler.js';
import { bakeSceneExpressionFlow } from './sceneExpressionRecording.js';
import { createRecordedSequenceAsset, applyRecordedSequenceAsset, verifyStoredSequenceAsset } from './recordedSequenceAsset.js';
import { assertRecordedMediaCurrentLayout, installRecordedMediaForRuntimePackage } from './cardRecordedMedia.js';
import { makePortableProject, importPortableProjectMedia } from './projectTransfer.js';
import { syncRuntimePackageToCard } from './cardSectionSync.js';
import { normalizeCardPlaylist, makeSequencePlaylistItem } from './cardPlaylist.js';
import { bakePatternLabRecipe } from './lwseqBake.js';
import { classifyPatternLabCompatibility } from './patternLabCompatibility.js';
import { createPatternLabHandoff, applyPatternLabHandoff } from './patternLabHandoff.js';
import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { prepareCardStoragePayload } from './cardStoragePayload.js';
import { assertLwseqOutputTopology, toLwseqBytes } from './standaloneController.js';
import { storeRecordedMedia } from './recordedSequenceMedia.js';

const strips = [{ id: 'left', pixels: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
  { id: 'right', pixels: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }] }];
const wiring = { version: 1, outputs: [
  { id: 'one', name: 'One', pin: 16, runIds: ['left-run'] },
  { id: 'two', name: 'Two', pin: 17, runIds: ['right-run'] },
], runs: [
  { id: 'left-run', type: 'strip', source: { stripId: 'left', from: 0, to: 1 }, physicalDirection: 'source-forward' },
  { id: 'right-run', type: 'strip', source: { stripId: 'right', from: 0, to: 2 }, physicalDirection: 'source-forward' },
] };
const compiledWiring = compileWiring({ strips, wiring });
assert.equal(compiledWiring.ok, true);

function source(sceneId) {
  return {
    scene: {
      format: 'lightweaver-expression-scene', version: 1, id: sceneId, name: sceneId,
      defaults: { pattern: { rendererId: sceneId.endsWith('two') ? 'plasma' : 'chase', speed: 1 },
        color: { kind: 'palette', colors: [sceneId.endsWith('two') ? '#0000ff' : '#ff0000', '#000000'] },
        intensity: { brightness: 1 } },
      steps: [{ id: 'one', label: 'One', holdMs: 1000,
        transitionFromPrevious: { mode: 'cut', durationMs: 0 },
        assignments: [{ selection: { domain: 'continuous', areaIds: ['strip:left', 'strip:right'],
          flow: { version: 1, directions: {} } } }] }],
      loop: { mode: 'once' },
    },
    strips, wiring, compiledWiring, fps: 1,
  };
}

async function recorded(sceneId, controller = {}) {
  const snapshot = source(sceneId);
  const bakeResult = await bakeSceneExpressionFlow(snapshot);
  const result = await createRecordedSequenceAsset({ kind: 'expression-scene', bakeResult,
    controller, label: sceneId, sourceSnapshot: snapshot });
  const next = await applyRecordedSequenceAsset(controller, result);
  return { result, next, snapshot };
}

function runtimeFor(assets) {
  return { config: { led: { outputs: assets[0].outputs }, looks: assets.map(asset => ({
    id: asset.id, label: asset.label, mode: 'sequence', file: asset.file,
    bytes: asset.byteLength, sha256: asset.manifest.lwseqSha256,
    brightness: 1,
  })) }, mediaAssets: assets };
}

test('LWSEQ1 reserved header binds ordered GPIO pins and unequal output boundaries', () => {
  const outputs = [{ id: 'one', pin: 16, pixels: 2 }, { id: 'two', pin: 17, pixels: 3 }];
  const frame = Array.from({ length: 5 }, () => ({ r: 0, g: 0, b: 0 }));
  const bytes = toLwseqBytes([frame], { fps: 1, outputs });
  // Independently fixed bytes for LWOP v1: marker, version/count, then four
  // ordered LE (GPIO pin, pixel count) slots in LWSEQ1's reserved header.
  assert.deepEqual([...bytes.subarray(24, 48)], [
    76, 87, 79, 80, 1, 2, 0, 0,
    16, 0, 2, 0, 17, 0, 3, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  assert.equal(assertLwseqOutputTopology(bytes, outputs), true);
  assert.throws(() => assertLwseqOutputTopology(bytes, [
    { id: 'one', pin: 16, pixels: 3 }, { id: 'two', pin: 17, pixels: 2 },
  ]), /GPIO pin or output boundary/i);
  const legacy = bytes.slice();
  legacy.fill(0, 24, 48);
  assert.throws(() => assertLwseqOutputTopology(legacy, outputs), /older multi-output.*Re-record/i);
  assert.equal(assertLwseqOutputTopology(legacy, [{ id: 'one', pin: 16, pixels: 5 }]), false);
  legacy[47] = 1;
  assert.throws(() => assertLwseqOutputTopology(legacy, [{ id: 'one', pin: 16, pixels: 5 }]), /topology header is invalid/i);
  assert.throws(() => toLwseqBytes([frame], { fps: 1, outputs: [
    { id: 'one', pin: 65536, pixels: 5 },
  ] }), /must fit the physical header/i);
  assert.throws(() => toLwseqBytes([frame], { fps: 1, outputs: [
    { id: 'one', pin: 0, pixels: 5 },
  ] }), /positive and distinct/i);
  assert.throws(() => toLwseqBytes([frame], { fps: 1, outputs: [
    { id: 'one', pin: 16, pixels: 2 }, { id: 'two', pin: 16, pixels: 3 },
  ] }), /positive and distinct/i);
  assert.throws(() => assertLwseqOutputTopology(bytes, [
    { id: 'one', pin: 16, pixels: 2 }, { id: 'two', pin: 16, pixels: 3 },
  ]), /duplicate GPIO pin/i);
  assert.throws(() => toLwseqBytes([frame], { fps: 61, outputs }), /parser limits/i);
  assert.throws(() => toLwseqBytes([], { fps: 1, outputs }), /at least one complete frame/i);
});

test('legacy unbound multi-output media stays portable for editing but cannot reach card upload', async () => {
  const { next } = await recorded('legacy-multi');
  const original = next.sequenceAssets[0];
  const bytes = (await verifyStoredSequenceAsset(original)).slice();
  bytes.fill(0, 24, 48);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const old = structuredClone(original);
  old.file = `/sequences/${hash}.lwseq`;
  old.sidecarFile = `${old.file}.json`;
  old.assetRef = `sha256:${hash}`;
  old.manifest.lwseqSha256 = hash;
  old.mediaRef = await storeRecordedMedia(bytes, hash);
  const project = { devices: { standaloneController: {
    sequenceAssets: [old], playlist: [makeSequencePlaylistItem(old)],
  } } };
  const backup = await makePortableProject(project);
  const restored = await importPortableProjectMedia(backup);
  const recovered = restored.devices.standaloneController.sequenceAssets[0];
  assert.deepEqual(recovered.source, old.source);
  assert.deepEqual(await verifyStoredSequenceAsset(recovered, { allowLegacyMultiOutput: true }), bytes);
  let cardCalls = 0;
  await assert.rejects(() => installRecordedMediaForRuntimePackage(runtimeFor([recovered]), {
    host: 'lightweaver.local', transport: 'bridge', project: { strips, wiring, compiledWiring },
    readEvidence: async () => { cardCalls += 1; throw new Error('card should not be contacted'); },
  }), /older multi-output.*Re-record/i);
  assert.equal(cardCalls, 0);
});

test('recorded Flow updates the same scene asset and Playlist reference while replacing immutable media', async () => {
  const first = await recorded('same-scene');
  const playlist = [makeSequencePlaylistItem(first.next.sequenceAssets[0])];
  const controller = { ...first.next, playlist };
  const snapshot = source('same-scene');
  snapshot.scene.steps[0].holdMs = 2000;
  const bakeResult = await bakeSceneExpressionFlow(snapshot);
  const update = await createRecordedSequenceAsset({ kind: 'expression-scene', bakeResult,
    controller, sourceSnapshot: snapshot });
  const applied = await applyRecordedSequenceAsset(controller, update);
  assert.equal(update.replaceSequenceAssetId, first.result.asset.id);
  assert.equal(applied.sequenceAssets.length, 1);
  assert.equal(applied.sequenceAssets[0].id, first.result.asset.id);
  assert.notEqual(applied.sequenceAssets[0].file, first.result.asset.file);
  assert.equal(applied.playlist[0].sequenceAssetId, first.result.asset.id);
  assert.deepEqual(await verifyStoredSequenceAsset(applied.sequenceAssets[0]), bakeResult.bytes);
  assert.equal(normalizeCardPlaylist(applied.playlist, { sequenceAssets: applied.sequenceAssets }).length, 1);
});

test('portable project backup contains exact media and restores its SHA-verified browser bytes', async () => {
  const { next } = await recorded('portable');
  const project = { devices: { standaloneController: next } };
  const backup = await makePortableProject(project);
  const asset = backup.devices.standaloneController.sequenceAssets[0];
  assert.equal(asset.portableMedia.sha256, asset.manifest.lwseqSha256);
  asset.portableMedia.data = `${asset.portableMedia.data.slice(0, -4)}AAAA`;
  await assert.rejects(() => importPortableProjectMedia(backup), /SHA-256|invalid|incomplete/i);
  const restored = await importPortableProjectMedia(await makePortableProject(project));
  assert.equal(restored.devices.standaloneController.sequenceAssets[0].portableMedia, undefined);
  assert.deepEqual(await verifyStoredSequenceAsset(restored.devices.standaloneController.sequenceAssets[0]),
    await verifyStoredSequenceAsset(next.sequenceAssets[0]));
});

test('legacy source-only recording survives project backup and restore but cannot enter Playlist', async () => {
  const { next } = await recorded('legacy');
  const old = structuredClone(next.sequenceAssets[0]);
  delete old.mediaRef;
  const project = { devices: { standaloneController: { sequenceAssets: [old] } } };
  const backup = await makePortableProject(project);
  const restored = await importPortableProjectMedia(backup);
  const asset = restored.devices.standaloneController.sequenceAssets[0];
  assert.deepEqual(asset.manifest.scene, old.manifest.scene);
  assert.equal(asset.portableMedia, undefined);
  assert.equal(normalizeCardPlaylist([{
    type: 'sequence', sequenceAssetId: asset.id, id: asset.id,
  }], { sequenceAssets: [asset], allowEmpty: true }).length, 0);
});

test('same GPIO pins and counts with reversed physical order cannot install old recording', async () => {
  const { next } = await recorded('layout');
  const reversed = structuredClone(wiring);
  reversed.runs[0].physicalDirection = 'source-reverse';
  const current = { strips, wiring: reversed, compiledWiring: compileWiring({ strips, wiring: reversed }) };
  const asset = next.sequenceAssets[0];
  const bytes = await verifyStoredSequenceAsset(asset);
  await assert.rejects(() => assertRecordedMediaCurrentLayout(asset, current, bytes), /no longer matches/i);
});

test('unequal reversed GPIO layout keeps native same/mixed looks and recorded clip through package and restore', async () => {
  const authored = source('mixed-install');
  authored.wiring = structuredClone(wiring);
  authored.wiring.runs[1].physicalDirection = 'source-reverse';
  authored.compiledWiring = compileWiring({ strips, wiring: authored.wiring });
  assert.equal(authored.compiledWiring.ok, true);
  const patchBoard = { patches: strips.map(strip => ({
    id: `patch-${strip.id}`, source: { type: 'strip', stripId: strip.id,
      startLed: 0, endLed: strip.pixels.length - 1 }, output: { mode: 'normal' }, playback: {},
  })) };
  authored.patchBoard = patchBoard;
  const bakeResult = await bakeSceneExpressionFlow(authored);
  const recording = await createRecordedSequenceAsset({ kind: 'expression-scene', bakeResult,
    controller: {}, sourceSnapshot: authored });
  const saved = await applyRecordedSequenceAsset({}, recording);
  const asset = saved.sequenceAssets[0];
  const controller = { ...saved, defaultLook: { patternId: 'aurora' },
    looks: [
      { id: 'same', label: 'Same native', defaultLook: { patternId: 'fire' },
        sectionLooks: { 'patch-left': { patternId: 'fire' }, 'patch-right': { patternId: 'fire' } } },
      { id: 'mixed', label: 'Mixed native', defaultLook: { patternId: 'fire' },
        sectionLooks: { 'patch-left': { patternId: 'fire' }, 'patch-right': { patternId: 'ocean' } } },
    ],
    playlist: [
      { type: 'combo', lookId: 'same', id: 'same-entry' },
      makeSequencePlaylistItem(asset),
      { type: 'combo', lookId: 'mixed', id: 'mixed-entry' },
    ],
    controls: { playlist: { enabled: true, fadeMs: 0 } },
  };
  const input = { strips, patchBoard, wiring: authored.wiring, compiledWiring: authored.compiledWiring,
    standaloneController: controller };
  const runtime = buildCardRuntimePackageFromProject(input);
  assert.deepEqual(runtime.config.led.outputs.map(output => [output.pin, output.pixels]), [[16, 2], [17, 3]]);
  assert.deepEqual(runtime.config.playlist.entries.map(entry => entry.patternId),
    ['same-entry', asset.id, 'mixed-entry']);
  assert.deepEqual(runtime.config.looks.filter(look => look.mode === 'combo')
    .map(look => look.zones.map(zone => zone.patternId)), [['fire', 'fire'], ['fire', 'ocean']]);
  const sequenceLook = runtime.config.looks.find(look => look.mode === 'sequence');
  assert.equal(sequenceLook.file, asset.file);
  assert.equal(sequenceLook.bytes, bakeResult.bytes.byteLength);
  assert.equal(sequenceLook.sha256, asset.manifest.lwseqSha256);
  assert.equal(sequenceLook.brightness, 1);
  assert.equal(runtime.mediaAssets[0].id, asset.id);
  const compact = prepareCardStoragePayload(runtime);
  const storedLook = compact.config.looks.find(look => look.mode === 'sequence');
  assert.deepEqual([storedLook.file, storedLook.bytes, storedLook.sha256, storedLook.fps, storedLook.brightness],
    [asset.file, bakeResult.bytes.byteLength, asset.manifest.lwseqSha256, 1, 1]);
  assert.equal(await assertRecordedMediaCurrentLayout(asset, input, bakeResult.bytes), true);

  const portable = await makePortableProject({ devices: { standaloneController: controller } });
  const restored = await importPortableProjectMedia(portable);
  const restoredRuntime = buildCardRuntimePackageFromProject({ ...input,
    standaloneController: restored.devices.standaloneController });
  assert.deepEqual(restoredRuntime.config.playlist.entries, runtime.config.playlist.entries);
  assert.deepEqual(await verifyStoredSequenceAsset(restoredRuntime.mediaAssets[0]), bakeResult.bytes);
});

test('Pattern Lab bake saves exact media and passes current physical layout before upload', async () => {
  const recipe = {
    version: 1, id: 'lab-recording', name: 'Lab recording',
    base: { kind: 'lightweaver-pattern', patternId: 'aurora', params: {} },
    palette: ['#102040', '#f0a060'],
    macros: { color: 0.6, movement: 0.45, shape: 0.5, texture: 0.5, energy: 0.7 },
    evolution: { enabled: true, character: 'slow-bloom', durationSeconds: 1, change: 0.35 },
    seed: 17, layers: [{ id: 'fire-over', name: 'Fire over', enabled: true, opacity: 0.35,
      blendMode: 'normal', generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
      target: { kind: 'whole-piece', id: 'all' } }], targets: [{ kind: 'whole-piece', id: 'all' }],
    requirements: [], provenance: [],
  };
  const labWiring = { ...wiring, locked: true, verified: true,
    runs: wiring.runs.map(run => ({ ...run, verified: true, directionPolicy: 'fixed', seamLed: null })) };
  const labCompiled = compileWiring({ strips, wiring: labWiring });
  const bakeResult = await bakePatternLabRecipe({ recipe, strips, wiring: labWiring,
    compiledWiring: labCompiled, fps: 1 });
  const compatibility = classifyPatternLabCompatibility(recipe, { metrics: {
    pixelCount: 5, fps: 1, operationsPerFrame: 100, stateBytes: 256,
    framebufferBytes: 15, nativeConfigBytes: 256, microSdBytes: 1_000_000,
  } });
  assert.equal(compatibility.classification, 'bake-to-card');
  const result = await createPatternLabHandoff({ recipe, compatibility, bakeResult,
    strips, wiring: labWiring, compiledWiring: labCompiled });
  assert.equal(result.kind, 'sequence', JSON.stringify(result.reasons));
  const controller = await applyPatternLabHandoff({}, result);
  const asset = controller.sequenceAssets[0];
  assert.equal(asset.source.kind, 'pattern-lab');
  assert.deepEqual(await verifyStoredSequenceAsset(asset), bakeResult.bytes);
  assert.equal(await assertRecordedMediaCurrentLayout(asset,
    { strips, wiring: labWiring, compiledWiring: labCompiled }, bakeResult.bytes), true);
  const mediaCalls = [];
  const installed = await installRecordedMediaForRuntimePackage(runtimeFor([asset]), {
    host: 'lightweaver.local', transport: 'bridge',
    project: { strips, wiring: labWiring, compiledWiring: labCompiled },
    readEvidence: async () => ({ cardId: 'card', capabilities: { sequenceMedia: {
      version: 2, maxBytes: 16 * 1024 * 1024, chunkBytes: 2048,
    } } }),
    readStatus: async () => ({ cardId: 'card', bootId: 'boot', projectHead: 'head' }),
    sendBridge: async (verb, payload) => {
      mediaCalls.push(verb);
      if (verb === 'owner-capability') return { ok: true, capability: 'cap' };
      if (verb === 'media-begin' && payload.assets) return { ok: true, batchId: 'batch', chunkBytes: 2048 };
      if (verb === 'media-begin') return { ok: true, batchId: 'batch', uploadId: 'upload',
        file: payload.file, bytes: payload.bytes, sha256: payload.sha256, received: 0, chunkBytes: 2048 };
      if (verb === 'media-chunk') return { ok: true, received: payload.offset + Buffer.from(payload.data, 'base64').length };
      if (verb === 'media-commit' || verb === 'media-read') return { ok: true,
        file: asset.file, bytes: asset.byteLength, sha256: asset.manifest.lwseqSha256 };
      if (verb === 'media-abort') return { ok: true };
      throw new Error(`Unexpected ${verb}`);
    },
  });
  assert.equal(installed.installed, 1);
  assert.ok(mediaCalls.indexOf('media-read') > mediaCalls.indexOf('media-commit'));
  const movedStrips = structuredClone(strips);
  movedStrips[0].pixels[0].x += 10;
  await assert.rejects(() => assertRecordedMediaCurrentLayout(asset,
    { strips: movedStrips, wiring: labWiring,
      compiledWiring: compileWiring({ strips: movedStrips, wiring: labWiring }) }, bakeResult.bytes),
  /no longer matches/i);
});

test('batch media transfer survives capability expiry between two recordings and reads back each before config', async () => {
  const first = await recorded('flow-one');
  const second = await recorded('flow-two', first.next);
  const assets = second.next.sequenceAssets;
  const runtimePackage = runtimeFor(assets);
  const calls = [];
  let clock = 0;
  const reply = async (verb, payload) => {
    calls.push([verb, payload]);
    if (verb === 'owner-capability') return { ok: true, capability: 'cap', cardId: 'card', bootId: 'boot' };
    if (verb === 'media-begin' && payload.assets) return { ok: true, batchId: 'batch', chunkBytes: 2048 };
    if (verb === 'media-begin') {
      assert.equal(payload.batchId, 'batch');
      assert.ok(clock < 30 * 60_000);
      return { ok: true, batchId: 'batch', file: payload.file, bytes: payload.bytes,
        sha256: payload.sha256, uploadId: `upload-${calls.length}`, received: 0, chunkBytes: 2048 };
    }
    if (verb === 'media-chunk') {
      clock += 65_000;
      return { ok: true, batchId: 'batch', uploadId: payload.uploadId,
        received: payload.offset + Buffer.from(payload.data, 'base64').byteLength };
    }
    if (verb === 'media-commit' || verb === 'media-read') {
      const asset = assets.find(item => item.file === payload.file)
        || assets.find(item => item.id === (payload.uploadId || '').replace('upload-', ''));
      const committed = asset || assets[verb === 'media-commit' ? calls.filter(([name]) => name === 'media-commit').length - 1
        : calls.filter(([name]) => name === 'media-read').length - 1];
      return { ok: true, file: committed.file, bytes: committed.byteLength,
        sha256: committed.manifest.lwseqSha256 };
    }
    if (verb === 'media-abort') return { ok: true, batchId: 'batch' };
    throw new Error(`Unexpected ${verb}`);
  };
  const installed = await installRecordedMediaForRuntimePackage(runtimePackage, {
    host: 'lightweaver.local', transport: 'bridge', project: { strips, wiring, compiledWiring },
    readEvidence: async () => ({ cardId: 'card', capabilities: { sequenceMedia: {
      version: 2, maxBytes: 16 * 1024 * 1024, chunkBytes: 2048,
    } } }),
    readStatus: async () => ({ cardId: 'card', bootId: 'boot', projectHead: 'head' }),
    sendBridge: reply,
  });
  assert.equal(installed.installed, 2);
  assert.ok(clock > 60_000);
  assert.equal(calls.filter(([verb]) => verb === 'owner-capability').length, 1);
  assert.equal(calls.filter(([verb]) => verb === 'media-read').length, 2);
});

test('old firmware, canceled media, or card switch sends no Playlist config', async () => {
  const first = await recorded('blocked');
  const runtimePackage = runtimeFor(first.next.sequenceAssets);
  let ownerCalls = 0;
  await assert.rejects(() => installRecordedMediaForRuntimePackage(runtimePackage, {
    host: 'lightweaver.local', transport: 'bridge', project: { strips, wiring, compiledWiring },
    readEvidence: async () => ({ cardId: 'card', capabilities: {} }),
    sendBridge: async () => { ownerCalls += 1; },
  }), /cannot safely play recorded physical output order/i);
  assert.equal(ownerCalls, 0);
  await assert.rejects(() => installRecordedMediaForRuntimePackage(runtimePackage, {
    host: 'lightweaver.local', transport: 'bridge', project: { strips, wiring, compiledWiring },
    readEvidence: async () => ({ cardId: 'card', capabilities: { sequenceMedia: {
      version: 1, maxBytes: 16 * 1024 * 1024, chunkBytes: 2048,
    } } }),
    sendBridge: async () => { ownerCalls += 1; },
  }), /cannot safely play recorded physical output order/i);
  assert.equal(ownerCalls, 0);
  let configCalls = 0;
  await assert.rejects(() => syncRuntimePackageToCard({
    host: 'lightweaver.local', transport: 'bridge', runtimePackage,
    mediaInstall: { project: { strips, wiring, compiledWiring } },
    installMedia: async () => { const error = new Error('Canceled'); error.name = 'AbortError'; throw error; },
    pushConfig: async () => { configCalls += 1; }, requiredZoneIds: [],
  }), { name: 'AbortError' });
  assert.equal(configCalls, 0);
  await assert.rejects(() => syncRuntimePackageToCard({
    host: 'lightweaver.local', transport: 'bridge', runtimePackage,
    mediaInstall: { project: { strips, wiring, compiledWiring } },
    installMedia: async () => ({ cardId: 'card', bootId: 'boot', projectHead: 'head' }),
    readMediaStatus: async () => ({ cardId: 'other', bootId: 'boot', projectHead: 'head' }),
    pushConfig: async () => { configCalls += 1; }, requiredZoneIds: [],
  }), /changed after media upload/i);
  assert.equal(configCalls, 0);
});
