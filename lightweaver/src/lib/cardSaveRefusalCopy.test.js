import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_DID_NOT_ANSWER_MESSAGE, cardConfigRefusalMessage } from './cardPushClient.js';
import { isTransientCardFailure } from './cardTransientFailure.js';

// The exact reply the real card lw-b0fe81f61b44 gave to a project save on
// 2026-11-19. Studio printed it verbatim under "would not take this setup".
const REAL_NVS_REPLY = '{"ok":false,"error":"nvs write failed; previous project remains intact and runtime unchanged"}';

test('a full card is explained in words an owner can act on, with no raw reply', () => {
  const message = cardConfigRefusalMessage(400, REAL_NVS_REPLY);
  assert.match(message, /no room to store this project/);
  assert.match(message, /kept the one it already had/);
  assert.match(message, /Remove a look from the playlist, then save again\./);
  assert.doesNotMatch(message, /nvs|\{|card returned|400/);
  assert.match(cardConfigRefusalMessage(400, '{"ok":false,"error":"config too large for card storage (4100 bytes, max 3968)"}'), /no room to store/);
});

test('any other refusal quotes what the card said, never the raw envelope', () => {
  assert.equal(
    cardConfigRefusalMessage(400, '{"ok":false,"error":"output pin 99 is not available"}'),
    'The card did not accept this project. It said: output pin 99 is not available',
  );
  assert.match(cardConfigRefusalMessage(404, ''), /did not accept this project \(code 404\)/);
});

test('a refusal is never classified as a passing moment, and an unanswered save still is', () => {
  const refusal = Object.assign(new Error(cardConfigRefusalMessage(400, REAL_NVS_REPLY)), { code: 'http', status: 400 });
  assert.equal(isTransientCardFailure(refusal), false);
  assert.doesNotMatch(CARD_DID_NOT_ANSWER_MESSAGE, /https?:\/\//);
  assert.equal(isTransientCardFailure(Object.assign(new Error(CARD_DID_NOT_ANSWER_MESSAGE), { reason: 'offline' })), true);
});
