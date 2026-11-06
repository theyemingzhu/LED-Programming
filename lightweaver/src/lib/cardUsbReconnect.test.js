import assert from 'node:assert/strict';
import test from 'node:test';
import { persistCardIdentity, readPersistedCardIdentity } from './cardIdentity.js';
import { findPairedCardUsbAddress } from './cardUsbReconnect.js';

const paired = { id: 'lw-123', firmwareVersion: '1.2.2', buildId: 'build-2320', buildNumber: 2320 };

test('USB reconnect remembers only the exact card station IP and closes the read-only session', async () => {
  const priorWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } };
  try {
    persistCardIdentity(paired);
    let closed = false;
    const address = await findPairedCardUsbAddress({ port: {}, pairedCard: paired,
      openSession: async ({ expected }) => {
        assert.deepEqual(expected, { cardId: paired.id, firmwareVersion: paired.firmwareVersion,
          buildId: paired.buildId, buildNumber: paired.buildNumber });
        return { identity: { ...expected, stationIp: '192.168.18.50' }, close: async () => { closed = true; } };
      },
    });
    assert.equal(address, '192.168.18.50');
    assert.equal(readPersistedCardIdentity().address, address);
    assert.equal(closed, true);
  } finally { globalThis.window = priorWindow; }
});

test('USB reconnect refuses an unpaired card and a missing station address', async () => {
  const priorWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } };
  try {
    persistCardIdentity(paired);
    let closed = 0;
    const openSession = async () => ({ identity: { cardId: 'lw-other', stationIp: '192.168.18.99' },
      close: async () => { closed += 1; } });
    await assert.rejects(findPairedCardUsbAddress({ port: {}, pairedCard: paired, openSession }), /different card/);
    assert.equal(readPersistedCardIdentity().address, '');
    await assert.rejects(findPairedCardUsbAddress({ port: {}, pairedCard: paired,
      openSession: async () => ({ identity: { cardId: paired.id, firmwareVersion: paired.firmwareVersion,
        buildId: paired.buildId, buildNumber: paired.buildNumber, stationIp: '' }, close: async () => { closed += 1; } }),
    }), /no home Wi-Fi address/);
    assert.equal(closed, 2);
  } finally { globalThis.window = priorWindow; }
});
