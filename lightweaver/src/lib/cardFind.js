// "Find my card" has to FIND the card.
//
// It used to open the Connection Center, which asked the owner to look at the
// LEDs and describe what they saw before Studio tried anything at all. On a
// screen that already displays the card's address, with a card sitting on the
// network answering every request, that reads as the button doing nothing —
// which is exactly how it was reported. A triage question is the right thing
// to ask AFTER a real attempt has failed, never instead of one.
//
// There are two ways this browser can reach a card, and which one is available
// is decided by the page's own protocol, not by anything the owner can see:
//
//   • A page served over http (the local Studio, the card's own page) can
//     fetch the card directly. It can also sweep the addresses the card has
//     previously answered on, which is the answer when the router has moved it.
//   • A page served over https (led.mandalacodes.com — the address owners
//     actually use) cannot fetch an http address at all. Its only route is the
//     card's own page opened as a real tab, which then relays. Every other
//     control on the connect panel is a dead end there.
//
// So this picks the route that can work and takes it, and only reports a
// failure the owner can act on when none can.

import {
  canPushDirectlyToCard,
  discoverCardStatus,
  normalizeCardHost,
  readStoredCardHost,
  readStoredCardHostHistory,
  sweepKnownSubnetsForCard,
  DEFAULT_CARD_HOST,
} from './cardConnection.js';
import { readPersistedCardIdentity } from './cardIdentity.js';
import { connectCardLink, reportDirectCardStatus } from './cardLink.js';
import { pairDiscoveredCard } from './cardPairing.js';

function bestKnownHost(link = {}) {
  return normalizeCardHost(link.host || readStoredCardHost() || '') || DEFAULT_CARD_HOST;
}

/**
 * Race every known card address (stored host, history, mDNS, setup AP) with
 * a bounded timeout, then sweep any remembered subnet. This is what Connect
 * must do: a single fetch to lightweaver.local can stall on .local DNS while
 * the card is already answering on its station IP.
 */
export async function locateReachableCard({
  preferredHost = '',
  expectedCard = readPersistedCardIdentity(),
  timeoutMs = 2000,
} = {}) {
  const found = await discoverCardStatus({
    preferredHost: preferredHost || bestKnownHost(),
    expectedCard,
    timeoutMs,
    persist: true,
  }).catch(() => null);
  if (found?.connected) return found;
  if (found?.reason === 'wrong-card' || found?.reason === 'identity-missing') return found;

  const swept = await sweepKnownSubnetsForCard({
    expectedCard,
    knownHosts: [
      preferredHost,
      readStoredCardHost(),
      ...readStoredCardHostHistory(),
    ],
  }).catch(() => null);
  if (swept) {
    return { connected: true, host: swept.host, status: swept.status };
  }
  return found || { connected: false, host: preferredHost || DEFAULT_CARD_HOST };
}

async function pairReachedCard(found) {
  reportDirectCardStatus({
    connected: true, host: found.host, status: found.status, allowAdopt: true,
  });
  const paired = await pairDiscoveredCard({
    transport: 'direct',
    host: found.host,
    discoveredCard: { id: found.status?.cardId || '' },
  });
  return paired.ok
    ? { ok: true, how: 'found-direct', host: found.host }
    : { ok: false, reason: paired.reason, message: paired.message };
}

export async function findAndConnectCard({
  link = {},
  onProgress = () => {},
  directOnly = canPushDirectlyToCard(),
} = {}) {
  // Already found and merely unpaired: pairing IS the whole job, and asking
  // anything else here is the extra step owners kept reporting.
  if (link.discoveredCard?.id) {
    onProgress('Pairing this card…');
    const paired = await pairDiscoveredCard(link);
    return paired.ok
      ? { ok: true, how: 'paired' }
      : { ok: false, reason: paired.reason, message: paired.message };
  }

  if (directOnly) {
    onProgress('Looking for your card…');
    const found = await locateReachableCard({
      preferredHost: bestKnownHost(link),
      timeoutMs: 2000,
    });
    if (found?.connected) return pairReachedCard(found);

    return {
      ok: false,
      reason: 'not-found',
      message: 'No Lightweaver answered on this network. Check the card has power, and that this device is on the same Wi-Fi as the card.',
    };
  }

  // https: opening the card's own page is the only route that can succeed, so
  // take it rather than describing it as a fallback at the bottom of a panel.
  const host = bestKnownHost(link);
  onProgress(`Opening the card’s own page at ${host}…`);
  const opened = connectCardLink(host);
  if (!opened) {
    return {
      ok: false,
      reason: 'popup-blocked',
      message: 'Your browser blocked the card’s own page. Allow pop-ups for this site, then press Find my card again.',
    };
  }
  return { ok: true, how: 'card-page', host };
}
