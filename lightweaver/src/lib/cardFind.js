import {
  canPushDirectlyToCard,
  candidateCardHosts,
  isLocalCardHost,
  normalizeCardHost,
  readStoredCardHost,
  readStoredCardHostHistory,
  sweepKnownSubnetsForCard,
  DEFAULT_CARD_HOST,
} from './cardConnection.js';
import { cardIdentityForgotAfter, normalizeCardIdentity, readPersistedCardIdentity } from './cardIdentity.js';
import { getCardBridgeState, sendCardBridgeRequest, startCardBridgeSearch } from './cardBridge.js';
import { classifyCardReadiness } from './cardReadiness.js';
import { getCardLinkState, getSharedCardLink, isCardLinkConnected, reportCardStatusEnvelope, reportDirectCardStatus } from './cardLink.js';
import { activateCardTransport, probeCardTransport } from './cardTransport.js';
import { pairDiscoveredCard } from './cardPairing.js';
import { allowLanProbes, getActiveUsbInspection } from './usbInspection.js';

export const CARD_FIND_TIMEOUT_MS = 45_000;
export const CARD_FIND_HANDOFF_TIMEOUT_MS = 240_000;
const DIRECT_PROBE_MS = 6_000;
const CARD_PAGE_HOST_MS = 12_000;
let activeSearch;

export function bestKnownHost(link = {}) {
  const paired = readPersistedCardIdentity();
  const candidates = [paired?.address, readStoredCardHost(), link.host]
    .map(value => value ? normalizeCardHost(value) : '')
    .filter(value => value && value !== '192.168.4.1' && isLocalCardHost(value));
  const stationIp = candidates.find(value => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value));
  return stationIp || candidates[0] || DEFAULT_CARD_HOST;
}

function pauseForCard(ms, signal) {
  if (signal.aborted) return Promise.resolve();
  const win = typeof window === 'undefined' ? null : window;
  return new Promise(resolve => {
    function wake() {
      clearTimeout(timer);
      signal.removeEventListener('abort', wake);
      win?.removeEventListener?.('online', wake);
      resolve();
    }
    const timer = setTimeout(wake, ms);
    signal.addEventListener('abort', wake, { once: true });
    win?.addEventListener?.('online', wake, { once: true });
  });
}

function needsHandoffWindow(link, host, expected) {
  return Boolean(link.handoffCorrelation
    || ['wifi-network-switch', 'card-restarting'].includes(link.reason)
    || host === '192.168.4.1'
    || (expected?.id && (/^\d+\./.test(expected.address || '') || /^\d+\./.test(host))));
}

function connectionFailure(evidence, popupUnavailable) {
  if (evidence?.reason === 'wrong-card') {
    return { ...evidence, ok: false, message: `Wrong card: expected ${evidence.expectedCardId}, but found ${evidence.observedCardId || 'another Lightweaver'}. Writes remain blocked.` };
  }
  if (evidence?.reason === 'firmware-incompatible') {
    return { ...evidence, ok: false, message: 'This card answered, but its firmware cannot provide the safety evidence Studio needs. Update this card to continue.' };
  }
  return {
    ok: false,
    reason: 'not-found',
    message: popupUnavailable
      ? 'No reply from the card. Check its power and Wi-Fi, allow local network access, or allow the card page to open.'
      : 'No reply from the card. Check its power and that this device is on the card’s Wi-Fi, then try again.',
  };
}

function freshCardFound(card, host, how, readiness) {
  return { ok: true, connected: false, how: 'found-unpaired', transport: how, card, host, readiness };
}

/**
 * One user-initiated search, with one deadline and one accepted route. Direct
 * probes are read-only until a matching winner is selected, and a card page
 * earns its place with the same exact status evidence rather than a tab-open.
 */
