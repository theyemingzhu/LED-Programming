import { sanitizeProjectId } from './projectIdentity.js';
import { isUncountedHeadroomCount } from './discoveryCommit.js';

const CONNECTED_STATES = new Set(['connected-direct', 'connected-bridge']);

const LABELS = Object.freeze({
  disconnected: 'Not connected',
  connecting: 'Connecting',
  recovering: 'Recovering',
  reconnecting: 'Card stopped responding',
  verifying: 'Card restarted — verifying',
  'found-unpaired': 'Found — pair',
  updating: 'Updating card',
  'update-recovering': 'Restarting card',
  'wrong-card': 'Wrong card',
  'target-mismatch': 'Needs attention',
  'project-changed': 'Needs attention',
  'update-rolled-back': 'Update rolled back',
  'update-required': 'Needs attention',
  'setup-required': 'Needs project',
  // Not "Needs attention": nothing is wrong. The card is healthy and holds this
  // same project at an older revision, and the whole remedy is to save. The
  // alarming label sat beside an identity row that said the project matched,
  // and it is the single line owners said made them stop trusting the screen.
  'project-mismatch': 'Save to card',
  // Same chip as project-mismatch: typed layout length drifted from the card.
  // The physical strip stays at last saved length until the owner clicks.
  'length-mismatch': 'Save to card',
  // Same project, newer Studio content (playlist, looks, layout that is not
  // a length-only tweak). Footer Save writes that content; Setup stays for a
  // different project id.
  'content-mismatch': 'Save to card',
  'attention-required': 'Needs attention',
  'discovery-setup': 'Finding lights',
  confirming: 'Checking card',
  ready: 'Connected',
});

const SETUP_TASKS = Object.freeze({
  disconnected: 'connect-card',
  connecting: 'connect-card',
  recovering: 'recover-operation',
  reconnecting: 'reconnect-card',
  verifying: 'reconnect-card',
  'found-unpaired': 'pair-card',
  updating: 'recover-operation',
  'update-recovering': 'recover-operation',
  'wrong-card': 'connect-card',
  'target-mismatch': 'update-firmware',
  'project-changed': 'load-matching-project',
  'update-rolled-back': 'recover-operation',
  'update-required': 'update-firmware',
  'setup-required': 'install-project',
  'project-mismatch': 'load-matching-project',
  'length-mismatch': 'save-led-count',
  'content-mismatch': 'save-project',
  'attention-required': 'recover-operation',
  'discovery-setup': 'discover-lights',
  confirming: 'reconnect-card',
  ready: 'open-patterns',
});

function normalized(value) {
  return String(value || '').trim();
}

function normalizedFingerprint(value) {
  return normalized(value).toLowerCase();
}

// LABELS is the FOOTER chip's vocabulary: a chip is a thing you press, so its
// text is an errand ("Save to card"). Setup's identity row is not a chip — it
// is the one status on Card Home, and its Connection field answers exactly one
// question: is Studio talking to this card? A card whose project has drifted
// IS connected; the drift is what the Installed field is for. Printing the
// errand in both fields put "Save to card" twice in a four-field row, which is
// the same chorus the Home compression removed from the prose.
const CONNECTION_LABELS = Object.freeze({
  'project-mismatch': 'Connected',
  'length-mismatch': 'Connected',
  'content-mismatch': 'Connected',
  'setup-required': 'Connected',
  'discovery-setup': 'Connected',
});

function lifecycleLabel(state) {
  return LABELS[state] || LABELS.disconnected;
}

function lifecycleConnectionLabel(state) {
  return CONNECTION_LABELS[state] || LABELS[state] || LABELS.disconnected;
}

function lifecycleSetupTask(state) {
  return SETUP_TASKS[state] || SETUP_TASKS.disconnected;
}

function pixelCountFromStrips(strips = []) {
  return strips.reduce((sum, strip) => {
    const count = Math.trunc(Number(strip?.pixelCount ?? strip?.pixels?.length ?? strip?.leds) || 0);
    return sum + (count > 0 ? count : 0);
  }, 0);
}

export function studioTypedLedCount(project = {}) {
  const explicit = Math.trunc(Number(project?.totalPixels));
  if (Number.isSafeInteger(explicit) && explicit > 0) return explicit;
  const fromStrips = Array.isArray(project?.strips) ? pixelCountFromStrips(project.strips) : 0;
  if (fromStrips > 0) return fromStrips;
  if (Array.isArray(project?.layout?.strips)) return pixelCountFromStrips(project.layout.strips);
  return fromStrips;
}

