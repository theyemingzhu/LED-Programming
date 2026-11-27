// "Connect this card" must mean the same thing wherever the owner presses it.
//
// The pairing sequence used to live only inside the Connection Center, so the
// Setup screen's own primary button could do nothing but open that panel and
// ask for the same click again under a second vocabulary. Owners reported
// that as the flow's worst step: a screen that has already found the card,
// whose "Connect this card" only produces another window saying a card was
// found. This module is the one sequence; both surfaces call it.

import {
  adoptDiscoveredCardBridgeIdentity,
  getCardBridgeState,
  rePairDiscoveredCardBridgeIdentity,
} from './cardBridge.js';
import { normalizeCardHost, readStoredCardHost } from './cardConnection.js';
import { readPersistedCardIdentity } from './cardIdentity.js';
import { adoptDiscoveredDirectCard, getCardLinkState } from './cardLink.js';
import { activateCardTransport } from './cardTransport.js';

export const PAIR_STALE_HOST = 'stale-host';

// Benign races with the background discovery poll. Pairing snapshots the
// discovery revision and refuses if a newer poll landed mid-flight — correct,
// because it must not bind identity from a snapshot that has moved. But
// discovery polls continuously, so an owner pressing the button could simply
// lose that race and be told "A newer card discovery replaced this pairing
// attempt. Try again" for something they did nothing wrong in. It is the same
// card either way; retrying against the newer snapshot is what "try again"
// meant, so do it here instead of asking.
// A card read that ran out of time is asked again too: a busy card answers in
// seconds, and the owner should not have to press Pair a second time for it.
const RETRYABLE_PAIR_REASONS = new Set(['stale-discovery', 'stale-identity', 'timeout']);

// A timed-out read surfaces from the browser as "signal is aborted without
// reason" — words that mean nothing to an owner (interruption test D5).
function isTimedOutRead(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError' || /\baborted?\b/i.test(String(error?.message || ''));
}
const PAIR_RETRY_LIMIT = 3;
const PAIR_RETRY_DELAY_MS = 400;

// Resolves rather than throws: every caller renders the failure, and a thrown
// rejection crossing two screens was how one of them ended up silent.
export async function pairDiscoveredCard(link = {}, options = {}) {
  const {
    retryLimit = PAIR_RETRY_LIMIT,
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = options;
  const pairedAtStart = (options.readIdentity || readPersistedCardIdentity)()?.id || '';
  const pairOnce = () => pairDiscoveredCardOnce(link, { ...options, pairedAtStart });
  let result = await pairOnce();
  for (let attempt = 1; !result.ok && attempt <= retryLimit; attempt += 1) {
    if (!RETRYABLE_PAIR_REASONS.has(result.reason)) break;
    await delay(PAIR_RETRY_DELAY_MS);
    result = await pairOnce();
  }
  return result;
}

async function pairDiscoveredCardOnce(link = {}, {
  adoptDirect = adoptDiscoveredDirectCard,
  adoptBridge = adoptDiscoveredCardBridgeIdentity,
  rePairBridge = rePairDiscoveredCardBridgeIdentity,
  readIdentity = readPersistedCardIdentity,
  readBridgeState = getCardBridgeState,
  expectedCard = null,
  pairedAtStart,
  signal,
} = {}) {
  try {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    if ((readIdentity()?.id || '') !== pairedAtStart) {
      return { ok: false, reason: 'connection-superseded', message: 'The paired card changed. Check the card now shown before pairing.' };
    }
    if (expectedCard) {
      const live = readBridgeState();
      const discovered = live.discoveredCard;
      if (readIdentity()?.id || link.transport !== 'bridge'
        || normalizeCardHost(live.host) !== normalizeCardHost(expectedCard.host)
        || normalizeCardHost(link.host) !== normalizeCardHost(expectedCard.host)
        || discovered?.id !== expectedCard.id
        || discovered.firmwareVersion !== expectedCard.firmwareVersion
        || discovered.buildId !== expectedCard.buildId
        || Number(discovered.buildNumber) !== Number(expectedCard.buildNumber)) {
        return {
          ok: false, reason: 'wrong-card', takeoverHost: '',
          message: 'The card changed since USB verification. Reopen the selected card before pairing.',
        };
      }
      await adoptBridge(expectedCard.host, { expectedCard, signal });
      return { ok: true };
    }
    const observedCardId = link.discoveredCard?.id || '';
    if (link.transport === 'direct' && observedCardId) {
      const card = await adoptDirect({
        observedCardId, observedBootId: link.directDiscoveryBootId,
        observedBuildId: link.discoveredCard?.buildId, host: link.host, signal,
      });
      if (signal?.aborted) return { ok: false, reason: 'cancelled' };
      if (card?.id) {
        const current = getCardLinkState();
        if (current.host === card.host && current.state === 'connected-direct' && current.card?.id === card.id) {
          activateCardTransport({ connected: true, host: current.host, readiness: current.readiness, card }, {
            expectedCardId: card.id, expectedPersistedCardId: card.id, acknowledge: false,
          });
        }
      }
      return { ok: true, directCard: card };
    } else if (pairedAtStart) {
      await rePairBridge(link.host, { observedCardId, signal });
    } else {
      await adoptBridge(link.host, { observedCardId, signal });
    }
    return { ok: true };
  } catch (error) {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    if (error?.reason === PAIR_STALE_HOST) {
      return {
        ok: false,
        reason: PAIR_STALE_HOST,
        takeoverHost: normalizeCardHost(getCardBridgeState().host || link.host || readStoredCardHost()),
        message: 'Studio found the card through an earlier connection. Take over that connection to use the card in this Studio.',
      };
    }
    if (isTimedOutRead(error)) {
      return {
        ok: false,
        reason: 'timeout',
        takeoverHost: '',
        message: 'The card took too long to answer, so it is not connected yet. Keep it powered and on this Wi-Fi, then try again.',
      };
    }
    return {
      ok: false,
      reason: error?.reason || 'failed',
      takeoverHost: '',
      message: error?.message || 'Studio could not connect to this card.',
    };
  }
}
