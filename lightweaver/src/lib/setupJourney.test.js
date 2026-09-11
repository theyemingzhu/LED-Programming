import test from 'node:test';
import assert from 'node:assert/strict';

import * as setupJourney from './setupJourney.js';

const { deriveSetupJourney, isSetupComplete, missingPhases, SETUP_PHASE_IDS } = setupJourney;

const FACTORY_STATUS = {
  app: 'Lightweaver',
  cardId: 'lw-setup-test',
  provisioningContractVersion: 1,
  firmwareVersion: '1.4.0',
  buildId: 'build-setup-test',
  bootId: 'boot-setup-test',
  runtimePhase: 'factory',
  knownGoodProject: false,
  commandReady: false,
  playbackReady: false,
  outputReady: false,
};

const READY_STATUS = {
  ...FACTORY_STATUS,
  runtimePhase: 'ready',
  knownGoodProject: true,
  commandReady: true,
  playbackReady: true,
  outputReady: true,
};

const connectedCard = (readiness = FACTORY_STATUS, host = '192.168.18.70') => ({
  state: 'connected-direct',
  host,
  card: { id: 'lw-setup-test', firmwareVersion: '1.4.0', buildId: 'build-setup-test' },
  readiness,
});

const discoveredProject = () => ({
  id: 'lotus-gate',
  name: 'Lotus Gate',
  portRoles: [{ pin: 18, role: 'strip', pixelCount: 41 }],
  devices: { standaloneController: { led: { colorOrder: 'GRB', colorOrderConfirmed: true } } },
  layout: { starterPending: true, strips: [] },
});

// Discovery finished AND placed in the artwork with direction verified, so the
// only phase that can still be outstanding is the final one.
const verifiedProject = () => ({
  ...discoveredProject(),
  layout: {
    starterPending: false,
    strips: [{ id: 'strip-1' }],
    wiring: {
      verified: true,
      runs: [{ type: 'strip', id: 'run-1', verified: true, physicalDirection: 'source-forward' }],
    },
  },
});

const phaseMap = journey => Object.fromEntries(journey.phases.map(phase => [phase.id, phase]));

test('automatic diagnosis precedes four numbered outcome phases', () => {
  const journey = deriveSetupJourney({});

  assert.deepEqual(SETUP_PHASE_IDS, ['connect', 'lights', 'layout', 'verify']);
  assert.deepEqual(journey.phases.map(phase => phase.id), SETUP_PHASE_IDS);
  assert.equal(journey.currentPhaseId, 'connect');
  assert.equal(journey.diagnosis.state, 'needs-card');
  assert.deepEqual(journey.blockers.map(blocker => blocker.id), ['connect-card']);
  assert.equal(phaseMap(journey).connect.status, 'current');
  assert.equal(phaseMap(journey).lights.status, 'upcoming');
  assert.equal(isSetupComplete(journey), false);
  assert.equal(journey.taskId, 'connect-card');
  assert.equal(journey.route, '#screen=card&section=setup&task=connect-card');
});

test('every actionable diagnosis owns one stable Setup task and route', () => {
  const cases = [
    [{ cardLink: { reason: 'found-unpaired' } }, 'pair-card'],
    [{ cardLink: { state: 'reconnecting', expectedCard: { id: 'lw-setup-test' } } }, 'reconnect-card'],
    [{ cardLink: { activity: 'failed', reason: 'operation-uncertain' } }, 'recover-operation'],
    [{ commissioningFlow: { stage: 'install-safely' } }, 'update-firmware'],
    [{ commissioningFlow: { stage: 'set-up-card', networkState: 'setup-required' } }, 'configure-wifi'],
    [{ cardLink: connectedCard(), commissioningFlow: { stage: 'set-up-card', networkState: 'station-detected', cardAcknowledgedAt: 'now' } }, 'install-project'],
    [{ cardLink: connectedCard(), commissioningFlow: { stage: 'check-lights' } }, 'test-and-save'],
    [{ cardLink: connectedCard(FACTORY_STATUS, '192.168.4.1') }, 'configure-wifi'],
    [{ cardLink: connectedCard() }, 'discover-lights'],
  ];

  for (const [input, taskId] of cases) {
    const journey = deriveSetupJourney(input);
    assert.equal(journey.taskId, taskId);
    assert.equal(journey.nextAction.taskId, taskId);
    assert.equal(journey.route, `#screen=card&section=setup&task=${taskId}`);
  }
});

