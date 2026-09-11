import { chainPixelOffsets, mainChain, normalizePatchBoard } from './patchBoard.js';
import { normalizeCardVisualLook } from './cardVisualLook.js';
import { normalizePatternLabRecipe } from './patternLabRecipe.js';
import { derivePlaylistLookIds } from './cardPlaylist.js';
import { compileWiring } from './wiringCompiler.js';

export const ALL_SECTIONS_TARGET_ID = 'all';
export const MAX_SAVED_LOOKS = 12;
export const COMPOUND_PATTERN_TYPE = 'compound-pattern';

export function normalizeSectionVisualLook(look = {}) {
  return normalizeCardVisualLook(look);
}

export function deriveSectionTargets({
  strips = [],
  patchBoard = null,
  wiring = null,
  compiledWiring = null,
  defaultLook = {},
} = {}) {
  const compiled = compiledWiring || (wiring ? compileWiring({ wiring, strips }) : null);
  if (compiled?.ok) {
    const fallbackLook = normalizeSectionVisualLook(defaultLook);
    // A target carries TWO identities and they are not interchangeable:
    //   `id`     — the patch id. Studio's own identity for a section. Every
    //              write path keys off it (applyLookToPatchBoard matches
    //              patch.id, saved mixes store sectionLooks under it).
    //   `zoneId` — the compiled zone id. The card's identity, what runtime
    //              commands address.
    // Compiled wiring supplies the authoritative pixel geometry, but it must
    // NOT supply the Studio identity: setting `id` to the zone id makes every
    // per-section write miss its patch, and reading the look off `defaultLook`
    // instead of the patch throws away the pattern each section has saved.
    const compiledBoard = normalizePatchBoard(patchBoard, strips);
    const patchesByStripId = new Map();
    for (const rowId of mainChain(compiledBoard).rowIds) {
      const patch = (compiledBoard.patches || []).find(candidate => candidate.id === rowId);
      if (patch?.source?.type !== 'strip' || patch.output?.mode === 'off') continue;
      if (!patchesByStripId.has(patch.source.stripId)) patchesByStripId.set(patch.source.stripId, patch);
    }
    // A zone may span several strips (a layer group compiles to one zone), so
    // recover its strips from the pixels its ranges cover.
    const zonePatch = (zone) => {
      for (const range of zone.ranges || []) {
        const start = Math.max(0, Math.trunc(Number(range.start) || 0));
        const count = Math.max(0, Math.trunc(Number(range.count) || 0));
        for (let index = 0; index < count; index += 1) {
          const pixel = compiled.pixels?.[start + index];
          const patch = pixel?.stripId ? patchesByStripId.get(pixel.stripId) : null;
          if (patch) return patch;
        }
      }
      return patchesByStripId.get(zone.id) || null;
    };
    return [{
      id: ALL_SECTIONS_TARGET_ID,
      zoneId: '',
      kind: 'all',
      label: 'All sections',
      pixelCount: compiled.totalPixels,
      look: fallbackLook,
    }, ...compiled.zones.map(zone => {
      const patch = zonePatch(zone);
      return {
        id: patch?.id || zone.id,
        zoneId: zone.id,
        patchId: patch?.id || '',
        stripId: patch?.source?.stripId || zone.id,
        kind: 'section',
        label: zone.label,
        pixelCount: zone.ranges.reduce((sum, range) => sum + range.count, 0),
        start: zone.ranges[0]?.start || 0,
        end: (zone.ranges.at(-1)?.start || 0) + Math.max(0, (zone.ranges.at(-1)?.count || 0) - 1),
        ranges: zone.ranges,
        look: patch ? lookFromPatchPlayback(patch.playback, fallbackLook) : fallbackLook,
      };
    })];
  }
  const board = normalizePatchBoard(patchBoard, strips);
  const totalPixels = totalStripPixels(strips);
  const fallbackLook = normalizeSectionVisualLook(defaultLook);
  const offsets = chainPixelOffsets(board, strips);
  const stripById = new Map(strips.map(strip => [strip.id, strip]));
  const patchesById = new Map((board.patches || []).map(patch => [patch.id, patch]));

  const targets = [{
    id: ALL_SECTIONS_TARGET_ID,
    zoneId: '',
    kind: 'all',
    label: 'All sections',
    pixelCount: totalPixels,
    look: fallbackLook,
  }];

  for (const rowId of mainChain(board).rowIds) {
    const patch = patchesById.get(rowId);
    if (patch?.source?.type !== 'strip' || patch.output?.mode === 'off') continue;
    const strip = stripById.get(patch.source.stripId);
    const pixelCount = countPatchPixels(patch);
    const start = offsets.get(patch.id) || 0;
    targets.push({
      id: patch.id,
      zoneId: sanitizeId(patch.id),
      patchId: patch.id,
      stripId: patch.source.stripId,
      kind: 'section',
      label: String(patch.name || strip?.name || patch.id || 'Section'),
      pixelCount,
      start,
      end: start + Math.max(0, pixelCount - 1),
      look: lookFromPatchPlayback(patch.playback, fallbackLook),
    });
  }

  return targets;
}

