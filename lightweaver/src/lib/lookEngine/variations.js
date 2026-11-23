// Starting points, and the two ways of finding more: nudge one, or roll a new
// one. The random source is ALWAYS passed in (`rng() -> 0..1`); nothing here
// reads Math.random, so a seed gives the same looks every time.
//
// A "piece" here is the areas list from areas.js (or any list of
// { id, copies } where copies is a number or a list), centre first.

import { motionIds } from './motions.js';
import { journeyIds } from './journeys.js';
import { COPIES_RELATIONS, normalizeLook } from './schema.js';

/** A small seeded random source (mulberry32): same seed, same sequence. */
export function seededRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
const copiesOf = area => (Array.isArray(area.copies) ? area.copies.length : Number(area.copies) || 1);
const areasOf = piece => (Array.isArray(piece) ? piece : piece?.areas || []);

// How the areas begin, as a share of a breath, for each order. Cycled when a
// piece has more areas than the pattern.
const ORDERS = Object.freeze({
  bloom: { begins: n => (i => (n > 1 ? (i / (n - 1)) * 0.56 : 0)) },
  tide: { begins: n => (i => (n > 1 ? ((n - 1 - i) / (n - 1)) * 0.56 : 0)) },
  one: { begins: () => () => 0 },
  call: { begins: () => (i => [0, 0.22, 0, 0.44, 0.66][i % 5]), takeTurns: true },
  pairs: { begins: () => (i => [0, 0.3, 0, 0.3, 0.6][i % 5]) },
});
const ORDER_IDS = Object.keys(ORDERS);
const MOTIONS_CYCLE = ['pulse', 'fill', 'chase', 'pulse', 'chase'];

function buildLook(piece, order, extra = {}, motions = null, patterns = [], offset = 0) {
  const areas = areasOf(piece);
  const spec = ORDERS[order];
  const begin = spec.begins(areas.length);
  const record = {};
  areas.forEach((area, i) => {
    record[area.id] = {
      motion: { type: motions?.[i] || MOTIONS_CYCLE[i % MOTIONS_CYCLE.length], params: {} },
      copies: i % 5 === 3 && copiesOf(area) > 1 ? 'other' : 'together',
      begins: begin(i),
      ...(patterns.length ? { source: { kind: 'pattern', id: patterns[(i + offset) % patterns.length] } } : {}),
    };
  });
  return normalizeLook({
    breath: 7, ground: 0.08, journey: 'dawn', ...extra,
    piece: { takeTurns: spec.takeTurns === true, petalByPetal: false, spread: 1, ...(extra.piece || {}) },
    areas: record,
  });
}

/** Six finished looks for this piece, named, the way the sketch's first six were. */
export function startingLooks(piece, { patterns = [] } = {}) {
  return [
    { id: 'bloom', label: 'Bloom', look: buildLook(piece, 'bloom', {}, null, patterns, 0) },
    { id: 'tide', label: 'Tide', look: buildLook(piece, 'tide', { journey: 'tide' }, null, patterns, 1) },
    { id: 'call', label: 'Call and answer', look: buildLook(piece, 'call', { journey: 'flame' }, null, patterns, 2) },
    { id: 'one', label: 'One breath', look: buildLook(piece, 'one', { journey: 'candle', breath: 9 }, null, patterns, 3) },
    { id: 'turning', label: 'Turning', look: buildLook(piece, 'bloom', { journey: 'moss', piece: { petalByPetal: true } }, null, patterns, 4) },
    { id: 'pairs', label: 'Pairs', look: buildLook(piece, 'pairs', { journey: 'dawn' }, ['pulse', 'chase', 'fill', 'chase', 'pulse'], patterns, 5) },
  ];
}

/** A close cousin: two small changes to a copy of `look`. */
export function nudgeLook(look, rng, { patterns = [] } = {}) {
  const next = normalizeLook(JSON.parse(JSON.stringify(look)));
  const ids = Object.keys(next.areas);
  const motions = motionIds();
  for (let n = 0; n < 2 && ids.length; n += 1) {
    const id = pick(rng, ids);
    const area = next.areas[id];
    pick(rng, [
      () => { const others = motions.filter(m => m !== area.motion.type); area.motion = { type: others.length ? pick(rng, others) : area.motion.type, params: {} }; },
      () => { area.copies = pick(rng, COPIES_RELATIONS.filter(r => r !== area.copies)); },
      () => { const j = journeyIds(); next.journey = pick(rng, j.filter(x => x !== next.journey)); },
      () => { if (patterns.length) area.source = { kind: 'pattern', id: pick(rng, patterns) }; else next.piece.petalByPetal = !next.piece.petalByPetal; },
      () => { next.piece.petalByPetal = !next.piece.petalByPetal; },
      () => { next.piece.takeTurns = !next.piece.takeTurns; },
      () => { next.breath = Math.max(3, Math.min(13, next.breath + (rng() < 0.5 ? -2 : 2))); },
    ])();
  }
  return normalizeLook(next);
}

/** A new look, built from scratch for this piece. */
export function randomLook(piece, rng, { patterns = [] } = {}) {
  const areas = areasOf(piece);
  const motions = motionIds();
  const look = buildLook(piece, pick(rng, ORDER_IDS), {
    journey: pick(rng, journeyIds()),
    breath: 4 + rng() * 8,
    piece: { petalByPetal: rng() < 0.3 },
  });
  areas.forEach(area => {
    const record = look.areas[area.id];
    record.motion = { type: pick(rng, motions), params: {} };
    record.copies = copiesOf(area) === 1 ? 'together' : pick(rng, COPIES_RELATIONS);
    if (patterns.length) record.source = { kind: 'pattern', id: pick(rng, patterns) };
  });
  return normalizeLook(look);
}
