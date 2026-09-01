/**
 * A quiet record of every card connection state change.
 *
 * Why this exists: the owner reports "it keeps disconnecting and reconnecting"
 * hours after it happened, on a card that behaves perfectly when anyone looks
 * at it. Measured on the bench the link is clean — 150 checks, none missed —
 * so the interesting event is never happening while a developer is watching.
 * Without a record, every such report is answered with a guess.
 *
 * Design notes, all of them consequences of that:
 *
 * - It survives a reload. A drop is often the reason someone refreshes, so an
 *   in-memory log would erase the evidence at exactly the wrong moment.
 * - It is bounded and overwrites oldest-first. It runs forever on a gallery
 *   wall; it must never grow without limit or wedge on a full quota.
 * - It records TRANSITIONS, not samples. What matters is the shape of a churn
 *   — connected, reconnecting, revalidating, connected — and how long each leg
 *   took, which a periodic sample would miss entirely.
 * - It never throws. Storage can be full, disabled, or absent (a private
 *   window, an embedded webview); a diagnostic that breaks the thing it is
 *   diagnosing is worse than no diagnostic.
 * - It holds nothing sensitive: state names, a reason string, a transport, a
 *   host on the local network, and a counter.
 */

export const CARD_LINK_JOURNAL_KEY = 'lw_card_link_journal_v1';
export const CARD_LINK_JOURNAL_LIMIT = 300;

function safeRead(storage) {
  try {
    const raw = storage?.getItem(CARD_LINK_JOURNAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(storage, entries) {
  try {
    storage?.setItem(CARD_LINK_JOURNAL_KEY, JSON.stringify(entries));
  } catch {
    // A full or disabled quota must not break the link it is recording. Drop
    // the oldest half and try once; if that fails too, give up silently.
    try {
      storage?.setItem(CARD_LINK_JOURNAL_KEY, JSON.stringify(entries.slice(-Math.floor(entries.length / 2))));
    } catch {
      /* no journal is an acceptable outcome; a broken app is not */
    }
  }
}

function defaultStorage() {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Record one transition. Returns the entry written, or null when the change
 * carried nothing worth recording.
 */
export function recordCardLinkTransition(prev, next, {
  storage = defaultStorage(),
  now = () => new Date().toISOString(),
} = {}) {
  if (!next) return null;
  // Only the facts an owner's report needs to be answerable. A re-render that
  // changes neither the state nor its reason is not an event.
  const changed = !prev
    || prev.state !== next.state
    || prev.reason !== next.reason
    || prev.transport !== next.transport;
  if (!changed) return null;
  const entry = {
    at: now(),
    state: next.state || '',
    reason: next.reason || '',
    transport: next.transport || '',
    host: next.host || '',
    missed: next.missedPings || 0,
    from: prev?.state || '',
  };
  const entries = safeRead(storage);
  entries.push(entry);
  safeWrite(storage, entries.slice(-CARD_LINK_JOURNAL_LIMIT));
  return entry;
}

export function readCardLinkJournal({ storage = defaultStorage() } = {}) {
  return safeRead(storage);
}

export function clearCardLinkJournal({ storage = defaultStorage() } = {}) {
  try {
    storage?.removeItem(CARD_LINK_JOURNAL_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * The journal as something a person can read and paste into a message.
 * Each leg shows how long the link sat in that state, because "it dropped"
 * and "it dropped for 40 seconds, eleven times in an hour" are different
 * reports and only the second one is actionable.
 */
export function formatCardLinkJournal(entries = []) {
  if (!entries.length) return 'No connection changes recorded yet.';
  const lines = entries.map((entry, index) => {
    const next = entries[index + 1];
    let held = '';
    const startedAt = Date.parse(entry.at);
    const endedAt = next ? Date.parse(next.at) : NaN;
    if (Number.isFinite(startedAt) && Number.isFinite(endedAt)) {
      const seconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
      held = ` (${seconds}s)`;
    }
    const reason = entry.reason ? ` — ${entry.reason}` : '';
    const missed = entry.missed ? ` [missed ${entry.missed}]` : '';
    return `${entry.at}  ${entry.state}${reason}${held}${missed}`;
  });
  return [`Lightweaver connection log — ${entries.length} change${entries.length === 1 ? '' : 's'}`, ...lines].join('\n');
}

/**
 * The one number worth putting in front of someone: how often the link left a
 * connected state and came back. That is exactly the "disconnecting and
 * reconnecting" complaint, counted.
 */
export function summarizeCardLinkJournal(entries = []) {
  const connected = state => state === 'connected-bridge' || state === 'connected-direct';
  let drops = 0;
  let lastReason = '';
  for (let i = 1; i < entries.length; i += 1) {
    if (connected(entries[i - 1].state) && !connected(entries[i].state)) {
      drops += 1;
      lastReason = entries[i].reason || lastReason;
    }
  }
  const first = entries[0] ? Date.parse(entries[0].at) : NaN;
  const last = entries[entries.length - 1] ? Date.parse(entries[entries.length - 1].at) : NaN;
  const hours = Number.isFinite(first) && Number.isFinite(last) && last > first
    ? (last - first) / 3600000
    : 0;
  return {
    drops,
    lastReason,
    spanHours: hours,
    dropsPerHour: hours > 0 ? drops / hours : 0,
    entries: entries.length,
  };
}
