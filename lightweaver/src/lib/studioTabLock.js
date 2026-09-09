// One active Studio tab per browser (F39).
//
// Adrian, verbatim: "if I have a version open and then I do another version
// open and it sometimes causes problems in between everything." Two Studio
// tabs both polling the card, both able to launch the bridge, both able to
// write — is a second, independent source of exactly the kind of cross-tab
// interference `cardWriteLease.js` already fixed for the card itself. This
// module is the same problem one layer up: not "who may write to the card
// right now" but "which browsing context is Studio allowed to be running in
// right now". Mirrors cardWriteLease's transport choice for the same reason
// it chose it — localStorage is the durable record a late-joining tab reads
// synchronously without waiting on a channel round-trip, BroadcastChannel is
// the live announcement that makes a takeover and a release feel instant.
//
// This module does not know about card polling, the bridge, or writes. It
// only answers "is this tab the active one". `src/v3/app.jsx` wires that
// answer to a hard gate: the quiet tab renders a full-screen notice and
// never mounts ProjectProvider/CloudLibraryProvider/Shell at all, so there is
// nothing left in a quiet tab to poll, bridge, or write with. The card's own
// page and the card bridge popup window are a different origin entirely
// (buildCardBridgeLaunchUrl points at the card host, not this app), so they
// never load this module and are structurally outside the lock — no
// special-casing needed here.
//
// `setBusy(true)` is how a running hardware operation (a USB firmware
// install, a preserving update) holds the lock: a takeover request arriving
// while busy is refused, so the tab actually doing the work is never quieted
// mid-operation. app.jsx wires this to the same STUDIO_HARDWARE_OPERATION_EVENT
// studioFreshness.js already listens for.

export const STUDIO_TAB_CHANNEL_NAME = 'lightweaver-studio-tab';
export const STUDIO_TAB_STORAGE_KEY = 'lw_studio_tab_lock_v1';

// Heartbeats need to land comfortably inside the TTL more than once so an
// ordinary event-loop stall (a big autosave serialize, a render) cannot make
// a live tab look dead to a quiet one racing to claim. TTL 5s / heartbeat
// 1.5s leaves three heartbeats of margin, matching the spec's "heartbeat
// expiry 5 s".
export const STUDIO_TAB_HEARTBEAT_MS = 1_500;
export const STUDIO_TAB_HEARTBEAT_TTL_MS = 5_000;

