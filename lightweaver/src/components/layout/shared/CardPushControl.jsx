import { useEffect, useReducer, useRef, useState } from 'react';
import { useProject } from '../../../state/ProjectContext.jsx';
import { cardActionReducer, createCardActionState } from '../../../lib/cardAction.js';
import {
  getCardHostname,
  setCardHostname,
  pushConfigToCard,
  readCardProjectEvidence,
  readCardStatusEnvelope,
  buildCardConfigHandoffUrl,
  CardPushError,
} from '../../../lib/cardPushClient.js';
import {
  prepareCardDeployment,
  cardStatusAsConfig,
  assertCardDeploymentPreflightIdentity,
  correlateCardDeploymentReadinessEvidence,
  isCardAlreadyCurrent,
  orchestrateCardDeploymentStart,
  waitForCardDeploymentVerification,
} from '../../../lib/cardDeployment.js';
import {
  activateAndWaitForCardWiring,
  confirmCardWiringCandidate,
  getCardWiringStatus,
  rollbackCardWiringCandidate,
} from '../../../lib/cardWiringSafety.js';
import { openLocalCardPage } from '../../../lib/cardBridge.js';
import { isTransientCardFailure } from '../../../lib/cardTransientFailure.js';
import { readPersistedCardIdentity } from '../../../lib/cardIdentity.js';
import { currentInstallation } from '../../../lib/projectLifecycle.js';
import { prepareCardStoragePayload } from '../../../lib/cardStoragePayload.js';
import { withStudioHardwareOperation } from '../../../lib/studioHardwareOperation.js';
import { acquireCardWriteLease } from '../../../lib/cardWriteLease.js';
import { getCardLinkState, reportCardStatusEnvelope } from '../../../lib/cardLink.js';

const LOCAL_BRIDGE_RECOVERY_REASONS = new Set([
  'mixed-content',
  'bridge-missing',
  'bridge-timeout',
  'bridge-post-failed',
]);

export function validateCardPushAttempt(attempt, projectLifecycle) {
  if (!attempt || attempt.revision !== projectLifecycle.editedRevision ||
      attempt.generation !== projectLifecycle.generation) {
    throw new CardPushError('project-changed', 'The project changed after this card attempt was prepared. Start a new install so the card receives the current project.');
  }
}

// F36: every read here used to omit `transport`, so on a hosted https Studio
// with a genuine direct link (isMixedContentBlocked() always true there) this
// guessed the card-page bridge even when a plain fetch would have answered.
// Default to the shared link's own transport, same source app.jsx builds the
// cardLink prop from everywhere else, so a caller with a fresher hint can
// still override it.
async function readReadyDeploymentEvidence(host, transport = getCardLinkState().transport) {
  const [project, status] = await Promise.all([
    readCardProjectEvidence({ host, transport }),
    readCardStatusEnvelope({ host, transport }),
  ]);
  return { ...correlateCardDeploymentReadinessEvidence(project, status), readiness: status };
}

async function waitForReadyDeploymentVerification(prepared, host) {
  let readiness = null;
  const verification = await waitForCardDeploymentVerification(prepared, {
    readEvidence: async () => {
      const evidence = await readReadyDeploymentEvidence(host);
      readiness = evidence.readiness;
      return evidence;
    },
    requireReady: true,
  });
  return { verification, readiness };
}

async function publishVerifiedReadiness(prepared, host) {
  const transport = getCardLinkState().transport;
  if (!['direct', 'bridge'].includes(transport)) return;
  for (let read = 0; read < 2; read += 1) {
    const evidence = await readReadyDeploymentEvidence(host);
    await waitForCardDeploymentVerification(prepared, {
      readEvidence: async () => evidence,
      attempts: 1,
      intervalMs: 0,
      requireReady: true,
    });
    reportCardStatusEnvelope({ host, status: evidence.readiness, transport });
  }
}

