import { cardChangedSinceSeen } from './patternGate.js';
import { buildCardRuntimePackageFromProject } from './cardRuntimeProject.js';
import { runtimeConfigUsesKaleidoscope } from './cardKaleidoscope.js';
import { normalizeCardKaleidoscopeMappings } from './cardRuntimeContract.js';
import { connectCardTransport } from './cardTransport.js';
import { assertCardOutputCapacity } from './cardHardwareContract.js';

export function prepareCardDeployment(project = {}, cardEvidence = {}) {
  const needsFingerprint = Number.isSafeInteger(project.projectRevision) && project.projectRevision >= 0 && !project.projectFingerprint;
  const baseline = needsFingerprint
    ? buildCardRuntimePackageFromProject({ ...project, projectRevision: undefined, projectFingerprint: undefined })
    : null;
  const runtimePackage = buildCardRuntimePackageFromProject(needsFingerprint
    ? { ...project, projectFingerprint: semanticFingerprint(baseline.config) }
    : project);
  const config = runtimePackage.config;
  return Object.freeze({
    runtimePackage,
    config,
    fingerprint: semanticFingerprint(config),
    cardId: String(cardEvidence.cardId || '').trim(),
    buildId: String(cardEvidence.buildId || '').trim(),
    activationId: String(cardEvidence.activationId || '').trim(),
    revision: Number(config.projectRevision || project.projectRevision || 0),
    previousConfig: cardEvidence.previousConfig || null,
    changes: classifyCardChanges(cardEvidence.previousConfig, config),
  });
}

export function refreshCardDeploymentFingerprint(prepared) {
  return Object.freeze({ ...prepared, fingerprint: semanticFingerprint(prepared.config) });
}

export function classifyCardDeploymentResume(prepared = {}, status = {}) {
  const state = String(status.state || '').trim().toLowerCase();
  const candidateState = String(status.candidateState || '').trim().toLowerCase();
  const nextStep = String(status.nextStep || '').trim().toLowerCase();
  const hasCandidate = Boolean(status.hasCandidate) || ['staged', 'testing'].includes(state)
    || !['', 'none', 'known-good', 'rolled-back', 'safe-mode'].includes(candidateState);

  if (!hasCandidate) {
    if (!status.cardId && !status.buildId) return 'stage-new';
    return exactText(prepared.cardId, status.cardId) && exactText(prepared.buildId, status.buildId)
      ? 'stage-new'
      : 'candidate-conflict';
  }

  const config = prepared.config || {};
  const exactCandidate = exactText(prepared.cardId, status.cardId)
    && exactText(prepared.buildId, status.buildId)
    && exactNumber(config.projectRevision, status.projectRevision)
    && exactText(config.projectFingerprint, status.projectFingerprint)
    && Boolean(String(status.activationId || '').trim())
    && (!prepared.activationId || exactText(prepared.activationId, status.activationId))
    && optionalIdentityMatches(
      [config.productionJobId, config.productionJobDigest],
      [status.productionJobId, status.productionJobDigest],
    )
    && optionalWiringIdentityMatches(config, status);
  if (!exactCandidate) return 'candidate-conflict';

  if (state === 'staged' || candidateState === 'staged') return 'resume-activation';
  if (candidateState === 'awaiting-confirmation' || /confirm|rollback/.test(nextStep)) {
    return 'resume-confirmation';
  }
  if (nextStep === 'activate') return 'resume-activation';
  return 'resume-physical-test';
}

export function assertCardDeploymentPreflightIdentity(firmwareInfo = {}, status = {}) {
  if (!exactText(firmwareInfo.cardId, status.cardId) || !exactText(firmwareInfo.buildId, status.buildId)) {
    const error = new Error('Card identity or firmware build changed during install preflight. Nothing was sent.');
    error.reason = 'preflight-identity-mismatch';
    throw error;
  }
  return true;
}

