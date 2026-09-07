// One write owner per card, across tabs.
//
// `studioHardwareOperation.js` already serialises hardware work *inside* one
// Studio tab (a WeakMap registry on `window`, so it can only ever see its own
// page). Two tabs are two independent React instances, and until this module
// existed nothing told either one about the other: both could take
// CardPushControl's direct-apply branch and POST /api/config at the same
// physical card, each reporting a clean install. See the blueprint's
// transition rule — "a second tab or browser must acquire the existing
// appropriate authority; it cannot silently race a configuration/update
// writer" (docs/plans/2026-09-05-unified-card-journey.md).
//
// This is deliberately NOT `productionCardLease.js`. That one is an in-memory
// snapshot of a *card link's* identity (card id, boot, bridge lifecycle,
// signed firmware) captured for the duration of one operation so the operation
// can refuse to continue if the card underneath it changed. It answers "is
// this still the same card?". This module answers a different question — "is
// another browser tab already writing to it?" — which needs cross-context
// storage and a channel, and has no opinion about identity beyond the key.
// Mirroring its vocabulary (capture → assert → release, an opaque frozen
// record) rather than extending it keeps each answering one question.
//
// Transport, in the order it is consulted:
//   1. `localStorage` — the durable record. Survives a tab that is merely
//      busy, and is what a tab reads the instant it wants to write.
//   2. `BroadcastChannel` — the live announcement. Covers the case where the
//      record is not readable (another context cleared storage, private mode,
//      a quota failure), because a live holder keeps announcing while it
//      holds.
// Both are best-effort and either alone is enough to see a conflict. Neither
// is trusted past `expiresAt`: a tab that crashes mid-write stops renewing,
// and the next tab takes the lease over once the record has lapsed. That is
// the only takeover path — a live holder is never evicted on a timer alone.

export const CARD_WRITE_LEASE_STORAGE_KEY = 'lw_card_write_lease_v1';
export const CARD_WRITE_LEASE_CHANNEL = 'lw-card-write-lease';

// Short enough that a crashed or closed tab stops blocking almost at once,
// long enough that an ordinary event-loop stall inside a write cannot make a
// live holder look dead. Renewal runs at roughly a third of it, so two missed
// renewals still leave the lease held.
export const CARD_WRITE_LEASE_TTL_MS = 3_000;
export const CARD_WRITE_LEASE_RENEW_MS = 900;

const OPERATION_LABELS = Object.freeze({
  'install-project': 'installing a project on this card',
  'activate-wiring': 'running this card’s light test',
  'finish-wiring': 'finishing this card’s light test',
  'clear-project': 'clearing this card’s project',
  'firmware-update': 'updating this card’s firmware',
});

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function cardWriteLeaseKey(card) {
  const value = typeof card === 'string' ? card : (card?.cardId || card?.id || card?.host || '');
  return text(value).toLowerCase();
}

export function describeCardWriteOperation(operation) {
  const key = text(operation);
  return OPERATION_LABELS[key] || 'writing to this card';
}

/**
 * The one sentence the conflict panel shows. It names the operation the other
 * tab is running — a generic "busy" would leave the owner guessing which of
 * their tabs to go and look at — and says how the block ends. There is no
 * automatic retry behind it on purpose: silently retrying is how the same
 * command reaches a card twice.
 */
export function describeCardWriteConflict(conflict) {
  return `Another Studio tab is ${describeCardWriteOperation(conflict?.operation)}. `
    + 'Try again when the other tab finishes.';
}

function validRecord(value) {
  return Boolean(value)
    && typeof value === 'object'
    && text(value.cardId) !== ''
    && text(value.operation) !== ''
    && text(value.tabId) !== ''
    && Number.isFinite(value.startedAt)
    && Number.isFinite(value.expiresAt);
}

function freezeRecord(record) {
  return Object.freeze({
    cardId: record.cardId,
    operation: record.operation,
    tabId: record.tabId,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
  });
}

