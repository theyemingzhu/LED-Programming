import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allocateLedCountsByLength,
  derivePxPerMmFromCounts,
} from './layoutLedCounts.js';

const strips = [
  { id: 'inner', svgLength: 100, pixelCount: 1 },
  { id: 'middle', svgLength: 200, pixelCount: 1 },
  { id: 'outer', svgLength: 300, pixelCount: 1 },
];

test('allocates an exact total proportionally with deterministic integer remainders', () => {
  assert.deepEqual(allocateLedCountsByLength(strips, 61), {
    ok: true,
    counts: [10, 20, 31],
  });
});

test('rejects totals that cannot give every active strip at least one LED', () => {
  assert.deepEqual(allocateLedCountsByLength(strips, 2), {
    ok: false,
    error: 'Enter at least 3 LEDs so every strip has one.',
  });
});

test('rejects totals beyond the per-strip addressable limit', () => {
  assert.deepEqual(allocateLedCountsByLength(strips, 9001), {
    ok: false,
    error: 'Enter no more than 9,000 LEDs for 3 strips.',
  });
});

test('derives one global scale from exact counts and mixed reel densities', () => {
  const counted = strips.map((strip, index) => ({ ...strip, pixelCount: [10, 20, 36][index] }));
  const pxPerMm = derivePxPerMmFromCounts(counted, {
    defaultDensity: 60,
    stripDensities: { inner: 30, outer: 120 },
  });

  const expected = 600 / (1000 * ((10 / 30) + (20 / 60) + (36 / 120)));
  assert.ok(Math.abs(pxPerMm - expected) < 1e-12);
});

test('does not claim a scale for missing geometry or invalid density', () => {
  assert.equal(derivePxPerMmFromCounts([{ id: 'x', svgLength: 0, pixelCount: 20 }], { defaultDensity: 60 }), null);
  assert.equal(derivePxPerMmFromCounts(strips, { defaultDensity: 0 }), null);
});
