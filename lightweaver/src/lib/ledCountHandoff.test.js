import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestLedTotal, takeLedTotal } from './ledCountHandoff.js';

function memory() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

test('a requested total is taken once', () => {
  const storage = memory();
  assert.equal(requestLedTotal(60, { now: 1000, storage }), true);
  assert.equal(takeLedTotal({ now: 2000, storage }), 60);
  assert.equal(takeLedTotal({ now: 2000, storage }), null);
});

test('a stale or invalid note changes nothing', () => {
  const storage = memory();
  requestLedTotal(60, { now: 0, storage });
  assert.equal(takeLedTotal({ now: 16_000, storage }), null);
  assert.equal(requestLedTotal(0, { storage }), false);
  assert.equal(requestLedTotal('x', { storage }), false);
  assert.equal(takeLedTotal({ storage }), null);
});
