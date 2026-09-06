import { STUDIO_BUILD_GRAPH_PATH, parseStudioBuildGraph } from './productionDeploymentCheck.js';
import { parseStudioRelease } from './studioRelease.js';
import { STUDIO_HARDWARE_OPERATION_EVENT } from './studioHardwareOperation.js';

export const STUDIO_RELEASE_PATH = '/studio-release.json';
export const STUDIO_FRESHNESS_POLL_MS = 30_000;
export const STUDIO_FRESHNESS_TIMEOUT_MS = 5_000;
export const STUDIO_REFRESH_ATTEMPT_KEY = 'lw_studio_refresh_attempt_v1';

function immutableState(status, release, reason = '') {
  return Object.freeze({
    status,
    buildId: release.buildId,
    buildNumber: release.buildNumber,
    reason,
  });
}

function boundedError(reason) {
  return Object.assign(new Error(reason), { freshnessReason: reason });
}

function hasNoStore(response) {
  return /(?:^|,)\s*no-store(?:\s*(?:,|$))/i.test(response.headers.get('cache-control') || '');
}

function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(cryptoImpl, bytes) {
  if (!cryptoImpl?.subtle?.digest) throw new Error('Web Crypto SHA-256 is unavailable');
  return bytesToHex(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes)));
}

function sameAttempt(value, from, to) {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return parsed?.from === from && parsed?.to === to;
  } catch {
    return false;
  }
}

