import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AutomaticInstallScreen, TechnicianFlashScreen } from './lw-flash.jsx';
import { InstallerScreen } from './lw-installer.jsx';
import { CardInstallAction } from '../components/card/CardInstallAction.jsx';
import { DeploymentCheckPanel } from '../components/card/DeploymentCheckPanel.jsx';
import { ProductionScreen } from './lw-production.jsx';
import { SettingsScreen } from './lw-settings.jsx';
import { SetupScreen } from './lw-setup.jsx';
import { consumeCardSectionNavigation, DEFAULT_CARD_SECTION } from './cardWorkspaceRoute.js';
import { cardLinkReasonText, getCardLinkState, isCardLinkConnected } from '../lib/cardLink.js';
import { loadProductionJobFromIndexEntry, loadProductionJobIndex } from '../lib/productionJobPackage.js';
import { readCardProjectEvidence, readCardStatusEnvelope } from '../lib/cardPushClient.js';
import { recoverCardLightsVerified, requireExactReadyCardStatus } from '../lib/cardRecoverLights.js';
import { clearCardProject } from '../lib/cardClearProject.js';
import { guardedResolutionRun, resolvedMatchKey } from '../lib/cardProjectAdoption.js';
import { describeResolvedCardProject } from '../lib/cardProjectResolver.js';
import { normalizeCardHost } from '../lib/cardConnection.js';
import { isBenchProjectEvidence, BENCH_PROJECT_ID } from '../lib/benchConfig.js';
import { STRIP_DISCOVERY_LABEL } from '../lib/cardAction.js';
import { deriveCardLifecycle } from '../lib/cardLifecycle.js';

// navigateStudio (the `go` prop) takes a bare screen key, not the `screen=…`
// hash fragment that STRIP_DISCOVERY_ROUTE holds — passing the fragment fell
// through normalizeView() and silently landed on Layout.
const STRIP_DISCOVERY_VIEW = 'discovery';
import {
  clearAbandonedCardEditIntent,
  isCardEditIntentAbandoned,
  readCardEditIntent,
} from '../lib/cardEditIntent.js';
import {
  clearCardEditAuthorization,
  issueCardEditAuthorization,
  issueSignedProductionCardEditAuthorization,
} from '../lib/cardEditAuthorization.js';

// Card is one page. Home always shows the setup journey, the install action,
// evidence panels, then Hardware and Advanced as folds. `settings` and
// `support` stay in the URL vocabulary and open the matching fold.
// `install` and `workshop` remain full-body takeovers. Preferences is not a
// Card page — the top bar owns it; if that hash arrives we still render the
// existing preferences takeover rather than growing a tab.
const HOME_SECTIONS = Object.freeze(['setup', 'overview', 'settings', 'support']);
const SECTION_HEADINGS = Object.freeze({
  setup: 'Set up your Lightweaver',
  overview: 'Set up your Lightweaver',
  settings: 'Set up your Lightweaver',
  support: 'Set up your Lightweaver',
  install: 'Install or update',
  preferences: 'Preferences',
  workshop: 'Batch production',
});

function CardPageFold({ testId, summary, open, onOpen, onClose, children }) {
  return (
    <details className="card-page-fold" data-testid={testId} open={open}>
      <summary
        onClick={event => {
          event.preventDefault();
          if (open) onClose();
          else onOpen();
        }}
      >
        {summary}
      </summary>
      <div className="card-page-fold-body">{children}</div>
    </details>
  );
}

function cardEditIntent() {
  return readCardEditIntent(window.location.search);
}

