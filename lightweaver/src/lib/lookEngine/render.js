// The renderer: one frame of a look, from the look, the piece map and the
// colour journey, and nothing else. Pure: same inputs, same bytes.
//
//   renderLook(look, pieceMap, journeyColours, t) -> Uint8Array(3 * LEDs), R G B in strip order
//
// Per LED, in this order (modifiers.js documents each step):
//   x      = t / breath - begin           breaths since this area began
//   begin  = area.begins * spread + (petalByPetal ? copy / copies : 0)
//   clock  = speed(x) shifted by how the copies play (together / after / every other)
//            or, when the piece takes turns, only inside the area's turn
//   level  = motion -> smoothness -> fade -> breathe -> ground
//   colour = the journey at (t * 0.012 + the area's order * 0.22), times level

import { getMotion } from './motions.js';
import { applyBreathe, applyDirection, applyFade, applyGround, applySmoothness, applySpeed, frac } from './modifiers.js';
import { normalizeArea, normalizeLook } from './schema.js';
import { journeyAt } from './journeys.js';

export const TURN_HOLD = 0.34;

/** Each area's place in the order they begin, 0..1 (first to begin = 0). */
export function beginRanks(begins) {
  const order = begins.map((begin, index) => [begin, index]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ranks = [];
  order.forEach(([, index], k) => { ranks[index] = begins.length > 1 ? k / (begins.length - 1) : 0; });
  return ranks;
}

export function renderLook(rawLook, pieceMap, journeyColours, t = 0) {
  const look = normalizeLook(rawLook);
  const leds = pieceMap?.leds || [];
  const out = new Uint8Array(leds.length * 3);
  const count = pieceMap?.copyCounts?.length || 0;
  const ids = pieceMap?.areaIds || Object.keys(look.areas);
  const phase = t / look.breath;
  const spread = look.piece.spread;
  const turns = look.piece.takeTurns;
  const round = look.piece.petalByPetal;
  const records = Array.from({ length: count }, (_, i) => {
    const rec = look.areas[ids[i]] || normalizeArea({});
    return { rec, motion: getMotion(rec.motion.type), params: rec.motion.params, copies: Math.max(1, pieceMap.copyCounts[i]) };
  });
  const ranks = beginRanks(records.map(r => r.rec.begins));
  const colours = records.map((_, i) => journeyAt(journeyColours, t * 0.012 + ranks[i] * 0.22));
  for (let index = 0; index < leds.length; index += 1) {
    const led = leds[index];
    const area = records[led.area];
    if (!area) continue;
    const { rec, motion, params, copies } = area;
    const begin = rec.begins * spread + (round ? led.copy / copies : 0);
    const x = phase - begin;
    const shift = rec.copies === 'after' ? led.copy / copies : rec.copies === 'other' ? (led.copy % 2) * 0.5 : 0;
    let clock;
    let envelope = 1;
    if (turns) {
      const u = frac(x);
      if (u < TURN_HOLD) { clock = frac(applySpeed(u / TURN_HOLD, rec.speed) - shift); envelope = Math.sin(Math.PI * u / TURN_HOLD) ** 0.6; }
      else { clock = 0; envelope = 0; }
    } else clock = frac(applySpeed(x, rec.speed) - shift);
    const directed = applyDirection(clock, rec.direction);
    const where = { shape: led.shape, out: led.out, copy: led.copy, copies };
    let level = applySmoothness(position => motion.level(position, directed, params, where), led.shape, rec.smoothness);
    level *= envelope * applyFade(clock, rec.fade) * applyBreathe(x, rec.breathe);
    level = applyGround(level, look.ground);
    const rgb = colours[led.area];
    out[index * 3] = Math.round(rgb[0] * level);
    out[index * 3 + 1] = Math.round(rgb[1] * level);
    out[index * 3 + 2] = Math.round(rgb[2] * level);
  }
  return out;
}