test('firmware and Wi-Fi are conditional blockers inside connect', () => {
  const firmware = deriveSetupJourney({
    commissioningFlow: { stage: 'install-safely' },
  });
  assert.equal(firmware.currentPhaseId, 'connect');
  assert.ok(firmware.blockers.some(blocker => blocker.id === 'firmware'));

  const wifi = deriveSetupJourney({
    cardLink: connectedCard(FACTORY_STATUS, '192.168.4.1'),
  });
  assert.equal(wifi.currentPhaseId, 'connect');
  assert.deepEqual(wifi.blockers.map(blocker => blocker.id), ['wifi']);
  assert.equal(wifi.phases.some(phase => phase.id === 'firmware' || phase.id === 'wifi'), false);
});

test('a factory blank exact card goes to light discovery before Layout', () => {
  const journey = deriveSetupJourney({
    cardLink: { ...connectedCard(), cardBlank: true },
    cardLifecycle: { state: 'setup-required', setupTaskId: 'install-project' },
  });
  const phases = phaseMap(journey);

  assert.equal(phases.connect.status, 'done');
  assert.equal(phases.lights.status, 'current');
  // Artwork placement is outside the chain: never upcoming, only optional or done.
  assert.equal(phases.layout.status, 'optional');
  assert.equal(journey.currentPhaseId, 'lights');
  assert.equal(journey.nextAction.id, 'discover-lights');
});

test('light discovery keeps color ahead of count and last-light boundary work', () => {
  const project = discoveredProject();
  project.devices.standaloneController.led.colorOrderConfirmed = false;
  const journey = deriveSetupJourney({
    cardLink: connectedCard(),
    project,
  });
  const progress = Object.fromEntries(phaseMap(journey).lights.progress.map(item => [item.id, item.status]));

  assert.equal(progress.output, 'done');
  assert.equal(progress.color, 'current');
  assert.equal(progress.count, 'locked');
  assert.equal(progress.boundary, 'locked');
  assert.equal(progress.direction, undefined);
});

// A temporary bench setup is never setup COMPLETION — that half of the old
// contract stands. What it must not do is hold the lights phase open after
// every light fact is established: the discovery panel promises the card keeps
// playing that setup until the owner's project replaces it at the end, so its
// presence is the expected state between phase 2 and phase 4. Holding phase 2
// open for it left the owner on a step with four green ticks and no way out.
test('temporary bench configuration is not setup completion, and does not pin the lights phase', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    cardLifecycle: { state: 'discovery-setup', setupTaskId: 'discover-lights' },
    project: discoveredProject(),
    resolution: { provisionalSetup: true, matchesCurrentProject: true, playbackAccess: 'ready' },
  });

  assert.equal(isSetupComplete(journey), false);
  assert.equal(phaseMap(journey).lights.status, 'done');
  // Lights done on a bench card goes straight to test-and-save; drawing the
  // artwork was never a precondition of writing the card.
  assert.equal(journey.currentPhaseId, 'verify');
});

// Every phase satisfied EXCEPT that the card still holds the temporary setup:
// the remaining work is the last phase, replacing it with the real project.
test('a fully progressed project still holding a temporary setup lands on the final phase', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    cardLifecycle: { state: 'discovery-setup', setupTaskId: 'discover-lights' },
    project: verifiedProject(),
    resolution: { provisionalSetup: true, matchesCurrentProject: true, playbackAccess: 'ready' },
  });

  assert.equal(isSetupComplete(journey), false);
  assert.equal(journey.currentPhaseId, 'verify');
  assert.equal(journey.taskId, 'test-and-save');
});

