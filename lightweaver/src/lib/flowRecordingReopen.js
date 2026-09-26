import { normalizeSceneExpression } from './sceneExpression.js';
import { canonicalSceneExpressionBakeJson } from './sceneExpressionRecording.js';
import { inspectExpressionScenes } from './sceneExpressionProject.js';

const SHA256 = /^[a-f0-9]{64}$/;

export async function resolveFlowRecordingScene(asset, expressionScenes) {
  if (asset?.source?.kind !== 'expression-scene'
    || asset.manifest?.format !== 'lightweaver-flow-lwseq-sidecar') {
    throw new Error('This recording does not contain an editable Flow scene.');
  }
  const sceneId = asset.manifest.scene?.id;
  if (!sceneId || asset.source.payload?.id !== sceneId) {
    throw new Error('The saved Flow scene identity is incomplete.');
  }
  const inspection = inspectExpressionScenes(expressionScenes);
  if (!inspection.editable) throw new Error(inspection.message);
  const existing = expressionScenes?.scenes?.find(scene => scene.id === sceneId);
  if (existing) return { scene: existing, restored: false };

  const hash = asset.manifest.sceneSha256;
  if (!SHA256.test(hash) || asset.source.sha256 !== hash) {
    throw new Error('The saved Flow scene hash is invalid.');
  }
  const scene = normalizeSceneExpression(asset.manifest.scene);
  const canonical = canonicalSceneExpressionBakeJson(scene);
  if (canonical !== canonicalSceneExpressionBakeJson(asset.source.payload)) {
    throw new Error('The saved Flow scene differs from its recording source.');
  }
  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 hashing is unavailable.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
  const actual = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== hash) throw new Error('The saved Flow scene does not match its SHA-256.');
  return { scene, restored: true };
}