async function waitForCardAfterCandidateRollback(host, expected = {}) {
  const transport = getCardLinkState().transport; // F36: same guess-avoidance as readReadyDeploymentEvidence above
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const [project, status, wiringStatus] = await Promise.all([
        readCardProjectEvidence({ host, transport }),
        readCardStatusEnvelope({ host, transport }),
        getCardWiringStatus({ host }), // transport: n/a (cardWiringSafety.js is out of F36 scope — not one of the three named lib files, and getCardWiringStatus does not consult a transport option)
      ]);
      const cardId = project.cardId || status.cardId;
      const buildId = project.buildId || status.buildId;
      if (!cardId || project.cardId !== status.cardId || !buildId || project.buildId !== status.buildId) {
        throw new CardPushError('readback', 'The card is still reconnecting after the unfinished test was discarded.');
      }
      if (expected.cardId && cardId !== expected.cardId) {
        throw new CardPushError('wrong-card', 'A different card answered after the unfinished test was discarded.');
      }
      if (expected.buildId && buildId !== expected.buildId) {
        throw new CardPushError('target-mismatch', 'The card firmware changed while the unfinished test was being discarded.');
      }
      if (!wiringStatus.hasCandidate) return { project, status, wiringStatus };
      lastError = new CardPushError('candidate-conflict', 'The card is still clearing the unfinished light test.');
    } catch (error) {
      lastError = error;
      if (['wrong-card', 'target-mismatch'].includes(error?.reason)) throw error;
    }
  }
  throw lastError || new CardPushError('readback', 'The card did not reconnect after the unfinished light test was discarded.');
}

