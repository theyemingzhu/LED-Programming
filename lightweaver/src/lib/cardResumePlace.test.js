import test from 'node:test';
import assert from 'node:assert/strict';
import { readCardResumePlace, rememberCardResumePlace, chooseCardResumePlace } from './cardResumePlace.js';
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };

test('remembered safe place survives reload and remains specific to its card', () => {
  const store = storage();
  assert.equal(rememberCardResumePlace('lw-a', '#screen=pattern&target=run-2&project=artwork&generation=2', store), true);
  assert.equal(readCardResumePlace('lw-a', store), '#screen=pattern&target=run-2&project=artwork&generation=2');
  assert.equal(readCardResumePlace('lw-b', store), '');
});

test('setup, firmware, discovery and mutation-intent entrances are never remembered', () => {
  const store = storage();
  rememberCardResumePlace('lw-a', '#screen=playlist', store);
  for (const hash of ['#screen=card&section=setup', '#screen=card&section=install', '#screen=flash', '#screen=discovery', '#screen=layout&mode=wire', '#screen=layout&mode=install', '#screen=pattern&task=install-project', '#screen=card&section=overview&intent=update-card']) {
    assert.equal(rememberCardResumePlace('lw-a', hash, store), false, hash);
    assert.equal(readCardResumePlace('lw-a', store), '#screen=playlist');
  }
});

test('only fresh exact-card evidence on an untouched empty entry may resume', () => {
  const store = storage(); rememberCardResumePlace('lw-a', '#screen=layout&mode=draw&panel=specs', store);
  const input = { initialHash: '', currentHash: '#screen=card&section=setup', entryHash: '#screen=card&section=setup', identityVerified: true, cardId: 'lw-a', storage: store };
  assert.equal(chooseCardResumePlace(input), '#screen=layout&mode=draw&panel=specs');
  assert.equal(chooseCardResumePlace({ ...input, initialHash: '#screen=playlist' }), '');
  assert.equal(chooseCardResumePlace({ ...input, currentHash: '#screen=pattern' }), '');
  assert.equal(chooseCardResumePlace({ ...input, identityVerified: false }), '');
  assert.equal(chooseCardResumePlace({ ...input, cardId: 'lw-b' }), '');
});

test('storage failure and malformed or untrusted routes do not interrupt navigation', () => {
  const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } };
  assert.equal(readCardResumePlace('lw-a', broken), '');
  assert.equal(rememberCardResumePlace('lw-a', '#screen=card', broken), false);
  assert.equal(rememberCardResumePlace('', '#screen=pattern', storage()), false);
  const store = storage();
  assert.equal(rememberCardResumePlace('lw-a', '#screen=pattern&target=strip-1&token=secret', store), true);
  assert.equal(readCardResumePlace('lw-a', store), '#screen=pattern');
});


test('section resume keeps the existing project-generation guard required by Patterns', () => {
  const store = storage();
  rememberCardResumePlace('lw-a', '#screen=pattern&target=run-2&project=artwork&generation=2&returnStrip=private', store);
  assert.equal(readCardResumePlace('lw-a', store), '#screen=pattern&target=run-2&project=artwork&generation=2');
  rememberCardResumePlace('lw-a', '#screen=pattern&target=run-2&project=artwork&generation=unknown', store);
  assert.equal(readCardResumePlace('lw-a', store), '#screen=pattern');
});
