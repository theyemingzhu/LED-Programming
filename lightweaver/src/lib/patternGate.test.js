import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldClearRecoveryGate } from './patternGate.js';

test('a refusal from a dropped card clears once the card is ready again', () => {
  assert.equal(shouldClearRecoveryGate({ access: 'ready', gate: 'recovery', raisedWhileUnready: true }), true);
});
test('a refusal raised while access was already ready stays visible', () => {
  assert.equal(shouldClearRecoveryGate({ access: 'ready', gate: 'recovery', raisedWhileUnready: false }), false);
});
test('nothing clears while the card is still not ready, or for blank/project refusals', () => {
  assert.equal(shouldClearRecoveryGate({ access: 'recovery', gate: 'recovery', raisedWhileUnready: true }), false);
  assert.equal(shouldClearRecoveryGate({ access: 'ready', gate: 'project', raisedWhileUnready: true }), false);
  assert.equal(shouldClearRecoveryGate({ access: 'ready', gate: 'blank', raisedWhileUnready: true }), false);
});
