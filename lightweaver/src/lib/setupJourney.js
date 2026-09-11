import { PORT_ROLE_STRIP } from './portRoles.js';
import { isUncountedHeadroomCount } from './discoveryCommit.js';

// Setup is expressed as four owner outcomes. Firmware and Wi-Fi are evidence
// blockers inside connection, never durable numbered work of their own.
export const SETUP_PHASE_IDS = Object.freeze(['connect', 'lights', 'layout', 'verify']);

// The three of those that gate the card. Placing lights in the artwork is a
// Studio-side design fact: the install control never reads `project.layout`,
// the install payload never carries it, and a pattern preview needs only a
// connected, non-blank card (surveyed 2026-09-11). So `layout` is reported as
// a phase with its own status, but it is never the current phase, never
// blocks `verify`, and never appears in what is still to do.
export const SETUP_CHAIN_IDS = Object.freeze(['connect', 'lights', 'verify']);

// The phases that still stand between this card and a finished install, in
// the order they have to happen. Empty once setup is complete.
export function missingPhases(journey) {
  return (journey?.phases || []).filter(phase => SETUP_CHAIN_IDS.includes(phase.id) && phase.status !== 'done');
}

// Written when Setup reports completion. A bare URL used to read this and
// skip the card; it now always lands on Card Home so the owner sees the
// connection first. The key is still written so existing browsers keep a
// completion note, but the shell no longer routes on it.
export const SETUP_SKIP_STORAGE_KEY = 'lw_setup_skip_v1';

export const CONNECTED_CARD_LINK_STATES = Object.freeze(['connected-direct', 'connected-bridge']);

export const SETUP_TASK_IDS = Object.freeze([
  'connect-card', 'pair-card', 'reconnect-card', 'recover-operation',
  'update-firmware', 'configure-wifi', 'install-project', 'discover-lights',
  'place-lights', 'test-and-save', 'confirm-visible-lights',
  'load-matching-project', 'open-patterns',
]);

export function setupTaskRoute(taskId) {
  const safeTask = SETUP_TASK_IDS.includes(taskId) ? taskId : 'connect-card';
  return `#screen=card&section=setup&task=${safeTask}`;
}

const SETUP_MODE_HOST = '192.168.4.1';

// Four lines a visual artist reads once and understands. They previously
// described the machinery ("resolve firmware or Wi-Fi only when they block
// connection", "final-light boundary", "verify exact readback") rather than
// what the owner is about to do.
const PHASE_COPY = Object.freeze({
  connect: {
    title: 'Connect to your card',
    detail: 'Find your Lightweaver card and make sure Studio is talking to that exact one.',
  },
  lights: {
    title: 'Find and verify the lights',
    detail: 'Find which port each strip is on, get its colours right, and count where it ends.',
  },
  layout: {
    title: 'Place lights in the artwork',
    detail: 'Draw where the strips run across your piece, and which way round they go.',
  },
  verify: {
    title: 'Test and save to card',
    detail: 'Send your project to the card and watch the real lights before making it permanent.',
  },
});

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function connectedExactCard(cardLink) {
  if (!CONNECTED_CARD_LINK_STATES.includes(cardLink?.state)) return false;
  const observedId = String(cardLink?.card?.id || cardLink?.readiness?.cardId || '').trim();
  if (!observedId) return false;
  const expectedId = String(cardLink?.expectedCard?.id || '').trim();
  return !expectedId || expectedId === observedId;
}

function commissioningStage(commissioningFlow) {
  return commissioningFlow?.stage ?? commissioningFlow?.flow?.stage ?? '';
}

