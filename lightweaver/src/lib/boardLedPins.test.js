import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedBoardProfile, selectBoardLedPins } from './boardLedPins.js';
import { REFERENCE_BOARDS } from './boardProfiles.js';

test('a profile can only remove firmware pins, and a reserved alias or control takes precedence', () => {
  const profile = { groups: [
    { kind: 'header', pins: [
      { gpio: 14, role: 'gpio' }, { gpio: 15, role: 'gpio' },
      { gpio: 16, role: 'gpio', installation: 'microSD SCK' },
      { gpio: 17, role: 'gpio' }, { gpio: 18, role: 'unknown' }, { gpio: 21, role: 'gpio' },
    ] },
    { kind: 'onboard', pins: [{ gpio: 21, role: 'control' }] },
  ] };
  assert.deepEqual(selectBoardLedPins({
    profile, firmwarePins: [15, 16, 17, 18, 21, 38], controlPins: [17],
  }), [15]);
});

test('a confirmed map is used only for that exact card and profile revision', () => {
  const cardId = 'lw-0123456789ab';
  const profile = REFERENCE_BOARDS[0];
  const storage = revision => ({
    getItem: () => JSON.stringify({ profiles: [], confirmations: { [cardId]: { id: profile.id, revision } } }),
  });
  assert.equal(confirmedBoardProfile(cardId, storage(1)), profile);
  assert.equal(confirmedBoardProfile(cardId, storage(2)), null);
  assert.equal(confirmedBoardProfile('lw-bb2233445566', storage(1)), null);
});
