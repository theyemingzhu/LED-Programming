import { evaluateCardInstallGate, readCardAccessLevel, readCardCommissioningVerification } from './cardInstallGate.js';
import { classifyCardChanges, prepareCardDeployment, verifyCardPostSaveState } from './cardDeployment.js';
import { saveProjectToCardFromGesture } from './cardProjectSave.js';
import { createProjectEnvelope, validateProjectEnvelope } from './projectRepository.js';
import { compileSceneExpressionNative } from './sceneExpressionNative.js';
import { buildSceneExpressionAreaCatalog } from './sceneExpressionTargets.js';
import { compileWiring } from './wiringCompiler.js';

const READY_FLAGS = ['knownGoodProject', 'commandReady', 'playbackReady', 'outputReady'];

function frozen(value) {
  const clone = structuredClone(value);
  const visit = item => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
    Object.values(item).forEach(visit);
    return Object.freeze(item);
  };
  return visit(clone);
}

function failure(reason, details = {}) {
  return Object.freeze({ ok: false, reason, ...details });
}

function exactCardReadiness(cardEvidence = {}) {
  const cardId = String(cardEvidence.cardId || '').trim();
  const statusCardId = String(cardEvidence.status?.cardId || '').trim();
  if (!cardId || !statusCardId) return failure('identity-missing');
  if (cardId !== statusCardId) return failure('card-mismatch');
  const buildId = String(cardEvidence.buildId || '').trim();
  const statusBuildId = String(cardEvidence.status?.buildId || '').trim();
  if (!buildId || !statusBuildId) return failure('identity-missing');
  if (buildId !== statusBuildId) return failure('build-mismatch');
  const wiringCardId = String(cardEvidence.wiringStatus?.cardId || '').trim();
  const wiringBuildId = String(cardEvidence.wiringStatus?.buildId || '').trim();
  if (!wiringCardId || !wiringBuildId) return failure('identity-missing');
  if (wiringCardId !== cardId) return failure('card-mismatch');
  if (wiringBuildId !== buildId) return failure('build-mismatch');
  if (cardEvidence.wiringStatus?.hasCandidate === true
    || String(cardEvidence.wiringStatus?.state || '').toLowerCase() !== 'known-good') {
    return failure('wiring-not-known-good');
  }
  if (cardEvidence.status?.runtimePhase !== 'ready'
    || READY_FLAGS.some(flag => cardEvidence.status?.[flag] !== true)) {
    return failure('card-not-ready');
  }
  return {
    ok: true,
    cardId,
    buildId,
    cardAccess: readCardAccessLevel(cardEvidence.cardAccess, cardEvidence.status),
  };
}

function capabilityFailure(prepared, cardEvidence = {}) {
  const maxPixels = Number(cardEvidence.maxPixels ?? cardEvidence.status?.maxPixels);
  if (Number.isFinite(maxPixels) && Number(prepared.config?.led?.pixels) > maxPixels) {
    return failure('card-capacity-exceeded', { capability: 'pixels', maximum: maxPixels });
  }
  const maxLooks = Number(cardEvidence.maxLooks ?? cardEvidence.status?.limits?.maxLooks);
  if (Number.isFinite(maxLooks) && (prepared.config?.looks?.length || 0) > maxLooks) {
    return failure('card-capacity-exceeded', { capability: 'looks', maximum: maxLooks });
  }
  return null;
}