function randomTabId(cryptoApi) {
  const uuid = cryptoApi?.randomUUID?.();
  if (uuid) return `tab-${uuid}`;
  return `tab-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * @param dependencies.storage        a `localStorage`-shaped store, or null
 * @param dependencies.BroadcastChannel  the constructor, or null to skip it
 * @param dependencies.now            () => epoch ms
 * @param dependencies.setInterval / clearInterval  renewal scheduling
 * @param dependencies.tabId          override, for tests
 */
export function createCardWriteLeaseRegistry(dependencies = {}) {
  const storage = dependencies.storage === undefined ? globalThis.localStorage : dependencies.storage;
  const ChannelApi = dependencies.BroadcastChannel === undefined
    ? globalThis.BroadcastChannel
    : dependencies.BroadcastChannel;
  const now = dependencies.now || Date.now;
  const schedule = dependencies.setInterval || globalThis.setInterval;
  const unschedule = dependencies.clearInterval || globalThis.clearInterval;
  const ttlMs = dependencies.ttlMs || CARD_WRITE_LEASE_TTL_MS;
  const renewMs = dependencies.renewMs || CARD_WRITE_LEASE_RENEW_MS;
  const tabId = dependencies.tabId || randomTabId(dependencies.crypto === undefined ? globalThis.crypto : dependencies.crypto);

  // What this tab holds, keyed by card. `count` makes a same-tab re-entry
  // (a retry inside an operation, or a nested hardware step) safe: an inner
  // release must not drop the outer hold.
  const held = new Map();
  // What other tabs have announced. Kept separately from storage so a holder
  // that cannot write storage is still visible, and so a `released` message
  // takes effect immediately rather than at the next storage read.
  const remote = new Map();
  let renewTimer = null;
  let channel = null;

  function readStored() {
    try {
      const raw = storage?.getItem?.(CARD_WRITE_LEASE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return validRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeStored(record) {
    try { storage?.setItem?.(CARD_WRITE_LEASE_STORAGE_KEY, JSON.stringify(record)); } catch { /* private mode */ }
  }

  function clearStored(cardId) {
    const stored = readStored();
    if (stored && (stored.cardId !== cardId || stored.tabId !== tabId)) return;
    try { storage?.removeItem?.(CARD_WRITE_LEASE_STORAGE_KEY); } catch { /* private mode */ }
  }

  function announce(message) {
    try { channel?.postMessage?.(message); } catch { /* channel closed */ }
  }

  function receive(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'released') {
      const key = cardWriteLeaseKey(message.cardId);
      const known = remote.get(key);
      if (known && known.tabId === text(message.tabId)) remote.delete(key);
      return;
    }
    if (message.type !== 'held' || !validRecord(message.record)) return;
    if (message.record.tabId === tabId) return;
    remote.set(message.record.cardId, freezeRecord(message.record));
  }

  if (ChannelApi) {
    try {
      channel = new ChannelApi(CARD_WRITE_LEASE_CHANNEL);
      if (channel.addEventListener) channel.addEventListener('message', event => receive(event?.data));
      else channel.onmessage = event => receive(event?.data);
    } catch {
      channel = null;
    }
  }

  /** The record blocking `cardId` right now, or null. Never this tab's own. */
  function readOwner(card, at = now()) {
    const key = cardWriteLeaseKey(card);
    if (!key) return null;
    const candidates = [readStored(), remote.get(key)]
      .filter(record => validRecord(record)
        && cardWriteLeaseKey(record.cardId) === key
        && record.tabId !== tabId
        && record.expiresAt > at);
    if (!candidates.length) return null;
    // The furthest-out expiry is the freshest heartbeat, so it is the holder
    // most likely still alive.
    return freezeRecord(candidates.reduce((a, b) => (b.expiresAt > a.expiresAt ? b : a)));
  }

  function renewAll() {
    const at = now();
    for (const entry of held.values()) {
      entry.record = freezeRecord({ ...entry.record, expiresAt: at + ttlMs });
      // Rewritten every renewal, not only on acquire: another context can
      // clear this origin's storage underneath a live holder (a second tab
      // seeding itself does exactly that), and a lease that vanished mid-write
      // would let the next tab through.
      writeStored(entry.record);
      announce({ type: 'held', record: entry.record });
    }
    if (!held.size) stopRenewing();
  }

  function startRenewing() {
    if (renewTimer !== null || !schedule) return;
    renewTimer = schedule(renewAll, renewMs);
    renewTimer?.unref?.();
  }

  function stopRenewing() {
    if (renewTimer === null) return;
    unschedule?.(renewTimer);
    renewTimer = null;
  }

  function release(key) {
    const entry = held.get(key);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    held.delete(key);
    clearStored(key);
    announce({ type: 'released', cardId: key, tabId });
    if (!held.size) stopRenewing();
  }

  /**
   * Take write ownership of `cardId` for `operation`.
   * @returns {{ok: true, lease: object, release: function}}
   *        | {{ok: false, conflict: object, message: string}}
   */
  function acquire({ cardId, operation } = {}) {
    const key = cardWriteLeaseKey(cardId);
    const job = text(operation) || 'card-write';
    if (!key) {
      // Nothing to key a lease on. Refusing here would block every write on a
      // card Studio cannot name yet, which is worse than the race this module
      // prevents; the caller's own identity gates still apply.
      return { ok: true, lease: null, release: () => {} };
    }
    const at = now();
    const conflict = readOwner(key, at);
    if (conflict) return { ok: false, conflict, message: describeCardWriteConflict(conflict) };

    const existing = held.get(key);
    if (existing) {
      existing.count += 1;
      existing.record = freezeRecord({ ...existing.record, operation: job, expiresAt: at + ttlMs });
    } else {
      held.set(key, {
        count: 1,
        record: freezeRecord({ cardId: key, operation: job, tabId, startedAt: at, expiresAt: at + ttlMs }),
      });
    }
    const entry = held.get(key);
    writeStored(entry.record);
    announce({ type: 'held', record: entry.record });
    startRenewing();

    let releasedOnce = false;
    return {
      ok: true,
      lease: entry.record,
      release() {
        if (releasedOnce) return;
        releasedOnce = true;
        release(key);
      },
    };
  }

  return {
    tabId,
    acquire,
    readOwner,
    renew: renewAll,
    holds: card => held.has(cardWriteLeaseKey(card)),
    close() {
      stopRenewing();
      for (const key of [...held.keys()]) {
        held.delete(key);
        clearStored(key);
        announce({ type: 'released', cardId: key, tabId });
      }
      try { channel?.close?.(); } catch { /* already closed */ }
      channel = null;
      remote.clear();
    },
  };
}

let sharedRegistry = null;

export function getCardWriteLeaseRegistry() {
  if (!sharedRegistry) {
    sharedRegistry = createCardWriteLeaseRegistry();
    // A tab that goes away must not keep the card locked for a whole TTL.
    globalThis.addEventListener?.('pagehide', () => sharedRegistry?.close?.());
  }
  return sharedRegistry;
}

export function acquireCardWriteLease(request) {
  return getCardWriteLeaseRegistry().acquire(request);
}

export function readCardWriteOwner(cardId) {
  return getCardWriteLeaseRegistry().readOwner(cardId);
}

export function resetCardWriteLeaseRegistryForTests() {
  sharedRegistry?.close?.();
  sharedRegistry = null;
}
