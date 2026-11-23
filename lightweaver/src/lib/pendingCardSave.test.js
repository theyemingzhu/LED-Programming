import test from 'node:test';
import assert from 'node:assert/strict';
import { writePendingCardSave, readPendingCardSave, clearPendingCardSave, pendingSaveHeldByCard, PENDING_CARD_SAVE_MAX_AGE_MS } from './pendingCardSave.js';

function memory() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}
const entry = { projectId: 'lwproj-a', generation: 2, cardId: 'lw-aabbccddeeff', projectFingerprint: 'C8FA0374EE20844E', patchBoard: { p: 1 }, standaloneController: { c: 1 } };

test('a pending save is kept across pages and recognised only from the card itself', () => {
  const store = memory();
  assert.equal(writePendingCardSave(entry, { store, now: 1000 }), true);
  const pending = readPendingCardSave({ store, now: 2000 });
  assert.equal(pending.projectFingerprint, 'c8fa0374ee20844e');
  assert.deepEqual(pending.standaloneController, { c: 1 });
  const evidence = { cardId: 'lw-aabbccddeeff', projectFingerprint: 'c8fa0374ee20844e' };
  assert.equal(pendingSaveHeldByCard(pending, evidence, { projectId: 'lwproj-a' }), pending);
  for (const override of [{ cardId: 'lw-000000000000' }, { projectFingerprint: 'ffffffffffffffff' }, { projectFingerprint: '' }]) {
    assert.equal(pendingSaveHeldByCard(pending, { ...evidence, ...override }, { projectId: 'lwproj-a' }), null, JSON.stringify(override));
  }
  assert.equal(pendingSaveHeldByCard(pending, evidence, { projectId: 'lwproj-other' }), null);
});

test('a pending save expires, refuses malformed input, and clears', () => {
  const store = memory();
  assert.equal(writePendingCardSave({ ...entry, projectFingerprint: 'not-hex' }, { store }), false);
  writePendingCardSave(entry, { store, now: 0 });
  assert.equal(readPendingCardSave({ store, now: PENDING_CARD_SAVE_MAX_AGE_MS + 1 }), null);
  writePendingCardSave(entry, { store, now: 0 });
  clearPendingCardSave({ store });
  assert.equal(readPendingCardSave({ store, now: 1 }), null);
});
