import { canonicalSceneExpressionBakeJson } from './sceneExpressionRecording.js';
import { normalizePatternLabSequenceAssets, MAX_PATTERN_LAB_SEQUENCE_ASSETS } from './patternLabHandoff.js';
import { LWSEQ_HEADER_BYTES, buildStandaloneProfile } from './standaloneController.js';
import { readRecordedMedia, storeRecordedMedia } from './recordedSequenceMedia.js';
import { getCardPatternById } from './cardPatternBank.js';
import { normalizeSceneExpression } from './sceneExpression.js';

export const MAX_STORED_SEQUENCE_BYTES = 16 * 1024 * 1024;
export const MAX_STORED_SEQUENCE_TOTAL_BYTES = 48 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || !value.length || value.length % 4) throw new Error('Recorded media is missing.');
  const bytes = typeof Buffer !== 'undefined'
    ? new Uint8Array(Buffer.from(value, 'base64'))
    : Uint8Array.from(atob(value), character => character.charCodeAt(0));
  if (bytesToBase64(bytes) !== value) throw new Error('Recorded media is malformed.');
  return bytes;
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 hashing is unavailable.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function assertHeader(bytes, sidecar, outputs) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength !== LWSEQ_HEADER_BYTES + sidecar.frameCount * sidecar.pixelCount * 3
    || String.fromCharCode(...bytes.subarray(0, 6)) !== 'LWSEQ1'
    || view.getUint16(8, true) !== 1
    || view.getUint16(10, true) !== outputs.length
    || view.getUint32(12, true) !== sidecar.pixelCount
    || view.getUint32(16, true) !== sidecar.frameCount
    || view.getUint16(20, true) !== sidecar.fps
    || view.getUint16(22, true) !== 3) throw new Error('LWSEQ header does not match the recording.');
}

function assertOutputs(outputs, sidecar) {
  if (!Array.isArray(outputs) || outputs.length < 1 || outputs.length > 4
    || outputs.some(output => !output?.id || !Number.isInteger(output.pin)
      || !Number.isInteger(output.pixels) || output.pixels < 1)
    || outputs.reduce((sum, output) => sum + output.pixels, 0) !== sidecar.pixelCount
    || canonicalSceneExpressionBakeJson(outputs) !== canonicalSceneExpressionBakeJson(sidecar.outputs)) {
    throw new Error('Recorded output wiring does not match the source.');
  }
}

