import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapStudioCardConnection } from './studioCardBootstrap.js';

test('Studio reload restores its persisted exact card through direct transport', async () => {
  const calls = [];
  let persisted = null;
  const authority = {
    connected: true,
    host: '192.168.18.70',
    cardId: 'lw-card-a',
    bootId: 'boot-new',
    // A real transport authority publishes host/cardId/bootId and the observed
    // card — never a top-level buildId. Keep the fake honest about that.
    card: { id: 'lw-card-a', name: 'Lightweaver' },
  };
  const result = await bootstrapStudioCardConnection({
    bootstrapLink: async () => ({ state: 'disconnected' }),
    isConnected: () => false,
    readIdentity: () => ({ id: 'lw-card-a', name: 'Saved card' }),
    readHost: () => 'lightweaver.local',
    candidateHosts: () => ['192.168.18.70', 'lightweaver.local'],
    connectTransport: async options => { calls.push(options); return authority; },
    persistIdentity: value => { persisted = value; return true; },
  });

  assert.equal(result, authority);
  assert.deepEqual(calls, [{ host: '192.168.18.70', expectedCardId: 'lw-card-a' }]);
  assert.equal(persisted.id, 'lw-card-a');
  assert.equal(persisted.address, '192.168.18.70');
  assert.equal(persisted.bootId, 'boot-new');
});

test('Studio falls through stale hosts until the exact paired card answers', async () => {
  const calls = [];
  const result = await bootstrapStudioCardConnection({
    bootstrapLink: async () => ({ state: 'disconnected' }),
    isConnected: () => false,
    readIdentity: () => ({ id: 'lw-card-a', address: '192.168.18.70' }),
    readHost: () => 'lightweaver.local',
    candidateHosts: () => ['lightweaver.local', '192.168.18.70'],
    connectTransport: async ({ host }) => {
      calls.push(host);
      return host === '192.168.18.70'
        ? { connected: true, host, cardId: 'lw-card-a', card: { id: 'lw-card-a' } }
        : { connected: false, reason: 'direct-unavailable' };
    },
    persistIdentity: () => true,
  });
  assert.equal(result.connected, true);
  assert.deepEqual(calls, ['lightweaver.local', '192.168.18.70']);
});

test('Studio never races direct transport against a restored bridge', async () => {
  let directCalls = 0;
  const bridge = { state: 'connected-bridge' };
  const result = await bootstrapStudioCardConnection({
    bootstrapLink: async () => bridge,
    isConnected: state => state.state === 'connected-bridge',
    connectTransport: async () => { directCalls += 1; },
  });
  assert.equal(result, bridge);
  assert.equal(directCalls, 0);
});

test('Studio does not well-known-probe an unpaired card during Install or an in-flight update', async () => {
  let directCalls = 0;
  const readStatus = async () => { directCalls += 1; };
  await bootstrapStudioCardConnection({
    bootstrapLink: async () => ({ state: 'disconnected' }),
    isConnected: () => false,
    readIdentity: () => null,
    canPushDirect: () => true,
    locationHash: '#screen=card&section=install',
    readStatus,
  });
  assert.equal(directCalls, 0);
  await bootstrapStudioCardConnection({
    bootstrapLink: async () => ({ state: 'disconnected' }),
    isConnected: () => false,
    readIdentity: () => null,
    canPushDirect: () => true,
    locationHash: '#screen=card&section=setup',
    readUpdateSession: () => '{"phase":"valid"}',
    readStatus,
  });
  assert.equal(directCalls, 0);
});

test('Studio does not probe an unpaired card when this page cannot reach the LAN', async () => {
  let directCalls = 0;
  await bootstrapStudioCardConnection({
    bootstrapLink: async () => ({ state: 'disconnected' }),
    isConnected: () => false,
    readIdentity: () => null,
    canPushDirect: () => false,
    readStatus: async () => { directCalls += 1; },
  });
  assert.equal(directCalls, 0);
});

