// The look record: what is saved, what is edited, what a newer Studio may add to.
//
//   { version: 1, breath (seconds), ground (0..1), journey (palette id | colours),
//     piece: { takeTurns, petalByPetal, spread },
//     areas: { [areaId]: { motion: { type, params }, copies: 'together'|'after'|'other',
//                          begins (0..0.9 of a breath), direction, speed, smoothness,
//                          fade, breathe } } }
//
// Unknown keys are kept as they are, at every level. An unknown motion type
// falls back to the default motion and says so in `warnings`; the type is kept
// in `wantedType`, so opening and re-saving does not lose it.
//
// `spread` (0..1.6) is the "As one / Rippling" slider: it scales every area's
// `begins`. 1 plays each area at its own begin, 0 plays them all as one.

import { DEFAULT_MOTION_ID, getMotion, hasMotion, motionParams } from './motions.js';
import { DIRECTIONS, SPEEDS } from './modifiers.js';

export const LOOK_VERSION = 1;
export const COPIES_RELATIONS = Object.freeze(['together', 'after', 'other']);
export const BREATH_RANGE = Object.freeze([3, 16]);
export const MAX_BEGIN = 0.9;
export const MAX_SPREAD = 1.6;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const num = (value, fallback) => (value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

export const DEFAULT_AREA = Object.freeze({
  motion: Object.freeze({ type: DEFAULT_MOTION_ID, params: Object.freeze({}) }),
  copies: 'together', begins: 0, direction: 'forward', speed: 1, smoothness: 0, fade: 0, breathe: 0,
});

export function normalizeArea(raw, warnings = [], where = 'area') {
  const input = isObject(raw) ? raw : {};
  const rawMotion = isObject(input.motion) ? input.motion : {};
  const wanted = typeof rawMotion.type === 'string' && rawMotion.type ? rawMotion.type : DEFAULT_MOTION_ID;
  const known = hasMotion(wanted);
  if (!known) warnings.push(`${where}: unknown motion "${wanted}", playing "${DEFAULT_MOTION_ID}" instead.`);
  const motion = getMotion(known ? wanted : DEFAULT_MOTION_ID);
  return {
    ...input,
    motion: {
      ...rawMotion,
      type: motion.id,
      params: motionParams(motion, known ? rawMotion.params : {}),
      ...(known ? {} : { wantedType: wanted }),
    },
    copies: COPIES_RELATIONS.includes(input.copies) ? input.copies : 'together',
    begins: clamp(num(input.begins, 0), 0, MAX_BEGIN),
    direction: DIRECTIONS.includes(input.direction) ? input.direction : 'forward',
    speed: SPEEDS.includes(Number(input.speed)) ? Number(input.speed) : 1,
    smoothness: clamp(num(input.smoothness, 0), 0, 1),
    fade: clamp(num(input.fade, 0), 0, 1),
    breathe: clamp(num(input.breathe, 0), 0, 1),
  };
}

/** `{ look, warnings }`. `areaIds` (optional) makes sure every area of the project has a record. */
export function normalizeLookWithWarnings(raw, { areaIds = [] } = {}) {
  const input = isObject(raw) ? raw : {};
  const warnings = [];
  const piece = isObject(input.piece) ? input.piece : {};
  const areasIn = isObject(input.areas) ? input.areas : {};
  const areas = {};
  for (const [id, value] of Object.entries(areasIn)) areas[id] = normalizeArea(value, warnings, id);
  for (const id of areaIds) if (!areas[id]) areas[id] = normalizeArea({}, warnings, id);
  const journey = Array.isArray(input.journey) || (typeof input.journey === 'string' && input.journey) ? input.journey : 'dawn';
  return {
    look: {
      ...input,
      version: LOOK_VERSION,
      breath: clamp(num(input.breath, 7), ...BREATH_RANGE),
      ground: clamp(num(input.ground, 0.08), 0, 1),
      journey,
      piece: {
        ...piece,
        takeTurns: piece.takeTurns === true,
        petalByPetal: piece.petalByPetal === true,
        spread: clamp(num(piece.spread, 1), 0, MAX_SPREAD),
      },
      areas,
    },
    warnings,
  };
}

export const normalizeLook = (raw, options) => normalizeLookWithWarnings(raw, options).look;
