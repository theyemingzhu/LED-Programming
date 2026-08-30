import React, { useEffect, useMemo, useRef, useState } from 'react';
import './lw-setup.css';
import {
  CONNECTED_CARD_LINK_STATES,
  SETUP_SKIP_STORAGE_KEY,
  deriveSetupJourney,
  setupOffersTypedLedCount,
  setupTypedLedCountPin,
} from '../lib/setupJourney.js';
import { CARD_COMMISSIONING_CHANGED_EVENT, inspectCardCommissioning } from '../lib/cardCommissioningFlow.js';
import { hasResumableCommissioning, openCardFlow } from '../lib/cardFlowEntry.js';
import { readCardProjectEvidence, readCardStatusEnvelope } from '../lib/cardPushClient.js';
import { applyLedCountOnCard, cardStatusWithPixelCount } from '../lib/applyLedCountToCard.js';
import { recoverCardLights } from '../lib/cardLiveControl.js';
import { cardProjectFingerprint, resolveCardProject, describeResolvedCardProject } from '../lib/cardProjectResolver.js';
import { isBenchProjectEvidence } from '../lib/benchConfig.js';
import { isUncountedHeadroomCount, projectSkeletonFromCardStatus } from '../lib/discoveryCommit.js';
import { readCardPatternsFromCard, readCardZonesFromCard } from '../lib/cardLiveControl.js';
import { deriveCardLifecycle } from '../lib/cardLifecycle.js';
import { useProject } from '../state/ProjectContext.jsx';
import { currentInstallation, structurallyInstalledRecord } from '../lib/projectLifecycle.js';
import { guardedResolutionRun, resolvedMatchKey } from '../lib/cardProjectAdoption.js';
import { importProjectFromPickedFile } from '../lib/projectTransfer.js';
import { PROJECT_IMPORT_ACCEPT } from '../lib/projectFiles.js';
import { findAndConnectCard } from '../lib/cardFind.js';
import { useCardActions } from './CardActionsProvider.jsx';

// The reconstruction itself moved to lib/cardProjectAdoption.js (the
// 'reconstruct' strategy); tests/setup-card-reconstruction.spec.ts imports it
// from this screen, so the export stays.
export { reconstructInstalledCardState } from '../lib/cardProjectAdoption.js';

function exactCardName(cardLink, cardHost) {
  return cardLink?.card?.name
    || cardLink?.card?.id
    || cardLink?.readiness?.cardId
    || cardLink?.host
    || cardHost
    || 'No exact card yet';
}

function installRelationship(resolution, installedProjectId = '', installationMatch = false, openProjectId = '', provisionalSetup = false, exactProject = false) {
  // A temporary light-finding setup is not an installation, whatever project
  // id it was written under. Reporting "Installed project matches" for one
  // contradicted the banner beside it.
  if (provisionalSetup || resolution.kind === 'bench') return 'Temporary setup — not installed';
  // "Installed project matches" is a claim about a VERIFIED installation, so it
  // needs the same evidence the footer uses (id + fingerprint + revision), not
  // just agreeing ids. Claiming it on ids alone put "Installed project matches"
  // in this row while the footer said "Needs attention" about the same card.
  // The honest answer for ids-only is the one two lines down: same project,
  // save to card to verify.
  if (installationMatch || (resolution.kind === 'matches-current' && exactProject)) return 'Installed project matches';
  if (resolution.kind === 'saved-match') return 'Matching saved project found';
  // The card told us what it holds. Reporting "Project not installed" over the
  // top of that is simply false, and it was the line that made a healthy,
  // correctly installed card look broken.
  const installed = String(installedProjectId || '').trim();
  // Same id but no verified binding: calling that "differs from open project"
  // is false and reads as a failure. Name what is actually missing.
  if (installed && installed === String(openProjectId || '').trim()) {
    return 'Same project — save to card to verify';
  }
  if (installed) return `${installed} — differs from open project`;
  return 'Project not installed';
}

// Why a card operation cannot proceed, in the owner's terms. The generic
// "Recover card operation" button reopened the connection center, which routed
// straight back to Setup; naming the actual blocker is the part that lets the
// owner do something about it.
const RECOVERY_EXPLANATIONS = Object.freeze({
  'operation-uncertain': 'The last card operation never reported a result, so Studio cannot say whether it landed. Read this card again before sending anything else.',
  'wrong-card': 'A different card answered at this address. Connect the exact card this project belongs to.',
  'target-mismatch': 'This card is running a different firmware build than the one the update was prepared against. Update the firmware, then retry.',
  'project-changed': 'The open project changed after the update was prepared, so the prepared candidate no longer matches it. Prepare it again.',
  'popup-blocked': 'The browser blocked the card window, so Studio never saw the result. Allow pop-ups for Studio, then read this card again.',
  'firmware-too-old': 'This card firmware predates the installed-project contract Studio needs. Update the firmware first.',
  'identity-missing': 'This card answered without a complete identity, so Studio cannot bind commands to it. Read it again, and update its firmware if this repeats.',
  'rolled-back': 'The last firmware update rolled back, so the card is on its previous build. Nothing was lost — read the card again to confirm what it is running.',
});

export function recoveryExplanation(reason) {
  return RECOVERY_EXPLANATIONS[String(reason || '').trim()]
    || 'Studio could not confirm the result of the last card operation. Read this card again before sending anything else.';
}

function discoveryEvidence(project) {
  const outputs = (Array.isArray(project?.portRoles) ? project.portRoles : [])
    .filter(output => output?.role === 'strip' && Number(output.pixelCount) > 0);
  const color = project?.devices?.standaloneController?.led;
  return {
    outputs,
    colorOrder: color?.colorOrderConfirmed === true ? color.colorOrder : '',
    count: outputs.reduce((sum, output) => sum + Number(output.pixelCount || 0), 0),
  };
}

