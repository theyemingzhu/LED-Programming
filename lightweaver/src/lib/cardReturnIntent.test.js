import test from 'node:test';
import assert from 'node:assert/strict';

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

globalThis.window = { sessionStorage: new FakeStorage() };

const {
  CARD_RETURN_INTENT_KEY,
  cardReturnDestination,
  cardReturnHashLabel,
  clearCardReturnIntent,
  isCardReturnHash,
  readCardReturnIntent,
  rememberCardReturnIntent,
  resumeDestinationHash,
} = await import('./cardReturnIntent.js');

test.beforeEach(() => { globalThis.window.sessionStorage = new FakeStorage(); });

test('only a working screen can be returned to', () => {
  for (const hash of ['#screen=pattern', '#screen=playlist', '#screen=layout&mode=draw', '#screen=show', '#screen=pattern-lab&patternId=aurora']) {
    assert.equal(isCardReturnHash(hash), true, hash);
  }
  for (const hash of ['#screen=card&section=setup', '#screen=setup', '#screen=discovery', '#screen=flash', '#v3', '', '#bridge-result?ok=1', '#screen=card']) {
    assert.equal(isCardReturnHash(hash), false, hash);
  }
});

test('the remembered hash keeps its parameters and is scoped to one card', () => {
  assert.equal(rememberCardReturnIntent({ hash: '#screen=playlist&list=evening', cardId: 'lw-A' }), true);
  assert.equal(readCardReturnIntent({ cardId: 'lw-A' }), '#screen=playlist&list=evening');
  assert.equal(readCardReturnIntent({ cardId: 'LW-a' }), '#screen=playlist&list=evening');
  assert.equal(readCardReturnIntent({ cardId: 'lw-B' }), '');
  assert.equal(readCardReturnIntent({}), '');
});

test('a card screen is never remembered as somewhere to return to', () => {
  assert.equal(rememberCardReturnIntent({ hash: '#screen=card&section=setup', cardId: 'lw-A' }), false);
  assert.equal(globalThis.window.sessionStorage.getItem(CARD_RETURN_INTENT_KEY), null);
});

test('a corrupt record answers with no destination rather than throwing', () => {
  globalThis.window.sessionStorage.setItem(CARD_RETURN_INTENT_KEY, '{not json');
  assert.equal(readCardReturnIntent({ cardId: 'lw-A' }), '');
  globalThis.window.sessionStorage.setItem(CARD_RETURN_INTENT_KEY, JSON.stringify({ hash: '#screen=card', cardId: 'lw-A' }));
  assert.equal(readCardReturnIntent({ cardId: 'lw-A' }), '');
});

test('clearing makes the intent one-use', () => {
  rememberCardReturnIntent({ hash: '#screen=layout&mode=draw', cardId: 'lw-A' });
  assert.equal(readCardReturnIntent({ cardId: 'lw-A' }), '#screen=layout&mode=draw');
  clearCardReturnIntent();
  assert.equal(readCardReturnIntent({ cardId: 'lw-A' }), '');
});

test('resumeDestination is a name until this turns it into a route', () => {
  assert.equal(resumeDestinationHash('patterns'), '#screen=pattern');
  assert.equal(resumeDestinationHash('playlist'), '#screen=playlist');
  assert.equal(resumeDestinationHash('card'), '');
  assert.equal(resumeDestinationHash(''), '');
});

test('the completion destination prefers where the owner actually was', () => {
  rememberCardReturnIntent({ hash: '#screen=playlist', cardId: 'lw-A' });
  assert.deepEqual(
    cardReturnDestination({ cardId: 'lw-A', resumeDestination: 'patterns' }),
    { hash: '#screen=playlist', label: 'Back to Playlist', source: 'remembered' },
  );

  clearCardReturnIntent();
  assert.deepEqual(
    cardReturnDestination({ cardId: 'lw-A', resumeDestination: 'patterns' }),
    { hash: '#screen=pattern', label: 'Open Patterns', source: 'journey' },
  );

  assert.deepEqual(
    cardReturnDestination({ cardId: 'lw-A', resumeDestination: null }),
    { hash: '#screen=pattern', label: 'Open Patterns', source: 'default' },
  );
});

test('screen labels are the owner-facing rail names', () => {
  assert.equal(cardReturnHashLabel('#screen=pattern-lab'), 'Lab');
  assert.equal(cardReturnHashLabel('#screen=patterns'), 'Patterns');
  assert.equal(cardReturnHashLabel('#screen=card'), '');
});