test('a recovering exact factory card resumes discovery instead of generic recovery', () => {
  const journey = deriveSetupJourney({
    cardLink: { ...connectedCard(), activity: 'recovering', cardBlank: true },
    cardLifecycle: { state: 'recovering', setupTaskId: 'recover-operation' },
  });

  assert.equal(journey.currentPhaseId, 'lights');
  assert.equal(journey.taskId, 'discover-lights');
  assert.deepEqual(journey.blockers, []);
});

test('the 256 find-my-strips ceiling is not a counted light', () => {
  const project = discoveredProject();
  project.portRoles = [{ pin: 18, role: 'strip', pixelCount: 256 }];
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    project,
    resolution: { provisionalSetup: true },
  });
  const progress = Object.fromEntries(phaseMap(journey).lights.progress.map(item => [item.id, item.status]));

  assert.equal(progress.output, 'done');
  assert.equal(progress.count, 'current');
  assert.equal(journey.currentPhaseId, 'lights');
  assert.equal(setupJourney.setupOffersTypedLedCount({
    status: { outputs: [{ pin: 18, pixels: 256 }] },
    project,
  }), true);
  assert.equal(setupJourney.setupTypedLedCountPin({
    status: { outputs: [{ pin: 18, pixels: 256 }] },
    project,
  }), 18);
});

test('a starter project count does not hide the Setup LED count field on a 256-headroom card', () => {
  assert.equal(setupJourney.setupOffersTypedLedCount({
    status: {
      projectId: 'lightweaver-bench-discovery-v1',
      outputs: [{ pin: 18, pixels: 256 }],
    },
    project: {
      portRoles: [{ pin: 18, role: 'strip', pixelCount: 37 }],
      layout: { strips: [{ pixelCount: 37 }] },
    },
  }), true);
});

test('existing discovery evidence goes straight to test-and-save; artwork placement stays optional', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    project: discoveredProject(),
  });

  assert.equal(phaseMap(journey).lights.status, 'done');
  assert.equal(phaseMap(journey).layout.status, 'optional');
  assert.equal(journey.currentPhaseId, 'verify');
  assert.equal(journey.nextAction.id, 'test-and-save');
  assert.equal(journey.taskId, 'test-and-save');
  assert.deepEqual(missingPhases(journey).map(phase => phase.id), ['verify']);
});

test('what is still to do never lists artwork placement, and is empty once installed', () => {
  const blank = deriveSetupJourney({
    cardLink: { ...connectedCard(), cardBlank: true },
    cardLifecycle: { state: 'setup-required', setupTaskId: 'install-project' },
  });
  assert.deepEqual(missingPhases(blank).map(phase => phase.id), ['lights', 'verify']);

  const installed = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    cardLifecycle: { state: 'ready' },
    project: discoveredProject(),
    resolution: { matchesCurrentProject: true, playbackAccess: 'ready' },
  });
  assert.equal(isSetupComplete(installed), true);
  assert.deepEqual(missingPhases(installed), []);
});

test('Layout is required before final test and save', () => {
  const project = discoveredProject();
  project.layout = {
    starterPending: false,
    strips: [{ id: 'strip-1', pixelCount: 41 }],
    wiring: { verified: true, outputs: [{ id: 'out-1', pin: 18, runIds: ['run-1'] }], runs: [{ id: 'run-1', type: 'strip', physicalDirection: 'source-forward', verified: true }] },
  };
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    project,
  });

  assert.equal(phaseMap(journey).layout.status, 'done');
  assert.deepEqual(phaseMap(journey).layout.progress, [
    { id: 'placement', status: 'done' },
  ]);
  assert.equal(phaseMap(journey).verify.status, 'current');
  assert.equal(journey.currentPhaseId, 'verify');
  assert.equal(journey.nextAction.id, 'test-and-save');
  assert.equal(journey.route, '#screen=card&section=setup&task=test-and-save');
});

