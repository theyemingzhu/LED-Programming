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
  // The card is healthy. The connection panel explains whether the installed
  // copy has a different ID or has drifted from the open project.
  'project-mismatch': 'Save to card',
  // Same chip as project-mismatch: typed layout length drifted from the card.
  // The physical strip stays at last saved length until the owner clicks.
  'length-mismatch': 'Save to card',
  // Same project, newer Studio content (playlist, looks, layout that is not
  // a length-only tweak). Footer Save writes that content; Setup stays for a
  // different project id.
  'content-mismatch': 'Save to card',
  'attention-required': 'Needs attention',
  // The card is running Studio's own light test: the new wiring on probation,
  // commands held until the owner confirms. A step, not a fault (FS1).
  'wiring-test': 'Testing lights',
  // Studio's own light test restarting the card on purpose (FS3).
  'wiring-test-restart': 'Restarting card',
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
  'wiring-test': 'install-project',
  'wiring-test-restart': 'install-project',
  'discovery-setup': 'discover-lights',
  confirming: 'reconnect-card',
  ready: 'open-patterns',
});

/** How long after boot a not-yet-ready card is "starting", not "needs attention". */
export const CARD_STARTING_GRACE_MS = 20000;

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
  'wiring-test': 'Connected',
  'wiring-test-restart': 'Restarting card',
});

// 'verifying' covers three different moments. Only one of them is a restart
// the owner did not ask for; the other two must not say "restarted".
function verifyingLabel(state, reason) {
  if (state !== 'verifying') return '';
  if (reason === 'card-restarting') return 'Restarting card';
  if (reason === 'card-restarted') return 'Card restarted — verifying';
  return 'Checking card';
}

function lifecycleLabel(state) {
  return LABELS[state] || LABELS.disconnected;
}

function lifecycleConnectionLabel(state) {
  return CONNECTION_LABELS[state] || LABELS[state] || LABELS.disconnected;
}

function lifecycleSetupTask(state) {
  return SETUP_TASKS[state] || SETUP_TASKS.disconnected;
}

// F25: the Connection Center's direct-connect identity card printed "still
// verifying its installed project" for EVERY state that was not the literal
// `ready` value — including decided, terminal states like project-mismatch.
// A card that answered `/api/status` in 72ms and landed on project-mismatch
// was not verifying anything; the heading said "Card verified" beside a body
// that said the opposite. `safeControlAccess` is always identical to `state`
// (see the ternary below), so these two functions branch on the real verdict
// instead of collapsing every non-ready state into one "waiting" sentence.
const DIRECT_CONNECT_WAITING_STATES = new Set(['confirming', 'verifying']);

const DIRECT_CONNECT_READY_COPY = 'This exact card and installed project are ready for ordinary pattern, color, brightness, and Stop controls. Project saves and firmware changes keep their stronger safety checks.';

const DIRECT_CONNECT_WAITING_COPY = 'This exact card answered, but Studio is still verifying its installed project before ordinary controls are enabled.';

// Every other terminal state (a blank card, a runtime that answered but is
// not ready, etc.) gets its own one-sentence verdict built from the same
// label map the footer chip and identity row already use, so a future state
// automatically gets a real sentence instead of silently falling into the
// waiting copy.
export function directConnectVerdictCopy(state, lifecycle) {
  if (state === 'ready') return DIRECT_CONNECT_READY_COPY;
  if (state === 'project-mismatch') {
    const { projectIdRelationship, projectRevisionDiffers } = lifecycle || {};
    const evidence = projectIdRelationship === 'different'
      ? 'This card holds a different project from the one open in Studio.'
      : projectIdRelationship === 'same' && projectRevisionDiffers
        ? 'This card holds the same project at a different revision.'
        : projectIdRelationship === 'same'
          ? 'Studio has not matched the open project to the copy on this card.'
          : 'Studio could not confirm which project this card holds.';
    return `${evidence} Use the card's copy, or save this one to the card.`;
  }
  if (!state || DIRECT_CONNECT_WAITING_STATES.has(state)) return DIRECT_CONNECT_WAITING_COPY;
  return `This exact card answered. Card status: ${lifecycleLabel(state).toLowerCase()}.`;
}