function prepare(project, {
  playbackSceneId,
  revision = 0,
  expectedHead = null,
  cardEvidence = {},
  modifiedAt = Date.now(),
} = {}) {
  const readiness = exactCardReadiness(cardEvidence);
  if (!readiness.ok) return readiness;

  const editable = structuredClone(project);
  const collection = editable.expressionScenes == null
    ? { version: 1, activeSceneId: null, scenes: [] }
    : structuredClone(editable.expressionScenes);
  if (Number(collection?.version) !== 1 || !Array.isArray(collection?.scenes)) {
    return failure('expression-scenes-uneditable');
  }
  collection.playbackSceneId = playbackSceneId == null ? null : String(playbackSceneId);
  editable.expressionScenes = collection;

  let envelope;
  try {
    envelope = createProjectEnvelope(editable, {
      parentHash: expectedHead,
      localRevision: Math.max(1, Number(revision) || 1),
      modifiedAt,
      source: { kind: 'browser' },
    });
  } catch (error) {
    return failure(error?.code || 'invalid-project', { error });
  }
  const snapshot = envelope.project;
  const snapshotCollection = snapshot.expressionScenes || collection;
  const layout = snapshot.layout || {};
  const compiledWiring = compileWiring({
    wiring: layout.wiring,
    strips: layout.strips || [],
    groups: layout.layerGroups || [],
  });

  let kind = 'controller';
  let compilation = null;
  let controller = snapshot.devices?.standaloneController || {};
  let replacementSummary = null;
  if (snapshotCollection.playbackSceneId !== null) {
    const scene = snapshotCollection.scenes.find(item => String(item?.id || '') === snapshotCollection.playbackSceneId);
    if (!scene) return failure('scene-not-found', { sceneId: snapshotCollection.playbackSceneId });
    const catalog = buildSceneExpressionAreaCatalog({
      strips: layout.strips || [],
      sectionFamilies: layout.sectionFamilies || [],
      layerGroups: layout.layerGroups || [],
      compiledWiring,
    });
    compilation = compileSceneExpressionNative(scene, {
      catalog,
      strips: layout.strips || [],
      compiledWiring,
      standaloneController: controller,
      projectId: snapshot.id,
      projectName: snapshot.name,
    });
    if (!compilation.ok) return failure('scene-not-native', { reasons: frozen(compilation.reasons) });
    kind = 'expression-scene';
    replacementSummary = Object.freeze({
      sceneId: compilation.source.id,
      sceneName: compilation.source.name,
      previousLookCount: Array.isArray(controller.looks) ? controller.looks.length : 0,
      previousPlaylistCount: Array.isArray(controller.playlist) ? controller.playlist.length : 0,
      nextStepCount: compilation.source.steps.length,
    });
    controller = compilation.controller;
  }

  let prepared;
  try {
    prepared = prepareCardDeployment({
      projectId: snapshot.id,
      projectName: snapshot.name,
      projectRevision: Number(revision) || 0,
      projectFingerprint: envelope.contentHash,
      strips: layout.strips || [],
      patchBoard: layout.patchBoard || null,
      wiring: layout.wiring || null,
      compiledWiring,
      symSettings: snapshot.symSettings,
      standaloneController: controller,
    }, cardEvidence);
  } catch (error) {
    return failure('runtime-invalid', { error });
  }

  const capacity = capabilityFailure(prepared, cardEvidence);
  if (capacity) return capacity;
  const commissioning = readCardCommissioningVerification({
    wiring: layout.wiring,
    standaloneController: snapshot.devices?.standaloneController,
  });
  const gate = evaluateCardInstallGate({
    cardAccess: readiness.cardAccess,
    requiresLiveLink: true,
    wiringAffecting: prepared.changes.requiresPhysicalTest,
    wiringSendReady: compiledWiring.sendReady,
    commissioningVerified: commissioning.verified,
  });
  if (!gate.allowed) return failure(gate.reason, { gate });

  return frozen({
    ok: true,
    kind,
    cardId: readiness.cardId,
    buildId: readiness.buildId,
    expectedHead,
    envelope,
    snapshot,
    compiledWiring: frozen(compiledWiring),
    compilation: compilation ? frozen(compilation) : null,
    prepared,
    requiredPatternIds: Object.freeze((prepared.config.looks || []).map(look => String(look.id))),
    requiredZoneIds: Object.freeze((prepared.config.zones || []).map(zone => String(zone.id))),
    replacementSummary,
    commissioningVerified: commissioning.verified,
    previousRuntimeEvidence: frozen({
      status: cardEvidence.status,
      wiringStatus: cardEvidence.wiringStatus,
      previousConfig: cardEvidence.previousConfig || null,
    }),
  });
}

export function prepareExpressionSceneDelivery(project, options = {}) {
  return prepare(project, { ...options, playbackSceneId: options.sceneId });
}

export function prepareProjectPlaybackDelivery(project, options = {}) {
  return prepare(project, {
    ...options,
    playbackSceneId: project?.expressionScenes?.playbackSceneId ?? null,
  });
}

