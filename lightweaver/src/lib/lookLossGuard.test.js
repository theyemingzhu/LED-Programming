import test from 'node:test';
import assert from 'node:assert/strict';
import {
  looksDroppedBySave, saveWouldLoseLooks, lookLossMessage, mergeCardLooksIntoController,
  noteLooksRemovedByOwner, looksRemovedByOwner, clearLooksRemovedByOwner,
} from './lookLossGuard.js';

function memory() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}
const CARD_SIX = { patterns: ['fire', 'combo-sparkle', 'combo-x', 'combo-aurora', 'combo-twinkle', 'combo-sections'].map(id => ({ id })) };

test('six looks on the card and a save carrying only Fire is stopped, in plain words (L1)', () => {
  const dropped = looksDroppedBySave(CARD_SIX, { config: { looks: [{ id: 'fire' }] } });
  assert.deepEqual(dropped.missing, ['combo-sparkle', 'combo-x', 'combo-aurora', 'combo-twinkle', 'combo-sections']);
  assert.equal(saveWouldLoseLooks(dropped), true);
  assert.equal(lookLossMessage(dropped), 'Not saved: the card holds 6 looks, and this save would send 1. 5 looks would be removed from the card. Nothing was sent.');
});

test('a save keeping every look, or adding looks, is not stopped', () => {
  const all = { config: { looks: CARD_SIX.patterns.map(p => ({ id: p.id })).concat([{ id: 'combo-new' }]) } };
  assert.equal(saveWouldLoseLooks(looksDroppedBySave(CARD_SIX, all)), false);
  assert.equal(saveWouldLoseLooks(looksDroppedBySave({ patterns: [{ id: 'blackout' }] }, { config: { looks: [] } })), false, 'blackout is not a look');
});

test('six to five after the owner deleted one look in this tab saves without a wall', () => {
  const store = memory();
  const five = { config: { looks: CARD_SIX.patterns.slice(0, 5).map(p => ({ id: p.id })) } };
  const dropped = looksDroppedBySave(CARD_SIX, five);
  assert.equal(saveWouldLoseLooks(dropped, { removedByOwner: looksRemovedByOwner({ storage: store }) }), true, 'not deleted by the owner: stopped');
  noteLooksRemovedByOwner(1, { storage: store });
  assert.equal(saveWouldLoseLooks(dropped, { removedByOwner: looksRemovedByOwner({ storage: store }) }), false, 'deleted by the owner: saves');
  // One deliberate delete does not license losing five.
  const one = looksDroppedBySave(CARD_SIX, { config: { looks: [{ id: 'fire' }] } });
  assert.equal(saveWouldLoseLooks(one, { removedByOwner: looksRemovedByOwner({ storage: store }) }), true);
  clearLooksRemovedByOwner({ storage: store });
  assert.equal(looksRemovedByOwner({ storage: store }), 0);
});

test('keeping the card\'s looks adds what the draft lacks and keeps the owner\'s edits', () => {
  const draft = { defaultLook: { patternId: 'fire', speed: 1.08 }, looks: [{ id: 'sparkle', label: 'Mine' }], playlist: [{ id: 'combo-sparkle' }] };
  const card = { looks: [{ id: 'sparkle', label: 'Card' }, { id: 'aurora' }], playlist: [{ id: 'combo-sparkle' }, { id: 'combo-aurora' }] };
  const merged = mergeCardLooksIntoController(draft, card);
  assert.deepEqual(merged.looks.map(l => l.id), ['sparkle', 'aurora']);
  assert.equal(merged.looks[0].label, 'Mine', 'the draft\'s own version wins');
  assert.deepEqual(merged.playlist.map(e => e.id), ['combo-sparkle', 'combo-aurora']);
  assert.equal(merged.defaultLook.speed, 1.08);
});
