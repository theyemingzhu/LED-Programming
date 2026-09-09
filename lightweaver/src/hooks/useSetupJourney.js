import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CONNECTED_CARD_LINK_STATES } from '../lib/setupJourney.js';
import { CARD_COMMISSIONING_CHANGED_EVENT, inspectCardCommissioning } from '../lib/cardCommissioningFlow.js';
import { assembleSetupJourney } from '../lib/setupJourneyInputs.js';
import {
  getCardJourneyEvidence,
  hasFreshCardJourneyBlackout,
  hasFreshCardJourneyEvidence,
  invalidateCardJourneyEvidence,
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
  const openProjectId = String(project?.id || '');
  const exact = connectedExactCard(cardLink);
  useEffect(() => {
    if (!refresh || !exact) return;
    // `evidence` is a dependency on purpose: a hardware operation ending marks
    // the store stale, which changes the snapshot, which re-runs this and reads
    // again. Once the read lands the snapshot is fresh and this returns
    // immediately, so it converges rather than polls.
    if (hasFreshCardJourneyEvidence(cardLink, evidence)) return;
    // F22c: this hook always knows which project Studio has open — pass it
    // through so the published evidence carries that tag even when this is
    // the FIRST refresh for this card+boot (Card Home has not read the card
    // yet, e.g. a fast hash navigation straight to Patterns under load).
    // Without it, `setupJourneyBlackout`'s project-scoping check
    // (setupJourneyInputs.js) compared the card's real blackout against an
    // empty projectId forever and could never match.
    void refreshCardJourneyEvidence({ cardLink, openProjectId, reason: 'setup-journey' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, exact, cardId, bootId, openProjectId, evidence]);

  // F16: a `refresh: false` caller (Card Home's Setup screen does its own
  // richer status+wiring read and publishes it directly) still has no other
  // way to learn whether the card's zones are blacked out — nothing else
  // reads /api/zones for it. Gated on `!refresh` so a `refresh: true` caller
  // never pays for two reads of the same fact: its own full refresh above
  // already includes the zones read.
  useEffect(() => {
    if (refresh || !exact) return;
    if (hasFreshCardJourneyBlackout(cardLink, evidence)) return;
    void refreshCardJourneyBlackout({ cardLink, openProjectId, reason: 'setup-journey-blackout' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, exact, cardId, bootId, openProjectId, evidence]);

  // F30 (bench 2026-09-08): a blackout switched on FROM THE CARD'S OWN PAGE —
  // no Studio request involved at all — is invisible to both effects above.
  // Nothing marks the cached blackout fact stale except a Studio-initiated
  // hardware operation (cardJourneyEvidence.js's own
  // STUDIO_HARDWARE_OPERATION_EVENT listener), so an out-of-band press is
  // cached as "not blacked out" forever, exactly like F16 before it — only
  // this time no Studio write ever happens for the invalidation to hang off.
  //
  // The card's status envelope already answers the question every keepalive
  // tick already pays for: LightweaverStorage.cpp's runtimeStatusJson reports
  // `lwOutput.requestedBrightnessByte` / `brightnessByte`, and
  // composeOutputBrightness (LightweaverOutputPolicy.h) returns 0 for BOTH
  // the instant the card's global blackout engages, from any source. So a
  // change in either byte, in either direction, since the last envelope THIS
  // hook instance saw for the same card+boot, is out-of-band evidence the
  // light output moved without Studio's own knowledge — stale the cached
  // blackout fact so the two effects above re-read `/api/zones` on their very
  // next run, instead of trusting a snapshot from before the change.
  //
  // Deliberately not a blackout verdict on its own — brightness legitimately
  // reaches 0 from an owner's own dimmer, and zones stay the one source of
  // truth for `blackout` itself (setupJourneyInputs.js). Deliberately not
  // gated on `refresh`: Card Home/Setup (refresh: false) and Patterns
  // (refresh: true) all read the ONE shared evidence store this invalidates,
  // so whichever screen happens to be mounted when the card changes catches
  // it for every screen.
  const lastObservedCardOutputRef = useRef({ key: '', requested: null, actual: null });
  const lwOutput = cardLink?.readiness?.lwOutput;
  const requestedBrightnessByte = lwOutput ? Number(lwOutput.requestedBrightnessByte) : null;
  const actualBrightnessByte = lwOutput ? Number(lwOutput.brightnessByte) : null;
  useEffect(() => {
    if (!exact || !lwOutput) return;
    const key = `${cardId}:${bootId}`;
    const last = lastObservedCardOutputRef.current;
    if (
      last.key === key
      && (last.requested !== requestedBrightnessByte || last.actual !== actualBrightnessByte)
    ) {
      invalidateCardJourneyEvidence();
    }
    lastObservedCardOutputRef.current = { key, requested: requestedBrightnessByte, actual: actualBrightnessByte };
  }, [exact, cardId, bootId, lwOutput, requestedBrightnessByte, actualBrightnessByte]);

  const journey = useMemo(
    () => assembleSetupJourney({ cardLink, cardLifecycle, commissioningFlow, project, evidence }),
    [cardLink, cardLifecycle, commissioningFlow, project, evidence],
  );

  const projectId = openProjectId;
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