function exactWiringTest(wiringStatus, cardLink) {
  if (!wiringStatus?.activationId) return false;
  const state = String(wiringStatus.state || '').trim().toLowerCase();
  const candidateState = String(wiringStatus.candidateState || '').trim().toLowerCase();
  if (state !== 'testing' && !['testing', 'awaiting-confirmation'].includes(candidateState)) return false;
  const expectedId = String(cardLink?.expectedCard?.id || cardLink?.card?.id || cardLink?.readiness?.cardId || '').trim();
  const observedId = String(wiringStatus.cardId || '').trim();
  if (!expectedId || observedId !== expectedId) return false;
  const expectedBuild = String(cardLink?.card?.buildId || cardLink?.readiness?.buildId || '').trim();
  return !expectedBuild || String(wiringStatus.buildId || '').trim() === expectedBuild;
}

function connectBlockers({ cardLink, cardLifecycle, commissioningFlow, resolution }) {
  const stage = commissioningStage(commissioningFlow);
  if (cardLink?.activity === 'failed' || cardLink?.reason === 'operation-uncertain') {
    return [{ id: 'recover-operation', phaseId: 'connect' }];
  }
  if (cardLink?.reason === 'firmware-too-old' || stage === 'install-safely') {
    return [{ id: 'firmware', phaseId: 'connect' }];
  }
  if (stage === 'set-up-card'
    && ['setup-required', 'setup-joined'].includes(commissioningFlow?.networkState)) {
    return [{ id: 'wifi', phaseId: 'connect' }];
  }
  if (stage === 'set-up-card') return [{ id: 'install-project', phaseId: 'connect' }];
  // Once the exact card has reached the factory/discovery portion of the
  // commissioning flow, its blank or temporary bench runtime is positive
  // setup evidence—not a generic project/recovery failure. Keep firmware,
  // Wi-Fi, and explicit commissioning stages above this branch, then allow
  // the established light-discovery journey to resume.
  const discoveryRuntime = connectedExactCard(cardLink) && (
    cardLink?.cardBlank === true
    || cardLink?.readiness?.runtimePhase === 'factory'
    || resolution?.provisionalSetup === true
  );
  const lifecycleTaskId = cardLifecycle?.setupTaskId;
  if (!discoveryRuntime) {
    if (lifecycleTaskId === 'update-firmware') return [{ id: 'firmware', phaseId: 'connect' }];
    if (lifecycleTaskId === 'pair-card') return [{ id: 'pair-card', phaseId: 'connect' }];
    if (['connect-card', 'reconnect-card'].includes(lifecycleTaskId)) {
      return [{ id: lifecycleTaskId, phaseId: 'connect' }];
    }
    if (lifecycleTaskId === 'install-project') return [{ id: 'install-project', phaseId: 'connect' }];
    // `load-matching-project` is a project question, not a connection one. Held
    // here as a connect blocker it made its own escape hatch unreachable: the
    // saved-match branch below (the only place that surfaces a real "load this
    // card's project" action) requires an empty blocker list, so the exact state
    // that needs the action could never reach it — Setup fell through to a
    // generic "Find my card" button that reopened the connection center, which
    // sent the owner straight back to Setup. Once the exact card is connected
    // and verified, let it flow to the resolution branches instead.
    if (lifecycleTaskId === 'load-matching-project' && !connectedExactCard(cardLink)) {
      return [{ id: 'load-matching-project', phaseId: 'connect' }];
    }
    if (lifecycleTaskId === 'recover-operation'
      && (cardLifecycle?.state === 'update-rolled-back' || !stage)) {
      return [{ id: 'recover-operation', phaseId: 'connect' }];
    }
  }
  if (cardLink?.reason === 'found-unpaired') return [{ id: 'pair-card', phaseId: 'connect' }];
  if (cardLink?.state === 'reconnecting' || cardLink?.state === 'reconnecting-bridge') {
    return [{ id: 'reconnect-card', phaseId: 'connect' }];
  }
  if (!connectedExactCard(cardLink)) return [{ id: 'connect-card', phaseId: 'connect' }];
  if (normalizeHost(cardLink?.host) === SETUP_MODE_HOST) return [{ id: 'wifi', phaseId: 'connect' }];
  return [];
}