export async function orchestrateCardDeploymentStart(prepared, operations = {}) {
  if (typeof operations.readFirmwareInfo !== 'function' ||
      typeof operations.readStatus !== 'function' ||
      typeof operations.readWiringStatus !== 'function') {
    throw new Error('All independent card preflight reads are required before deployment.');
  }
  const [firmwareInfo, status, wiringStatus] = await Promise.all([
    operations.readFirmwareInfo(),
    operations.readStatus(),
    operations.readWiringStatus(),
  ]);
  assertCardDeploymentPreflightIdentity(prepared, firmwareInfo);
  assertCardDeploymentPreflightIdentity(firmwareInfo, status);
  // Another window saved to this card since this window last saw it. Writing
  // now would replace that work without anyone knowing, so nothing is sent
  // until the owner chooses (open the card's version, or save anyway).
  if (operations.lastSeen && operations.saveAnyway !== true
    && cardChangedSinceSeen(operations.lastSeen, firmwareInfo)) {
    const error = new Error('This card was changed from another window.');
    error.reason = 'card-changed-elsewhere';
    throw error;
  }
  assertCardOutputCapacity(prepared.config, status);
  const action = classifyCardDeploymentResume(prepared, wiringStatus);
  if (action !== 'stage-new') return { action, status: wiringStatus, response: null };
  if (typeof operations.config !== 'function') {
    throw new Error('A config mutation is required to stage a new deployment.');
  }
  return { action, status: wiringStatus, response: await operations.config() };
}

export function correlateCardDeploymentReadinessEvidence(project = {}, status = {}) {
  const exactIdentity = exactText(project.cardId, status.cardId)
    && exactText(project.buildId, status.buildId)
    && exactNumber(project.projectRevision, status.projectRevision)
    && exactText(project.projectFingerprint, status.projectFingerprint);
  if (!exactIdentity) {
    const error = new Error('Card readiness did not carry the exact card, build, and project identity.');
    error.reason = 'readiness-identity-mismatch';
    throw error;
  }
  return {
    ...project,
    knownGoodProject: status.knownGoodProject,
    commandReady: status.commandReady,
    runtimePhase: status.runtimePhase,
    playbackReady: status.playbackReady,
    outputReady: status.outputReady,
  };
}

// A second write attempting to install exactly the project the card already
// holds and already reports ready. Verified through the same identity fields
// `correlateCardDeploymentReadinessEvidence` trusts (card, build, project
// revision, project fingerprint, all exact) plus the same readiness flags
// `verifyCardDeployment`'s `requireReady` branch requires — never project
// evidence alone, so a blank or mid-boot card can never read as "already
// current". Used by the install preflight (CardPushControl.pushToCard) to
// skip a redundant `/api/config` POST when the card has nothing left to
// apply. The caller is responsible for also checking there is no outstanding
// wiring candidate: a staged or testing candidate is a real, separate
// decision that this function has no visibility into.
export function isCardAlreadyCurrent(prepared, status = {}) {
  if (!prepared?.cardId) return false;
  const config = prepared.config || {};
  const exactIdentity = exactText(prepared.cardId, status.cardId)
    && exactText(prepared.buildId, status.buildId)
    && exactNumber(config.projectRevision, status.projectRevision)
    && exactText(config.projectFingerprint, status.projectFingerprint);
  if (!exactIdentity) return false;
  return status.knownGoodProject === true
    && status.commandReady === true
    && status.runtimePhase === 'ready'
    && status.playbackReady === true
    && status.outputReady === true;
}

export function classifyCardChanges(previousConfig, nextConfig) {
  if (!previousConfig) return { kind: 'hardware', requiresPhysicalTest: true, groups: ['Wiring'] };
  const previous = hardwareFacts(previousConfig);
  const next = hardwareFacts(nextConfig);
  const groups = [];
  if (stableJson(previous.outputs) !== stableJson(next.outputs)) groups.push('Wiring');
  if (stableJson(previous.power) !== stableJson(next.power)) groups.push('Power');
  if (stableJson(previous.color) !== stableJson(next.color)) groups.push('Calibration');
  return groups.length
    ? { kind: 'hardware', requiresPhysicalTest: true, groups }
    : { kind: 'visual', requiresPhysicalTest: false, groups: ['Playback'] };
}

export function cardStatusAsConfig(status = {}) {
  const led = status.led || {};
  return {
    led: {
      outputs: (status.outputs || []).map((output, index) => {
        const segments = Array.isArray(output.segments) ? output.segments : [];
        const directions = new Set(segments.map(segment => segment.direction || 'forward'));
        return {
          id: output.id || `out${index + 1}`,
          pin: Number(output.pin ?? output.gpio),
          pixels: Number(output.pixels ?? output.count),
          direction: directions.size > 1 ? 'mixed' : [...directions][0] || 'forward',
          segments,
        };
      }),
      maxMilliamps: Number(led.maxMilliamps),
      colorOrder: led.colorOrder,
      outputGammaEnabled: led.outputGammaEnabled,
      outputGammaValue: led.outputGammaValue,
      calibration: led.calibration,
    },
  };
}

