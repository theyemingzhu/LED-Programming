import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSetupJourney, missingPhases } from './setupJourney.js';
import { deriveCardLifecycle } from './cardLifecycle.js';
import { classifyFooterFirmwareStatus } from './footerFirmwareStatus.js';
import { migrateProject, PROJECT_VERSION } from './projectModel.js';
import { deriveStudioArrivalReadiness } from './studioArrivalReadiness.js';

const buildId = '1'.repeat(40);
const project = {
  id: 'lotus-gate',
  version: PROJECT_VERSION,
  revision: 1,
  fingerprint: 'aa22bb33cc44dd55',
  portRoles: [{ pin: 18, role: 'strip', pixelCount: 41 }],
  devices: { standaloneController: { led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' } } },
  layout: { starterPending: true, strips: [{ id: 'starter' }] },
};
const cardLink = {
  state: 'connected-direct',
  card: { id: 'lw-lotus', buildId, buildNumber: 45 },
  expectedCard: { id: 'lw-lotus' },
  validatedBootId: 'boot-2',
  readiness: {
    bootId: 'boot-2',
    runtimePhase: 'ready',
    knownGoodProject: true,
    commandReady: true,
    outputReady: true,
    playbackReady: true,
    projectId: project.id,
    projectRevision: project.revision,
    projectFingerprint: project.fingerprint,
  },
};
const cardLifecycle = deriveCardLifecycle({ link: cardLink, project });
const setupJourney = deriveSetupJourney({ cardLink, cardLifecycle, project });

function derive(overrides = {}) {
  return deriveStudioArrivalReadiness({
    cardLink, cardLifecycle, setupJourney, project, ...overrides,
  });
}

test('lights verified with no authored layout suggests Layout independently of card setup', () => {
  assert.equal(setupJourney.setupComplete, true);
  assert.deepEqual(missingPhases(setupJourney), []);
  const result = derive();
  assert.equal(result.resumeTask, 'place-lights');
  assert.equal(result.tasks.lights, 'verified');
  assert.equal(result.tasks.layout, 'not-started');
  assert.equal(result.installedPlaybackReady, true);
});

test('authored SVG with no LED paths is work in progress even offline', () => {
  const draft = { ...project, layout: { starterPending: false, svgText: '<svg/>', strips: [] } };
  const result = derive({
    cardLink: { state: 'disconnected' },
    cardLifecycle: null,
    setupJourney: deriveSetupJourney({ project: draft }),
    project: draft,
  });
  assert.equal(result.resumeTask, 'place-lights');
  assert.equal(result.tasks.layout, 'in-progress');
  assert.equal(result.compatibility.state, 'unverified');
});

test('a verified newer release is optional for compatible installed playback', () => {
  const firmwareStatus = classifyFooterFirmwareStatus(cardLink.card, { buildNumber: 46, buildId: '2'.repeat(40) });
  const result = derive({ firmwareStatus });
  assert.equal(result.compatibility.state, 'compatible');
  assert.deepEqual(result.update, { available: true, optional: true });
  assert.equal(result.installedPlaybackReady, true);
});

test('an older readable project with exact live playback on newer firmware stays compatible', () => {
  const firmwareStatus = classifyFooterFirmwareStatus(cardLink.card, { buildNumber: 44, buildId: '2'.repeat(40) });
  assert.equal(firmwareStatus.state, 'development-build');
  const migrated = migrateProject({ version: 2, id: project.id, strips: [] });
  assert.equal(migrated.version, PROJECT_VERSION);
  const openProject = { ...migrated, revision: project.revision, fingerprint: project.fingerprint };
  const result = derive({
    project: openProject,
    cardLifecycle: deriveCardLifecycle({ link: cardLink, project: openProject }),
    firmwareStatus,
  });
  assert.equal(result.compatibility.state, 'compatible');
  assert.deepEqual(result.update, { available: false, optional: false });
});

test('a feature requirement can need an update while the installed looks remain playable', () => {
  const result = derive({ actionCheck: { state: 'update-required', reason: 'requested-feature-requires-update' } });
  assert.deepEqual(result.compatibility, { state: 'update-required', reason: 'requested-feature-requires-update' });
  assert.equal(result.installedPlaybackReady, true);
  assert.equal(result.tasks.lights, 'verified');
});

test('unsupported actions do not become update requirements', () => {
  assert.equal(derive({ actionCheck: { state: 'incompatible' } }).compatibility.state, 'incompatible');
  assert.equal(derive({ actionCheck: { state: 'unverified' } }).installedPlaybackReady, true);
});

test('unconfirmed post-update installation remains unknown even when exact status is back', () => {
  const result = derive({ postUpdateVerificationPending: true });
  assert.deepEqual(result.compatibility, { state: 'unverified', reason: 'post-update-verification-pending' });
  assert.equal(result.installedPlaybackReady, false);
  assert.equal(result.tasks.verify, 'unknown');
  assert.equal(result.tasks.lights, 'verified');
  assert.equal(result.tasks.layout, 'not-started');
});

test('different project copy or stale playback evidence cannot establish compatibility for the open project', () => {
  const changed = { ...project, fingerprint: 'ff22bb33cc44dd55' };
  const lifecycle = deriveCardLifecycle({ link: cardLink, project: changed });
  assert.equal(lifecycle.state, 'project-mismatch');
  assert.equal(derive({ project: changed, cardLifecycle: lifecycle }).compatibility.state, 'unverified');

  const link = { ...cardLink, validatedBootId: 'old-boot' };
  assert.equal(derive({ cardLink: link, cardLifecycle: deriveCardLifecycle({ link, project }) }).installedPlaybackReady, false);
});

test('an explicit firmware contract blocker differs from missing identity', () => {
  for (const [reason, expected] of [['firmware-too-old', 'update-required'], ['identity-missing', 'unverified']]) {
    const link = { reason, state: 'disconnected' };
    const lifecycle = deriveCardLifecycle({ link, project });
    assert.equal(lifecycle.state, 'update-required');
    const result = derive({ cardLink: link, cardLifecycle: lifecycle });
    assert.equal(result.compatibility.state, expected);
    assert.equal(result.tasks.lights, 'verified');
  }
});

test('verification requires more than runtime status; scoped rechecks preserve other evidence', () => {
  assert.equal(derive().tasks.verify, 'unknown');
  const result = derive({
    project: { ...project, layout: { starterPending: false, strips: [{ id: 'authored' }] } },
    installationVerified: true,
    recheckTasks: ['layout'],
  });
  assert.deepEqual(result.tasks, { lights: 'verified', layout: 'needs-recheck', verify: 'verified' });
  assert.equal(result.resumeTask, 'place-lights');
});

test('a ready phase label cannot manufacture saved discovery evidence', () => {
  const draft = { ...project, devices: {} };
  const journey = deriveSetupJourney({ cardLink, cardLifecycle, project: draft });
  assert.equal(journey.phases.find(phase => phase.id === 'lights').status, 'done');
  const result = derive({ project: draft, setupJourney: journey });
  assert.equal(result.tasks.lights, 'in-progress');
  assert.equal(result.resumeTask, null);
});

test('a release offer cannot resolve an unverified card or become mandatory', () => {
  const firmwareStatus = classifyFooterFirmwareStatus(cardLink.card, { buildNumber: 46, buildId: '2'.repeat(40) });
  const result = derive({ firmwareStatus, cardLink: { state: 'disconnected' }, cardLifecycle: null });
  assert.equal(result.compatibility.state, 'unverified');
  assert.deepEqual(result.update, { available: true, optional: false });
});
