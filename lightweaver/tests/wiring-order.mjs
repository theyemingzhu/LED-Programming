// Order and outputs in words (sections-effortless plan, change 3). The pure
// helpers behind "Move up" / "Move down" and the pin picker's grouping.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CARD_CONNECTOR_PINS,
  groupOutputPins,
  makeDefaultWiring,
  moveStripRunsInOutputOrder,
  normalizeWiring,
  stripMoveTarget,
  stripOrderByOutput,
} from '../src/lib/wiringModel.js';
import { CARD_HARDWARE_CONTRACT } from '../src/lib/cardHardwareContract.js';

const strips = [
  { id: 'a', name: 'Ring 1', pixelCount: 10 },
  { id: 'b', name: 'Ring 2', pixelCount: 21 },
  { id: 'c', name: 'Ring 3', pixelCount: 10 },
];
const clone = value => JSON.parse(JSON.stringify(value));
const order = wiring => stripOrderByOutput(wiring, strips).map(group => [group.pin, group.stripIds]);

test('default wiring lists every strip on one output in drawn order', () => {
  const wiring = makeDefaultWiring(strips);
  assert.deepEqual(order(wiring), [[16, ['a', 'b', 'c']]]);
});

test('move down swaps with the next strip on the same output; move up at the top is a no-op', () => {
  const wiring = makeDefaultWiring(strips);
  assert.equal(stripMoveTarget(wiring, strips, 'a', 'up'), null);
  assert.deepEqual(stripMoveTarget(wiring, strips, 'a', 'down'), { targetStripId: 'b', placement: 'after' });
  const draft = clone(wiring);
  assert.equal(moveStripRunsInOutputOrder(draft, { stripIds: ['a'], targetStripId: 'b', placement: 'after' }), true);
  assert.deepEqual(order(draft), [[16, ['b', 'a', 'c']]]);
  // Move down past the last strip: nothing to swap with, nothing moves.
  assert.equal(stripMoveTarget(draft, strips, 'c', 'down'), null);
});

test('moves never change which pin a strip is on and never create or lose an output', () => {
  const wiring = normalizeWiring({
    ...makeDefaultWiring(strips),
    outputs: [
      { id: 'out1', name: 'Output 1', pin: 16, runIds: ['run-a', 'run-b'] },
      { id: 'out2', name: 'Output 2', pin: 17, runIds: ['run-c'] },
    ],
  });
  assert.deepEqual(order(wiring), [[16, ['a', 'b']], [17, ['c']]]);
  // The only strip on output 2 cannot move up or down: no neighbour there.
  assert.equal(stripMoveTarget(wiring, strips, 'c', 'up'), null);
  assert.equal(stripMoveTarget(wiring, strips, 'c', 'down'), null);
  const draft = clone(wiring);
  const target = stripMoveTarget(draft, strips, 'b', 'up');
  assert.deepEqual(target, { targetStripId: 'a', placement: 'before' });
  moveStripRunsInOutputOrder(draft, { stripIds: ['b'], ...target });
  assert.deepEqual(order(draft), [[16, ['b', 'a']], [17, ['c']]]);
  assert.deepEqual(draft.outputs.map(output => output.pin), [16, 17]);
  assert.ok(draft.outputs.length <= CARD_HARDWARE_CONTRACT.maxOutputs);
});

test('a drag across outputs still works through the same primitive and drops the emptied output', () => {
  const wiring = normalizeWiring({
    ...makeDefaultWiring(strips),
    outputs: [
      { id: 'out1', name: 'Output 1', pin: 16, runIds: ['run-a', 'run-b'] },
      { id: 'out2', name: 'Output 2', pin: 17, runIds: ['run-c'] },
    ],
  });
  const draft = clone(wiring);
  moveStripRunsInOutputOrder(draft, { stripIds: ['c'], targetStripId: 'a', placement: 'before' });
  assert.deepEqual(order(draft), [[16, ['c', 'a', 'b']]]);
});

test('the pin picker lists the card connector pins first and folds the rest', () => {
  const { connector, more } = groupOutputPins(CARD_HARDWARE_CONTRACT.outputPins);
  assert.deepEqual(connector, [...CARD_CONNECTOR_PINS]);
  assert.deepEqual(connector, [16, 17, 18, 21]);
  assert.equal(more.length, CARD_HARDWARE_CONTRACT.outputPins.length - 4);
  assert.equal(more.includes(16), false);
});