export async function runCardDeployment(prepared, transport = {}, callbacks = {}) {
  const state = value => callbacks.onState?.(value);
  state('Sending');
  let response;
  if (prepared.changes.requiresPhysicalTest) {
    response = await transport.stage?.(prepared.runtimePackage);
    if (!response?.activationId) return { installed: false, reason: 'stage-failed' };
    await transport.startTest?.(response.activationId);
    state('Test lights');
    const confirmed = await callbacks.confirmHardware?.(response);
    if (!confirmed) {
      await transport.rollback?.(response.activationId);
      state('Restored previous setup');
      return { installed: false, reason: 'rolled-back' };
    }
    await transport.confirm?.(response.activationId);
  } else {
    response = await transport.install?.(prepared.runtimePackage);
    if (!response?.ok || response.delivered === false) return { installed: false, reason: 'send-failed' };
  }
  state('Verifying card');
  const readBack = await transport.readBack?.();
  const verification = verifyCardDeployment(prepared, readBack, { requireReady: true });
  if (!verification.ok) {
    callbacks.onVerificationFailed?.(verification);
    return { installed: false, reason: verification.reason };
  }
  callbacks.onInstalled?.(verification);
  state('Installed');
  return { installed: true, verification };
}

export function verifyCardDeployment(prepared, readBack = {}, { requireReady = false } = {}) {
  if (!readBack || readBack.cardId !== prepared.cardId) return { ok: false, reason: 'card-mismatch' };
  if (readBack.config && semanticFingerprint(readBack.config) !== prepared.fingerprint) return { ok: false, reason: 'read-back-mismatch' };
  if (!readBack.config && (
    readBack.projectRevision !== prepared.config.projectRevision ||
    readBack.projectFingerprint !== prepared.config.projectFingerprint
  )) return { ok: false, reason: 'read-back-mismatch' };
  if (requireReady && readBack.runtimePhase !== 'ready') return { ok: false, reason: 'runtime-not-ready' };
  if (requireReady && readBack.playbackReady !== true) return { ok: false, reason: 'playback-not-ready' };
  if (requireReady && readBack.outputReady !== true) return { ok: false, reason: 'output-not-ready' };
  if (requireReady && (readBack.knownGoodProject !== true || readBack.commandReady !== true)) {
    return { ok: false, reason: 'card-not-ready' };
  }
  if (runtimeConfigUsesKaleidoscope(prepared.config)) {
    const appliedMappings = readBack.config?.kaleidoscopeMappings ?? readBack.kaleidoscopeMappings;
    if (!Array.isArray(appliedMappings)) return { ok: false, reason: 'read-back-mismatch' };
    try {
      const totalPixels = prepared.config.led?.pixels;
      const zones = prepared.config.zones;
      const expected = normalizeCardKaleidoscopeMappings(
        prepared.config.kaleidoscopeMappings, totalPixels, zones,
      );
      const actual = normalizeCardKaleidoscopeMappings(appliedMappings, totalPixels, zones);
      if (stableJson(actual) !== stableJson(expected)) return { ok: false, reason: 'read-back-mismatch' };
    } catch {
      return { ok: false, reason: 'read-back-mismatch' };
    }
  }
  return { ok: true, cardId: prepared.cardId, fingerprint: prepared.fingerprint };
}

function postSaveVerificationError(reason, message) {
  const error = new Error(message);
  error.reason = reason;
  return error;
}

function installedIds(items = []) {
  return new Set(Array.isArray(items) ? items.map(item => String(item?.id || '')).filter(Boolean) : []);
}

export async function verifyCardPostSaveState({
  prepared,
  host,
  expectedCardId = prepared?.cardId || '',
  requiredPatternIds = [],
  requiredZoneIds = [],
  acquireAuthority = options => connectCardTransport(options),
} = {}) {
  if (!prepared || !expectedCardId) {
    throw postSaveVerificationError('identity-missing', 'Exact card identity is required after saving.');
  }
  const authority = await acquireAuthority({ host, expectedCardId });
  if (!authority?.connected && typeof authority?.request !== 'function') {
    throw postSaveVerificationError(
      authority?.reason || 'direct-unavailable',
      'Studio could not reacquire the exact card after saving.',
    );
  }
  if (String(authority.cardId || authority.card?.id || '') !== expectedCardId) {
    throw postSaveVerificationError('card-mismatch', 'A different Lightweaver card answered after saving.');
  }
  const [status, wiring, patterns, zones] = await Promise.all([
    authority.request('/api/status'),
    authority.request('/api/wiring/status'),
    authority.request('/api/patterns'),
    authority.request('/api/zones'),
  ]);
  const installed = verifyCardDeployment(prepared, status, { requireReady: true });
  if (!installed.ok) throw postSaveVerificationError(installed.reason, 'The card still reports the previous project after saving.');
  if (wiring?.hasCandidate === true || String(wiring?.state || '').toLowerCase() !== 'known-good') {
    throw postSaveVerificationError('wiring-not-known-good', 'The saved wiring is not the card’s known-good setup.');
  }
  const patternIds = installedIds(patterns?.patterns);
  if (requiredPatternIds.some(id => !patternIds.has(String(id)))) {
    throw postSaveVerificationError('patterns-missing', 'The card did not expose every saved pattern.');
  }
  const zoneIds = installedIds(zones?.zones);
  if (requiredZoneIds.some(id => !zoneIds.has(String(id)))) {
    throw postSaveVerificationError('zones-missing', 'The card did not expose every saved section.');
  }
  return { ...installed, status, wiring, patterns, zones, authority };
}

