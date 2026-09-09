import { DEFAULT_CARD_PATTERN_BANK } from './cardRuntimeContract.js';

export const CARD_PLAYLIST_LIMIT = 32;

// The card firmware's timed-playlist entry cap — distinct from CARD_PLAYLIST_LIMIT
// above, which bounds the dial's pattern-cycle list. F2 (the firmware lane
// building this same contract) adds `maxPlaylistEntries` to
// packages/lightweaver-contract/card-hardware.json; until that key exists on
// this base, 16 is hardcoded here and must be kept in step with it by hand.
export const CARD_PLAYLIST_ENTRY_LIMIT = 16;

export const DEFAULT_PLAYLIST_DWELL_SECONDS = 30;
export const MIN_PLAYLIST_DWELL_SECONDS = 1;
export const MAX_PLAYLIST_DWELL_SECONDS = 3600;

export const DEFAULT_PLAYLIST_FADE_MS = 1500;
export const MIN_PLAYLIST_FADE_MS = 0;
export const MAX_PLAYLIST_FADE_MS = 10000;

const PATTERN_BY_ID = new Map(DEFAULT_CARD_PATTERN_BANK.map(pattern => [pattern.id, pattern]));

function clampDwellSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PLAYLIST_DWELL_SECONDS;
  return Math.max(MIN_PLAYLIST_DWELL_SECONDS, Math.min(MAX_PLAYLIST_DWELL_SECONDS, Math.round(n)));
}

function clampFadeMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PLAYLIST_FADE_MS;
  return Math.max(MIN_PLAYLIST_FADE_MS, Math.min(MAX_PLAYLIST_FADE_MS, Math.round(n)));
}

// The playlist-wide "played on the card" settings (fadeMs, enabled) live
// beside the per-entry array, not inside it — a bare array has nowhere to
// carry them that survives JSON round-tripping. They are stored at
// `standaloneController.controls.playlist` (see lw-playlist.jsx): `controls`
// is spread through untouched by defaultStandaloneController's overrides
// merge (projectModel.js), so an extra key there — unlike a bare top-level
// `standaloneController` field — round-trips through save/load without
// projectModel.js needing to know its shape.
export function normalizePlaylistTiming(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: source.enabled === true,
    fadeMs: clampFadeMs(source.fadeMs),
  };
}

export function normalizeCardPlaylist(playlist = [], {
  savedLooks = [],
  fallbackPatternIds = [],
  allowEmpty = false,
} = {}) {
  const savedLookById = new Map((Array.isArray(savedLooks) ? savedLooks : [])
    .filter(Boolean)
    .map(look => [sanitizeId(look.id), look]));
  const input = Array.isArray(playlist) ? playlist : [];
  const normalized = [];
  const usedIds = new Set();

  const pushPattern = (item = {}, index = normalized.length) => {
    const patternId = sanitizeId(item.patternId || item.pattern || item.preset || item.id);
    const pattern = PATTERN_BY_ID.get(patternId);
    if (!pattern) return;
    const requestedId = sanitizeId(item.id || patternId);
    normalized.push({
      id: uniqueId(requestedId || patternId, usedIds),
      type: 'pattern',
      patternId,
      label: String(item.label || pattern.label || titleFromId(patternId)),
      enabled: item.enabled !== false,
      dwellSeconds: clampDwellSeconds(item.dwellSeconds),
      createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : index,
    });
  };

  const pushCombo = (item = {}, index = normalized.length) => {
    const lookId = sanitizeId(item.lookId || item.comboId || item.id);
    const savedLook = savedLookById.get(lookId);
    if (!savedLook) return;
    const requestedId = sanitizeId(item.id || `combo-${lookId}`);
    const baseId = requestedId === lookId ? `combo-${lookId}` : requestedId;
    normalized.push({
      id: uniqueId(baseId, usedIds),
      type: 'combo',
      lookId,
      label: String(item.label || savedLook.label || titleFromId(lookId)),
      enabled: item.enabled !== false,
      dwellSeconds: clampDwellSeconds(item.dwellSeconds),
      createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : index,
    });
  };

  input.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    if (item.type === 'combo' || item.lookId || item.comboId) {
      pushCombo(item, index);
      return;
    }
    pushPattern(item, index);
  });

  if (!normalized.length) {
    const fallbackIds = uniqueStrings(fallbackPatternIds).length
      ? uniqueStrings(fallbackPatternIds)
      : allowEmpty ? [] : DEFAULT_CARD_PATTERN_BANK.map(pattern => pattern.id);
    fallbackIds.forEach((patternId, index) => pushPattern({ patternId }, index));
  }

  return normalized.slice(0, CARD_PLAYLIST_LIMIT);
}