test('Studio probes only well-known hosts for a plugged-in card this browser has never paired', async () => {
  const calls = [];
  const reports = [];
  let persistCalls = 0;
  const status = {
    app: 'Lightweaver',
    cardId: 'lw-plugged-in',
    bootId: 'boot-first',
  };
  const foundUnpaired = {
    state: 'disconnected',
    reason: 'found-unpaired',
    host: 'lightweaver.local',
    discoveredCard: { id: 'lw-plugged-in' },
  };
  const result = await bootstrapStudioCardConnection({
    bootstrapLink: async () => ({ state: 'disconnected' }),
    isConnected: () => false,
    readIdentity: () => null,
    canPushDirect: () => true,
    unpairedHosts: ['lightweaver.local', '192.168.4.1'],
    readStatus: async options => { calls.push(options); return status; },
    reportStatus: report => { reports.push(report); },
    getLinkState: () => foundUnpaired,
    persistIdentity: () => { persistCalls += 1; return true; },
  });
  assert.equal(result, foundUnpaired);
  assert.deepEqual(calls, [
    { host: 'lightweaver.local', transport: 'direct', timeoutMs: 900 },
  ]);
  assert.deepEqual(reports, [{
    connected: true,
    host: 'lightweaver.local',
    status,
    allowAdopt: false,
  }]);
  assert.equal(persistCalls, 0);
});

test('an unpaired probe does not sweep past the well-known card addresses', async () => {
  const calls = [];
  await bootstrapStudioCardConnection({
    bootstrapLink: async () => ({ state: 'disconnected' }),
    isConnected: () => false,
    readIdentity: () => null,
    canPushDirect: () => true,
    unpairedHosts: ['lightweaver.local', '192.168.4.1'],
    readStatus: async options => {
      calls.push(options.host);
      throw new Error('unreachable');
    },
  });
  assert.deepEqual(calls, ['lightweaver.local', '192.168.4.1']);
});

// F13. This test used to assert the opposite — that a reload must KEEP the
// remembered build so a reflash "stays visible" — and the code it protected is
// what stranded Adrian's card on 2026-09-07. That code did not keep the note;
// it tore it: the live `card` was spread in, carrying its buildNumber, while
// only firmwareVersion and buildId were pinned back to the remembered ones. So
// after the 1524 → 1548 update the stored record held build number 1548 beside
// the buildId of 1524 — a firmware identity describing no build that has ever
// existed — and every firmware comparison in Studio refused the card in front
// of him.
//
// A same-id firmware change is what an official update always produces. The
// change worth stopping for is a DIFFERENT CARD, and that is unreachable here:
// `connectTransport` is given the remembered id and refuses any other as
// `wrong-card`. So the note is brought current, whole.
test('Studio reload writes down the firmware the card is actually running, whole', async () => {
  let persisted = null;
  await bootstrapStudioCardConnection({
    bootstrapLink: async () => ({ state: 'disconnected' }),
    isConnected: () => false,
    readIdentity: () => ({
      id: 'lw-card-a', firmwareVersion: '1.0.0', buildId: 'a'.repeat(40), buildNumber: 1524,
    }),
    readHost: () => 'lightweaver.local',
    candidateHosts: () => ['lightweaver.local'],
    connectTransport: async () => ({
      connected: true,
      host: 'lightweaver.local',
      cardId: 'lw-card-a',
      bootId: 'boot-new',
      // The card now answers on a newer signed build: it was updated.
      card: {
        id: 'lw-card-a', firmwareVersion: '1.1.0', buildId: 'b'.repeat(40), buildNumber: 1548,
      },
    }),
    persistIdentity: value => { persisted = value; return true; },
  });
  // All three firmware fields move together, or the record describes a build
  // that never existed.
  assert.equal(persisted.buildId, 'b'.repeat(40));
  assert.equal(persisted.firmwareVersion, '1.1.0');
  assert.equal(persisted.buildNumber, 1548);
  // The pairing itself is untouched — this is the same card.
  assert.equal(persisted.id, 'lw-card-a');
  assert.equal(persisted.bootId, 'boot-new');
});
