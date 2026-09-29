import { PALETTE_DEFAULT } from '../data.js';
import { expandPatchBoard, normalizePatchBoard } from './patchBoard.js';
import { applyLookColorModifiers } from './previewColorModifiers.js';
import { compileWiring } from './wiringCompiler.js';
import { applyMirrorSets } from './mirrorFrame.js';
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
  mirrorSets = [],
  targets = [],
  resolvePatternId = patternId => patternId,
  paletteForPattern = () => PALETTE_DEFAULT,
} = {}) {
  const compiled = compiledWiring || (wiring ? compileWiring({ wiring, strips, mirrorSets }) : null);
  const pixelsByTargetId = new Map();
  // A mirror set compiles to ONE zone of several ranges, one range per member
  // strip. The segment keeps every member's pixels in range order (so callers
  // that map the frame back onto the wiring still see one contiguous slice), and
  // records where each member starts so the renderer can play each range from
  // its own LED 1 and copy the lead onto the others, as the card does.
  const mirrorGroupsByTargetId = new Map();
  if (compiled?.ok) {
    const mirrorSetIds = new Set((Array.isArray(mirrorSets) ? mirrorSets : []).map(set => set?.id));
    for (const zone of compiled.zones || []) {
      const pixels = [];
      const groups = [];
      for (const range of zone.ranges || []) {
        const start = Math.max(0, Math.trunc(Number(range.start) || 0));
        const count = Math.max(0, Math.trunc(Number(range.count) || 0));
        let groupCount = 0;
        let groupStripId = null;
        for (let index = 0; index < count; index += 1) {
          const pixel = compiled.pixels[start + index];
          if (pixel && !pixel.inactive) {
            pixels.push(pixel);
            groupCount += 1;
            if (groupStripId == null) groupStripId = pixel.stripId;
          }
        }
        if (groupCount > 0) groups.push({ stripId: groupStripId, count: groupCount });
      }
      if (pixels.length) pixelsByTargetId.set(zone.id, pixels);
      if (groups.length > 1 && mirrorSetIds.has(zone.id)) mirrorGroupsByTargetId.set(zone.id, { setId: zone.id, groups });
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
    .map(target => {
      // Compiled wiring keys pixels by ZONE id; the uncompiled patch board keys
      // them by PATCH id. A target carries both, so try its Studio identity
      // first and fall back to the card identity rather than assuming one.
      const pixels = pixelsByTargetId.get(target.id)
        || (target.zoneId ? pixelsByTargetId.get(target.zoneId) : null)
        || [];
      if (!pixels.length) return null;
      const mirrorGroups = mirrorGroupsByTargetId.get(target.id)
        || (target.zoneId ? mirrorGroupsByTargetId.get(target.zoneId) : null)
        || null;
      const look = { ...(target.look || {}) };
      const sourcePatternId = String(look.patternId || 'aurora');
      const patternId = resolvePatternId(sourcePatternId) || sourcePatternId;
      return {
        id: target.id,
        label: String(target.label || target.id),
        targetId: target.id,
        sourcePatternId,
        patternId,
        pixels: pixels.map((pixel, index) => ({
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
        ...(mirrorGroups ? { mirror: mirrorGroups } : {}),
      };
    })
    .filter(Boolean);
}

/**
 * Split each mirror-set segment into one virtual strip per member, so a renderer
 * plays every member from its own LED 1 and a mirror pass can copy the lead onto
 * the twins instead of running one pattern down a single long strip.
 *
 * The expanded strips keep the segment's pixels in the same order and count, so
 * the concatenated frame is index-for-index the frame of the unexpanded list.
 * Returns the strips to render and the mirror sets (over the expanded ids) to
 * pass with them; `mirrorSets` given by the caller are kept as they are.
 */
export function expandPatternPreviewMirrorSegments(segments = [], mirrorSets = []) {
  const carried = Array.isArray(mirrorSets) ? mirrorSets : [];
  const derived = [];
  const strips = [];
  for (const segment of segments || []) {
    const groups = segment?.mirror?.groups;
    if (!Array.isArray(groups) || groups.length < 2) {
      strips.push(segment);
      continue;
    }
    const { mirror, ...base } = segment;
    const idByStripId = new Map();
    let offset = 0;
    for (const group of groups) {
      const id = `${segment.id}::${group.stripId}`;
      idByStripId.set(group.stripId, id);
      strips.push({
        ...base,
        id,
        parentId: segment.id,
        pixels: (segment.pixels || []).slice(offset, offset + group.count)
          .map((pixel, index) => ({ ...pixel, index })),
      });
      offset += group.count;
    }
    const set = carried.find(item => item?.id === mirror.setId);
    const ordered = (Array.isArray(set?.members) ? set.members : [])
      .filter(stripId => idByStripId.has(stripId));
    // A member the set no longer names still has a range; append it so it
    // follows the lead rather than free-running.
    for (const group of groups) if (!ordered.includes(group.stripId)) ordered.push(group.stripId);
    derived.push({
      id: mirror.setId,
      name: set?.name || segment.label || mirror.setId,
      members: ordered.map(stripId => idByStripId.get(stripId)),
    });
  }
  return { strips, mirrorSets: [...carried, ...derived] };
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
 * Mirror sets are applied AFTER the looks, never before: a look is a per-strip
 * recolour, so running it over a twin that already holds the lead's colours
 * (with a different look on the twin) would make the twin differ from the lead.
 * On the card the whole set is one zone with one look, so the lead's finished
 * colours are what every member shows.
 */
export function applyPatternPreviewSegmentLooks(pixels = [], segments = [], tMs = 0, { mirrorSets = [] } = {}) {
  let offset = 0;
  for (const segment of segments || []) {
    const count = segment?.pixels?.length || segment?.pts?.length || 0;
    if (count > 0) {
      applyLookColorModifiers(pixels.slice(offset, offset + count), tMs, segment.visualLook || {});
    }
    offset += count;
  }
  if (Array.isArray(mirrorSets) && mirrorSets.length) {
    // applyMirrorSets reads a strip's length from `pts`; segments may carry
    // `pixels` instead, so hand it the lengths this function already used.
    const lengths = (segments || []).map(segment => ({
      id: segment?.id,
      pts: { length: segment?.pixels?.length || segment?.pts?.length || 0 },
    }));
    applyMirrorSets({ framePixels: pixels, strips: lengths, mirrorSets });
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
