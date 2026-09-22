import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultProject } from './projectModel.js';
import {
  prepareExpressionSceneDelivery,
  prepareProjectPlaybackDelivery,
  runExpressionSceneDelivery,
} from './sceneExpressionDelivery.js';

function cardColor(overrides = {}) {
  return {
    kind: 'card-controls', hueShift: 0, customHue: 32, customSaturation: 230,
    customBreathe: false, breatheLowerPct: 85, breatheUpperPct: 100,
    breatheCycleSeconds: 9, customDrift: false, ...overrides,
  };
}

function expressionScene(overrides = {}) {
  return {
    format: 'lightweaver-expression-scene', version: 1,
    id: 'scene-delivery', name: 'Delivery scene',
    defaults: {
      pattern: { rendererId: 'aurora', speed: 1 },
      color: cardColor(), intensity: { brightness: 0.7 },
    },
    steps: [{
      id: 'opening', label: 'Opening', holdMs: 1000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 },
      assignments: [{
        selection: { areaIds: ['all'], domain: 'repeat' },
        pattern: { rendererId: 'fire', speed: 0.8 },
      }],
    }],
    loop: { mode: 'repeat' },
    ...overrides,
  };
}

function projectFixture(scene = expressionScene()) {
  const project = createDefaultProject();
  project.id = 'project-expression-delivery';
  project.name = 'Expression delivery fixture';
  project.layout.strips = [{ id: 'only-strip', name: 'Only strip', pixelCount: 3 }];
  project.layout.sectionFamilies = [];
  project.layout.layerGroups = [];
  project.layout.patchBoard = null;
  project.layout.wiring = {
    version: 1, locked: true, verified: true,
    outputs: [{ id: 'out1', pin: 16, runIds: ['run-only'] }],
    runs: [{
      id: 'run-only', type: 'strip', verified: true,
      source: { stripId: 'only-strip', from: 0, to: 2 },
      physicalDirection: 'source-forward',
    }],
  };
  project.devices.standaloneController = {
    ...project.devices.standaloneController,
    looks: [{
      id: 'legacy-look', label: 'Legacy look',
      defaultLook: { patternId: 'ocean' }, sectionLooks: {}, updatedAt: 1,
    }],
    playlist: [{ type: 'combo', lookId: 'legacy-look', dwellSeconds: 30 }],
    led: {
      ...project.devices.standaloneController.led,
      colorOrder: 'RGB', colorOrderConfirmed: true, confirmedColorOrder: 'RGB',
    },
  };
  project.expressionScenes = {
    version: 1,
    activeSceneId: 'editor-selection-only',
    playbackSceneId: null,
    scenes: [scene],
  };
  return project;
}

function cardEvidence(overrides = {}) {
  const cardId = 'lw-aabbccddeeff';
  const buildId = 'build-expression';
  return {
    cardId,
    buildId,
    status: {
      cardId, buildId,
      knownGoodProject: true, commandReady: true,
      runtimePhase: 'ready', playbackReady: true, outputReady: true,
    },
    wiringStatus: { state: 'known-good', hasCandidate: false },
    ...overrides,
  };
}

function prepare(project = projectFixture(), overrides = {}) {
  return prepareExpressionSceneDelivery(project, {
    sceneId: 'scene-delivery',
    revision: 7,
    expectedHead: 'a'.repeat(64),
    cardEvidence: cardEvidence(),
    ...overrides,
  });
}

function verifiedRuntimeEvidence(plan) {
  return {
    ok: true,
    cardId: plan.cardId,
    fingerprint: plan.prepared.fingerprint,
    status: {
      cardId: plan.cardId,
      projectRevision: plan.prepared.config.projectRevision,
      projectFingerprint: plan.prepared.config.projectFingerprint,
      knownGoodProject: true, commandReady: true,
      runtimePhase: 'ready', playbackReady: true, outputReady: true,
    },
    wiring: { state: 'known-good', hasCandidate: false },
    patterns: { patterns: plan.requiredPatternIds.map(id => ({ id })) },
    zones: { zones: plan.requiredZoneIds.map(id => ({ id })) },
  };
}

