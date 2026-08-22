// "Pair this card" must mean the same thing wherever the owner presses it.
//
// The pairing sequence used to live only inside the Connection Center, so the
// Setup screen's own primary button could do nothing but open that panel and
// ask for the same click again under a second vocabulary. Owners reported
// that as the flow's worst step: a screen that has already found the card,
// whose "Pair this card" only produces another window saying a card was
// found. This module is the one sequence; both surfaces call it.

import {
  adoptDiscoveredCardBridgeIdentity,
  getCardBridgeState,
  rePairDiscoveredCardBridgeIdentity,
} from './cardBridge.js';
import { normalizeCardHost, readStoredCardHost } from './cardConnection.js';
import { readPersistedCardIdentity } from './cardIdentity.js';
import { adoptDiscoveredDirectCard } from './cardLink.js';

export const PAIR_STALE_HOST = 'stale-host';

// Benign races with the background discovery poll. Pairing snapshots the
// discovery revision and refuses if a newer poll landed mid-flight — correct,
// because it must not bind identity from a snapshot that has moved. But
// discovery polls continuously, so an owner pressing the button could simply
// lose that race and be told "A newer card discovery replaced this pairing
// attempt. Try again" for something they did nothing wrong in. It is the same
// card either way; retrying against the newer snapshot is what "try again"
// meant, so do it here instead of asking.
const RETRYABLE_PAIR_REASONS = new Set(['stale-discovery', 'stale-identity']);
const PAIR_RETRY_LIMIT = 3;
const PAIR_RETRY_DELAY_MS = 400;

// Resolves rather than throws: every caller renders the failure, and a thrown
// rejection crossing two screens was how one of them ended up silent.
export async function pairDiscoveredCard(link = {}, options = {}) {
  const {
    retryLimit = PAIR_RETRY_LIMIT,
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = options;
  let result = await pairDiscoveredCardOnce(link, options);
  for (let attempt = 1; !result.ok && attempt <= retryLimit; attempt += 1) {
    if (!RETRYABLE_PAIR_REASONS.has(result.reason)) break;
    await delay(PAIR_RETRY_DELAY_MS);
    result = await pairDiscoveredCardOnce(link, options);
  }
  return result;
}

async function pairDiscoveredCardOnce(link = {}, {
  adoptDirect = adoptDiscoveredDirectCard,
  adoptBridge = adoptDiscoveredCardBridgeIdentity,
  rePairBridge = rePairDiscoveredCardBridgeIdentity,
  readIdentity = readPersistedCardIdentity,
} = {}) {
  try {
    if (link.transport === 'direct' && link.discoveredCard?.id) {
      await adoptDirect();
    } else if (readIdentity()?.id) {
      await rePairBridge(link.host);
    } else {
      await adoptBridge(link.host);
    }
    return { ok: true };
  } catch (error) {
    if (error?.reason === PAIR_STALE_HOST) {
      return {
        ok: false,
        reason: PAIR_STALE_HOST,
        takeoverHost: normalizeCardHost(getCardBridgeState().host || link.host || readStoredCardHost()),
        message: 'Studio found the card through an earlier connection. Take over that connection to use the card in this Studio.',
      };
    }
    return {
      ok: false,
      reason: error?.reason || 'failed',
      takeoverHost: '',
      message: error?.message || 'Studio could not pair this card.',
    };
  }
}
