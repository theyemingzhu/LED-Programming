import React from 'react';
import { CONNECTED_CARD_LINK_STATES, SETUP_PHASE_IDS } from '../lib/setupJourney.js';
import { cardTaskCopy } from '../lib/cardTaskCopy.js';
import { openCardFlow } from '../lib/cardFlowEntry.js';
import { useSetupJourney } from '../hooks/useSetupJourney.js';

// The one setup reminder a working screen (Patterns, Playlist) is allowed to
// carry. It replaced the 6-step JOURNEY_STEPS hint, which was a second journey
// vocabulary competing with the real one: the derived setup journey
// (lib/setupJourney.js) has exactly four owner phases, and this chip renders
// nothing at all once that journey reports completion — a finished owner
// never sees setup words again on a working screen.
//
// One line, one action: the chip names the current phase and the exact next
// task (the same copy table Card Home uses), and clicking it runs
// openCardFlow('fix'), which routes to that task's own surface.
//
// The journey now comes from the shared hook rather than a local
// `deriveSetupJourney` call with whatever this component happened to know.
// That local call was the defect: with the card mid light-test, Card Home asked
// the owner to confirm what they could see on the strip while this chip — blind
// to the wiring status, because nothing had handed it one — reported the setup
// finished and removed itself.
export function SetupJourneyChip({ cardLink, cardLifecycle, project }) {
  const journey = useSetupJourney({ cardLink, cardLifecycle, project });
  if (journey.setupComplete) return null;
  // Footer already owns "connected or not". Repeating "Setup: phase 1 of 4"
  // on Patterns while no card is talking sent people back into Connect/Setup
  // when they were just trying to design. Once the exact card is connected,
  // unfinished lights/layout/save is a real resume, and this chip is the
  // one reminder a working screen is allowed to carry.
  if (!CONNECTED_CARD_LINK_STATES.includes(cardLink?.state)) return null;
  const phaseNumber = Math.max(1, SETUP_PHASE_IDS.indexOf(journey.currentPhaseId) + 1);
  return (
    <button
      type="button"
      className="setup-journey-chip"
      data-testid="setup-journey-chip"
      data-journey-task={journey.taskId}
      data-journey-complete={journey.setupComplete ? 'true' : 'false'}
      onClick={() => openCardFlow('fix', {
        lifecycle: cardLifecycle,
        journey,
        cardId: cardLink?.card?.id || cardLink?.readiness?.cardId || '',
      })}
    >
      Setup: phase {phaseNumber} of {SETUP_PHASE_IDS.length} — {cardTaskCopy(journey.taskId)}
    </button>
  );
}

export default SetupJourneyChip;
