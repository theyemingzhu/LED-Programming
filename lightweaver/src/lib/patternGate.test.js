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

import { shouldRetryAfterTransientFailure as retryOwed, isTransientPreviewFailure, TRANSIENT_RETRY_WINDOW_MS } from './patternGate.js';

test('a timed-out tap is resent once when a newer reading shows the card ready', () => {
  const failed = { at: 1 };
  const fresh = { at: 2 };
  const timeout = { code: 'timeout' };
  assert.equal(retryOwed({ access: 'ready', failure: timeout, failedReading: failed, reading: failed, alreadyRetried: false, failedAt: 1000, now: 2000 }), false);
  assert.equal(retryOwed({ access: 'offline', failure: timeout, failedReading: failed, reading: fresh, alreadyRetried: false, failedAt: 1000, now: 2000 }), false);
  assert.equal(retryOwed({ access: 'ready', failure: timeout, failedReading: failed, reading: fresh, alreadyRetried: false, failedAt: 1000, now: 2000 }), true);
  assert.equal(retryOwed({ access: 'ready', failure: timeout, failedReading: failed, reading: fresh, alreadyRetried: true, failedAt: 1000, now: 2000 }), false);
});

test('only failures about timing are resent by themselves', () => {
  for (const code of ['timeout', 'card-restarted', 'not-ready']) assert.equal(isTransientPreviewFailure({ code }), true);
  for (const code of ['conflict', 'wrong-card', 'card-rejected', 'refused', 'section-layout-mismatch', 'unknown']) assert.equal(isTransientPreviewFailure({ code }), false);
});

test('a late resend is not owed: past the window, the message stays', () => {
  const base = { access: 'ready', failure: { code: 'timeout' }, failedReading: { at: 1 }, reading: { at: 2 }, alreadyRetried: false };
  assert.equal(retryOwed({ ...base, failedAt: 0, now: TRANSIENT_RETRY_WINDOW_MS }), true);
  assert.equal(retryOwed({ ...base, failedAt: 0, now: TRANSIENT_RETRY_WINDOW_MS + 1 }), false);
  assert.equal(retryOwed({ ...base, failedAt: null, now: 5 }), false);
});

test('a 409 from a card busy with another change is never resent by itself', () => {
  // Another browser usually caused it; a resend would override its newer choice.
  assert.equal(retryOwed({ access: 'ready', failure: { code: 'conflict' }, failedReading: { at: 1 }, reading: { at: 2 }, alreadyRetried: false, failedAt: 0, now: 1 }), false);
});

import { cardChangedSinceSeen } from './patternGate.js';
test('a save notices when another window changed the card first', () => {
  const seen = { cardId: 'lw-one', projectFingerprint: 'aaaaaaaaaaaaaaaa' };
  assert.equal(cardChangedSinceSeen(seen, { cardId: 'lw-one', projectFingerprint: 'bbbbbbbbbbbbbbbb' }), true);
  assert.equal(cardChangedSinceSeen(seen, { cardId: 'lw-one', projectFingerprint: 'aaaaaaaaaaaaaaaa' }), false);
  // Nothing seen yet, or a card that reports no fingerprint: no claim either way.
  assert.equal(cardChangedSinceSeen(null, { projectFingerprint: 'bbbbbbbbbbbbbbbb' }), false);
  assert.equal(cardChangedSinceSeen(seen, { projectFingerprint: '' }), false);
});