function exactSource(plan, readback) {
  if (String(readback?.cardId || '') !== plan.cardId) return failure('card-mismatch');
  let envelope;
  try {
    envelope = validateProjectEnvelope(readback?.envelope);
  } catch (error) {
    const reason = error?.code === 'content-hash-mismatch' ? 'source-hash-mismatch' : 'source-invalid';
    return failure(reason, { error });
  }
  if (String(envelope?.projectId || '') !== String(plan.envelope.projectId)) return failure('source-project-mismatch');
  if (String(envelope?.contentHash || '') !== plan.envelope.contentHash) return failure('source-hash-mismatch');
  return { ok: true };
}

function installedIds(items) {
  return new Set((Array.isArray(items) ? items : []).map(item => String(item?.id || '')).filter(Boolean));
}

function exactRuntime(plan, evidence) {
  if (!evidence?.ok) return failure(evidence?.reason || 'runtime-unverified');
  if (String(evidence.cardId || evidence.status?.cardId || '') !== plan.cardId) return failure('card-mismatch');
  if (String(evidence.fingerprint || '') !== plan.prepared.fingerprint) return failure('runtime-fingerprint-mismatch');
  const status = evidence.status || {};
  if (Number(status.projectRevision) !== Number(plan.prepared.config.projectRevision)
    || String(status.projectFingerprint || '') !== plan.envelope.contentHash) {
    return failure('read-back-mismatch');
  }
  if (status.runtimePhase !== 'ready' || READY_FLAGS.some(flag => status[flag] !== true)) {
    return failure('card-not-ready');
  }
  if (evidence.wiring?.hasCandidate === true || String(evidence.wiring?.state || '').toLowerCase() !== 'known-good') {
    return failure('wiring-not-known-good');
  }
  const patterns = installedIds(evidence.patterns?.patterns);
  if (plan.requiredPatternIds.some(id => !patterns.has(id))) return failure('patterns-missing');
  const zones = installedIds(evidence.zones?.zones);
  if (plan.requiredZoneIds.some(id => !zones.has(id))) return failure('zones-missing');
  return { ok: true };
}

function reasonOf(error, fallback) {
  return error?.reason || error?.code || (error?.name === 'AbortError' ? 'cancelled' : fallback);
}

function isLostResponse(reason) {
  return ['lost-response', 'response-lost', 'network-lost', 'timeout'].includes(reason);
}