test('placed artwork advances to the card test without a second direction acknowledgement', () => {
  const project = discoveredProject();
  project.layout = {
    starterPending: false,
    strips: [{ id: 'strip-1', pixelCount: 41 }],
    wiring: {
      verified: false,
      outputs: [{ id: 'out-1', pin: 18, runIds: ['run-1'] }],
      runs: [{ id: 'run-1', type: 'strip', physicalDirection: 'source-forward', verified: false }],
    },
  };
  const journey = deriveSetupJourney({ cardLink: connectedCard(READY_STATUS), project });

  assert.equal(journey.currentPhaseId, 'verify');
  assert.deepEqual(phaseMap(journey).layout.progress, [
    { id: 'placement', status: 'done' },
  ]);
  assert.equal(journey.nextAction.id, 'test-and-save');
});

test('an exact card testing staged wiring stays on the final phase while its runtime restarts', () => {
  const project = verifiedProject();
  const journey = deriveSetupJourney({
    cardLink: {
      ...connectedCard(READY_STATUS),
      state: 'revalidating',
      readiness: { ...READY_STATUS, runtimePhase: 'recovering', commandReady: false },
    },
    cardLifecycle: { state: 'verifying', setupTaskId: 'reconnect-card' },
    project,
    wiringStatus: {
      state: 'testing',
      candidateState: 'awaiting-confirmation',
      activationId: 'candidate-41',
      cardId: 'lw-setup-test',
      buildId: 'build-setup-test',
    },
  });

  assert.equal(journey.currentPhaseId, 'verify');
  assert.equal(journey.taskId, 'confirm-visible-lights');
  assert.deepEqual(journey.blockers, []);
});

test('API success and exact readback still require visible confirmation', () => {
  const project = discoveredProject();
  project.layout = {
    starterPending: false,
    strips: [{ id: 'strip-1', pixelCount: 41 }],
    wiring: { verified: true, runs: [{ id: 'run-1', type: 'strip', physicalDirection: 'source-forward', verified: true }] },
  };
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    project,
    verification: { sent: true, exactReadback: true, visibleConfirmed: false },
  });

  assert.equal(journey.currentPhaseId, 'verify');
  assert.equal(journey.nextAction.id, 'confirm-visible-lights');
  assert.equal(journey.taskId, 'confirm-visible-lights');
  assert.equal(isSetupComplete(journey), false);
});

test('exact readback plus explicit visible confirmation completes Setup', () => {
  const project = discoveredProject();
  project.layout = {
    starterPending: false,
    strips: [{ id: 'strip-1', pixelCount: 41 }],
    wiring: { verified: true, runs: [{ id: 'run-1', type: 'strip', physicalDirection: 'source-forward', verified: true }] },
  };
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    project,
    verification: { sent: true, exactReadback: true, visibleConfirmed: true },
  });

  assert.equal(journey.currentPhaseId, null);
  assert.equal(journey.setupComplete, true);
  assert.equal(journey.nextAction.id, 'open-patterns');
  assert.equal(isSetupComplete(journey), true);
});

test('an existing installed exact project resumes without replaying blank setup', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    project: { id: 'lotus-gate', name: 'Lotus Gate' },
    resolution: { matchesCurrentProject: true, playbackAccess: 'ready', provisionalSetup: false },
  });

  assert.equal(journey.diagnosis.state, 'installed-match');
  assert.equal(journey.resumeDestination, 'patterns');
  assert.equal(journey.currentPhaseId, null);
  assert.equal(journey.setupComplete, true);
});

test('a saved exact match offers adoption instead of blank discovery', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    resolution: { savedProjectMatch: true, playbackAccess: 'ready', provisionalSetup: false },
  });

  assert.equal(journey.diagnosis.state, 'saved-match');
  assert.equal(journey.nextAction.id, 'load-matching-project');
  assert.notEqual(journey.nextAction.id, 'discover-lights');
});

