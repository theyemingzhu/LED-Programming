import test from 'node:test';
import assert from 'node:assert/strict';

import { compileWiring } from './wiringCompiler.js';
import { makeDefaultWiring } from './wiringModel.js';
import { normalizePlacedLook } from './placedLook.js';
import { normalizePatternLabSequenceAssets } from './patternLabHandoff.js';
import { createRecordedSequenceAsset } from './recordedSequenceAsset.js';
import { recordingBakeInput, recordedSequenceFreshness } from './recordingFreshness.js';
import { assertRecordedMediaCurrentLayout } from './cardRecordedMedia.js';
import { hashPlacedLookLayout, recordPlacedLook, verifyPlacedLookRecording } from './placedLookRecording.js';

const row = (id, xs, y = 50) => ({ id, pixels: xs.map(x => ({ x, y })) });
const strips = [row('a', [10, 20, 30, 40]), row('b', [60, 70, 80, 90])];
const look = normalizePlacedLook({
  mode: 'sweep', frame: { x: 50, y: 50, halfWidth: 50, halfHeight: 50, turn: 0 },
  colours: [[200, 100, 0], [0, 100, 200]], width: 0.5, softness: 0, repeat: 1, speed: 0.5,
});
function wired(list) {
  const compiled = compileWiring({ wiring: makeDefaultWiring(list), strips: list, groups: [], symmetry: null });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  return compiled;
}

test('a placed look records with a sidecar that keeps the look', async () => {
  const compiledWiring = wired(strips);
  const result = await recordPlacedLook({ look, strips, compiledWiring });
  assert.equal(result.sidecar.format, 'lightweaver-placed-lwseq-sidecar');
  assert.deepEqual(result.sidecar.look, look);
  assert.equal(result.sidecar.pixelCount, 8);
  assert.equal(result.bytes.byteLength, result.estimate.totalBytes);
  assert.equal(result.sidecar.layoutPhysicalOrderSha256, await hashPlacedLookLayout({ look, strips, compiledWiring }));
  assert.deepEqual(await verifyPlacedLookRecording(result, { strips, compiledWiring }), { ok: true });
});

test('a moved strip makes the recording out of date', async () => {
  const compiledWiring = wired(strips);
  const result = await recordPlacedLook({ look, strips, compiledWiring });
  const moved = [row('a', [10, 20, 30, 41]), strips[1]];
  assert.deepEqual(await verifyPlacedLookRecording(result, { strips: moved, compiledWiring: wired(moved) }),
    { ok: false, reason: 'recording-stale-layout' });
});

test('a saved placed look is a project recording the library keeps', async () => {
  const compiledWiring = wired(strips);
  const bakeResult = await recordPlacedLook({ look, strips, compiledWiring });
  const saved = await createRecordedSequenceAsset({ kind: 'placed-look', bakeResult, controller: {}, label: 'Ember sweep' });
  assert.equal(saved.kind, 'sequence');
  assert.equal(saved.asset.label, 'Ember sweep');
  assert.equal(saved.asset.source.kind, 'placed-look');
  const [kept] = normalizePatternLabSequenceAssets([saved.asset]);
  assert.ok(kept, 'the recording library accepts it');
  assert.equal(kept.source.kind, 'placed-look');
  assert.deepEqual(kept.source.payload, look);
  assert.equal(kept.look.mode, 'sequence');

  const project = { strips, compiledWiring, symmetry: null };
  assert.equal(recordingBakeInput(kept, project).kind, 'placed');
  assert.equal((await recordedSequenceFreshness(kept, project)).state, 'current');
  const moved = [row('a', [10, 20, 30, 41]), strips[1]];
  assert.equal((await recordedSequenceFreshness(kept, { strips: moved, compiledWiring: wired(moved), symmetry: null })).state, 'stale');
});

test('saving again under the same id replaces the recording', async () => {
  const compiledWiring = wired(strips);
  const first = await createRecordedSequenceAsset({ kind: 'placed-look',
    bakeResult: await recordPlacedLook({ look, strips, compiledWiring }), controller: {}, label: 'Ember sweep' });
  const controller = { sequenceAssets: [first.asset] };
  const again = await createRecordedSequenceAsset({ kind: 'placed-look',
    bakeResult: await recordPlacedLook({ look: { ...look, speed: 0.25 }, strips, compiledWiring }),
    controller, replaceId: first.asset.id });
  assert.equal(again.asset.id, first.asset.id);
  assert.equal(again.replaceSequenceAssetId, first.asset.id);
  assert.equal(again.asset.label, 'Ember sweep');
});

test('the card install check accepts a current placed look and refuses one the artwork moved under', async () => {
  const compiledWiring = wired(strips);
  const bakeResult = await recordPlacedLook({ look, strips, compiledWiring });
  const { asset } = await createRecordedSequenceAsset({ kind: 'placed-look', bakeResult, controller: {}, label: 'Ember sweep' });
  const wiring = makeDefaultWiring(strips);
  assert.equal(await assertRecordedMediaCurrentLayout(asset, { strips, wiring, compiledWiring, symmetry: null }, bakeResult.bytes), true);
  const moved = [row('a', [10, 20, 30, 41]), strips[1]];
  await assert.rejects(
    assertRecordedMediaCurrentLayout(asset, { strips: moved, wiring, compiledWiring: wired(moved), symmetry: null }, bakeResult.bytes),
    /no longer matches this project's artwork or wiring \(recording-stale-layout\)/,
  );
});