export async function runExpressionSceneDelivery(plan, operations = {}) {
  if (!plan?.ok) return plan || failure('delivery-not-prepared');
  const signal = operations.signal;
  if (signal?.aborted) return failure('cancelled');
  const authorityCardId = String(operations.authority?.cardId || operations.authority?.card?.id || '').trim();
  if (!authorityCardId) return failure('identity-missing');
  if (authorityCardId !== plan.cardId) return failure('card-mismatch');
  const saveSource = operations.saveProjectToCard || saveProjectToCardFromGesture;
  const readPreflightEvidence = operations.readPreflightEvidence;
  const readSource = operations.readSource;
  const syncRuntime = operations.syncRuntime;
  const verifyRuntime = operations.verifyRuntime || (input => verifyCardPostSaveState(input));
  if ([saveSource, readPreflightEvidence, readSource, syncRuntime, verifyRuntime]
    .some(operation => typeof operation !== 'function')) {
    return failure('operations-missing');
  }

  let freshEvidence;
  try {
    freshEvidence = await readPreflightEvidence({
      cardId: plan.cardId,
      buildId: plan.buildId,
      signal,
    });
  } catch (error) {
    return failure(reasonOf(error, 'preflight-unavailable'), { error });
  }
  const freshReadiness = exactCardReadiness(freshEvidence);
  if (!freshReadiness.ok) return freshReadiness;
  if (freshReadiness.cardId !== plan.cardId) return failure('card-mismatch');
  if (freshReadiness.buildId !== plan.buildId) return failure('build-mismatch');
  const freshCapacity = capabilityFailure(plan.prepared, freshEvidence);
  if (freshCapacity) return freshCapacity;
  const freshChanges = classifyCardChanges(freshEvidence.previousConfig, plan.prepared.config);
  const freshGate = evaluateCardInstallGate({
    cardAccess: freshReadiness.cardAccess,
    requiresLiveLink: true,
    wiringAffecting: freshChanges.requiresPhysicalTest,
    wiringSendReady: plan.compiledWiring.sendReady,
    commissioningVerified: plan.commissioningVerified,
  });
  if (!freshGate.allowed) return failure(freshGate.reason, { gate: freshGate });
  if (signal?.aborted) return failure('cancelled');

  let saved;
  try {
    saved = await saveSource({
      authority: operations.authority,
      envelope: plan.envelope,
      expectedHead: plan.expectedHead,
      commissioningProof: operations.commissioningProof,
      repositoryFactory: operations.repositoryFactory,
      signal,
      onProgress: operations.onProgress,
    });
  } catch (error) {
    return failure(reasonOf(error, 'failed'), { error });
  }
  if (!saved?.ok) return failure(saved?.reason || 'failed', saved || {});
  if (String(saved.envelope?.contentHash || '') !== plan.envelope.contentHash) {
    return failure('source-hash-mismatch');
  }
  if (signal?.aborted) return failure('cancelled', { state: 'saved-not-installed', sourceSaved: true });

  const readExactSource = async () => exactSource(plan, await readSource({
    cardId: plan.cardId,
    projectId: plan.envelope.projectId,
    signal,
  }));
  let sourceProof;
  try {
    sourceProof = await readExactSource();
  } catch (error) {
    return failure(reasonOf(error, 'source-unverified'), { state: 'source-unverified', sourceSaved: true, error });
  }
  if (!sourceProof.ok) return failure(sourceProof.reason, { state: 'source-unverified', sourceSaved: true });
  if (signal?.aborted) return failure('cancelled', { state: 'saved-not-installed', sourceSaved: true });

  const verify = async () => {
    const evidence = await verifyRuntime({
      prepared: plan.prepared,
      runtimePackage: plan.prepared.runtimePackage,
      host: operations.host,
      expectedCardId: plan.cardId,
      requiredPatternIds: plan.requiredPatternIds,
      requiredZoneIds: plan.requiredZoneIds,
      acquireAuthority: operations.acquireAuthority,
      signal,
    });
    const proof = exactRuntime(plan, evidence);
    if (!proof.ok) {
      const error = new Error(proof.reason);
      error.reason = proof.reason;
      throw error;
    }
    return evidence;
  };

  let runtimeAccepted = false;
  let runtimeVerified = false;
  try {
    const delivery = await syncRuntime({
      prepared: plan.prepared,
      runtimePackage: plan.prepared.runtimePackage,
      cardId: plan.cardId,
      signal,
    });
    if (!delivery?.ok || delivery.delivered === false) {
      const reason = delivery?.previousRuntimePreserved === true
        ? delivery?.reason || 'send-failed'
        : 'runtime-preservation-unproven';
      return failure(reason, {
        state: 'saved-not-installed', sourceSaved: true,
        runtimeReason: delivery?.reason || 'send-failed',
        previousRuntimeEvidence: plan.previousRuntimeEvidence,
      });
    }
    runtimeAccepted = true;
    const verification = await verify();
    runtimeVerified = true;
    const finalSource = await readExactSource();
    if (!finalSource.ok) {
      return failure(finalSource.reason, {
        state: 'needs-verification', sourceSaved: true,
        previousRuntimeEvidence: plan.previousRuntimeEvidence,
      });
    }
    return Object.freeze({ ok: true, state: 'on-card', sourceSaved: true, verification });
  } catch (error) {
    const reason = reasonOf(error, 'runtime-failed');
    if (!isLostResponse(reason)) {
      if (runtimeVerified) {
        return failure(reason, {
          state: 'needs-verification', sourceSaved: true, error,
          previousRuntimeEvidence: plan.previousRuntimeEvidence,
        });
      }
      return failure(runtimeAccepted ? reason : 'runtime-preservation-unproven', {
        state: 'saved-not-installed', sourceSaved: true, error,
        ...(runtimeAccepted ? {} : { runtimeReason: reason }),
        previousRuntimeEvidence: plan.previousRuntimeEvidence,
      });
    }
    try {
      const freshSource = await readExactSource();
      if (!freshSource.ok) throw Object.assign(new Error(freshSource.reason), { reason: freshSource.reason });
      const verification = await verify();
      const finalSource = await readExactSource();
      if (!finalSource.ok) throw Object.assign(new Error(finalSource.reason), { reason: finalSource.reason });
      return Object.freeze({ ok: true, state: 'on-card', sourceSaved: true, reconciled: true, verification });
    } catch (reconcileError) {
      return failure(reasonOf(reconcileError, 'runtime-unverified'), {
        state: 'needs-verification', sourceSaved: true, error: reconcileError,
        previousRuntimeEvidence: plan.previousRuntimeEvidence,
      });
    }
  }
}
