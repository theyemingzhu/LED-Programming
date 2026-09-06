/**
 * A bounded diagnostic line for when the setup journey's VERDICT changes —
 * blueprint H8. The card link journal (cardLinkJournal.js) already answers
 * "did the connection change"; this answers a narrower, different question:
 * did the task the owner is asked to do change. The link can stay connected
 * throughout while the task moves — a hardware operation ending, the
 * commissioning flow advancing, a different project opened, or the card
 * evidence simply landing fresh.
 *
 * Pure by design: no storage, no card, no React. `useSetupJourney` is the
 * only caller and decides what to do with the record (append it to the
 * shared connection log).
 *
 * Deliberately holds nothing but ids: no project contents, no credentials,
 * no hosts beyond the card id.
 */

function text(value) {
  return String(value ?? '').trim();
}

// Priority order matters: a card/boot change explains everything downstream
// of it, so it is checked first. `hardware-op-ended` is checked before the
// `evidence-fresh` fallback because it is the more specific story — the
// evidence went stale (a hardware operation just finished) and then a fresh
// read landed — while `evidence-fresh` is what is left when a read landed
// with nothing else distinguishing why.
function reasonFor(previous, next) {
  if (text(previous?.cardId) !== text(next?.cardId) || text(previous?.bootId) !== text(next?.bootId)) {
    return 'link-changed';
  }
  if (text(previous?.commissioningStage) !== text(next?.commissioningStage)) {
    return 'commissioning-changed';
  }
  if (text(previous?.projectId) !== text(next?.projectId)) {
    return 'project-changed';
  }
  if (previous?.evidenceStale === true && next?.evidenceStale !== true) {
    return 'hardware-op-ended';
  }
  return 'evidence-fresh';
}

/**
 * `previous` / `next` are snapshots of the shape:
 *   {
 *     journey: { taskId, currentPhaseId, setupComplete },
 *     cardId, bootId,          // which card/boot the journey was assembled for
 *     commissioningStage,      // the commissioning flow's stage, if any
 *     projectId,                // the open project's id
 *     evidenceStale,            // whether the evidence a hardware op just ended was stale
 *   }
 *
 * Returns null when `journey.taskId`, `journey.currentPhaseId` and
 * `journey.setupComplete` are all unchanged from `previous` — a re-render
 * that changes nothing worth recording is not an event, the same rule
 * `recordCardLinkTransition` applies to connection state. A first-ever
 * snapshot (no `previous`) always counts as a change, also matching that
 * convention: the initial state is itself worth one line.
 */
export function journeyTransition(previous, next, { now = () => new Date().toISOString() } = {}) {
  if (!next?.journey) return null;
  const prevJourney = previous?.journey || null;
  const nextJourney = next.journey;
  const changed = !prevJourney
    || prevJourney.taskId !== nextJourney.taskId
    || prevJourney.currentPhaseId !== nextJourney.currentPhaseId
    || prevJourney.setupComplete !== nextJourney.setupComplete;
  if (!changed) return null;
  return {
    at: now(),
    step: text(nextJourney.currentPhaseId) || (nextJourney.setupComplete ? 'complete' : ''),
    task: text(nextJourney.taskId),
    cardId: text(next.cardId),
    bootId: text(next.bootId),
    reason: reasonFor(previous, next),
  };
}

export default journeyTransition;
