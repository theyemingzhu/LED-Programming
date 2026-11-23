import assert from 'node:assert/strict';
import test from 'node:test';
import { pairDiscoveredCard } from './cardPairing.js';

test('USB-targeted pairing refuses a different discovery during retry', async () => {
  const expectedCard = {
    id: 'lw-b0fe81f61b44', firmwareVersion: '1.2.0', buildId: 'target-build',
    buildNumber: 1300, host: '192.168.18.70',
  };
  let discovery = { ...expectedCard };
  let adoptionCalls = 0;
  const result = await pairDiscoveredCard({ transport: 'bridge', host: expectedCard.host }, {
    expectedCard,
    readIdentity: () => null,
    readBridgeState: () => ({ host: expectedCard.host, discoveredCard: discovery }),
    adoptBridge: async () => {
      adoptionCalls += 1;
      const error = new Error('New discovery');
      error.reason = 'stale-discovery';
      throw error;
    },
    delay: async () => { discovery = { ...expectedCard, id: 'lw-112233445566' }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'wrong-card');
  assert.equal(adoptionCalls, 1);
});

// Interruption test D5 (todo/plans/practice-card-interruptions.md): a card too
// slow for one identity read is asked again, and if it never answers in time
// the owner reads plain words, not the browser's "signal is aborted".
test('a pairing read that times out is retried, then explained in plain words', async () => {
  let calls = 0;
  const timedOut = () => { const error = new Error('signal is aborted without reason'); error.name = 'AbortError'; return error; };
  const slowThenOk = await pairDiscoveredCard({ transport: 'direct', discoveredCard: { id: 'lw-aabbccddeeff' } }, {
    adoptDirect: async () => { calls += 1; if (calls < 2) throw timedOut(); },
    delay: async () => {},
  });
  assert.equal(slowThenOk.ok, true);
  assert.equal(calls, 2);

  const never = await pairDiscoveredCard({ transport: 'direct', discoveredCard: { id: 'lw-aabbccddeeff' } }, {
    adoptDirect: async () => { throw timedOut(); },
    delay: async () => {},
  });
  assert.equal(never.ok, false);
  assert.equal(never.reason, 'timeout');
  assert.doesNotMatch(never.message, /abort/i);
  assert.match(never.message, /took too long to answer/);
});