export async function findAndConnectCard({
  link = {},
  preferredHost = '',
  exactHost = false,
  bridgeFirst = false,
  pair = false,
  onProgress = () => {},
  signal,
  timeoutMs,
  retryDelayMs,
} = {}) {
  activeSearch?.abort();
  if (signal?.aborted) return { ok: false, reason: 'cancelled' };
  if (getActiveUsbInspection()) return { ok: false, reason: 'usb-inspection', message: 'Finish the USB inspection before connecting over Wi-Fi.' };
  if (pair && link.discoveredCard?.id) {
    onProgress('Pairing this card…');
    const paired = await pairDiscoveredCard(link, { signal });
    return paired.ok
      ? { ok: true, connected: true, how: 'paired' }
      : { ok: false, reason: paired.reason, message: paired.message };
  }
  const persistedCard = readPersistedCardIdentity();
  const expectedCard = persistedCard || link.expectedCard || link.card || null;
  const expectedCardId = expectedCard?.id || '';
  const host = preferredHost ? normalizeCardHost(preferredHost) : bestKnownHost(link);
  if (!isLocalCardHost(host)) return { ok: false, reason: 'invalid-host', message: 'Enter a valid local Lightweaver hostname.' };
  const live = getCardLinkState();
  if (!bridgeFirst && expectedCardId && isCardLinkConnected(live) && live.card?.id === expectedCardId
    && (!exactHost || normalizeCardHost(live.host) === host)) {
    return { ok: true, connected: true, how: live.transport, card: live.card, host: live.host };
  }

  const search = new AbortController();
  activeSearch = search;
  const abort = () => search.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const stopped = search.signal;
  const start = Date.now();
  const selectionStillCurrent = () => !getActiveUsbInspection()
    && !cardIdentityForgotAfter(start)
    && (readPersistedCardIdentity()?.id || '') === (persistedCard?.id || '')
    && (!expectedCardId || !getCardLinkState().expectedCard?.id
      || expectedCardId === getCardLinkState().expectedCard.id);
  const current = () => !stopped.aborted && selectionStillCurrent();
  const win = typeof window === 'undefined' ? null : window;
  let timer;
  const scheduleEnd = ms => {
    clearTimeout(timer);
    timer = setTimeout(abort, Math.max(0, start + ms - Date.now()));
  };
  const networkChanged = () => {
    if (timeoutMs == null) scheduleEnd(CARD_FIND_HANDOFF_TIMEOUT_MS);
  };
  scheduleEnd(timeoutMs ?? (needsHandoffWindow(link, host, expectedCard) || win?.navigator?.onLine === false
    ? CARD_FIND_HANDOFF_TIMEOUT_MS
    : CARD_FIND_TIMEOUT_MS));
  win?.addEventListener?.('offline', networkChanged);

  let stationHostFromExactCard = '';
  const eligibleHosts = () => {
    if (exactHost) return [host];
    // Follow a fresh station address for the same persisted card after an
    // independent verified handoff, while retaining known returning routes.
    const latest = readPersistedCardIdentity();
    return [...new Set([stationHostFromExactCard, host, ...candidateCardHosts(host, latest || expectedCard)].filter(Boolean))];
  };
  let observedFailure;
  let winner;
  let bridgeSearch;
  const saveFailure = result => {
    if (!current() || !['wrong-card', 'firmware-incompatible'].includes(result?.reason)) return;
    if (!observedFailure || result.reason === 'wrong-card') observedFailure = result;
  };
  const finish = (result, keepPage = false) => {
    if (winner) return winner;
    winner = result;
    bridgeSearch?.finish(keepPage);
    abort();
    return result;
  };
  const finishVerifiedBridge = active => {
    const bridge = getCardBridgeState();
    const status = active.readiness;
    const bootId = active.validatedBootId;
    if (!expectedCardId || active.state !== 'connected-bridge' || active.card?.id !== expectedCardId
      || active.host !== bridge.host || (exactHost && active.host !== host)
      || !bootId || status?.bootId !== bootId || status?.cardId !== expectedCardId
      || !bridge.connected || !bridge.verified || !bridge.identityVerified
      || bridge.card?.id !== expectedCardId || active.bridgeLifecycle !== bridge.lifecycle
      || (active.handoffCorrelation ? !active.handoffStationVerified : !bridgeSearch?.current())) return;
    return finish({ ok: true, connected: true, how: 'card-page', host: active.host, card: active.card }, true);
  };
  const settleDirect = probe => {
    if (!current() || winner) return;
    // An explicit card-page choice (in particular the setup AP) gives that
    // page time to open and verify before a direct answer can close it.
    if (bridgeFirst && bridgeSearch?.current() && Date.now() - start < CARD_PAGE_HOST_MS) return;
    const station = probe.readiness?.wifi;
    const stationHost = station?.stationIp || station?.ip;
    if (expectedCardId && station?.transport === 'station' && station.transition === 'station'
      && station.transitionPending === false && stationHost && isLocalCardHost(stationHost)) {
      stationHostFromExactCard = normalizeCardHost(stationHost);
    }
    // An armed Wi-Fi commissioning handoff owns this transition and the card
    // page's ack. An ordinary direct answer cannot bypass it.
    const active = getCardLinkState();
    if (active.handoffCorrelation && !active.handoffStationVerified) return;
    if (finishVerifiedBridge(active)) return winner;
    if (!expectedCardId) {
      reportDirectCardStatus({ connected: true, host: probe.host, status: probe.readiness, card: probe.card });
      return finish(freshCardFound(probe.card, probe.host, 'direct', probe.readiness));
    }
    const authority = activateCardTransport(probe, { expectedCardId, expectedPersistedCardId: persistedCard?.id || '', signal: stopped });
    if (!authority.connected) return;
    const verified = getCardLinkState();
    if (verified.state !== 'connected-direct' || verified.card?.id !== expectedCardId
      || verified.host !== probe.host || verified.validatedBootId !== probe.readiness.bootId) return;
    return finish({ ok: true, connected: true, how: 'found-direct', host: probe.host, card: probe.card, authority });
  };
  const testDirect = async candidates => {
    // Each candidate checks exact identity before it can win. A wrong card on
    // one address cannot prevent a matching card on another from answering.
    const probes = candidates.map(async candidate => {
      const result = await probeCardTransport({ host: candidate, expectedCardId, signal: stopped, timeoutMs: DIRECT_PROBE_MS });
      if (result.connected) return settleDirect(result);
      saveFailure(result);
    });
    await Promise.all(probes);
  };
  const direct = async () => {
    while (current()) {
      await testDirect(eligibleHosts());
      if (!current()) return;
      await pauseForCard(retryDelayMs ?? (Date.now() - start < 20_000 ? 2_500 : 6_000), stopped);
    }
  };
  const runBridge = async () => {
    if (!bridgeSearch) return;
    if (exactHost && bridgeSearch.host && bridgeSearch.host !== host) return;
    if (!bridgeFirst) await pauseForCard(1_800, stopped);
    let index = 0;
    while (current() && bridgeSearch.current()) {
      const hosts = bridgeSearch.host ? [bridgeSearch.host] : eligibleHosts().filter(candidate => candidate !== '192.168.4.1' || candidate === host);
      const candidate = hosts[index % hosts.length];
      index += 1;
      if (!bridgeSearch.navigate(candidate)) return;
      const slice = Date.now() + CARD_PAGE_HOST_MS;
      do {
        const status = await sendCardBridgeRequest('status', { cache: 'no-store', nonce: Date.now() }, {
          host: candidate, timeoutMs: 3_500, retryOnTimeout: false,
        }).catch(() => null);
        if (!current() || !bridgeSearch.current()) return;
        const bridge = getCardBridgeState();
        if (bridge.host !== candidate) break;
        const card = normalizeCardIdentity(status || {}, candidate);
        if (card.id && expectedCardId && card.id !== expectedCardId) {
          saveFailure({ reason: 'wrong-card', expectedCardId, observedCardId: card.id, host: candidate });
          break;
        }
        const readiness = classifyCardReadiness(status || {}, { expectedCard: expectedCardId ? { id: expectedCardId } : null });
        if (bridge.verified && card.id && readiness.identityValid && readiness.bootId && readiness.state !== 'checking') {
          if (!expectedCardId && bridge.discoveredCard?.id === card.id) {
            return finish(freshCardFound(card, candidate, 'bridge', status), true);
          }
          if (card.id === expectedCardId && bridge.identityVerified && bridge.card?.id === card.id) {
            const verified = reportCardStatusEnvelope({ host: candidate, status, transport: 'bridge' });
            if (finishVerifiedBridge(verified)) return winner;
          }
        }
        if (current()) await pauseForCard(1_250, stopped);
      } while (current() && bridgeSearch.current() && (bridgeSearch.host || Date.now() < slice));
    }
  };
  const disposeBridge = () => bridgeSearch?.finish(winner?.how === 'card-page' || winner?.transport === 'bridge');
  stopped.addEventListener('abort', disposeBridge, { once: true });
  const unsubscribe = getSharedCardLink().subscribe(() => {
    if (stopped.aborted || winner) return;
    if (!selectionStillCurrent()) return abort();
    // The card page's own handshake can supply verified status before our
    // next search poll. Keep the exact verified page now, before the open
    // Connection Center sees the same result and dismisses itself.
    finishVerifiedBridge(getCardLinkState());
  });
  // The direct permission prompt and popup reservation both start in the
  // initiating click. A blocked popup leaves the direct search untouched.
  allowLanProbes();
  onProgress('Looking for your card. Allow local network access if asked.');
  const directWork = direct();
  if (!link.handoffCorrelation && !getCardBridgeState().handoffCorrelation) bridgeSearch = startCardBridgeSearch();
  const bridgeWork = runBridge();
  const sweepWork = (canPushDirectlyToCard() && persistedCard?.id && !exactHost
    ? (async () => {
      await pauseForCard(DIRECT_PROBE_MS, stopped);
      if (!current()) return;
      const swept = await sweepKnownSubnetsForCard({
        expectedCard, knownHosts: [readStoredCardHost(), ...readStoredCardHostHistory()],
        signal: stopped, persist: false,
      }).catch(() => null);
      if (swept && current()) await testDirect([swept.host]);
    })() : Promise.resolve());
  const finished = new Promise(resolve => {
    if (stopped.aborted) resolve();
    else stopped.addEventListener('abort', resolve, { once: true });
  });
  try {
    await Promise.race([finished, Promise.all([directWork, bridgeWork, sweepWork])]);
    if (winner) return winner;
    if (signal?.aborted || activeSearch !== search || !selectionStillCurrent()) {
      return { ok: false, reason: 'cancelled' };
    }
    if (observedFailure?.reason === 'wrong-card') {
      getSharedCardLink().dispatch({ type: 'direct-status', connected: false, host: observedFailure.host, reason: 'wrong-card' });
    }
    return connectionFailure(observedFailure, !bridgeSearch);
  } finally {
    clearTimeout(timer);
    unsubscribe();
    win?.removeEventListener?.('offline', networkChanged);
    signal?.removeEventListener('abort', abort);
    abort();
    if (activeSearch === search) activeSearch = null;
  }
}
