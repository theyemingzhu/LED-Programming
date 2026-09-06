import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveSetupJourney } from './setupJourney.js';
import { assembleSetupJourney, journeyAgreementInputs } from './setupJourneyInputs.js';
import { emptyCardJourneyEvidence, journeyEvidenceSnapshot } from './cardJourneyEvidence.js';

// The defect this module exists to end: `deriveSetupJourney` is the one journey
// decision, but its consumers used to feed it different evidence. Card Home read
// the card's wiring status and project resolution itself and passed them in; the
// Patterns/Playlist chip and the shell's task router called the same function
// with neither. Same card, same instant, two different answers — Card Home said
// "confirm the lights", the chip said "setup complete" and vanished.
//
// Every assertion below drives BOTH shapes through `assembleSetupJourney` and
// requires them to agree, and to agree with the full-evidence verdict.

const READY_STATUS = {
  app: 'Lightweaver',
  cardId: 'lw-journey-test',
  provisioningContractVersion: 1,
  firmwareVersion: '1.4.0',
  buildId: 'build-journey-test',
  bootId: 'boot-journey-1',
  runtimePhase: 'ready',
  knownGoodProject: true,
  commandReady: true,
  playbackReady: true,
  outputReady: true,
};

const FACTORY_STATUS = {
  ...READY_STATUS,
  runtimePhase: 'factory',
  knownGoodProject: false,
  commandReady: false,
  playbackReady: false,
  outputReady: false,
};

const connectedCard = (readiness = READY_STATUS, overrides = {}) => ({
  state: 'connected-direct',
  host: '192.168.18.70',
  card: { id: 'lw-journey-test', firmwareVersion: '1.4.0', buildId: 'build-journey-test' },
  readiness,
  ...overrides,
});

const discoveredProject = () => ({
  id: 'lotus-gate',
  name: 'Lotus Gate',
  portRoles: [{ pin: 18, role: 'strip', pixelCount: 41 }],
  devices: { standaloneController: { led: { colorOrder: 'GRB', colorOrderConfirmed: true } } },
  layout: { starterPending: true, strips: [] },
});

const verifiedProject = () => ({
  ...discoveredProject(),
  layout: { starterPending: false, strips: [{ id: 'strip-1' }] },
});

const ACTIVE_WIRING_TEST = Object.freeze({
  state: 'testing',
  candidateState: 'awaiting-confirmation',
  activationId: 'candidate-41',
  cardId: 'lw-journey-test',
  buildId: 'build-journey-test',
});

// One fixture, assembled twice: once the way a working screen's chip reaches the
// journey, once the way Card Home's Setup screen does. Both now read the same
// published evidence, so "the chip's subset" is a call shape, not a second set
// of facts.
function bothWays({ cardLink, cardLifecycle, commissioningFlow, project, evidence }) {
  const chip = assembleSetupJourney({ cardLink, cardLifecycle, commissioningFlow, project, evidence });
  const setup = assembleSetupJourney({
    ...journeyAgreementInputs({ cardLink, cardLifecycle, commissioningFlow, project }),
    evidence,
  });
  assert.equal(chip.taskId, setup.taskId, 'chip and Setup must name one task');
  assert.equal(chip.setupComplete, setup.setupComplete, 'chip and Setup must agree on completion');
  return chip;
}

test('an active exact wiring test reaches every consumer, not just the screen that read it', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const evidence = journeyEvidenceSnapshot({
    cardLink,
    wiringStatus: ACTIVE_WIRING_TEST,
    status: { ...READY_STATUS, projectId: 'lotus-gate' },
    resolutionKind: 'matches-current',
    matchesOpenProject: true,
    projectId: project.id,
  });

  // What the chip and the shell router saw before: no wiring status at all.
  const blind = deriveSetupJourney({ cardLink, cardLifecycle: { state: 'ready' }, project });
  assert.equal(blind.setupComplete, true);
  assert.notEqual(blind.taskId, 'confirm-visible-lights');

  const journey = bothWays({ cardLink, cardLifecycle: { state: 'ready' }, project, evidence });
  assert.equal(journey.taskId, 'confirm-visible-lights');
  assert.equal(journey.setupComplete, false);
  assert.equal(journey.currentPhaseId, 'verify');
});

test('a late reply from a previous boot never advances the journey', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const stale = journeyEvidenceSnapshot({
    cardLink: connectedCard({ ...READY_STATUS, bootId: 'boot-journey-0' }),
    wiringStatus: ACTIVE_WIRING_TEST,
    status: READY_STATUS,
    resolutionKind: 'matches-current',
    matchesOpenProject: true,
    projectId: project.id,
  });

  const journey = bothWays({ cardLink, cardLifecycle: { state: 'ready' }, project, evidence: stale });
  assert.equal(journey.taskId, 'open-patterns');
  assert.equal(journey.setupComplete, true);
});

