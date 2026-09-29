import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClientPlayerLink, parseClientPlayerLink, readClientTarget, saveClientPairing, CLIENT_PAIRING_KEY } from './clientPairing.js';
const pairing = { host: '192.168.1.44', cardId: 'lw-gallery123', name: 'Moon garden' };
test('Studio player link carries exact installation identity only in its fragment', () => {
  const url = new URL(buildClientPlayerLink(pairing));
  assert.equal(url.origin, 'https://light.mandalacodes.com'); assert.equal(url.search, '');
  assert.deepEqual(parseClientPlayerLink(url.href), pairing);
  assert.throws(() => parseClientPlayerLink('https://light.mandalacodes.com/#host=192.168.1.44'));
  assert.throws(() => buildClientPlayerLink({ ...pairing, host: 'evil.example' }));
});
test('saved pairing reconnects; exact shared link takes precedence', () => {
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readClientTarget('https://light.mandalacodes.com/', storage).source, 'discovery');
  saveClientPairing(pairing, storage);
  assert.ok(values.get(CLIENT_PAIRING_KEY));
  assert.deepEqual(readClientTarget('https://light.mandalacodes.com/', storage), { ...pairing, source: 'saved' });
  const shared = { ...pairing, cardId: 'lw-another' };
  assert.deepEqual(readClientTarget(buildClientPlayerLink(shared), storage), { ...shared, source: 'shared' });
});
