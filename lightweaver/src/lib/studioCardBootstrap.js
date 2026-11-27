import {
  candidateCardHosts,
  canPushDirectlyToCard,
  CARD_HOST_FALLBACKS,
  CARD_SPECIFIC_DISCOVERY_HEAD_START_MS,
  readStoredCardHost,
} from './cardConnection.js';
import { normalizeCardIdentity, readPersistedCardIdentity, persistCardIdentity } from './cardIdentity.js';
import {
  bootstrapCardLink,
  getCardLinkState,
  isCardLinkConnected,
  reportDirectCardStatus,
} from './cardLink.js';
import { readCardStatusEnvelope } from './cardPushClient.js';
import { activateCardTransport, probeCardTransport } from './cardTransport.js';

async function probeRememberedCard(hosts, { expectedCardId, probeTransport }) {
  const [preferred, ...fallbacks] = hosts;
  if (!preferred) return null;

  const controller = new AbortController();
  const probe = async host => {
    const result = await probeTransport({ host, expectedCardId, signal: controller.signal });
    if (!result?.connected) throw new Error('Card route unavailable');
    return result;
  };
  const preferredProbe = probe(preferred);
  let timer;
  const fallbackProbes = new Promise(resolve => {
    timer = setTimeout(resolve, CARD_SPECIFIC_DISCOVERY_HEAD_START_MS);
    preferredProbe.catch(resolve);
  }).then(() => Promise.any(fallbacks.map(probe)));

  try {
    return await Promise.any([preferredProbe, fallbackProbes]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function persistAuthority(persistIdentity, expectedCard, authority) {
  persistIdentity({
    ...expectedCard,
    ...authority.card,
    id: authority.cardId,
    address: authority.host,
    bootId: authority.bootId,
  }, { acknowledgedAt: new Date().toISOString() });
}

// Restore the exact card Studio already paired with. Bridge handoffs retain
// priority. A short lead for the preferred host usually needs one local GET,
// and a stale route cannot delay a responding fallback by a full timeout.
// A first visit with no remembered card still probes the two well-known
// addresses a just-plugged-in card answers on — only when this page can talk
// to the LAN. That probe only reports the card as found; the owner's explicit
// Connect action performs the pairing. Public HTTPS cannot probe, and we never
// sweep the subnet.
function readPreservingUpdateSession() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('lw_firmware_update_session_v1');
  } catch {
    return null;
  }
}

export async function bootstrapStudioCardConnection({
  bootstrapLink = bootstrapCardLink,
  probeTransport = probeCardTransport,
  activateTransport = activateCardTransport,
  readIdentity = readPersistedCardIdentity,
  readHost = readStoredCardHost,
  candidateHosts = candidateCardHosts,
  persistIdentity = persistCardIdentity,
  readStatus = readCardStatusEnvelope,
  reportStatus = reportDirectCardStatus,
  getLinkState = getCardLinkState,
  isConnected = isCardLinkConnected,
  canPushDirect = canPushDirectlyToCard,
  unpairedHosts = CARD_HOST_FALLBACKS,
  locationHash = typeof window === 'undefined' ? '' : window.location.hash,
  readUpdateSession = readPreservingUpdateSession,
} = {}) {
  const bridgeState = await bootstrapLink();
  if (isConnected(bridgeState) || bridgeState?.handoffCorrelation) return bridgeState;

  const expectedCard = readIdentity();
  if (!expectedCard?.id) {
    if (!canPushDirect()) return bridgeState;
    // Install / an in-flight preserving update already owns reconnect.
    // A well-known probe here would bind the card mid-update and hide the
    // updater's own recovery.
    if (/(?:^|[&#])section=install(?:&|$)/.test(String(locationHash || '')) || readUpdateSession()) {
      return bridgeState;
    }
    for (const host of unpairedHosts) {
      try {
        const status = await readStatus({ host, transport: 'direct', timeoutMs: 900 });
        if (!normalizeCardIdentity(status, host).id) continue;
        reportStatus({ connected: true, host, status, allowAdopt: false });
        return getLinkState();
      } catch {
        // Only the two explicit well-known addresses are tried. A failed first
        // address is ordinary while the card is in access-point mode.
      }
    }
    return bridgeState;
  }

  const hosts = candidateHosts(readHost(), expectedCard);
  const probe = await probeRememberedCard(hosts, { expectedCardId: expectedCard.id, probeTransport });
  const current = getLinkState();
  if (isConnected(current) || current?.handoffCorrelation) return current;
  if (!probe || readIdentity()?.id !== expectedCard.id) return bridgeState;
  const authority = activateTransport(probe, {
    expectedCardId: expectedCard.id,
    expectedPersistedCardId: expectedCard.id,
  });
  if (!authority?.connected) return bridgeState;

  // Restoring a pairing writes down where the card is, which boot answered, and
  // WHICH FIRMWARE IT IS ACTUALLY RUNNING — all of it from the same live read,
  // all of it together.
  //
  // This used to spread the live identity in and then pin `firmwareVersion` and
  // `buildId` back to the remembered ones, so that a reflash would be visible
  // to the connection center rather than silently adopted. It did not preserve
  // the note; it TORE it. `authority.card.buildNumber` came through the spread
  // while its buildId and firmwareVersion were held at the previous release, so
  // every reload after an update stored a firmware identity describing no build
  // that has ever existed — the exact record found on Adrian's card on
  // 2026-09-07: build number 1548 beside the buildId of 1524 (F13). Every gate
  // that compared firmware then refused the card the owner was looking at.
  //
  // A same-id firmware change is no longer a thing to detect and offer: it is
  // what an official update always produces, and `classifyPairedCardReadiness`
  // accepts it everywhere. The offer that mattered — "this is a DIFFERENT card"
  // — is `isDifferentCardMismatch`, which is unaffected: nothing here can be
  // reached by another card, because `probeTransport` was given
  // `expectedCard.id` and refuses any other id as `wrong-card`.
  persistAuthority(persistIdentity, expectedCard, authority);
  return authority;
}
