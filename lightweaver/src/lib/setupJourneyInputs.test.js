import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveSetupJourney } from './setupJourney.js';
import { assembleSetupJourney, journeyAgreementInputs, ladderOwnsPrimary } from './setupJourneyInputs.js';
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

// F16: a card can be connected, holding the exact project Studio has open,
// and reporting a ready runtime — a fully complete journey by every existing
// verdict — and still be sitting dark, because blackout lives only in
// /api/zones. `assembleSetupJourney` must surface it as an orthogonal fact
// on the journey object, not as a task or a completion state.
test('a card holding the open project but blacked out carries blackout: true on an otherwise complete journey', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const evidence = journeyEvidenceSnapshot({
    cardLink,
    status: READY_STATUS,
    resolutionKind: 'matches-current',
    matchesOpenProject: true,
    projectId: project.id,
    blackout: true,
  });
  const journey = bothWays({ cardLink, cardLifecycle: { state: 'ready' }, project, evidence });
  assert.equal(journey.setupComplete, true, 'a blackout must not reopen a finished setup journey');
  assert.equal(journey.blackout, true);
});

test('blackout is never asserted about a project the card was not read against', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const evidence = journeyEvidenceSnapshot({
    cardLink,
    status: READY_STATUS,
    resolutionKind: 'matches-current',
    matchesOpenProject: true,
    projectId: 'some-other-piece',
    blackout: true,
  });
  const journey = bothWays({ cardLink, cardLifecycle: { state: 'ready' }, project, evidence });
  assert.equal(journey.blackout, false, 'a blackout read about a different project must not carry over to this one');
});

// F22 — bench 2026-09-08: Adrian's open Studio project had the SAME project
// id as the card but an unsaved wiring edit, so the structural fingerprint
// differed. He pressed Off on the card's own page; Patterns and Card Home
// (footer: Connected) showed no "Lights are off" message. matchesOpenProject
// and resolutionKind are claims about WIRING match, not about what the LEDs
// are doing — F18's edit-intent handoff (lw-card.jsx's `cardHoldsOpenProject`)
// already treats id-equality alone as enough to say "the card holds the open
// project"; blackout must agree, because a real blackout does not become
// fake because Studio's copy of the wiring has drifted.
test('blackout is reported for the open project even with drifted wiring — same project id, no fingerprint match', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const evidence = journeyEvidenceSnapshot({
    cardLink,
    status: READY_STATUS,
    resolutionKind: 'none',
    matchesOpenProject: false,
    projectId: project.id,
    blackout: true,
  });
  const journey = bothWays({ cardLink, cardLifecycle: { state: 'ready' }, project, evidence });
  assert.equal(journey.blackout, true, 'a card-side blackout must be reported for the open project regardless of wiring-fingerprint drift');
});

// card-state-matrix.spec.ts's own connection-only invariant (expectUnaided)
// requires that a first-ever, auto-adopted "recognize this card" (the exact
// shape 'remembers-card' fixtures produce — matchesOpenProject can go true
// off id-equality alone, with resolutionKind still 'none') raises nothing
// while the card is provisional or its runtime is not yet reporting ready.
// Reproduced 2026-09-08 running the real matrix: 'provisional' and
// 'not-ready' both carry the matrix's `currentId: 'blackout'` sentinel
// (dark until a pattern is chosen / dark for a moment after boot), and a
// naive matchesOpenProject-only gate fired on both.
test('blackout is not reported for a card still holding the temporary find-my-strips setup', () => {
  const cardLink = connectedCard({ ...READY_STATUS, provisionalSetup: true });
  const project = verifiedProject();
  const evidence = journeyEvidenceSnapshot({
    cardLink,
    status: { ...READY_STATUS, provisionalSetup: true },
    resolutionKind: 'bench',
    matchesOpenProject: true,
    projectId: project.id,
    blackout: true,
  });
  const journey = bothWays({ cardLink, cardLifecycle: { state: 'discovery-setup', setupTaskId: 'discover-lights' }, project, evidence });
  assert.equal(journey.blackout, false, 'a bench/discovery card is expected dark — this is not F16');
});

test('blackout is not reported while the runtime has not yet reported ready', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const evidence = journeyEvidenceSnapshot({
    cardLink,
    status: { ...READY_STATUS, commandReady: false },
    resolutionKind: 'none',
    matchesOpenProject: true,
    projectId: project.id,
    blackout: true,
  });
  const journey = bothWays({ cardLink, cardLifecycle: { state: 'ready' }, project, evidence });
  assert.equal(journey.blackout, false, 'a runtime that has not reported ready is expected dark for a moment — not F16');
});

