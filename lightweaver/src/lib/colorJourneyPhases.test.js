import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS,
  colorJourneyRenderedChannelDelta,
  encodeBoundedColorJourneyPhases,
  encodeColorJourneyPhases,
  expandColorJourneyPhases,
} from './colorJourneyPhases.js';
const fixture = JSON.parse(readFileSync(new URL('../../../docs/fixtures/color-journey-v2-phases.json', import.meta.url)));
for (const candidate of fixture.cases) test(`shared integer phase oracle: ${candidate.name}`, () => {
  const actual = expandColorJourneyPhases({ version: 2, phases: candidate.phases });
  const bounded = expandColorJourneyPhases({
    version: 3,
    maxPhaseErrorTicks: COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS,
    phases: candidate.phases,
  });
  assert.equal(actual.length, candidate.pixelCount);
  assert.deepEqual(bounded, actual);
  candidate.samples.forEach(({ pixel, phase16 }) => assert.equal(actual[pixel], phase16));
});
test('encoder preserves every exact Q16 value of wrapped and reversed lines', () => {
  for (const count of [257, 1024, 4096, 65535]) {
    const values = Array.from({ length: count }, (_, i) => Math.round(i * 65536 / (count - 1)) & 65535);
    assert.deepEqual(expandColorJourneyPhases(encodeColorJourneyPhases(values)), values);
    values.reverse();
    assert.deepEqual(expandColorJourneyPhases(encodeColorJourneyPhases(values)), values);
  }
});
test('curved and irregular geometry is exact or explicitly rejected without approximation', () => {
  for (const fn of [i => Math.sin(i / 50) * 30000 + 32000, i => (i * i * 7919) % 65536]) {
    const values = Array.from({ length: 1024 }, (_, i) => Math.round(fn(i)) & 65535);
    try { assert.deepEqual(expandColorJourneyPhases(encodeColorJourneyPhases(values)), values); }
    catch (error) { assert.match(error.message, /geometry is too complex.*64 phase spans/); }
  }
});
test('decoder rejects malformed, mixed, oversized and unknown encodings', () => {
  for (const phases of [[], [[0, 0, 0]], [[1, 0, 1]], [[2, 65536, 0]], [[2, 0, 32769]], [[65536, 0, 0]], Array.from({ length: 65 }, () => [1, 0, 0]), [[2, 0, 0.5]]]) {
    assert.throws(() => expandColorJourneyPhases({ version: 2, phases }), RangeError);
  }
  assert.throws(() => expandColorJourneyPhases({ version: 3, phases: [[1, 0, 0]] }), RangeError);
  assert.throws(() => expandColorJourneyPhases({ version: 2, phase16: '0000', phases: [[1, 0, 0]] }), RangeError);
});

test('seeded geometries roundtrip exactly or fail with explicit complexity evidence', () => {
  let seed = 412;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let sample = 0; sample < 40; sample += 1) {
    const count = 257 + random() % 1500;
    const values = Array.from({ length: count }, () => random() & 65535);
    let encoded;
    try { encoded = encodeColorJourneyPhases(values); }
    catch (error) { assert.match(error.message, /geometry is too complex.*64 phase spans/); continue; }
    assert.deepEqual(expandColorJourneyPhases(encoded), values);
  }
});

test('the bounded renderer contract derives 194 ticks and rejects 195', () => {
  let largest = 0;
  while (colorJourneyRenderedChannelDelta(largest + 1) <= 1) largest += 1;
  assert.equal(largest, 194);
  assert.equal(COLOR_JOURNEY_MAX_PHASE_ERROR_TICKS, 194);
  assert.ok(colorJourneyRenderedChannelDelta(194) < 1);
  assert.ok(colorJourneyRenderedChannelDelta(195) > 1);
});

test('bounded affine spans fit representative curved and mixed 4096-pixel geometry', () => {
  const curves = [
    t => ({ x: 20 + 600 * t * t - 400 * t * t * t, y: 180 - 480 * t + 480 * t * t }),
    t => t < 0.55
      ? ({ x: 10 + 200 * t + 120 * t * t, y: 170 - 500 * t + 430 * t * t })
      : ({ x: 180 + 150 * (t - 0.55) - 260 * (t - 0.55) ** 2, y: 170 - 330 * (t - 0.55) }),
  ];
  for (const pointAt of curves) {
    const points = Array.from({ length: 4096 }, (_, index) => pointAt(index / 4095));
    const minX = Math.min(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const range = Math.max(
      Math.max(...points.map(point => point.x)) - minX,
      Math.max(...points.map(point => point.y)) - minY,
    );
    const values = points.map(point => Math.round(((((point.x - minX) / range
      + 0.35 * (point.y - minY) / range) % 1) + 1) % 1 * 65536) & 0xffff);
    const encoded = encodeBoundedColorJourneyPhases(values);
    assert.equal(encoded.version, 3);
    assert.equal(encoded.maxPhaseErrorTicks, 194);
    assert.ok(encoded.phases.length <= 64);
    const expanded = expandColorJourneyPhases(encoded);
    expanded.forEach((phase, index) => {
      const delta = ((phase - values[index] + 32768) & 0xffff) - 32768;
      assert.ok(Math.abs(delta) <= 194);
    });
  }
});

test('v3 validation prevents silent tolerance changes and repeated drift', () => {
  const values = Array.from({ length: 4096 }, (_, index) => (
    Math.round((Math.sin(index / 700) * 0.2 + index / 4095) * 65536) & 0xffff
  ));
  const encoded = encodeBoundedColorJourneyPhases(values);
  const once = expandColorJourneyPhases(encoded);
  assert.deepEqual(expandColorJourneyPhases(encodeBoundedColorJourneyPhases(once)), once);
  assert.throws(() => expandColorJourneyPhases({ ...encoded, maxPhaseErrorTicks: 195 }), RangeError);
  assert.throws(() => expandColorJourneyPhases({ version: 3, phases: encoded.phases }), RangeError);
});
