import assert from 'node:assert/strict';
import test from 'node:test';
import { bestKnownHost } from './cardFind.js';

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
