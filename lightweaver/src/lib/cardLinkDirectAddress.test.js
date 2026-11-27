import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateCardHosts, readStoredCardHost } from './cardConnection.js';
import { persistCardIdentity, readPersistedCardIdentity } from './cardIdentity.js';
import { getCardLinkState, getSharedCardLink, reportDirectCardStatus } from './cardLink.js';

test('a local Studio status probe remembers the verified address of the paired card', (context) => {
  const values = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: { protocol: 'http:' },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  context.after(() => {
    getSharedCardLink().destroy();
    globalThis.window = previousWindow;
  });

  const paired = {
    id: 'lw-same-card', address: '192.168.18.70',
    firmwareVersion: '1.2.11', buildId: 'a'.repeat(40), buildNumber: 2971,
  };
  persistCardIdentity(paired);
  const moved = '192.168.18.71';
  const status = {
    app: 'Lightweaver', provisioningContractVersion: 1, cardId: paired.id,
    firmwareVersion: paired.firmwareVersion, buildId: paired.buildId,
    buildNumber: paired.buildNumber, bootId: 'boot-moved', runtimePhase: 'ready',
    knownGoodProject: true, commandReady: true, outputReady: true,
  };

  reportDirectCardStatus({ connected: true, host: moved, status: { ...status, cardId: 'lw-different-card' } });
  assert.equal(readPersistedCardIdentity().address, paired.address);
  reportDirectCardStatus({ connected: true, host: moved, status: { ...status, bootId: '' } });
  assert.equal(readPersistedCardIdentity().address, paired.address);
  reportDirectCardStatus({ connected: true, host: moved, status });
  reportDirectCardStatus({ connected: true, host: moved, status });
  assert.equal(getCardLinkState().state, 'connected-direct');
  assert.equal(getCardLinkState().host, moved);
  assert.equal(readStoredCardHost(), moved);
  const remembered = readPersistedCardIdentity();
  assert.equal(remembered.address, moved);
  assert.equal(remembered.id, paired.id);
  assert.equal(remembered.firmwareVersion, paired.firmwareVersion);
  assert.equal(remembered.buildId, paired.buildId);
  assert.equal(remembered.buildNumber, paired.buildNumber);
  assert.equal(candidateCardHosts()[0], moved);

  reportDirectCardStatus({ connected: true, host: '192.168.4.1', status });
  assert.equal(readPersistedCardIdentity().address, moved);
});