function happyOperations(plan, events = []) {
  return {
    authority: { cardId: plan.cardId },
    commissioningProof: 'owner-confirmed-physical-control',
    async saveProjectToCard(input) {
      events.push('save-source');
      assert.equal(input.envelope.contentHash, plan.envelope.contentHash);
      assert.equal(input.expectedHead, plan.expectedHead);
      assert.equal(input.commissioningProof, 'owner-confirmed-physical-control');
      return { ok: true, envelope: plan.envelope, source: { cardId: plan.cardId } };
    },
    async readSource() {
      events.push('read-source');
      return { cardId: plan.cardId, envelope: plan.envelope };
    },
    async syncRuntime({ runtimePackage }) {
      events.push('sync-runtime');
      assert.equal(runtimePackage.config.projectFingerprint, plan.envelope.contentHash);
      return { ok: true, delivered: true };
    },
    async verifyRuntime() {
      events.push('verify-runtime');
      return verifiedRuntimeEvidence(plan);
    },
  };
}

test('prepare freezes one source snapshot and replaces only the runtime candidate playback', () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const plan = prepare(project);

  assert.equal(plan.ok, true, JSON.stringify(plan.reasons));
  assert.deepEqual(project, before);
  assert.equal(Object.isFrozen(plan.snapshot), true);
  assert.equal(plan.snapshot.expressionScenes.activeSceneId, 'editor-selection-only');
  assert.equal(plan.snapshot.expressionScenes.playbackSceneId, 'scene-delivery');
  assert.equal(plan.snapshot.devices.standaloneController.looks[0].id, 'legacy-look');
  assert.equal(plan.compilation.savedLooks[0].id, 'scene-delivery-opening');
  assert.equal(plan.prepared.config.projectFingerprint, plan.envelope.contentHash);
  assert.equal(plan.prepared.config.projectRevision, 7);
  assert.deepEqual(plan.replacementSummary, {
    sceneId: 'scene-delivery',
    sceneName: 'Delivery scene',
    previousLookCount: 1,
    previousPlaylistCount: 1,
    nextStepCount: 1,
  });
});

