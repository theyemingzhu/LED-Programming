import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CONNECTED_CARD_LINK_STATES } from '../lib/setupJourney.js';
import { CARD_COMMISSIONING_CHANGED_EVENT, inspectCardCommissioning } from '../lib/cardCommissioningFlow.js';
import { assembleSetupJourney } from '../lib/setupJourneyInputs.js';
import {
  getCardJourneyEvidence,
  hasFreshCardJourneyBlackout,
  hasFreshCardJourneyEvidence,
  refreshCardJourneyBlackout,
  refreshCardJourneyEvidence,
  subscribeCardJourneyEvidence,
} from '../lib/cardJourneyEvidence.js';
import { journeyTransition } from '../lib/journeyTrail.js';
import { appendCardJournalEntry } from '../lib/cardLinkJournal.js';

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

function commissioningStageOf(commissioningFlow) {
  return String(commissioningFlow?.stage ?? commissioningFlow?.flow?.stage ?? '');
}

// Blueprint H8's diagnostic trail (src/lib/journeyTrail.js) needs a "previous"
// to diff the assembled journey against. It lives at MODULE scope — like
// cardJourneyEvidence.js's own `current` — rather than in a per-instance
// `useRef`, because only one screen renders at a time (the URL is the only
// current screen; THINKING.md 2026-08-07) but that screen's `useSetupJourney`
// call still unmounts and remounts on every navigation. A per-instance ref
// would treat each remount as a fresh "first ever" snapshot and log a
// duplicate line for a task that never changed — exactly the sampling this
// journal exists NOT to be (cardLinkJournal.js's own design notes: "records
// TRANSITIONS, not samples"). A shared module value survives the remount and
// still costs no extra render: it is only ever read and written from inside
// an effect, never from render.
let lastLoggedJourneySnapshot = null;

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

  // F16: a `refresh: false` caller (Card Home's Setup screen does its own
  // richer status+wiring read and publishes it directly) still has no other
  // way to learn whether the card's zones are blacked out — nothing else
  // reads /api/zones for it. Gated on `!refresh` so a `refresh: true` caller
  // never pays for two reads of the same fact: its own full refresh above
  // already includes the zones read.
  useEffect(() => {
    if (refresh || !exact) return;
    if (hasFreshCardJourneyBlackout(cardLink, evidence)) return;
    void refreshCardJourneyBlackout({ cardLink, reason: 'setup-journey-blackout' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, exact, cardId, bootId, evidence]);

  const journey = useMemo(
    () => assembleSetupJourney({ cardLink, cardLifecycle, commissioningFlow, project, evidence }),
    [cardLink, cardLifecycle, commissioningFlow, project, evidence],
  );

  const projectId = String(project?.id || '');
  const commissioningStage = commissioningStageOf(commissioningFlow);
  const evidenceStale = evidence?.stale === true;
  useEffect(() => {
    const snapshot = {
      journey: {
        taskId: journey.taskId,
        currentPhaseId: journey.currentPhaseId,
        setupComplete: journey.setupComplete,
      },
      cardId,
      bootId,
      commissioningStage,
      projectId,
      evidenceStale,
    };
    const record = journeyTransition(lastLoggedJourneySnapshot, snapshot);
    lastLoggedJourneySnapshot = snapshot;
    if (record) appendCardJournalEntry(record);
  }, [journey.taskId, journey.currentPhaseId, journey.setupComplete, cardId, bootId, commissioningStage, projectId, evidenceStale]);

  return journey;
}

export default useSetupJourney;
