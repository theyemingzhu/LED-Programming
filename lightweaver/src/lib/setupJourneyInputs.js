// The ONE mapping from card evidence to the setup journey's inputs.
//
// This used to live inside lw-setup.jsx as a local `journeyResolution` ternary,
// which meant only the screen that owned it could reach the full verdict. The
// Patterns/Playlist chip and the shell's setup-task router called
// `deriveSetupJourney` with a reduced subset and got a different answer for the
// same card — most visibly during a wiring light test, where Card Home asked
// the owner to confirm what they could see on the strip while the chip declared
// the setup finished and disappeared.
//
// Nothing here talks to a card. It is a pure function of a link, a lifecycle, a
// project, a commissioning flow, and a published evidence snapshot.

import { deriveSetupJourney } from './setupJourney.js';
import { freshJourneyEvidence, emptyCardJourneyEvidence } from './cardJourneyEvidence.js';
import { isBenchProjectEvidence } from './benchConfig.js';
import { hasResumableCommissioning } from './cardFlowEntry.js';

// Whether the card is still holding the TEMPORARY light-finding setup. A card
// fact, so it is read from the card wherever the card has spoken, and from the
// link's readiness when it has not. Never asserted from the project id: the
// discovery setup is written under the open project's own id, so an id match
// proves nothing about whether it is the real installation.
function provisionalSetupFrom(fresh, cardLink) {
  if (fresh.read) {
    if (fresh.status?.provisionalSetup === true) return true;
    if (fresh.resolutionKind === 'bench') return true;
  }
  const readiness = cardLink?.readiness || null;
  if (readiness?.provisionalSetup === true) return true;
  // With nothing read from the card, the readiness envelope is the only
  // account of what it is running, and `isBenchProjectEvidence` is the same
  // test Card Home applies to a full read.
  return Boolean(readiness) && isBenchProjectEvidence(readiness);
}

export function setupJourneyResolution({ cardLink, project, evidence } = {}) {
  const fresh = freshJourneyEvidence(evidence, cardLink);
  const provisionalSetup = provisionalSetupFrom(fresh, cardLink);
  // A claim about the OPEN project may only be spent on the project it was
  // made about. Opening a different piece does not make the card hold it.
  const sameProject = fresh.read
    && String(fresh.projectId || '') === String(project?.id || '');
  if (sameProject && fresh.matchesOpenProject === true) {
    return { matchesCurrentProject: true, playbackAccess: 'ready', provisionalSetup };
  }
  if (sameProject && fresh.resolutionKind === 'saved-match') {
    return { savedProjectMatch: true, playbackAccess: 'ready', provisionalSetup };
  }
  if (provisionalSetup) return { provisionalSetup: true };
  // Nothing positive to add. `deriveSetupJourney` falls back to the card
  // lifecycle, which is what every consumer had before this module existed.
  return null;
}

// The wiring safety status is only ever the LIVE one. A status held over from a
// card that has since rebooted would keep asking the owner to confirm a light
// test that is no longer running.
export function setupJourneyWiringStatus({ cardLink, evidence } = {}) {
  return freshJourneyEvidence(evidence, cardLink).wiringStatus || null;
}

// F16: a card can be connected, holding the exact project Studio has open,
// and reporting a ready runtime — and still be sitting dark, because
// blackout lives only in /api/zones, not in the status envelope every other
// verdict here is built from. A card fact, so — like every other fact in
// this module — it is spent only against the project it was read about: a
// blackout reported under a DIFFERENT project than the one open in Studio
// says nothing about whether THIS project's journey should mention it.
export function setupJourneyBlackout({ cardLink, project, evidence } = {}) {
  const fresh = freshJourneyEvidence(evidence, cardLink);
  if (!fresh.read || fresh.blackout !== true) return false;
  // A bench/discovery card is EXPECTED dark until a pattern is chosen — the
  // card-state matrix's own 'provisional' fixture is exactly that, and
  // showing "lights are off" about a card nobody has finished setting up
  // yet would be noise, not F16's defect. Excluded the same way every other
  // provisional-aware verdict in this module is.
  if (provisionalSetupFrom(fresh, cardLink)) return false;
  // A runtime that has not yet reported ready (the moment after a boot or a
  // config write) is also expected to be dark — not a defect either. Every
  // real status envelope carries this field; a snapshot with none yet (still
  // connecting) is handled by `fresh.read` above.
  if (fresh.status && fresh.status.commandReady !== true) return false;
  // F22: blackout is a card fact about the card's own output — whether the
  // open project's WIRING still matches the card exactly (matchesOpenProject
  // / resolutionKind) is a different question, the one `cardHoldsOpenProject`
  // in lw-card.jsx and F18's edit-intent handoff already answer with id
  // equality alone. A card sitting dark under the project Studio has open,
  // with an unsaved wiring edit since install, is still dark — the drift
  // does not un-blacken the strip. Requiring an exact structural match here
  // hid a real blackout behind a fingerprint mismatch that has nothing to do
  // with what the LEDs are doing right now.
  return String(fresh.projectId || '') === String(project?.id || '');
}

// Named so a test can state the two call shapes that used to disagree and
// require them to be the same inputs. Card Home passes more props than a chip
// does; the journey question is answered from exactly these.
export function journeyAgreementInputs({ cardLink, cardLifecycle, commissioningFlow, project } = {}) {
  return { cardLink, cardLifecycle, commissioningFlow, project };
}

// ONE primary action per page. While the ladder's active task is offering the
// next step, everything below it on Card Home renders its controls as
// secondary — Card Home used to show three buttons styled as the primary
// action at once (the ladder's, the install action's, and the matching
// project panel's), so the owner had to work out which one the screen meant.
// The single exception is the install-project task with no resumable
// commissioning: it deliberately renders no button because the install action
// below IS its button, so the floor passes down.
//
// A pure function of the shared journey (blueprint H3): both the Setup ladder
// and Card Home derive it from the same `useSetupJourney` result instead of
// Card Home learning it a render late through a prop callback only Setup
// used to call.
export function ladderOwnsPrimary(journey, commissioningFlow) {
  return Boolean(journey)
    && !journey.setupComplete
    && !(journey.currentPhaseId === 'verify' && journey.taskId === 'confirm-visible-lights')
    && !(journey.currentPhaseId === 'connect'
      && journey.taskId === 'install-project'
      && !hasResumableCommissioning(commissioningFlow));
}

export function assembleSetupJourney({
  cardLink,
  cardLifecycle,
  commissioningFlow,
  project,
  evidence = emptyCardJourneyEvidence(),
  verification,
} = {}) {
  const journey = deriveSetupJourney({
    cardLink,
    cardLifecycle,
    commissioningFlow,
    project,
    resolution: setupJourneyResolution({ cardLink, project, evidence }),
    wiringStatus: setupJourneyWiringStatus({ cardLink, evidence }),
    verification,
  });
  // Merged onto the journey rather than fed into deriveSetupJourney: blackout
  // is orthogonal to every completion/task verdict that function already
  // makes (a blacked-out card can be a fully finished setup — that is
  // exactly F16), so every consumer of `useSetupJourney` gets it for free
  // without deriveSetupJourney needing to know it exists.
  return { ...journey, blackout: setupJourneyBlackout({ cardLink, project, evidence }) };
}
