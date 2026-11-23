import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFirstCheckColourFrame,
  buildFirstCheckEndsFrame,
  colourRowVerdict,
  firstCheckPixelTotal,
} from './firstInstallCheck.js';
import { DISCOVERY_END_MARKER_COLOR, DISCOVERY_OFF_COLOR, DISCOVERY_PROBE_COLOR } from './stripDiscovery.js';

// Two pins: GPIO 18 drives two daisy-chained sections (4 + 3), GPIO 21 one strip of 5.
const OUTPUTS = [
  { pin: 18, start: 0, count: 7, segments: [{ count: 4 }, { count: 3 }] },
  { pin: 21, start: 7, count: 5, segments: [{ count: 5 }] },
];

test('the frame covers every output in the card pixel order', () => {
  assert.equal(firstCheckPixelTotal(OUTPUTS), 12);
  assert.equal(buildFirstCheckEndsFrame(OUTPUTS).length, 12);
});

test('the colour frame lights lights 1, 2, 3 of the first strip only', () => {
  const frame = buildFirstCheckColourFrame(OUTPUTS);
  assert.deepEqual(frame.slice(0, 3), ['3C0000', '003C00', '00003C']);
  assert.ok(frame.slice(3).every(color => color === DISCOVERY_OFF_COLOR));
});

test('the ends frame makes the last light of every output purple, on every pin at once', () => {
  const frame = buildFirstCheckEndsFrame(OUTPUTS);
  assert.equal(frame[6], DISCOVERY_END_MARKER_COLOR, 'GPIO 18 ends at light 7');
  assert.equal(frame[11], DISCOVERY_END_MARKER_COLOR, 'GPIO 21 ends at light 5 of its own');
  assert.equal(frame.filter(color => color === DISCOVERY_END_MARKER_COLOR).length, 2, 'one purple per pin, not per section');
  assert.equal(frame[3], DISCOVERY_PROBE_COLOR, 'the join between two sections on one pin stays dim');
});

test('a red-green-blue row confirms the saved colour order; any other row names the order that is right', () => {
  assert.deepEqual(colourRowVerdict(['red', 'green', 'blue'], 'GRB'), { ok: true, valid: true, map: { red: 0, green: 1, blue: 2 }, colorOrder: 'GRB' });
  const swapped = colourRowVerdict(['green', 'red', 'blue'], 'GRB');
  assert.equal(swapped.ok, false);
  assert.equal(swapped.colorOrder, 'RGB');
  assert.equal(colourRowVerdict(['red', 'red', 'blue']).valid, false);
});

test('outputs with no lights are left out rather than drawn at zero', () => {
  assert.equal(firstCheckPixelTotal([{ start: 0, count: 0 }]), 0);
  assert.deepEqual(buildFirstCheckEndsFrame([]), []);
});
