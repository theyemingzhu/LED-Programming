// Whether Studio, in this tab, last managed to read a card's whole look list.
//
// L1 (bench card, 2026-11-23): the look list could not be read, Studio opened
// the card's project with one look, and Card Home then said "Your draft
// matches the installed project" about a draft missing five looks. A failed
// read is remembered per card until a whole read succeeds, and while it
// stands Studio never says the draft matches.
const unreadable = new Set();
const listeners = new Set();

function notify() { for (const listener of listeners) listener(); }

export function noteCardLooksUnreadable(cardId) {
  const id = String(cardId || '').trim();
  if (!id || unreadable.has(id)) return;
  unreadable.add(id);
  notify();
}

export function noteCardLooksReadWhole(cardId) {
  const id = String(cardId || '').trim();
  if (!id || !unreadable.delete(id)) return;
  notify();
}

export function cardLooksUnreadable(cardId) {
  return unreadable.has(String(cardId || '').trim());
}

export function subscribeCardLookReadState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests. */
export function resetCardLookReadState() { unreadable.clear(); notify(); }
