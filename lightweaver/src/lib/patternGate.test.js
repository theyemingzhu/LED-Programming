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

import { shouldRetryAfterTransientFailure as retryOwed, isTransientPreviewFailure } from './patternGate.js';

test('a timed-out tap is resent once when a newer reading shows the card ready', () => {
  const failed = { at: 1 };
  const fresh = { at: 2 };
  const timeout = { code: 'timeout' };
  assert.equal(retryOwed({ access: 'ready', failure: timeout, failedReading: failed, reading: failed, alreadyRetried: false }), false);
  assert.equal(retryOwed({ access: 'offline', failure: timeout, failedReading: failed, reading: fresh, alreadyRetried: false }), false);
  assert.equal(retryOwed({ access: 'ready', failure: timeout, failedReading: failed, reading: fresh, alreadyRetried: false }), true);
  assert.equal(retryOwed({ access: 'ready', failure: timeout, failedReading: failed, reading: fresh, alreadyRetried: true }), false);
});

test('only failures about timing are resent by themselves', () => {
  for (const code of ['timeout', 'card-restarted', 'not-ready', 'conflict']) assert.equal(isTransientPreviewFailure({ code }), true);
  for (const code of ['wrong-card', 'card-rejected', 'refused', 'section-layout-mismatch', 'unknown']) assert.equal(isTransientPreviewFailure({ code }), false);
});