export function createStudioFreshnessMonitor({
  release: releaseInput,
  fetchImpl = fetch,
  flushAutosave,
  reload,
  storage,
  locationOrigin,
  navigatorRef = navigator,
  documentRef = document,
  windowRef = window,
  cryptoImpl = globalThis.crypto,
  createTimeoutSignal = milliseconds => AbortSignal.timeout(milliseconds),
  timers = {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: id => globalThis.clearTimeout(id),
  },
} = {}) {
  const release = parseStudioRelease(releaseInput);
  const releaseUrl = new URL(STUDIO_RELEASE_PATH, locationOrigin).href;
  const buildGraphUrl = new URL(STUDIO_BUILD_GRAPH_PATH, locationOrigin).href;
  const listeners = new Set();
  let state = immutableState('checking', release);
  let started = false;
  // Two independent sources compose into one `operationActive` gate rather
  // than one overwriting the other. `explicitOperationActive` is whatever the
  // caller last passed to setOperationActive() — app.jsx already folds
  // install/commissioning/hardware-operation state into that single call.
  // `hardwareEventActive` is this monitor's own read of the raw
  // hardware-operation event on windowRef (see onHardwareOperationActive
  // below), so a screen only has to call beginStudioHardwareOperation on the
  // same target and never has to thread setOperationActive through at all.
  // Composing with OR means neither source can clear a deferral the other
  // still holds open — e.g. app.jsx's combined flag staying true because an
  // install is active must survive an unrelated hardware operation's own
  // "active: false" event arriving on the same target.
  let explicitOperationActive = false;
  let hardwareEventActive = false;
  let operationActive = false;
  let pendingRelease = null;
  let convergedReleaseRevision = '';
  let pollTimer = null;
  let inFlight = null;

  const emit = next => {
    state = next;
    for (const listener of listeners) listener(state);
    return state;
  };

  const unknown = reason => emit(immutableState('unknown', release, reason));

  const clearPoll = () => {
    if (pollTimer !== null) timers.clearTimeout(pollTimer);
    pollTimer = null;
  };

  const schedulePoll = () => {
    clearPoll();
    if (!started || documentRef.visibilityState !== 'visible') return;
    pollTimer = timers.setTimeout(async () => {
      pollTimer = null;
      await checkNow();
      schedulePoll();
    }, STUDIO_FRESHNESS_POLL_MS);
  };

  const refreshTo = target => {
    const from = release.sourceRevision;
    const to = target.sourceRevision;
    let previous;
    try {
      previous = storage.getItem(STUDIO_REFRESH_ATTEMPT_KEY);
    } catch {
      unknown('storage');
      return;
    }
    if (sameAttempt(previous, from, to)) {
      unknown('reload-loop');
      return;
    }

    let saved = false;
    try {
      saved = flushAutosave() === true;
    } catch {
      saved = false;
    }
    if (!saved) {
      unknown('autosave');
      return;
    }

    try {
      storage.setItem(STUDIO_REFRESH_ATTEMPT_KEY, JSON.stringify({ from, to }));
    } catch {
      unknown('storage');
      return;
    }
    try {
      reload();
    } catch {
      unknown('reload');
    }
  };

  const acceptRelease = target => {
    if (target.sourceRevision === release.sourceRevision) {
      pendingRelease = null;
      convergedReleaseRevision = '';
      try { storage.removeItem(STUDIO_REFRESH_ATTEMPT_KEY); } catch { /* matching code needs no reload guard */ }
      return emit(immutableState('current', release));
    }
    if (operationActive) {
      pendingRelease = target;
      return emit(immutableState('update-ready', target, 'operation-active'));
    }
    pendingRelease = null;
    refreshTo(target);
    return state;
  };

  const requireConvergedRelease = async markerText => {
    try {
      const graphResponse = await fetchImpl(buildGraphUrl, {
        cache: 'no-store',
        redirect: 'manual',
        signal: createTimeoutSignal(STUDIO_FRESHNESS_TIMEOUT_MS),
      });
      if (graphResponse.status !== 200 || graphResponse.redirected === true || !hasNoStore(graphResponse)) {
        throw new Error('The current Studio build graph is unavailable or cacheable');
      }
      const graph = parseStudioBuildGraph(await graphResponse.text());
      const markerEntry = graph.files.find(file => file.path === STUDIO_RELEASE_PATH.slice(1));
      const markerBytes = new TextEncoder().encode(markerText);
      if (!markerEntry
        || markerEntry.bytes !== markerBytes.byteLength
        || markerEntry.sha256 !== await sha256Hex(cryptoImpl, markerBytes)) {
        throw new Error('The Studio build graph does not describe the current release marker');
      }

      const assetEntries = graph.files.filter(file => /^assets\/.*\.(?:js|css)$/.test(file.path));
      await Promise.all(assetEntries.map(async entry => {
        const assetUrl = new URL(entry.path, `${new URL(locationOrigin).origin}/`).href;
        const assetResponse = await fetchImpl(assetUrl, {
          cache: 'no-store',
          redirect: 'manual',
          signal: createTimeoutSignal(STUDIO_FRESHNESS_TIMEOUT_MS),
        });
        if (!assetResponse.ok || assetResponse.redirected === true) {
          throw new Error(`Studio asset is not ready: ${entry.path}`);
        }
      }));
    } catch {
      throw boundedError('convergence');
    }
  };

  const checkNow = () => {
    if (inFlight) return inFlight;
    if (navigatorRef.onLine === false) return Promise.resolve(unknown('offline'));
    inFlight = (async () => {
      let response;
      try {
        response = await fetchImpl(releaseUrl, {
          cache: 'no-store',
          redirect: 'manual',
          signal: createTimeoutSignal(STUDIO_FRESHNESS_TIMEOUT_MS),
        });
      } catch {
        throw boundedError('request');
      }
      if (response.status !== 200 || response.redirected === true) throw boundedError('response');
      if (!hasNoStore(response)) throw boundedError('cache');
      let target;
      let markerText;
      try {
        markerText = await response.text();
        target = parseStudioRelease(markerText);
      } catch {
        throw boundedError('invalid');
      }
      if (target.sourceRevision !== release.sourceRevision) {
        if (convergedReleaseRevision !== target.sourceRevision) {
          convergedReleaseRevision = '';
          await requireConvergedRelease(markerText);
          convergedReleaseRevision = target.sourceRevision;
        }
      }
      return acceptRelease(target);
    })()
      .catch(error => unknown(error?.freshnessReason || 'request'))
      .finally(() => { inFlight = null; });
    return inFlight;
  };

  const onFocus = () => { void checkNow(); };
  const onOnline = () => { void checkNow(); };
  const onVisibilityChange = () => {
    schedulePoll();
    if (documentRef.visibilityState === 'visible') void checkNow();
  };

  // Recomputes the composed gate and, only on a true→false edge with a
  // deferred target waiting, clears it and re-checks — always re-obtaining a
  // fresh convergence proof before reloading (never trusting a pending target
  // frozen from before the operation started).
  const applyOperationActive = () => {
    const next = explicitOperationActive || hardwareEventActive;
    operationActive = next;
    if (!operationActive && pendingRelease) {
      pendingRelease = null;
      convergedReleaseRevision = '';
      return checkNow();
    }
    return Promise.resolve(state);
  };

  const setOperationActive = active => {
    explicitOperationActive = active === true;
    return applyOperationActive();
  };

  // The monitor observes its own hardware-operation lifecycle directly on
  // windowRef rather than requiring every caller to thread setOperationActive
  // through — a screen that starts protected work only has to call
  // beginStudioHardwareOperation/withStudioHardwareOperation on the same
  // target this monitor was constructed with.
  const onHardwareOperationActive = event => {
    hardwareEventActive = event?.detail?.active === true;
    void applyOperationActive();
  };

  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (started) return checkNow();
      started = true;
      windowRef.addEventListener('focus', onFocus);
      windowRef.addEventListener('online', onOnline);
      windowRef.addEventListener(STUDIO_HARDWARE_OPERATION_EVENT, onHardwareOperationActive);
      documentRef.addEventListener('visibilitychange', onVisibilityChange);
      schedulePoll();
      return checkNow();
    },
    stop() {
      if (!started) return;
      started = false;
      clearPoll();
      windowRef.removeEventListener('focus', onFocus);
      windowRef.removeEventListener('online', onOnline);
      windowRef.removeEventListener(STUDIO_HARDWARE_OPERATION_EVENT, onHardwareOperationActive);
      documentRef.removeEventListener('visibilitychange', onVisibilityChange);
      listeners.clear();
    },
    checkNow,
    setOperationActive,
  });
}