export function cardReportedLedCount(readiness = {}) {
  const requested = Math.trunc(Number(readiness?.requestedPixels));
  if (Number.isSafeInteger(requested) && requested > 0) return requested;
  const led = Math.trunc(Number(readiness?.led?.pixels));
  if (Number.isSafeInteger(led) && led > 0) return led;
  const outputs = Array.isArray(readiness?.outputs) ? readiness.outputs : [];
  const fromOutputs = outputs.reduce((sum, output) => {
    const count = Math.trunc(Number(output?.pixels ?? output?.count) || 0);
    return sum + (count > 0 ? count : 0);
  }, 0);
  return fromOutputs > 0 ? fromOutputs : 0;
}

function sameProjectId(project, readiness) {
  const studioProjectId = sanitizeProjectId(project?.id || project?.projectId);
  const cardProjectId = sanitizeProjectId(readiness?.projectId || readiness?.piece?.id);
  return Boolean(studioProjectId && cardProjectId && studioProjectId === cardProjectId);
}

function lengthDiffers(project, readiness) {
  const studio = studioTypedLedCount(project);
  const card = cardReportedLedCount(readiness);
  return studio > 0 && card > 0 && studio !== card;
}

function hasCountedLights(project, readiness) {
  const card = cardReportedLedCount(readiness);
  if (card > 0) return !isUncountedHeadroomCount(card);
  const studio = studioTypedLedCount(project);
  return studio > 0 && !isUncountedHeadroomCount(studio);
}

function liveContentDiffers(project) {
  const live = normalizedFingerprint(project?.liveFingerprint);
  const synced = normalizedFingerprint(project?.syncedFingerprint);
  return Boolean(live && synced && live !== synced);
}

export function cardFooterNeedsSave(lifecycle) {
  return lifecycle?.label === 'Save to card';
}

