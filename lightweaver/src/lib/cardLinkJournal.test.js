import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_LINK_JOURNAL_LIMIT,
  appendCardJournalEntry,
  clearCardLinkJournal,
  formatCardLinkJournal,
  readCardLinkJournal,
  recordCardLinkTransition,
  summarizeCardLinkJournal,
} from './cardLinkJournal.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    size: () => map.size,
  };
}

const connected = { state: 'connected-bridge', reason: '', transport: 'bridge', host: 'lightweaver.local', missedPings: 0 };
const dropped = { state: 'reconnecting-bridge', reason: 'card-stopped-answering', transport: 'bridge', host: 'lightweaver.local', missedPings: 1 };

test('records a transition and reads it back', () => {
  const storage = memoryStorage();
  recordCardLinkTransition(connected, dropped, { storage, now: () => '2026-08-31T10:00:00.000Z' });
  const entries = readCardLinkJournal({ storage });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].state, 'reconnecting-bridge');
  assert.equal(entries[0].from, 'connected-bridge');
  assert.equal(entries[0].reason, 'card-stopped-answering');
});

test('a re-render that changes nothing is not an event', () => {
  const storage = memoryStorage();
  assert.equal(recordCardLinkTransition(connected, { ...connected }, { storage }), null);
  assert.equal(readCardLinkJournal({ storage }).length, 0);
});

test('a changed reason on the same state is worth recording', () => {
  const storage = memoryStorage();
  recordCardLinkTransition(dropped, { ...dropped, reason: 'card-restarted' }, { storage });
  assert.equal(readCardLinkJournal({ storage }).length, 1);
});

test('the log is bounded and drops oldest first', () => {
  const storage = memoryStorage();
  for (let i = 0; i < CARD_LINK_JOURNAL_LIMIT + 40; i += 1) {
    recordCardLinkTransition(
      { ...connected, reason: `r${i}` },
      { ...connected, reason: `r${i + 1}` },
      { storage, now: () => new Date(Date.UTC(2026, 7, 31, 0, 0, i)).toISOString() },
    );
  }
  const entries = readCardLinkJournal({ storage });
  assert.equal(entries.length, CARD_LINK_JOURNAL_LIMIT, 'never grows past the limit');
  assert.equal(entries[entries.length - 1].reason, `r${CARD_LINK_JOURNAL_LIMIT + 40}`, 'keeps the newest');
});

test('a storage that throws never breaks the caller', () => {
  const exploding = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('denied'); },
  };
  // A diagnostic that can take the app down with it is worse than no diagnostic.
  assert.doesNotThrow(() => recordCardLinkTransition(connected, dropped, { storage: exploding }));
  assert.deepEqual(readCardLinkJournal({ storage: exploding }), []);
  assert.doesNotThrow(() => clearCardLinkJournal({ storage: exploding }));
});

test('corrupt stored content reads as empty rather than throwing', () => {
  const storage = memoryStorage({ lw_card_link_journal_v1: 'not json{' });
  assert.deepEqual(readCardLinkJournal({ storage }), []);
  // and a later write still succeeds
  recordCardLinkTransition(connected, dropped, { storage });
  assert.equal(readCardLinkJournal({ storage }).length, 1);
});

test('counts the drops, which is the actual complaint', () => {
  const at = seconds => new Date(Date.UTC(2026, 7, 31, 12, 0, seconds)).toISOString();
  const entries = [
    { at: at(0), state: 'connected-bridge', reason: '' },
    { at: at(10), state: 'reconnecting-bridge', reason: 'card-stopped-answering' },
    { at: at(14), state: 'connected-bridge', reason: '' },
    { at: at(30), state: 'reconnecting-bridge', reason: 'card-stopped-answering' },
    { at: at(36), state: 'connected-bridge', reason: '' },
  ];
  const summary = summarizeCardLinkJournal(entries);
  assert.equal(summary.drops, 2);
  assert.equal(summary.lastReason, 'card-stopped-answering');
  assert.ok(summary.dropsPerHour > 0);
});

test('formats each leg with how long it was held', () => {
  const text = formatCardLinkJournal([
    { at: '2026-08-31T12:00:00.000Z', state: 'connected-bridge', reason: '', missed: 0 },
    { at: '2026-08-31T12:00:40.000Z', state: 'reconnecting-bridge', reason: 'card-stopped-answering', missed: 1 },
  ]);
  assert.match(text, /connected-bridge \(40s\)/, 'says how long the good state lasted');
  assert.match(text, /card-stopped-answering/);
  assert.match(text, /\[missed 1\]/);
});

test('an empty log says so in words rather than showing nothing', () => {
  assert.match(formatCardLinkJournal([]), /No connection changes recorded/);
});

// ── appendCardJournalEntry — the setup-journey trail's write path (H8) ──────

test('appendCardJournalEntry writes a pre-built entry into the same bounded log', () => {
  const storage = memoryStorage();
  const entry = { at: '2026-09-06T10:00:00.000Z', task: 'confirm-visible-lights', step: 'verify', cardId: 'lw-abc', bootId: 'boot-1', reason: 'link-changed' };
  const written = appendCardJournalEntry(entry, { storage });
  assert.equal(written, entry);
  const entries = readCardLinkJournal({ storage });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], entry);
});

test('appendCardJournalEntry shares the connection log\'s cap with recordCardLinkTransition', () => {
  const storage = memoryStorage();
  recordCardLinkTransition(connected, dropped, { storage, now: () => '2026-09-06T09:00:00.000Z' });
  appendCardJournalEntry(
    { at: '2026-09-06T09:00:01.000Z', task: 'confirm-visible-lights', step: 'verify', cardId: 'lw-abc', bootId: 'boot-1', reason: 'evidence-fresh' },
    { storage },
  );
  const entries = readCardLinkJournal({ storage });
  assert.equal(entries.length, 2, 'both kinds of entry land in the one journal');
});

test('appendCardJournalEntry never throws on broken storage', () => {
  const exploding = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('quota'); },
  };
  assert.doesNotThrow(() => appendCardJournalEntry({ at: 'x', task: 'connect-card' }, { storage: exploding }));
});

test('appendCardJournalEntry with no entry is a no-op', () => {
  const storage = memoryStorage();
  assert.equal(appendCardJournalEntry(null, { storage }), null);
  assert.equal(readCardLinkJournal({ storage }).length, 0);
});

test('formats a setup-journey entry by its task, not a blank connection state', () => {
  const text = formatCardLinkJournal([
    { at: '2026-09-06T10:00:00.000Z', task: 'confirm-visible-lights', step: 'verify', cardId: 'lw-abc', bootId: 'boot-1', reason: 'link-changed' },
  ]);
  assert.match(text, /setup: confirm-visible-lights/);
  assert.match(text, /link-changed/);
  assert.doesNotMatch(text, /undefined/);
});