// Card Home's evidence panels — formerly the whole "Card status" overview.
// The status verdict and the next-action verdict now live in the Setup
// journey rendered above these panels (SetupScreen: identity row + 4-phase
// ladder), so what remains here is the connected-state evidence the overview
// always carried: the lifecycle-keyed presentation of a card that is actually
// answering, the matching-card-project offer with its guarded adoption
// machine, checks & recovery, and the batch-production link.
function CardHomePanels({
  connected,
  cardHost,
  cardLink,
  cardLifecycle,
  onConnectCard,
  onOpenConnectionCenter,
  onOpenSection,
  go,
  replaceProject,
  currentProject,
  projectGeneration,
  activeCloudProjects = [],
  browserProjects = [],
  readBrowserProjects,
  readCloudProject,
  openMatchingCardProject,
  saveBeforeCardProjectSwitch,
  isProjectSwitchSnapshotCurrent,
  onMatchedProjectLoaded,
  onMatchedProjectVerified,
  onStartNewProject,
  suppressMatchingProject = false,
  yieldPrimary = false,
}) {
  const [matchingProjectState, setMatchingProjectState] = useState({ status: 'idle', message: '' });
  const [hardwareActionState, setHardwareActionState] = useState({ status: 'idle', message: '' });
  const resolutionContextRef = useRef(null);
  const projectSwitchInFlightRef = useRef(false);
  const cardProjectProbeRef = useRef('');
  const pendingCardProjectProbeRef = useRef(null);
  const [cardProjectProbeRevision, requestCardProjectProbe] = React.useReducer(value => value + 1, 0);
  resolutionContextRef.current = {
    browserProjects,
    cardLink,
    currentProject,
    projectGeneration,
    ready: cardLink ? isCardLinkConnected(cardLink) : connected,
  };

  const identity = cardLink?.identity?.name
    || cardLink?.identity?.id
    || cardLink?.card?.name
    || cardLink?.card?.id
    || cardLink?.cardName
    || cardLink?.cardId
    || cardLink?.host
    || cardHost;
  const ready = cardLink ? isCardLinkConnected(cardLink) : connected;
  const state = cardLink?.state || (ready ? 'connected-direct' : 'disconnected');
  const activity = cardLink?.activity || 'idle';
  const verifiedTransport = Boolean(cardLink?.card?.id && (
    state === 'connected-direct' || state === 'connected-bridge'
  ));
  const blankCard = verifiedTransport && cardLink?.cardBlank === true;
  // Prefer the card's own claim: new firmware reports provisionalSetup on
  // /api/status when the stored config carries "provisional": true
  // (cardLink.readiness is the raw status envelope). Older firmware never
  // sends the field, so the projectId string match stays as the fallback that
  // recognizes bench configs written before the flag existed (finding #5).
  // One authority for "is this the temporary Find-my-strips setup?", reading the
  // card's own answer in BOTH directions. The `||` here meant a card that had
  // explicitly said provisionalSetup:false still matched on the bench project
  // id — which a properly installed discovery-derived project keeps — so the
  // detected state told the owner their finished card was running a temporary
  // setup, directly under a banner saying it was already set up.
  const benchProject = isBenchProjectEvidence(cardLink?.readiness || {});
  // The card is already holding the project that is open in Studio, so there is
  // nothing to "load".
  const cardHoldsOpenProject = Boolean(
    String(cardLink?.readiness?.projectId || '').trim()
    && String(cardLink.readiness.projectId).trim() === String(currentProject?.id || '').trim(),
  );
  const matchingProjectOffer = matchingProjectState.status !== 'idle'
    || Boolean(cardLink?.readiness?.productionJobId)
    || Boolean(cardLink?.readiness?.productionJobDigest);

  // Detected-state presentation, keyed off the ONE diagnosis authority
  // (deriveCardLifecycle) instead of a private raw-link ladder. Each row
  // reproduces the copy the old ladder showed for the links that produce that
  // lifecycle state; the only extra inputs are the bench/blank/identity
  // evidence this component already probes. The shell passes its lifecycle
  // (computed with the open project and firmware-update evidence); a bare
  // render derives the same diagnosis from the link alone — the rows below
  // treat `ready` and `project-mismatch` identically, so the missing project
  // input cannot change what renders.
  const lifecycle = cardLifecycle || deriveCardLifecycle({ link: cardLink || {} });
  // Legacy shape: a caller with no cardLink object at all only says
  // `connected` — honor it as the ready presentation, as the old ladder did.
  const lifecycleState = !cardLink && connected ? 'ready' : lifecycle.state;
  const lifecycleReason = cardLink ? lifecycle.reason : '';

  const openSupport = { label: 'Open support', section: 'support' };
  const presentations = {
    operationFailed: () => ({
      tone: 'failure',
      message: 'The last card operation failed. Reconnect and inspect the card before retrying it.',
      primary: { label: 'Reconnect card', action: 'connect' },
      secondary: openSupport,
    }),
    cardRestarted: () => ({
      tone: 'connecting',
      message: 'Card restarted — verifying the exact card, firmware, and project before commands resume.',
      primary: { label: 'Card restarted — verifying', disabled: true },
      secondary: openSupport,
    }),
    checkingStability: () => ({
      tone: 'connecting',
      message: 'Checking card. Studio is waiting for two stable exact status checks before commands resume.',
      primary: { label: 'Checking card', disabled: true },
      secondary: openSupport,
    }),
    stoppedResponding: () => ({
      tone: 'connecting',
      message: 'Card stopped responding. Studio is reconnecting and will require fresh status before commands resume.',
      primary: { label: 'Card stopped responding', disabled: true },
      secondary: openSupport,
    }),
    recoveringOperation: () => ({
      tone: 'connecting',
      message: 'Studio is recovering the last card operation. Keep this page open until the result is confirmed.',
      primary: { label: 'Recovery in progress…', disabled: true },
      secondary: openSupport,
    }),
    pendingOperation: () => ({
      tone: 'connecting',
      message: 'A card operation is in progress. Keep this page open until Studio confirms the result.',
      primary: { label: 'Card operation in progress…', disabled: true },
      secondary: openSupport,
    }),
    connecting: () => ({
      tone: 'connecting',
      message: 'Studio is looking for the card. Keep the card page open while its identity is verified.',
      primary: { label: 'Connecting…', disabled: true },
      secondary: openSupport,
    }),
    blank: () => ({
      tone: 'failure',
      message: 'Blank — load a project, or find this card’s strips first.',
      primary: { label: STRIP_DISCOVERY_LABEL, action: 'discovery' },
      tertiary: { label: 'Start a new project', action: 'new-project' },
    }),
    bench: () => ({
      tone: 'connecting',
      message: `${identity || 'A Lightweaver card'} is connected, but it is running the temporary Find-my-strips setup — not one of your projects. Install your project to replace it, run Find my strips again, or use Clear temporary setup under Checks & recovery below.`,
      primary: { label: STRIP_DISCOVERY_LABEL, action: 'discovery' },
    }),
    // `redundant` means: the Setup identity row and the phase ladder directly
    // above already carry this verdict AND its action, so printing it again
    // here is the third telling of one fact. The presentation is still built
    // (other code reads its tone and actions); Home just does not render the
    // Detected-state block for it.
    readyForLightCheck: () => ({
      tone: 'connected',
      redundant: true,
      message: `${identity || 'A Lightweaver card'} is connected and ready for light check.`,
    }),
    checkingEvidence: () => ({
      tone: 'connecting',
      message: 'Checking card. Studio is waiting for complete identity, project, and command readiness evidence.',
      primary: { label: 'Checking card', disabled: true },
      secondary: openSupport,
    }),
    // Distinct from checkingEvidence on purpose. The card HAS answered, with
    // complete evidence, and that evidence says it is not ready — so telling
    // the owner Studio is "waiting for complete evidence" is untrue, and it
    // reads as a screen that will resolve itself if they wait. It will not.
    // Checks & recovery is rendered for this card now, so there is something
    // real to point at.
    answeringNotReady: () => ({
      tone: 'attention',
      message: `${identity || 'This card'} is answering, but it is not reporting a ready runtime. Run Recover lights below, then check what the strip does.`,
      primary: { label: 'Recover lights', section: 'overview' },
      secondary: openSupport,
    }),
    foundUnpaired: () => {
      const foundProjectId = cardLink?.discoveredCard?.projectId || '';
      // Same one authority: the card's own provisional answer wins over the
      // bench project id, which a properly installed project keeps forever.
      const foundIsProvisional = isBenchProjectEvidence({
        projectId: foundProjectId,
        ...(typeof cardLink?.readiness?.provisionalSetup === 'boolean'
          ? { provisionalSetup: cardLink.readiness.provisionalSetup } : {}),
      });
      return {
        tone: 'disconnected',
        message: foundIsProvisional
          ? 'Lightweaver found — it is holding an unfinished Find my strips setup, not one of your projects. Tap Connect to pair, then finish setup or install your project.'
          : foundProjectId
            ? 'Lightweaver found, holding a project — tap Connect to pair.'
            : 'Lightweaver found — tap Connect to pair.',
        primary: { label: 'Connect card', action: 'connect' },
        secondary: openSupport,
      };
    },
    updateNeeded: failureReason => ({
      tone: 'failure',
      message: `${cardLinkReasonText(failureReason)} Update it before loading changes.`,
      primary: { label: 'Update card', section: 'install' },
      secondary: openSupport,
    }),
    reasonFailure: failureReason => ({
      tone: 'failure',
      message: `${cardLinkReasonText(failureReason)} Reconnect and inspect the card before loading changes.`,
      primary: { label: failureReason === 'wrong-card' ? 'Connect expected card' : 'Reconnect card', action: 'connect' },
      secondary: openSupport,
    }),
    notConnected: () => ({
      tone: 'disconnected',
      message: 'A Lightweaver card is not connected. Connect one to inspect it before installing or loading a project.',
      primary: { label: 'Connect card', action: 'connect' },
      secondary: { label: 'Install Lightweaver', section: 'install' },
    }),
  };

  let presentation;
  switch (lifecycleState) {
    case 'verifying':
      presentation = lifecycleReason === 'card-restarted'
        ? presentations.cardRestarted()
        : presentations.checkingStability();
      break;
    case 'reconnecting':
      presentation = presentations.stoppedResponding();
      break;
    case 'recovering':
      presentation = presentations.recoveringOperation();
      break;
    case 'connecting':
      presentation = activity === 'pending'
        ? presentations.pendingOperation()
        : presentations.connecting();
      break;
    case 'updating':
    case 'update-recovering':
      // A firmware update in flight is an operation in progress on this
      // surface (the old ladder read the link's pending activity here).
      presentation = presentations.pendingOperation();
      break;
    case 'update-rolled-back':
    case 'target-mismatch':
    case 'project-changed':
      // A blocked or rolled-back update is a failed operation to recover
      // from; the guided detail lives in Setup and the install section.
      presentation = presentations.operationFailed();
      break;
    case 'setup-required':
      presentation = presentations.blank();
      break;
    case 'confirming':
      presentation = presentations.checkingEvidence();
      break;
    case 'ready':
      presentation = benchProject ? presentations.bench() : presentations.readyForLightCheck();
      break;
    case 'project-mismatch':
      // Also a command-ready card, but saying "ready for light check" here put
      // a fourth, different account on a screen whose other three lines all
      // said the project still has to be saved. Same fact, same words.
      presentation = benchProject ? presentations.bench() : {
        tone: 'connecting',
        // Identity row says Connection / Installed; the ladder's active task
        // says save it to the card. Same fact, same words, third place.
        redundant: true,
        message: `${identity || 'This Lightweaver'} is connected. The project open in Studio has changed since it was installed — save it to the card to bring them back into step.`,
        secondary: openSupport,
      };
      break;
    case 'discovery-setup':
      // The temporary Find-my-strips setup, now named by the lifecycle instead
      // of arriving here inside the attention bucket. Same presentation it
      // always had; it just no longer has to be a "failure" to reach it.
      presentation = presentations.bench();
      break;
    case 'found-unpaired':
      presentation = presentations.foundUnpaired();
      break;
    case 'wrong-card':
      presentation = presentations.reasonFailure('wrong-card');
      break;
    case 'update-required':
      presentation = presentations.updateNeeded(lifecycleReason || 'firmware-too-old');
      break;
    case 'attention-required':
      if (activity === 'failed') presentation = presentations.operationFailed();
      else if (ready) presentation = benchProject ? presentations.bench() : presentations.readyForLightCheck();
      else if (verifiedTransport) presentation = presentations.answeringNotReady();
      else if (lifecycleReason && lifecycleReason !== 'never-connected') presentation = presentations.reasonFailure(lifecycleReason);
      else presentation = presentations.notConnected();
      break;
    case 'disconnected':
    default:
      presentation = lifecycleReason && lifecycleReason !== 'never-connected'
        ? presentations.reasonFailure(lifecycleReason)
        : presentations.notConnected();
      break;
  }

  // Connect actions must be visible: prefer the connection center when the
  // shell provides it, and fall back to the background probe otherwise.
  const openConnection = () => (onOpenConnectionCenter ? onOpenConnectionCenter() : onConnectCard?.());
  const requireExactReadyStatus = (status) => requireExactReadyCardStatus(status, cardLink?.card?.id);
  const verifyHardware = async () => {
    if (hardwareActionState.status === 'loading') return;
    setHardwareActionState({ status: 'loading', message: 'Reading exact card hardware state…' });
    try {
      const status = requireExactReadyStatus(await readCardStatusEnvelope({ host: cardLink?.host || cardHost }));
      const pixels = Number(status.led?.pixels) || Number(cardLink?.card?.pixelCount) || 0;
      setHardwareActionState({
        status: 'ok',
        message: `Hardware readback verified for ${status.cardId}${pixels ? ` · ${pixels} LEDs` : ''}. This confirms card state, not visible light output.`,
      });
    } catch (error) {
      setHardwareActionState({ status: 'error', message: error?.message || 'Hardware readback failed. Reconnect the card and try again.' });
    }
  };
  const recoverLights = async () => {
    if (hardwareActionState.status === 'loading') return;
    setHardwareActionState({ status: 'loading', message: 'Sending safe warm-white recovery…' });
    try {
      const response = await recoverCardLightsVerified(
        { patternId: 'warm-white', brightness: 0.35, syncZones: true },
        {
          host: cardLink?.host || cardHost,
          timeoutMs: 3200,
          verifyReadback: { expectedCardId: cardLink?.card?.id },
        },
      );
      setHardwareActionState({
        status: 'ok',
        // On a bench card the honest headline is what did NOT change: leading
        // with "acknowledged" read as success while the thing the owner wanted
        // fixed stayed broken (ui-repair B4).
        message: benchProject
          ? 'The lights were recovered to warm white, but that is all this did: the card is still running the temporary Find-my-strips setup and will return to it after a restart. Use Clear temporary setup below to actually remove it, or install your project to replace it.'
          : `Recovery command ${response?.restarted ? 'survived restart and was' : 'was'} acknowledged with ready-state readback. Check the real LEDs; visible warm white is not confirmed automatically.`,
      });
    } catch (error) {
      setHardwareActionState({ status: 'error', message: error?.message || 'Recovery was not verified. Keep the card powered, reconnect, and retry.' });
    }
  };
  // The non-destructive way off a stranded Find-my-strips bench project:
  // clears only the temporary setup (the card keeps its WiFi and name), then
  // the card reboots blank and the ordinary blank-card flow takes over. No
  // browser confirm dialog: the temporary setup contains nothing the owner
  // made, and the firmware itself demands the CLEAR token before acting.
  const clearTemporarySetup = async () => {
    if (hardwareActionState.status === 'loading') return;
    setHardwareActionState({ status: 'loading', message: 'Clearing the temporary Find-my-strips setup…' });
    try {
      await clearCardProject({ host: cardLink?.host || cardHost });
      setHardwareActionState({
        status: 'ok',
        message: 'The temporary setup was cleared. The card kept its WiFi and is restarting blank — reconnect in a few seconds, then install your project or run Find my strips.',
      });
    } catch (error) {
      setHardwareActionState({ status: 'error', message: error?.message || 'The card did not confirm the clear. Keep it powered, reconnect, and try again.' });
    }
  };
  // The adoption machine itself lives in lib/cardProjectAdoption.js — the
  // save barrier, exact re-snapshots, drift guards, resolution, and the
  // status-envelope authorization all run there. This binding supplies the
  // component's props, refs, and state setters, so the harness-injected
  // handler contract (tests/card-workspace.spec.ts) is unchanged.
  const loadMatchingCardProject = useCallback(async ({ probeOnly = false, selectionKey = '', autoIntent = '', probeSignature = '' } = {}) => {
    await guardedResolutionRun({
      context: {
        ready,
        cardLink,
        cardHost,
        currentProject,
        projectGeneration,
        activeCloudProjects,
        browserProjects,
      },
      getLatestContext: () => resolutionContextRef.current,
      getSharedCardLink: getCardLinkState,
      isCardLinkConnected,
      io: {
        readCardProjectEvidence,
        readCardStatusEnvelope,
        loadProductionJobIndex,
        loadProductionJobFromIndexEntry,
        readCloudProject,
        readBrowserProjects,
      },
      actions: {
        replaceProject,
        saveBeforeCardProjectSwitch,
        isProjectSwitchSnapshotCurrent,
        openMatchingCardProject,
        onMatchedProjectLoaded,
        onMatchedProjectVerified,
      },
      authorization: {
        clearCardEditAuthorization,
        issueCardEditAuthorization,
        issueSignedProductionCardEditAuthorization,
        clearAbandonedCardEditIntent,
        getCardEditIntent: cardEditIntent,
      },
      ui: {
        // A PROBE is Studio looking around by itself. Finding no matching
        // project is the ordinary condition of a card whose project this
        // browser has never held — it is not a failure, and reporting it as
        // one puts a red alert on the first screen the owner sees, before he
        // has touched anything. This screen already offers the two real
        // answers ("Import project file", "Start from card wiring"); let them
        // speak instead. An owner-initiated load still reports its failure in
        // full, because then he asked and is owed an answer.
        report: probeOnly
          ? state => setMatchingProjectState(state.status === 'error' ? { status: 'idle', message: '' } : state)
          : setMatchingProjectState,
        openPatterns: () => { window.location.hash = '#screen=pattern'; },
      },
      flight: {
        inFlight: projectSwitchInFlightRef,
        pendingProbe: pendingCardProjectProbeRef,
        probeSignature: cardProjectProbeRef,
      },
      requestProbe: requestCardProjectProbe,
    }, { strategy: probeOnly ? 'probe' : 'resolved', selectionKey, autoIntent, probeSignature });
  }, [
    activeCloudProjects,
    browserProjects,
    cardHost,
    cardLink,
    currentProject,
    onMatchedProjectLoaded,
    onMatchedProjectVerified,
    openMatchingCardProject,
    readCloudProject,
    readBrowserProjects,
    ready,
    replaceProject,
    projectGeneration,
    saveBeforeCardProjectSwitch,
    isProjectSwitchSnapshotCurrent,
  ]);
  useEffect(() => {
    if (!ready) return;
    const candidateSourceSignature = [
      activeCloudProjects
        .map(project => `${project?.id || ''}:${project?.revision ?? ''}:${project?.embeddedProjectId || ''}`)
        .sort()
        .join(','),
      browserProjects
        .map(record => `${record?.id || ''}:${record?.updatedAt ?? ''}:${record?.project?.id || ''}`)
        .sort()
        .join(','),
    ].join('::');
    // An intent Patterns already failed to claim must not be handed over
    // again on our own initiative — that is the loop. It stays in the URL, so
    // the offer below still opens the right thing when the owner asks for it.
    const requestedIntent = cardEditIntent();
    const autoIntent = isCardEditIntentAbandoned(requestedIntent) ? '' : requestedIntent;
    const signature = [
      normalizeCardHost(cardLink?.host || cardHost),
      cardLink?.card?.id,
      cardLink?.card?.buildId,
      cardLink?.readiness?.bootId,
      cardLink?.operationGeneration,
      cardLink?.revalidationGeneration,
      cardLink?.readiness?.projectId,
      cardLink?.readiness?.projectRevision,
      cardLink?.readiness?.projectFingerprint,
      cardLink?.readiness?.productionJobId,
      cardLink?.readiness?.productionJobDigest,
      projectGeneration,
      candidateSourceSignature,
      // Card Home stays mounted across the setup↔overview section change, so
      // an edit intent arriving on an already-probed card (the drawer's
      // "Advanced editing" handoff) must change the signature or the ref
      // would swallow the hand-over that used to ride on a remount. An
      // abandoned intent folds back to '' here, so the ping-pong breaker in
      // cardEditIntent.js still holds.
      autoIntent,
    ].join('|');
    if (cardProjectProbeRef.current === signature) return;
    void loadMatchingCardProject({ probeOnly: !autoIntent, autoIntent, probeSignature: signature });
  }, [activeCloudProjects, browserProjects, cardHost, cardLink, cardProjectProbeRevision, loadMatchingCardProject, projectGeneration, ready]);
  // The presentation is Home's connected-state view: it renders only when a
  // card is actually answering — a verified transport (ready, blank, bench,
  // or still confirming its evidence), an identified card mid-revalidation
  // (Studio is talking to it and double-checking), or a found card awaiting
  // pairing — the states whose evidence exists nowhere else on this page.
  // For a card that is not answering, the Setup journey above (identity row
  // + connect task) is the one verdict — repeating "connect the card" here
  // was the double verdict the merge removes. found-unpaired is the same
  // class: Setup's pair task is already the one connect action.
  const answering = verifiedTransport
    || (cardLink?.state === 'revalidating' && Boolean(cardLink?.card?.id));
  // …and a presentation the Setup journey above already states in full is not
  // rendered at all. One status, not a chorus of it.
  const showPresentation = (answering || ready) && !presentation.redundant;

  return (
    <div className="card-overview">
      {showPresentation && (
        <div className="card-overview-state">
          <span className={`card-overview-signal ${presentation.tone}`} aria-hidden="true" />
          <div>
            <span className="card-workspace-kicker">Detected state</span>
            <p data-testid="card-detected-state">{presentation.message}</p>
          </div>
        </div>
      )}

      {/* One project, one Load button: when the Setup journey's saved-match
          banner above is already offering the Load for this card's project,
          this panel stands down instead of offering a second copy of the same
          adoption (both run the identical guarded machine). The probe effect
          keeps running either way, so edit-intent auto-open is unaffected. */}
      {/* Not while the card is holding the temporary Find-my-strips setup. What
          it "matches" then is discovery scaffolding, and offering to load it as
          your project — in a second orange primary button, beside the setup
          step's own — put two competing headline actions on one screen for a
          card that is mid-setup. The banner above already names that state. */}
      {/* An idle generic Load next to Setup's pull/overwrite is a second door
          for a card this browser has never held. Keep the idle Load only when
          the card names a production job — that click is the digest check. */}
      {ready && !suppressMatchingProject && !benchProject && matchingProjectOffer && (
        <section className="card-support-panel" aria-label="Matching card project">
          <h2>Matching card project</h2>
          {/* Two sentences here restated what the identity row above already
              says about this card and its project. Say only what pressing the
              button does — and when the card is already holding the project
              open in Studio, that is a re-check, not an open. */}
          <p>
            {cardHoldsOpenProject
              ? 'Re-read the project installed on this card and confirm it still matches the one open here.'
              : 'Open the project installed on this card, so its LED count, wiring, protocol, and power limit stay aligned.'}
          </p>
          {matchingProjectState.status !== 'ambiguous' && (
            <button
              type="button"
              /* Not a second headline button when it would load the project
                 already open — "Open Patterns" is the action there, and two
                 orange buttons side by side made the screen ask twice. */
              className={cardHoldsOpenProject || yieldPrimary ? 'btn' : 'btn primary'}
              disabled={matchingProjectState.status === 'loading' || matchingProjectState.status === 'saving'}
              onClick={() => void loadMatchingCardProject({ selectionKey: matchingProjectState.selectionKey || '' })}
            >
              {matchingProjectState.status === 'saving'
                ? 'Saving current project…'
                : matchingProjectState.status === 'loading'
                ? 'Verifying project…'
                : matchingProjectState.matchLabel
                  ? `Load ${matchingProjectState.matchLabel}`
                  : 'Load matching card project'}
            </button>
          )}
          {matchingProjectState.status === 'ambiguous' && (
            <div className="card-overview-actions" aria-label="Exact matching projects">
              {matchingProjectState.matches.map(match => (
                <button
                  key={resolvedMatchKey(match)}
                  type="button"
                  className="btn"
                  onClick={() => void loadMatchingCardProject({ selectionKey: resolvedMatchKey(match) })}
                >
                  Load {describeResolvedCardProject(match)}
                </button>
              ))}
            </div>
          )}
          {matchingProjectState.message && (
            <p role={matchingProjectState.status === 'error' ? 'alert' : 'status'}>{matchingProjectState.message}</p>
          )}
        </section>
      )}

      {/*
        Gated on being able to TALK to the card, not on the card being well.
        It used to require `ready` — a fully healthy runtime — which hid this
        whole section from exactly the cards that need recovering. Worse, the
        Patterns screen's gate says "This card is not ready for pattern
        commands. Recover and verify it before sending lights." and its button
        routes here, so the one stated remedy landed on a screen where the
        remedy was invisible. The firmware accepts /api/recover-lights on a
        not-ready card deliberately; Studio was the only thing refusing.
      */}
      {/* Open when it is the answer, folded when it is not. A healthy card
          does not need three diagnostic buttons and a paragraph competing with
          its next step — but the Patterns gate routes an unwell card here and
          names Recover lights as the remedy, so a card that is answering
          without a ready runtime, or is holding the temporary setup, still
          finds this section open with no click. */}
      {(ready || verifiedTransport) && (
        <details
          className="card-support-panel card-checks-panel"
          aria-label="Hardware checks and recovery"
          data-testid="card-checks-recovery"
          open={!ready || benchProject}
        >
          <summary><h2>Checks &amp; recovery</h2></summary>
          <p>These read the card and report back what it says. Nothing here is recorded as passing a light or colour test until you say you saw it.</p>
          {!ready && (
            <p role="status">
              This card is answering but is not reporting a ready runtime. Recover lights is
              the check to run first — the card accepts it in this state.
            </p>
          )}
          <div className="card-overview-actions">
            <button type="button" className="btn" disabled={hardwareActionState.status === 'loading'} onClick={() => void verifyHardware()}>Verify hardware</button>
            <button type="button" className="btn" disabled={hardwareActionState.status === 'loading'} onClick={() => void recoverLights()}>Recover lights</button>
            {benchProject && (
              <button type="button" className="btn" disabled={hardwareActionState.status === 'loading'} onClick={() => void clearTemporarySetup()}>Clear temporary setup</button>
            )}
            <button type="button" className="btn" onClick={() => { window.location.hash = '#screen=card&section=settings&tool=color-order'; }}>Color-order test</button>
          </div>
          {hardwareActionState.message && (
            <p role={hardwareActionState.status === 'error' ? 'alert' : 'status'}>{hardwareActionState.message}</p>
          )}
        </details>
      )}

      <p className="card-overview-batch" data-testid="card-batch-link">
        <span style={{ color: 'var(--text-faint)' }}>Making many cards? </span>
        <button type="button" className="link-btn" onClick={() => onOpenSection('workshop')}>Batch production</button>
      </p>
    </div>
  );
}