export function SetupScreen({
  connected,
  cardHost,
  onOpenConnectionCenter,
  cardLink,
  cardLifecycle,
  currentProject = {},
  activeCloudProjects = [],
  browserProjects = [],
  replaceProject,
  firmwareStatus = null,
  onLoadOfferChange,
}) {
  const {
    setProjectId, setPortRoles, setStandaloneController, replaceLayoutGeometry,
    markProjectInstalled, readProjectLifecycle, projectLifecycle,
  } = useProject();
  const cardActions = useCardActions();
  const [commissioningFlow, setCommissioningFlow] = useState(() => inspectCardCommissioning().flow);
  const [cardState, setCardState] = useState({ evidence: null, status: null, read: false });
  const [resolution, setResolution] = useState({ kind: 'unknown' });
  const [recheckTick, setRecheckTick] = useState(0);
  const [adoptionError, setAdoptionError] = useState('');
  const [pairState, setPairState] = useState({ busy: false, message: '' });
  const [ledCountDraft, setLedCountDraft] = useState('');
  const [ledCountState, setLedCountState] = useState({ busy: false, message: '' });
  const importRef = useRef(null);
  const resolveInputsRef = useRef({ currentProject, activeCloudProjects, browserProjects });
  const previousPhaseRef = useRef('');
  resolveInputsRef.current = { currentProject, activeCloudProjects, browserProjects };

  const exactTransport = CONNECTED_CARD_LINK_STATES.includes(cardLink?.state);
  const cardReachable = exactTransport || connected;

  useEffect(() => {
    const sync = () => setCommissioningFlow(inspectCardCommissioning().flow);
    window.addEventListener('storage', sync);
    window.addEventListener(CARD_COMMISSIONING_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CARD_COMMISSIONING_CHANGED_EVENT, sync);
    };
  }, []);

  // Read-back adoption is an installation fact, and until now nothing recorded
  // it: `startFromCard` / `loadResolvedProject` adopted the card's geometry and
  // id, but `replaceProject` resets the lifecycle to revision 0 with no
  // installation, so the freshly adopted project immediately read as a mismatch
  // against the very card it came from. Binding it here is still
  // evidence-based — `markInstalled` only marks it verified when the card
  // supplied a real card id, a non-negative project revision, and a well-formed
  // fingerprint, so a card that reports nothing binds nothing.
  const recordCardInstallation = (status = null, marker = null, adopted = null) => {
    const readiness = cardLink?.readiness || {};
    const lifecycle = marker || readProjectLifecycle?.();
    if (!lifecycle || !markProjectInstalled) return;
    const generation = marker ? marker.generation : lifecycle.generation;
    const revision = marker ? marker.revision : lifecycle.editedRevision;
    markProjectInstalled({
      generation,
      revision,
      cardId: status?.cardId || cardLink?.card?.id || readiness.cardId || '',
      projectRevision: Number(status?.projectRevision ?? readiness.projectRevision),
      projectFingerprint: status?.projectFingerprint || readiness.projectFingerprint || '',
      // The structure this binding was made against. A project reconstructed
      // from a card hashes to something the card never held, so this is what
      // later distinguishes "still the adopted structure" from "rewired since".
      studioFingerprint: adopted ? cardProjectFingerprint(adopted) : '',
      verified: true,
    });
  };

  const applyCardParts = async (parts, status = null) => {
    const nextOutputs = Array.isArray(parts?.outputs) ? parts.outputs : null;
    const installedController = parts?.devices?.standaloneController || parts?.standaloneController || {};
    const nextController = {
      ...(currentProject?.devices?.standaloneController || {}),
      ...installedController,
      ...(installedController.controls ? {
        controls: {
          ...(currentProject?.devices?.standaloneController?.controls || {}),
          ...installedController.controls,
          encoder: {
            ...(currentProject?.devices?.standaloneController?.controls?.encoder || {}),
            ...(installedController.controls.encoder || {}),
          },
        },
      } : {}),
      ...(nextOutputs ? { outputs: nextOutputs } : {}),
      led: {
        ...(currentProject?.devices?.standaloneController?.led || {}),
        ...(installedController.led || {}),
        ...(parts?.led || {}),
        ...(parts?.colorOrder ? { colorOrder: parts.colorOrder, colorOrderConfirmed: true } : {}),
        ...(nextOutputs ? {
          outputs: nextOutputs,
          pixels: nextOutputs.reduce((sum, output) => sum + Number(output.pixels || 0), 0),
        } : {}),
      },
    };
    if (replaceProject && Array.isArray(parts?.strips) && parts.strips.length) {
      const replacement = await replaceProject({
        ...currentProject,
        ...(status?.projectId ? { id: status.projectId } : {}),
        ...(Array.isArray(parts?.portRoles) ? { portRoles: parts.portRoles } : {}),
        layout: {
          ...(currentProject?.layout || {}),
          strips: parts.strips,
          starterPending: false,
          patchBoard: parts.patchBoard,
          wiring: parts.wiring,
        },
        devices: {
          ...(currentProject?.devices || {}),
          standaloneController: nextController,
        },
      }, { confirmDiscard: () => true });
      // An installation record must never outlive the replacement that earned
      // it. Recording unconditionally marked the card's project as installed
      // against a project that was never adopted — a lie that then failed
      // every downstream identity check for reasons the owner could not see.
      if (!replacement?.ok) return { ok: false, reason: replacement?.reason || 'replace-failed' };
      recordCardInstallation(status, replacement.marker, replacement.project);
      return { ok: true };
    }
    if (status?.projectId) setProjectId(status.projectId);
    if (Array.isArray(parts?.portRoles)) setPortRoles(parts.portRoles);
    if (Array.isArray(parts?.strips) && parts.strips.length) {
      replaceLayoutGeometry(parts.strips, { patchBoard: parts.patchBoard, wiring: parts.wiring });
    }
    if (nextOutputs || parts?.colorOrder) {
      setStandaloneController(previous => ({
        ...previous,
        ...(nextOutputs ? { outputs: nextOutputs } : {}),
        led: {
          ...(previous?.led || {}),
          ...(parts.colorOrder ? { colorOrder: parts.colorOrder, colorOrderConfirmed: true } : {}),
          ...(nextOutputs ? {
            outputs: nextOutputs,
            pixels: nextOutputs.reduce((sum, output) => sum + Number(output.pixels || 0), 0),
          } : {}),
        },
      }));
    }
    return { ok: true };
  };

  const adoptedCardRef = useRef('');
  const adoptWiringFromCard = status => {
    const signature = `${status?.cardId || ''}:${status?.projectId || ''}:${status?.bootId || ''}`;
    if (!signature.replace(/:/g, '') || adoptedCardRef.current === signature) return;
    const skeleton = projectSkeletonFromCardStatus(status || {});
    if (!skeleton.portRoles.some(output => output?.role === 'strip' && Number(output.pixelCount) > 0)) return;
    const alreadyDescribed = (currentProject?.portRoles || [])
      .some(output => output?.role === 'strip' && Number(output.pixelCount) > 0);
    adoptedCardRef.current = signature;
    if (!alreadyDescribed) {
      void applyCardParts(skeleton, status)
        .then(applied => { if (!applied?.ok) reportAdoptionFailure(applied?.reason); })
        .catch(error => reportAdoptionFailure('', error));
    }
  };

  useEffect(() => {
    if (!cardReachable) {
      setCardState({ evidence: null, status: null, read: false });
      setResolution({ kind: 'unknown' });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const readHost = cardLink?.host || cardHost || '';
      const readTransport = cardLink?.transport;
      const [projectResult, statusResult] = await Promise.allSettled([
        readCardProjectEvidence({ host: readHost, transport: readTransport }),
        readCardStatusEnvelope({ host: readHost, transport: readTransport }),
      ]);
      if (cancelled) return;
      const evidence = projectResult.status === 'fulfilled' ? projectResult.value : null;
      const status = statusResult.status === 'fulfilled' ? statusResult.value : null;
      setCardState({ evidence, status, read: true });
      adoptWiringFromCard(status);
      if (!evidence) {
        setResolution({ kind: 'none' });
        return;
      }
      if (isBenchProjectEvidence(evidence)) {
        setResolution({ kind: 'bench' });
        return;
      }
      const inputs = resolveInputsRef.current;
      const resolved = resolveCardProject({
        evidence,
        currentProject: inputs.currentProject,
        productionJobs: [],
        cloudProjects: Array.isArray(inputs.activeCloudProjects) ? inputs.activeCloudProjects : [],
        browserProjects: Array.isArray(inputs.browserProjects) ? inputs.browserProjects : [],
      });
      if (resolved.status === 'match') {
        setResolution(resolved.source === 'current'
          ? { kind: 'matches-current', resolved }
          : { kind: 'saved-match', resolved });
      } else {
        setResolution({ kind: 'none' });
      }
    })();
    return () => { cancelled = true; };
  }, [cardReachable, cardLink?.host, cardLink?.transport, cardHost, currentProject?.id, currentProject?.projectRevision, recheckTick]);

  // A project adopted from a card can never match it by fingerprint: the card
  // hashed the bytes it was installed with, and a reconstruction from
  // `/api/status` cannot reproduce them. So the resolver alone reported a
  // freshly adopted card as "differs from open project" forever, which is what
  // kept Setup nagging about a card it had just adopted. The installation
  // record settles it instead — and only on an exact agreement with what this
  // card reports right now: same card, same installed project id as the open
  // project, same project revision, same fingerprint it was recorded with.
  const installationMatch = useMemo(() => {
    const studioStructureFingerprint = cardProjectFingerprint(currentProject);
    const installation = structurallyInstalledRecord(projectLifecycle, studioStructureFingerprint)
      || currentInstallation(projectLifecycle);
    if (installation?.verified !== true) return false;
    const readiness = cardLink?.readiness || {};
    const status = cardState.status || {};
    const identity = value => String(value || '').trim().toLowerCase();
    const cardId = identity(status.cardId || cardLink?.card?.id || readiness.cardId);
    if (!cardId || cardId !== identity(installation.cardId)) return false;
    const fingerprint = identity(status.projectFingerprint || readiness.projectFingerprint);
    if (/^[a-f0-9]{16,64}$/.test(fingerprint)) {
      if (fingerprint !== identity(installation.projectFingerprint)) return false;
    } else if (fingerprint
      || identity(installation.projectFingerprint)
      || !identity(installation.studioFingerprint)
      || identity(installation.studioFingerprint) !== identity(studioStructureFingerprint)) {
      // A card flashed before fingerprint reporting answers with an empty
      // fingerprint for a project it genuinely holds. The record adopted off
      // that exact card carries the structural stand-in instead, and only an
      // exact structural agreement lets it speak for the empty value.
      return false;
    }
    const projectRevision = Number(status.projectRevision ?? readiness.projectRevision);
    if (!Number.isSafeInteger(projectRevision) || projectRevision !== Number(installation.projectRevision)) return false;
    const installedProjectId = String(status.projectId || readiness.projectId || '').trim();
    return Boolean(installedProjectId) && installedProjectId === String(currentProject?.id || '').trim();
  }, [cardLink?.card, cardLink?.readiness, cardState.status, currentProject, projectLifecycle]);
  // ONE authority for "is the card holding this exact project?".
  //
  // `resolution.kind === 'matches-current'` compares project IDs. The card
  // lifecycle compares id AND fingerprint AND revision — and it is the one the
  // footer renders. With only the ids agreeing, the two disagreed out loud: the
  // identity row said "Installed project matches", the ladder said SETUP
  // COMPLETE and offered Open Patterns, while the footer said "Needs attention"
  // about the same healthy card, permanently. A weaker match cannot outrank the
  // stronger one; a recorded installation (installationMatch) still can, since
  // that IS the verified evidence.
  const matchesOpenProject = installationMatch
    || (resolution.kind === 'matches-current' && cardLifecycle?.exactProject === true);
  // The saved-match banner below offers its Load only while the shared
  // adoption machine can actually run it — cardActions comes from
  // CardActionsProvider, mounted at the Shell. Report the offer up so Card
  // Home's Matching-card-project panel suppresses the duplicate — one
  // project, one Load button (both run the identical guarded machine).
  // Without the provider (CardScreen rendered standalone — the documented
  // project-switch harness contract in tests/card-workspace.spec.ts and the
  // CardActionsProvider header), the banner stands down instead: it must
  // never offer a Load that cannot run, and the panel — which binds the
  // machine from its own injected props — keeps the one working offer.
  const savedMatchLoadOffer = resolution.kind === 'saved-match' && !installationMatch
    && Boolean(cardActions?.adoptCardProject);

  // Whether the card is still holding the TEMPORARY light-finding setup is a
  // fact the card reports about itself. It used to be ASSERTED per branch —
  // hardcoded false whenever the installed project id matched the open one —
  // and since the discovery setup is written under the open project's own id,
  // that branch always won. The result was SETUP COMPLETE with four ticks
  // printed directly beneath this same screen's "discovery evidence, not a
  // finished installation" banner. Read it, do not assume it.
  const provisionalSetup = cardState.status?.provisionalSetup === true
    || cardLink?.readiness?.provisionalSetup === true
    || resolution.kind === 'bench';
  const journeyResolution = matchesOpenProject
    ? { matchesCurrentProject: true, playbackAccess: 'ready', provisionalSetup }
    : resolution.kind === 'saved-match'
      ? { savedProjectMatch: true, playbackAccess: 'ready', provisionalSetup }
      : provisionalSetup
        ? { provisionalSetup: true }
        : null;
  const journey = useMemo(() => deriveSetupJourney({
    cardLink,
    cardLifecycle,
    commissioningFlow,
    project: currentProject,
    resolution: journeyResolution,
  }), [cardLifecycle, cardLink, commissioningFlow, currentProject, installationMatch, provisionalSetup, resolution.kind]);

  useEffect(() => {
    if (!onLoadOfferChange) return undefined;
    onLoadOfferChange(savedMatchLoadOffer);
    return () => onLoadOfferChange(false);
  }, [onLoadOfferChange, savedMatchLoadOffer]);

  // Record completion so older notes of this key stay truthful. The shell
  // no longer routes on it — a bare URL always opens Card Home.
  const setupSkipWrittenRef = useRef(false);
  useEffect(() => {
    if (!journey.setupComplete || setupSkipWrittenRef.current) return;
    setupSkipWrittenRef.current = true;
    try {
      window.localStorage.setItem(SETUP_SKIP_STORAGE_KEY, '1');
    } catch {
      // Without storage there is nothing to record.
    }
  }, [journey.setupComplete]);

  useEffect(() => {
    const previous = previousPhaseRef.current;
    previousPhaseRef.current = journey.currentPhaseId || '';
    if (!previous || !journey.currentPhaseId || previous === journey.currentPhaseId) return undefined;
    const frame = requestAnimationFrame(() => {
      document.querySelector(`[data-testid="setup-phase-${journey.currentPhaseId}"] h2`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [journey.currentPhaseId]);

  const go = hash => { window.location.hash = hash; };

  const ADOPTION_FAILURES = Object.freeze({
    cancelled: 'Studio kept the open project, so nothing was adopted from the card.',
    invalid: 'The card described a project Studio could not read. Read this card again.',
    'no-geometry': 'This card did not report any light outputs, so there is no wiring to start from. Read this card again.',
  });
  // Adoption now runs BY ITSELF when nothing can be lost, and an automatic
  // attempt that fails must not raise an alert: the owner did nothing, so an
  // alert is Studio talking to itself, and it lands on the first screen he
  // sees. A silent fall-back to the explicit buttons is the honest outcome —
  // they say what to do, and pressing one reports its failure in full.
  const ownerAskedToAdoptRef = useRef(false);
  const byOwner = run => () => {
    ownerAskedToAdoptRef.current = true;
    void run();
  };
  const reportAdoptionFailure = (reason, error = null) => {
    if (error) console.warn('Lightweaver card project adoption failed', error);
    if (!ownerAskedToAdoptRef.current) return;
    setAdoptionError(ADOPTION_FAILURES[String(reason || '')]
      || 'Studio could not adopt this card’s project. Read this card again, then try once more.');
  };

  const startFromCard = async () => {
    setAdoptionError('');
    // The reconstruction orchestration is the shared 'reconstruct' strategy in
    // lib/cardProjectAdoption.js; this screen keeps ownership of applying the
    // parts and of the failure copy.
    // Adoption used to fail in silence: a rejected replacement and a thrown one
    // looked exactly like a successful one from this screen, so the owner
    // pressed the button, watched nothing change, and had nothing to act on.
    const result = await guardedResolutionRun({
      context: { cardLink, cardHost },
      io: { readCardStatusEnvelope, readCardPatternsFromCard, readCardZonesFromCard },
      actions: { applyCardParts },
    }, {
      strategy: 'reconstruct',
      initialStatus: cardState.status,
      allowDirectRetry: typeof window !== 'undefined' && window.location.protocol === 'http:',
      onStatus: status => setCardState(previous => ({ ...previous, status, read: true })),
    });
    if (!result.ok) reportAdoptionFailure(result.reason, result.error || null);
  };

  const setupAdoptionFlightRef = useRef({
    inFlight: { current: false },
    pendingProbe: { current: null },
    probeSignature: { current: '' },
  });
  const loadResolvedProject = async () => {
    if (!resolution?.resolved?.project) return;
    setAdoptionError('');
    if (!cardActions?.adoptCardProject) {
      reportAdoptionFailure('');
      return;
    }
    // Deliberate behavior change (card-interaction consolidation, phase 2):
    // Setup's load now runs the SAME guarded machine as the card overview, so
    // it gains the project-switch save barrier and the exact-card drift guards
    // it previously lacked. The current project is saved before the resolved
    // match replaces it, and the machine's verification callback records the
    // installation — this screen keeps only its error surface, and stays on
    // Setup (the re-resolved "already set up" banner offers Open Patterns).
    await cardActions.adoptCardProject({
      strategy: 'resolved',
      selectionKey: resolvedMatchKey(resolution.resolved),
      flight: setupAdoptionFlightRef.current,
      report: state => {
        if (state.status === 'error' && ownerAskedToAdoptRef.current) setAdoptionError(state.message);
      },
      openPatterns: () => {},
    });
  };

  // ── Adopt by default ───────────────────────────────────────────────────────
  //
  // ADOPTING describes the card. MEASURING describes the hardware. They only
  // differ when the physical wiring has changed — and pressing "Find my strips"
  // IS the owner saying it changed. Everywhere else, a card that already holds
  // a working project should simply open it, with no question asked.
  //
  // It used to ask, every time, and the question is one the owner cannot answer
  // better than Studio can. Worse, the wrong answer is expensive: adopting
  // scaffolding makes 256 placeholder lights into a real design, and clearing a
  // finished piece throws away its setup.
  //
  // So this runs only where nothing can be lost:
  //   • the exact card is connected and reports a project of its own,
  //   • that project is NOT the temporary Find-my-strips setup,
  //   • it is not already the project open here,
  //   • and the open project has no unsaved changes to overwrite.
  // Anything else keeps the explicit buttons, unchanged.
  const autoAdoptedRef = useRef('');
  useEffect(() => {
    if (!exactTransport || !cardState.read) return;
    if (provisionalSetup) return;
    const cardProjectId = String(cardState.status?.projectId || cardLink?.readiness?.projectId || '').trim();
    if (!cardProjectId) return;
    // Not "is the id the same" — pairing already copies the id across, so that
    // test skipped every card whose CONTENT Studio was out of step with, which
    // is the whole case adoption exists for. The question is whether Studio
    // holds the card's exact project: same id, same fingerprint, same revision.
    if (cardLifecycle?.exactProject === true) return;
    if (projectLifecycle?.dirty === true) return;
    // And never over work the owner already has open. "Adopt by default" means
    // "do not make me choose when there is nothing to lose" — not "throw away
    // the piece I am in the middle of". Two cases are safe:
    //   • the open project IS this card's project, just out of step — the
    //     common one, and refreshing it from the card is the whole point; or
    //   • the open project is an untouched starter with no design in it.
    const openIsSameProject = cardProjectId === String(currentProject?.id || '').trim();
    const openIsUntouched = currentProject?.layout?.starterPending !== false
      && !(currentProject?.layout?.strips || []).length;
    if (!openIsSameProject && !openIsUntouched) return;
    // Keyed on the CARD and the project it holds — never on the Studio project
    // generation, which adoption itself bumps. Including it made every adoption
    // mint a new key, so the effect adopted again, forever, and hung the page.
    const attempt = `${cardLink?.card?.id || ''}:${cardProjectId}`;
    if (autoAdoptedRef.current === attempt) return;
    autoAdoptedRef.current = attempt;
    // A DIFFERENT saved project that matches the card: load it.
    if (resolution.kind === 'saved-match' && resolution?.resolved && cardActions?.adoptCardProject) {
      void loadResolvedProject();
      return;
    }
    // Otherwise Studio already has this project by id but not at the card's
    // revision — 'matches-current' with exactProject false — so loading the
    // saved copy would load what is already open and change nothing. Rebuild
    // from the card's own read-back instead. That IS "Use the card's copy".
    void startFromCard();
  }, [
    cardLink?.card?.id,
    cardLink?.readiness?.projectId,
    cardState.read,
    cardState.status,
    cardLifecycle?.exactProject,
    currentProject?.id,
    exactTransport,
    projectLifecycle?.dirty,
    provisionalSetup,
    resolution.kind,
    resolution?.resolved,
  ]);

  // A real "try again" for a blocked or uncertain card operation: re-read the
  // card's evidence and re-resolve it. Reopening the connection center only
  // sent the owner back to this screen.
  const recheckCard = () => setRecheckTick(tick => tick + 1);

  const countEvidence = cardState.status || cardLink?.readiness || {};
  const countPin = setupTypedLedCountPin({
    status: countEvidence,
    project: currentProject,
  });
  const offerTypedCount = setupOffersTypedLedCount({
    status: countEvidence,
    project: currentProject,
  });

  const applyTypedLedCount = async event => {
    event?.preventDefault?.();
    if (ledCountState.busy) return;
    const pixels = Math.trunc(Number(ledCountDraft));
    if (!Number.isSafeInteger(pixels) || pixels < 1) {
      setLedCountState({ busy: false, message: 'Enter how many lights are on this strip.' });
      return;
    }
    const pin = countPin;
    if (pin == null) {
      setLedCountState({ busy: false, message: 'Find the strip output first, then enter the count.' });
      return;
    }
    setLedCountState({ busy: true, message: '' });
    const host = cardLink?.host || cardHost || '';
    const nextStatus = cardState.status
      ? cardStatusWithPixelCount(cardState.status, { pixels, pin })
      : { outputs: [{ pin, pixels, gpio: pin, count: pixels }], led: { pixels } };
    try {
      await applyCardParts(projectSkeletonFromCardStatus(nextStatus), nextStatus);
      if (host) {
        const written = await applyLedCountOnCard({ host, pixels, pin });
        if (!written.applied && written.reason !== 'not-a-length-change' && written.reason !== 'disconnected' && written.reason !== 'unreachable') {
          setLedCountState({
            busy: false,
            message: 'Count saved here. The card could not take that length change.',
          });
          setRecheckTick(tick => tick + 1);
          return;
        }
        if (written.reason === 'disconnected' || written.reason === 'unreachable') {
          setLedCountState({
            busy: false,
            message: 'Count saved here. The card did not take it yet.',
          });
          setRecheckTick(tick => tick + 1);
          return;
        }
        try {
          await recoverCardLights({ patternId: 'warm-white', brightness: 0.55 }, { host });
        } catch {
          setLedCountState({
            busy: false,
            message: `${pixels} lights are set. Recover lights if the strip stays dark.`,
          });
          setRecheckTick(tick => tick + 1);
          return;
        }
      }
      setLedCountDraft('');
      setLedCountState({
        busy: false,
        message: `${pixels} lights are set. Look at the strip — those lights should be on.`,
      });
      setRecheckTick(tick => tick + 1);
    } catch (error) {
      setLedCountState({
        busy: false,
        message: error?.message || 'Studio could not use that count.',
      });
    }
  };

  const ledCountEntry = offerTypedCount ? (
    <form className="lw-setup-led-count" data-testid="setup-led-count-form" onSubmit={applyTypedLedCount}>
      <label>
        LED count
        <input
          data-testid="setup-led-count"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={ledCountDraft}
          placeholder="How many lights"
          aria-label="LED count"
          disabled={ledCountState.busy}
          onChange={event => setLedCountDraft(event.target.value)}
        />
      </label>
      <button type="submit" className="btn primary" disabled={ledCountState.busy}>
        {ledCountState.busy ? 'Saving…' : 'Use this count'}
      </button>
    </form>
  ) : null;

  // Phase 1's primary button DOES THE THING IT IS NAMED AFTER — it looks for
  // the card, on whichever route this page can actually use, and pairs what it
  // finds. It used to open the Connection Center, which asked the owner to
  // describe the LEDs before Studio had tried anything; on a screen already
  // showing the card's address that reads as a button that does nothing.
  // The panel is still the answer once a real attempt has failed, so every
  // failure hands off to it with the reason stated first.
  const findMyCard = async () => {
    if (pairState.busy) return;
    setPairState({ busy: true, message: '' });
    const result = await findAndConnectCard({
      link: cardLink || {},
      onProgress: message => setPairState({ busy: true, message }),
    });
    setPairState({ busy: false, message: result.ok ? '' : result.message });
    if (result.ok) {
      setRecheckTick(tick => tick + 1);
      return;
    }
    onOpenConnectionCenter?.();
  };

  const onImportFile = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAdoptionError('');
    // THE project-file import (lib/projectTransfer.js), through the shell's
    // CardActionsProvider so the association cleanup (browser record, cloud
    // detach, save-block reset) is the app's canonical sequence — identical
    // to the top bar's. A bare render without the provider (test harnesses)
    // still imports, just without the app-level association handles.
    const importFile = cardActions?.importProjectFile
      ? file => cardActions.importProjectFile(file, data => replaceProject?.(data))
      : file => importProjectFromPickedFile(file, { replaceProject: data => replaceProject?.(data) });
    importFile(file)
      .then(replacement => {
        if (!replacement?.ok) reportAdoptionFailure(replacement?.reason);
      })
      .catch(error => reportAdoptionFailure('invalid', error));
    event.target.value = '';
  };

  const evidence = discoveryEvidence(currentProject);
  // One status authority: the lifecycle label (derived locally only when a
  // bare render did not pass the shell's lifecycle down).
  const identityStatus = (cardLifecycle || deriveCardLifecycle({ link: cardLink || {} })).label;
  const firmwareBehind = firmwareStatus?.actionable === true;
  const firmwareCurrent = firmwareStatus?.state === 'current'
    || firmwareStatus?.state === 'development-build';
  const renderActiveTask = phase => {
    if (phase.id === 'connect') {
      const blocker = journey.blockers[0]?.id;
      const taskId = journey.taskId;
      const connectionLabel = taskId === 'pair-card' ? 'Pair this card'
        : taskId === 'reconnect-card' ? 'Reconnect this card'
          : 'Find my card';
      // Every connect-shaped task is answered by looking for the card. There is
      // no state in this family where asking a question first beats trying.
      const canFindInPlace = ['connect-card', 'pair-card', 'reconnect-card'].includes(taskId);
      // The card holds a project Studio has not matched. This is the state the
      // owner was looping in: it used to fall through to a generic "Find my
      // card" that reopened the connection center, whose only exit was back
      // here. It now offers the two things that actually resolve it — adopt
      // what the card holds, or carry on setting up the open project.
      if (taskId === 'load-matching-project') {
        const installedId = cardState.status?.projectId || cardLink?.readiness?.projectId || '';
        return (
          <div className="lw-setup-task" data-testid="setup-active-task">
            <p role="status" data-testid="setup-card-project-note">
              {installedId && installedId === String(currentProject?.id || '').trim()
                ? 'This card holds the same project that is open here, but the wiring has changed in Studio since it was installed. Use the card’s copy, or save this one to the card.'
                : installedId
                  ? 'This card is connected and holds a different project from the one open in Studio.'
                  : 'This exact card is connected, but Studio has not matched the project it holds to the project open here.'}
            </p>
            <div className="lw-setup-banner-actions">
              {/* Load runs the shared adoption machine (cardActions); without
                  the provider fall back to the self-contained adoption. */}
              {resolution.resolved && cardActions?.adoptCardProject ? (
                <button type="button" className="btn primary" data-testid="setup-load-matched" onClick={byOwner(loadResolvedProject)}>
                  {/* Card Home's "Matching card project" panel offers the same
                      adoption, worded "Load <project> — current Studio project".
                      Identical words on two buttons in one view read as two
                      offers and are ambiguous to anyone driving by name. This
                      one says what the sentence above it says. */}
                  Use the card&rsquo;s copy
                </button>
              ) : (
                <button type="button" className="btn primary" data-testid="setup-start-from-card" onClick={byOwner(startFromCard)}>
                  Use this card&rsquo;s project
                </button>
              )}
              <button type="button" className="btn" data-testid="setup-import-project" onClick={() => importRef.current?.click()}>Import project file</button>
              <button type="button" className="btn" data-testid="setup-overwrite-card" onClick={() => go('#screen=card&section=setup&task=install-project')}>Save this project to the card</button>
              <button type="button" className="btn" data-testid="setup-keep-open-project" onClick={() => go('#screen=discovery')}>Keep setting up the open project</button>
            </div>
          </div>
        );
      }
      // A blocked or uncertain operation. Name the blocker and offer a read
      // that can actually clear it, rather than reopening the connection
      // center — which routed straight back to this screen.
      if (taskId === 'recover-operation') {
        return (
          <div className="lw-setup-task" data-testid="setup-active-task">
            <p role="status" data-testid="setup-recover-reason">{recoveryExplanation(cardLifecycle?.reason)}</p>
            <div className="lw-setup-banner-actions">
              <button type="button" className="btn primary" data-testid="setup-recheck-card" onClick={recheckCard}>Read this card again</button>
              <button type="button" className="btn" data-testid="setup-connect-card" onClick={() => onOpenConnectionCenter?.()}>Card connection options</button>
            </div>
          </div>
        );
      }
      return (
        <div className="lw-setup-task" data-testid="setup-active-task">
          {blocker === 'firmware' && <p role="status">This exact card needs Lightweaver firmware before setup can continue.</p>}
          {blocker === 'wifi' && <p role="status">The exact card is on its setup network. Finish Wi-Fi, then return here.</p>}
          {taskId === 'update-firmware' ? (
            <button type="button" className="btn primary" onClick={() => go('#screen=card&section=install')}>Install or update firmware</button>
          ) : taskId === 'install-project' ? null : taskId === 'configure-wifi' ? (
            // The one entry contract decides where Wi-Fi continues: Install's
            // commissioning panel while a stage is resumable, otherwise the
            // Connect panel's setup-network join steps (phase 6). This screen
            // already tracks the live commissioning flow, so it passes what it
            // knows instead of having openCardFlow re-read storage.
            <button
              type="button"
              className="btn primary"
              onClick={() => openCardFlow('configure-wifi', {
                lifecycle: cardLifecycle,
                journey,
                resumableCommissioning: hasResumableCommissioning(commissioningFlow),
              })}
            >Continue Wi-Fi setup</button>
          ) : (
            <>
              {canFindInPlace ? (
                <button type="button" className="btn primary" data-testid="setup-connect-card" disabled={pairState.busy} onClick={() => void findMyCard()}>
                  {pairState.busy ? 'Looking…' : connectionLabel}
                </button>
              ) : (
                <button type="button" className="btn primary" data-testid="setup-connect-card" onClick={() => onOpenConnectionCenter?.()}>{connectionLabel}</button>
              )}
              {pairState.message && (
                <p
                  className={pairState.busy ? 'lw-setup-progress' : 'card-connection-failure'}
                  role="status"
                  data-testid="setup-pair-failure"
                >{pairState.message}</p>
              )}
              {/* Search-first already hands off to the panel on failure. A
                  second "Card connection options" button on the same task
                  was another connect door beside Find / Pair / Reconnect. */}
              {!canFindInPlace && (
                <button type="button" className="btn" data-testid="setup-connect-manual" onClick={() => onOpenConnectionCenter?.()}>Card connection options</button>
              )}
            </>
          )}
        </div>
      );
    }
    if (phase.id === 'lights') {
      return (
        <div className="lw-setup-task" data-testid="setup-active-task">
          <p>Find every light output, establish color before counting, and confirm the final light with the next position dark.</p>
          <ul className="lw-setup-subprogress" aria-label="Light discovery progress">
            {phase.progress.map(item => <li key={item.id} data-status={item.status}>{item.status === 'done' ? '✓' : '·'} {item.id === 'color' ? 'Color order' : item.id === 'count' ? 'Light count' : item.id === 'boundary' ? 'Final and next-dark boundary' : 'Output'}</li>)}
          </ul>
          {ledCountEntry}
          {ledCountState.message && (
            <p role="status" data-testid="setup-led-count-status">{ledCountState.message}</p>
          )}
          <button type="button" className={ledCountEntry ? 'btn' : 'btn primary'} data-testid="setup-lights-action" onClick={() => go('#screen=discovery')}>
            {evidence.count > 0 && !evidence.outputs.every(output => isUncountedHeadroomCount(output.pixelCount))
              ? 'Review the connected lights'
              : ledCountEntry
                ? 'Find the lights'
                : 'Find and count the lights'}
          </button>
        </div>
      );
    }
    if (phase.id === 'layout') {
      const placementDone = phase.progress.some(item => item.id === 'placement' && item.status === 'done');
      return (
        <div className="lw-setup-task" data-testid="setup-active-task">
          <p>Place the discovered outputs in the artwork, then confirm their physical direction in Layout.</p>
          {evidence.count > 0 && !evidence.outputs.every(output => isUncountedHeadroomCount(output.pixelCount)) && (
            <p data-testid="setup-counted-lights">
              {evidence.count} LED{evidence.count === 1 ? '' : 's'} counted
              {evidence.outputs.length === 1 ? ` on GPIO ${evidence.outputs[0].pin}` : ` across ${evidence.outputs.length} outputs`}
              . Look at the strip — those lights should be on.
            </p>
          )}
          {ledCountEntry}
          {ledCountState.message && (
            <p role="status" data-testid="setup-led-count-status">{ledCountState.message}</p>
          )}
          <ul className="lw-setup-subprogress" aria-label="Artwork placement progress">
            {phase.progress.map(item => <li key={item.id} data-status={item.status}>{item.status === 'done' ? '✓' : '·'} {item.id === 'placement' ? 'Artwork placement' : 'Light direction'}</li>)}
          </ul>
          <button
            type="button"
            className="btn primary"
            data-testid="setup-layout-action"
            onClick={() => go(placementDone ? '#screen=card&section=setup&task=install-project' : '#screen=layout&mode=draw')}
          >
            {placementDone ? 'Verify light direction' : 'Place lights in the artwork'}
          </button>
        </div>
      );
    }
    return (
      <div className="lw-setup-task" data-testid="setup-active-task">
        <dl className="lw-setup-summary">
          <div><dt>Card</dt><dd>{exactCardName(cardLink, cardHost)}</dd></div>
          <div><dt>Project</dt><dd>{currentProject?.name || currentProject?.id || 'Untitled project'}</dd></div>
          <div><dt>Outputs</dt><dd>{evidence.outputs.length || 'None'}</dd></div>
          <div><dt>Lights</dt><dd>{evidence.count || 'None counted'}</dd></div>
          <div><dt>Color</dt><dd>{evidence.colorOrder || 'Not confirmed'}</dd></div>
          <div><dt>Power</dt><dd>{currentProject?.devices?.standaloneController?.power?.maxMilliamps ? `${currentProject.devices.standaloneController.power.maxMilliamps} mA limit` : 'Review in Hardware settings'}</dd></div>
        </dl>
        {/* The last step, in the owner's words. It used to read "The existing
            Test & Install surface sends the candidate, verifies exact readback,
            and waits for your explicit visible confirmation" — four pieces of
            developer vocabulary on the one screen where a visual artist most
            needs to know what is about to happen to their piece. */}
        <p>This sends your project to the card, reads it back to check it arrived exactly, then lights the strip so you can confirm with your own eyes before it becomes permanent.</p>
        <button type="button" className="btn primary" data-testid="setup-verify-action" onClick={() => go('#screen=card&section=setup&task=install-project')}>Test and save to card</button>
      </div>
    );
  };

  return (
    <>
      {!journey.setupComplete && !exactTransport && (
        <div className="lw-setup-lede">
          <p className="lw-setup-intro">Connect to the card, then Studio resumes whatever is still unfinished — lights, layout, or saving. You can open Patterns as soon as the card answers.</p>
        </div>
      )}

      <section className="lw-setup-identity" data-testid="setup-identity-row" aria-label="Current card and project" aria-live="polite">
        <div><span>Card</span><strong>{exactCardName(cardLink, cardHost)}</strong></div>
        <div><span>Connection</span><strong>{identityStatus}</strong></div>
        <div><span>Project</span><strong>{currentProject?.name || currentProject?.id || 'Untitled project'}</strong></div>
        <div><span>Installed</span><strong>{installRelationship(resolution, cardState.status?.projectId || cardLink?.readiness?.projectId || '', installationMatch, currentProject?.id, provisionalSetup, cardLifecycle?.exactProject === true)}</strong></div>
      </section>

      <div className="card-status-area" data-testid="setup-card-status" aria-live="polite">
        {adoptionError && (
          <p className="lw-setup-error" role="alert" data-testid="setup-adoption-error">{adoptionError}</p>
        )}
        {resolution.kind === 'bench' && (
          <section className="card-support-panel lw-setup-banner">
            <h2>Temporary light setup detected</h2>
            <p>This is discovery evidence, not a finished installation. Continue through artwork placement and the visible final test.</p>
          </section>
        )}
        {/* "Already set up" is a claim about a FINISHED installation, so it
            stands down while the card is still holding the temporary
            light-finding setup. It used to print directly above the
            "discovery evidence, not a finished installation" banner and an
            unfinished phase ladder — three verdicts, one screen. */}
        {/* And not before the card is actually paired. This banner offers
            "Open Patterns" — a live card action — while phase 1 was still
            asking the owner to pair, so the screen carried two headline
            buttons and two different accounts of where the owner was. */}
        {matchesOpenProject && !provisionalSetup && exactTransport && (
          <section className="card-support-panel lw-setup-banner" data-testid="setup-card-ready">
            <h2>
              {firmwareBehind
                ? 'This exact card is already set up'
                : firmwareCurrent
                  ? 'Your card is up to date and currently connected'
                  : 'Your card is currently connected'}
            </h2>
            <p>
              {firmwareBehind
                ? 'Its installed project matches the project open in Studio. Update the card software before relying on it.'
                : firmwareCurrent
                  ? 'Studio is talking to this card and it is running the current Lightweaver software.'
                  : 'Studio is talking to this card. Layout and the rest of Studio are ready when you are.'}
            </p>
            <div className="lw-setup-banner-actions">
              <button type="button" className="btn primary" data-testid="setup-open-patterns" onClick={() => go('#screen=pattern')}>Open Patterns</button>
              <button type="button" className="btn" data-testid="setup-open-layout" onClick={() => go('#screen=layout&mode=draw')}>Open Layout</button>
              {firmwareBehind && (
                <button type="button" className="btn" data-testid="setup-update-card" onClick={() => go('#screen=card&section=install')}>Update card</button>
              )}
            </div>
          </section>
        )}
        {savedMatchLoadOffer && (
          <section className="card-support-panel lw-setup-banner">
            <h2>A saved project matches this exact card</h2>
            <p>Load the matching project instead of replaying blank-card setup.</p>
            <button type="button" className="btn primary" data-testid="setup-load-matched" onClick={byOwner(loadResolvedProject)}>
              {resolution.resolved ? `Load ${describeResolvedCardProject(resolution.resolved)}` : 'Load matching project'}
            </button>
          </section>
        )}
        {/* The connect phase renders these same two actions when its active
            task IS the unresolved card project, so the banner stands down
            rather than showing a second copy of them. */}
        {resolution.kind === 'none' && !installationMatch && cardState.read && cardState.status?.projectId && journey.taskId !== 'load-matching-project' && (
          <section className="card-support-panel lw-setup-banner">
            <h2>Resolve this card&rsquo;s project</h2>
            <div className="lw-setup-banner-actions">
              <button type="button" className="btn" data-testid="setup-import-project" onClick={() => importRef.current?.click()}>Import project file</button>
              <button type="button" className="btn" data-testid="setup-start-from-card" onClick={byOwner(startFromCard)}>Use this card&rsquo;s project</button>
              <button type="button" className="btn" data-testid="setup-overwrite-card" onClick={() => go('#screen=card&section=setup&task=install-project')}>Save this project to the card</button>
            </div>
          </section>
        )}
      </div>

      <section className="lw-setup-phases" aria-label="Setup outcomes">
        <p className="lw-setup-progress" data-testid="setup-progress">
          {journey.setupComplete ? 'Setup complete' : `Phase ${journey.phases.findIndex(phase => phase.id === journey.currentPhaseId) + 1} of 4`}
        </p>
        {!journey.setupComplete && (
          <ol className="lw-setup-phase-list">
            {journey.phases.map((phase, index) => {
              const active = phase.id === journey.currentPhaseId;
              return (
                <li
                  key={phase.id}
                  className={`lw-setup-phase is-${phase.status}${active ? ' is-active' : ''}`}
                  data-testid={`setup-phase-${phase.id}`}
                  data-phase-id={phase.id}
                  data-status={phase.status}
                  aria-current={active ? 'step' : undefined}
                >
                  <div className="lw-setup-phase-head">
                    <span className="lw-setup-phase-marker" aria-hidden="true">{phase.status === 'done' ? '✓' : index + 1}</span>
                    <div>
                      <h2 tabIndex={-1}>{phase.title}</h2>
                      {!active && <p>{phase.detail}</p>}
                    </div>
                  </div>
                  {active && renderActiveTask(phase)}
                </li>
              );
            })}
          </ol>
        )}
        {exactTransport && !journey.setupComplete && journey.currentPhaseId !== 'connect' && (
          <p className="lw-setup-run-anyway">
            <button type="button" className="btn" data-testid="setup-run-patterns" onClick={() => go('#screen=pattern')}>
              Open Patterns
            </button>
          </p>
        )}
      </section>

      <input ref={importRef} className="lw-setup-import" type="file" accept={PROJECT_IMPORT_ACCEPT} hidden data-testid="setup-import-input" onChange={onImportFile} />
    </>
  );
}
