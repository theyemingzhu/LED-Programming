import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClientPattern, verifySavedPattern } from './clientPattern.js';
const saved = { ok: true, cardId: 'lw-one', patternId: 'installed-Moon', revision: 'r2', overrides: { brightness: 0.4 } };
test('saved pattern receipt requires exact card, installed ID, revision and bounded controls', () => {
  assert.deepEqual(normalizeClientPattern(saved, 'lw-one', 'installed-Moon'), saved);
  assert.throws(() => normalizeClientPattern({ ...saved, cardId: 'lw-other' }, 'lw-one', 'installed-Moon'));
  assert.throws(() => normalizeClientPattern({ ...saved, patternId: 'alias' }, 'lw-one', 'installed-Moon'));
  assert.throws(() => normalizeClientPattern({ ...saved, overrides: { brightness: 0 } }, 'lw-one', 'installed-Moon'));
});
test('save is confirmed only by matching revision and values from fresh readback', () => {
  assert.equal(verifySavedPattern(saved, { ...saved, overrides: { brightness: 0.40000001 } }, { brightness: 0.4 }), true);
  assert.throws(() => verifySavedPattern(saved, { ...saved, revision: 'r3' }, { brightness: 0.4 }));
  assert.throws(() => verifySavedPattern(saved, { ...saved, overrides: {} }, { brightness: 0.4 }));
});