export function playlistFromPatternCycleIds(patternCycleIds = [], {
  startupPatternId = '',
} = {}) {
  return normalizeCardPlaylist([], {
    fallbackPatternIds: [
      startupPatternId,
      ...(Array.isArray(patternCycleIds) ? patternCycleIds : []),
    ].filter(Boolean),
  });
}

export function isDefaultPatternCycle(ids = []) {
  const normalized = uniqueStrings(ids);
  const defaults = DEFAULT_CARD_PATTERN_BANK.map(pattern => pattern.id);
  return normalized.length === defaults.length && normalized.every((id, index) => id === defaults[index]);
}

export function isImplicitDefaultPatternPlaylist(playlist = []) {
  const input = Array.isArray(playlist) ? playlist : [];
  const defaults = DEFAULT_CARD_PATTERN_BANK.map(pattern => pattern.id);
  if (input.length !== defaults.length) return false;
  return input.every((item, index) => {
    const patternId = sanitizeId(item?.patternId || item?.pattern || item?.preset || item?.id);
    const createdAt = Number(item?.createdAt);
    const defaultCreatedAt = !Number.isFinite(createdAt) || createdAt === index;
    return patternId === defaults[index] &&
      (!item?.type || item.type === 'pattern') &&
      item?.enabled !== false &&
      defaultCreatedAt;
  });
}

export function deriveLegacyPatternCycleIds(playlist = []) {
  return uniqueStrings((Array.isArray(playlist) ? playlist : [])
    .filter(item => item?.type === 'pattern' && item.enabled !== false)
    .map(item => item.patternId));
}

export function derivePlaylistLookIds(playlist = []) {
  return uniqueStrings((Array.isArray(playlist) ? playlist : [])
    .filter(item => item?.enabled !== false)
    .map(item => item.id));
}

// The card-facing timed-playlist contract block:
//   { enabled, fadeMs, entries: [{ patternId, dwellSeconds }] }
// `entries[].patternId` is derived the same way derivePlaylistLookIds already
// derives the dial's patternCycleIds — each entry's own `id`, which is the
// installed look id a combo entry produces or the built-in pattern id a
// pattern entry names. Only enabled entries reach the card, in playlist
// order, capped at CARD_PLAYLIST_ENTRY_LIMIT (the dial's own 32-entry
// CARD_PLAYLIST_LIMIT is unrelated and untouched by this cap).
export function buildCardPlaylistConfig(playlist = [], savedLooks = [], timing = {}) {
  const { enabled, fadeMs } = normalizePlaylistTiming(timing);
  const normalized = normalizeCardPlaylist(playlist, { savedLooks, allowEmpty: true });
  const entries = normalized
    .filter(item => item.enabled !== false)
    .slice(0, CARD_PLAYLIST_ENTRY_LIMIT)
    .map(item => ({
      patternId: item.id,
      dwellSeconds: clampDwellSeconds(item.dwellSeconds),
    }));
  return { enabled, fadeMs, entries };
}

export function playlistContainsPattern(playlist = [], patternId = '') {
  const id = sanitizeId(patternId);
  return (Array.isArray(playlist) ? playlist : [])
    .some(item => item?.type === 'pattern' && item.patternId === id);
}

export function playlistContainsCombo(playlist = [], lookId = '') {
  const id = sanitizeId(lookId);
  return (Array.isArray(playlist) ? playlist : [])
    .some(item => item?.type === 'combo' && item.lookId === id);
}

export function playlistLabels(playlist = [], limit = 3) {
  return (Array.isArray(playlist) ? playlist : [])
    .filter(item => item?.enabled !== false)
    .slice(0, limit)
    .map(item => item.label || item.patternId || item.lookId || item.id);
}

export function makePatternPlaylistItem(patternId = '') {
  const id = sanitizeId(patternId);
  const pattern = PATTERN_BY_ID.get(id);
  if (!pattern) return null;
  return {
    id,
    type: 'pattern',
    patternId: id,
    label: pattern.label || titleFromId(id),
    enabled: true,
    dwellSeconds: DEFAULT_PLAYLIST_DWELL_SECONDS,
    createdAt: Date.now(),
  };
}

export function makeComboPlaylistItem(savedLook = {}) {
  const lookId = sanitizeId(savedLook.id);
  if (!lookId) return null;
  return {
    id: `combo-${lookId}`,
    type: 'combo',
    lookId,
    label: savedLook.label || titleFromId(lookId),
    enabled: true,
    dwellSeconds: DEFAULT_PLAYLIST_DWELL_SECONDS,
    createdAt: Date.now(),
  };
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const id = sanitizeId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function uniqueId(base = 'playlist-item', usedIds) {
  const cleanBase = sanitizeId(base) || 'playlist-item';
  let candidate = cleanBase;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${cleanBase}-${suffix++}`;
  }
  usedIds.add(candidate);
  return candidate;
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
