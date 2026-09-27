import test from 'node:test';
import assert from 'node:assert/strict';
import { readPatternEditSession, writePatternEditSession, writePatternLabEditHandoff, consumePatternLabEditHandoff } from './patternEditSession.js';
function storage() { const values = new Map(); return { setItem: (k, v) => values.set(k, v), getItem: k => values.get(k), removeItem: k => values.delete(k) }; }
test('working copies survive reopening, stay project scoped and handoff is consumed once', () => {
  const store = storage();
  const value = { draftLooks: { all: { patternId: 'aurora', customSaturation: 0 } }, name: 'Mine' };
  assert.equal(writePatternEditSession('a', 'patterns', value, store).ok, true);
  assert.deepEqual(readPatternEditSession('a', 'patterns', store), value);
  assert.equal(readPatternEditSession('b', 'patterns', store), null);
  writePatternLabEditHandoff('a', value, store);
  assert.deepEqual(consumePatternLabEditHandoff('a', store), value);
  assert.equal(consumePatternLabEditHandoff('a', store), null);
});
test('quota and unavailable storage never report a saved working copy', () => {
  assert.equal(writePatternEditSession('a', 'patterns', {}, null).ok, false);
  assert.equal(writePatternEditSession('a', 'patterns', {}, { setItem() { throw new Error('Quota'); } }).ok, false);
  assert.equal(readPatternEditSession('a', 'patterns', { getItem() { throw new Error('Denied'); } }), null);
});
