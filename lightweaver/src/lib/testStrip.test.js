import assert from 'node:assert/strict';
import test from 'node:test';
import { captureTestStripCandidate, startTestStripSession, stopTestStripSession } from './testStrip.js';

test('HTTPS test-strip candidate capture and rollback keep the direct card transport', async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  storage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: 'lw-test-strip' }));
  globalThis.window = {
    location: { protocol: 'https:', search: '' },
    localStorage: storage, sessionStorage: storage,
    addEventListener() {}, dispatchEvent() {},
  };
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    requests.push([path, options.method || 'GET']);
    const body = path === '/api/firmware-info'
      ? { cardId: 'lw-test-strip', firmwareVersion: '1.0.0', buildId: 'build-test' }
      : { ok: true, state: path.endsWith('rollback') ? 'rolled-back' : 'staged', activationId: 'owned-test' };
    return { ok: true, json: async () => body };
  };
  try {
    startTestStripSession({ length: 30, sessionId: 'test-session' });
    assert.equal(await captureTestStripCandidate({ host: '192.168.50.77', transport: 'direct', previousActivationId: '' }), 'owned-test');
    assert.equal((await stopTestStripSession({ host: '192.168.50.77', transport: 'direct' })).rolledBack, true);
    assert.deepEqual(requests, [
      ['/api/wiring/status', 'GET'], ['/api/wiring/status', 'GET'],
      ['/api/firmware-info', 'GET'], ['/api/wiring/rollback', 'POST'],
    ]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