test('generic project preparation honors playbackSceneId instead of reverting to legacy controller', () => {
  const project = projectFixture();
  project.expressionScenes.playbackSceneId = 'scene-delivery';
  const plan = prepareProjectPlaybackDelivery(project, {
    revision: 7, expectedHead: null, cardEvidence: cardEvidence(),
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, 'expression-scene');
  assert.equal(plan.compilation.savedLooks[0].id, 'scene-delivery-opening');

  project.expressionScenes.playbackSceneId = null;
  const ordinary = prepareProjectPlaybackDelivery(project, {
    revision: 7, expectedHead: null, cardEvidence: cardEvidence(),
  });
  assert.equal(ordinary.ok, true);
  assert.equal(ordinary.kind, 'controller');
  assert.equal(ordinary.snapshot.devices.standaloneController.looks[0].id, 'legacy-look');
});

test('happy path saves and reads source before runtime sync, then requires exact verification', async () => {
  const plan = prepare();
  const events = [];
  const result = await runExpressionSceneDelivery(plan, happyOperations(plan, events));

  assert.equal(result.ok, true);
  assert.equal(result.state, 'on-card');
  assert.deepEqual(events, ['save-source', 'read-source', 'sync-runtime', 'verify-runtime']);
});

test('source save failures, conflicts, cancellation, and wrong readback never write runtime', async () => {
  for (const [reason, sourceResult] of [
    ['failed', { ok: false, reason: 'failed' }],
    ['head-conflict', { ok: false, reason: 'head-conflict', currentHead: { contentHash: 'b'.repeat(64) } }],
    ['cancelled', { ok: false, reason: 'cancelled' }],
  ]) {
    const plan = prepare();
    let runtimeWrites = 0;
    const result = await runExpressionSceneDelivery(plan, {
      ...happyOperations(plan),
      saveProjectToCard: async () => sourceResult,
      syncRuntime: async () => { runtimeWrites += 1; return { ok: true }; },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.equal(runtimeWrites, 0);
  }

  for (const readback of [
    plan => ({ cardId: 'lw-wrong', envelope: plan.envelope }),
    plan => ({ cardId: plan.cardId, envelope: { ...plan.envelope, contentHash: 'c'.repeat(64) } }),
  ]) {
    const plan = prepare();
    let runtimeWrites = 0;
    const result = await runExpressionSceneDelivery(plan, {
      ...happyOperations(plan),
      readSource: async () => readback(plan),
      syncRuntime: async () => { runtimeWrites += 1; return { ok: true }; },
    });
    assert.equal(result.ok, false);
    assert.ok(['card-mismatch', 'source-hash-mismatch'].includes(result.reason));
    assert.equal(runtimeWrites, 0);
  }

  const wrongAuthorityPlan = prepare();
  let wrongAuthorityWrites = 0;
  const wrongAuthority = await runExpressionSceneDelivery(wrongAuthorityPlan, {
    ...happyOperations(wrongAuthorityPlan),
    authority: { cardId: 'lw-wrong' },
    saveProjectToCard: async () => { wrongAuthorityWrites += 1; return { ok: true }; },
  });
  assert.equal(wrongAuthority.reason, 'card-mismatch');
  assert.equal(wrongAuthorityWrites, 0);
});

test('unsupported scene and unproven card readiness block before every mutation', async () => {
  const unsupported = expressionScene({
    defaults: {
      pattern: { rendererId: 'aurora', speed: 1 },
      color: { kind: 'palette', colors: ['#ff0000', '#0000ff'] },
      intensity: { brightness: 1 },
    },
  });
  const unsupportedPlan = prepare(projectFixture(unsupported));
  assert.equal(unsupportedPlan.ok, false);
  assert.equal(unsupportedPlan.reason, 'scene-not-native');

  const unreadyPlan = prepare(projectFixture(), {
    cardEvidence: cardEvidence({ status: { cardId: 'lw-aabbccddeeff', runtimePhase: 'ready' } }),
  });
  assert.equal(unreadyPlan.ok, false);
  assert.equal(unreadyPlan.reason, 'card-not-ready');

  let mutations = 0;
  const result = await runExpressionSceneDelivery(unsupportedPlan, {
    saveProjectToCard: async () => { mutations += 1; },
    syncRuntime: async () => { mutations += 1; },
  });
  assert.equal(result.ok, false);
  assert.equal(mutations, 0);
});

test('runtime failure after source commit is saved-not-installed and retains prior evidence', async () => {
  const plan = prepare();
  const result = await runExpressionSceneDelivery(plan, {
    ...happyOperations(plan),
    syncRuntime: async () => ({ ok: false, reason: 'send-failed', previousRuntimePreserved: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.state, 'saved-not-installed');
  assert.equal(result.sourceSaved, true);
  assert.equal(result.reason, 'send-failed');
  assert.deepEqual(result.previousRuntimeEvidence, plan.previousRuntimeEvidence);

  const unproven = await runExpressionSceneDelivery(plan, {
    ...happyOperations(plan),
    syncRuntime: async () => { const error = new Error('transport failed'); error.reason = 'send-failed'; throw error; },
  });
  assert.equal(unproven.state, 'saved-not-installed');
  assert.equal(unproven.reason, 'runtime-preservation-unproven');
  assert.equal(unproven.runtimeReason, 'send-failed');
});

test('a successful runtime POST is not promoted without complete correlated readback', async () => {
  const plan = prepare();
  const result = await runExpressionSceneDelivery(plan, {
    ...happyOperations(plan),
    verifyRuntime: async () => ({ ok: true, cardId: plan.cardId, fingerprint: plan.prepared.fingerprint }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'saved-not-installed');
  assert.equal(result.reason, 'read-back-mismatch');
});

test('lost runtime reply promotes only after fresh exact source and runtime reconciliation', async () => {
  const plan = prepare();
  const verifiedEvents = [];
  const verified = await runExpressionSceneDelivery(plan, {
    ...happyOperations(plan, verifiedEvents),
    syncRuntime: async () => { verifiedEvents.push('sync-runtime'); const error = new Error('lost'); error.reason = 'lost-response'; throw error; },
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.reconciled, true);
  assert.deepEqual(verifiedEvents, ['save-source', 'read-source', 'sync-runtime', 'read-source', 'verify-runtime']);

  const unverified = await runExpressionSceneDelivery(plan, {
    ...happyOperations(plan),
    syncRuntime: async () => { const error = new Error('lost'); error.reason = 'lost-response'; throw error; },
    verifyRuntime: async () => { const error = new Error('not ready'); error.reason = 'runtime-not-ready'; throw error; },
  });
  assert.equal(unverified.ok, false);
  assert.equal(unverified.state, 'needs-verification');
  assert.equal(unverified.reason, 'runtime-not-ready');
});

test('an already-aborted delivery performs no source or runtime operation', async () => {
  const plan = prepare();
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const result = await runExpressionSceneDelivery(plan, {
    signal: controller.signal,
    saveProjectToCard: async () => { calls += 1; },
    readSource: async () => { calls += 1; },
    syncRuntime: async () => { calls += 1; },
    verifyRuntime: async () => { calls += 1; },
  });
  assert.equal(result.reason, 'cancelled');
  assert.equal(calls, 0);
});
