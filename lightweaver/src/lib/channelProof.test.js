import test from 'node:test';
import assert from 'node:assert/strict';

import {
  answerChannelProof,
  channelProofMap,
  channelProofSettled,
  createChannelProof,
  skippedChannelProof,
} from './channelProof.js';

test('two distinct answers finish the proof with a measured map', () => {
  const proof = answerChannelProof(answerChannelProof(createChannelProof(), 'green'), 'red');
  assert.equal(proof.stage, 'done');
  assert.equal(channelProofSettled(proof), true);
  assert.deepEqual(channelProofMap(proof), { green: 0, red: 1, blue: 2 });
});

test('the same colour twice starts over and says so', () => {
  const proof = answerChannelProof(answerChannelProof(createChannelProof(), 'red'), 'red');
  assert.deepEqual(proof, { stage: 'first', firstSeen: '', map: null, retry: true });
  assert.equal(channelProofMap(proof), null);
});

test('a skipped or unfinished proof exposes no map', () => {
  assert.equal(channelProofMap(skippedChannelProof()), null);
  assert.equal(channelProofSettled(skippedChannelProof()), true);
  assert.equal(channelProofMap(answerChannelProof(createChannelProof(), 'blue')), null);
  assert.equal(channelProofMap(null), null);
});

test('answers after the proof is settled are ignored', () => {
  const done = answerChannelProof(answerChannelProof(createChannelProof(), 'red'), 'green');
  assert.equal(answerChannelProof(done, 'blue'), done);
  const skipped = skippedChannelProof();
  assert.equal(answerChannelProof(skipped, 'blue'), skipped);
});

test('a hand-shaped object using a different field name yields no map', () => {
  // The drift guard: discoveryCommit.js once read `channelMap` while the panel
  // wrote `map`. Only the real proof shape is readable.
  assert.equal(channelProofMap({ stage: 'done', channelMap: { red: 0, green: 1, blue: 2 } }), null);
});