test('a card with no evidence at all never reports blackout', () => {
  const cardLink = connectedCard();
  const project = verifiedProject();
  const journey = bothWays({
    cardLink,
    cardLifecycle: { state: 'ready' },
    project,
    evidence: emptyCardJourneyEvidence(),
  });
  assert.equal(journey.blackout, false);
});

// `ladderOwnsPrimary` used to live only inside lw-setup.jsx and reach Card
// Home a render late through the now-removed `onPrimaryActionChange` prop
// callback (blueprint H3). It is a pure function of the same shared journey
// both screens already read via `useSetupJourney`, so this only has to prove
// it agrees with itself given the same two inputs — the callback channel
// added nothing a second call here cannot reproduce exactly.
test('ladderOwnsPrimary: false once setup is complete', () => {
  assert.equal(ladderOwnsPrimary({ setupComplete: true, currentPhaseId: 'verify', taskId: 'open-patterns' }, null), false);
});

test('ladderOwnsPrimary: false while the ladder itself is confirming a light test', () => {
  assert.equal(
    ladderOwnsPrimary({ setupComplete: false, currentPhaseId: 'verify', taskId: 'confirm-visible-lights' }, null),
    false,
  );
});

test('ladderOwnsPrimary: true for an ordinary unfinished task', () => {
  assert.equal(
    ladderOwnsPrimary({ setupComplete: false, currentPhaseId: 'lights', taskId: 'discover-lights' }, null),
    true,
  );
});

test('ladderOwnsPrimary: install-project with no resumable commissioning yields the floor to the install action', () => {
  assert.equal(
    ladderOwnsPrimary(
      { setupComplete: false, currentPhaseId: 'connect', taskId: 'install-project' },
      { stage: 'discovery' },
    ),
    false,
  );
});

test('ladderOwnsPrimary: install-project WITH a resumable commissioning stage keeps the ladder owning the button', () => {
  assert.equal(
    ladderOwnsPrimary(
      { setupComplete: false, currentPhaseId: 'connect', taskId: 'install-project' },
      { stage: 'set-up-card' },
    ),
    true,
  );
  assert.equal(
    ladderOwnsPrimary(
      { setupComplete: false, currentPhaseId: 'connect', taskId: 'install-project' },
      { stage: 'check-lights' },
    ),
    true,
  );
});

test('ladderOwnsPrimary: install-project outside the connect phase is unaffected by the resumable exception', () => {
  assert.equal(
    ladderOwnsPrimary(
      { setupComplete: false, currentPhaseId: 'lights', taskId: 'install-project' },
      null,
    ),
    true,
  );
});

// ── F41: cardHomePrimaryAction — one primary at a time on a finished Card
// Home, in Adrian's stated priority order (recorded 2026-09-09): dark
// lights outrank everything; changes the card does not hold outrank a
// maintenance update; a newer release is offered only once nothing more
// urgent is pending; otherwise there is no primary at all.
import { cardHomePrimaryAction } from './setupJourneyInputs.js';

test('cardHomePrimaryAction: no primary at all before setup is complete, whatever else is true', () => {
  assert.equal(
    cardHomePrimaryAction({
      journey: { setupComplete: false, blackout: true },
      hasChangesPendingInstall: true,
      firmwareUpdateAvailable: true,
    }),
    null,
  );
});

test('cardHomePrimaryAction: blackout outranks a pending install and a pending update', () => {
  assert.equal(
    cardHomePrimaryAction({
      journey: { setupComplete: true, blackout: true },
      hasChangesPendingInstall: true,
      firmwareUpdateAvailable: true,
    }),
    'recover-lights',
  );
});

test('cardHomePrimaryAction: a pending install outranks a pending update', () => {
  assert.equal(
    cardHomePrimaryAction({
      journey: { setupComplete: true, blackout: false },
      hasChangesPendingInstall: true,
      firmwareUpdateAvailable: true,
    }),
    'install',
  );
});

test('cardHomePrimaryAction: a pending update is offered only once nothing more urgent is pending', () => {
  assert.equal(
    cardHomePrimaryAction({
      journey: { setupComplete: true, blackout: false },
      hasChangesPendingInstall: false,
      firmwareUpdateAvailable: true,
    }),
    'update',
  );
});

test('cardHomePrimaryAction: a finished, healthy, up-to-date card has no primary at all', () => {
  assert.equal(
    cardHomePrimaryAction({
      journey: { setupComplete: true, blackout: false },
      hasChangesPendingInstall: false,
      firmwareUpdateAvailable: false,
    }),
    null,
  );
});

test('cardHomePrimaryAction: every input defaults false/absent — a journey with nothing set carries no primary', () => {
  assert.equal(cardHomePrimaryAction({ journey: { setupComplete: true } }), null);
  assert.equal(cardHomePrimaryAction(), null);
});
