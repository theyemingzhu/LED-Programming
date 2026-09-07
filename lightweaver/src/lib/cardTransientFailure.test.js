import assert from 'node:assert/strict';
import test from 'node:test';

import { isTransientCardFailure, retryWhileTransient } from './cardTransientFailure.js';

test('a card that is still starting up is a moment, not a failure', () => {
  // 423 is the firmware's own "not ready for runtime control". It was the
  // commonest refusal in the product and no notion of transient knew about it.
  assert.equal(isTransientCardFailure({ reason: 'http', status: 423 }), true);
  assert.equal(isTransientCardFailure({ reason: 'http', status: 409 }), true);
  assert.equal(isTransientCardFailure({ reason: 'http', status: 503 }), true);
  assert.equal(isTransientCardFailure({ name: 'AbortError' }), true);
  assert.equal(isTransientCardFailure({ reason: 'bridge-timeout' }), true);
  assert.equal(isTransientCardFailure(new Error('Failed to fetch')), true);
});

test('a refusal the card reasoned about is never retried', () => {
  // Asking the same question twice is not recovery.
  assert.equal(isTransientCardFailure({ reason: 'http', status: 422 }), false);
  assert.equal(isTransientCardFailure({ reason: 'http', status: 400 }), false);
  assert.equal(isTransientCardFailure({ reason: 'http', status: 403 }), false);
  assert.equal(isTransientCardFailure({ reason: 'wrong-card' }), false);
  assert.equal(isTransientCardFailure({ reason: 'project-mismatch' }), false);
  assert.equal(isTransientCardFailure(null), false);
});

test('a booting card is waited out rather than reported', async () => {
  let calls = 0;
  const slept = [];
  const value = await retryWhileTransient(() => {
    calls += 1;
    if (calls < 3) {
      const error = new Error('card returned 423');
      error.reason = 'http';
      error.status = 423;
      throw error;
    }
    return 'applied';
  }, { sleep: async ms => { slept.push(ms); } });

  assert.equal(value, 'applied');
  assert.equal(calls, 3, 'it kept asking while the card was still starting');
  assert.deepEqual(slept, [400, 800], 'and gave the card longer each time');
});

test('a real refusal surfaces immediately, without a second ask', async () => {
  let calls = 0;
  await assert.rejects(
    () => retryWhileTransient(() => {
      calls += 1;
      const error = new Error('unknown zone');
      error.reason = 'http';
      error.status = 422;
      throw error;
    }, { sleep: async () => {} }),
    /unknown zone/,
  );
  assert.equal(calls, 1, 'a reasoned refusal is not asked twice');
});

test('a card that never comes back still fails, with its own error', async () => {
  let calls = 0;
  await assert.rejects(
    () => retryWhileTransient(() => {
      calls += 1;
      const error = new Error('card returned 423');
      error.status = 423;
      throw error;
    }, { attempts: 4, sleep: async () => {} }),
    /423/,
  );
  assert.equal(calls, 4, 'it gives up after the agreed number of attempts');
});

test('a lost reply is settled by reading the card back, not by sending the command again', async () => {
  let sends = 0;
  let reads = 0;
  const result = await retryWhileTransient(() => {
    sends += 1;
    const error = new TypeError('Failed to fetch');
    throw error;
  }, {
    attempts: 3,
    sleep: async () => {},
    readBack: async (error, attemptNumber) => {
      reads += 1;
      assert.equal(attemptNumber, 1, 'the read happens before the first retry');
      assert.match(String(error?.message), /fetch/);
      return { ok: true, readBack: true };
    },
  });
  assert.deepEqual(result, { ok: true, readBack: true });
  assert.equal(sends, 1, 'the write went out exactly once');
  assert.equal(reads, 1, 'one read settled it');
});

test('a read-back that cannot confirm the intent falls through to the ordinary retry', async () => {
  let sends = 0;
  const result = await retryWhileTransient(() => {
    sends += 1;
    if (sends === 1) throw new TypeError('Failed to fetch');
    return { ok: true, sent: sends };
  }, {
    attempts: 3,
    sleep: async () => {},
    readBack: async () => null,
  });
  assert.deepEqual(result, { ok: true, sent: 2 });
  assert.equal(sends, 2, 'an unconfirmed read still allows one more send');
});

test('a read-back that throws is treated as unconfirmed', async () => {
  let sends = 0;
  await retryWhileTransient(() => {
    sends += 1;
    if (sends === 1) throw new TypeError('Failed to fetch');
    return { ok: true };
  }, {
    attempts: 3,
    sleep: async () => {},
    readBack: async () => { throw new Error('zones unreadable'); },
  });
  assert.equal(sends, 2);
});