// Send-to-card control (Wire mode, Phase 2 step 9 / plan Phase 3). Extracted
// from PatchBoardScreen.pushToCard + its push* state. The `connected` prop
// drives the ambient status dot (grey when disconnected, green when the card
// link is live) but never disables the button — pushConfigToCard runs its own
// discovery/fallback, so a push is worth attempting even when the ambient link
// reads disconnected. `children` render next to the Send button (Wire mode
// slots the Export ledmap.json button in there).
export function CardPushControl({
  connected,
  board,
  compiledWiring,
  strips,
  projectId,
  projectName,
  standaloneController,
  disabled = false,
  autoStart = false,
  onInstalled,
  // True while a Setup ladder above this control already owns the page's
  // primary action. Applies to the Install button ONLY. The wiring-candidate
  // confirmations below ("Start light test", "The lights look correct") stay
  // primary whatever else is on the page: the card is holding its previous
  // working wiring and will put it back unless a human answers, so at that
  // moment they ARE the page's next step and nothing outranks them.
  yieldPrimary = false,
  children,
}) {
  const { projectLifecycle, readProjectLifecycle, markProjectInstalled, markCardLookConfirmed } = useProject();
  const [pushHost, setPushHost] = useState(() => getCardHostname());
  const [pushStatus, setPushStatus] = useState('');
  const [action, dispatchAction] = useReducer(cardActionReducer, { confirmedRevision: projectLifecycle.installedRevision }, createCardActionState);
  const [pushFallbackJson, setPushFallbackJson] = useState('');
  const [pushFallbackPackage, setPushFallbackPackage] = useState(null);
  const [wiringCandidate, setWiringCandidate] = useState(null);
  const [wiringTestState, setWiringTestState] = useState('idle');
  const [candidateConflict, setCandidateConflict] = useState(null);
  const [writeOwnerConflict, setWriteOwnerConflict] = useState(null);
  const [installAlreadyCurrent, setInstallAlreadyCurrent] = useState(false);
  // True while Studio is waiting out a card-initiated reboot after a push —
  // a pixel-count-only save applies and restarts the card at once (F14), and
  // the HTTP reply that would say so is exactly what a real card loses
  // mid-restart. A lost reply after a successful write is "verification
  // pending", never automatically "write failed" (the same rule F3 already
  // applies to card-restarted /api/control failures).
  const [installRestarting, setInstallRestarting] = useState(false);
  const failedAttemptRef = useRef(null);
  const assertCurrentAttempt = attempt => validateCardPushAttempt(attempt, readProjectLifecycle());

  // One write owner per card, ACROSS tabs. withStudioHardwareOperation below
  // serialises hardware work inside this page and cannot see another one, so
  // until this wrapper existed two Studio tabs could both take the direct-apply
  // branch and POST /api/config at the same card, each reporting a clean
  // install. The lease is taken before any write and released in `finally`, so
  // a refused tab is told exactly which operation it is waiting on and nothing
  // retries on its behalf — a silent retry is how one command reaches a card
  // twice. Cards are keyed by their paired identity, falling back to the host
  // when Studio has not named the card yet.
  const withCardWriteOwnership = async (operation, host, task) => {
    const cardId = readPersistedCardIdentity()?.id || host || getCardHostname();
    const claim = acquireCardWriteLease({ cardId, operation });
    if (!claim.ok) {
      setWriteOwnerConflict({ operation: claim.conflict.operation, message: claim.message });
      return undefined;
    }
    setWriteOwnerConflict(null);
    try {
      return await task();
    } finally {
      claim.release();
    }
  };

  // Serialize the current patch board into the firmware's runtime contract.
  // Direct push is only for local HTTP/file Studio sessions; hosted HTTPS
  // flows use the copy-paste fallback shown by the error state.
  const pushToCard = async (retryAttempt = null) => {
    const cleanHost = retryAttempt?.host || pushHost.trim().toLowerCase() || 'lightweaver.local';
    return withCardWriteOwnership('install-project', cleanHost, () => withStudioHardwareOperation('install-project', async () => {
    setCardHostname(cleanHost);
    setPushHost(getCardHostname());
    let attempt = retryAttempt;
    setWiringTestState('idle');
    setWiringCandidate(null);
    setCandidateConflict(null);
    setInstallAlreadyCurrent(false);
    setInstallRestarting(false);
    setPushFallbackJson(''); setPushFallbackPackage(null);
    try {
      if (!attempt) {
        const project = {
          projectId,
          projectName,
          projectRevision: projectLifecycle.editedRevision,
          strips,
          patchBoard: board,
          compiledWiring,
          standaloneController,
        };
        prepareCardStoragePayload(prepareCardDeployment(project).runtimePackage);
        let before;
        let status;
        let wiringStatus;
        let handoffOnly = false;
        try {
          [before, status, wiringStatus] = await Promise.all([
            readCardProjectEvidence({ host: cleanHost, transport: getCardLinkState().transport }),
            readCardStatusEnvelope({ host: cleanHost, transport: getCardLinkState().transport }),
            getCardWiringStatus({ host: cleanHost }), // transport: n/a (cardWiringSafety.js is out of F36 scope — not one of the three named lib files, and getCardWiringStatus does not consult a transport option; also literal-matched by cardPushControlResume.test.js's ordering check, do not change the string shape)
          ]);
          assertCardDeploymentPreflightIdentity(before, status);
        } catch (preflightError) {
          if (!LOCAL_BRIDGE_RECOVERY_REASONS.has(preflightError?.reason)) throw preflightError;
          const rememberedCard = readPersistedCardIdentity();
          if (!rememberedCard?.id) {
            throw new CardPushError('identity-missing', 'Pair this Lightweaver card before creating an installer handoff.');
          }
          // A hosted HTTPS Studio cannot independently read local HTTP state
          // without its card tab. Build a bounded handoff for the exact paired
          // card, but do not mark it installed until later read-back succeeds.
          before = { cardId: rememberedCard.id };
          status = {};
          wiringStatus = null;
          handoffOnly = true;
        }
        const prepared = prepareCardDeployment(project, {
          cardId: before.cardId,
          buildId: before.buildId,
          activationId: wiringStatus?.activationId,
          previousConfig: cardStatusAsConfig(status),
        });
        // A second install of exactly the project the card already holds and
        // already reports ready is permitted by the write lease above
        // (correctly — nothing here disagrees about who owns the card) but
        // has nothing left to send. Only decided here, never upstream of the
        // preflight reads: it needs the SAME independent card/status evidence
        // every other preflight decision uses, and it must never fire while a
        // wiring candidate is staged or testing — that is a real, separate
        // decision (resume-activation / resume-confirmation), not a
        // redundant write.
        //
        // `!currentInstallation(...)` scopes this to a caller who does not
        // already locally know it just installed this exact revision — the
        // "second tab, after the first finished" shape this exists for. A
        // caller whose OWN lifecycle already records this revision as
        // installed (the same component, clicking Install again on purpose —
        // tests/layout-send-to-card.spec.ts's "a failed push retains the
        // acknowledged installed revision and Retry installs successfully"
        // does exactly this to exercise its own retry path) is a deliberate
        // explicit resend and must still reach the card.
        const alreadyCurrent = !handoffOnly
          && !currentInstallation(readProjectLifecycle())
          && isCardAlreadyCurrent(prepared, status)
          && !wiringStatus?.hasCandidate;
        attempt = {
          host: cleanHost,
          revision: projectLifecycle.editedRevision,
          generation: projectLifecycle.generation,
          zoneCount: prepared.config.zones.length,
          pkg: prepared.runtimePackage,
          prepared,
          handoffOnly,
          alreadyCurrent,
        };
      }
      assertCurrentAttempt(attempt);
      dispatchAction({ type: 'start', revision: attempt.revision });
      if (attempt.handoffOnly) {
        throw new CardPushError('bridge-missing', 'Open the paired card installer to continue. Nothing was sent.');
      }
      if (attempt.alreadyCurrent) {
        dispatchAction({ type: 'confirm' });
        markProjectInstalled({
          revision: attempt.revision,
          generation: attempt.generation,
          cardId: attempt.prepared.cardId,
          projectRevision: attempt.prepared.config.projectRevision,
          projectFingerprint: attempt.prepared.config.projectFingerprint,
        });
        failedAttemptRef.current = null;
        setInstallAlreadyCurrent(true);
        setPushStatus(`This exact project is already on the card · ${attempt.zoneCount} zone${attempt.zoneCount === 1 ? '' : 's'} at ${cleanHost}. Nothing was sent.`);
        onInstalled?.();
        return;
      }
      let configPushAttempted = false;
      let deploymentStart;
      try {
        deploymentStart = await orchestrateCardDeploymentStart(
          attempt.prepared,
          {
            readFirmwareInfo: () => readCardProjectEvidence({ host: attempt.host, transport: getCardLinkState().transport }),
            readStatus: () => readCardStatusEnvelope({ host: attempt.host, transport: getCardLinkState().transport }),
            readWiringStatus: () => getCardWiringStatus({ host: attempt.host }), // transport: n/a (cardWiringSafety.js is out of F36 scope)
            config: async () => {
              assertCurrentAttempt(attempt);
              setPushStatus(`Sending revision ${attempt.revision} to ${cleanHost}...`);
              configPushAttempted = true;
              return pushConfigToCard(attempt.pkg, { host: attempt.host, transport: getCardLinkState().transport, allowLayoutChange: true });
            },
          },
        );
      } catch (configError) {
        // A pixel-count-only save applies and reboots the card at once
        // (F14) — the reply that would tell Studio that is exactly what a
        // real card loses mid-restart. Nothing was sent yet (a bad preflight
        // read, before the POST) is a genuine failure and falls straight to
        // the outer catch below, same as always — resending it is safe. A
        // transport failure AFTER the POST was sent may mean the write
        // already landed: treat it as verification pending, not write
        // failed, and fall into the exact same "wait, read back, decide"
        // path the success case takes below.
        if (!configPushAttempted || !isTransientCardFailure(configError)) throw configError;
        deploymentStart = { action: 'stage-new', status: null, response: { requiresReboot: true, rebooting: true } };
      }
      attempt = { ...attempt, wiringStatus: deploymentStart.status, resumeAction: deploymentStart.action };
      if (attempt.resumeAction === 'candidate-conflict') {
        setCandidateConflict({
          activationId: attempt.wiringStatus?.activationId,
          host: attempt.host,
          cardId: attempt.wiringStatus?.cardId,
          buildId: attempt.wiringStatus?.buildId,
        });
        throw new CardPushError(
          'candidate-conflict',
          'This card already has a different staged installation. Roll back that candidate or intentionally replace it, then retry. Nothing was sent.',
        );
      }
      if (attempt.resumeAction !== 'stage-new') {
        setWiringCandidate({
          activationId: attempt.wiringStatus.activationId,
          attempt,
          ...(attempt.resumeAction === 'resume-physical-test' || attempt.resumeAction === 'resume-confirmation'
            ? { expiresAt: Date.now() + (attempt.wiringStatus.remainingMs || 90000), expiryChecks: 0 }
            : {}),
        });
        if (attempt.resumeAction === 'resume-activation') {
          setWiringTestState('staged');
          setPushStatus('This exact wiring installation is already staged. Continue with its light test; nothing was sent again.');
        } else if (attempt.resumeAction === 'resume-physical-test' || attempt.resumeAction === 'resume-confirmation') {
          setWiringTestState('testing');
          setPushStatus('This exact wiring installation is already in its physical test. Confirm it only after checking the real LEDs.');
        }
        failedAttemptRef.current = null;
        return;
      }
      const response = deploymentStart.response;
      if (response?.state === 'staged' && response.activationId) {
        setWiringCandidate({ activationId: response.activationId, attempt });
        setWiringTestState('staged');
        failedAttemptRef.current = null;
        setPushStatus('New wiring is ready to test. Your current working setup is still safe.');
        return;
      }
      // A response that names the reboot explicitly (a reply that survived)
      // or the synthesized fallback above (a reply that did not) both mean
      // the same thing: the card is restarting on its own, unattended, and
      // Studio's job now is to wait it out and read back — never to treat
      // silence as a refusal.
      const cardIsRestarting = response?.requiresReboot === true || response?.rebooting === true;
      setPushStatus(cardIsRestarting ? 'Card restarted — verifying…' : 'Verifying the exact project on the card…');
      if (cardIsRestarting) setInstallRestarting(true);
      try {
        const { verification } = await waitForReadyDeploymentVerification(attempt.prepared, attempt.host);
        await publishVerifiedReadiness(attempt.prepared, attempt.host);
        assertCurrentAttempt(attempt);
        dispatchAction({ type: 'confirm' });
        markProjectInstalled({
          revision: attempt.revision,
          generation: attempt.generation,
          cardId: verification.cardId,
          projectRevision: attempt.prepared.config.projectRevision,
          projectFingerprint: attempt.prepared.config.projectFingerprint,
        });
        markCardLookConfirmed({ ...(standaloneController?.defaultLook || {}), syncZones: true });
        failedAttemptRef.current = null;
        setInstallRestarting(false);
        setPushStatus(`Installed revision ${attempt.revision} on card · ${attempt.zoneCount} zone${attempt.zoneCount === 1 ? '' : 's'} at ${cleanHost}`);
        onInstalled?.();
      } catch (verifyError) {
        if (!cardIsRestarting) throw verifyError;
        // The card restarted, but Studio still cannot prove it holds this
        // exact project — it may still be booting, or the write genuinely
        // never landed. Either way this is NOT the generic "Push failed"
        // path below: Retry here must read the card again before it is
        // ever allowed to resend (see retryAfterCardRestart) — a blind
        // resend would write a config the card may already hold.
        setInstallRestarting(false);
        failedAttemptRef.current = { ...attempt, awaitingRestartConfirmation: true };
        dispatchAction({ type: 'fail', error: 'The card restarted but does not hold this project yet.' });
        setPushStatus('The card restarted but does not hold this project yet.');
      }
    } catch (err) {
      setInstallRestarting(false);
      failedAttemptRef.current = attempt;
      const message = err instanceof CardPushError ? err.message : `Push failed: ${err.message || err}`;
      dispatchAction({ type: 'fail', error: message });
      if (attempt?.pkg && LOCAL_BRIDGE_RECOVERY_REASONS.has(err?.reason)) {
        setPushStatus('Browser blocked the request. Use the JSON below: connect to the card and paste at its onboard page.');
        setPushFallbackJson(JSON.stringify(attempt.pkg.config, null, 2));
        setPushFallbackPackage(attempt.pkg);
      } else if (err instanceof CardPushError) {
        setPushStatus(err.message);
      } else {
        setPushStatus(`Push failed: ${err.message || err}`);
      }
    }
    }));
  };

  // Retry after a restart-recovery failure (see the `awaitingRestartConfirmation`
  // attempt above). Reads the card once before ever resending: if it now
  // proves the card holds this exact project (it may simply have finished
  // booting between the failure and this click), that read IS the
  // installation and nothing is sent again; only a genuine, freshly-confirmed
  // mismatch falls through to the ordinary retry, which resends for real.
  const retryAfterCardRestart = async () => {
    const pending = failedAttemptRef.current;
    if (!pending?.awaitingRestartConfirmation) return pushToCard(pending);
    setPushStatus('Reading the card again before retrying…');
    try {
      const verification = await waitForCardDeploymentVerification(pending.prepared, {
        readEvidence: () => readReadyDeploymentEvidence(pending.host),
        attempts: 1,
        intervalMs: 0,
        requireReady: true,
      });
      await publishVerifiedReadiness(pending.prepared, pending.host);
      assertCurrentAttempt(pending);
      dispatchAction({ type: 'confirm' });
      markProjectInstalled({
        revision: pending.revision,
        generation: pending.generation,
        cardId: verification.cardId,
        projectRevision: pending.prepared.config.projectRevision,
        projectFingerprint: pending.prepared.config.projectFingerprint,
      });
      markCardLookConfirmed({ ...(standaloneController?.defaultLook || {}), syncZones: true });
      failedAttemptRef.current = null;
      setPushStatus(`Installed revision ${pending.revision} on card · ${pending.zoneCount} zone${pending.zoneCount === 1 ? '' : 's'} at ${pending.host}`);
      onInstalled?.();
    } catch {
      // Confirmed: the card genuinely does not hold this project yet. This
      // is no longer a blind retry — the read above just proved it — so
      // resend for real.
      await pushToCard(pending);
    }
  };

  const startWiringTest = async () => {
    if (!wiringCandidate) return undefined;
    return withCardWriteOwnership('activate-wiring', wiringCandidate.attempt.host, () => withStudioHardwareOperation('activate-wiring', async () => {
    setWiringTestState('starting');
    setPushStatus('Restarting the card with the test wiring…');
    try {
      assertCurrentAttempt(wiringCandidate.attempt);
      const testingStatus = await activateAndWaitForCardWiring(wiringCandidate.activationId, {
        host: wiringCandidate.attempt.host,
        timeoutMs: 18000,
      });
      setWiringCandidate(current => current ? {
        ...current,
        expiresAt: Date.now() + (testingStatus.remainingMs || 90000),
        expiryChecks: 0,
      } : current);
      setWiringTestState('testing');
      setPushStatus('Testing the new wiring. The card will restore the working setup automatically if you do not confirm it.');
    } catch (error) {
      setWiringTestState('failed');
      setPushStatus(error.message || 'The test wiring did not start. The working setup remains safe.');
    }
    }));
  };

  const autoActivatedRef = useRef('');
  useEffect(() => {
    const activationId = wiringCandidate?.activationId || '';
    if (!autoStart || wiringTestState !== 'staged' || !activationId || autoActivatedRef.current === activationId) return;
    autoActivatedRef.current = activationId;
    void startWiringTest();
  }, [autoStart, wiringCandidate, wiringTestState]);

  const finishWiringTest = async visible => {
    if (!wiringCandidate) return;
    let confirmedAttempt = null;
    await withCardWriteOwnership('finish-wiring', wiringCandidate.attempt.host, () => withStudioHardwareOperation('finish-wiring', async () => {
    if (!wiringCandidate) return;
    setWiringTestState(visible ? 'confirming' : 'rolling-back');
    try {
      if (visible) {
        assertCurrentAttempt(wiringCandidate.attempt);
        await confirmCardWiringCandidate(wiringCandidate.activationId, { host: wiringCandidate.attempt.host });
        setPushStatus('Verifying the confirmed wiring on the card…');
        const { verification } = await waitForReadyDeploymentVerification(
          wiringCandidate.attempt.prepared,
          wiringCandidate.attempt.host,
        );
        assertCurrentAttempt(wiringCandidate.attempt);
        dispatchAction({ type: 'confirm' });
        markProjectInstalled({
          revision: wiringCandidate.attempt.revision,
          generation: wiringCandidate.attempt.generation,
          cardId: verification.cardId,
          projectRevision: wiringCandidate.attempt.prepared.config.projectRevision,
          projectFingerprint: wiringCandidate.attempt.prepared.config.projectFingerprint,
        });
        markCardLookConfirmed({ ...(standaloneController?.defaultLook || {}), syncZones: true });
        setPushStatus(`Wiring confirmed. Revision ${wiringCandidate.attempt.revision} is now the card’s working setup.`);
        setWiringTestState('confirmed');
        confirmedAttempt = wiringCandidate.attempt;
      } else {
        assertCurrentAttempt(wiringCandidate.attempt);
        await rollbackCardWiringCandidate(wiringCandidate.activationId, { host: wiringCandidate.attempt.host });
        failedAttemptRef.current = wiringCandidate.attempt;
        dispatchAction({ type: 'fail', error: 'Wiring test rolled back.' });
        setPushStatus('Restored the last working setup. Use Find my LED wire before trying again.');
        setWiringTestState('rolled-back');
      }
      setWiringCandidate(null);
    } catch (error) {
      setWiringTestState('failed');
      setPushStatus(error.message || 'The card could not finish the wiring test. It will roll back automatically when the timer ends.');
    }
    }));
    if (!confirmedAttempt) return;
    try {
      await publishVerifiedReadiness(confirmedAttempt.prepared, confirmedAttempt.host);
      onInstalled?.();
    } catch (error) {
      dispatchAction({ type: 'fail', error: 'The confirmed card status did not reach Studio.' });
      setPushStatus(error.message || 'The wiring is confirmed, but Studio could not refresh the card. Read this card again before opening Patterns.');
    }
  };

  const pushing = action.status === 'pending' && wiringTestState === 'idle';
  const wiringTransactionActive = Boolean(wiringCandidate);
  useEffect(() => {
    if (wiringTestState !== 'testing' || !wiringCandidate?.expiresAt) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const status = await getCardWiringStatus({ host: wiringCandidate.attempt.host });
        if (cancelled) return;
        const expectedCardId = wiringCandidate.attempt.prepared?.cardId;
        const expectedBuildId = wiringCandidate.attempt.prepared?.buildId;
        const exactCard = (!expectedCardId || status.cardId === expectedCardId)
          && (!expectedBuildId || status.buildId === expectedBuildId);
        if (!exactCard) {
          failedAttemptRef.current = wiringCandidate.attempt;
          setWiringCandidate(null);
          setWiringTestState('failed');
          dispatchAction({ type: 'fail', error: 'The card identity changed while the light test was open.' });
          setPushStatus('A different card or firmware build answered. Read this card again before retrying.');
          return;
        }
        if (status.hasCandidate && status.activationId === wiringCandidate.activationId && status.state === 'testing') {
          setWiringCandidate(current => current ? {
            ...current,
            expiresAt: Date.now() + Math.max(status.remainingMs || 1000, 1000),
            expiryChecks: 0,
          } : current);
          return;
        }
        failedAttemptRef.current = wiringCandidate.attempt;
        setWiringCandidate(null);
        if (!status.hasCandidate && ['known-good', 'rolled-back'].includes(status.state)) {
          setWiringTestState('rolled-back');
          dispatchAction({ type: 'fail', error: 'The card restored its working setup before the light test was confirmed.' });
          setPushStatus('The light test expired, so the card restored its working setup. Start the install again when you can check the lights.');
        } else {
          setWiringTestState('failed');
          dispatchAction({ type: 'fail', error: 'The card returned a different light-test state.' });
          setPushStatus('Studio could not confirm how the light test ended. Read this card again before retrying.');
        }
      } catch (error) {
        if (cancelled) return;
        const checks = Number(wiringCandidate.expiryChecks || 0) + 1;
        if (checks < 4) {
          setWiringCandidate(current => current ? { ...current, expiresAt: Date.now() + 750, expiryChecks: checks } : current);
        } else {
          failedAttemptRef.current = wiringCandidate.attempt;
          setWiringCandidate(null);
          setWiringTestState('failed');
          dispatchAction({ type: 'fail', error: 'The card did not answer after the light test ended.' });
          setPushStatus('The card did not answer after the light test ended. Read this card again before retrying.');
        }
      }
    }, Math.max(0, wiringCandidate.expiresAt - Date.now()) + 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [wiringCandidate, wiringTestState]);
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || disabled || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void pushToCard();
  }, [autoStart, disabled]);
  const discardOldCandidateAndRetry = async () => {
    if (!candidateConflict?.activationId) return;
    let cleared = false;
    await withStudioHardwareOperation('finish-wiring', async () => {
      setPushStatus('Discarding the unfinished light test…');
      try {
        await rollbackCardWiringCandidate(candidateConflict.activationId, { host: candidateConflict.host });
        setPushStatus('Reconnecting to this card…');
        await waitForCardAfterCandidateRollback(candidateConflict.host, candidateConflict);
        setCandidateConflict(null);
        failedAttemptRef.current = null;
        cleared = true;
      } catch (error) {
        setPushStatus(error.message || 'The unfinished light test could not be discarded. The working setup is still safe.');
      }
    });
    if (cleared) await pushToCard();
  };
  const openInstaller = () => {
    const host = failedAttemptRef.current?.host || getCardHostname();
    const url = new URL(buildCardConfigHandoffUrl(host, pushFallbackPackage));
    openLocalCardPage(host, {
      path: `${url.pathname}${url.search}${url.hash}`,
      reason: 'card-installer',
    });
  };

  return (
    <div className="la-card-push">
      {writeOwnerConflict && (
        <div className="la-card-push-banner is-err" role="alert" data-testid="card-write-owner-conflict">
          {writeOwnerConflict.message}
        </div>
      )}
      {!wiringTransactionActive && <div className="la-card-push-row">
        <button
          className={yieldPrimary ? 'btn la-card-push-btn' : 'btn primary la-card-push-btn'}
          data-testid="layout-send-to-card"
          disabled={disabled || pushing || wiringTransactionActive}
          onClick={() => pushToCard()}
          data-tooltip="Send this verified project to the card, replacing its active project after card verification."
        >
          <span className={`la-card-push-dot${connected ? ' on' : ' off'}`}/>
          <span className="la-card-push-label">{pushing ? `Sending to ${pushHost}…` : 'Install on card'}<small>{connected ? 'Ready to install' : 'Connect the card first'}</small></span>
        </button>
        {children}
      </div>}

      {pushStatus && (
        <div
          className={`la-card-push-banner ${action.status === 'confirmed' ? 'is-ok' : action.status === 'failed' ? 'is-err' : 'is-pending'}`}
          {...(installAlreadyCurrent
            ? { 'data-testid': 'card-install-already-current' }
            : installRestarting ? { 'data-testid': 'card-install-restarting' } : {})}
        >
          {pushStatus}
          {action.status === 'failed' && action.confirmedRevision != null && <p>Confirmed revision {action.confirmedRevision} remains on the card.</p>}
          {pushFallbackJson && (
            <div className="lw-wire-recovery" role="group" aria-label="Mixed-content recovery">
              <textarea readOnly value={pushFallbackJson} onClick={e => e.target.select()} className="la-card-push-fallback"/>
              <button className="btn" title="Copy the installer JSON so it can be pasted into the card's onboard page." data-tooltip="Copy the installer JSON so it can be pasted into the card's onboard page." onClick={() => navigator.clipboard?.writeText(pushFallbackJson)}>Copy payload</button>
              <button className="btn" title="Open the paired card's local installer with this project ready to apply." data-tooltip="Open the paired card's local installer with this project ready to apply." onClick={openInstaller}>Open installer</button>
            </div>
          )}
          {candidateConflict?.activationId ? (
            <button className="btn" data-testid="discard-candidate-and-retry" title="Discard the unfinished card light test, keep the working setup, and retry this install." data-tooltip="Discard the unfinished card light test, keep the working setup, and retry this install." onClick={() => void discardOldCandidateAndRetry()}>Discard old test and retry</button>
          ) : action.status === 'failed' && (
            <button className="btn" title="Try the failed card installation again using the same prepared project." data-tooltip="Try the failed card installation again using the same prepared project." onClick={() => void retryAfterCardRestart()}>Retry</button>
          )}
        </div>
      )}
      {wiringCandidate && (
        <section className="lw-wiring-candidate" aria-label="Wiring safety check">
          {/* This is the SECOND time the owner is asked to look at the lights,
              and it is not Studio repeating itself: the card is holding its
              previous working wiring and will put it back on its own unless a
              human confirms. Saying which ask this is stops it reading as the
              same question twice. */}
          <strong>{wiringTestState === 'testing' ? 'Last look — do the lights still look right?' : 'One last check on the card itself'}</strong>
          <p>{wiringTestState === 'testing'
            ? 'The card is running your new wiring now. Confirming makes it permanent; if you say nothing, the card puts its old setup back by itself.'
            : 'The card keeps its last working setup until you confirm this one on the real lights. Nothing is permanent yet.'}</p>
          {wiringTestState === 'staged' || wiringTestState === 'failed' ? (
            <div><button className="btn primary" title="Restart the card using the staged wiring so you can check the real LEDs before committing it." data-tooltip="Restart the card using the staged wiring so you can check the real LEDs before committing it." data-testid="wiring-test-start" onClick={startWiringTest}>Start light test</button><button className="btn" title="Discard the staged wiring change and keep the card's last working setup." data-tooltip="Discard the staged wiring change and keep the card's last working setup." data-testid="wiring-test-cancel" onClick={() => finishWiringTest(false)}>Cancel change</button></div>
          ) : wiringTestState === 'testing' ? (
            <div><button className="btn primary" title="Confirm the real light test passed and make this wiring the card's working setup." data-tooltip="Confirm the real light test passed and make this wiring the card's working setup." data-testid="wiring-test-confirm" onClick={() => finishWiringTest(true)}>The lights look correct</button><button className="btn" title="Reject the tested wiring and restore the card's last working setup." data-tooltip="Reject the tested wiring and restore the card's last working setup." data-testid="wiring-test-restore" onClick={() => finishWiringTest(false)}>No, restore working setup</button></div>
          ) : <p>Working…</p>}
        </section>
      )}
    </div>
  );
}
