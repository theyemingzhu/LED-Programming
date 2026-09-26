import { buildPatternPreviewSegments, applyPatternPreviewSegmentLooks } from './patternPiecePreview.js';
import { getCardPatternById } from './cardPatternBank.js';
import { getPatternById } from './patternRegistry.js';
import { compilePattern, renderPixelFrame, normalizePalette } from './frameEngine.js';
import { normalizeProjectRenderStrips } from './renderGeometry.js';
import { normalizeSceneExpression, resolveSceneExpression } from './sceneExpression.js';
import { buildSceneExpressionAreaCatalog } from './sceneExpressionTargets.js';
import { createSceneExpressionPreviewRenderer } from './sceneExpressionFlow.js';
import { mapSceneExpressionPreviewFrame } from './sceneExpressionFrame.js';
import { effectiveSceneFlowAt, scenePlaybackAt, scenePreviewAvailability } from '../scene-expression/sceneExpressionEditorModel.js';
import { estimateLwseqBytes, LWSEQ_HEADER_BYTES, toLwseqBytes } from './standaloneController.js';

export const MAX_SCENE_FLOW_RECORDING_BYTES = 16 * 1024 * 1024;
export const MAX_SCENE_FLOW_RECORDING_SECONDS = 10 * 60;
const MAX_FPS = 24;
const MIB = 1024 * 1024;

