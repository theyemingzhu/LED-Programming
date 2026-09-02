// The shape of a long evolution, sampled for drawing.
//
// Evolve is the one step in Pattern Lab with no picture. Duration, character
// and change are three numbers, and the only way to find out what they do to
// the piece has been to scrub and watch. So this samples the SAME function the
// preview and the bake read from — sampleEvolution — across the whole journey
// and hands back plottable lanes.
//
// Nothing here models the journey itself. If it disagreed with sampleEvolution
// the drawing would be a lie about what the piece will do, so there is no
// second copy of the maths: this file only decides where to sample and how to
// name what comes back.

import { sampleEvolution } from './patternLabEvolution.js';

// Enough points that a fifteen-minute arc reads as a curve rather than a
// polygon, few enough that re-sampling on every duration change stays under a
// frame. The lanes are drawn a few hundred pixels wide at most.
export const JOURNEY_SAMPLE_COUNT = 160;

// The three destinations worth a lane. sampleEvolution also returns `shape`
// and `texture`, which move so little on most characters that a lane for each
// reads as noise beside the three that carry the journey.
const LANES = [
  ['brightness', 'Brightness'],
  ['color', 'Colour'],
  ['movement', 'Movement'],
];

function laneRange(values) {
  let low = Infinity;
  let high = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  if (low === Infinity) return { low: 0, high: 1 };
  // A lane that never moves would divide by zero and draw at the top of its
  // track; pad it so it draws flat through the middle, which is the truth.
  if (high - low < 1e-6) return { low: low - 0.5, high: high + 0.5 };
  return { low, high };
}

/**
 * Sample a recipe's evolution across its whole duration.
 *
 * Returns `{ durationSeconds, enabled, character, lanes }`, each lane carrying
 * `points` as `{ t, value, y }` where `t` is 0..1 across the journey and `y` is
 * 0..1 with 0 at the BOTTOM of the lane — callers flip it for SVG.
 *
 * `y` is normalised per lane rather than across all three, because the lanes
 * have different natural ranges and a shared scale would flatten two of them to
 * argue for the third.
 */
export function sampleJourneyLanes(recipe, { samples = JOURNEY_SAMPLE_COUNT } = {}) {
  const count = Math.max(2, Math.floor(samples));
  const probe = sampleEvolution(recipe, 0);
  const durationSeconds = probe.durationSeconds;

  if (!probe.enabled) {
    return {
      durationSeconds,
      enabled: false,
      character: probe.character,
      lanes: LANES.map(([key, label]) => ({ key, label, points: [] })),
    };
  }

  const raw = LANES.map(() => []);
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const frame = sampleEvolution(recipe, t * durationSeconds);
    LANES.forEach(([key], laneIndex) => {
      raw[laneIndex].push(Number(frame.destinations?.[key]));
    });
  }

  const lanes = LANES.map(([key, label], laneIndex) => {
    const values = raw[laneIndex];
    const { low, high } = laneRange(values);
    const span = high - low;
    return {
      key,
      label,
      points: values.map((value, index) => {
        const t = index / (count - 1);
        const safe = Number.isFinite(value) ? value : low;
        return { t, value: safe, y: (safe - low) / span };
      }),
    };
  });

  return { durationSeconds, enabled: true, character: probe.character, lanes };
}

/**
 * The minute marks to rule a journey with.
 *
 * Every whole minute for a five-to-fifteen-minute journey is between five and
 * fifteen ticks, which is readable at any width the strip is given, so there is
 * no thinning rule to get wrong.
 */
export function journeyMinuteTicks(durationSeconds) {
  const duration = Math.max(1, Number(durationSeconds) || 0);
  const ticks = [];
  for (let seconds = 0; seconds <= duration; seconds += 60) {
    ticks.push({ seconds, t: seconds / duration, minutes: Math.round(seconds / 60) });
  }
  // A duration that is not a whole number of minutes would otherwise have no
  // mark at its end, which reads as a journey that stops early.
  const last = ticks[ticks.length - 1];
  if (!last || last.seconds < duration - 1) {
    ticks.push({ seconds: duration, t: 1, minutes: Math.round(duration / 60) });
  }
  return ticks;
}

export function formatJourneyTime(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