function uniqueId(label, assets) {
  const base = String(label || 'flow-recording').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'flow-recording';
  const used = new Set(assets.map(asset => asset.id));
  let id = base;
  for (let suffix = 2; used.has(id) || getCardPatternById(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}

export async function verifyStoredSequenceAsset(asset) {
  if (!asset?.mediaRef || asset.mediaRef.byteLength !== asset.byteLength
    || asset.mediaRef.sha256 !== asset.manifest?.lwseqSha256 || !HASH.test(asset.mediaRef.sha256)) {
    throw new Error('The recording has no verified media. Record it again.');
  }
  const bytes = await readRecordedMedia(asset.mediaRef.sha256);
  if (bytes.byteLength !== asset.byteLength || await sha256(bytes) !== asset.mediaRef.sha256) {
    throw new Error('Recorded media differs from its saved SHA-256. Record it again.');
  }
  assertHeader(bytes, asset.manifest, asset.outputs);
  return bytes;
}

export async function createRecordedSequenceAsset({ kind, bakeResult, controller = {}, label = '', sourceSnapshot = null } = {}) {
  if (kind !== 'expression-scene') throw new Error('A supported recording source kind is required.');
  const { bytes, sidecar, sidecarJson, outputs, estimate } = bakeResult || {};
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_STORED_SEQUENCE_BYTES
    || !sidecar || sidecar.format !== 'lightweaver-flow-lwseq-sidecar' || sidecar.version !== 1
    || !sidecar.scene || !HASH.test(sidecar.sceneSha256) || !HASH.test(sidecar.lwseqSha256)
    || !HASH.test(sidecar.layoutPhysicalOrderSha256)
    || sidecarJson !== canonicalSceneExpressionBakeJson(sidecar)
    || estimate?.totalBytes !== bytes.byteLength) throw new Error('The completed recording is incomplete or exceeds the 16 MiB project media limit.');
  assertOutputs(outputs, sidecar);
  assertHeader(bytes, sidecar, outputs);
  const sourceHash = await sha256(new TextEncoder().encode(canonicalSceneExpressionBakeJson(sidecar.scene)));
  const mediaHash = await sha256(bytes);
  if (sourceHash !== sidecar.sceneSha256 || mediaHash !== sidecar.lwseqSha256) {
    throw new Error('The completed recording does not match its exact source or media hash.');
  }
  if (sourceSnapshot?.scene && canonicalSceneExpressionBakeJson(normalizeSceneExpression(sourceSnapshot.scene))
    !== canonicalSceneExpressionBakeJson(sidecar.scene)) {
    throw new Error('The source changed while recording. Record the current flow again.');
  }
  const existing = normalizePatternLabSequenceAssets(controller.sequenceAssets);
  const replacing = existing.find(asset => asset.source?.kind === 'expression-scene'
    && asset.source.payload?.id === sidecar.scene.id);
  if (!replacing && existing.length >= MAX_PATTERN_LAB_SEQUENCE_ASSETS) throw new Error('The project recording library is full.');
  if (existing.filter(asset => asset.id !== replacing?.id)
    .reduce((sum, asset) => sum + asset.byteLength, bytes.byteLength) > MAX_STORED_SEQUENCE_TOTAL_BYTES) {
    throw new Error('The project recordings exceed the 48 MiB media limit.');
  }
  const id = replacing?.id || uniqueId(label || sidecar.scene.name, existing);
  const title = String(label || sidecar.scene.name || 'Flow recording').trim().slice(0, 160);
  const file = `/sequences/${mediaHash}.lwseq`;
  const media = { encoding: 'base64', bytes: bytes.byteLength, sha256: mediaHash, data: bytesToBase64(bytes) };
  const asset = {
    version: 1, id, label: title, format: 'lwseq', assetRef: `sha256:${mediaHash}`,
    file, sidecarFile: `${file}.json`, byteLength: bytes.byteLength,
    source: { kind, payload: structuredClone(sidecar.scene), sha256: sourceHash },
    outputs: structuredClone(outputs), manifest: structuredClone(sidecar),
    mediaRef: { kind: 'indexeddb-sha256', byteLength: bytes.byteLength, sha256: mediaHash },
    look: { id, label: title, mode: 'sequence', file, fps: sidecar.fps, loop: true },
  };
  const profile = buildStandaloneProfile({
    projectName: title, runtimeMode: 'sequence', outputs,
    controls: controller.controls, led: controller.led,
    looks: [{ ...asset.look, bytes: bytes.byteLength, sha256: mediaHash, brightness: 1 }],
    cardId: controller.cardId,
  });
  profile.runtimeMode = 'sd-sequence';
  profile.looks[0].bytes = bytes.byteLength;
  profile.looks[0].sha256 = mediaHash;
  return {
    kind: 'sequence', asset, look: asset.look, manifest: structuredClone(sidecar),
    ...(replacing ? { replaceSequenceAssetId: replacing.id } : {}),
    package: { app: 'Lightweaver', format: 'standalone-controller-package', version: 1,
      files: { '/lightweaver.json': profile, [file]: media, [`${file}.json`]: `${sidecarJson}\n` } },
  };
}

export async function applyRecordedSequenceAsset(controller = {}, result = {}) {
  if (result.kind !== 'sequence' || !result.asset) throw new Error('A completed recording is required.');
  const asset = normalizePatternLabSequenceAssets([result.asset])[0];
  if (!asset) throw new Error('The saved recording metadata is invalid.');
  const packageMedia = result.package?.files?.[asset.file];
  if (packageMedia?.sha256 !== asset.manifest.lwseqSha256 || packageMedia.bytes !== asset.byteLength) {
    throw new Error('The recorded package is missing its exact media.');
  }
  const bytes = base64ToBytes(packageMedia.data);
  if (bytes.byteLength !== asset.byteLength || await sha256(bytes) !== asset.manifest.lwseqSha256) {
    throw new Error('The recorded package media failed SHA-256.');
  }
  const existing = normalizePatternLabSequenceAssets(controller.sequenceAssets);
  const replacing = result.replaceSequenceAssetId === asset.id
    && existing.some(item => item.id === asset.id);
  if ((!replacing && (existing.some(item => item.id === asset.id) || existing.length >= MAX_PATTERN_LAB_SEQUENCE_ASSETS))
    || existing.filter(item => item.id !== asset.id)
      .reduce((sum, item) => sum + item.byteLength, asset.byteLength) > MAX_STORED_SEQUENCE_TOTAL_BYTES) {
    throw new Error('The project recording library has no room for this recording.');
  }
  const mediaRef = await storeRecordedMedia(bytes, asset.manifest.lwseqSha256);
  return { ...controller, activeSequenceAssetId: asset.id,
    sequenceAssets: [{ ...asset, mediaRef }, ...existing.filter(item => item.id !== asset.id)],
    ...(Array.isArray(controller.playlist) ? { playlist: controller.playlist.map(item => item.sequenceAssetId === asset.id
      ? { ...item, label: asset.label } : item) } : {}),
  };
}