function recordingSize(bytes) {
  return bytes >= MIB ? `${(bytes / MIB).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function abortError() {
  return new DOMException('Flow recording was canceled', 'AbortError');
}

function checkAbort(signal) { if (signal?.aborted) throw abortError(); }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  if (value === undefined) throw new TypeError('Recording source contains undefined data');
  return JSON.stringify(value);
}

export const canonicalSceneExpressionBakeJson = canonical;

async function sha256(value, signal) {
  checkAbort(signal);
  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 hashing is unavailable');
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  checkAbort(signal);
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const patternId = id => {
  const card = getCardPatternById(id);
  return card?.previewPatternId || card?.preset || id;
};

function sourceSnapshot(input) {
  if (!input.compiledWiring?.ok || !Array.isArray(input.compiledWiring.pixels)) {
    throw new TypeError('Known compiled physical wiring is required for Flow recording');
  }
  const scene = normalizeSceneExpression(input.scene);
  const layout = structuredClone({
    strips: input.strips, patchBoard: input.patchBoard ?? null,
    wiring: input.wiring, compiledWiring: input.compiledWiring,
    sectionFamilies: input.sectionFamilies ?? [], layoutLayerGroups: input.layoutLayerGroups ?? [],
    palette: input.palette ?? null, hidden: input.hidden ?? {},
    render: { motionSmoothing: 'off', bpm: 120, gammaEnabled: false, gammaValue: 2.2 },
  });
  if (!Array.isArray(layout.strips) || !layout.strips.length || !Array.isArray(layout.wiring?.outputs)) {
    throw new TypeError('Artwork and physical output wiring are required for Flow recording');
  }
  const catalog = buildSceneExpressionAreaCatalog({ strips: layout.strips,
    sectionFamilies: layout.sectionFamilies, layerGroups: layout.layoutLayerGroups,
    compiledWiring: layout.compiledWiring });
  const resolved = resolveSceneExpression(scene, catalog);
  const availability = scenePreviewAvailability(scene, resolved, catalog);
  if (!availability.ok) throw new TypeError(availability.message);
  const outputs = layout.wiring.outputs.map(output => ({
    id: String(output.id), name: String(output.name || output.id), pin: Number(output.pin),
    pixels: layout.compiledWiring.pixels.filter(pixel => String(pixel.outputId) === String(output.id)).length,
  })).filter(output => output.pixels);
  if (!outputs.length || outputs.some(output => !Number.isSafeInteger(output.pin))
    || outputs.reduce((sum, output) => sum + output.pixels, 0) !== layout.compiledWiring.pixels.length) {
    throw new TypeError('Compiled physical outputs are incomplete for Flow recording');
  }
  return { scene, layout, catalog, resolved, outputs };
}

function prepare(input) {
  // Reject a card-incompatible physical layout before catalog or renderer work.
  const physicalCount = input.compiledWiring?.pixels?.length;
  if (Number.isSafeInteger(physicalCount) && (physicalCount < 1 || physicalCount > 4096)) {
    throw new RangeError('Flow recording supports from 1 to 4096 physical LEDs');
  }
  const snapshot = sourceSnapshot(input);
  const fps = input.fps ?? MAX_FPS;
  if (!Number.isSafeInteger(fps) || fps < 1 || fps > MAX_FPS) throw new RangeError(`Flow recording FPS must be from 1 to ${MAX_FPS}`);
  const durationMs = snapshot.scene.steps.reduce((sum, step) => sum + step.holdMs, 0);
  if (durationMs <= 0 || durationMs > MAX_SCENE_FLOW_RECORDING_SECONDS * 1000) {
    throw new RangeError(`Flow recording must be at most ${MAX_SCENE_FLOW_RECORDING_SECONDS} seconds`);
  }
  const frameCount = Math.ceil(durationMs * fps / 1000);
  const pixelCount = snapshot.layout.compiledWiring.pixels.length;
  if (pixelCount < 1 || pixelCount > 4096) {
    throw new RangeError('Flow recording supports from 1 to 4096 physical LEDs');
  }
  const estimate = estimateLwseqBytes({ pixels: pixelCount, frames: frameCount, fps });
  const maxBytes = input.maxBytes ?? MAX_SCENE_FLOW_RECORDING_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < LWSEQ_HEADER_BYTES || maxBytes > MAX_SCENE_FLOW_RECORDING_BYTES) {
    throw new RangeError('Flow recording storage cap is invalid');
  }
  if (!Number.isSafeInteger(estimate.totalBytes) || estimate.totalBytes > maxBytes) {
    throw new RangeError(`Flow recording needs ${recordingSize(estimate.totalBytes)}, above the ${recordingSize(maxBytes)} storage limit. Record a shorter loop.`);
  }
  return { ...snapshot, fps, durationMs, frameCount, pixelCount, maxBytes, estimate };
}

export function estimateSceneExpressionFlowRecording(input) {
  const prepared = prepare(input);
  return Object.freeze({ ...prepared.estimate, pixelCount: prepared.pixelCount,
    frameCount: prepared.frameCount, fps: prepared.fps,
    durationSeconds: prepared.durationMs / 1000, maxBytes: prepared.maxBytes });
}

function previewSegmentsAt(prepared, resolvedStep) {
  const { layout, scene } = prepared;
  const targets = layout.strips.map(strip => {
    const state = resolvedStep?.states?.[strip.id] || scene.defaults;
    return { kind: 'section', id: strip.id, zoneId: `patch-${strip.id}`,
      look: { patternId: state.pattern.rendererId, speed: state.pattern.speed,
        brightness: state.intensity.brightness,
        ...(state.color.kind === 'card-controls' ? state.color : {}) },
      palette: state.color.kind === 'palette' ? state.color.colors : null };
  });
  return buildPatternPreviewSegments({
    strips: layout.strips, patchBoard: layout.patchBoard, targets,
    resolvePatternId: patternId,
    paletteForPattern: id => getPatternById(patternId(id))?.pal || layout.palette,
  }).map(segment => ({ ...segment,
    palette: targets.find(target => target.id === segment.id)?.palette || segment.palette }));
}

function buildStepRenderContexts(prepared, clock) {
  return new Map(prepared.scene.steps.map(step => {
    const resolvedStep = prepared.resolved.steps.find(item => item.id === step.id);
    const flow = effectiveSceneFlowAt(prepared.scene, step.id, prepared.catalog);
    if (flow.errors.length) throw new TypeError(flow.errors[0].message);
    const segments = previewSegmentsAt(prepared, resolvedStep);
    const renderer = flow.assignments.length ? createSceneExpressionPreviewRenderer({
      assignments: flow.assignments, catalog: prepared.catalog, segments,
      stateByStrip: resolvedStep?.states, getFlowTime: () => clock.time,
    }) : null;
    if (renderer && !renderer.ok) throw new TypeError(renderer.errors[0]?.message || 'Flow renderer is unavailable');
    const strips = normalizeProjectRenderStrips((renderer?.ok
      ? segments.map(segment => ({ ...segment, patternId: undefined })) : segments));
    const perStripPalettes = new Map(segments.filter(segment => Array.isArray(segment.palette))
      .map(segment => [segment.id, normalizePalette(segment.palette)]));
    const perStripFns = new Map(segments.filter(segment => segment.patternId)
      .map(segment => [segment.patternId, compilePattern(segment.patternId)]));
    return [step.id, { segments, renderer, strips, perStripPalettes, perStripFns }];
  }));
}

function renderAt(prepared, frameIndex, stepContexts, clock) {
  const time = frameIndex / prepared.fps;
  clock.time = time;
  const playback = scenePlaybackAt(prepared.scene, time * 1000);
  const context = stepContexts.get(playback.stepId);
  const frame = renderPixelFrame({ t: time, strips: context.strips, patternId: 'aurora',
    activeFn: context.renderer?.compiledFn || null, perStripPalettes: context.perStripPalettes,
    perStripFns: context.renderer?.ok ? new Map() : context.perStripFns });
  applyPatternPreviewSegmentLooks(frame.pixels, context.segments, time * 1000);
  const mapped = mapSceneExpressionPreviewFrame({ framePixels: frame.pixels, segments: context.segments,
    compiledWiring: prepared.layout.compiledWiring });
  if (!mapped.ok) throw new TypeError(mapped.errors[0]?.message || 'Physical Flow frame mapping failed');
  return mapped.pixels;
}

export async function bakeSceneExpressionFlow(input = {}) {
  checkAbort(input.signal);
  const prepared = prepare(input);
  checkAbort(input.signal);
  const template = toLwseqBytes([Array.from({ length: prepared.pixelCount }, () => ({ r: 0, g: 0, b: 0 }))],
    { fps: prepared.fps, outputs: prepared.outputs });
  const bytes = new Uint8Array(prepared.estimate.totalBytes);
  bytes.set(template.subarray(0, LWSEQ_HEADER_BYTES));
  new DataView(bytes.buffer).setUint32(16, prepared.frameCount, true);
  const clock = { time: 0 };
  const stepContexts = buildStepRenderContexts(prepared, clock);
  for (let frameIndex = 0; frameIndex < prepared.frameCount; frameIndex += 1) {
    checkAbort(input.signal);
    const physical = renderAt(prepared, frameIndex, stepContexts, clock);
    if (physical.length !== prepared.pixelCount) throw new RangeError('Flow frame changed physical pixel count');
    let offset = LWSEQ_HEADER_BYTES + frameIndex * prepared.pixelCount * 3;
    for (const color of physical) {
      bytes[offset++] = parseInt(color.slice(0, 2), 16);
      bytes[offset++] = parseInt(color.slice(2, 4), 16);
      bytes[offset++] = parseInt(color.slice(4, 6), 16);
    }
    if ((frameIndex + 1) % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  checkAbort(input.signal);
  const [sceneSha256, layoutPhysicalOrderSha256, lwseqSha256] = await Promise.all([
    sha256(canonical(prepared.scene), input.signal),
    sha256(canonical(prepared.layout), input.signal),
    sha256(bytes, input.signal),
  ]);
  const sidecar = { format: 'lightweaver-flow-lwseq-sidecar', version: 1,
    hashAlgorithm: 'SHA-256', scene: prepared.scene, sceneSha256,
    layoutPhysicalOrderSha256, lwseqSha256, fps: prepared.fps,
    frameCount: prepared.frameCount, pixelCount: prepared.pixelCount,
    outputs: prepared.outputs };
  return Object.freeze({ bytes, sidecar, sidecarJson: canonical(sidecar),
    outputs: prepared.outputs, estimate: estimateSceneExpressionFlowRecording(input) });
}

export async function verifySceneExpressionFlowBake(bakeResult, input = {}) {
  try {
    const prepared = prepare({ ...input, fps: bakeResult?.sidecar?.fps });
    const sidecar = bakeResult?.sidecar;
    if (!sidecar || sidecar.format !== 'lightweaver-flow-lwseq-sidecar' || sidecar.version !== 1
      || sidecar.hashAlgorithm !== 'SHA-256' || sidecar.frameCount !== prepared.frameCount
      || sidecar.pixelCount !== prepared.pixelCount
      || sidecar.lwseqSha256 !== await sha256(bakeResult.bytes, input.signal)
      || bakeResult.bytes.byteLength !== prepared.estimate.totalBytes
      || bakeResult.sidecarJson !== canonical(sidecar)) return { ok: false, reason: 'recording-invalid' };
    if (sidecar.sceneSha256 !== await sha256(canonical(prepared.scene), input.signal)
      || canonical(sidecar.scene) !== canonical(prepared.scene)) return { ok: false, reason: 'recording-stale-scene' };
    if (canonical(sidecar.outputs) !== canonical(prepared.outputs)
      || sidecar.layoutPhysicalOrderSha256 !== await sha256(canonical(prepared.layout), input.signal)) {
      return { ok: false, reason: 'recording-stale-layout' };
    }
    return { ok: true };
  } catch (error) { return { ok: false, reason: error?.name === 'AbortError' ? 'cancelled' : 'recording-invalid', error }; }
}
