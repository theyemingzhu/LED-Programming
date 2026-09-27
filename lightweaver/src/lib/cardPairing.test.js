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