export function applyLookToPatchBoard({
  patchBoard = null,
  strips = [],
  targetId = ALL_SECTIONS_TARGET_ID,
  look = {},
} = {}) {
  const board = normalizePatchBoard(patchBoard, strips);
  const nextLook = normalizeSectionVisualLook(look);
  const isAll = !targetId || targetId === ALL_SECTIONS_TARGET_ID;
  const normalizedTarget = sanitizeId(targetId);

  for (const patch of board.patches || []) {
    if (patch?.source?.type !== 'strip' || patch.output?.mode === 'off') continue;
    const matches = isAll || patch.id === targetId || sanitizeId(patch.id) === normalizedTarget;
    if (!matches) continue;
    patch.playback = lookToPlayback(nextLook, patch.playback);
  }

  return normalizePatchBoard(board, strips);
}

export function normalizeSavedLooks(looks = []) {
  if (!Array.isArray(looks)) return [];
  const seen = new Set();
  const normalized = [];

  for (const look of looks) {
    if (!look || typeof look !== 'object') continue;
    const id = sanitizeId(look.id || look.label || `look-${normalized.length + 1}`);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const linkedRecipe = normalizeLinkedRecipe(look.patternLabRecipe);
    normalized.push({
      id,
      type: COMPOUND_PATTERN_TYPE,
      label: String(look.label || titleFromId(id)),
      defaultLook: normalizeSectionVisualLook(look.defaultLook || look.look || {}),
      sectionLooks: normalizeSectionLooks(look.sectionLooks || look.zones || {}),
      ...(linkedRecipe ? { patternLabRecipe: linkedRecipe } : {}),
      updatedAt: Number.isFinite(Number(look.updatedAt)) ? Number(look.updatedAt) : 0,
    });
    if (normalized.length >= MAX_SAVED_LOOKS) break;
  }

  return normalized;
}

export function saveCurrentLookToController(controller = {}, {
  label = 'Saved Look',
  lookId = '',
  defaultLook = {},
  targets = [],
  patternLabRecipe = null,
} = {}) {
  const id = sanitizeId(lookId || label || `look-${Date.now()}`) || `look-${Date.now()}`;
  const existing = normalizeSavedLooks(controller.looks);
  const previous = existing.find(look => look.id === id);
  if (!previous && existing.length >= MAX_SAVED_LOOKS) {
    throw new RangeError(`This project already has ${MAX_SAVED_LOOKS} saved looks. Update a look or delete one before saving as new.`);
  }
  const linkedRecipe = normalizeLinkedRecipe(patternLabRecipe);
  const saved = {
    id,
    type: COMPOUND_PATTERN_TYPE,
    label: String(label || titleFromId(id)),
    defaultLook: normalizeSectionVisualLook(defaultLook),
    sectionLooks: sectionLooksFromTargets(targets),
    ...(linkedRecipe ? { patternLabRecipe: linkedRecipe } : {}),
    updatedAt: Date.now(),
  };
  const looks = [
    saved,
    ...existing.filter(look => look.id !== saved.id),
  ];

  return {
    ...(controller || {}),
    defaultLook: saved.defaultLook,
    activeLookId: saved.id,
    looks,
    ...(Array.isArray(controller.playlist) ? { playlist: controller.playlist.map(entry => entry.lookId === id || entry.comboId === id ? { ...entry, label: saved.label } : entry) } : {}),
  };
}

function normalizeLinkedRecipe(value) {
  if (!value) return null;
  try { return normalizePatternLabRecipe(value); } catch { return null; }
}

// Look, playlist and encoder references change together in a single controller write.
export function deleteSavedLookFromController(controller = {}, lookId) {
  const looks = normalizeSavedLooks(controller.looks).filter(look => look.id !== lookId);
  const playlist = (controller.playlist || []).filter(entry => entry.lookId !== lookId && entry.comboId !== lookId);
  return {
    ...controller, looks, playlist,
    activeLookId: controller.activeLookId === lookId ? '' : controller.activeLookId,
    controls: { ...controller.controls, encoder: { ...controller.controls?.encoder, patternCycleIds: derivePlaylistLookIds(playlist) } },
  };
}

