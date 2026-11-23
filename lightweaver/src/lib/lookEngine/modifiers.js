// MODIFIERS. Every area goes through the same steps, always in this order:
//
//   1. speed       scales the area's clock by a whole ratio (1/2, 1, 2), so it
//                  stays in step with the shared breath
//   2. direction   forward, backward, or back and forth along the loop
//   3. motion      (motions.js) turns clock + position into a brightness 0..1
//   4. smoothness  softens the motion's edges: 0 is crisp, 1 is very soft
//   5. fade        how gently the area arrives and leaves inside its turn
//   6. breathe     a slow rise and fall under everything (see below)
//   7. ground      the lowest brightness: the glow left when the motion is off
//
// Each one is a small pure function. render.js is the only caller, in this order.
//
// BREATHE keeps the meaning of the section look's breathe (sectionLookModel.js:
// brightness swells between a lower and an upper share of its full level).
// Here the upper share is always full, the lower is (1 - amount), and one
// rise and fall takes one shared breath, so it never drifts against the rest.

export const SPEEDS = Object.freeze([0.5, 1, 2]);
export const DIRECTIONS = Object.freeze(['forward', 'backward', 'bounce']);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const frac = value => value - Math.floor(value);
const smoothstep = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** 1. Cycles done after `cycles` breaths: speed 2 makes two loops per breath. Not wrapped, so the seam stays continuous. */
export function applySpeed(cycles, speed) {
  return cycles * (SPEEDS.includes(speed) ? speed : 1);
}

/** 2. A clock in 0..1 read forward, backward, or there and back (bounce returns to its start at the seam). */
export function applyDirection(clock, direction) {
  const c = frac(clock);
  if (direction === 'backward') return frac(1 - c);
  if (direction === 'bounce') return c < 0.5 ? c * 2 : 2 - c * 2;
  return c;
}

const TAPS = Object.freeze([[-2, 1], [-1, 2], [0, 3], [1, 2], [2, 1]]);

/** 4. `sample(position)` is the motion at this clock. Smoothness averages it over a small stretch of the shape. */
export function applySmoothness(sample, position, smoothness) {
  const s = clamp(Number(smoothness) || 0, 0, 1);
  if (s === 0) return sample(position);
  let total = 0;
  let weight = 0;
  for (const [step, w] of TAPS) {
    total += w * sample(clamp(position + step * s * 0.12, 0, 1));
    weight += w;
  }
  return total / weight;
}

/** 5. 0..1 gain for an area's clock: 1 in the middle of its turn, easing to 0 at both ends over `fade` of the turn. */
export function applyFade(clock, fade) {
  const f = clamp(Number(fade) || 0, 0, 1);
  if (f === 0) return 1;
  const c = frac(clock);
  return smoothstep(Math.min(c, 1 - c) / (f * 0.5));
}

/** 6. 0..1 gain: between (1 - amount) and 1, one rise and fall per breath. `cycles` is breaths done, area's begin already taken off. */
export function applyBreathe(cycles, amount) {
  const a = clamp(Number(amount) || 0, 0, 1);
  if (a === 0) return 1;
  return 1 - a * (0.5 - 0.5 * Math.cos(frac(cycles) * 2 * Math.PI));
}

/** 7. The lowest brightness: ground + (1 - ground) * level. */
export function applyGround(level, ground) {
  const g = clamp(Number(ground) || 0, 0, 1);
  return g + (1 - g) * clamp(level, 0, 1);
}
