import assert from 'node:assert/strict';
import test from 'node:test';
import { designSlotForReplacement, LEGACY_REPLACEMENT_BUILD_ID, replacementCapabilities, replacementOutputs, updateReplacementPortRoles } from './stripReplacement.js';

import { DEFAULT_CARD_CONTROLS } from './cardRuntimeContract.js';

const outputs = [38, 15, 41, 16].map((pin, index) => ({
  id: `out${index + 1}`, pin, pixels: 23 + index * 7,
  segments: [{ id: `run${index + 1}`, count: 23 + index * 7, direction: 'forward' }],
}));

test('replacement moves the selected current slot without sorting or changing other outputs or counts', () => {
  assert.deepEqual(replacementOutputs(outputs, 'out3', 17, { maxOutputs: 4, pins: [15, 16, 17, 38, 41] }),
    outputs.map(output => output.id === 'out3' ? { ...output, pin: 17 } : output));
});

test('replacement rejects an occupied, unknown, reserved or unavailable GPIO and inconsistent card capacity', () => {
  const known = { maxOutputs: 4, pins: [15, 16, 17, 38, 41] };
  assert.throws(() => replacementOutputs(outputs, 'out3', 16, known), /already/);
  assert.throws(() => replacementOutputs(outputs, 'out3', 21, known), /unavailable/);
  assert.throws(() => replacementOutputs(outputs, 'out3', 17, { ...known, pins: null }), /unavailable/);
  assert.throws(() => replacementOutputs(outputs, 'out5', 17, known), /slot/);
  assert.throws(() => replacementOutputs(outputs, 'out3', 17, { ...known, maxOutputs: 3 }), /supports 3/);
});


test('moving last-counted evidence leaves unrelated counts and control reservations intact and adds an eligible new pin', () => {
  const history = [
    { pin: 15, role: 'strip', pixelCount: 11, controlKind: '' },
    { pin: 38, role: 'strip', pixelCount: 34, controlKind: '' },
    { pin: 41, role: 'strip', pixelCount: 0, controlKind: '' },
    { pin: 40, role: 'control', pixelCount: 0, controlKind: 'button' },
  ];
  const next = updateReplacementPortRoles(history, 38, 39);
  for (const pin of [15, 41, 40]) {
    assert.deepEqual(next.find(entry => entry.pin === pin), history.find(entry => entry.pin === pin));
  }
  assert.deepEqual(next.find(entry => entry.pin === 39), { pin: 39, role: 'strip', pixelCount: 34, controlKind: '' });
  assert.deepEqual(next.find(entry => entry.pin === 38), { pin: 38, role: 'unused', pixelCount: 0, controlKind: '' });
  assert.throws(() => updateReplacementPortRoles(history, 38, 40), /saved/);
  assert.throws(() => updateReplacementPortRoles(history, 38, 41), /saved/);
  assert.equal(updateReplacementPortRoles(history, 16, 39).find(entry => entry.pin === 39).role, 'unused');
});

test('known legacy firmware uses its compiled menu and the live control claims', () => {
  const raw = {
    app: 'Lightweaver', buildId: LEGACY_REPLACEMENT_BUILD_ID, firmwareVersion: '1.2.8',
    limits: { outputs: 4 }, controls: DEFAULT_CARD_CONTROLS,
  };
  const defaultUses = replacementCapabilities(raw).pins;
  assert.ok(defaultUses.includes(17) && defaultUses.includes(39));
  assert.ok(!defaultUses.includes(4));
  const reassigned = replacementCapabilities({ ...raw, controls: { ...raw.controls, encoder: { ...raw.controls.encoder, a: 9 } } }).pins;
  assert.ok(reassigned.includes(4));
  assert.equal(replacementCapabilities({ ...raw, buildId: 'unknown-build' }).pins, null);
  assert.equal(replacementCapabilities({ ...raw, controls: { encoder: { a: 4 } } }).pins, null);
});


test('only the same editable slot on the previous pin can follow a confirmed replacement', () => {
  const runs = [{ id: 'a', verified: true }, { id: 'b', verified: true }];
  const wiring = {
    outputs: [{ id: 'out1', pin: 38, runIds: ['a'] }, { id: 'out2', pin: 41, runIds: ['b'] }],
    runs,
  };
  assert.equal(designSlotForReplacement(wiring, 'out1', 38, 17), wiring.outputs[0]);
  assert.equal(designSlotForReplacement(wiring, 'out1', 17, 38), null);
  assert.equal(designSlotForReplacement(wiring, 'out1', 38, 41), null);
  assert.equal(designSlotForReplacement(wiring, 'out2', 38, 17), null);
  assert.equal(designSlotForReplacement(wiring, 'missing', 38, 17), null);
  assert.equal(wiring.outputs[0].pin, 38);
  assert.equal(wiring.runs, runs);
});