test('shared lifecycle diagnosis overrides stale per-screen link interpretation', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    cardLifecycle: {
      state: 'reconnecting',
      setupTaskId: 'reconnect-card',
    },
    project: { id: 'lotus-gate', name: 'Lotus Gate' },
    resolution: { matchesCurrentProject: true, playbackAccess: 'ready', provisionalSetup: false },
  });

  assert.equal(journey.currentPhaseId, 'connect');
  assert.equal(journey.taskId, 'reconnect-card');
  assert.equal(journey.setupComplete, false);
});

test('shared lifecycle maps every cross-surface state to the same Setup destination', () => {
  const cases = [
    ['reconnecting', 'reconnect-card', 'reconnect-card'],
    ['verifying', 'reconnect-card', 'reconnect-card'],
    ['wrong-card', 'connect-card', 'connect-card'],
    ['target-mismatch', 'update-firmware', 'update-firmware'],
    ['project-changed', 'load-matching-project', 'load-matching-project'],
    ['found-unpaired', 'pair-card', 'pair-card'],
    ['recovering', 'recover-operation', 'recover-operation'],
    ['updating', 'recover-operation', 'recover-operation'],
    ['update-recovering', 'recover-operation', 'recover-operation'],
    ['update-rolled-back', 'recover-operation', 'recover-operation'],
    ['setup-required', 'install-project', 'install-project'],
    ['project-mismatch', 'load-matching-project', 'load-matching-project'],
    ['ready', 'open-patterns', 'open-patterns'],
  ];

  for (const [state, setupTaskId, expectedTask] of cases) {
    const journey = deriveSetupJourney({
      cardLink: connectedCard(READY_STATUS),
      cardLifecycle: { state, setupTaskId },
      project: { id: 'lotus-gate', name: 'Lotus Gate' },
    });
    assert.equal(journey.taskId, expectedTask, state);
  }
});

test('a connected exact card holding an unmatched project gets a load action, not another connection prompt', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    cardLifecycle: { state: 'project-mismatch', setupTaskId: 'load-matching-project' },
    project: { id: 'lotus-gate', name: 'Lotus Gate' },
  });

  // The connect phase stays ACTIVE so Setup renders a real task for it. Held as
  // a blocker it produced a "Find my card" button that reopened the connection
  // center, whose only exit routed back to this same step.
  assert.equal(journey.currentPhaseId, 'connect');
  assert.equal(journey.taskId, 'load-matching-project');
  assert.deepEqual(journey.blockers, []);
  assert.notEqual(journey.taskId, 'connect-card');
});

test('a saved match reaches its adoption branch once the exact card is connected', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    cardLifecycle: { state: 'project-mismatch', setupTaskId: 'load-matching-project' },
    project: { id: 'lotus-gate', name: 'Lotus Gate' },
    resolution: { savedProjectMatch: true, playbackAccess: 'ready', provisionalSetup: false },
  });

  assert.equal(journey.diagnosis.state, 'saved-match');
  assert.equal(journey.taskId, 'load-matching-project');
});

test('an installed exact match still resolves ahead of the unmatched-project branch', () => {
  const journey = deriveSetupJourney({
    cardLink: connectedCard(READY_STATUS),
    cardLifecycle: { state: 'project-mismatch', setupTaskId: 'load-matching-project' },
    project: { id: 'lotus-gate', name: 'Lotus Gate' },
    resolution: { matchesCurrentProject: true, playbackAccess: 'ready', provisionalSetup: false },
  });

  assert.equal(journey.diagnosis.state, 'installed-match');
  assert.equal(journey.setupComplete, true);
});

test('a disconnected card with a project-mismatch lifecycle still blocks on connection', () => {
  const journey = deriveSetupJourney({
    cardLink: { state: 'disconnected' },
    cardLifecycle: { state: 'project-mismatch', setupTaskId: 'load-matching-project' },
    project: { id: 'lotus-gate', name: 'Lotus Gate' },
  });

  assert.equal(journey.currentPhaseId, 'connect');
  assert.equal(journey.blockers[0].id, 'load-matching-project');
});
