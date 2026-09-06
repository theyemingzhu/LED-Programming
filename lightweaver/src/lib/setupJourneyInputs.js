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

// Named so a test can state the two call shapes that used to disagree and
// require them to be the same inputs. Card Home passes more props than a chip
// does; the journey question is answered from exactly these.
export function journeyAgreementInputs({ cardLink, cardLifecycle, commissioningFlow, project } = {}) {
  return { cardLink, cardLifecycle, commissioningFlow, project };
}

export function assembleSetupJourney({
  cardLink,
  cardLifecycle,
  commissioningFlow,
  project,
  evidence = emptyCardJourneyEvidence(),
  verification,
} = {}) {
  return deriveSetupJourney({
    cardLink,
    cardLifecycle,
    commissioningFlow,
    project,
    resolution: setupJourneyResolution({ cardLink, project, evidence }),
    wiringStatus: setupJourneyWiringStatus({ cardLink, evidence }),
    verification,
  });
}
