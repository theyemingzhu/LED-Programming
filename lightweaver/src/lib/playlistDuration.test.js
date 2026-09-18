import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPlaylistLengthMinutes,
  parsePlaylistLengthMinutes,
} from './playlistDuration.js';

test('formats stored playlist seconds as compact decimal minutes', () => {
  assert.equal(formatPlaylistLengthMinutes(30), '0.5');
  assert.equal(formatPlaylistLengthMinutes(90), '1.5');
  assert.equal(formatPlaylistLengthMinutes(37), '0.62');
  assert.equal(formatPlaylistLengthMinutes(3600), '60');
});

test('parses decimal playlist minutes to bounded integer seconds', () => {
  assert.deepEqual(parsePlaylistLengthMinutes('1.5'), { ok: true, seconds: 90 });
  assert.deepEqual(parsePlaylistLengthMinutes('0.02'), { ok: true, seconds: 1 });
  assert.deepEqual(parsePlaylistLengthMinutes('60'), { ok: true, seconds: 3600 });
  assert.deepEqual(parsePlaylistLengthMinutes('100'), { ok: true, seconds: 3600 });
});

test('rejects blank, non-numeric, zero, and negative minute drafts', () => {
  for (const draft of ['', '   ', 'not-a-number', '0', '-1']) {
    assert.deepEqual(parsePlaylistLengthMinutes(draft), { ok: false });
  }
});