function randomTabId(cryptoApi, now) {
  const uuid = cryptoApi?.randomUUID?.();
  if (uuid) return `studio-tab-${uuid}`;
  return `studio-tab-${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validRecord(value) {
  return Boolean(value)
    && typeof value === 'object'
    && typeof value.id === 'string'
    && value.id !== ''
    && Number.isFinite(value.ts);
}

/**
 * @param dependencies.storage          localStorage-shaped store, or null
 * @param dependencies.BroadcastChannel the constructor, or null to skip it
 * @param dependencies.now              () => epoch ms
 * @param dependencies.setTimeout / clearTimeout  scheduling
 * @param dependencies.windowRef        for beforeunload/pagehide, or null
 * @param dependencies.tabId            override, for tests
 */
export function createStudioTabLock(dependencies = {}) {
  const storage = dependencies.storage === undefined ? globalThis.localStorage : dependencies.storage;
  const ChannelApi = dependencies.BroadcastChannel === undefined ? globalThis.BroadcastChannel : dependencies.BroadcastChannel;
  const now = dependencies.now || Date.now;
  const scheduleTimeout = dependencies.setTimeout || ((cb, ms) => globalThis.setTimeout(cb, ms));
  const unscheduleTimeout = dependencies.clearTimeout || (id => globalThis.clearTimeout(id));
  const windowRef = dependencies.windowRef === undefined ? globalThis.window : dependencies.windowRef;
  const heartbeatMs = dependencies.heartbeatMs || STUDIO_TAB_HEARTBEAT_MS;
  const ttlMs = dependencies.ttlMs || STUDIO_TAB_HEARTBEAT_TTL_MS;
  const tabId = dependencies.tabId || randomTabId(dependencies.crypto === undefined ? globalThis.crypto : dependencies.crypto, now);

  let status = 'pending'; // 'pending' | 'active' | 'quiet'
  let reason = '';
  let busy = false;
  let started = false;
  let heartbeatTimer = null;
  let watchTimer = null;
  let channel = null;
  const listeners = new Set();

  function readRecord() {
    try {
      const raw = storage?.getItem?.(STUDIO_TAB_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return validRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeRecord() {
    try {
      storage?.setItem?.(STUDIO_TAB_STORAGE_KEY, JSON.stringify({ id: tabId, ts: now(), busy }));
    } catch { /* private mode, quota — the channel announcement still carries it */ }
  }

  function clearRecordIfOwn() {
    const existing = readRecord();
    if (existing && existing.id === tabId) {
      try { storage?.removeItem?.(STUDIO_TAB_STORAGE_KEY); } catch { /* private mode */ }
    }
  }

  function isFresh(record, at) {
    return Boolean(record) && (at - record.ts) < ttlMs;
  }

  function announce(message) {
    try { channel?.postMessage?.(message); } catch { /* channel closed */ }
  }

  function emit() {
    const frozen = Object.freeze({ status, reason, busy, tabId });
    for (const listener of listeners) listener(frozen);
  }

  function clearHeartbeatTimer() {
    if (heartbeatTimer !== null) unscheduleTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }

  function clearWatchTimer() {
    if (watchTimer !== null) unscheduleTimeout(watchTimer);
    watchTimer = null;
  }

  function scheduleHeartbeat() {
    clearHeartbeatTimer();
    heartbeatTimer = scheduleTimeout(() => {
      heartbeatTimer = null;
      if (status !== 'active') return;
      writeRecord();
      announce({ type: 'heartbeat', id: tabId, ts: now(), busy });
      scheduleHeartbeat();
    }, heartbeatMs);
  }

  // A quiet tab has nothing telling it to re-check on its own once the
  // 'release' broadcast is missed (the active tab crashed rather than
  // unloading cleanly). This is the self-healing fallback: poll storage at
  // roughly the TTL cadence and claim the moment the record goes stale.
  function scheduleWatch() {
    clearWatchTimer();
    watchTimer = scheduleTimeout(() => {
      watchTimer = null;
      if (status !== 'quiet') return;
      if (!isFresh(readRecord(), now())) claim();
      else scheduleWatch();
    }, ttlMs);
  }

  function becomeActive() {
    clearWatchTimer();
    status = 'active';
    reason = '';
    writeRecord();
    announce({ type: 'heartbeat', id: tabId, ts: now(), busy });
    scheduleHeartbeat();
    emit();
  }

  function becomeQuiet(nextReason) {
    clearHeartbeatTimer();
    status = 'quiet';
    reason = nextReason;
    scheduleWatch();
    emit();
  }

  function claim() {
    const at = now();
    const existing = readRecord();
    if (isFresh(existing, at) && existing.id !== tabId) {
      becomeQuiet('other-tab');
      return;
    }
    becomeActive();
  }

  function onMessage(event) {
    const message = event?.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'heartbeat') {
      if (message.id === tabId) return;
      // Two tabs claimed active in the same race window. Deterministic,
      // symmetric tie-break so both sides converge on the same winner
      // without a third round-trip: the lexicographically smaller id stays.
      if (status === 'active' && message.id < tabId) becomeQuiet('other-tab');
      return;
    }
    if (message.type === 'release') {
      if (message.id === tabId) return;
      if (status === 'quiet') claim();
      return;
    }
    if (message.type === 'takeover-request') {
      if (status !== 'active' || message.from === tabId) return;
      if (busy) {
        announce({ type: 'takeover-denied', to: message.from });
        return;
      }
      clearRecordIfOwn();
      announce({ type: 'takeover-granted', to: message.from });
      becomeQuiet('moved');
      return;
    }
    if (message.type === 'takeover-granted') {
      if (message.to !== tabId) return;
      becomeActive();
      return;
    }
    // 'takeover-denied' carries nothing this module needs to act on: the
    // requester simply stays quiet, still showing the same notice.
  }

  function release() {
    if (status === 'active') {
      clearRecordIfOwn();
      announce({ type: 'release', id: tabId });
    }
    clearHeartbeatTimer();
    clearWatchTimer();
  }

  const onUnload = () => release();

  return Object.freeze({
    tabId,
    getState: () => Object.freeze({ status, reason, busy, tabId }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (started) return;
      started = true;
      if (ChannelApi) {
        try {
          channel = new ChannelApi(STUDIO_TAB_CHANNEL_NAME);
          if (channel.addEventListener) channel.addEventListener('message', onMessage);
          else channel.onmessage = onMessage;
        } catch {
          channel = null;
        }
      }
      windowRef?.addEventListener?.('beforeunload', onUnload);
      windowRef?.addEventListener?.('pagehide', onUnload);
      claim();
    },
    stop() {
      if (!started) return;
      started = false;
      release();
      windowRef?.removeEventListener?.('beforeunload', onUnload);
      windowRef?.removeEventListener?.('pagehide', onUnload);
      try {
        if (channel?.removeEventListener) channel.removeEventListener('message', onMessage);
        channel?.close?.();
      } catch { /* already closed */ }
      channel = null;
      listeners.clear();
    },
    /** A running hardware operation holds the lock: a takeover request is refused while busy. */
    setBusy(active) {
      busy = active === true;
      if (status === 'active') writeRecord();
    },
    /** The quiet tab's "Use this tab" button. */
    requestTakeover() {
      if (status === 'active') return;
      announce({ type: 'takeover-request', from: tabId });
      // The live handshake covers a genuinely active tab. If the record is
      // already stale (that tab closed or crashed and nothing here has
      // noticed yet), claim immediately rather than waiting on a message
      // that will never arrive.
      if (!isFresh(readRecord(), now())) becomeActive();
    },
  });
}

// Shared singleton, mirroring cardWriteLease.js's getCardWriteLeaseRegistry:
// `StudioTabGate` (mounted above ProjectProvider/Shell, so it can gate
// whether Shell mounts at all) and Shell (which knows the composed
// install/hardware-operation/commissioning "busy" boolean already computed
// for studioFreshness's setOperationActive) are different points in the
// component tree and need to reach the SAME lock instance without prop
// drilling it down through everything in between.
let sharedStudioTabLock = null;

export function getStudioTabLock() {
  if (!sharedStudioTabLock) sharedStudioTabLock = createStudioTabLock();
  return sharedStudioTabLock;
}

export function resetStudioTabLockForTests() {
  sharedStudioTabLock?.stop?.();
  sharedStudioTabLock = null;
}