function RecoverySupport({ onConnectCard, onOpenConnectionCenter }) {
  return (
    <section className="card-support-panel">
      <h2>Safe recovery</h2>
      <p>Reconnect and inspect the card before choosing an install or write action. Opening recovery here does not erase firmware, WiFi, or the saved project.</p>
      <button
        type="button"
        className="btn primary"
        onClick={() => (onOpenConnectionCenter ? onOpenConnectionCenter() : onConnectCard?.())}
      >
        Reconnect card
      </button>
    </section>
  );
}

function CardSupport({ initialTool, cardProps, onOpenConnectionCenter, onOpenSection }) {
  const [tool, setTool] = useState(initialTool);
  useEffect(() => setTool(initialTool), [initialTool]);

  const installerGo = target => {
    if (target === 'flash') onOpenSection('install');
    else if (target === 'settings') onOpenSection('settings');
  };

  return (
    <div className="card-support">
      <div className="card-support-grid" aria-label="Advanced and support tools">
        <button type="button" aria-label="Technician firmware & logs" className={tool === 'technician' ? 'selected' : ''} aria-pressed={tool === 'technician'} onClick={() => setTool('technician')}>
          <strong>Technician firmware &amp; logs</strong><span>Manual firmware, offsets, erase controls, and serial output.</span>
        </button>
        <button type="button" aria-label="GPIO & install guide" className={tool === 'guide' ? 'selected' : ''} aria-pressed={tool === 'guide'} onClick={() => setTool('guide')}>
          <strong>GPIO &amp; install guide</strong><span>Worker sequence, wiring pins, hard stops, and bench signoff.</span>
        </button>
        <button type="button" aria-label="Designer JSON" className={tool === 'json' ? 'selected' : ''} aria-pressed={tool === 'json'} onClick={() => setTool('json')}>
          <strong>Designer JSON</strong><span>Inspect the exact configuration Studio would write.</span>
        </button>
        <button type="button" aria-label="Recovery" className={tool === 'recovery' ? 'selected' : ''} aria-pressed={tool === 'recovery'} onClick={() => setTool('recovery')}>
          <strong>Recovery</strong><span>Reconnect safely and choose the next evidence-based action.</span>
        </button>
        <button type="button" aria-label="Deployment check" className={tool === 'deployment' ? 'selected' : ''} aria-pressed={tool === 'deployment'} onClick={() => setTool('deployment')}>
          <strong>Deployment check</strong><span>Verify this site's signed release from the browser — no install needed.</span>
        </button>
        <button type="button" aria-label="Batch production" onClick={() => onOpenSection('workshop')}>
          <strong>Batch production</strong><span>Signed-job manufacturing flow with identity binding and pass records.</span>
        </button>
      </div>

      {tool && (
        <div className="card-support-tool">
          {tool === 'technician' && <TechnicianFlashScreen embedded />}
          {tool === 'guide' && <InstallerScreen embedded go={installerGo} cardLink={cardProps.cardLink} />}
          {tool === 'json' && <SettingsScreen embedded mode="advanced" {...cardProps} />}
          {tool === 'recovery' && <RecoverySupport onConnectCard={cardProps.onConnectCard} onOpenConnectionCenter={onOpenConnectionCenter} />}
          {tool === 'deployment' && <DeploymentCheckPanel />}
        </div>
      )}
    </div>
  );
}