function withTask(result) {
  const taskId = result.nextAction?.taskId || result.nextAction?.id || 'connect-card';
  return {
    ...result,
    taskId,
    route: setupTaskRoute(taskId),
    nextAction: { ...result.nextAction, taskId, route: setupTaskRoute(taskId) },
  };
}

function stripOutputs(project) {
  return (Array.isArray(project?.portRoles) ? project.portRoles : []).filter(entry => (
    entry
    && entry.role === PORT_ROLE_STRIP
    && Number.isFinite(Number(entry.pin))
  ));
}

function isCountedLight(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 && !isUncountedHeadroomCount(count);
}

export function setupTypedLedCountPin({ status, project } = {}) {
  const live = (Array.isArray(status?.outputs) ? status.outputs : [])
    .filter(output => Math.trunc(Number(output?.pixels) || 0) > 0);
  if (live.length === 1) {
    const pin = Number(live[0].pin ?? live[0].gpio);
    return Number.isFinite(pin) ? pin : null;
  }
  const ports = stripOutputs(project);
  if (ports.length === 1) return Number(ports[0].pin);
  return null;
}

export function setupOffersTypedLedCount({ status, project } = {}) {
  if (setupTypedLedCountPin({ status, project }) == null) return false;
  const live = (Array.isArray(status?.outputs) ? status.outputs : [])
    .filter(output => Math.trunc(Number(output?.pixels) || 0) > 0);
  if (live.length && live.every(output => isUncountedHeadroomCount(output.pixels))) return true;
  const ports = stripOutputs(project);
  if (!ports.length) return true;
  return !ports.every(entry => isCountedLight(entry.pixelCount));
}

function confirmedColor(project) {
  const led = project?.devices?.standaloneController?.led;
  return led?.colorOrderConfirmed === true && Boolean(String(led?.colorOrder || '').trim());
}

function lightProgress(project) {
  const outputs = stripOutputs(project);
  const outputDone = outputs.length > 0;
  const colorDone = outputDone && confirmedColor(project);
  const countDone = colorDone && outputs.length > 0 && outputs.every(output => isCountedLight(output.pixelCount));
  // StripDiscovery persists a count only after its final/next-dark marker has
  // been accepted, so the saved count is also the durable boundary evidence.
  const boundaryDone = countDone;
  const states = [
    ['output', outputDone],
    ['color', colorDone],
    ['count', countDone],
    ['boundary', boundaryDone],
  ];
  const currentIndex = states.findIndex(([, done]) => !done);
  return states.map(([id, done], index) => ({
    id,
    status: done ? 'done' : index === currentIndex ? 'current' : 'locked',
  }));
}

function lightsComplete(progress, resolution) {
  // The temporary Find-my-strips setup staying on the card is not an unfinished
  // lights phase — it is what the discovery panel PROMISES will happen: "the
  // card keeps playing that setup … until your own project replaces it at the
  // end". Replacing it is phase 4's job. Holding phase 2 open for it pinned the
  // owner on a step whose four checks were all ticked green, with a button that
  // only re-opened what was already done, and the only exit — phases 3 and 4 —
  // refused to become reachable. A loop with no way out.
  //
  // `resolution` stays in the signature: the final "setup complete" verdict
  // still refuses while a temporary setup is on the card, which is where that
  // fact genuinely belongs.
  return progress.every(item => item.status === 'done');
}

function layoutProgress(project) {
  const layout = project?.layout;
  const placementDone = layout?.starterPending === false
    && Array.isArray(layout.strips)
    && layout.strips.length > 0;
  return [
    { id: 'placement', status: placementDone ? 'done' : 'current' },
  ];
}

function layoutComplete(progress) {
  return progress.every(item => item.status === 'done');
}

