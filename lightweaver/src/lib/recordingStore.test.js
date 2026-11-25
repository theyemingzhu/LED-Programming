import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingStoreWords } from './recordingStore.js';

test('names the store the connected card reports, and nothing when it does not say', () => {
  assert.equal(recordingStoreWords({ capabilities: { recordedMediaStore: 'sd' } }), 'microSD');
  assert.equal(recordingStoreWords({ capabilities: { recordedMediaStore: 'flash' } }), 'card memory');
  assert.equal(recordingStoreWords({ capabilities: { recordedMediaStore: 'none' } }), 'no recording room on this card');
  assert.equal(recordingStoreWords({ capabilities: {} }), '');
  assert.equal(recordingStoreWords(null), '');
});
