import { hasPlaybackReversal, OUTPUT_PLAYBACK_ORDER, pixelsInPlaybackOrder } from './wiringCompiler.js';
// A placed look saved with the project: its LWSEQ1 recording plus a sidecar
// that keeps the look itself, so the project's recording library, the card
// install path and "Record again" treat it like any other recording.
//
//   sidecar = { format: 'lightweaver-placed-lwseq-sidecar', version: 1,
//               hashAlgorithm: 'SHA-256', look, lookSha256,
//               layoutPhysicalOrderSha256, lwseqSha256,
//               fps, frameCount, pixelCount, outputs }
//
// `layoutPhysicalOrderSha256` fingerprints everything the bake read besides
// the look: every strip's LED positions, the wired order of the lights, and
// the symmetry sides when the look plays alike on them. A recording whose
// fingerprint no longer matches the project is out of date, never sent.

import { bakePlacedLook, estimatePlacedLookBake, normalizePlacedLook } from './placedLook.js';
import { canonicalProjectJson } from './projectRepository.js';

export const PLACED_LOOK_SIDECAR_FORMAT = 'lightweaver-placed-lwseq-sidecar';
export const PLACED_LOOK_RECORD_SECONDS = 20;

const round = value => Math.round(Number(value) * 1000) / 1000;

export function canonicalPlacedLookJson(value) {
  return canonicalProjectJson(value);
}

async function sha256(input) {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle?.digest) throw new Error('Secure SHA-256 hashing is unavailable.');
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** What the bake read besides the look, in a stable form. */
export function placedLookLayout({ look, strips = [], compiledWiring = null, symmetry = null } = {}, { legacyLogicalPlayback = false } = {}) {
  const normalized = normalizePlacedLook(look);
  const playbackOrderChanged = hasPlaybackReversal(compiledWiring);
  return {
    ...(!legacyLogicalPlayback && playbackOrderChanged ? { playbackOrder: OUTPUT_PLAYBACK_ORDER } : {}),
    strips: (strips || []).map(strip => ({
      id: String(strip?.id ?? ''),
      pixels: (strip?.pixels || []).map(point => [round(point?.x), round(point?.y)]),
    })),
    order: (legacyLogicalPlayback ? (compiledWiring?.pixels || []) : pixelsInPlaybackOrder(compiledWiring)).map(pixel => [
      String(pixel?.outputId ?? ''),
      pixel?.inactive ? null : (pixel?.stripId ?? null),
      pixel?.inactive ? null : (Number.isFinite(pixel?.sourceLed) ? pixel.sourceLed : null),
    ]),
    sides: normalized.alikeOnSides && symmetry?.sides?.length
      ? symmetry.sides.map(side => (side?.stripIds || []).map(String))
      : null,
  };
}

export async function hashPlacedLookLayout(input = {}, options) {
  return sha256(canonicalPlacedLookJson(placedLookLayout(input, options)));
}

/**
 * Record a placed look for saving. Same inputs as bakePlacedLook plus
 * `seconds`. Returns `{ bytes, sidecar, sidecarJson, outputs, estimate }`.
 */
export async function recordPlacedLook({ look, strips = [], compiledWiring = null, symmetry = null, seconds = PLACED_LOOK_RECORD_SECONDS } = {}) {
  const normalized = normalizePlacedLook(look);
  const options = { seconds, symmetry };
  const estimate = estimatePlacedLookBake(normalized, compiledWiring, options);
  const bake = bakePlacedLook(normalized, strips, compiledWiring, options);
  // The project's recording library names every output (patternLabHandoff.js).
  const named = new Map((compiledWiring?.outputs || []).map(output => [String(output.id), output]));
  const outputs = bake.outputs.map(output => {
    const source = named.get(output.id) || {};
    return { ...output, name: String(source.name || source.label || `Output ${output.pin}`).slice(0, 80) };
  });
  const [lookSha256, layoutPhysicalOrderSha256, lwseqSha256] = await Promise.all([
    sha256(canonicalPlacedLookJson(normalized)),
    hashPlacedLookLayout({ look: normalized, strips, compiledWiring, symmetry }),
    sha256(bake.bytes),
  ]);
  const sidecar = {
    format: PLACED_LOOK_SIDECAR_FORMAT, version: 1, hashAlgorithm: 'SHA-256',
    look: normalized, lookSha256, layoutPhysicalOrderSha256, lwseqSha256,
    fps: bake.fps, frameCount: bake.frameCount, pixelCount: bake.pixelCount,
    outputs,
  };
  return Object.freeze({
    bytes: bake.bytes, sidecar, sidecarJson: canonicalPlacedLookJson(sidecar),
    outputs, estimate: { ...estimate, totalBytes: bake.byteLength },
  });
}

/** Does this recording still match the project it would play on? */
export async function verifyPlacedLookRecording({ bytes, sidecar } = {}, { strips = [], compiledWiring = null, symmetry = null } = {}) {
  if (!sidecar || sidecar.format !== PLACED_LOOK_SIDECAR_FORMAT || sidecar.version !== 1) {
    return { ok: false, reason: 'recording-invalid' };
  }
  if (bytes && await sha256(bytes) !== sidecar.lwseqSha256) return { ok: false, reason: 'recording-invalid' };
  if (await sha256(canonicalPlacedLookJson(normalizePlacedLook(sidecar.look))) !== sidecar.lookSha256) {
    return { ok: false, reason: 'recording-invalid' };
  }
  const input = { look: sidecar.look, strips, compiledWiring, symmetry };
  const hashes = [await hashPlacedLookLayout(input), await hashPlacedLookLayout(input, { legacyLogicalPlayback: true })];
  if (!hashes.includes(sidecar.layoutPhysicalOrderSha256)) return { ok: false, reason: 'recording-stale-layout' };
  return { ok: true };
}
