import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeColorJourneyPhases, expandColorJourneyPhases } from './colorJourneyPhases.js';
const fixture = JSON.parse(readFileSync(new URL('../../../docs/fixtures/color-journey-v2-phases.json', import.meta.url)));
for (const candidate of fixture.cases) test(`shared integer phase oracle: ${candidate.name}`, () => {
  const actual = expandColorJourneyPhases({ version: 2, phases: candidate.phases });
  assert.equal(actual.length, candidate.pixelCount);
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
