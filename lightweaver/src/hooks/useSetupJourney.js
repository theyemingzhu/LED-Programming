import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CONNECTED_CARD_LINK_STATES } from '../lib/setupJourney.js';
import { CARD_COMMISSIONING_CHANGED_EVENT, inspectCardCommissioning } from '../lib/cardCommissioningFlow.js';
import { assembleSetupJourney } from '../lib/setupJourneyInputs.js';
import {
  getCardJourneyEvidence,
  hasFreshCardJourneyEvidence,
  refreshCardJourneyEvidence,
  subscribeCardJourneyEvidence,
} from '../lib/cardJourneyEvidence.js';

// The setup journey, as one answer for every screen that asks.
//
// Card Home, the Patterns/Playlist chip and the shell's setup-task router each
// used to call `deriveSetupJourney` with whatever they happened to know. This
// hook is the single place that gathers the inputs: the commissioning flow from
// storage, the card evidence from the shared store, and the link/lifecycle/
// project the caller already holds.
//
// `refresh: false` for a caller that does its own richer card read and
// publishes it (Card Home's Setup screen) — otherwise both would read the card
// on mount, and the card is a microcontroller on someone's shelf.

function connectedExactCard(cardLink) {
  if (!CONNECTED_CARD_LINK_STATES.includes(cardLink?.state)) return false;
  const observedId = String(cardLink?.card?.id || cardLink?.readiness?.cardId || '').trim();
  if (!observedId) return false;
  const expectedId = String(cardLink?.expectedCard?.id || '').trim();
  return !expectedId || expectedId === observedId;
}

// The commissioning flow lives in storage, not props. Re-read it when the flow
// announces a change, exactly as the chip and Setup have always done.
export function useCommissioningFlow(supplied) {
  const [tick, bump] = useState(0);
  useEffect(() => {
    if (supplied !== undefined) return undefined;
    const sync = () => bump(value => value + 1);
    window.addEventListener('storage', sync);
    window.addEventListener(CARD_COMMISSIONING_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CARD_COMMISSIONING_CHANGED_EVENT, sync);
    };
  }, [supplied]);
  return useMemo(
    () => (supplied !== undefined ? supplied : inspectCardCommissioning().flow),
    [supplied, tick],
  );
}

export function useCardJourneyEvidence() {
  return useSyncExternalStore(subscribeCardJourneyEvidence, getCardJourneyEvidence, getCardJourneyEvidence);
}

export function useSetupJourney({
  cardLink,
  cardLifecycle,
  project,
  commissioningFlow: suppliedFlow,
  refresh = true,
} = {}) {
  const commissioningFlow = useCommissioningFlow(suppliedFlow);
  const evidence = useCardJourneyEvidence();

  const cardId = String(cardLink?.card?.id || cardLink?.readiness?.cardId || '').trim();
  const bootId = String(cardLink?.readiness?.bootId || '').trim();
  const exact = connectedExactCard(cardLink);
  useEffect(() => {
    if (!refresh || !exact) return;
    // `evidence` is a dependency on purpose: a hardware operation ending marks
    // the store stale, which changes the snapshot, which re-runs this and reads
    // again. Once the read lands the snapshot is fresh and this returns
    // immediately, so it converges rather than polls.
    if (hasFreshCardJourneyEvidence(cardLink, evidence)) return;
    void refreshCardJourneyEvidence({ cardLink, reason: 'setup-journey' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, exact, cardId, bootId, evidence]);

  return useMemo(
    () => assembleSetupJourney({ cardLink, cardLifecycle, commissioningFlow, project, evidence }),
    [cardLink, cardLifecycle, commissioningFlow, project, evidence],
  );
}

export default useSetupJourney;