export function applySavedLookToPatchBoard({
  patchBoard = null,
  strips = [],
  savedLook = {},
} = {}) {
  const look = normalizeSavedLooks([{ id: 'applied-look', ...savedLook }])[0];
  if (!look) return normalizePatchBoard(patchBoard, strips);

  let board = applyLookToPatchBoard({
    patchBoard,
    strips,
    targetId: ALL_SECTIONS_TARGET_ID,
    look: look.defaultLook,
  });

  for (const [targetId, sectionLook] of Object.entries(look.sectionLooks || {})) {
    board = applyLookToPatchBoard({
      patchBoard: board,
      strips,
      targetId,
      look: sectionLook,
    });
  }

  return normalizePatchBoard(board, strips);
}

export function targetLabel(target) {
  return target?.kind === 'all' ? 'All sections' : String(target?.label || 'Section');
}

function lookFromPatchPlayback(playback = {}, fallbackLook = {}) {
  return normalizeSectionVisualLook({
    ...fallbackLook,
    ...(hasExplicit(playback.patternId) ? { patternId: playback.patternId } : {}),
    ...(hasExplicit(playback.brightness) ? { brightness: playback.brightness } : {}),
    ...(hasExplicit(playback.speed) ? { speed: playback.speed } : {}),
    ...(hasExplicit(playback.hueShift) ? { hueShift: playback.hueShift } : {}),
    ...(hasExplicit(playback.customHue) ? { customHue: playback.customHue } : {}),
    ...(hasExplicit(playback.customSaturation) ? { customSaturation: playback.customSaturation } : {}),
    ...(hasExplicit(playback.customBreathe) ? { customBreathe: playback.customBreathe } : {}),
    ...(hasExplicit(playback.breatheLowerPct) ? { breatheLowerPct: playback.breatheLowerPct } : {}),
    ...(hasExplicit(playback.breatheUpperPct) ? { breatheUpperPct: playback.breatheUpperPct } : {}),
    ...(hasExplicit(playback.breatheCycleSeconds) ? { breatheCycleSeconds: playback.breatheCycleSeconds } : {}),
    ...(hasExplicit(playback.customDrift) ? { customDrift: playback.customDrift } : {}),
  });
}

function lookToPlayback(look, previous = {}) {
  return {
    ...(previous || {}),
    patternId: look.patternId,
    brightness: look.brightness,
    speed: look.speed,
    hueShift: look.hueShift,
    customHue: look.customHue,
    customSaturation: look.customSaturation,
    customBreathe: look.customBreathe,
    breatheLowerPct: look.breatheLowerPct,
    breatheUpperPct: look.breatheUpperPct,
    breatheCycleSeconds: look.breatheCycleSeconds,
    customDrift: look.customDrift,
  };
}

function sectionLooksFromTargets(targets = []) {
  return Object.fromEntries(
    (targets || [])
      .filter(target => target?.kind === 'section' && target.id)
      .map(target => [target.id, normalizeSectionVisualLook(target.look)]),
  );
}

function normalizeSectionLooks(sectionLooks = {}) {
  if (!sectionLooks || typeof sectionLooks !== 'object') return {};
  return Object.fromEntries(
    Object.entries(sectionLooks)
      .map(([id, look]) => [sanitizeId(id), normalizeSectionVisualLook(look)])
      .filter(([id]) => Boolean(id)),
  );
}

function totalStripPixels(strips = []) {
  return strips.reduce((sum, strip) => sum + (strip.pixelCount || strip.pixels?.length || 0), 0);
}

function countPatchPixels(patch) {
  const start = Number(patch?.source?.startLed);
  const end = Number(patch?.source?.endLed);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.abs(Math.trunc(end) - Math.trunc(start)) + 1;
}

function hasExplicit(value) {
  return value !== undefined && value !== null && value !== '';
}

function sanitizeId(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleFromId(id = '') {
  return String(id || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// "Use on every section": one section's look becomes the draft for every
// section and for the piece's default, so a whole piece returns to one look
// in a tap instead of a tap per chip. Pure: returns a new draft map, the
// source draft map is untouched.
export function copyLookToAllSections(draftLooks = {}, look = {}, targets = []) {
  const shared = normalizeSectionVisualLook(look);
  const next = { ...(draftLooks || {}), [ALL_SECTIONS_TARGET_ID]: shared };
  for (const target of Array.isArray(targets) ? targets : []) {
    if (target?.kind === 'section' && target.id) next[target.id] = { ...shared };
  }
  return next;
}
