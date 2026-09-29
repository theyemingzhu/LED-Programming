import { PALETTE_DEFAULT } from '../data.js';
import { expandPatchBoard, normalizePatchBoard } from './patchBoard.js';
import { applyLookColorModifiers } from './previewColorModifiers.js';
import { compileWiring } from './wiringCompiler.js';
import { applyPreviewMirrors, sideFlippedByRule } from './mirrorFrame.js';
import { getCardPatternById } from './cardPatternBank.js';
import { getPatternById } from './patternRegistry.js';

export function resolvePreviewPatternId(patternId) {
  if (getPatternById(patternId)) return patternId;
  const card = getCardPatternById(patternId);
  const candidate = card?.previewPatternId || card?.preset;
  return candidate && getPatternById(candidate) ? candidate : null;
}

// v1 stored strip focus on every visit because strip was the former default.
// A new key lets the piece open as a whole without mistaking that old default
// for an intentional focus; explicit focus still persists within v2.
export const PATTERN_PREVIEW_UI_STORAGE_PREFIX = 'lw_pattern_piece_preview_v2:';

function storageFor(storage) {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function previewStorageKey(projectId) {
  return `${PATTERN_PREVIEW_UI_STORAGE_PREFIX}${String(projectId || 'default')}`;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatViewBoxNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/**
 * Turn independently addressable patch-board targets into virtual preview
 * strips. A virtual strip is one exact patch range, so split/reversed ranges
 * keep their real LED count, geometry, and physical order.
 */
export function buildPatternPreviewSegments({
  strips = [],
  patchBoard = null,
  wiring = null,
  compiledWiring = null,
  symmetry = null,
  targets = [],
  resolvePatternId = patternId => patternId,
  paletteForPattern = () => PALETTE_DEFAULT,
} = {}) {
  const compiled = compiledWiring || (wiring ? compileWiring({ wiring, strips, symmetry }) : null);
  const pixelsByTargetId = new Map();
  // A side compiles to ONE continuous zone of several ranges, one per strip in
  // the side's order. Its segment is one virtual strip holding every strip's
  // pixels in that order, so the pattern flows through the side as the card
  // plays it.
  // Zone flip flags, for callers that hand over compiled zones but no symmetry.
  const zoneFlipById = new Map();
  // A continuous zone is one pattern run: its index and count span the zone.
  const continuousZoneIds = new Set();
  if (compiled?.ok) {
    for (const zone of compiled.zones || []) {
      const pixels = [];
      if (zone.continuous) continuousZoneIds.add(zone.id);
      for (const range of zone.ranges || []) {
        const start = Math.max(0, Math.trunc(Number(range.start) || 0));
        const count = Math.max(0, Math.trunc(Number(range.count) || 0));
        for (let index = 0; index < count; index += 1) {
          const pixel = compiled.pixels[start + index];
          if (pixel && !pixel.inactive) pixels.push(pixel);
        }
      }
      if (pixels.length) pixelsByTargetId.set(zone.id, pixels);
      if (zone.mirrorFlip != null) zoneFlipById.set(zone.id, Boolean(zone.mirrorFlip));
    }
  } else {
    const board = normalizePatchBoard(patchBoard, strips);
    const expanded = expandPatchBoard(board, strips);
    for (const pixel of expanded.pixels) {
      if (!pixel?.patchId || pixel.inactive) continue;
      if (!pixelsByTargetId.has(pixel.patchId)) pixelsByTargetId.set(pixel.patchId, []);
      pixelsByTargetId.get(pixel.patchId).push(pixel);
    }
  }

  return (targets || [])
    .filter(target => target?.kind === 'section' && target.id)
    .flatMap(target => {
      // Compiled wiring keys pixels by ZONE id; the uncompiled patch board keys
      // them by PATCH id. A target carries both, so try its Studio identity
      // first and fall back to the card identity rather than assuming one.
      const pixels = pixelsByTargetId.get(target.id)
        || (target.zoneId ? pixelsByTargetId.get(target.zoneId) : null)
        || [];
      if (!pixels.length) return [];
      const look = { ...(target.look || {}) };
      const sourcePatternId = String(look.patternId || 'aurora');
      const patternId = resolvePatternId(sourcePatternId) || sourcePatternId;
      const segmentFor = (id, segmentPixels, extra = {}, continuous = false) => ({
        ...(continuous ? { run: { before: 0, length: segmentPixels.length } } : {}),
        id,
        label: String(target.label || target.id),
        targetId: target.id,
        sourcePatternId,
        patternId,
        pixels: segmentPixels.map((pixel, index) => ({
          x: finite(pixel.x, 0),
          y: finite(pixel.y, 0),
          index,
          sourceLed: pixel.sourceLed,
          stripId: pixel.stripId,
        })),
        brightness: finite(look.brightness, 1),
        speed: finite(look.speed, 1),
        // Card hue shift is part of the firmware-faithful visual post-pass.
        // Leaving the frame-engine degree shift at zero prevents double use.
        hueShift: 0,
        visualLook: look,
        palette: paletteForPattern(sourcePatternId) || PALETTE_DEFAULT,
        ...extra,
      });
      const segments = [segmentFor(target.id, pixels, {},
        continuousZoneIds.has(target.id) || continuousZoneIds.has(target.zoneId))];
      // "Both sides, mirrored": the target names the sides that copy it. Each
      // becomes a virtual strip of its own (so the whole piece is lit) that the
      // renderer fills from this segment, stretched to its length and reversed
      // when the flip rule says so.
      const sideOrder = Array.isArray(symmetry?.sides) ? symmetry.sides.map(side => side?.id) : [];
      for (const [position, sideId] of (Array.isArray(target.mirroredSides) ? target.mirroredSides : []).entries()) {
        const sidePixels = pixelsByTargetId.get(sideId);
        if (!sidePixels?.length) continue;
        const sideIndex = sideOrder.indexOf(sideId);
        const mirrorFlip = sideIndex >= 0
          ? sideFlippedByRule(symmetry, sideIndex)
          : zoneFlipById.get(sideId) ?? sideFlippedByRule(symmetry, position + 1);
        segments.push(segmentFor(sideId, sidePixels, { mirrorOf: target.id, mirrorFlip, mirrorSideId: sideId },
          continuousZoneIds.has(sideId)));
      }
      return segments;
    });
}

/** Return a tight, padded SVG viewBox around the supplied preview segments. */
export function fitPreviewViewBox(segments = [], fallbackViewBox = '0 0 640 400') {
  const points = (segments || []).flatMap(segment => segment?.pixels || []);
  if (!points.length) return fallbackViewBox;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const x = finite(point?.x, NaN);
    const y = finite(point?.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return fallbackViewBox;

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const padding = Math.max(4, Math.max(width, height) * 0.08);
  return [
    minX - padding,
    minY - padding,
    width + padding * 2,
    height + padding * 2,
  ].map(formatViewBoxNumber).join(' ');
}

/**
 * Apply each virtual segment's firmware color post-pass to its pixel slice.
 *
 * Mirrors are applied AFTER the looks, never before: a look is a per-strip
 * recolour, so running it over a twin that already holds the lead's colours
 * (with a different look on the twin) would make the twin differ from the lead.
 * On the card a mirrored side copies the lead's finished colours. Segments that
 * carry `mirrorOf` copy their source; `symmetry` + `sidesMirrored` mirror layout
 * strips whose ids the symmetry names.
 */
export function applyPatternPreviewSegmentLooks(pixels = [], segments = [], tMs = 0, { symmetry = null, sidesMirrored = true } = {}) {
  let offset = 0;
  for (const segment of segments || []) {
    const count = segment?.pixels?.length || segment?.pts?.length || 0;
    if (count > 0) {
      applyLookColorModifiers(pixels.slice(offset, offset + count), tMs, segment.visualLook || {});
    }
    offset += count;
  }
  const mirrors = (segments || []).some(segment => segment?.mirrorOf);
  if (symmetry || mirrors) {
    // The mirror pass reads a strip's length from `pts`; segments may carry
    // `pixels` instead, so hand it the lengths this function already used.
    const lengths = (segments || []).map(segment => ({
      id: segment?.id,
      mirrorOf: segment?.mirrorOf,
      mirrorFlip: segment?.mirrorFlip,
      pts: { length: segment?.pixels?.length || segment?.pts?.length || 0 },
    }));
    applyPreviewMirrors({ framePixels: pixels, strips: lengths, symmetry, sidesMirrored });
  }
  return pixels;
}

export function readPatternPreviewUiState({ projectId, targetIds = [], storage = null } = {}) {
  const validTargetIds = (targetIds || []).filter(Boolean);
  const fallbackTargetId = validTargetIds[0] || '';
  let parsed = null;
  try {
    const raw = storageFor(storage)?.getItem(previewStorageKey(projectId));
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const rememberedTargetId = String(parsed?.lastTargetId || '');
  return {
    mode: parsed?.mode === 'strip' ? 'strip' : 'piece',
    lastTargetId: validTargetIds.includes(rememberedTargetId)
      ? rememberedTargetId
      : fallbackTargetId,
    restored: Boolean(parsed),
  };
}

export function writePatternPreviewUiState({ projectId, state, storage = null } = {}) {
  try {
    storageFor(storage)?.setItem(previewStorageKey(projectId), JSON.stringify({
      mode: state?.mode === 'strip' ? 'strip' : 'piece',
      lastTargetId: String(state?.lastTargetId || ''),
    }));
  } catch {
    // Preview preferences are optional UI state; storage failure must not block
    // pattern authoring or touch the project document.
  }
}
