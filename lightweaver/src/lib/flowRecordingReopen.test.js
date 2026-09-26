import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createSceneExpression } from '../scene-expression/sceneExpressionEditorModel.js';
import { normalizeSceneExpression } from './sceneExpression.js';
import { canonicalSceneExpressionBakeJson } from './sceneExpressionRecording.js';
import { resolveFlowRecordingScene } from './flowRecordingReopen.js';

globalThis.crypto ||= webcrypto;

async function fixture() {
  const scene = normalizeSceneExpression(createSceneExpression({ id: 'flow-one', name: 'Recorded source' }));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSceneExpressionBakeJson(scene)));
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { scene, asset: {
    source: { kind: 'expression-scene', payload: structuredClone(scene), sha256 },
    manifest: { format: 'lightweaver-flow-lwseq-sidecar', scene: structuredClone(scene), sceneSha256: sha256 },
  } };
}

test('Flow recording opens the current scene by ID, preserving newer edits', async () => {
  const { asset, scene } = await fixture();
  const newer = { ...scene, name: 'Newer scene edit' };
  const reopened = await resolveFlowRecordingScene(asset, { version: 1, activeSceneId: null, scenes: [newer] });
  assert.equal(reopened.restored, false);
  assert.equal(reopened.scene, newer);
});

test('missing Flow source restores only the exact scene confirmed by its manifest SHA', async () => {
  const { asset, scene } = await fixture();
  const empty = { version: 1, activeSceneId: null, scenes: [] };
  const reopened = await resolveFlowRecordingScene(asset, empty);
  assert.equal(reopened.restored, true);
  assert.deepEqual(reopened.scene, scene);
  asset.manifest.scene.name = 'Tampered';
  await assert.rejects(resolveFlowRecordingScene(asset, empty), /differs from its recording source/);
  asset.source.payload.name = 'Tampered';
  await assert.rejects(resolveFlowRecordingScene(asset, empty), /SHA-256/);
});
