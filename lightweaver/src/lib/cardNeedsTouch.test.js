import test from 'node:test';
import assert from 'node:assert/strict';
import { OLD_CARD_TOUCH_SENTENCE, cardNeedsTouch, cardReportsNoTouch } from './cardNeedsTouch.js';
import { normalizeCardProjectEvidence } from './cardIdentity.js';
import { normalizeCardReadiness } from './cardReadiness.js';

test('only a card that reports ownerNoTouch skips the touch; everything else is an old card', () => {
  for (const noTouch of [
    { capabilities: { ownerNoTouch: 1 } },
    { capabilities: { ownerNoTouch: true } },
    { readiness: { capabilities: { ownerNoTouch: 1 } } },
    { readiness: { ownerNoTouch: true } },
    { evidence: { capabilities: { ownerNoTouch: 1 } } },
    { ownerNoTouch: 1 },
  ]) {
    assert.equal(cardReportsNoTouch(noTouch), true, JSON.stringify(noTouch));
    assert.equal(cardNeedsTouch(noTouch), false);
  }
  for (const old of [undefined, null, {}, 'x', 7, { capabilities: {} }, { capabilities: { ownerNoTouch: 0 } },
    { capabilities: { ownerNoTouch: false } }, { capabilities: { ownerNoTouch: 'yes' } }, { readiness: {} }]) {
    assert.equal(cardNeedsTouch(old), true, JSON.stringify(old));
  }
});

test('the old-card sentence says what to do, in plain words', () => {
  assert.match(OLD_CARD_TOUCH_SENTENCE, /older/);
  assert.match(OLD_CARD_TOUCH_SENTENCE, /Press any control on the card/);
});

const FIRMWARE_INFO = {
  app: 'Lightweaver', id: 'lw-b0fe81f61b44', firmwareVersion: '1.2.6', buildId: 'a'.repeat(40),
};

test('/api/firmware-info evidence keeps the flag only when the card reports it', () => {
  const reported = normalizeCardProjectEvidence({ ...FIRMWARE_INFO, capabilities: { ownerNoTouch: 1, symmetrySides: 1 } });
  assert.equal(reported.capabilities.ownerNoTouch, 1);
  assert.equal(cardNeedsTouch(reported), false);
  const old = normalizeCardProjectEvidence({ ...FIRMWARE_INFO, firmwareVersion: '1.2.5', capabilities: { symmetrySides: 1 } });
  assert.equal('ownerNoTouch' in old.capabilities, false);
  assert.equal(cardNeedsTouch(old), true);
  assert.equal(normalizeCardProjectEvidence({ ...FIRMWARE_INFO, capabilities: { ownerNoTouch: 0 } }).capabilities.ownerNoTouch, 0);
});

test('/api/status readiness carries the flag only when the card reports it', () => {
  const base = { app: 'Lightweaver', cardId: 'lw-b0fe81f61b44', firmwareVersion: '1.2.6', buildId: 'a'.repeat(40) };
  const reported = normalizeCardReadiness({ ...base, capabilities: { ownerNoTouch: 1 } });
  assert.equal(cardNeedsTouch(reported), false);
  const old = normalizeCardReadiness({ ...base, capabilities: {} });
  assert.equal('ownerNoTouch' in old, false);
  assert.equal(cardNeedsTouch(old), true);
});