// `verification` is supplied by NO production caller — not lw-setup.jsx, not
// app.jsx, not SetupJourneyChip.jsx (verified 2026-08-23, still true
// 2026-09-06). It was designed as a second, independent way for phase 4 to
// complete — the card confirmed the send, Studio confirmed the exact readback,
// and the owner said they saw the lights — and was never wired up.
//
// `confirm-visible-lights` itself is NOT unreachable: `exactWiringTest` above
// produces it whenever the exact card reports a live wiring test
// (state `testing` / candidate `awaiting-confirmation` with a matching card
// and build), and every consumer now sees that through the shared evidence
// store (lib/setupJourneyInputs.js). tests/journey-continuity.spec.ts [J13]
// exercises exactly that. Only the `verification`-driven path below is dead.
//
// The ladder still finishes, through the `installedMatch` early return above,
// and tests/card-state-matrix.spec.ts [T6] holds that exit open against a card
// and project that genuinely agree. So this is dead weight rather than a live
// defect — but it is dead weight that READS like the completion rule, which is
// worse than either being wired or being gone. Wire it to real evidence or
// delete it; do not leave the next reader believing phase 4 is gated on a
// visible confirmation that never happens.
function exactVerificationComplete(verification) {
  return verification?.sent === true
    && verification?.exactReadback === true
    && verification?.visibleConfirmed === true;
}

function nextVerificationAction(verification) {
  if (verification?.sent === true && verification?.exactReadback === true && verification?.visibleConfirmed !== true) {
    return { id: 'confirm-visible-lights', phaseId: 'verify' };
  }
  return { id: 'test-and-save', phaseId: 'verify' };
}

function phasesFor(currentPhaseId, lightsProgress, currentLayoutProgress, complete = false) {
  const currentIndex = complete ? SETUP_CHAIN_IDS.length : SETUP_CHAIN_IDS.indexOf(currentPhaseId);
  return SETUP_PHASE_IDS.map(id => {
    // Artwork placement stands outside the chain: done when drawn, otherwise
    // `optional` — never current, never upcoming, never in the way.
    if (id === 'layout') {
      return {
        id,
        ...PHASE_COPY[id],
        status: layoutComplete(currentLayoutProgress) ? 'done' : 'optional',
        progress: currentLayoutProgress,
      };
    }
    const index = SETUP_CHAIN_IDS.indexOf(id);
    return {
      id,
      ...PHASE_COPY[id],
      status: complete || index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
      ...(id === 'lights' ? { progress: lightsProgress } : {}),
    };
  });
}