test('a temporary find-my-strips setup is the same unfinished journey everywhere', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const evidence = journeyEvidenceSnapshot({
    cardLink,
    status: { ...READY_STATUS, provisionalSetup: true, projectId: 'lotus-gate' },
    resolutionKind: 'matches-current',
    matchesOpenProject: true,
    projectId: project.id,
  });

  // `cardLifecycle.state === 'ready'` is its own completion exit inside
  // deriveSetupJourney, so the lifecycle here is the one a card holding the
  // temporary setup actually reports.
  const journey = bothWays({
    cardLink,
    cardLifecycle: { state: 'discovery-setup', setupTaskId: 'discover-lights' },
    project,
    evidence,
  });
  assert.equal(journey.taskId, 'test-and-save');
  assert.equal(journey.setupComplete, false);
});

test('the assembled journey equals the full-evidence verdict Setup used to compute alone', () => {
  const cases = [
    // [name, cardLink, cardLifecycle, project, published evidence, legacy resolution, legacy wiring]
    [
      'factory-blank card',
      connectedCard(FACTORY_STATUS, { cardBlank: true }),
      { state: 'blank', setupTaskId: 'install-project' },
      discoveredProject(),
      { status: FACTORY_STATUS, resolutionKind: 'none' },
      null,
      null,
    ],
    [
      'provisional setup with all project progress done',
      connectedCard(),
      { state: 'discovery-setup', setupTaskId: 'discover-lights' },
      verifiedProject(),
      {
        status: { ...READY_STATUS, provisionalSetup: true },
        resolutionKind: 'bench',
        matchesOpenProject: true,
      },
      { matchesCurrentProject: true, playbackAccess: 'ready', provisionalSetup: true },
      null,
    ],
    [
      'configured ready card',
      connectedCard(),
      { state: 'ready', setupTaskId: '', exactProject: true },
      verifiedProject(),
      { status: READY_STATUS, resolutionKind: 'matches-current', matchesOpenProject: true },
      { matchesCurrentProject: true, playbackAccess: 'ready', provisionalSetup: false },
      null,
    ],
    [
      'load-matching-project unresolved',
      connectedCard(),
      { state: 'project-mismatch', setupTaskId: 'load-matching-project' },
      verifiedProject(),
      { status: { ...READY_STATUS, projectId: 'other-piece' }, resolutionKind: 'none' },
      null,
      null,
    ],
    [
      'recover-operation',
      connectedCard(READY_STATUS, { activity: 'failed', reason: 'operation-uncertain' }),
      { state: 'uncertain', setupTaskId: 'recover-operation' },
      verifiedProject(),
      { status: READY_STATUS, resolutionKind: 'none' },
      null,
      null,
    ],
    [
      'reconnecting',
      { state: 'reconnecting', expectedCard: { id: 'lw-journey-test' } },
      { state: 'verifying', setupTaskId: 'reconnect-card' },
      verifiedProject(),
      { status: null, resolutionKind: 'unknown' },
      null,
      null,
    ],
    [
      'active wiring test on the exact card',
      connectedCard(),
      { state: 'ready', setupTaskId: '', exactProject: true },
      verifiedProject(),
      {
        status: READY_STATUS,
        wiringStatus: ACTIVE_WIRING_TEST,
        resolutionKind: 'matches-current',
        matchesOpenProject: true,
      },
      { matchesCurrentProject: true, playbackAccess: 'ready', provisionalSetup: false },
      ACTIVE_WIRING_TEST,
    ],
  ];

  for (const [name, cardLink, cardLifecycle, project, read, legacyResolution, legacyWiring] of cases) {
    const evidence = journeyEvidenceSnapshot({ cardLink, projectId: project?.id, ...read });
    const journey = bothWays({ cardLink, cardLifecycle, project, evidence });
    const legacy = deriveSetupJourney({
      cardLink,
      cardLifecycle,
      project,
      resolution: legacyResolution,
      wiringStatus: legacyWiring,
    });
    assert.equal(journey.taskId, legacy.taskId, `${name}: task`);
    assert.equal(journey.setupComplete, legacy.setupComplete, `${name}: completion`);
  }
});

test('with no evidence at all the journey still resolves from the link and lifecycle', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const journey = bothWays({
    cardLink,
    cardLifecycle: { state: 'ready' },
    project,
    evidence: emptyCardJourneyEvidence(),
  });
  assert.equal(journey.setupComplete, true);
});

test('a readiness that reports the temporary setup is honoured without a card read', () => {
  const cardLink = connectedCard({ ...READY_STATUS, provisionalSetup: true });
  const journey = bothWays({
    cardLink,
    cardLifecycle: { state: 'discovery-setup', setupTaskId: 'discover-lights' },
    project: verifiedProject(),
    evidence: emptyCardJourneyEvidence(),
  });
  assert.equal(journey.setupComplete, false);
  assert.equal(journey.taskId, 'test-and-save');
});
