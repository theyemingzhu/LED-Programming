import assert from 'node:assert/strict';
import test from 'node:test';
import { bestKnownHost, findAndConnectCard } from './cardFind.js';
import { getCardLinkState } from './cardLink.js';

test('public reconnect prefers a verified paired or remembered IP over unresolved mDNS', () => {
  const previous = globalThis.window;
  const values = new Map([['lw_chip_card_host', 'lightweaver.local']]);
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null } };
  try {
    assert.equal(bestKnownHost({ host: '192.168.18.50' }), '192.168.18.50');
    values.set('lw_card_identity_v1', JSON.stringify({ version: 1, id: 'lw-gallery', address: '192.168.18.51' }));
    assert.equal(bestKnownHost({ host: 'lightweaver.local' }), '192.168.18.51');
    values.set('lw_card_identity_v1', JSON.stringify({ version: 1, id: 'lw-gallery', address: '192.168.4.1' }));
    assert.equal(bestKnownHost({ host: 'lightweaver.local' }), 'lightweaver.local');
  } finally { globalThis.window = previous; }
});

test('one explicit find retries an initially unavailable card without pairing the first answer', async () => {
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  const storage = new Map([['lw_chip_card_host', '192.168.77.19']]);
  const host = '192.168.77.19';
  let targetReads = 0;
  globalThis.window = {
    location: { protocol: 'https:' },
    localStorage: { getItem: key => storage.get(key) ?? null },
  };
  globalThis.fetch = async url => {
    if (!String(url).startsWith(`http://${host}/`)) throw new TypeError('Different route');
    targetReads += 1;
    if (targetReads === 1) throw new TypeError('Card is still joining Wi-Fi');
    return new Response(JSON.stringify({
      app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-aabbccddeeff',
      firmwareVersion: '1.2.10', buildId: 'a'.repeat(40), bootId: 'boot-1',
      runtimePhase: 'ready', knownGoodProject: true, commandReady: true,
    }));
  };
  try {
    const result = await findAndConnectCard({ timeoutMs: 120, retryDelayMs: 5 });
    assert.equal(result.how, 'found-unpaired');
    assert.equal(result.card?.id, 'lw-aabbccddeeff');
    assert.ok(targetReads >= 2);
    assert.equal(storage.has('lw_card_identity_v1'), false);
  } finally {
    globalThis.window = priorWindow;
    globalThis.fetch = priorFetch;
  }
});

test('a cancelled find ignores a successful reply from its old target', async () => {
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  const previousDiscovery = getCardLinkState().discoveredCard?.id;
  const abort = new AbortController();
  const host = '192.168.78.19';
  let release;
  globalThis.window = { location: { protocol: 'https:' }, localStorage: { getItem: () => null } };
  globalThis.fetch = () => new Promise(resolve => { release = resolve; });
  try {
    const pending = findAndConnectCard({ preferredHost: host, exactHost: true, signal: abort.signal });
    abort.abort();
    assert.deepEqual(await pending, { ok: false, reason: 'cancelled' });
    release(new Response(JSON.stringify({
      app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-112233445566',
      firmwareVersion: '1.2.10', buildId: 'a'.repeat(40), bootId: 'late-boot',
      runtimePhase: 'ready', knownGoodProject: true, commandReady: true,
    })));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(getCardLinkState().discoveredCard?.id, previousDiscovery);
  } finally {
    globalThis.window = priorWindow;
    globalThis.fetch = priorFetch;
  }
});