// "Card verified" is literally true of transport identity in every connected
// state, but beside a decided project mismatch it reads as "your project is
// fine too" — the exact confusion the F25 report named. Only project-mismatch
// gets the weaker, still-true heading; every other connected state keeps the
// stronger claim.
export function directConnectHeading(state) {
  return state === 'project-mismatch' ? 'Card connected' : 'Card verified';
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

export function deriveCardLifecycle({ link = {}, update = null, project = null, lightTestPhase = '' } = {}) {
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
  const revisionsKnown = Number.isSafeInteger(studioRevision) && studioRevision >= 0
    && Number.isSafeInteger(cardRevision) && cardRevision >= 0;
  const exactRevision = revisionsKnown && studioRevision === cardRevision;
  const projectIdRelationship = !studioProjectId || !cardProjectId ? 'unknown'
    : studioProjectId === cardProjectId ? 'same' : 'different';
  const sameProjectId = projectIdRelationship === 'same';
  // A card flashed before fingerprint reporting answers with an empty
  // fingerprint for a project it genuinely holds. When the Studio side's
  // binding is a verified installation record made against that empty value
  // (`legacyFingerprintBinding`), the empty answer confirms the record instead
  // of contradicting it. A card that reports a real fingerprint must match it.
  const exactFingerprint = cardFingerprint
    ? Boolean(studioFingerprint && studioFingerprint === cardFingerprint)
    : project?.legacyFingerprintBinding === true;
  const exactProject = sameProjectId && exactFingerprint && exactRevision;
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

  // The card repeats a rollback on every status read until it next restarts —
  // days, on a piece that is simply left running. When no update of Studio's
  // own is open and the card is verified, on a known-good project and taking
  // commands, the rollback has already done its job: there is nothing left to
  // recover, and "read this card again" can only re-read the same flag. That
  // is history. A rollback Studio is party to (`update`), or one that left the
  // card unwell, is still a failure and still stops here.
  // A card that has only just booted (a save restarts it on purpose, every
  // time) answers with commandReady still false for a moment while its
  // transitions settle. That is a card starting, not a card refusing — on
  // the real card it read as "Update rolled back" or "Needs attention" right
  // after every successful save (todo/plans/false-failures.md).
  const uptimeMs = Number(readiness.uptimeMs);
  const justBooted = Number.isFinite(uptimeMs) && uptimeMs >= 0 && uptimeMs < CARD_STARTING_GRACE_MS;
  const stillStarting = !commandReady && (link.state === 'revalidating' || justBooted || evidenceIncomplete);
  // The record names the build the rollback restored. A card running exactly
  // that build has finished recovering, whatever else it is doing: a bench or
  // provisional card is never command-ready, and its old record used to block
  // every write and label it "Update rolled back" forever (2026-11-21, F-D1).
  const rollback = readiness.firmwareUpdate || {};
  const runningRestoredBuild = (normalized(rollback.restoredBuildId) && normalized(rollback.restoredBuildId) === normalized(readiness.buildId))
    || (Number(rollback.restoredBuildNumber) > 0 && Number(rollback.restoredBuildNumber) === Number(readiness.buildNumber));
  const pastUpdateRolledBack = !update
    && rollback.phase === 'rolled-back'
    && (commandReady || stillStarting || !verifiedTransport || runningRestoredBuild);

  let state = 'disconnected';
  if (updateEvidence?.phase === 'rolled-back' && !pastUpdateRolledBack) state = 'update-rolled-back';
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
  else if (commandReady && sameProjectId && lengthDiffers(project, readiness)) {
    state = 'length-mismatch';
  }
  else if (commandReady && sameProjectId && liveContentDiffers(project)) {
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
  else if (verifiedTransport && (evidenceIncomplete || justBooted)) state = 'confirming';
  // During the light test the card runs the candidate on probation and
  // reports runtimePhase 'recovering' with commands held — the light test
  // working exactly as designed. It fell to the catch-all below and Card
  // Home said "Needs attention" about a save that was going fine (FS1,
  // todo/plans/practice-card-interruptions.md). The card's own probation
  // flag is the evidence; anything else not ready still lands below.
  else if (verifiedTransport && readiness.wiringProbation?.active === true) state = 'wiring-test';
  else if (verifiedTransport) state = 'attention-required';
  else if (link.state === 'connecting') state = 'connecting';

  // FS3: Studio's own light test restarts the card on purpose (start,
  // confirm, restore). While it is in progress, the card going quiet or not
  // yet ready is that restart — not "Card stopped responding" or "A Lightweaver
  // card is not connected". Only for the card this Studio knows, and only the
  // quiet/not-ready verdicts: a wrong card, a failed update or a blank card
  // still say so.
  const knownCard = Boolean(normalized(link.card?.id || link.expectedCard?.id));
  if (lightTestPhase && knownCard
    && ['disconnected', 'reconnecting', 'verifying', 'connecting', 'confirming', 'attention-required'].includes(state)) {
    state = 'wiring-test-restart';
  }

  return Object.freeze({
    state,
    exactCard,
    exactProject,
    exactRevision,
    projectIdRelationship,
    projectRevisionDiffers: revisionsKnown && !exactRevision,
    commandReady,
    installedControlsReady: commandReady && Boolean(readiness.bootId) && !readiness.safeMode
      && (!link.validatedBootId || link.validatedBootId === readiness.bootId)
      && ['ready', 'project-mismatch', 'length-mismatch', 'content-mismatch'].includes(state),
    safeControlAccess: state === 'ready' ? 'ready' : state,
    label: state === 'discovery-setup' && hasCountedLights(project, readiness)
      ? 'Lights counted'
      : verifyingLabel(state, link.reason) || lifecycleLabel(state),
    connectionLabel: verifyingLabel(state, link.reason) || lifecycleConnectionLabel(state),
    setupTaskId: lifecycleSetupTask(state),
    pastUpdateRolledBack,
    reason: normalized(pastUpdateRolledBack
      ? link.reason
      : (updateEvidence?.reason || updateEvidence?.rollbackReason || link.reason)),
  });
}