export function CardScreen({ connected, cardHost, cardLink, cardLifecycle, onConnectCard, onOpenConnectionCenter, onOpenSection, onOpenSetupTask, onFirmwareRecoveryState, firmwareStatus = null, go, replaceProject, currentProject, projectGeneration, activeCloudProjects, browserProjects, readBrowserProjects, readCloudProject, openMatchingCardProject, confirmProjectReplacement, saveBeforeCardProjectSwitch, saveProjectToBrowserGuarded, isProjectSwitchSnapshotCurrent, onMatchedProjectLoaded, onMatchedProjectVerified, onStartNewProject, onSaveProject, route = { section: DEFAULT_CARD_SECTION, supportTool: '' } }) {
  const headingRef = useRef(null);
  const mountedRef = useRef(false);
  // Whether the Setup journey's saved-match banner is currently offering a
  // Load for this card's project — the Matching-card-project panel below
  // suppresses its duplicate offer while it is (one project, one Load).
  const [setupLoadOffer, setSetupLoadOffer] = useState(false);
  // Whether the Setup ladder is currently offering the page's primary action.
  // While it is, every surface below it renders secondary controls — one
  // primary per page. See the comment on `ladderOwnsPrimary` in lw-setup.jsx.
  const [ladderOwnsPrimary, setLadderOwnsPrimary] = useState(false);

  useEffect(() => {
    // Focus the section heading after in-app section navigation (required
    // a11y behavior), but never on a direct page load — mount-time focus
    // steals whatever the user or a keyboard test is about to activate.
    const navigated = consumeCardSectionNavigation();
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (!navigated) return undefined;
    }
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [route.section]);

  const cardProps = { connected, cardHost, cardLink, cardLifecycle, onConnectCard };
  // Home is the landing default too: any section this dispatch does not name
  // renders it. settings/support stay Home with the matching fold open.
  const home = HOME_SECTIONS.includes(route.section)
    || !['install', 'workshop', 'preferences'].includes(route.section);
  let content;
  // Card Home: the guided journey, the one install action, evidence panels,
  // then Hardware and Advanced folded underneath.
  if (home) content = (
    <>
      <SetupScreen
        {...cardProps}
        onOpenConnectionCenter={onOpenConnectionCenter}
        currentProject={currentProject}
        activeCloudProjects={activeCloudProjects}
        browserProjects={browserProjects}
        replaceProject={replaceProject}
        onSaveProject={onSaveProject}
        firmwareStatus={firmwareStatus}
        onLoadOfferChange={setSetupLoadOffer}
        onPrimaryActionChange={setLadderOwnsPrimary}
      />
      <CardInstallAction
        connected={connected}
        cardHost={cardHost}
        yieldPrimary={ladderOwnsPrimary}
        onEditInWire={() => { window.location.hash = '#screen=layout&mode=draw'; }}
      />
      <CardHomePanels
        {...cardProps}
        suppressMatchingProject={setupLoadOffer}
        yieldPrimary={ladderOwnsPrimary}
        onOpenConnectionCenter={onOpenConnectionCenter}
        onOpenSection={onOpenSection}
        go={go}
        replaceProject={replaceProject}
        currentProject={currentProject}
        projectGeneration={projectGeneration}
        activeCloudProjects={activeCloudProjects}
        browserProjects={browserProjects}
        readBrowserProjects={readBrowserProjects}
        readCloudProject={readCloudProject}
        openMatchingCardProject={openMatchingCardProject}
        confirmProjectReplacement={confirmProjectReplacement}
        saveBeforeCardProjectSwitch={saveBeforeCardProjectSwitch}
        isProjectSwitchSnapshotCurrent={isProjectSwitchSnapshotCurrent}
        onMatchedProjectLoaded={onMatchedProjectLoaded}
        onMatchedProjectVerified={onMatchedProjectVerified}
        onStartNewProject={onStartNewProject}
      />
      <CardPageFold
        testId="card-hardware-fold"
        summary="Hardware"
        open={route.section === 'settings'}
        onOpen={() => onOpenSection('settings')}
        onClose={() => onOpenSection('setup')}
      >
        <SettingsScreen embedded mode="card" {...cardProps} />
      </CardPageFold>
      <CardPageFold
        testId="card-advanced-fold"
        summary="Advanced"
        open={route.section === 'support'}
        onOpen={() => onOpenSection('support')}
        onClose={() => onOpenSection('setup')}
      >
        <CardSupport initialTool={route.supportTool} cardProps={cardProps} onOpenConnectionCenter={onOpenConnectionCenter} onOpenSection={onOpenSection} />
      </CardPageFold>
    </>
  );
  else if (route.section === 'install') content = (
    <AutomaticInstallScreen
      embedded
      cardLink={cardLink}
      cardLifecycle={cardLifecycle}
      onFirmwareRecoveryState={onFirmwareRecoveryState}
      onConnectCard={onConnectCard}
      persistCurrentProjectToBrowser={saveProjectToBrowserGuarded}
      onCommissioningComplete={() => onOpenSection('overview')}
    />
  );
  else if (route.section === 'workshop') content = <ProductionScreen embedded cardHost={cardHost} cardLink={cardLink} onConnectCard={onConnectCard} />;
  else content = <SettingsScreen embedded mode="preferences" {...cardProps} />;

  const workshop = route.section === 'workshop';
  const heading = SECTION_HEADINGS[route.section] || SECTION_HEADINGS.setup;
  return (
    <div className="screen card-workspace-screen">
      <div className="card-workspace">
        <main className={`card-workspace-body${home ? ' lw-setup-body' : ''}`}>
          <header className="card-workspace-header">
            <span className="card-workspace-kicker">{workshop ? 'Manufacturing mode' : 'Lightweaver hardware'}</span>
            <h1 ref={headingRef} tabIndex={-1}>{heading}</h1>
            {workshop && (
              <button type="button" className="btn" onClick={() => onOpenSection('overview')}>Back to Hardware</button>
            )}
          </header>
          {content}
        </main>
      </div>
    </div>
  );
}
