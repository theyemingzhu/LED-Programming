import { candidateCardHosts, readStoredCardHost } from './cardConnection.js';
import { readPersistedCardIdentity, persistCardIdentity } from './cardIdentity.js';
import { bootstrapCardLink, isCardLinkConnected } from './cardLink.js';
import { connectCardTransport } from './cardTransport.js';

// Restore the exact card Studio already paired with. Bridge handoffs retain
// priority; ordinary public-Studio reloads use one read-only local status GET.
export async function bootstrapStudioCardConnection({
  bootstrapLink = bootstrapCardLink,
  connectTransport = connectCardTransport,
  readIdentity = readPersistedCardIdentity,
  readHost = readStoredCardHost,
  candidateHosts = candidateCardHosts,
  persistIdentity = persistCardIdentity,
  isConnected = isCardLinkConnected,
} = {}) {
  const bridgeState = await bootstrapLink();
  if (isConnected(bridgeState)) return bridgeState;

  const expectedCard = readIdentity();
  if (!expectedCard?.id) return bridgeState;

  const hosts = candidateHosts(readHost(), expectedCard);
  let authority = null;
  for (const host of hosts) {
    authority = await connectTransport({ host, expectedCardId: expectedCard.id });
    if (authority?.connected) break;
  }
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
  // reached by another card, because `connectTransport` was given
  // `expectedCard.id` and refuses any other id as `wrong-card`.
  persistIdentity({
    ...expectedCard,
    ...authority.card,
    id: authority.cardId,
    address: authority.host,
    bootId: authority.bootId,
  }, { acknowledgedAt: new Date().toISOString() });
  return authority;
}
