/* Light Weaver v3 — Playlist screen */
/* Exact mockup file. The component BODY (JSX, class names, layout) is
   unchanged from the design source; only the data + handlers were swapped
   from the SAMPLE arrays to the live app's real playlist, real pattern bank,
   and real card handlers. No visual structure was altered. */
import React, { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { I, LedRow } from './lw-shared.jsx';
import { SetupJourneyChip } from '../components/SetupJourneyChip.jsx';
import { openLocalCardPage } from '../lib/cardBridge.js';
import { deriveCardAccess } from '../lib/cardAccess.js';
import { openCardFlow } from '../lib/cardFlowEntry.js';
import { useProject } from '../state/ProjectContext.jsx';
import { REAL_PATTERN_BY_ID, adaptPattern, adaptSavedLook } from './v3-data.js';
import { getCardPatternById } from '../lib/cardPatternBank.js';
import { DEFAULT_CARD_PATTERN_BANK } from '../lib/cardRuntimeContract.js';
import { CardPushError, cardStorageJson, readCardProjectEvidence } from '../lib/cardPushClient.js';
import { prepareCardStoragePayload } from '../lib/cardStoragePayload.js';
import { prepareCardDeployment, waitForCardDeploymentVerification } from '../lib/cardDeployment.js';
import { normalizePatchBoard } from '../lib/patchBoard.js';
import { evaluateCardInstallGate, readCardCommissioningVerification } from '../lib/cardInstallGate.js';
import { normalizeSavedLooks } from '../lib/sectionLookModel.js';
import { addProjectStacksToPlaylist, getProjectStackCompatibility, getProjectStackReview, summarizeProjectStack } from '../lib/projectStacks.js';
import { getCardWiringStatus } from '../lib/cardWiringSafety.js';
import { normalizeCardVisualLook } from '../lib/cardVisualLook.js';
import {
  applyTestStripToRuntimePackage,
  captureTestStripCandidate,
  readTestStrip,
  runtimePackageForCardOperation,
  TEST_STRIP_ZONE_ID,
} from '../lib/testStrip.js';
import {
  buildPatternPlaylistPreview,
  buildSavedLookPlaylistPreviewTargets,
} from '../lib/playlistLivePreview.js';
import {
  CARD_PLAYLIST_ENTRY_LIMIT,
  CARD_PLAYLIST_LIMIT,
  derivePlaylistLookIds,
  isImplicitDefaultPatternPlaylist,
  makePatternPlaylistItem,
  makeSequencePlaylistItem,
  normalizeCardPlaylist,
  normalizePlaylistTiming,
  playlistContainsCombo,
  playlistContainsPattern,
  playlistContainsSequence,
} from '../lib/cardPlaylist.js';
import { currentInstallation } from '../lib/projectLifecycle.js';
import {
  cardHostToUrl,
  readStoredCardHost,
  writeStoredCardHost,
} from '../lib/cardConnection.js';
import {
  ensureCardSectionsForPreview,
  syncRuntimePackageToCard,
} from '../lib/cardSectionSync.js';
import {
  decideLiveControlProjectAuthority,
  postPlaylistControlToCard,
  pushLivePreviewToCard,
  pushSectionPreviewToCard,
  resetLiveOutputOnCard,
} from '../lib/cardLiveControl.js';
import { recoverCardLightsVerified } from '../lib/cardRecoverLights.js';
import {
  makePlaylistPushErrorState,
  makePlaylistPushPendingState,
  makePlaylistPushSuccessState,
} from '../lib/studioActionStatus.js';
import {
  cardActionReducer,
  cardActionStatusLabel,
  classifyCardActionFailure,
  createCardActionState,
} from '../lib/cardAction.js';
import { dismissNoticeKey, publishNotice } from '../lib/noticeLayer.js';
import {
  formatPlaylistLengthMinutes,
  parsePlaylistLengthMinutes,
} from '../lib/playlistDuration.js';
import '../styles/project-stacks-playlist.css';

function readPlaylistSource(projectId, hasStacks) {
  try {
    const saved = window.localStorage.getItem(`lw_playlist_source_${projectId}`);
    if (saved === 'patterns' || saved === 'stacks') return saved;
  } catch { /* Browsing remains available without local storage. */ }
  return hasStacks ? 'stacks' : 'patterns';
}

function stackNeedsSectionReview(look, targets) {
  const review = getProjectStackReview(look, targets);
  return review.removedSectionIds.length > 0 || (look?.sectionSnapshotVersion === 1 && review.needsReview);
}

function sectionIsOff(section) {
  return !section?.patternId || section.patternId === 'blackout' || section.patternId === 'off'
    || Number(section.look?.brightness) === 0;
}

function sectionPatternLabel(section) {
  return sectionIsOff(section) ? 'Off' : realPatternShape(section.patternId).label;
}

function StackAssignments({ summary }) {
  return <ul className="pl-stack-assignment-list">
    {summary.sections.map(section => <li key={section.id}>
      <span>{section.label}</span>
      <span>{sectionPatternLabel(section)}</span>
    </li>)}
  </ul>;
}

function StackArtwork({ summary }) {
  return <span className="pl-art pl-art-combo" aria-label={`${summary.sectionCount} section preview`}>
    {summary.sections.map(section => <span key={section.id} className="pl-art-slice" title={`${section.label}: ${sectionPatternLabel(section)}`}
      style={{ background: sectionIsOff(section) ? '#171b21' : realPatternShape(section.patternId).grad }} />)}
  </span>;
}

function omitKey(source, key) {
  const next = { ...source };
  delete next[key];
  return next;
}

function downloadJson(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Test strip mode: the bench strip's output layout basically never matches
// whatever the card is already carrying (the real design, or a different
// bench length), so every live preview reshapes the card to the collapsed
// single zone first — with the wiring/project guard deliberately overridden,
// since the user is intentionally testing on a different physical strip.
// Cheap no-op when the card already has that zone (ensureCardSectionsForPreview
// only pushes when it's missing).
async function ensureTestStripLayoutOnCard(host, runtimePackage, length, transport) {
  const testPackage = applyTestStripToRuntimePackage(runtimePackage, length);
  const before = await getCardWiringStatus({ host, transport }).catch(() => null);
  try {
    await ensureCardSectionsForPreview({
      host,
      transport,
      requiredZoneIds: [TEST_STRIP_ZONE_ID],
      runtimePackage: testPackage,
      allowLayoutChange: true,
      allowProjectChange: true,
    });
  } catch (error) {
    if (before) {
      await captureTestStripCandidate({
        host,
        transport,
        previousActivationId: before.activationId,
      }).catch(() => {});
    }
    throw error;
  }
  return testPackage;
}

// Adapt one real pattern id into the mockup pattern shape ({id,label,grad,...}).
// The .pl-art box in the exact JSX paints a single gradient, so we hand it grad.
function realPatternShape(patternId) {
  return REAL_PATTERN_BY_ID.get(patternId) || adaptPattern(patternId);
}

  function PlaylistScreen({ connected, cardLink, cardLifecycle, currentProject, go }) {
    const {
      projectId,
      projectName,
      strips,
      patchBoard,
      wiring,
      compiledWiring,
      layoutLayerGroups,
      sectionFamilies,
      palette,
      hidden,
      bpm,
      gammaEnabled,
      gammaValue,
      symSettings,
      sectionTargets,
      standaloneController,
      setStandaloneController,
      flushProjectAutosave,
      markCardLookConfirmed,
      markProjectInstalled,
      projectLifecycle,
    } = useProject();

    const [host, setHost] = useState(readStoredCardHost);
    // Tracks the row last pushed live so the mockup's .is-live highlight stays
    // faithful. The real engine still pushes the preview to the card.
    const [live, setLive] = useState(null);
    const [handoffUrl, setHandoffUrl] = useState('');
    const [playlistStatus, setPlaylistStatus] = useState(null);
    const [previewAction, dispatchPreviewAction] = useReducer(cardActionReducer, undefined, createCardActionState);
    const [playlistSyncing, setPlaylistSyncing] = useState(false);
    const [recoveryPending, setRecoveryPending] = useState(false);
    const recoveryPendingRef = useRef(false);
    const recoveryOperationGeneration = useRef(0);
    const previewSequence = React.useRef(0);
    const cardActionGeneration = useRef(0);
    const playlistRevision = useRef(0);
    const playlistSavePending = useRef(false);
    const [playlistSaveStatus, setPlaylistSaveStatus] = useState('');
    const latestLiveItem = useRef(null);
    const [drag, setDrag] = useState({ from: null, over: null });
    const [reorderAnnouncement, setReorderAnnouncement] = useState('');
    const [lengthDrafts, setLengthDrafts] = useState({});
    const [openRowMenuId, setOpenRowMenuId] = useState(null);
    const reorderHandleRefs = useRef(new Map());
    const rowMenuTriggerRefs = useRef(new Map());
    const playlistOrderRef = useRef(null);
    const sourcePickerRef = useRef(null);
    const pendingReorderFocus = useRef(null);
    const pointerDrag = useRef(null);

    const board = useMemo(() => normalizePatchBoard(patchBoard, strips), [patchBoard, strips]);
    const savedLooks = normalizeSavedLooks(standaloneController?.looks);
    const savedLookById = new Map(savedLooks.map((look) => [look.id, look]));
    const [sourceChoice, setSourceChoice] = useState(() => readPlaylistSource(projectId, savedLooks.length > 0));
    const [selectedStackIds, setSelectedStackIds] = useState([]);
    const [expandedStackIds, setExpandedStackIds] = useState([]);
    const [stackFeedback, setStackFeedback] = useState('');
    const [repeatFeedback, setRepeatFeedback] = useState('');
    React.useEffect(() => {
      setSourceChoice(readPlaylistSource(projectId, savedLooks.length > 0));
      setSelectedStackIds([]);
      setExpandedStackIds([]);
      setStackFeedback('');
      setRepeatFeedback('');
    }, [projectId]);
    const chooseSource = (source) => {
      setSourceChoice(source);
      try { window.localStorage.setItem(`lw_playlist_source_${projectId}`, source); } catch { /* Session-only choice. */ }
    };
    const toggleStackSelection = (id) => setSelectedStackIds(current => current.includes(id)
      ? current.filter(candidate => candidate !== id) : [...current, id]);
    const toggleStackDetails = (id) => setExpandedStackIds(current => current.includes(id)
      ? current.filter(candidate => candidate !== id) : [...current, id]);
    const stackSummaries = new Map(savedLooks.map(look => [look.id, summarizeProjectStack(look, sectionTargets)]));
    const sequenceAssets = (standaloneController?.sequenceAssets || []).filter(asset =>
      asset?.mediaRef?.kind === 'indexeddb-sha256'
      && asset.mediaRef.sha256 === asset?.manifest?.lwseqSha256);
    const sequenceAssetById = new Map(sequenceAssets.map(asset => [asset.id, asset]));

    const rawPlaylist = isImplicitDefaultPatternPlaylist(standaloneController?.playlist)
      ? []
      : standaloneController?.playlist;
    const playlist = normalizeCardPlaylist(rawPlaylist, { savedLooks, sequenceAssets, allowEmpty: true });
    const selectedStacksInLibraryOrder = savedLooks.filter(look => selectedStackIds.includes(look.id));
    const stackPlaylistPositions = new Map();
    playlist.forEach((item, index) => {
      if (item.type !== 'combo') return;
      const positions = stackPlaylistPositions.get(item.lookId) || [];
      positions.push(index + 1);
      stackPlaylistPositions.set(item.lookId, positions);
    });
    // The playlist-wide "played on the card" settings — fade between looks,
    // and whether the card auto-plays it — live at controls.playlist (see
    // cardPlaylist.js's normalizePlaylistTiming doc comment for why they are
    // stored there rather than as a bare standaloneController field).
    const playlistTiming = normalizePlaylistTiming(standaloneController?.controls?.playlist);
    const enabledPlaylistCount = playlist.filter((item) => item.enabled !== false).length;
    const playlistOverflow = Math.max(0, enabledPlaylistCount - CARD_PLAYLIST_ENTRY_LIMIT);
    const [playlistControlPending, setPlaylistControlPending] = useState(false);
    const [playlistControlError, setPlaylistControlError] = useState('');

    const runtimeBuild = useMemo(() => {
      try {
        return {
          prepared: prepareCardDeployment({
            projectId,
            projectName,
            projectRevision: projectLifecycle.editedRevision,
            strips,
            patchBoard: board,
            compiledWiring,
            standaloneController,
          }),
          error: null,
        };
      } catch (error) {
        return { runtimePackage: null, error };
      }
    }, [projectId, projectName, projectLifecycle.editedRevision, strips, board, compiledWiring, standaloneController]);
    const runtimePackage = runtimeBuild.prepared?.runtimePackage || null;
    const hardwareConfigurationIssue = runtimeBuild.error
      ? String(runtimeBuild.error.message || runtimeBuild.error).replace('is already owned by an LED output or another control', 'is already used by an LED output or another control')
      : '';
    const requireRuntimePackage = () => {
      if (!runtimePackage) throw runtimeBuild.error;
      return runtimePackage;
    };
    const requireLiveControlAuthority = (patternId = '') => {
      const authority = decideLiveControlProjectAuthority({
        connected: connected || cardLink?.readiness?.playbackReady === true,
        studioProject: requireRuntimePackage(),
        cardStatus: cardLink?.readiness || {},
        patternId,
      });
      if (!authority.ok) {
        const error = new CardPushError(authority.reason || authority.state, authority.message);
        error.liveControlAuthority = true;
        throw error;
      }
      return authority;
    };
    const classifyPlaylistControlFailure = (error) => error?.liveControlAuthority
      ? { code: error.reason, message: error.message }
      : classifyCardActionFailure(error);
    const safeProjectName = (projectName || 'lightweaver-piece').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

    // ── live playlist write-back to the standalone controller ─────────────
    const writePlaylist = (nextItems) => {
      const normalized = normalizeCardPlaylist(nextItems, { savedLooks, sequenceAssets, allowEmpty: true });
      playlistRevision.current += 1;
      if (!recoveryPendingRef.current) {
        cardActionGeneration.current += 1;
        previewSequence.current += 1;
        setPlaylistSyncing(false);
        setPlaylistStatus(null);
      }
      const result = setStandaloneController((prev) => {
        const current = prev || {};
        return {
          ...current,
          playlist: normalized,
          controls: {
            ...(current.controls || {}),
            encoder: {
              ...(current.controls?.encoder || {}),
              patternCycleIds: derivePlaylistLookIds(normalized),
            },
          },
        };
      });
      if (result?.ok === false) return false;
      playlistSavePending.current = true;
      setPlaylistSaveStatus('Saving playlist in this browser…');
      return true;
    };

    React.useEffect(() => {
      if (!playlistSavePending.current) return;
      playlistSavePending.current = false;
      const saved = flushProjectAutosave();
      setPlaylistSaveStatus(saved ? 'Playlist saved in this browser.' : 'Playlist could not be saved in this browser. Try again.');
    }, [playlist, flushProjectAutosave]);

    const moveTo = (fromIndex, toIndex) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= playlist.length || toIndex >= playlist.length) return;
      const next = [...playlist];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      writePlaylist(next);
    };

    // ── timed playlist: dwell (per row) + fade/enabled (playlist-wide) ────
    // Changing any of the three marks the project edited the same way
    // reordering does today — all three go through setStandaloneController,
    // which is what the project's dirty-tracking watches (ProjectContext.jsx
    // serializes the whole standaloneController on every change).
    const setItemDwellSeconds = (itemId, rawValue) => {
      const next = playlist.map((item) => (
        item.id === itemId ? { ...item, dwellSeconds: rawValue } : item
      ));
      writePlaylist(next);
    };

    const setItemLengthDraft = (itemId, value) => {
      setLengthDrafts((current) => ({ ...current, [itemId]: value }));
    };

    const resetItemLengthDraft = (itemId) => {
      setLengthDrafts((current) => omitKey(current, itemId));
    };

    const commitItemLengthMinutes = (itemId, rawMinutes) => {
      const parsed = parsePlaylistLengthMinutes(rawMinutes);
      if (parsed.ok) setItemDwellSeconds(itemId, parsed.seconds);
      resetItemLengthDraft(itemId);
    };

    const closeRowMenu = (restoreFocus = true) => {
      const itemId = openRowMenuId;
      setOpenRowMenuId(null);
      if (restoreFocus && itemId) {
        window.requestAnimationFrame(() => rowMenuTriggerRefs.current.get(itemId)?.focus());
      }
    };

    React.useEffect(() => {
      if (!openRowMenuId) return undefined;
      const closeOnEscape = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeRowMenu(true);
      };
      window.addEventListener('keydown', closeOnEscape);
      return () => window.removeEventListener('keydown', closeOnEscape);
    }, [openRowMenuId]);

    const setPlaylistTiming = (patch) => {
      setStandaloneController((prev) => {
        const current = prev || {};
        return {
          ...current,
          controls: {
            ...(current.controls || {}),
            playlist: normalizePlaylistTiming({ ...playlistTiming, ...patch }),
          },
        };
      });
    };
    const setPlaylistFadeSeconds = (rawSeconds) => setPlaylistTiming({ fadeMs: Math.round(Number(rawSeconds) * 1000) });
    const setPlaylistEnabled = (nextEnabled) => setPlaylistTiming({ enabled: nextEnabled === true });

    React.useEffect(() => {
      const itemId = pendingReorderFocus.current;
      if (!itemId) return;
      const handle = reorderHandleRefs.current.get(itemId);
      if (!handle) return;
      handle.focus();
      pendingReorderFocus.current = null;
    }, [playlist]);

    const reorderWithKeyboard = (event, item, fromIndex) => {
      let toIndex;
      switch (event.key) {
        case 'ArrowUp': toIndex = fromIndex - 1; break;
        case 'ArrowDown': toIndex = fromIndex + 1; break;
        case 'Home': toIndex = 0; break;
        case 'End': toIndex = playlist.length - 1; break;
        default: return;
      }
      event.preventDefault();
      if (toIndex < 0 || toIndex >= playlist.length || toIndex === fromIndex) return;
      pendingReorderFocus.current = item.id;
      setReorderAnnouncement(`${item.label} moved to position ${toIndex + 1} of ${playlist.length}`);
      moveTo(fromIndex, toIndex);
    };

    const dup = (i) => {
      const item = playlist[i];
      if (!item) return;
      if (playlist.length >= CARD_PLAYLIST_LIMIT) {
        setRepeatFeedback(`Playlist full: ${CARD_PLAYLIST_LIMIT} manual entries is the limit. Nothing was repeated.`);
        return;
      }
      if (playlistTiming.enabled && item.enabled !== false && enabledPlaylistCount >= CARD_PLAYLIST_ENTRY_LIMIT) {
        setRepeatFeedback(`Playlist full: ${CARD_PLAYLIST_ENTRY_LIMIT} timed entries is the limit. Nothing was repeated.`);
        return;
      }
      const clone = { ...item, id: `${item.id}-copy-${Date.now()}`, createdAt: Date.now() };
      const next = [...playlist];
      next.splice(i + 1, 0, clone);
      if (writePlaylist(next)) setRepeatFeedback('');
    };

    const remove = (i) => writePlaylist(playlist.filter((_, k) => k !== i));

    // ── live preview / card control ───────────────────────────────────────
    const previewPatternOnCard = async (patternId) => {
      if (recoveryPendingRef.current) return false;
      const sequence = ++previewSequence.current;
      const actionGeneration = ++cardActionGeneration.current;
      setPlaylistSyncing(false);
      dispatchPreviewAction({ type: 'start', revision: sequence });
      setHandoffUrl('');
      setPlaylistStatus(null);
      try {
        requireLiveControlAuthority(patternId);
        const testStrip = readTestStrip();
        if (testStrip.enabled) {
          await ensureTestStripLayoutOnCard(host, requireRuntimePackage(), testStrip.length, cardLink?.transport);
          if (sequence !== previewSequence.current || actionGeneration !== cardActionGeneration.current) return;
        }
        const confirmedLook = buildPatternPlaylistPreview(patternId);
        await pushLivePreviewToCard(confirmedLook, { host, transport: cardLink?.transport, preferBridge: cardLink?.transport === 'bridge', timeoutMs: 2200, revision: sequence });
        if (sequence === previewSequence.current && actionGeneration === cardActionGeneration.current) {
          dispatchPreviewAction({ type: 'confirm', revision: sequence });
          markCardLookConfirmed(confirmedLook);
          setPlaylistStatus(null);
          return true;
        }
      } catch (error) {
        if (sequence !== previewSequence.current || actionGeneration !== cardActionGeneration.current || error?.reason === 'superseded') return false;
        const failure = classifyPlaylistControlFailure(error);
        dispatchPreviewAction({ type: 'fail', revision: sequence, error: failure.message });
        setPlaylistStatus({ kind: 'err', message: failure.message, physicalPreview: true, failure });
      }
      return false;
    };

    const previewSavedLookOnCard = async (savedLook) => {
      if (!savedLook || recoveryPendingRef.current) return false;
      const sequence = ++previewSequence.current;
      const actionGeneration = ++cardActionGeneration.current;
      setPlaylistSyncing(false);
      dispatchPreviewAction({ type: 'start', revision: sequence });
      setHandoffUrl('');
      setPlaylistStatus(null);
      try {
        requireLiveControlAuthority(savedLook.defaultLook?.patternId || savedLook.preset || '');
        const testStrip = readTestStrip();
        if (testStrip.enabled) {
          // A saved mix is normally several section targets across the real
          // design's zones; a bench strip is one zone, so just play the
          // mix's own default look across the whole (collapsed) strip.
          await ensureTestStripLayoutOnCard(host, requireRuntimePackage(), testStrip.length, cardLink?.transport);
          if (sequence !== previewSequence.current || actionGeneration !== cardActionGeneration.current) return;
          const confirmedLook = { ...normalizeCardVisualLook(savedLook.defaultLook || {}), syncZones: true };
          await pushLivePreviewToCard(
            confirmedLook,
            { host, transport: cardLink?.transport, preferBridge: cardLink?.transport === 'bridge', timeoutMs: 2600, revision: sequence },
          );
          if (sequence === previewSequence.current && actionGeneration === cardActionGeneration.current) {
            dispatchPreviewAction({ type: 'confirm', revision: sequence });
            markCardLookConfirmed(confirmedLook);
            setPlaylistStatus(null);
            return true;
          }
          return false;
        }
        const targets = buildSavedLookPlaylistPreviewTargets({ savedLook, strips, patchBoard: board, wiring, compiledWiring });
        const requiredZoneIds = targets
          .filter(target => target.kind === 'section')
          .map(target => String(target.zoneId || target.id || ''))
          .filter(Boolean);
        await ensureCardSectionsForPreview({
          host,
          transport: cardLink?.transport,
          requiredZoneIds,
          runtimePackage: requireRuntimePackage(),
        });
        if (sequence !== previewSequence.current || actionGeneration !== cardActionGeneration.current) return;
        await pushSectionPreviewToCard(
          targets,
          { host, transport: cardLink?.transport, preferBridge: cardLink?.transport === 'bridge', timeoutMs: 2600, revision: sequence },
        );
        if (sequence === previewSequence.current && actionGeneration === cardActionGeneration.current) {
          dispatchPreviewAction({ type: 'confirm', revision: sequence });
          markCardLookConfirmed(normalizeCardVisualLook(savedLook.defaultLook || {}));
          setPlaylistStatus(null);
          return true;
        }
      } catch (error) {
        if (sequence !== previewSequence.current || actionGeneration !== cardActionGeneration.current || error?.reason === 'superseded') return;
        const failure = classifyPlaylistControlFailure(error);
        dispatchPreviewAction({ type: 'fail', revision: sequence, error: failure.message });
        setPlaylistStatus({ kind: 'err', message: failure.message, physicalPreview: true, failure });
      }
      return false;
    };

    const setLiveItem = async (item) => {
      if (!item || item.type === 'sequence' || recoveryPendingRef.current) return;
      latestLiveItem.current = item;
      const confirmed = item.type === 'combo'
        ? await previewSavedLookOnCard(savedLookById.get(item.lookId))
        : await previewPatternOnCard(item.patternId);
      if (confirmed) setLive(item.id);
    };

    const retryLatestPreview = () => {
      if (latestLiveItem.current) void setLiveItem(latestLiveItem.current);
    };

    // ── timed playlist transport (play/pause/next/previous on the card) ───
    // The card's own status (polled the same way cardLink already is,
    // upstream of this screen) is the source of truth for what the playlist
    // is doing — this only sends the verb and surfaces a failure.
    const sendPlaylistControl = async (verb) => {
      if (recoveryPendingRef.current || playlistControlPending) return;
      setPlaylistControlPending(true);
      setPlaylistControlError('');
      try {
        await postPlaylistControlToCard(verb, { host, transport: cardLink?.transport });
      } catch (error) {
        setPlaylistControlError(error?.message || 'The card did not confirm the playlist command.');
      } finally {
        setPlaylistControlPending(false);
      }
    };

    const openConnectionCenter = useCallback(() => {
      // Reached only from reconnect failure paths, where the card is not
      // ready — the connect intent opens the Connection Center via the
      // shell's connect-panel event instead of DOM-clicking the footer chip.
      openCardFlow('connect');
    }, []);

    const fallbackLiveLook = () => {
      const firstItem = playlist[0];
      if (firstItem?.type === 'combo') {
        const savedLook = savedLookById.get(firstItem.lookId);
        return savedLook?.defaultLook || standaloneController?.defaultLook || {};
      }
      if (firstItem?.patternId) return buildPatternPlaylistPreview(firstItem.patternId);
      return standaloneController?.defaultLook || {};
    };

    const resetLiveOutput = async () => {
      if (recoveryPendingRef.current) return;
      const actionGeneration = ++cardActionGeneration.current;
      previewSequence.current += 1;
      setPlaylistSyncing(false);
      dispatchPreviewAction({ type: 'reset' });
      setHandoffUrl('');
      setPlaylistStatus({ kind: 'pending', message: 'Resetting live output on card…' });
      try {
        requireLiveControlAuthority();
        const testStrip = readTestStrip();
        if (testStrip.enabled) await ensureTestStripLayoutOnCard(host, requireRuntimePackage(), testStrip.length, cardLink?.transport);
        await resetLiveOutputOnCard(fallbackLiveLook(), {
          host,
          timeoutMs: 3000,
          transport: cardLink?.transport,
          studioProject: runtimePackage,
        });
        if (actionGeneration !== cardActionGeneration.current) return;
        setLive(null);
        setPlaylistStatus({ kind: 'ok', message: 'Live output reset on card.' });
      } catch (error) {
        if (actionGeneration !== cardActionGeneration.current) return;
        const failure = classifyPlaylistControlFailure(error);
        setPlaylistStatus({
          kind: 'err',
          message: failure.message,
          physicalPreview: true,
          resetLive: true,
          failure,
        });
      }
    };

    const recoverPhysicalOutput = async () => {
      if (recoveryPendingRef.current) return;
      const actionGeneration = ++cardActionGeneration.current;
      const recoveryOperation = ++recoveryOperationGeneration.current;
      const recoveryIsCurrent = () => actionGeneration === cardActionGeneration.current;
      previewSequence.current += 1;
      setHandoffUrl('');
      recoveryPendingRef.current = true;
      setRecoveryPending(true);
      try {
        await recoverCardLightsVerified(
          { patternId: 'warm-white', brightness: 1, syncZones: true },
          { host, transport: cardLink?.transport, timeoutMs: 3200, restartCard: true },
        );
        if (!recoveryIsCurrent()) return;
        dispatchPreviewAction({ type: 'reset' });
        setLive(null);
        setPlaylistStatus({
          kind: 'ok',
          message: 'Recovery frame sent. Confirm warm white is visible on the physical lights.',
        });
      } catch (error) {
        if (!recoveryIsCurrent()) return;
        const failure = classifyCardActionFailure(error);
        setPlaylistStatus({
          kind: 'err',
          message: `Light recovery did not complete. ${failure.message}`,
          physicalPreview: true,
          recoveryFailure: true,
          failure,
        });
      } finally {
        if (recoveryOperation === recoveryOperationGeneration.current) {
          recoveryPendingRef.current = false;
          setRecoveryPending(false);
        }
      }
    };

    const previewFailureHandler = (() => {
      switch (playlistStatus?.failure?.actionId) {
        case 'update-card': return () => { window.location.hash = '#screen=flash'; };
        case 'reconnect-card': return openConnectionCenter;
        case 'open-card-page': return () => openLocalCardPage(host);
        case 'retry': return playlistStatus?.recoveryFailure
          ? recoverPhysicalOutput
          : playlistStatus?.resetLive
            ? resetLiveOutput
            : retryLatestPreview;
        case 'recover-lights': return recoverPhysicalOutput;
        default: return null;
      }
    })();

    const loadPlaylistToCard = async ({ allowLayoutChange = false, allowProjectChange = false } = {}) => {
      if (recoveryPendingRef.current) return;
      const actionGeneration = ++cardActionGeneration.current;
      const installRevision = playlistRevision.current;
      const projectGeneration = projectLifecycle.generation;
      const installIsCurrent = () => (
        actionGeneration === cardActionGeneration.current &&
        installRevision === playlistRevision.current
      );
      previewSequence.current += 1;
      setHandoffUrl('');
      setPlaylistStatus(makePlaylistPushPendingState());
      setPlaylistSyncing(true);
      let packageForCard = runtimePackage;
      try {
        const validRuntimePackage = requireRuntimePackage();
        // Loading the playlist is an authoritative Save operation. Test-strip
        // mode is limited to explicit live previews and can never substitute
        // its short wiring package here.
        packageForCard = runtimePackageForCardOperation(validRuntimePackage, { operation: 'save' });
        prepareCardStoragePayload(packageForCard);
        const before = await readCardProjectEvidence({ host, transport: cardLink?.transport });
        const response = await syncRuntimePackageToCard({
          host,
          transport: cardLink?.transport,
          runtimePackage: packageForCard,
          allowLayoutChange,
          allowProjectChange,
          mediaInstall: {
            project: { strips, patchBoard, wiring, compiledWiring, layoutLayerGroups,
              sectionFamilies, palette, hidden, bpm, gammaEnabled, gammaValue, symSettings, sectionTargets },
            confirmPairing: () => window.confirm('Touch a physical control on the Lightweaver card, then choose Continue to save recorded media to this exact card.'),
          },
        });
        if (!installIsCurrent()) return;
        const exactPrepared = { ...runtimeBuild.prepared, cardId: before.cardId };
        const verification = await waitForCardDeploymentVerification(
          exactPrepared,
          { readEvidence: () => readCardProjectEvidence({ host, transport: cardLink?.transport }) },
        );
        markProjectInstalled({
          revision: projectLifecycle.editedRevision,
          generation: projectGeneration,
          cardId: verification.cardId,
          projectRevision: exactPrepared.config.projectRevision,
          projectFingerprint: exactPrepared.config.projectFingerprint,
        });
        setPlaylistStatus(makePlaylistPushSuccessState(response));
      } catch (error) {
        if (!installIsCurrent()) return;
        const nextStatus = makePlaylistPushErrorState(error, { host, runtimePackage: packageForCard });
        setPlaylistStatus({ ...nextStatus, retry: 'playlist' });
        setHandoffUrl(nextStatus.handoffUrl || '');
      } finally {
        if (installIsCurrent()) setPlaylistSyncing(false);
      }
    };

    const copyConfig = async () => {
      try {
        await navigator.clipboard.writeText(cardStorageJson(requireRuntimePackage()));
        setPlaylistStatus(null);
      } catch (error) {
        setPlaylistStatus(makePlaylistPushErrorState(error, { host, runtimePackage }));
      }
    };

    const downloadConfig = () => {
      try {
        downloadJson(
          `${safeProjectName || 'lightweaver'}-playlist-config.json`,
          cardStorageJson(requireRuntimePackage()),
        );
        setPlaylistStatus(null);
      } catch (error) {
        setPlaylistStatus(makePlaylistPushErrorState(error, { host, runtimePackage }));
      }
    };
    // Shared install precondition (src/lib/cardInstallGate.js). The plain
    // install never sets allowLayoutChange, so the card refuses a wiring change
    // on its own and this button only needs the ordinary preconditions. The
    // escalation button below explicitly permits a layout change, which makes
    // it the same dangerous case as the Layout install and therefore subject to
    // the same bench-test + colour-order proof.
    const commissioningVerified = readCardCommissioningVerification({ wiring, standaloneController }).verified;
    const baseInstallFacts = {
      hardwareIssue: hardwareConfigurationIssue,
      busy: playlistSyncing || recoveryPending,
      // Deliberately the COMMAND gate (deriveCardAccess(...).command), not the
      // install verdict. The install upgrade in lib/cardAccess.js exists to
      // undo a 'project' verdict on a card holding Studio's own discovery bench
      // config, and this screen never produces 'project' — a connected card is
      // always 'ready' here. Plumbing card project evidence in to reach an
      // upgrade that can never apply would be dead weight. If this verdict ever
      // grows a 'project' branch it needs the install verdict too (see
      // lw-pattern.jsx).
      cardAccess: deriveCardAccess(cardLink, { connected }).command ? 'ready' : 'recovery',
    };
    const installGate = evaluateCardInstallGate(baseInstallFacts);
    const layoutChangeInstallGate = evaluateCardInstallGate({
      ...baseInstallFacts,
      wiringAffecting: true,
      wiringSendReady: compiledWiring.sendReady,
      commissioningVerified,
    });

    const openCard = () => openLocalCardPage(host);
    const openCardInstaller = () => {
      if (!handoffUrl) return;
      const url = new URL(handoffUrl);
      openLocalCardPage(host, {
        path: `${url.pathname}${url.search}${url.hash}`,
        reason: 'card-installer',
      });
    };
    // "Adjust" on the wiring-mismatch banner: jump straight to the Layout
    // panel that owns the per-strip LED counts, so the user can change the
    // number instead of accepting the card's current wiring. That panel is the
    // internal 'draw' mode — the Wire drawing workspace;
    // the old 'size' mode this used to point at no longer exists, so the link
    // silently fell back to the default mode.
    const adjustLedCounts = () => { window.location.hash = 'screen=layout&mode=draw'; };

    const persistHost = (value) => {
      if (recoveryPendingRef.current) return;
      cardActionGeneration.current += 1;
      previewSequence.current += 1;
      setPlaylistSyncing(false);
      dispatchPreviewAction({ type: 'reset' });
      setLive(null);
      setHandoffUrl('');
      setPlaylistStatus(null);
      setHost(value);
      writeStoredCardHost(value);
    };

    // ── add from the real banks ───────────────────────────────────────────
    const addPattern = (patternId) => {
      if (recoveryPendingRef.current) return;
      if (playlistContainsPattern(playlist, patternId)) { void previewPatternOnCard(patternId); return; }
      const item = makePatternPlaylistItem(patternId);
      if (!item) return;
      writePlaylist([...playlist, item]);
      void previewPatternOnCard(patternId);
    };

    const addCombo = (savedLook) => {
      if (recoveryPendingRef.current || !savedLook) return;
      if (playlistContainsCombo(playlist, savedLook.id)) { void previewSavedLookOnCard(savedLook); return; }
      try {
        if (stackNeedsSectionReview(savedLook, sectionTargets)) {
          throw new Error('Review sections in Patterns before adding this stack.');
        }
        const next = addProjectStacksToPlaylist(standaloneController, [savedLook.id]);
        if (!writePlaylist(next.playlist)) throw new Error('Playlist change was refused. Check this project’s wiring before trying again.');
        setStackFeedback(`${savedLook.label} added to playlist.`);
        if (connected) void previewSavedLookOnCard(savedLook);
      } catch (error) {
        setStackFeedback(error instanceof RangeError ? `Not enough playlist slots. ${error.message}` : error.message);
      }
    };

    const addSelectedStacks = () => {
      if (recoveryPendingRef.current) return;
      const orderedIds = selectedStacksInLibraryOrder.map(look => look.id);
      if (!orderedIds.length) return;
      try {
        if (orderedIds.some(id => stackNeedsSectionReview(savedLookById.get(id), sectionTargets))) {
          throw new Error('Review sections in Patterns before adding these stacks.');
        }
        const next = addProjectStacksToPlaylist(standaloneController, orderedIds);
        const added = next.playlist.length - (standaloneController?.playlist?.length || 0);
        if (!writePlaylist(next.playlist)) throw new Error('Playlist change was refused. Check this project’s wiring before trying again.');
        setSelectedStackIds([]);
        setStackFeedback(added ? `${added} ${added === 1 ? 'stack' : 'stacks'} added to playlist.` : 'Selected stacks are already in the playlist.');
      } catch (error) {
        setStackFeedback(error instanceof RangeError ? `Not enough playlist slots. ${error.message}` : error.message);
      }
    };

    const addSequence = (asset) => {
      if (recoveryPendingRef.current || !asset || playlistContainsSequence(playlist, asset.id)) return;
      const item = makeSequencePlaylistItem(asset);
      if (item) writePlaylist([...playlist, item]);
    };

    // ── drag + drop (the handle is the source; rows remain drop targets) ───
    const startDrag = (event, index) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      setDrag({ from: index, over: index });
    };
    const hoverDrop = (event, index) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDrag((cur) => (cur.over === index ? cur : { ...cur, over: index }));
    };
    const dropItem = (event, index) => {
      event.preventDefault();
      const transferIndex = Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
      const fromIndex = Number.isFinite(transferIndex) ? transferIndex : drag.from;
      setDrag({ from: null, over: null });
      moveTo(fromIndex, index);
    };
    const endDrag = () => setDrag({ from: null, over: null });

    const startPointerDrag = (event, index) => {
      if (event.pointerType === 'mouse') return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      pointerDrag.current = {
        pointerId: event.pointerId,
        handle: event.currentTarget,
        from: index,
        over: index,
      };
      setDrag({ from: index, over: index });
    };

    const movePointerDrag = (event) => {
      const active = pointerDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-playlist-index]');
      const over = Number.parseInt(row?.dataset.playlistIndex || '', 10);
      if (!Number.isFinite(over) || over === active.over) return;
      active.over = over;
      setDrag({ from: active.from, over });
    };

    const finishPointerDrag = (event, commit) => {
      const active = pointerDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      if (active.handle.hasPointerCapture?.(event.pointerId)) {
        active.handle.releasePointerCapture(event.pointerId);
      }
      pointerDrag.current = null;
      setDrag({ from: null, over: null });
      if (commit) moveTo(active.from, active.over);
    };

    // ── derived view data (real banks, mockup shapes) ─────────────────────
    // Keep the bank in one canonical order. Added patterns remain in place so
    // the library does not reshuffle under the operator's pointer or memory.
    const patternTiles = DEFAULT_CARD_PATTERN_BANK.map((pattern) => ({
      ...realPatternShape(pattern.id),
      added: playlistContainsPattern(playlist, pattern.id),
    }));
    const playlistPatternCount = patternTiles.filter((pattern) => pattern.added).length;

    // ── timed playlist: what the card itself reports right now ────────────
    // cardLink.readiness is the same normalized envelope this screen already
    // reads playbackReady/cardId from — polled upstream, not by this screen,
    // so reading .playlist off it here needs no second poller.
    const cardPlaylistStatus = connected ? cardLink?.readiness?.playlist : null;
    const cardPlaylistEntryLabel = (() => {
      if (!cardPlaylistStatus?.patternId) return '';
      const matched = playlist.find((item) => item.id === cardPlaylistStatus.patternId);
      return (matched?.type === 'combo' ? savedLookById.get(matched.lookId)?.label : '') || matched?.label || cardPlaylistStatus.patternId;
    })();
    const playlistStatusLine = (() => {
      if (!cardPlaylistStatus) return '';
      if (!cardPlaylistStatus.configured) return 'Playlist not on the card yet, Install to send it.';
      const label = cardPlaylistEntryLabel || '—';
      if (cardPlaylistStatus.playing) {
        const position = cardPlaylistStatus.entryIndex === null ? '' : `entry ${cardPlaylistStatus.entryIndex + 1} of ${cardPlaylistStatus.entryCount}, `;
        const remaining = cardPlaylistStatus.remainingSeconds === null ? '' : `, ${cardPlaylistStatus.remainingSeconds} s left`;
        return `Playing ${position}${label}${remaining}`;
      }
      return `Paused on ${label}`;
    })();

    // ── "On the card now": three figures, each from state already here ────
    // Nothing on this panel is inferred. The card's readiness envelope does
    // NOT report a playlist length or a playing look (see normalizeCardReadiness
    // — it carries identity, capacity and readiness flags and nothing about the
    // playlist), so the only truthful sources are Studio's own install record
    // and its own confirmed live push.
    //
    // installedRecord is the install record ONLY while the open project is
    // still the one that was installed (currentInstallation). One edit since
    // the install and the card holds a different playlist whose length this
    // screen cannot know — so the tile says so with an em-dash rather than
    // printing the edited count as if it were on the card.
    const installedRecord = currentInstallation(projectLifecycle);
    const installedLooks = installedRecord ? playlist.length : null;
    const installedLooksNote = installedRecord
      ? (installedRecord.verified === true ? 'read back from card' : 'sent, not read back')
      : (projectLifecycle.installation ? 'edited since install' : 'not installed yet');
    // `live` is set only after pushLivePreviewToCard resolved, so it is the one
    // look this screen can honestly say the card is showing right now.
    const playingItem = live ? playlist.find((item) => item.id === live) || null : null;
    const slotsLeft = Math.max(0, CARD_PLAYLIST_LIMIT - playlist.length);
    // The card's own id, and deliberately NOT the address: the address is a
    // field 300px above this bar, and printing it twice would make this panel
    // repeat the screen instead of adding to it. Empty when no card has ever
    // identified itself, which is a truthful blank rather than a stand-in.
    const cardNowMeta = installedRecord?.cardId || cardLink?.readiness?.cardId || '';

    // ── screen-scoped messages into the notice layer ───────────────────────
    React.useEffect(() => {
      if (!hardwareConfigurationIssue) {
        dismissNoticeKey('playlist-hardware-warning');
        return;
      }
      publishNotice({
        key: 'playlist-hardware-warning',
        testId: 'playlist-hardware-warning',
        tone: 'error',
        title: 'Hardware setup needs attention.',
        body: `${hardwareConfigurationIssue} You can still add, remove, copy, and reorder every look. Only card setup actions are paused.`,
        source: 'playlist-hardware',
        action: { label: 'Fix wiring', onSelect: () => { window.location.hash = '#screen=layout&mode=draw'; } },
      });
    }, [hardwareConfigurationIssue]);

    React.useEffect(() => {
      if (!playlistStatus) {
        dismissNoticeKey('playlist-card-status');
        return;
      }
      if (playlistStatus.physicalPreview) {
        const tone = playlistStatus.kind === 'ok' ? 'success'
          : playlistStatus.kind === 'err' ? 'error'
          : playlistStatus.kind === 'pending' ? 'progress'
          : 'info';
        publishNotice({
          key: 'playlist-card-status',
          testId: 'playlist-card-status',
          tone,
          title: playlistStatus.message,
          source: 'playlist-status',
          actions: previewFailureHandler ? [{
            label: playlistStatus.failure.actionLabel,
            onSelect: previewFailureHandler,
            disabled: recoveryPending,
          }] : [],
        });
        return;
      }
      const tone = playlistStatus.kind === 'ok' ? 'success'
        : playlistStatus.kind === 'err' ? 'error'
        : playlistStatus.kind === 'pending' ? 'progress'
        : 'info';
      // Priority when more than one button would have rendered — the
      // reconcile action ("Set card to X & load" / "Recommission card &
      // load") > Retry > Open card installer > Open card page (the last is
      // the generic fallback, offered whenever nothing more specific
      // applies — including the plain pending/success states, matching what
      // the old box always rendered there too). "Open card installer" ranks
      // above the generic fallback because it is the specific fix a
      // mixed-content/bridge-* message explicitly names. No test exercises
      // these combinations directly (checked against
      // tests/playlist-storage.spec.ts and tests/workflow.spec.ts), so
      // nothing tested is lost — only ever the untested "Adjust LED count"
      // secondary button (always paired with the reconcile action) and
      // whichever of {Retry, Open card installer, Open card page} loses this
      // priority race.
      let action = null;
      if (playlistStatus.action) {
        action = {
          label: playlistStatus.action.label,
          onSelect: () => { void loadPlaylistToCard({
            allowLayoutChange: playlistStatus.action.kind === 'allow-layout-change',
            allowProjectChange: playlistStatus.action.kind === 'allow-project-change',
          }); },
        };
      } else if (playlistStatus.retry === 'playlist') {
        action = { label: 'Retry', onSelect: () => { void loadPlaylistToCard(); } };
      } else if (playlistStatus.handoffUrl) {
        action = { label: 'Open card installer', onSelect: openCardInstaller };
      } else {
        action = { label: 'Open card page', onSelect: openCard };
      }
      publishNotice({
        key: 'playlist-card-status',
        testId: 'playlist-card-status',
        tone,
        title: playlistStatus.message,
        body: playlistStatus.action?.hint || '',
        source: 'playlist-status',
        action,
      });
    }, [playlistStatus, playlistSyncing, recoveryPending, previewFailureHandler]);

    return (
      <div className="screen">
        <div className="screen-scroll">
          <div className="pm">
            <header className="pm-hero">
              <div className="pm-title">
                <span className="pm-kicker">Studio · Playlist</span>
                <h1>Playlist</h1>
                <p>The order the dial press cycles through on the card. The first look starts on boot.</p>
                <SetupJourneyChip cardLink={cardLink} cardLifecycle={cardLifecycle} project={currentProject} />
              </div>
              <div className="pm-actions">
                <button className="btn" disabled={recoveryPending} onClick={resetLiveOutput}>{I.refresh}Reset live</button>
                <button
                  className="btn primary"
                  disabled={!installGate.allowed}
                  title={installGate.allowed ? undefined : installGate.message}
                  onClick={() => loadPlaylistToCard()}
                >
                  {I.bolt}{playlistSyncing ? 'Sending…' : 'Install playlist on card'}
                </button>
                {/* Was wrapped in a `.pm-menu` div — the class Patterns uses
                    for its real "Card tools" dropdown, but here with no
                    popover, no aria-haspopup, no chevron: leftover markup
                    from that other screen's real menu, not one of its own. */}
                <button className="btn" disabled={Boolean(hardwareConfigurationIssue)} onClick={copyConfig}>{I.copy}Copy chip config</button>
                <button className="btn" disabled={Boolean(hardwareConfigurationIssue)} onClick={downloadConfig}>{I.download}Download</button>
                <button className="btn" onClick={openCard}>{I.open}Open card page</button>
              </div>
            </header>
            {playlistSaveStatus && <p className="pl-project-save-status" role="status" data-testid="playlist-project-save-status">{playlistSaveStatus}</p>}

            <div className="pm-grid">
              <section className="pm-main">
                <div className="pl-hostrow">
                  <span className="sf-l">Card address</span>
                  <input className="pm-input" value={host} disabled={recoveryPending} onChange={(e) => persistHost(e.target.value)} style={{ maxWidth: 260 }} aria-label="Card address" />
                  <span className="pl-count" data-testid="playlist-physical-preview-status">{cardActionStatusLabel(previewAction)}</span>
                </div>

                {connected && cardPlaylistStatus &&
                  <div className="pl-transport" data-testid="playlist-card-transport">
                    <span className="pl-transport-status" data-testid="playlist-card-transport-status">{playlistStatusLine}</span>
                    {cardPlaylistStatus.configured &&
                      <div className="pl-transport-actions">
                        {/* Transport is state, not the screen's action: Install
                            playlist on card is the one filled button here, so
                            Play/Pause reads as a pressed toggle (the card's own
                            playing flag), in words. */}
                        <button
                          className={"btn pl-transport-toggle" + (cardPlaylistStatus.playing ? " is-on" : "")}
                          aria-pressed={cardPlaylistStatus.playing}
                          data-testid="playlist-play-toggle"
                          disabled={playlistControlPending || recoveryPending}
                          onClick={() => sendPlaylistControl(cardPlaylistStatus.playing ? 'pause' : 'play')}
                        >
                          {cardPlaylistStatus.playing ? 'Pause' : 'Play'}
                        </button>
                        <button className="btn" disabled={playlistControlPending || recoveryPending} onClick={() => sendPlaylistControl('previous')}>Previous</button>
                        <button className="btn" disabled={playlistControlPending || recoveryPending} onClick={() => sendPlaylistControl('next')}>Next</button>
                      </div>
                    }
                    {playlistControlError &&
                      <p className="pl-transport-error" role="alert" data-testid="playlist-card-transport-error">{playlistControlError}</p>
                    }
                  </div>
                }

                <div className="pl-list" ref={playlistOrderRef} tabIndex={-1} data-testid="playlist-order-section">
                  {/* The list is a module, so it says what it is and how many, in
                      its own bar. The count used to float in the card-address row
                      above, where it described something two elements away. */}
                  <div className="sec-h">
                    <h2 className="t">Playlist order</h2>
                    <span className="m">{playlist.length} looks · dial press advances</span>
                    <span className="line" />
                  </div>
                  <div className="pl-order-help-row">
                    <p className="pl-order-help" data-testid="playlist-order-help">Drag rows to set playback order. Each stack&apos;s sections play together.</p>
                    <button type="button" className="pl-order-jump" onClick={() => { sourcePickerRef.current?.scrollIntoView({ block: 'start' }); sourcePickerRef.current?.focus({ preventScroll: true }); }}>Add stacks</button>
                  </div>
                  <div className="pl-timing">
                    <label className="pl-timing-field">
                      <span className="sf-l">Fade</span>
                      <input
                        type="number"
                        className="pm-input pl-timing-input"
                        min="0"
                        max="10"
                        step="0.1"
                        value={(playlistTiming.fadeMs / 1000).toFixed(1)}
                        onChange={(e) => setPlaylistFadeSeconds(e.target.value)}
                        aria-label="Fade seconds between looks"
                        data-testid="playlist-fade-seconds"
                      />
                      <span className="pl-timing-unit">s</span>
                    </label>
                    <label className="pl-timing-switch">
                      <button
                        type="button"
                        aria-pressed={playlistTiming.enabled}
                        className={"ex-toggle" + (playlistTiming.enabled ? " on" : "")}
                        onClick={() => setPlaylistEnabled(!playlistTiming.enabled)}
                        data-testid="playlist-enabled-toggle"
                      />
                      <span>Play on the card</span>
                    </label>
                    <p className="pl-timing-note">Each look loops for its Length, then fades to the next{playlistTiming.enabled ? '; the last returns to the first.' : '.'}</p>
                  </div>
                  {playlistTiming.enabled && playlistOverflow > 0 &&
                    <p className="pl-timing-overflow" role="status" data-testid="playlist-overflow-notice">
                      Timed playback cannot be installed with {enabledPlaylistCount} active entries. The limit is {CARD_PLAYLIST_ENTRY_LIMIT}; remove or disable {playlistOverflow} {playlistOverflow === 1 ? 'entry' : 'entries'} first. Manual dial order supports up to {CARD_PLAYLIST_LIMIT} entries.
                    </p>
                  }
                  <span id="playlist-reorder-instructions" className="pl-reorder-instructions">
                    Use Arrow Up or Arrow Down to move one place. Use Home or End to move to the bounds. Drag with a pointer or touch.
                  </span>
                  <span className="pl-reorder-status" aria-live="polite" data-testid="playlist-reorder-status">
                    {reorderAnnouncement}
                  </span>
                  {repeatFeedback && <p className="pl-repeat-feedback" role="status" data-testid="playlist-repeat-feedback">{repeatFeedback}</p>}
                  {playlist.map((item, i) => {
                    const savedLook = item.type === 'combo' ? savedLookById.get(item.lookId) : null;
                    const displayLabel = savedLook?.label || item.label;
                    const stackSummary = savedLook ? stackSummaries.get(savedLook.id) : null;
                    const recorded = item.type === 'sequence' ? sequenceAssetById.get(item.sequenceAssetId) : null;
                    const p = item.type === 'sequence'
                      ? realPatternShape('aurora')
                      : item.type === 'combo'
                      ? { ...adaptSavedLook(savedLook), label: displayLabel }
                      : realPatternShape(item.patternId);
                    if (!p) return null;
                    const id = item.id;
                    return (
                      <article
                        key={id}
                        className={"pl-row" + (live === id ? " is-live" : "") + (drag.from === i ? " is-dragging" : "") + (drag.from !== null && drag.over === i ? " is-drop-target" : "")}
                        data-testid={`playlist-row-${id}`}
                        data-playlist-index={i}
                        onDragOver={(e) => hoverDrop(e, i)}
                        onDrop={(e) => dropItem(e, i)}
                      >
                        <div className="pl-index">
                          <button
                            className={"pl-grip" + (drag.from === i ? " is-grabbing" : "")}
                            draggable
                            aria-label={`Reorder ${displayLabel}`}
                            aria-describedby="playlist-reorder-instructions"
                            title={`Reorder ${displayLabel}`}
                            ref={(node) => {
                              if (node) reorderHandleRefs.current.set(id, node);
                              else reorderHandleRefs.current.delete(id);
                            }}
                            onKeyDown={(event) => reorderWithKeyboard(event, item, i)}
                            onPointerDown={(event) => startPointerDrag(event, i)}
                            onPointerMove={movePointerDrag}
                            onPointerUp={(event) => finishPointerDrag(event, true)}
                            onPointerCancel={(event) => finishPointerDrag(event, false)}
                            onDragStart={(event) => startDrag(event, i)}
                            onDragEnd={endDrag}
                          >
                            ::
                          </button>
                          <strong>{String(i + 1).padStart(2, "0")}</strong>
                          <span>{i === 0 ? "startup" : "press"}</span>
                        </div>
                        {stackSummary ? <StackArtwork summary={stackSummary} /> : <span className="pl-art"><LedRow pal={p.pal} n={5} /></span>}
                        <div className="pl-copy">
                          <strong>{displayLabel}{item.type === 'combo' && <span className="mixtag">Stack</span>}{item.type === 'sequence' && <span className="mixtag">recording</span>}</strong>
                          <span>{item.type === 'sequence' ? `${recorded?.manifest?.fps || 24} fps recorded playback · microSD` : item.type === 'combo' ? `${stackSummary?.sectionCount || 0} sections` : `${p.label} across the piece`}</span>
                        </div>
                        <div className="pl-actions">
                          <label className="pl-dwell">
                            <span className="sf-l">Length</span>
                            <input
                              type="number"
                              className="pm-input pl-dwell-input"
                              min="0.02"
                              max="60"
                              step="0.1"
                              inputMode="decimal"
                              value={Object.hasOwn(lengthDrafts, id) ? lengthDrafts[id] : formatPlaylistLengthMinutes(item.dwellSeconds)}
                              onChange={(e) => setItemLengthDraft(id, e.target.value)}
                              onBlur={(e) => commitItemLengthMinutes(id, e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  resetItemLengthDraft(id);
                                }
                              }}
                              aria-label={`Length in minutes for ${displayLabel}`}
                              aria-describedby={`playlist-length-help-${id}`}
                              data-testid={`playlist-dwell-${id}`}
                            />
                            <span className="pl-dwell-unit">min</span>
                            <span className="pl-field-help" id={`playlist-length-help-${id}`}>Enter 0.02 to 60 minutes.</span>
                          </label>
                          <button className={"plbtn" + (live === id ? " on" : "")} aria-pressed={live === id} disabled={recoveryPending || item.type === 'sequence'} title={item.type === 'sequence' ? 'Install this recording before playing it on the card' : undefined} onClick={() => setLiveItem(item)}>Live</button>
                          <div className="pl-row-menu">
                            <button
                              className="plbtn pl-more"
                              aria-label={`More actions for ${displayLabel}`}
                              aria-haspopup="menu"
                              aria-expanded={openRowMenuId === id}
                              aria-controls={`playlist-row-menu-${id}`}
                              ref={(node) => {
                                if (node) rowMenuTriggerRefs.current.set(id, node);
                                else rowMenuTriggerRefs.current.delete(id);
                              }}
                              onClick={() => setOpenRowMenuId((current) => current === id ? null : id)}
                            >
                              {I.dots}
                            </button>
                            {openRowMenuId === id &&
                              <>
                                <button className="pl-row-menu-backdrop" aria-label="Close playlist row actions" onClick={() => closeRowMenu(true)} />
                                <div className="pl-row-menu-pop" id={`playlist-row-menu-${id}`} role="menu" aria-label={`Actions for ${displayLabel}`}>
                                  <button role="menuitem" className="pl-row-menu-item" onClick={() => { closeRowMenu(true); dup(i); }}>{I.copy}<span>{item.type === 'combo' ? 'Repeat this stack' : `Duplicate ${displayLabel}`}</span></button>
                                  <button role="menuitem" className="pl-row-menu-item danger" onClick={() => { closeRowMenu(false); remove(i); }}>{I.trash}<span>Remove {displayLabel}</span></button>
                                </div>
                              </>
                            }
                          </div>
                        </div>
                        {stackSummary && <div className="pl-row-stack-details">
                          <button type="button" className="pl-stack-details-toggle" aria-expanded={expandedStackIds.includes(`row-${id}`)} onClick={() => toggleStackDetails(`row-${id}`)}>{expandedStackIds.includes(`row-${id}`) ? 'Hide sections' : 'Show sections'}</button>
                          {expandedStackIds.includes(`row-${id}`) && <StackAssignments summary={stackSummary} />}
                          <a className="pl-stack-details-toggle" href={`#screen=pattern&editStack=${encodeURIComponent(savedLook.id)}`}>Edit stack</a>
                        </div>}
                      </article>
                    );
                  })}
                </div>

                {/* What the card is carrying, under the order that produced it.
                    Same idiom as the order above: filled head bar, status
                    light, name, right-aligned meta — body is three figures. */}
                <div className="pl-cardnow" data-testid="playlist-card-now">
                  <div className={"sec-h" + (playingItem ? " is-live" : "")}>
                    <h2 className="t">On the card now</h2>
                    <span className="m">{cardNowMeta}</span>
                    <span className="line" />
                  </div>
                  <div className="pl-stats">
                    <div
                      className={"pl-stat" + (installedRecord?.verified === true ? " is-ok" : "")}
                      data-testid="playlist-stat-installed"
                    >
                      <span className="k">Looks installed</span>
                      <strong className="v">{installedLooks === null ? '—' : installedLooks}</strong>
                      <span className="n">{installedLooksNote}</span>
                    </div>
                    <div
                      className={"pl-stat" + (playingItem ? " is-live" : "")}
                      data-testid="playlist-stat-playing"
                    >
                      <span className="k">Playing</span>
                      <strong className="v">{playingItem ? (playingItem.type === 'combo' ? savedLookById.get(playingItem.lookId)?.label : '') || playingItem.label : '—'}</strong>
                      {/* Was a fourth, boolean-only vocabulary for "has this
                          reached the card" ("live preview confirmed" / "no
                          live look sent"). Same underlying state
                          (`previewAction`) the Card address row above already
                          reads with `cardActionStatusLabel` — one phrase for
                          the fact, wherever it is shown. */}
                      <span className="n">{cardActionStatusLabel(previewAction)}</span>
                    </div>
                    <div className="pl-stat" data-testid="playlist-stat-slots">
                      <span className="k">Card slots left</span>
                      <strong className="v">{slotsLeft}</strong>
                      <span className="n">of {CARD_PLAYLIST_LIMIT}</span>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="pm-aside">
                <div className="card pm-pane" data-testid="playlist-source-picker" ref={sourcePickerRef} tabIndex={-1}>
                  <button type="button" className="pl-order-jump pl-back-to-order" onClick={() => { playlistOrderRef.current?.scrollIntoView({ block: 'start' }); playlistOrderRef.current?.focus({ preventScroll: true }); }}>Back to order</button>
                  <div className="pl-source-tabs" role="tablist" aria-label="Playlist sources">
                    <button type="button" className="pl-source-tab" role="tab" aria-selected={sourceChoice === 'stacks'} onClick={() => chooseSource('stacks')}>Project stacks ({savedLooks.length})</button>
                    <button type="button" className="pl-source-tab" role="tab" aria-selected={sourceChoice === 'patterns'} onClick={() => chooseSource('patterns')}>Patterns</button>
                  </div>
                  {sourceChoice === 'stacks' ? <div role="tabpanel" aria-label="Project stacks">
                    <div className="sec-h"><h2 className="t">Project stacks</h2><span className="m">{savedLooks.length}</span></div>
                    <p className="pl-stack-order-help" data-testid="playlist-stack-order-help">Selected stacks are added at the end, in library order. Arrange playback in Playlist order. Repeat a stack from its playlist row.</p>
                    {!!selectedStacksInLibraryOrder.length && <ol className="pl-stack-selection-preview" data-testid="playlist-stack-selection-preview" aria-label="Selected stacks in add order">
                      {selectedStacksInLibraryOrder.map((look, index) => <li key={look.id}>{index + 1}. {look.label}</li>)}
                    </ol>}
                    {!!savedLooks.length && <button type="button" className="btn pl-stack-add-selected" disabled={!selectedStackIds.length || recoveryPending} onClick={addSelectedStacks}>Add selected{selectedStackIds.length ? ` (${selectedStackIds.length})` : ''}</button>}
                    {stackFeedback && <p className="pl-stack-feedback" role="status" data-testid="playlist-stack-feedback">{stackFeedback}</p>}
                    <div className="pl-stack-list">
                      {savedLooks.map(look => {
                        const summary = stackSummaries.get(look.id);
                        const compatibility = getProjectStackCompatibility(look);
                        const needsReview = stackNeedsSectionReview(look, sectionTargets);
                        const eligible = compatibility.ok && !needsReview;
                        const added = playlistContainsCombo(playlist, look.id);
                        const expanded = expandedStackIds.includes(look.id);
                        return <div key={look.id} className="pl-stack-card" data-testid={`playlist-stack-${look.id}`}>
                          <div className="pl-stack-head">
                            <input type="checkbox" aria-label={`Select ${look.label}`} checked={selectedStackIds.includes(look.id)} disabled={!eligible || added || recoveryPending} onChange={() => toggleStackSelection(look.id)} />
                            <StackArtwork summary={summary} />
                            <strong>{look.label}</strong><span className="mixtag">Stack</span>
                          </div>
                          <div className="pl-stack-meta">
                            <span>{summary.sectionCount} {summary.sectionCount === 1 ? 'section' : 'sections'}</span>
                            {added && <span>In playlist: {(stackPlaylistPositions.get(look.id) || []).join(', ')}</span>}
                            {!eligible && <span className="pl-stack-ineligible">{needsReview ? 'Review sections' : 'Unavailable on card'}</span>}
                          </div>
                          {!eligible && <p className="pl-stack-feedback">{needsReview ? 'Section layout changed. Open this stack in Patterns to review its assignments.' : compatibility.reason}</p>}
                          <div className="pl-stack-actions">
                            {eligible && <button type="button" className={!added ? 'pl-stack-primary' : undefined} disabled={recoveryPending || (added && !connected)} onClick={() => addCombo(look)}>{added ? 'Preview' : 'Add stack'}</button>}
                            <a href={`#screen=pattern&editStack=${encodeURIComponent(look.id)}`}>Edit stack</a>
                            <button type="button" aria-expanded={expanded} onClick={() => toggleStackDetails(look.id)}>{expanded ? 'Hide sections' : 'Show sections'}</button>
                          </div>
                          {expanded && <StackAssignments summary={summary} />}
                        </div>;
                      })}
                    </div>
                    {!savedLooks.length && <p className="pl-empty">No project stacks yet. Create one on Patterns.</p>}
                  </div> : <div role="tabpanel" aria-label="Patterns">
                    <div className="sec-h"><h2 className="t">Pattern pool</h2><span className="m">{playlistPatternCount} added · {patternTiles.length} total</span></div>
                    <p className="pl-pool-help">Select a pattern to add it. Added patterns stay in place.</p>
                    <div className="pl-pool">
                      {patternTiles.map((p) => (
                        <button key={p.id} className={"pl-chip pl-pattern-tile" + (p.added ? " is-added" : "")} disabled={recoveryPending} aria-pressed={p.added}
                          aria-label={p.added ? `${p.label}, already in playlist; preview` : `Add ${p.label}`}
                          onClick={() => addPattern(p.id)} title={p.added ? `Preview ${p.label}` : `Add ${p.label}`}>
                          <span className="pl-chip-art"><LedRow pal={p.pal} n={4} /></span><span className="pl-chip-nm">{p.label}</span>
                          <span className="pl-pattern-action">{p.added ? 'Added' : 'Add'}</span>
                        </button>
                      ))}
                    </div>
                  </div>}
                </div>

                {sequenceAssets.length > 0 && <div className="card pm-pane" data-testid="playlist-recordings">
                  <div className="sec-h"><h2 className="t">Recordings</h2><span className="m">{sequenceAssets.length}</span></div>
                  {sequenceAssets.map(asset => {
                    const added = playlistContainsSequence(playlist, asset.id);
                    return <button key={asset.id} className="pl-source" onClick={() => addSequence(asset)} disabled={added || recoveryPending}>
                      <span className="pl-src-art"><LedRow pal={realPatternShape('aurora').pal} n={5} /></span>
                      <span className="pl-src-nm">{asset.label}<span className="mixtag">recording</span></span>
                      <span className="pl-src-add">{added ? I.check : I.plus}</span>
                    </button>;
                  })}
                </div>}

              </aside>
            </div>
          </div>
        </div>
      </div>
    );
  }

export { PlaylistScreen };
