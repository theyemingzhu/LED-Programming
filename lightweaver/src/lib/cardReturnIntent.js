// Where the owner was working when the card interrupted them.
//
// `deriveSetupJourney` has produced `resumeDestination: 'patterns'` on
// completion since it was written, and nothing ever read it: Setup's
// completion button hard-coded `#screen=pattern`. So an owner who was building
// a playlist, hit a card problem, followed the chip into Setup and finished it
// was handed Patterns — a screen they had not asked for — and had to find their
// way back by hand.
//
// The intent is recorded when a card flow is entered FROM a working screen, and
// spent once when Setup finishes. It lives in sessionStorage because it belongs
// to this visit, not to this browser: a return intent surviving a week is a
// stale instruction, not a courtesy. There is deliberately no timer and no
// automatic navigation — the owner presses the button, and the button names
// where it goes.

export const CARD_RETURN_INTENT_KEY = 'lw_card_return_intent_v1';

// The screens an owner can be sent back TO. `card` is never one of them: the
// card workspace is what they are returning FROM, and a return intent naming it
// is a loop. Neither is `discovery` (somewhere a blank card is sent, not a
// place the owner browses to) nor any legacy alias that resolves to the card.
const RETURN_SCREENS = Object.freeze({
  pattern: 'Patterns',
  patterns: 'Patterns',
  'pattern-lab': 'Lab',
  playlist: 'Playlist',
  layout: 'Layout',
  show: 'Show',
});

function hashScreen(hash) {
  const body = String(hash || '').replace(/^#/, '');
  if (!body.includes('=')) return '';
  return String(new URLSearchParams(body).get('screen') || '').trim().toLowerCase();
}

export function isCardReturnHash(hash) {
  return Object.hasOwn(RETURN_SCREENS, hashScreen(hash));
}

export function cardReturnHashLabel(hash) {
  return RETURN_SCREENS[hashScreen(hash)] || '';
}

function store() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    // A browser with site data blocked. Everything below degrades to "no
    // remembered destination", which is the pre-existing behaviour.
    return null;
  }
}

function identity(value) {
  return String(value || '').trim().toLowerCase();
}

export function rememberCardReturnIntent({ hash, cardId } = {}) {
  const value = String(hash || '').trim();
  if (!isCardReturnHash(value)) return false;
  const storage = store();
  if (!storage) return false;
  try {
    storage.setItem(CARD_RETURN_INTENT_KEY, JSON.stringify({
      hash: value.startsWith('#') ? value : `#${value}`,
      cardId: identity(cardId),
    }));
    return true;
  } catch {
    return false;
  }
}

// A read, not a spend. The completion button needs the destination to NAME
// itself before it is pressed; `clearCardReturnIntent` is what makes it
// one-use, and it runs when the owner actually goes there.
export function readCardReturnIntent({ cardId } = {}) {
  const storage = store();
  if (!storage) return '';
  let record = null;
  try {
    record = JSON.parse(storage.getItem(CARD_RETURN_INTENT_KEY) || 'null');
  } catch {
    record = null;
  }
  if (!record || typeof record !== 'object') return '';
  if (!isCardReturnHash(record.hash)) return '';
  // Scoped to the card whose flow interrupted the owner. Returning somebody
  // to a screen they were on for a DIFFERENT card is a guess, and the plain
  // default (Patterns) is the better answer than a wrong specific one.
  const scope = identity(record.cardId);
  if (scope && scope !== identity(cardId)) return '';
  return String(record.hash);
}

export function clearCardReturnIntent() {
  const storage = store();
  if (!storage) return;
  try {
    storage.removeItem(CARD_RETURN_INTENT_KEY);
  } catch {
    // Nothing to forget.
  }
}

// `resumeDestination` is a name ('patterns'), not a hash. This is the one place
// that turns it into a route.
export function resumeDestinationHash(resumeDestination) {
  const key = identity(resumeDestination);
  if (!key) return '';
  return Object.hasOwn(RETURN_SCREENS, key) ? `#screen=${key === 'patterns' ? 'pattern' : key}` : '';
}

// Where a finished setup sends the owner, and what the button says.
//   1. where they actually were when the card interrupted them,
//   2. else the journey's own resume destination,
//   3. else Patterns, which is what this button has always done.
export function cardReturnDestination({ cardId, resumeDestination, fallbackHash = '#screen=pattern' } = {}) {
  const remembered = readCardReturnIntent({ cardId });
  if (remembered) {
    return { hash: remembered, label: `Back to ${cardReturnHashLabel(remembered)}`, source: 'remembered' };
  }
  const resumed = resumeDestinationHash(resumeDestination);
  if (resumed) {
    return { hash: resumed, label: `Open ${cardReturnHashLabel(resumed)}`, source: 'journey' };
  }
  return {
    hash: fallbackHash,
    label: `Open ${cardReturnHashLabel(fallbackHash) || 'Patterns'}`,
    source: 'default',
  };
}
