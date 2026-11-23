// Small edits the screen makes to a look. All pure: each returns a new look.
// They live here, not in the components, so they are tested and a later screen
// (or the card) can make the same edits.

import { motionIds } from './motions.js';
import { MAX_BEGIN, MAX_SPREAD, normalizeLook } from './schema.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** The three Bend sliders as 0..100. */
export function readBend(look) {
  return {
    pace: Math.round((13 - look.breath) / 10 * 100),
    spread: Math.round(look.piece.spread / MAX_SPREAD * 100),
    glow: Math.round(look.ground / 0.32 * 100),
  };
}

/** Calm to Lively shortens the breath; As one to Rippling widens the gaps between areas; Dark to Glowing raises the ground. */
export function applyBend(look, key, value) {
  const v = clamp(Number(value) || 0, 0, 100) / 100;
  if (key === 'pace') return normalizeLook({ ...look, breath: 13 - v * 10 });
  if (key === 'spread') return normalizeLook({ ...look, piece: { ...look.piece, spread: v * MAX_SPREAD } });
  if (key === 'glow') return normalizeLook({ ...look, ground: v * 0.32 });
  return look;
}

export function setArea(look, areaId, patch) {
  const current = look.areas[areaId] || {};
  return normalizeLook({ ...look, areas: { ...look.areas, [areaId]: { ...current, ...patch } } });
}

/** A tap: this area plays the next motion in the registry. */
export function stepMotion(look, areaId) {
  const ids = motionIds();
  const current = look.areas[areaId]?.motion?.type;
  const next = ids[(Math.max(0, ids.indexOf(current)) + 1) % ids.length];
  return setArea(look, areaId, { motion: { type: next, params: {} } });
}

/** A drag across areas: they begin in the order given, the rest after them. */
export function setOrder(look, orderedAreaIds, allAreaIds = Object.keys(look.areas)) {
  const spread = look.piece.spread < 0.4 ? 1 : look.piece.spread;
  const areas = { ...look.areas };
  allAreaIds.forEach(id => {
    const place = orderedAreaIds.includes(id) ? orderedAreaIds.indexOf(id) : orderedAreaIds.length;
    areas[id] = { ...(areas[id] || {}), begins: clamp(place * 0.16, 0, MAX_BEGIN) };
  });
  return normalizeLook({ ...look, areas, piece: { ...look.piece, spread, takeTurns: false } });
}

export function setPiece(look, patch) {
  return normalizeLook({ ...look, piece: { ...look.piece, ...patch } });
}