/**
 * How long a save waits for the card to come back from its planned restart.
 * Measured on the real card: about 14 s; the limit leaves room for a slow
 * router. Within it Studio says "Restarting the card…", never a failure.
 */
export const CARD_RESTART_WAIT_MS = 45000;

/**
 * Wait for a card Studio just saved to come back from its planned restart:
 * an answer from a boot other than `fromBootId` that is taking commands
 * again. Silence inside the limit is the restart, never a failure.
 */
export async function waitForCardRestart({
  readStatus,
  fromBootId = '',
  restartWaitMs = CARD_RESTART_WAIT_MS,
  intervalMs = 800,
  now = () => Date.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const startedAt = now();
  let sawSilence = false;
  for (let attempt = 0; attempt === 0 || now() - startedAt < restartWaitMs; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    try {
      const status = await readStatus();
      const bootId = String(status?.bootId || '');
      const oldBoot = fromBootId && bootId ? bootId === fromBootId : !sawSilence && now() - startedAt < 6000;
      if (!oldBoot && status?.commandReady === true) return status;
    } catch {
      sawSilence = true;
    }
  }
  const error = new Error(`The card has not come back after restarting (${Math.round(restartWaitMs / 1000)} s). Check it has power and is on this Wi-Fi; your work is kept in Studio.`);
  error.reason = 'restart-timeout';
  throw error;
}

export async function waitForCardDeploymentVerification(prepared, {
  readEvidence,
  attempts = 20,
  intervalMs = 600,
  requireReady = false,
  // A save that restarts the card: keep reading until this deadline, and only
  // an answer from a boot other than `restartFromBootId` counts.
  restartWaitMs = 0,
  restartFromBootId = '',
  onWaiting = () => {},
  now = () => Date.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  if (!prepared?.cardId) throw new Error('Exact card identity is required before installation.');
  if (typeof readEvidence !== 'function') throw new Error('Card read-back is required after installation.');
  let last = { ok: false, reason: 'read-back-missing' };
  const startedAt = now();
  const deadline = restartWaitMs > 0 ? startedAt + restartWaitMs : 0;
  let sawSilence = false;
  let answeredAfterRestart = false;
  let lastOldBootEvidence = null;
  // Any multi-read verification that finds the card quiet keeps reading until
  // the restart limit: a save restarts the card, and a quiet card mid-restart
  // is not a failed save (todo/plans/false-failures.md).
  const quietDeadline = startedAt + CARD_RESTART_WAIT_MS;
  const keepGoing = attempt => {
    if (deadline) return attempt === 0 || now() < deadline;
    if (attempt < attempts) return true;
    return attempts > 1 && sawSilence && now() < quietDeadline;
  };
  for (let attempt = 0; keepGoing(attempt); attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    try {
      const evidence = await readEvidence();
      if (deadline) {
        const bootId = String(evidence?.bootId || '');
        const previous = String(restartFromBootId || '');
        // The answer came from the boot that is about to end (firmware
        // restarts within 5 s of a save); it says nothing about the restart.
        // Without boot ids, an answer only counts once the card went quiet
        // or the firmware's own 5 s restart fallback has passed.
        const fromOldBoot = previous && bootId ? bootId === previous
          : !sawSilence && now() - startedAt < 6000;
        if (fromOldBoot) {
          lastOldBootEvidence = evidence;
          last = { ok: false, reason: 'restart-pending' };
          onWaiting({ elapsedMs: now() - startedAt, phase: 'restarting' });
          continue;
        }
      }
      if (deadline) answeredAfterRestart = true;
      last = verifyCardDeployment(prepared, evidence, { requireReady });
      if (last.ok) return last;
      if (deadline) onWaiting({ elapsedMs: now() - startedAt, phase: 'verifying' });
      if (last.reason === 'card-mismatch') {
        throw new Error(`Wrong card answered during verification. Expected ${prepared.cardId}.`);
      }
    } catch (error) {
      if (/Wrong card answered/.test(error?.message || '')) throw error;
      last = { ok: false, reason: error?.reason || 'read-back-missing', error };
      sawSilence = true;
      if (deadline) onWaiting({ elapsedMs: now() - startedAt, phase: 'restarting' });
    }
  }
  // The card answered all along from the same boot: it never restarted. If
  // what it holds is the saved project, the save landed without a restart;
  // otherwise it did not take the save. Neither is "has not come back".
  if (deadline && !answeredAfterRestart && lastOldBootEvidence) {
    let asIs = null;
    try { asIs = verifyCardDeployment(prepared, lastOldBootEvidence, { requireReady }); } catch { asIs = null; }
    if (asIs?.ok) return asIs;
    const error = new Error('The card is answering, but it did not take this save. Nothing changed on the card; your work is kept in Studio. Try Save to card again.');
    error.reason = 'save-not-applied';
    throw error;
  }
  const neverCameBack = Boolean(deadline) && !answeredAfterRestart;
  const error = new Error(neverCameBack
    ? `The card has not come back after restarting (${Math.round(restartWaitMs / 1000)} s). Check it has power and is on this Wi-Fi; your work is kept in Studio.`
    : 'The card did not verify the exact installed project. Studio still shows the previous installed state.');
  error.reason = neverCameBack ? 'restart-timeout' : last.reason;
  throw error;
}

function exactText(left, right) {
  const a = String(left ?? '').trim();
  const b = String(right ?? '').trim();
  return Boolean(a) && a === b;
}

function exactNumber(left, right) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function optionalIdentityMatches(left, right) {
  const a = left.map(value => String(value ?? '').trim().toLowerCase());
  const b = right.map(value => String(value ?? '').trim().toLowerCase());
  if (![...a, ...b].some(Boolean)) return true;
  return a.every((value, index) => Boolean(value) && value === b[index]);
}

function optionalWiringIdentityMatches(config, status) {
  const leftRevision = Number(config.wiringRevision || 0);
  const rightRevision = Number(status.wiringRevision || 0);
  const leftDigest = String(config.wiringDigest || '').trim().toLowerCase();
  const rightDigest = String(status.wiringDigest || '').trim().toLowerCase();
  if (!leftRevision && !rightRevision && !leftDigest && !rightDigest) return true;
  return leftRevision > 0 && leftRevision === rightRevision && Boolean(leftDigest) && leftDigest === rightDigest;
}

function hardwareFacts(config = {}) {
  const led = config.led || {};
  return {
    outputs: (led.outputs || []).map(output => {
      const segments = Array.isArray(output.segments) ? output.segments : [];
      const directions = new Set(segments.map(segment => segment.direction || 'forward'));
      const direction = directions.size > 1
        ? 'mixed'
        : output.direction || [...directions][0] || 'forward';
      return {
        pin: output.pin,
        direction,
        // Boundaries between same-direction runs do not alter electrical
        // output. Preserve the split only when direction changes physically.
        segments: direction === 'mixed'
          ? segments.map(segment => ({ count: segment.count, direction: segment.direction || 'forward' }))
          : [],
      };
    }),
    power: { maxMilliamps: led.maxMilliamps },
    color: {
      colorOrder: led.colorOrder,
      outputGammaEnabled: led.outputGammaEnabled,
      outputGammaValue: led.outputGammaValue,
      calibration: led.calibration,
    },
  };
}

function semanticFingerprint(value) {
  const text = stableJson(value);
  return [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map(seed => fnv1a(text, seed).toString(16).padStart(8, '0'))
    .join('').repeat(2);
}

function fnv1a(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// What a caller renders while `prepareCardDeployment` cannot run at all.
// It exists so a project Studio is unable to package is a REPORTED state
// rather than a render-time throw: an unpackageable project used to take down
// every screen that derived a deployment during render, which since Card Home
// absorbed the Hardware settings meant taking down Card Home itself.
//
// Built from an EMPTY project rather than hand-written, so it is a real,
// correctly shaped deployment by construction. A hand-written `{}` config was
// the first attempt and it simply moved the crash one line down, to the next
// screen that read `config.led`. An empty project has no runs and no strips,
// so there is nothing for the packager to find inconsistent.
export const EMPTY_CARD_DEPLOYMENT = prepareCardDeployment({});