export function deriveSetupJourney({
  cardLink,
  cardLifecycle,
  commissioningFlow,
  project,
  resolution,
  verification,
  wiringStatus,
} = {}) {
  const blockers = connectBlockers({ cardLink, cardLifecycle, commissioningFlow, resolution });
  const progress = lightProgress(project);
  const currentLayoutProgress = layoutProgress(project);

  if (exactWiringTest(wiringStatus, cardLink)) {
    return withTask({
      diagnosis: { state: 'setup-required' },
      phases: phasesFor('verify', progress, currentLayoutProgress),
      blockers: [],
      currentPhaseId: 'verify',
      nextAction: { id: 'confirm-visible-lights', taskId: 'confirm-visible-lights', phaseId: 'verify' },
      resumeDestination: null,
      setupComplete: false,
    });
  }

  if (commissioningStage(commissioningFlow) === 'check-lights') {
    return withTask({
      diagnosis: { state: 'setup-required' },
      phases: phasesFor('verify', progress, currentLayoutProgress),
      blockers: [],
      currentPhaseId: 'verify',
      nextAction: { id: 'test-and-save', taskId: 'test-and-save', phaseId: 'verify' },
      resumeDestination: null,
      setupComplete: false,
    });
  }

  const installedMatch = blockers.length === 0
    && ((resolution?.matchesCurrentProject === true
      && resolution?.playbackAccess === 'ready'
      && resolution?.provisionalSetup !== true)
      || cardLifecycle?.state === 'ready');
  if (installedMatch) {
    return withTask({
      diagnosis: { state: 'installed-match' },
      phases: phasesFor(null, progress, currentLayoutProgress, true),
      blockers: [],
      currentPhaseId: null,
      nextAction: { id: 'open-patterns' },
      resumeDestination: 'patterns',
      setupComplete: true,
    });
  }

  const savedMatch = blockers.length === 0
    && resolution?.savedProjectMatch === true
    && resolution?.provisionalSetup !== true;
  if (savedMatch) {
    return withTask({
      diagnosis: { state: 'saved-match' },
      phases: phasesFor('connect', progress, currentLayoutProgress),
      blockers: [],
      currentPhaseId: null,
      nextAction: { id: 'load-matching-project' },
      resumeDestination: null,
      setupComplete: false,
    });
  }

  // The exact card is connected and healthy, but the project it holds is not
  // the one open in Studio and no saved copy resolved it. That is an actionable
  // project question — adopt what the card holds, or keep setting up the open
  // project — not a connection failure, so it keeps the connect phase ACTIVE
  // with a real load action instead of being folded into the blocker list,
  // where it only ever produced another "Find my card".
  const cardProjectUnresolved = blockers.length === 0
    && connectedExactCard(cardLink)
    && cardLifecycle?.setupTaskId === 'load-matching-project'
    && resolution?.provisionalSetup !== true;
  if (cardProjectUnresolved) {
    return withTask({
      diagnosis: { state: 'card-project-unresolved' },
      phases: phasesFor('connect', progress, currentLayoutProgress),
      blockers: [],
      currentPhaseId: 'connect',
      nextAction: { id: 'load-matching-project', phaseId: 'connect' },
      resumeDestination: null,
      setupComplete: false,
    });
  }

  let currentPhaseId;
  let nextAction;
  if (blockers.length > 0) {
    currentPhaseId = 'connect';
    nextAction = {
      id: blockers[0].id === 'firmware' ? 'install-firmware' : blockers[0].id,
      taskId: blockers[0].id === 'firmware'
        ? 'update-firmware'
        : blockers[0].id === 'wifi'
          ? 'configure-wifi'
          : blockers[0].id,
      phaseId: 'connect',
    };
  } else if (!lightsComplete(progress, resolution)) {
    currentPhaseId = 'lights';
    nextAction = { id: 'discover-lights', phaseId: 'lights' };
  } else if (!exactVerificationComplete(verification)) {
    currentPhaseId = 'verify';
    nextAction = nextVerificationAction(verification);
  } else if (resolution?.provisionalSetup === true) {
    // The card is still holding the TEMPORARY light-finding setup. Whatever
    // the recorded progress says, the owner's real project has not replaced it
    // yet, so this is not a finished installation — the screen's own banner
    // says as much ("discovery evidence, not a finished installation") while
    // the ladder above it printed SETUP COMPLETE with four ticks. One of them
    // was lying, and it was the ladder. What remains is the last phase: send
    // the real project and confirm it on the actual lights.
    currentPhaseId = 'verify';
    nextAction = { id: 'test-and-save', taskId: 'test-and-save', phaseId: 'verify' };
  } else {
    return withTask({
      diagnosis: { state: 'setup-complete' },
      phases: phasesFor(null, progress, currentLayoutProgress, true),
      blockers: [],
      currentPhaseId: null,
      nextAction: { id: 'open-patterns' },
      resumeDestination: 'patterns',
      setupComplete: true,
    });
  }

  return withTask({
    diagnosis: {
      state: blockers[0]?.id === 'connect-card' ? 'needs-card' : currentPhaseId === 'connect' ? 'connect-blocked' : 'setup-required',
    },
    phases: phasesFor(currentPhaseId, progress, currentLayoutProgress),
    blockers,
    currentPhaseId,
    nextAction,
    resumeDestination: null,
    setupComplete: false,
  });
}

export function isSetupComplete(journey) {
  return journey?.setupComplete === true;
}