export function deriveCardLifecycle({ link = {}, update = null, project = null } = {}) {
  const readiness = link.readiness || {};
  const updateEvidence = update || readiness.firmwareUpdate || null;
  const observedId = normalized(link.card?.id || readiness.cardId);
  const expectedId = normalized(link.expectedCard?.id);
  const exactCard = Boolean(observedId) && (!expectedId || observedId === expectedId);
  // Project ids cross a sanitizing boundary: the card lowercases and slugifies
  // whatever id it was given before storing it, so an exact-match comparison of
  // the raw strings reports a permanent mismatch for a correctly installed
  // card. Both sides go through the card's own sanitizer here, the same way
  // fingerprints are already case-folded below.
  const studioProjectId = sanitizeProjectId(project?.id || project?.projectId);
  const cardProjectId = sanitizeProjectId(readiness.projectId || readiness.piece?.id);
  const studioFingerprint = normalizedFingerprint(project?.fingerprint || project?.projectFingerprint);
  const cardFingerprint = normalizedFingerprint(readiness.projectFingerprint);
  const studioRevision = Number(project?.revision ?? project?.projectRevision);
  const cardRevision = Number(readiness.projectRevision);
  const exactRevision = Number.isSafeInteger(studioRevision) && studioRevision >= 0
    && Number.isSafeInteger(cardRevision) && cardRevision >= 0
    && studioRevision === cardRevision;
  // A card flashed before fingerprint reporting answers with an empty
  // fingerprint for a project it genuinely holds. When the Studio side's
  // binding is a verified installation record made against that empty value
  // (`legacyFingerprintBinding`), the empty answer confirms the record instead
  // of contradicting it. A card that reports a real fingerprint must match it.
  const exactFingerprint = cardFingerprint
    ? Boolean(studioFingerprint && studioFingerprint === cardFingerprint)
    : project?.legacyFingerprintBinding === true;
  const exactProject = Boolean(studioProjectId && cardProjectId && studioProjectId === cardProjectId)
    && exactFingerprint
    && exactRevision;
  const verifiedTransport = exactCard && CONNECTED_STATES.has(link.state);
  const commandReady = verifiedTransport
    && readiness.runtimePhase === 'ready'
    && readiness.knownGoodProject === true
    && readiness.commandReady === true
    && readiness.outputReady === true
    && readiness.playbackReady === true
    && readiness.provisionalSetup !== true;
  // The same evidence-complete gate classifyCardReadiness applies
  // (cardReadiness.js, the 'evidence-incomplete' branch): a card that has not
  // yet SAID whether it is ready is different from a card that said no. A
  // verified transport whose readiness envelope still misses any of these
  // fields is a fresh connect mid-probe, not a failure — landing it on
  // `attention-required` flashed "Needs attention" on every connect.
  const evidenceIncomplete = typeof readiness.knownGoodProject !== 'boolean'
    || typeof readiness.commandReady !== 'boolean'
    || typeof readiness.outputReady !== 'boolean'
    || !normalized(readiness.bootId);

  let state = 'disconnected';
  if (updateEvidence?.phase === 'rolled-back') state = 'update-rolled-back';
  else if (['preflight', 'sending', 'verifying'].includes(updateEvidence?.phase)) state = 'updating';
  else if (['restarting', 'probation', 'recovering'].includes(updateEvidence?.phase)) state = 'update-recovering';
  else if (updateEvidence?.phase === 'blocked' && updateEvidence?.reason === 'wrong-card') state = 'wrong-card';
  else if (updateEvidence?.phase === 'blocked' && updateEvidence?.reason === 'target-mismatch') state = 'target-mismatch';
  else if (updateEvidence?.phase === 'blocked' && updateEvidence?.reason === 'project-changed') state = 'project-changed';
  else if (['blocked', 'timeout'].includes(updateEvidence?.phase)) state = 'attention-required';
  else if (link.reason === 'wrong-card' || (observedId && expectedId && !exactCard)) state = 'wrong-card';
  else if (link.reason === 'found-unpaired') state = 'found-unpaired';
  else if (link.activity === 'recovering') state = 'recovering';
  else if (link.activity === 'pending') state = 'connecting';
  else if (link.state === 'revalidating') state = 'verifying';
  else if (link.state === 'reconnecting' || link.state === 'reconnecting-bridge') state = 'reconnecting';
  else if (link.reason === 'firmware-too-old' || link.reason === 'identity-missing') state = 'update-required';
  else if (exactCard && link.cardBlank === true) state = 'setup-required';
  else if (link.activity === 'failed' || link.reason === 'operation-uncertain' || link.reason === 'popup-blocked') state = 'attention-required';
  // The temporary light-finding setup Studio itself writes to the card. Every
  // readiness signal is true; the ONLY thing holding commandReady down is
  // `provisionalSetup`, which is this flow working exactly as designed. It used
  // to fall through to the catch-all below and be reported as
  // "Needs attention — Studio could not confirm the result of the last card
  // operation", offering a re-read that could never change it, on a card that
  // was mid-setup and perfectly healthy. It is a step, not a fault.
  else if (verifiedTransport
    && readiness.provisionalSetup === true
    && readiness.commandReady === true
    && readiness.runtimePhase === 'ready') state = 'discovery-setup';
  else if (commandReady && sameProjectId(project, readiness) && lengthDiffers(project, readiness)) {
    state = 'length-mismatch';
  }
  else if (commandReady && sameProjectId(project, readiness) && liveContentDiffers(project)) {
    state = 'content-mismatch';
  }
  else if (commandReady && !exactProject) state = 'project-mismatch';
  else if (commandReady && exactProject) state = 'ready';
  // Every failure, update, wrong-card, and blank branch above has already
  // declined this link, so what remains on a verified transport is only the
  // readiness verdict. Incomplete evidence is `confirming` (still checking);
  // complete-but-false evidence is a genuinely not-ready card and stays
  // `attention-required`. A ready→ready poll never lands here: its evidence
  // is complete and true, so the commandReady branches above take it.
  else if (verifiedTransport && evidenceIncomplete) state = 'confirming';
  else if (verifiedTransport) state = 'attention-required';
  else if (link.state === 'connecting') state = 'connecting';

  return Object.freeze({
    state,
    exactCard,
    exactProject,
    exactRevision,
    commandReady,
    safeControlAccess: state === 'ready' ? 'ready' : state,
    label: state === 'discovery-setup' && hasCountedLights(project, readiness)
      ? 'Lights counted'
      : lifecycleLabel(state),
    connectionLabel: lifecycleConnectionLabel(state),
    setupTaskId: lifecycleSetupTask(state),
    reason: normalized(updateEvidence?.reason || updateEvidence?.rollbackReason || link.reason),
  });
}
