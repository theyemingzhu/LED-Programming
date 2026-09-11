/* Light Weaver v3 — Patterns & Mixes (faithful to v3, cleaned + recolored) */
/* Exact mockup file, converted from window-global script to ES module.
   The visual body (helpers + JSX structure + class names) is the mockup's own.
   Only data + handlers are real now: the SAMPLE bank/mixes/local useState that
   drove the mockup are replaced with the live pattern bank, ProjectContext, and
   the real handlers ported from the old PatternsScreen. No visual markup, class
   names, or LED-render helpers changed. */
import React, { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { I, LedRow, PATTERN_CATS, SWATCHES, GEOMETRY } from './lw-shared.jsx';
import { SetupJourneyChip } from '../components/SetupJourneyChip.jsx';
import { REAL_PATTERNS, REAL_PATTERN_BY_ID, adaptPattern, adaptSavedLook, defaultWarmPatternId } from './v3-data.js';
import { useProject } from '../state/ProjectContext.jsx';
import { useCloudLibrary } from '../state/CloudLibraryContext.jsx';
import { getCardPatternById } from '../lib/cardPatternBank.js';
import { getPatternById } from '../lib/patternRegistry.js';
import { loadCustomPatterns } from '../lib/customPatterns.js';
import { compilePattern, normalizePalette, renderPixelFrame } from '../lib/frameEngine.js';
import { applyLookColorModifiers, LW_DEFAULT_CUSTOM_SATURATION } from '../lib/previewColorModifiers.js';
import {
  LOOK_SPEED_SLIDER_MAX,
  LOOK_SPEED_SLIDER_MIN,
  lookSpeedToSliderValue,
  sliderValueToLookSpeed,
} from '../lib/controlScale.js';
import {
  DEFAULT_CARD_VISUAL_LOOK,
  cardColorToHex,
  cardHueToDegrees,
  cardSaturationToChroma,
  hexToCardColor,
} from '../lib/cardVisualLook.js';
import { readPatternEditSession, writePatternEditSession, writePatternLabEditHandoff } from '../lib/patternEditSession.js';
import { recipeFromLook } from '../lib/patternLabFromLook.js';
import { normalizePatchBoard } from '../lib/patchBoard.js';
import { CARD_HARDWARE_CONTRACT } from '../lib/cardHardwareContract.js';
import {
  ALL_SECTIONS_TARGET_ID,
  applyLookToPatchBoard,
  applySavedLookToPatchBoard,
  deriveSectionTargets,
  deleteSavedLookFromController,
  normalizeSavedLooks,
  normalizeSectionVisualLook,
  saveCurrentLookToController,
  targetLabel,
} from '../lib/sectionLookModel.js';
import {
  derivePlaylistLookIds,
  isImplicitDefaultPatternPlaylist,
  makeComboPlaylistItem,
  makePatternPlaylistItem,
  normalizeCardPlaylist,
  playlistContainsCombo,
  playlistContainsPattern,
} from '../lib/cardPlaylist.js';
import {
  cardConnectionOptionsFor,
  cardHostToUrl,
  discoverCardStatus,
  isLocalCardHost,
  normalizeCardHost,
  readStoredCardHost,
  writeStoredCardHost,
} from '../lib/cardConnection.js';
import { buildCardRuntimePackageFromProject } from '../lib/cardRuntimeProject.js';
import { classifyCardReadiness, installedProjectIdFromCardStatus } from '../lib/cardReadiness.js';
import { markCardEditIntentAbandoned } from '../lib/cardEditIntent.js';
import { openCardFlow } from '../lib/cardFlowEntry.js';
import { deriveCardAccess } from '../lib/cardAccess.js';
import { evaluateCardInstallGate, STAGED_WIRING_CONFLICT_MESSAGE } from '../lib/cardInstallGate.js';
import { cardProjectFingerprint } from '../lib/cardProjectResolver.js';
import { currentInstallation, structurallyInstalledRecord } from '../lib/projectLifecycle.js';
import {
  consumeCardEditAuthorization,
  currentCardProjectAuthorizationExpiresAt,
  ensureCardEditAuthorization,
  renewCardEditAuthorization,
} from '../lib/cardEditAuthorization.js';
import { buildCardConfigHandoffUrl, cardStorageJson, pushConfigToCard, readCardProjectEvidence } from '../lib/cardPushClient.js';
import { prepareCardStoragePayload } from '../lib/cardStoragePayload.js';
import { prepareCardDeployment, waitForCardDeploymentVerification } from '../lib/cardDeployment.js';
import { runtimePackageForCardOperation } from '../lib/testStrip.js';
import { decideLiveControlProjectAuthority, previewResponseUsedZoneFallback, pushLivePreviewToCard, readBackLivePreview, readCardZonesFromCard, flashSectionOnCard } from '../lib/cardLiveControl.js';
import { cardSectionSummary } from '../lib/cardSectionSync.js';
import { connectCardTransport, getActiveCardTransportAuthority, readPersistedCardIdentity } from '../lib/cardTransport.js';
import { retryWhileTransient } from '../lib/cardTransientFailure.js';
import { recoverCardLightsVerified } from '../lib/cardRecoverLights.js';
import { withStudioHardwareOperation } from '../lib/studioHardwareOperation.js';
import { useSetupJourney } from '../hooks/useSetupJourney.js';
import {
  cardActionReducer,
  cardActionStatusLabel,
  classifyCardActionFailure,
  createCardActionState,
} from '../lib/cardAction.js';
import { dismissNoticeKey, publishNotice } from '../lib/noticeLayer.js';
import { createProjectPreviewStrip } from '../lib/previewVisuals.js';
import {
  buildPatternPreviewSegments,
  fitPreviewViewBox,
  readPatternPreviewUiState,
  writePatternPreviewUiState,
} from '../lib/patternPiecePreview.js';
import {
  CARD_BRIDGE_CHANGED_EVENT,
  acquireCardBridgeFromGesture,
  cardBridgeFeatureGap,
  getCardBridgeState,
  hasCardBridge,
  sendCardBridgeRequest,
  openLocalCardPage } from '../lib/cardBridge.js';
import { computeSymmetryFit } from '../lib/symmetry.js';
import { StripColorOrderCheck } from '../components/layout/wire/StripColorOrderCheck.jsx';
import { PatternPreview } from './PatternPreview.jsx';

  // Mockup geometry id -> live symSettings.
  const GEOMETRY_SETTINGS = {
    none: { enabled: false, type: 'none' },
    mirror: { enabled: true, type: 'mirror-hv' },
    mandala: { enabled: true, type: 'radial', count: 8, twist: 0 },
    kaleido: { enabled: true, type: 'kaleido', slices: 6 },
  };
  function geometryIdFromSettings(settings = {}) {
    if (!settings?.enabled || settings.type === 'none') return 'none';
    if (String(settings.type).startsWith('mirror')) return 'mirror';
    if (settings.type === 'radial') return 'mandala';
    if (settings.type === 'kaleido') return 'kaleido';
    return 'none';
  }

  // Label left, bar right. The name and its one-line hint explain the control
  // on the left of the row; the fader and the number it is currently reading
  // sit together on the right, because the value belongs to the bar and not to
  // the word. The readout keeps its `-readout` test id where it moved to.
  function Slider({ k, hint, v, value, min, max, step, onChange, testId }) {
    return (
      <div className="slider-row">
        <div className="lab"><span className="k">{k}</span>{hint ? <span className="hint">{hint}</span> : null}</div>
        <div className="sl-bar">
          <input className="lw" type="range" min={min} max={max} step={step} value={value} data-testid={testId ? `${testId}-slider` : undefined} onChange={(e) => onChange(parseFloat(e.target.value))} />
          <span className="v" data-testid={testId ? `${testId}-readout` : undefined}>{v}</span>
        </div>
      </div>);

  }

  // small glowing sine strand for the Color & motion preview
  function Strand({ tint }) {
    return (
      <svg viewBox="0 0 320 96" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
        <defs>
          <filter id="pm-glow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="3.4" /></filter>
        </defs>
        <path d="M14 58 C 70 22, 110 22, 160 50 C 210 78, 250 78, 306 42" fill="none" stroke={tint} strokeWidth="6"
        strokeLinecap="round" strokeDasharray="0.1 9.2" opacity="0.9" filter="url(#pm-glow)" />
        <path d="M14 58 C 70 22, 110 22, 160 50 C 210 78, 250 78, 306 42" fill="none" stroke="oklch(0.99 0.02 90)" strokeWidth="2"
        strokeLinecap="round" strokeDasharray="0.1 9.2" />
      </svg>);

  }

  // Live version of the Color & motion strand: paints a flowing gradient sampled
  // from the REAL pattern frame, so switching patterns and tuning the sliders is
  // reflected here too. Falls back to the static strand when there's no code.
  function LiveStrand({ patternId, pal, tint, look }) {
    const gradId = useId();
    const codeId = useMemo(() => resolveCodePatternId(patternId), [patternId]);
    const fn = useMemo(() => (codeId ? compilePattern(codeId) : null), [codeId]);
    const paletteNorm = useMemo(() => normalizePalette(pal), [pal]);
    const N = 16;
    const strip = useMemo(() => buildPreviewStrip(N), []);
    const stopRefs = useRef([]);
    const live = useRef({});
    live.current = { fn, codeId, paletteNorm, strip, look };

    useEffect(() => {
      if (!fn) return undefined;
      let raf = 0;
      let start = null;
      const tick = (now) => {
        if (start === null) start = now;
        const s = live.current;
        const tMs = now - start;
        const px = applyLookColorModifiers(renderPixelFrame({
          t: tMs / 1000,
          strips: [s.strip],
          patternId: s.codeId,
          activeFn: s.fn,
          paletteNorm: s.paletteNorm,
          masterBrightness: s.look?.brightness ?? 1,
          masterSpeed: s.look?.speed ?? 1,
        }).pixels, tMs, s.look || {});
        for (let i = 0; i < N; i++) {
          const el = stopRefs.current[i];
          if (!el) continue;
          const c = px[i] || { r: 0, g: 0, b: 0 };
          el.setAttribute('stop-color', `rgb(${c.r},${c.g},${c.b})`);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [fn]);

    if (!fn) return <Strand tint={tint} />;

    return (
      <svg viewBox="0 0 320 96" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
        <defs>
          <filter id={`glow-${gradId}`} x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="3.4" /></filter>
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="306" y2="0">
            {Array.from({ length: N }, (_, i) =>
              <stop key={i} ref={(el) => { stopRefs.current[i] = el; }} offset={`${(i / (N - 1)) * 100}%`} stopColor="#000" />
            )}
          </linearGradient>
        </defs>
        <path d="M14 58 C 70 22, 110 22, 160 50 C 210 78, 250 78, 306 42" fill="none" stroke={`url(#${gradId})`} strokeWidth="6"
        strokeLinecap="round" strokeDasharray="0.1 9.2" opacity="0.95" filter={`url(#glow-${gradId})`} />
      </svg>);

  }

  // ledColors + LedRow moved to lw-shared.jsx so Playlist can draw the same
  // bead strand for the same pattern instead of a flat gradient block.
  // Resolve a card-bank pattern id to the real library pattern that actually
  // has runnable per-pixel code. Card ids either match a library pattern
  // directly (sparkle, aurora…) or point at one via previewPatternId/preset.
  function resolveCodePatternId(patternId) {
    if (!patternId) return null;
    if (getPatternById(patternId)) return patternId;
    const card = getCardPatternById(patternId);
    const candidate = card?.previewPatternId || card?.preset;
    if (candidate && getPatternById(candidate)) return candidate;
    return null;
  }

  // Synthetic horizontal strip so the frame engine has geometry to render onto.
  function buildPreviewStrip(n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const p = n > 1 ? i / (n - 1) : 0.5;
      pts.push({ x: p, y: 0.5, p });
    }
    return { id: 'preview', pts, brightness: 1, speed: 1 };
  }

  // The wiring compiler keeps source LEDs in canonical order and records the
  // physical direction on each compiled run. Apply that metadata only for the
  // visual preview so its bead order matches the real wire without changing
  // the runtime package consumed by the card.
  function wiringInPhysicalPreviewOrder(compiledWiring) {
    if (!compiledWiring?.pixels?.length || !compiledWiring?.runs?.length) return compiledWiring;
    const pixels = [...compiledWiring.pixels];
    for (const run of compiledWiring.runs) {
      if (!run.reversed || !Number.isInteger(run.start) || !Number.isInteger(run.count) || run.count < 2) continue;
      pixels.splice(run.start, run.count, ...pixels.slice(run.start, run.start + run.count).reverse());
    }
    return { ...compiledWiring, pixels };
  }

  // Runs the REAL compiled pattern through the frame engine on a rAF loop, applies
  // the card's exact color post-pass (hue/saturation/breathe/drift), and paints
  // each bead per frame — so Sparkle sparkles, Fire flickers, and every slider
  // recolors the preview the way the card will. Falls back to the static palette
  // strand only when a pattern has no runnable code.
  function LivePreviewRow({ patternId, pal, look, previewStrip, n = 22, big = false, symSettings }) {
    const codeId = useMemo(() => resolveCodePatternId(patternId), [patternId]);
    const fn = useMemo(() => (codeId ? compilePattern(codeId) : null), [codeId]);
    const paletteNorm = useMemo(() => normalizePalette(pal), [pal]);
    const strip = previewStrip || buildPreviewStrip(n);
    n = strip.pts.length || n;
    const beadRefs = useRef([]);
    const live = useRef({});
    live.current = { fn, codeId, paletteNorm, strip, look, n, big, symSettings };

    useEffect(() => {
      if (!fn) return undefined;
      let raf = 0;
      let start = null;
      const tick = (now) => {
        if (start === null) start = now;
        const s = live.current;
        const tMs = now - start;
        const frame = renderPixelFrame({
          t: tMs / 1000,
          strips: [s.strip],
          patternId: s.codeId,
          activeFn: s.fn,
          paletteNorm: s.paletteNorm,
          masterBrightness: s.look?.brightness ?? 1,
          masterSpeed: s.look?.speed ?? 1,
          symSettings: s.symSettings,
        });
        const px = applyLookColorModifiers(frame.pixels, tMs, s.look || {});
        const offIndexes = new Set(s.strip.offIndexes || []);
        for (let i = 0; i < s.n; i++) {
          const el = beadRefs.current[i];
          if (!el) continue;
          const c = offIndexes.has(i) ? { r: 0, g: 0, b: 0 } : (px[i] || { r: 0, g: 0, b: 0 });
          const col = `rgb(${c.r},${c.g},${c.b})`;
          el.style.background = col;
          el.style.boxShadow = `0 0 ${s.big ? 9 : 5}px ${col}, 0 0 ${s.big ? 20 : 11}px ${col}`;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [fn]);

    // No runnable code for this pattern → keep the old palette strand.
    if (!fn) return <LedRow pal={pal} n={n} big={big} wave />;

    return (
      <div className={"ledrow" + (big ? " big" : "")}>
        {Array.from({ length: n }, (_, i) =>
          <span key={i} ref={(el) => { beadRefs.current[i] = el; }} className="led" style={{ background: "#000" }} />
        )}
      </div>);
  }

  function LedStage({ patternId, pal, look, previewStrip, symSettings }) {
    return (
      <div className="pm-led-stage" data-testid="pattern-project-preview" data-preview-led-count={previewStrip?.pts?.length || 22} data-preview-order={(previewStrip?.order || []).join(',')} data-preview-symmetry={symSettings?.enabled ? symSettings.type : 'none'}>
        <LivePreviewRow patternId={patternId} pal={pal} look={look} previewStrip={previewStrip} n={22} big symSettings={symSettings} />
        <span className="sheen" />
      </div>);
  }

  // One wording for a refused tap, shared by the hero status line and the
  // notice rendered next to the pattern grid.
  function patternGateMessage(gate) {
    if (gate === 'blank') return 'This card has no project yet. Set up its LED strips, then install this Studio project.';
    if (gate === 'project') return 'Open Hardware and verify that this exact Studio project is still installed on this card before sending lights.';
    return 'This card is not ready for pattern commands. Recover and verify it before sending lights.';
  }

  // F17-A: whether a live-preview send should go through the legacy bridge
  // pop-up, or can reach the card directly with no pop-up at all.
  //
  // An established bridge transport (from Connect, or an earlier fallback on
  // this exact card) always stays on the bridge — the same rule
  // CardControlDrawer uses (`preferBridge: link.transport === 'bridge'`,
  // with no https clause). Off that, https used to force the bridge
  // unconditionally, because a public Studio origin could not reach the
  // card directly. Chrome's Local Network Access rules changed that: a
  // private-network fetch/preflight now succeeds straight from the https
  // origin against a real card (measured against firmware 1548). So https
  // no longer means "must go through the pop-up" — it means "try a direct
  // transport probe first, and only fall back to the bridge when that
  // probe genuinely could not connect".
  //
  // `connectCardTransport` is the same entry point Connect uses
  // (cardTransport.js): a successful probe leaves the module's shared
  // authority set, so every later send finds it via
  // `getActiveCardTransportAuthority(host)` and goes direct without
  // probing again. The probe is bounded by its own internal
  // AbortController (~4s) and always resolves rather than hanging; a
  // rejection (an unreachable host, a pending or refused Local Network
  // Access permission) is treated the same as a refusal — fall back to the
  // bridge.
  //
  // F20/F21: the FIRST tap after a hard load can land before `cardLink` has
  // absorbed a single status read — `readiness === null`, `transport ===
  // ''`, `expectedCard === null`, exactly `initialCardLinkState()`. Reading
  // `!expectedCardId` there as "no card to probe" (the old behaviour) is
  // wrong: it is "no data yet", not "confirmed no identity". A persisted
  // identity from an earlier session (`lw_card_identity_v1`, synchronous in
  // localStorage) still names the card this owner expects, so probe with
  // THAT instead of forcing the pop-up on every fresh load —
  // `connectCardTransport`'s own `wrong-card` refusal already protects
  // against a stale persisted id. A card genuinely never paired (no
  // persisted identity either) still forces the bridge, unchanged.
  //
  // Returns `directProbeReady: true` only when THIS call's own probe just
  // came back connected — the signal `scheduleBrowseLivePreview`'s gate
  // needs to accept this exact tap without waiting for `cardLink.readiness`
  // to catch up (the dispatch the probe triggers lands in a later render,
  // not this microtask).
  async function resolveCardBridgePreference({ cardLink, cardHost }) {
    if (cardLink?.transport === 'bridge') return { needsBridge: true, directProbeReady: false };
    if (typeof window === 'undefined' || window.location?.protocol !== 'https:') {
      return { needsBridge: false, directProbeReady: false };
    }
    if (getActiveCardTransportAuthority(cardHost)) return { needsBridge: false, directProbeReady: false };
    const expectedCard = cardLink?.expectedCard || cardLink?.card || null;
    let expectedCardId = String(expectedCard?.id || expectedCard?.cardId || '').trim();
    if (!expectedCardId) {
      const bootstrapping = cardLink?.readiness == null && cardLink?.transport === '';
      const persistedId = bootstrapping ? String(readPersistedCardIdentity()?.id || '').trim() : '';
      if (!persistedId) return { needsBridge: true, directProbeReady: false };
      expectedCardId = persistedId;
    }
    // transport: n/a (this probe IS how resolveCardBridgePreference discovers whether direct works; F17-A/F21 preview routing, excluded by F36's own brief)
    const probed = await connectCardTransport({ host: cardHost, expectedCardId }).catch(() => null);
    const connected = Boolean(probed?.connected);
    return { needsBridge: !connected, directProbeReady: connected };
  }

  function PatternScreen({ connected, cardLink, cardLifecycle, currentProject, go }) {
    const { workspaceAssets } = useCloudLibrary();
    // F16: the shared journey is the one place that knows whether the card's
    // zones report a blackout — read here so the hero status line can say so
    // and the existing Recover lights button (data-testid="recover-lights",
    // below) can read as the primary action, without a second control.
    const patternsJourney = useSetupJourney({ cardLink, cardLifecycle, project: currentProject });
    const cardBlackedOut = patternsJourney.blackout === true;
    const {
      projectId,
      projectName,
      projectRevision,
      projectLifecycle,
      strips,
      hidden,
      setStrips,
      viewBox,
      svgText,
      patchBoard,
      wiring,
      compiledWiring,
      sectionTargets: projectSectionTargets,
      deriveProjectSectionTargets,
      setPatchBoard,
      standaloneController,
      setStandaloneController,
      markProjectEdited,
      markProjectInstalled,
      commitProjectStateWithoutEdit,
      markCardLookConfirmed,
      symSettings,
      setSymSettings,
      bpm,
      patternParams,
      activePatternId,
      setActivePatternId,
      gammaEnabled,
      gammaValue,
      serializeProject,
      flushProjectAutosave,
    } = useProject();
    const projectPreviewStrip = useMemo(
      () => createProjectPreviewStrip({ compiledWiring: wiringInPhysicalPreviewOrder(compiledWiring), strips, hidden }),
      [projectRevision, compiledWiring, strips, hidden],
    );

    // ── browse / ui state ───────────────────────────────────────────────
    const [q, setQ] = useState("");
    const [cat, setCat] = useState("all");
    const [menuOpen, setMenuOpen] = useState(false);
    const menuButtonRef = useRef(null);
    const menuRef = useRef(null);
    const [colorOrderOpen, setColorOrderOpen] = useState(false);
    const colorOrderButtonRef = useRef(null);
    const colorOrderPopoverRef = useRef(null);
    const [mixName, setMixName] = useState("");

    // Show-more pagination so the browser isn't 130+ cards tall (which buries the
    // preview on narrow screens). Resets whenever the filter or search changes.
    const PATTERN_PAGE = 24;
    const [visibleCount, setVisibleCount] = useState(PATTERN_PAGE);
    // Beads or gradient for the bank's swatches. Same colours either way —
    // ledColors interpolates each pattern's own palette — so this is a
    // rendering choice, not two sets of artwork. Remembered per browser
    // because it is a preference about how you read the bank, not a property
    // of the project.
    const [ledMode, setLedMode] = useState(() => {
      // Gradient is the default because it is what the board draws — the
      // bank reads as colour you scan across, and at 132 cells that is the
      // job. Beads stay one click away for anyone who wants to see the
      // individual lights.
      try { return localStorage.getItem('lw_led_mode') === 'beads' ? 'beads' : 'gradient'; }
      catch { return 'gradient'; }
    });
    const chooseLedMode = mode => {
      setLedMode(mode);
      try { localStorage.setItem('lw_led_mode', mode); } catch { /* private mode */ }
    };
    const patternSentinelRef = useRef(null);
    useEffect(() => { setVisibleCount(PATTERN_PAGE); }, [cat, q]);
    useEffect(() => {
      if (!menuOpen) return undefined;
      menuRef.current?.querySelector('button')?.focus();
      const onKeyDown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setMenuOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [menuOpen]);
    const closeColorOrder = useCallback((restoreFocus = true) => {
      setColorOrderOpen(false);
      if (restoreFocus) requestAnimationFrame(() => colorOrderButtonRef.current?.focus());
    }, []);
    useEffect(() => {
      if (!colorOrderOpen) return undefined;
      colorOrderPopoverRef.current?.querySelector('button:not(:disabled)')?.focus();
      const onKeyDown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeColorOrder();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [closeColorOrder, colorOrderOpen]);

    // ── real engine state ───────────────────────────────────────────────
    const [cardHost, setCardHost] = useState(readStoredCardHost);
    const [status, setStatus] = useState("");
    const [statusKind, setStatusKind] = useState("");
    const [recoveryConfirmation, setRecoveryConfirmation] = useState('');
    const [cardSave, dispatchCardSave] = useReducer(cardActionReducer, undefined, createCardActionState);
    const [previewAction, dispatchPreviewAction] = useReducer(cardActionReducer, undefined, createCardActionState);
    const [previewFailure, setPreviewFailure] = useState(null);
    const [patternCardGate, setPatternCardGate] = useState('');
    const [handoffUrl, setHandoffUrl] = useState("");
    const [selectedTargetId, setSelectedTargetId] = useState(ALL_SECTIONS_TARGET_ID);
    const [draftLooks, setDraftLooks] = useState({});
    const [scratchScope, setScratchScope] = useState('');
    const [scratchError, setScratchError] = useState('');
    const [lookSaveState, setLookSaveState] = useState('');
    const [pendingLookSave, setPendingLookSave] = useState(false);
    const keepScratchAfterSave = useRef(false);
    const [deletedLook, setDeletedLook] = useState(null);
    const livePreviewTimer = useRef(null);
    const livePreviewSeq = useRef(0);
    const browsePreviewSeq = useRef(0);
    const savedComboSeq = useRef(0);
    const cardReturnConsumed = useRef(false);
    const latestPreviewIntent = useRef(null);
    // The preview currently on its way to the card, by intent. A second tap on
    // the same tile while the first is in flight is one owner intent, not two
    // commands: it joins the pending send instead of issuing another.
    const inFlightPreview = useRef(null);
    const syncedPreviewSelectionRef = useRef('');
    const installIntentRef = useRef(null);

    const patternAuthorizationBinding = useMemo(() => {
      const readiness = cardLink?.readiness || {};
      const card = cardLink?.card || {};
      const studioStructureFingerprint = cardProjectFingerprint(serializeProject());
      return {
        cardId: readiness.cardId || card.id || card.cardId || '',
        firmwareVersion: readiness.firmwareVersion || card.firmwareVersion || '',
        buildId: readiness.buildId || card.buildId || '',
        bootId: readiness.bootId || cardLink?.validatedBootId || '',
        installedProjectId: installedProjectIdFromCardStatus(readiness),
        installedProjectFingerprint: readiness.projectFingerprint || '',
        studioProjectId: projectId,
        // A verified installation record binds THIS project to the card and
        // carries the fingerprint the card itself reported when the binding was
        // made. Recomputing one from a project adopted back off a card produces
        // a different hash than the card holds, which made
        // `issueCardEditAuthorization` refuse a correctly installed card
        // permanently. The record only stands in while the project structure it
        // named is unchanged (see `structurallyInstalledRecord`), so a rewire
        // falls straight back to the computed fingerprint and the grant lapses.
        studioProjectFingerprint: structurallyInstalledRecord(projectLifecycle, studioStructureFingerprint)
          ?.projectFingerprint || studioStructureFingerprint,
        projectGeneration: projectLifecycle.generation,
      };
    }, [cardLink?.card, cardLink?.readiness, cardLink?.validatedBootId, projectId, projectLifecycle, serializeProject]);
    const lastExactPatternAuthorizationBindingRef = useRef(null);
    const exactAuthorizationExpiresAt = currentCardProjectAuthorizationExpiresAt(patternAuthorizationBinding);
    if (exactAuthorizationExpiresAt > 0) {
      lastExactPatternAuthorizationBindingRef.current = patternAuthorizationBinding;
    }
    const lastExactBinding = lastExactPatternAuthorizationBindingRef.current;
    const canRetainAuthorizationDuringBridgeCheck = !cardLink?.readiness
      && lastExactBinding
      && patternAuthorizationBinding.studioProjectId === lastExactBinding.studioProjectId
      && patternAuthorizationBinding.studioProjectFingerprint === lastExactBinding.studioProjectFingerprint
      && patternAuthorizationBinding.projectGeneration === lastExactBinding.projectGeneration
      && (!patternAuthorizationBinding.cardId || patternAuthorizationBinding.cardId === lastExactBinding.cardId)
      && (!patternAuthorizationBinding.firmwareVersion || patternAuthorizationBinding.firmwareVersion === lastExactBinding.firmwareVersion)
      && (!patternAuthorizationBinding.buildId || patternAuthorizationBinding.buildId === lastExactBinding.buildId)
      && (!patternAuthorizationBinding.bootId || patternAuthorizationBinding.bootId === lastExactBinding.bootId);
    const effectivePatternAuthorizationBinding = exactAuthorizationExpiresAt > 0
      ? patternAuthorizationBinding
      : canRetainAuthorizationDuringBridgeCheck
        ? lastExactBinding
        : patternAuthorizationBinding;
    const patternAuthorizationRef = useRef(effectivePatternAuthorizationBinding);
    patternAuthorizationRef.current = effectivePatternAuthorizationBinding;
    const [, refreshPatternAuthorization] = useReducer(value => value + 1, 0);
    const authorizationExpiresAt = currentCardProjectAuthorizationExpiresAt(effectivePatternAuthorizationBinding);
    const projectAuthorizationCurrent = authorizationExpiresAt > 0;
    useEffect(() => {
      if (!authorizationExpiresAt) return undefined;
      const timeout = setTimeout(
        () => refreshPatternAuthorization(),
        Math.max(0, authorizationExpiresAt - Date.now()) + 1,
      );
      return () => clearTimeout(timeout);
    }, [authorizationExpiresAt]);

    // The playback gate, extracted verbatim into lib/cardAccess.js (phase 6):
    // patterns, brightness, and scenes stay available while the card's radio
    // reassociates, even though the command gate (`connected`) is shut.
    // Installs from here re-check the command gate themselves.
    const patternCardAccess = useMemo(
      () => deriveCardAccess(cardLink, { connected }).playback,
      [cardLink, connected],
    );
    const patternAccessRef = useRef(patternCardAccess);
    patternAccessRef.current = patternCardAccess;
    const previousPatternAccessRef = useRef(patternCardAccess);
    const patternPreviewAuthorityKey = [
      patternCardAccess,
      cardLink?.readiness?.cardId || cardLink?.card?.id || cardLink?.card?.cardId || '',
      cardLink?.readiness?.firmwareVersion || cardLink?.card?.firmwareVersion || '',
      cardLink?.readiness?.buildId || cardLink?.card?.buildId || '',
      cardLink?.readiness?.bootId || cardLink?.validatedBootId || '',
    ].join('|');
    const previousPatternAuthorityKeyRef = useRef(patternPreviewAuthorityKey);

    // Live, un-retained card evidence for `ensureCardEditAuthorization`. This
    // deliberately reads `cardLink.readiness` directly rather than the
    // effective binding: during a bridge re-check the binding may be the
    // retained last-exact one, and a retained binding must never be able to
    // mint a new grant off itself.
    const liveCardEvidence = useMemo(() => {
      const readiness = cardLink?.readiness;
      if (!readiness) return null;
      const card = cardLink?.card || {};
      return {
        cardId: readiness.cardId || card.id || card.cardId || '',
        firmwareVersion: readiness.firmwareVersion || card.firmwareVersion || '',
        buildId: readiness.buildId || card.buildId || '',
        bootId: readiness.bootId || cardLink?.validatedBootId || '',
        projectId: installedProjectIdFromCardStatus(readiness),
        projectFingerprint: readiness.projectFingerprint || '',
        projectRevision: readiness.projectRevision,
      };
    }, [cardLink?.card, cardLink?.readiness, cardLink?.validatedBootId]);
    // Only an installation record that still describes the project as it stands
    // can support a derived authorization: either the structure it named is
    // unchanged (a card-adopted project, whose fingerprints legitimately
    // differ), or nothing at all has been edited since the install.
    const installationRecord = structurallyInstalledRecord(
      projectLifecycle,
      cardProjectFingerprint(serializeProject()),
    ) || currentInstallation(projectLifecycle);
    const authorizationEvidenceRef = useRef(null);
    authorizationEvidenceRef.current = { cardEvidence: liveCardEvidence, installation: installationRecord };

    // Was: a bare `hasCurrentCardProjectAuthorization` read, which meant the
    // ONLY way to authorize pattern commands was the Setup-screen "load the
    // card's project" button — an in-memory grant that a reload erased. An
    // owner with a connected, verified card whose installed project matches the
    // open one clicked a pattern and nothing at all was sent. Deriving the
    // grant from that same evidence (see `ensureCardEditAuthorization`) removes
    // the button press without removing a single check.
    const hasCurrentProjectAuthorization = useCallback(() => (
      ensureCardEditAuthorization({
        binding: patternAuthorizationRef.current,
        cardEvidence: authorizationEvidenceRef.current?.cardEvidence || null,
        installation: authorizationEvidenceRef.current?.installation || null,
        linkReady: patternAccessRef.current === 'ready',
      })
    ), []);
    const currentPatternCardAccess = useCallback(() => {
      const access = patternAccessRef.current;
      if (access !== 'ready') return access;
      if (!hasCurrentProjectAuthorization()) return 'project';
      const binding = patternAuthorizationRef.current;
      const readiness = cardLink?.readiness || {};
      const authority = decideLiveControlProjectAuthority({
        connected: true,
        studioProject: {
          projectId: binding.studioProjectId,
          projectFingerprint: binding.studioProjectFingerprint,
        },
        cardStatus: {
          ...readiness,
          runtimePhase: readiness.runtimePhase || 'ready',
          playbackReady: readiness.playbackReady ?? true,
          projectId: binding.installedProjectId,
          projectFingerprint: binding.installedProjectFingerprint,
        },
      });
      if (authority.ok) return 'ready';
      return authority.state === 'project-mismatch' ? 'project' : 'recovery';
    }, [cardLink?.readiness, hasCurrentProjectAuthorization]);
    // Preview authority, deliberately weaker than install authority.
    //
    // A live preview writes nothing: the card holds it in RAM, a reboot
    // restores the installed startup look, and the firmware accepts any of its
    // compiled-in patterns whatever project is stored (`isSupportedCompiledPattern`,
    // main.cpp). So a preview needs only the right card, ready to play. It does
    // NOT need proof that this Studio project is the one installed — requiring
    // that turned the pattern grid, which exists to try patterns, into a
    // surface that refused every tap until the owner installed first.
    //
    // `currentPatternCardAccess` above keeps the full project gate and stays
    // the gate for installs, which do persist.
    const currentPatternPreviewAccess = useCallback(() => patternAccessRef.current, []);

    // What the card holds. Read once per authority (card, firmware, boot) and
    // per installed revision, only while playback access is ready, so the
    // section row can print "Card holds Ring 1, Ring 2" as a fact. Null until
    // read; the summary then says nothing rather than guessing.
    const [cardZonesPayload, setCardZonesPayload] = useState(null);
    const cardInstalledRevisionKey = String(cardLink?.readiness?.projectRevision ?? '');
    useEffect(() => {
      let cancelled = false;
      if (patternCardAccess !== 'ready') { setCardZonesPayload(null); return undefined; }
      const expectedCardId = cardLink?.readiness?.cardId || cardLink?.card?.id || cardLink?.card?.cardId || '';
      readCardZonesFromCard({ ...cardConnectionOptionsFor(cardLink, cardHost), expectedCardId, timeoutMs: 1800 })
        .then(payload => { if (!cancelled) setCardZonesPayload(payload); })
        .catch(() => { if (!cancelled) setCardZonesPayload(null); });
      return () => { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patternCardAccess, patternPreviewAuthorityKey, cardInstalledRevisionKey, cardHost]);
    const matchesCurrentCardProjectEvidence = useCallback((evidence = {}) => {
      const binding = patternAuthorizationRef.current;
      const matches = hasCurrentProjectAuthorization()
        && String(evidence.cardId || '').trim().toLowerCase() === String(binding.cardId || '').trim().toLowerCase()
        && String(evidence.firmwareVersion || '').trim() === String(binding.firmwareVersion || '').trim()
        && String(evidence.buildId || '').trim() === String(binding.buildId || '').trim()
        && String(evidence.projectId || '').trim() === String(binding.installedProjectId || '').trim()
        && String(evidence.projectFingerprint || '').trim().toLowerCase() === String(binding.installedProjectFingerprint || '').trim().toLowerCase();
      // This ran against a fresh /api/firmware-info read, so a match is the
      // strongest proof available that the authorization's claim still holds.
      // Renew the staleness window off it rather than let a clock revoke a
      // fact the card just re-confirmed. Never called during render.
      if (matches) renewCardEditAuthorization(binding);
      return matches;
    }, [hasCurrentProjectAuthorization]);

    const invalidatePendingPreview = useCallback(() => {
      browsePreviewSeq.current += 1;
      livePreviewSeq.current += 1;
      if (livePreviewTimer.current) {
        clearTimeout(livePreviewTimer.current);
        livePreviewTimer.current = null;
      }
      dispatchPreviewAction({ type: 'reset' });
      setPreviewFailure(null);
    }, []);

    const blockPatternCardEffect = useCallback((access = patternAccessRef.current) => {
      invalidatePendingPreview();
      setPatternCardGate(access === 'blank' ? 'blank' : access === 'project' ? 'project' : 'recovery');
      setHandoffUrl('');
      setStatusKind('err');
      setStatus(patternGateMessage(access === 'blank' ? 'blank' : access === 'project' ? 'project' : 'recovery'));
    }, [invalidatePendingPreview]);

    // Was: a scrollIntoView effect keyed on patternCardGateSeq, bringing the
    // in-flow refusal notice back into view on a repeated tap because the
    // hero status sits far above the pattern grid. The refusal now floats in
    // the notice layer (see the 'pattern-gate-notice' publish effect), so it
    // is always visible and never needs scrolling to.

    useEffect(() => {
      // Every readiness poll that still reports the exact bound card, boot,
      // and installed project is fresh evidence that the authorization's claim
      // holds, so it renews the window. This can only renew, never issue:
      // renewCardEditAuthorization re-checks the full identity binding, so a
      // poll describing a different card or a diverged project fingerprint
      // renews nothing and the authorization lapses exactly as before.
      if (patternCardAccess !== 'ready') return;
      renewCardEditAuthorization(effectivePatternAuthorizationBinding);
    }, [patternCardAccess, effectivePatternAuthorizationBinding]);

    // Derive the grant as soon as the evidence supports it, not only at the
    // moment of a click, so the screen renders as authorized (no "verify this
    // project" banner over a card that is demonstrably holding it) and the
    // first pattern tap of a session goes straight out.
    useEffect(() => {
      if (patternCardAccess !== 'ready' || projectAuthorizationCurrent) return;
      if (hasCurrentProjectAuthorization()) refreshPatternAuthorization();
    }, [currentInstallation, hasCurrentProjectAuthorization, liveCardEvidence, patternCardAccess, projectAuthorizationCurrent]);

    // Read inside async callbacks, where the closed-over value is whatever it
    // was when the request was ISSUED — which is exactly the thing a stale
    // response must not act on.
    const projectAuthorizationRef = useRef(projectAuthorizationCurrent);
    projectAuthorizationRef.current = projectAuthorizationCurrent;
    const previousProjectAuthorizationRef = useRef(projectAuthorizationCurrent);
    useEffect(() => {
      const previous = previousProjectAuthorizationRef.current;
      previousProjectAuthorizationRef.current = projectAuthorizationCurrent;
      if (previous && !projectAuthorizationCurrent && patternAccessRef.current === 'ready') {
        // A grant that merely aged out while the card kept proving the same
        // facts is not a loss of authority — re-derive it before telling the
        // owner to go verify something that never stopped being true.
        if (hasCurrentProjectAuthorization()) {
          previousProjectAuthorizationRef.current = true;
          refreshPatternAuthorization();
          return;
        }
        // Losing the grant closes the install-shaped controls and says so.
        // It is NOT a refused tap: previews no longer ride on this
        // authorization, so raising the grid's "that tap was not sent to the
        // card" notice here would be a false alarm over a grid whose taps
        // still reach the strip. Say the true thing — installs need
        // revalidating — and leave the pattern grid alone.
        setColorOrderOpen(false);
        setStatusKind('err');
        setStatus(patternGateMessage('project'));
      }
    }, [hasCurrentProjectAuthorization, projectAuthorizationCurrent]);

    useEffect(() => {
      // Card authority is tied to the exact readiness envelope that existed
      // when the gesture began. A reboot, disconnect, or recovery transition
      // must invalidate an in-flight bridge acquisition so its late promise
      // cannot replay the old selection after authority has been lost.
      const previousAccess = previousPatternAccessRef.current;
      previousPatternAccessRef.current = patternCardAccess;
      const linkState = String(cardLink?.state || '');
      const transitionalBridgeCheck = linkState === 'connecting'
        || linkState === 'revalidating'
        || linkState === 'reconnecting-bridge'
        || (linkState === 'connected-bridge' && !cardLink?.readiness);
      const explicitReadinessLoss = Boolean(cardLink?.readiness)
        && classifyCardReadiness(cardLink.readiness, { expectedCard: cardLink?.expectedCard || null }).playbackAccess !== 'ready';
      if (patternCardAccess !== 'ready' && previousAccess === 'ready'
        && (explicitReadinessLoss || !transitionalBridgeCheck)) {
        previousPatternAuthorityKeyRef.current = patternPreviewAuthorityKey;
        setColorOrderOpen(false);
        blockPatternCardEffect(patternCardAccess);
        return;
      }
      // Routine status polling replaces the readiness envelope even when it
      // confirms the same exact card and boot. Cancelling on every replacement
      // erased the 80 ms pattern-send timer, so a tap changed Studio while the
      // strip did nothing. Only an actual authority change invalidates a send.
      if (!transitionalBridgeCheck
        && previousPatternAuthorityKeyRef.current !== patternPreviewAuthorityKey) {
        previousPatternAuthorityKeyRef.current = patternPreviewAuthorityKey;
        invalidatePendingPreview();
      }
      if (patternCardAccess !== 'ready' && !transitionalBridgeCheck) setHandoffUrl('');
    }, [blockPatternCardEffect, cardLink?.expectedCard, cardLink?.readiness, cardLink?.state, invalidatePendingPreview, patternCardAccess, patternPreviewAuthorityKey]);

    // Warm default so first load reads warm (Lava Lamp-like) like the mockup,
    // unless a real saved default look exists.
    //
    // Distinguishing factory aurora from a user-picked pattern: a fresh project
    // is always seeded with a defaultLook of patternId 'aurora' (the factory
    // default), so the presence of a defaultLook alone does not prove the user
    // chose anything. We treat the saved pattern as a real, deliberate choice
    // only when at least one of these is true:
    //   - the resolved patternId is something other than the factory 'aurora'
    //   - the user named the project (name is not the default 'Untitled Project')
    //   - the project already has saved looks (the user has saved at least once)
    // When none hold, this looks like an untouched factory project, so we prefer
    // the warm default for the INITIAL preview only and never mutate saved state.
    const warmDefaultPatternId = useMemo(() => defaultWarmPatternId(), []);
    const FACTORY_DEFAULT_PATTERN_ID = 'aurora';
    const savedDefaultPatternId = standaloneController?.defaultLook?.patternId;
    const hasNamedProject = Boolean(projectName) && projectName !== 'Untitled Project';
    const hasSavedLooks = Array.isArray(standaloneController?.looks) && standaloneController.looks.length > 0;
    const looksLikeFactoryProject =
      savedDefaultPatternId === FACTORY_DEFAULT_PATTERN_ID && !hasNamedProject && !hasSavedLooks;
    const hasSavedDefaultPattern = Boolean(
      standaloneController?.defaultLook &&
      (getCardPatternById(savedDefaultPatternId)
        || (workspaceAssets.ready && getPatternById(savedDefaultPatternId))) &&
      !looksLikeFactoryProject,
    );
    const savedGlobalLook = normalizeSectionVisualLook(
      hasSavedDefaultPattern
        ? standaloneController?.defaultLook
        : { ...(standaloneController?.defaultLook || {}), patternId: warmDefaultPatternId },
    );
    const savedLooks = normalizeSavedLooks(standaloneController?.looks);
    const activeLookId = standaloneController?.activeLookId || '';
    const editingSavedLook = savedLooks.find(item => item.id === activeLookId) || null;
    const hasUnsavedLookChanges = Object.entries(draftLooks).some(([id, value]) => JSON.stringify(normalizeSectionVisualLook(value)) !== JSON.stringify(normalizeSectionVisualLook(id === ALL_SECTIONS_TARGET_ID ? editingSavedLook?.defaultLook || standaloneController?.defaultLook : editingSavedLook?.sectionLooks?.[id]))) || Boolean(mixName.trim() && mixName.trim() !== editingSavedLook?.label);
    const board = useMemo(() => normalizePatchBoard(patchBoard, strips), [patchBoard, strips]);
    const latestBoardRef = useRef(board);
    const latestControllerRef = useRef(standaloneController);
    latestBoardRef.current = board;
    latestControllerRef.current = standaloneController;

    // The project derives the section list once (ProjectContext). Patterns
    // only departs from it when the saved default pattern is unknown to this
    // card and a warm default stands in; the sections, order and names are
    // still the project's, because the structural inputs are the same.
    const savedGlobalLookKey = JSON.stringify(savedGlobalLook);
    const sectionTargets = useMemo(
      () => (hasSavedDefaultPattern ? projectSectionTargets : deriveProjectSectionTargets(savedGlobalLook)),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [hasSavedDefaultPattern, projectSectionTargets, deriveProjectSectionTargets, savedGlobalLookKey],
    );
    const selectedTarget = sectionTargets.find(target => target.id === selectedTargetId) || sectionTargets[0];
    const savedTargetLook = normalizeSectionVisualLook(selectedTarget?.look || savedGlobalLook);
    const draftDefaultLook = normalizeSectionVisualLook(draftLooks[ALL_SECTIONS_TARGET_ID] || savedGlobalLook);
    const resolveDraftTargetLook = useCallback((target) => {
      if (!target) return draftDefaultLook;
      const targetDraft = draftLooks[target.id];
      if (targetDraft) return normalizeSectionVisualLook(targetDraft);
      if (target.kind === 'section' && draftLooks[ALL_SECTIONS_TARGET_ID]) return draftDefaultLook;
      return normalizeSectionVisualLook(target.look || draftDefaultLook);
    }, [draftDefaultLook, draftLooks]);
    const look = normalizeSectionVisualLook(
      draftLooks[selectedTarget?.id] ||
      (selectedTarget?.kind === 'section' && draftLooks[ALL_SECTIONS_TARGET_ID] ? draftDefaultLook : savedTargetLook),
    );
    const breatheSummary = !look.customBreathe
      ? 'Breathe off'
      : look.breatheLowerPct === look.breatheUpperPct
        ? `Breathe · ${look.breatheLowerPct}% steady`
        : `Breathe · ${look.breatheLowerPct}–${look.breatheUpperPct}% · ${look.breatheCycleSeconds}s`;
    const effectiveSectionTargets = useMemo(
      () => sectionTargets.map(target => ({ ...target, look: resolveDraftTargetLook(target) })),
      [resolveDraftTargetLook, sectionTargets],
    );
    const patternPreviewSegments = useMemo(
      () => buildPatternPreviewSegments({
        strips,
        patchBoard: board,
        wiring,
        compiledWiring,
        targets: effectiveSectionTargets,
        resolvePatternId: resolveCodePatternId,
        paletteForPattern: patternId => (
          REAL_PATTERN_BY_ID.get(patternId)?.pal || adaptPattern(patternId)?.pal
        ),
      }),
      [board, compiledWiring, effectiveSectionTargets, strips, wiring],
    );
    const previewTargetIds = useMemo(
      () => patternPreviewSegments.map(segment => segment.id),
      [patternPreviewSegments],
    );
    const previewTargetKey = previewTargetIds.join('|');
    const [previewUiState, setPreviewUiState] = useState(() => ({
      projectId,
      ...readPatternPreviewUiState({ projectId, targetIds: previewTargetIds }),
    }));
    useEffect(() => {
      setPreviewUiState(previous => {
        if (previous.projectId !== projectId) {
          return {
            projectId,
            ...readPatternPreviewUiState({ projectId, targetIds: previewTargetIds }),
          };
        }
        if (previewTargetIds.includes(previous.lastTargetId)) return previous;
        return { ...previous, lastTargetId: previewTargetIds[0] || '' };
      });
    }, [projectId, previewTargetKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const previewMode = previewUiState.projectId === projectId && previewUiState.mode === 'piece'
      ? 'piece'
      : 'strip';
    const lastPreviewTargetId = previewTargetIds.includes(previewUiState.lastTargetId)
      ? previewUiState.lastTargetId
      : (previewTargetIds[0] || '');
    useEffect(() => {
      if (previewUiState.projectId !== projectId) return;
      writePatternPreviewUiState({
        projectId,
        state: { mode: previewMode, lastTargetId: lastPreviewTargetId },
      });
    }, [lastPreviewTargetId, previewMode, previewUiState.projectId, projectId]);
    const visiblePatternPreviewSegments = previewMode === 'piece'
      ? patternPreviewSegments
      : patternPreviewSegments.filter(segment => segment.id === lastPreviewTargetId);
    const patternPreviewViewBox = previewMode === 'piece'
      ? viewBox
      : fitPreviewViewBox(visiblePatternPreviewSegments, viewBox);
    const previewTargetName = previewMode === 'piece'
      ? 'Whole piece'
      : (visiblePatternPreviewSegments[0]?.label || 'LED strip');

    const rawPlaylist = isImplicitDefaultPatternPlaylist(standaloneController?.playlist)
      ? []
      : standaloneController?.playlist;
    const playlist = normalizeCardPlaylist(rawPlaylist, { savedLooks, allowEmpty: true });

    // ── adapted (real) pattern bank + saved mixes in the mockup's shape ──
    const realMixes = useMemo(
      () => savedLooks.map(adaptSavedLook).filter(Boolean),
      [savedLooks],
    );
    const customPatterns = useMemo(() => (
      workspaceAssets.ready
        ? loadCustomPatterns().map(pattern => adaptPattern({
          ...pattern,
          label: pattern.name || pattern.label || pattern.id,
          description: pattern.description || 'Custom pattern',
        }))
        : []
    ), [workspaceAssets.generation, workspaceAssets.ready]);
    const customPatternById = useMemo(
      () => new Map(customPatterns.map(pattern => [pattern.id, pattern])),
      [customPatterns],
    );
    const ALL = useMemo(() => [...realMixes, ...customPatterns, ...REAL_PATTERNS], [customPatterns, realMixes]);
    // Map an adapted mix-card id back to its real saved look (adaptSavedLook
    // sets the card id to look.id when present, else `mix-${patternId}`).
    const findSavedLook = useCallback(
      (cardId) => savedLooks.find(l => (l.id || `mix-${l.patternId}`) === cardId),
      [savedLooks],
    );
    // A card-returned saved look is selected by its canonical Studio look ID;
    // ordinary pattern edits continue to follow the live pattern itself.
    const selId = savedLooks.some(savedLook => savedLook.id === activeLookId)
      ? activeLookId
      : (customPatternById.has(activePatternId) ? activePatternId : look.patternId);
    const sel = REAL_PATTERN_BY_ID.get(selId) || customPatternById.get(selId) || adaptPattern(selId) || ALL[0];
    const tint = sel.pal[2] || sel.pal[sel.pal.length - 1];
    const patternNameFor = useCallback((patternId) => {
      if (!patternId) return '';
      const entry = REAL_PATTERN_BY_ID.get(patternId) || customPatternById.get(patternId) || adaptPattern(patternId) || getCardPatternById(patternId);
      return entry?.label || entry?.name || String(patternId);
    }, [customPatternById]);
    const cardHoldsLine = useMemo(() => cardSectionSummary(sectionTargets, cardZonesPayload), [sectionTargets, cardZonesPayload]);
    const sectionCount = sectionTargets.filter(target => target.kind === 'section').length;
    const currentComboLabel = (() => {
      const sections = effectiveSectionTargets.filter(t => t.kind === 'section');
      if (sections.length > 2) return `${sections.length}-layer mix`;
      if (sections.length) {
        return sections.map(t => `${targetLabel(t)} ${getCardPatternById(t.look?.patternId)?.label || t.look?.patternId}`).join(' + ');
      }
      return `${sel.label} whole piece`;
    })();

    const filtered = ALL.filter((p) => {
      if (cat === "mix") { if (!p.mix) return false; } else if (cat !== "all" && p.cat !== cat) return false;
      if (q && !p.label.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    // Page in the next block when the reader ARRIVES at the end of the list —
    // not merely whenever we happen to be observing while already there.
    //
    // IntersectionObserver reports the current state the moment you observe, and
    // this effect re-observes on every change to `filtered.length`. Saving a look
    // changes that length, so the re-observe reported "still intersecting" and
    // paged in another 24 for an action that has nothing to do with scrolling.
    // The sentinel only came within the 600px margin at rest once the design
    // target moved below the bank and the grid rose up the page; before that the
    // bug was simply out of reach.
    //
    // So: fire on the EDGE, not the level. A first report is remembered, never
    // acted on; paging happens when the sentinel goes from out of range to in.
    // The "Show more" and "Show all" buttons remain for anyone already at the
    // end, so nothing is unreachable without scrolling.
    useEffect(() => {
      const node = patternSentinelRef.current;
      if (!node || typeof IntersectionObserver === 'undefined') return undefined;
      // An observer reports the current state the instant you observe, and this
      // effect re-observes on every change to `filtered.length`. Saving a look
      // changes that length, so the re-observe answered "you are at the end" and
      // paged in another 24 for an action that involved no scrolling at all.
      // That only became reachable once the design target moved below the bank
      // and the grid rose into the 600px margin; the bug predates the move.
      //
      // The opening report describes where the reader already is, not somewhere
      // they have arrived, so it is recorded and never acted on. Every later
      // report is a real scroll. "Show more" and "Show all" stay for anyone
      // sitting at the end already, so nothing needs scrolling to be reached.
      let primed = false;
      const observer = new IntersectionObserver(entries => {
        const atEnd = entries.some(entry => entry.isIntersecting);
        if (!primed) { primed = true; return; }
        if (atEnd) {
          setVisibleCount(count => Math.min(filtered.length, count + PATTERN_PAGE));
        }
      }, { rootMargin: '600px 0px' });
      observer.observe(node);
      return () => observer.disconnect();
    }, [cat, q, filtered.length]);
    const playlistSize = playlist.length;

    // ── controller / preview helpers (ported from PatternsScreen) ───────
    const runtimeBuild = useMemo(() => {
      try {
        return {
          runtimePackage: buildCardRuntimePackageFromProject({ projectId, projectName, strips, patchBoard: board, compiledWiring, standaloneController }),
          error: null,
        };
      } catch (error) {
        return { runtimePackage: null, error };
      }
    }, [projectId, projectName, strips, board, compiledWiring, standaloneController]);
    const runtimePackage = runtimeBuild.runtimePackage;
    const hardwareConfigurationIssue = runtimeBuild.error
      ? String(runtimeBuild.error.message || runtimeBuild.error).replace('is already owned by an LED output or another control', 'is already used by an LED output or another control')
      : '';
    const encoderPins = standaloneController?.controls?.encoder || {};
    const canRemoveDuplicateAlternatePress = hardwareConfigurationIssue
      && Number(encoderPins.press) >= 0
      && Number(encoderPins.press) === Number(encoderPins.alternatePress);
    const safeProjectName = (projectName || 'lightweaver-piece').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

    const updateController = (patch) => {
      return setStandaloneController(prev => {
        const current = prev || {};
        return {
          ...current,
          ...patch,
          led: patch.led ? { ...(current.led || {}), ...patch.led } : current.led,
          defaultLook: patch.defaultLook
            ? normalizeSectionVisualLook({ ...(current.defaultLook || {}), ...patch.defaultLook })
            : current.defaultLook,
          controls: patch.controls
            ? {
                ...(current.controls || {}),
                ...patch.controls,
                encoder: patch.controls.encoder
                  ? { ...(current.controls?.encoder || {}), ...patch.controls.encoder }
                  : current.controls?.encoder,
              }
            : current.controls,
        };
      });
    };

    const removeDuplicateAlternatePress = () => {
      const result = updateController({ controls: { encoder: { alternatePress: -1 } } });
      if (result?.ok === false) {
        setStatusKind('err');
        setStatus(result.errors?.[0]?.message || 'Open wiring to change the duplicate GPIO assignment.');
      }
    };

    const scheduleLivePreview = useCallback((nextLook, target = selectedTarget, delayMs = 0, { bridgeAuthority = null, expectedControlPatch = null } = {}) => {
      const hasCurrentAuthority = () => {
        if (currentPatternPreviewAccess() !== 'ready') return false;
        if (patternAccessRef.current === 'ready') return true;
        if (!bridgeAuthority) return false;
        const state = getCardBridgeState();
        return Boolean(
          state.verified
          && state.identityVerified
          && state.runtimePlaybackReady
          && state.lifecycle === bridgeAuthority.lifecycle
          && normalizeCardHost(state.host) === bridgeAuthority.host
          && state.card?.id === bridgeAuthority.cardId
          && state.card?.firmwareVersion === bridgeAuthority.firmwareVersion
          && state.card?.buildId === bridgeAuthority.buildId
        );
      };
      if (!hasCurrentAuthority()) {
        blockPatternCardEffect(currentPatternPreviewAccess());
        return;
      }
      setPatternCardGate('');
      setHandoffUrl('');
      const zoneForIntent = target?.kind === 'section' ? target.zoneId || target.id : '';
      const intentSignature = JSON.stringify({ look: nextLook, zone: zoneForIntent, patch: expectedControlPatch || null });
      if (inFlightPreview.current && inFlightPreview.current.signature === intentSignature) return;
      if (livePreviewTimer.current) clearTimeout(livePreviewTimer.current);
      const sequence = ++livePreviewSeq.current;
      inFlightPreview.current = { signature: intentSignature, sequence };
      // The world this request was issued into. If the project authorization
      // changes before it lands, the response describes a world that no longer
      // exists and must not speak for the present — see the status write below.
      const authorizationAtRequest = projectAuthorizationRef.current;
      latestPreviewIntent.current = { look: nextLook, target, expectedControlPatch };
      dispatchPreviewAction({ type: 'start', revision: sequence });
      setPreviewFailure(null);
      const zone = target?.kind === 'section' ? target.zoneId || target.id : '';
      livePreviewTimer.current = setTimeout(async () => {
        setHandoffUrl('');
        if (!hasCurrentAuthority()) {
          if (inFlightPreview.current?.sequence === sequence) inFlightPreview.current = null;
          blockPatternCardEffect(currentPatternPreviewAccess());
          return;
        }
        try {
          // Was: a fresh `/api/firmware-info` read on every tap, whose result
          // had to prove this Studio project was the installed one before a
          // single light command went out. That is install authority, and it
          // cost a full round-trip of latency ahead of every preview. A
          // preview persists nothing, so it is gated on the card being the
          // right card and ready — checked above — and sends immediately.
          //
          // Was also: `ensureCardSectionsForPreview`, which pushed a whole
          // `/api/config` when the target zone was missing from the card.
          // Writing the card's storage to preview a pattern is an install
          // wearing a preview's name; ask the card to fall back to the whole
          // strip instead, which `pushLivePreviewToCard` reports back through
          // `previewZoneFallback` rather than doing silently.
          // A tap that lands while the card is still starting used to become a
          // failure message. The card answers 423 for a second or two after a
          // boot or a config write, and readiness is polled far less often than
          // an owner taps, so the request goes out and is refused — about a
          // moment that has passed by the time anyone reads the message.
          //
          // Safe to repeat: setting THIS pattern means the same thing twice,
          // and a newer tap makes the intent check throw a non-transient error,
          // which stops the retry immediately rather than fighting it.
          //
          // But a reply LOST after the card applied the command is not a card
          // that never heard it, and sending again in that case is a second
          // real command. Before any retry the card is read back; if it
          // already shows this pattern, that read is the acknowledgement.
          const previewLook = { ...nextLook, zone, syncZones: target?.kind === 'section' ? false : true };
          // The probe inside this can take a moment; a newer preview
          // superseding this one while it runs is not a new risk it
          // introduces — `pushLivePreviewToCard`'s own "latest wins"
          // arbitration and `requireCurrentPreviewIntent` already cancel a
          // superseded send, exactly as they did before this existed.
          const { needsBridge: preferBridge } = await resolveCardBridgePreference({ cardLink, cardHost });
          const previewOptions = {
            host: cardHost,
            timeoutMs: 2200,
            fallbackMissingZoneToAll: true,
            preferBridge,
            revision: sequence,
            ...(expectedControlPatch ? { expectedControlPatch } : {}),
          };
          const response = await retryWhileTransient(
            () => pushLivePreviewToCard(previewLook, previewOptions),
            {
              attempts: 3,
              delayMs: 350,
              readBack: () => (sequence === livePreviewSeq.current
                ? readBackLivePreview(previewLook, { ...previewOptions, timeoutMs: 1200 })
                : null),
            },
          );
          if (inFlightPreview.current?.sequence === sequence) inFlightPreview.current = null;
          if (sequence === livePreviewSeq.current && hasCurrentAuthority()) {
            dispatchPreviewAction({ type: 'confirm', revision: sequence });
            setPreviewFailure(null);
            markCardLookConfirmed({ ...nextLook, zone, syncZones: target?.kind === 'section' ? false : true });
            // The pattern is on the strip either way, so this is a note, not a
            // failure — but the owner is looking at a section tab and the whole
            // piece just changed, so say which one actually happened.
            const usedFallback = previewResponseUsedZoneFallback(response);
            // Only speak if the authorization has not moved under us. Losing it
            // raises "verify that this exact Studio project is still installed
            // before sending lights" — and this branch used to overwrite that,
            // with the section note or with an empty string, because a preview
            // issued BEFORE the loss can land up to a second after it (the send
            // retries three times, 350ms apart). Measured, the warning appeared
            // at 22ms and was gone at 61ms, roughly one run in forty: the owner
            // was then told nothing and would send lights believing the card
            // still matched. A routine note is not worth a safety warning, so
            // when the world has changed this response says nothing at all.
            if (projectAuthorizationRef.current === authorizationAtRequest) {
              setStatusKind(usedFallback ? 'ok' : '');
              setStatus(usedFallback
                ? `The card has no “${targetLabel(target)}” section yet, so this played on the whole piece. Install to give the card your sections.`
                : '');
            }
          }
        } catch (error) {
          if (inFlightPreview.current?.sequence === sequence) inFlightPreview.current = null;
          if (error?.reason === 'superseded') {
            return;
          }
          if (sequence === livePreviewSeq.current) {
            const failure = classifyCardActionFailure(error);
            dispatchPreviewAction({ type: 'fail', revision: sequence, error: failure.message });
            setPreviewFailure(failure);
            setStatusKind('err');
            if (error?.reason === 'mixed-content') {
              setHandoffUrl(buildCardConfigHandoffUrl(cardHost, runtimePackage));
            }
            setStatus(failure.message);
          }
        }
      }, delayMs);
    }, [blockPatternCardEffect, cardHost, cardLink?.transport, currentPatternPreviewAccess, markCardLookConfirmed, selectedTarget]);

    const retryLatestPreview = useCallback(() => {
      const latest = latestPreviewIntent.current;
      if (!latest) return;
      scheduleLivePreview(latest.look, latest.target, 0, { expectedControlPatch: latest.expectedControlPatch });
    }, [scheduleLivePreview]);

    const openConnectionCenter = useCallback(() => {
      // Reached only from reconnect/pairing failure paths, where the card is
      // not ready — the connect intent opens the Connection Center via the
      // shell's connect-panel event instead of DOM-clicking the footer chip.
      openCardFlow('connect');
    }, []);

    useEffect(() => () => {
      invalidatePendingPreview();
    }, [invalidatePendingPreview]);

    useEffect(() => {
      if (sectionTargets.some(target => target.id === selectedTargetId)) return;
      setSelectedTargetId(ALL_SECTIONS_TARGET_ID);
    }, [sectionTargets, selectedTargetId]);

    useEffect(() => {
      invalidatePendingPreview();
      setHandoffUrl('');
      setStatusKind('');
      setStatus('');
      const scratch = readPatternEditSession(projectId, 'patterns');
      setDraftLooks(scratch?.draftLooks || {});
      setMixName(scratch?.mixName ?? editingSavedLook?.label ?? '');
      setSelectedTargetId(scratch?.selectedTargetId || ALL_SECTIONS_TARGET_ID);
      setScratchScope(`${projectId}:${projectRevision}`);
      setLookSaveState('');
      setDeletedLook(null);
    }, [invalidatePendingPreview, projectId, projectRevision]);

    useEffect(() => {
      if (scratchScope !== `${projectId}:${projectRevision}`) return;
      const result = writePatternEditSession(projectId, 'patterns', { draftLooks, mixName, selectedTargetId });
      setScratchError(result.ok ? '' : result.error);
    }, [draftLooks, mixName, selectedTargetId, scratchScope, projectId, projectRevision]);

    useEffect(() => {
      if (!pendingLookSave) return;
      const ok = flushProjectAutosave();
      setPendingLookSave(false);
      if (ok && !keepScratchAfterSave.current) setDraftLooks({});
      keepScratchAfterSave.current = false;
      setLookSaveState(ok ? 'Saved in this project' : 'Could not save this project in browser storage. Free some space and try again.');
    }, [pendingLookSave, flushProjectAutosave]);

    useEffect(() => {
      if (
        previewUiState.projectId !== projectId ||
        !previewTargetIds.includes(lastPreviewTargetId)
      ) return;
      const restoreKey = `${projectId}:${lastPreviewTargetId}`;
      if (syncedPreviewSelectionRef.current === restoreKey) return;
      syncedPreviewSelectionRef.current = restoreKey;
      setSelectedTargetId(lastPreviewTargetId);
    }, [lastPreviewTargetId, previewTargetKey, previewUiState.projectId, projectId]);

    useEffect(() => {
      if (cardReturnConsumed.current || typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const requestedPatternValue = String(params.get('editPattern') || '').trim();
      const requestedLookValue = String(params.get('editLook') || '').trim();
      const requestedPatternId = requestedPatternValue.toLowerCase();
      const requestedLookId = requestedLookValue.toLowerCase();
      if (!requestedPatternId && !requestedLookId) return;
      const requestedIntent = requestedPatternValue
        ? `pattern:${requestedPatternValue}`
        : `look:${requestedLookValue}`;
      if (!consumeCardEditAuthorization({
        ...patternAuthorizationRef.current,
        intent: requestedIntent,
      })) {
        cardReturnConsumed.current = true;
        invalidatePendingPreview();
        // Record the failure where remounting cannot forget it. The card
        // auto-opens Patterns for as long as it can read an intent, so without
        // this the claim we just lost is retried the instant we land back
        // there — and both screens remount on the way, resetting every
        // once-only guard either of them owns. The intent itself stays in the
        // URL: it is still what the owner asked for, and loading the matching
        // project by hand can still honour it.
        markCardEditIntentAbandoned(requestedIntent);
        // F18: an edit request for the project ALREADY open here is not a
        // "which copy wins" decision at all — the card is not offering a
        // different project, it is asking Studio to open a look/pattern that
        // already lives in what's open. lw-card.jsx's own F18 effect already
        // reacted to this exact refusal (wiring drift broke the exact-match
        // this claim needs) by routing here for that reason, so bouncing
        // straight back to the card would ping-pong the two screens — the
        // 2026-08-07 loop this file's breaker exists to prevent. Reuse the
        // one place Patterns already reads the card's installed project id
        // (installedProjectIdFromCardStatus, same field lw-card.jsx's
        // cardHoldsOpenProject reads off cardLink.readiness) rather than
        // re-deciding the match here. Stay, and let the existing unauthorized
        // 'project' gate show the honest next step in place: the look is
        // offered, not selected — the exact-fingerprint claim this write
        // still needs was refused, and nothing here grants it.
        if (installedProjectIdFromCardStatus(cardLink?.readiness) === String(projectId || '').trim()) {
          blockPatternCardEffect('project');
          return;
        }
        if (go) go('card');
        else window.location.hash = '#screen=card&section=overview';
        return;
      }
      cardReturnConsumed.current = true;

      const returnedHost = params.get('cardHost') || '';
      if (isLocalCardHost(returnedHost)) {
        const normalizedHost = normalizeCardHost(returnedHost);
        writeStoredCardHost(normalizedHost);
        setCardHost(normalizedHost);
      }

      if (requestedPatternId && getCardPatternById(requestedPatternId)) {
        setSelectedTargetId(ALL_SECTIONS_TARGET_ID);
        setDraftLooks({
          [ALL_SECTIONS_TARGET_ID]: normalizeSectionVisualLook({
            ...savedGlobalLook,
            patternId: requestedPatternId,
          }),
        });
        setStatusKind('ok');
        setStatus(`Opened ${getCardPatternById(requestedPatternId)?.label || requestedPatternId} from the card. Adjust it here, then install when ready.`);
      } else if (requestedLookId) {
        const returnedLook = savedLooks.find(savedLook => String(savedLook.id || '').toLowerCase() === requestedLookId);
        if (returnedLook) {
          setPatchBoard(applySavedLookToPatchBoard({ patchBoard: board, strips, savedLook: returnedLook }));
          setStandaloneController(previous => ({
            ...(previous || {}),
            defaultLook: returnedLook.defaultLook,
            activeLookId: returnedLook.id,
            looks: savedLooks,
          }));
          setSelectedTargetId(ALL_SECTIONS_TARGET_ID);
          setDraftLooks({});
          setStatusKind('ok');
          setStatus(`Opened ${returnedLook.label || returnedLook.id} from the card. Adjust it here, then install when ready.`);
        } else {
          setStatusKind('err');
          setStatus('That saved card look is not in this Studio project. Open the matching project, then return from the card again.');
        }
      } else {
        setStatusKind('err');
        setStatus('That card pattern is not supported by this Studio build. Update Studio or choose another card pattern.');
      }

      params.delete('editPattern');
      params.delete('editLook');
      const search = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
    }, [blockPatternCardEffect, board, cardLink, go, invalidatePendingPreview, projectId, savedGlobalLook, savedLooks, setPatchBoard, setStandaloneController, strips]);

    const updatePreviewLook = (patch, { push = true } = {}) => {
      if (!selectedTarget) return null;
      const nextLook = normalizeSectionVisualLook({ ...look, ...patch });
      setDraftLooks(prev => ({ ...prev, [selectedTarget.id]: nextLook }));
      setLookSaveState('');
      if (push) scheduleLivePreview(nextLook, selectedTarget, 80, { expectedControlPatch: patch });
      return nextLook;
    };

    const scheduleBrowseLivePreview = useCallback((nextLook, target) => {
      if (!nextLook) return;
      // F17-A: reaching the bridge-vs-direct decision now needs the probe
      // below, not just a synchronous protocol check, so everything past it
      // moves into this callback. Nothing here is a new supersession rule —
      // `browsePreviewSeq`/`sequence` is allocated at exactly the point the
      // pre-probe code allocated it (entering the bridge branch), so a tap
      // that resolves to the direct branch is not tracked by it at all,
      // same as before; a rapid second tap still supersedes a first one
      // that is mid-verification on the bridge, via the SAME checks inside
      // `scheduleVerifiedBridgePreview` and the acquisition callbacks below
      // that already existed for that case.
      void resolveCardBridgePreference({ cardLink, cardHost }).then(({ needsBridge, directProbeReady }) => {
        // On https the card link cannot become ready until the card page is
        // open, and the card page only opens further down THIS function. Gating
        // the whole path on readiness therefore closed a loop: every tap was
        // refused for a lack of readiness that only a tap could establish, so
        // Patterns previewed in Studio forever and the strip never moved.
        //
        // The gate protects SENDING light to a card Studio has not verified.
        // Opening the card page is not sending — and the send below is still
        // guarded by `exactFreshAuthority`, which re-reads the card's own status
        // and checks id, firmware, build and boot before a single frame goes out.
        const openingTheBridge = needsBridge && !(hasCardBridge() && getCardBridgeState()?.verified);
        // F20: `currentPatternPreviewAccess()` reads `patternAccessRef`, which
        // is only ever updated by a RENDER — and the probe above just
        // dispatched a fresh readiness envelope into `cardLink` that this
        // component has not re-rendered against yet (that dispatch's re-render
        // lands after this microtask, not inside it). Treating that stale ref
        // as authoritative refused a tap the probe itself had just proven safe
        // — the "not ready for pattern commands" toast on a card that was, in
        // fact, ready. `directProbeReady` is the outcome of THIS call's own
        // probe, not a snapshot, so it is sufficient for THIS tap on its own,
        // the same way `openingTheBridge` already is for the bridge path.
        if (currentPatternPreviewAccess() !== 'ready' && !openingTheBridge && !directProbeReady) {
          blockPatternCardEffect(currentPatternPreviewAccess());
          return;
        }
        setPatternCardGate('');
        if (!needsBridge) {
          scheduleLivePreview(nextLook, target);
          return;
        }

        const sequence = ++browsePreviewSeq.current;
        const scheduleVerifiedBridgePreview = async () => {
          const firmwareGap = cardBridgeFeatureGap('frame');
          if (firmwareGap) {
            setHandoffUrl('');
            setStatusKind('err');
            setStatus(firmwareGap.message);
            return;
          }
          const expectedCard = cardLink?.expectedCard || cardLink?.card || null;
          const originalBootId = String(cardLink?.validatedBootId || cardLink?.readiness?.bootId || '');
          const status = await sendCardBridgeRequest('status', { cache: 'no-store', nonce: Date.now() }, {
            host: cardHost,
            retryOnTimeout: false,
          });
          const readiness = classifyCardReadiness(status, { expectedCard });
          const bridgeState = getCardBridgeState();
          const exactFreshAuthority = readiness.playbackAccess === 'ready'
            && readiness.cardId === String(expectedCard?.id || expectedCard?.cardId || '')
            && (!expectedCard?.firmwareVersion || status.firmwareVersion === expectedCard.firmwareVersion)
            && (!expectedCard?.buildId || status.buildId === expectedCard.buildId)
            && Boolean(originalBootId)
            && readiness.bootId === originalBootId
            && bridgeState.verified
            && bridgeState.identityVerified
            && bridgeState.runtimePlaybackReady
            && normalizeCardHost(bridgeState.host) === normalizeCardHost(cardHost);
          if (!exactFreshAuthority || sequence !== browsePreviewSeq.current) {
            blockPatternCardEffect(currentPatternPreviewAccess());
            return;
          }
          setStatusKind('');
          setStatus('');
          scheduleLivePreview(nextLook, target, 0, {
            bridgeAuthority: {
              lifecycle: bridgeState.lifecycle,
              host: normalizeCardHost(bridgeState.host),
              cardId: readiness.cardId,
              firmwareVersion: status.firmwareVersion,
              buildId: status.buildId,
              bootId: readiness.bootId,
            },
          });
        };
        const bridgeOpen = hasCardBridge();
        const bridgeState = getCardBridgeState();
        if (
          bridgeOpen && bridgeState.verified && bridgeState.identityVerified && bridgeState.runtimePlaybackReady &&
          normalizeCardHost(bridgeState.host) === normalizeCardHost(cardHost)
        ) {
          void scheduleVerifiedBridgePreview().catch(error => {
            if (sequence !== browsePreviewSeq.current) return;
            setStatusKind('err');
            setStatus(error?.message || 'The local card did not reverify as Ready. Recover it before sending lights.');
          });
          return;
        }

        const attempt = acquireCardBridgeFromGesture(cardHost, {
          studioUrl: typeof window !== 'undefined' ? window.location.href : '',
          timeoutMs: 10000,
        });
        setHandoffUrl('');
        setStatusKind('');
        setStatus('Connecting to the local Lightweaver card…');
        const onBridgeChanged = () => {
          const state = getCardBridgeState();
          if (!state.verified) return;
          const firmwareGap = cardBridgeFeatureGap('frame');
          if (!firmwareGap) return;
          // Acquisition revalidation can cancel this tap before identity arrives.
          // It must still explain the unsupported bridge; it never resumes a command.
          const expectedCard = cardLink?.expectedCard || cardLink?.card;
          const sameVerifiedCard = state.identityVerified
            && normalizeCardHost(state.host) === normalizeCardHost(cardHost)
            && state.card?.id === expectedCard?.id
            && state.card?.firmwareVersion === expectedCard?.firmwareVersion
            && state.card?.buildId === expectedCard?.buildId;
          if (sequence !== browsePreviewSeq.current && !sameVerifiedCard) return;
          browsePreviewSeq.current += 1;
          window.removeEventListener(CARD_BRIDGE_CHANGED_EVENT, onBridgeChanged);
          setPatternCardGate('');
          setStatusKind('err');
          setStatus(firmwareGap.message);
        };
        window.addEventListener(CARD_BRIDGE_CHANGED_EVENT, onBridgeChanged);
        void attempt.ready.then(() => {
          window.removeEventListener(CARD_BRIDGE_CHANGED_EVENT, onBridgeChanged);
          if (sequence !== browsePreviewSeq.current) return;
          void scheduleVerifiedBridgePreview().catch(error => {
            if (sequence !== browsePreviewSeq.current) return;
            setStatusKind('err');
            setStatus(error?.message || 'The local card did not reverify as Ready. Recover it before sending lights.');
          });
        }).catch(error => {
          window.removeEventListener(CARD_BRIDGE_CHANGED_EVENT, onBridgeChanged);
          if (sequence !== browsePreviewSeq.current) return;
          setStatusKind('err');
          if (error?.reason === 'popup-blocked') {
            setStatus('Allow the Lightweaver card window, then try the pattern again.');
          } else if (error?.reason === 'bridge-timeout') {
            setStatus('The card page opened but did not answer. Check that this device is on the card\'s Wi-Fi.');
          } else {
            setStatus(error?.message || 'The local card did not connect. Open Flash to update the card, then try again.');
          }
        });
      });
    }, [blockPatternCardEffect, cardHost, cardLink?.transport, currentPatternPreviewAccess, scheduleLivePreview]);

    // Clicking a target tab pushes that target's current look to its zone
    // (debounced) so the physical strip follows the selection.
    // "Show me which one": a tapped section stands out on the piece for a
    // second (the others dim, never black), so the owner learns which physical
    // part "Ring 3" is without a trip to the wall. Brightness-only posts, so a
    // running playlist keeps running. One flash at a time; a tap during a
    // flash is simply not flashed.
    const flashInFlightRef = useRef(false);
    const flashSection = (target) => {
      if (target?.kind !== 'section' || !target.zoneId) return;
      if (patternAccessRef.current !== 'ready' || flashInFlightRef.current) return;
      const heldZones = Array.isArray(cardZonesPayload?.zones) ? cardZonesPayload.zones : null;
      if (heldZones && heldZones.length < 2) return;
      flashInFlightRef.current = true;
      const expectedCardId = cardLink?.readiness?.cardId || cardLink?.card?.id || cardLink?.card?.cardId || '';
      flashSectionOnCard({
        ...cardConnectionOptionsFor(cardLink, cardHost),
        expectedCardId,
        zoneId: target.zoneId,
        zones: heldZones,
        timeoutMs: 1500,
      }).catch(() => {}).finally(() => { flashInFlightRef.current = false; });
    };

    const selectTarget = (target) => {
      if (!target) return;
      invalidatePendingPreview();
      setSelectedTargetId(target.id);
      setPreviewUiState(previous => ({
        ...previous,
        projectId,
        mode: target.kind === 'section' ? 'strip' : 'piece',
        lastTargetId: target.kind === 'section' && previewTargetIds.includes(target.id)
          ? target.id
          : (previewTargetIds.includes(previous.lastTargetId) ? previous.lastTargetId : previewTargetIds[0] || ''),
      }));
      if (!connected) {
        setStatusKind('err');
        setStatus(`Not connected to the card, so the lights can't follow this selection. Use Connect to card in the bottom bar.`);
        return;
      }
      scheduleLivePreview(resolveDraftTargetLook(target), target, 150);
      flashSection(target);
    };

    const choosePatternPreviewTarget = (value) => {
      if (value === 'piece') {
        setPreviewUiState(previous => ({ ...previous, projectId, mode: 'piece' }));
        return;
      }
      const target = sectionTargets.find(candidate => candidate.id === value && candidate.kind === 'section');
      if (target && previewTargetIds.includes(target.id)) selectTarget(target);
    };

    const stepPatternPreviewTarget = (direction) => {
      if (previewMode !== 'strip') return;
      const currentIndex = previewTargetIds.indexOf(lastPreviewTargetId);
      const nextId = previewTargetIds[currentIndex + direction];
      if (nextId) choosePatternPreviewTarget(nextId);
    };

    const togglePatternPiecePreview = () => {
      const nextMode = previewMode === 'piece' ? 'strip' : 'piece';
      if (nextMode === 'strip' && previewTargetIds.includes(lastPreviewTargetId)) {
        setSelectedTargetId(lastPreviewTargetId);
      }
      setPreviewUiState(previous => ({
        ...previous,
        projectId,
        mode: nextMode,
        lastTargetId: previewTargetIds.includes(previous.lastTargetId)
          ? previous.lastTargetId
          : previewTargetIds[0] || '',
      }));
    };

    const buildCurrentHardwareState = ({ saveNamedLook = false, label = '', uniqueLookId = false } = {}) => {
      const nextLook = normalizeSectionVisualLook(look);
      const selectedTargetDrafted = Boolean(
        selectedTarget?.id && Object.prototype.hasOwnProperty.call(draftLooks, selectedTarget.id),
      );
      const draftLookEntries = {
        ...draftLooks,
        ...(selectedTargetDrafted ? { [selectedTarget.id]: nextLook } : {}),
      };
      const validTargetIds = new Set(sectionTargets.map(target => target.id));
      const normalizedDraftLooks = Object.fromEntries(
        Object.entries(draftLookEntries)
          .filter(([targetId]) => validTargetIds.has(targetId))
          .map(([targetId, draftLook]) => [targetId, normalizeSectionVisualLook(draftLook)]),
      );
      const nextDefaultLook = normalizeSectionVisualLook(normalizedDraftLooks[ALL_SECTIONS_TARGET_ID] || savedGlobalLook);
      let nextBoard = board;
      if (normalizedDraftLooks[ALL_SECTIONS_TARGET_ID]) {
        nextBoard = applyLookToPatchBoard({ patchBoard: nextBoard, strips, targetId: ALL_SECTIONS_TARGET_ID, look: nextDefaultLook });
      }
      for (const target of sectionTargets) {
        if (target.kind !== 'section' || !normalizedDraftLooks[target.id]) continue;
        nextBoard = applyLookToPatchBoard({ patchBoard: nextBoard, strips, targetId: target.id, look: normalizedDraftLooks[target.id] });
      }
      const nextTargets = deriveSectionTargets({ strips, patchBoard: nextBoard, wiring, compiledWiring, defaultLook: nextDefaultLook });
      let nextController = { ...(standaloneController || {}), defaultLook: nextDefaultLook };
      if (!saveNamedLook) return { nextLook, nextBoard, nextController, nextTargets };
      const resolvedLabel = label || mixName.trim() || currentComboLabel;
      nextController = saveCurrentLookToController(standaloneController, {
        lookId: uniqueLookId || !editingSavedLook ? `combo-${Date.now()}-${++savedComboSeq.current}` : editingSavedLook.id,
        label: resolvedLabel,
        defaultLook: nextDefaultLook,
        targets: nextTargets,
        patternLabRecipe: editingSavedLook?.patternLabRecipe ? recipeFromLook({ ...editingSavedLook, label: resolvedLabel, defaultLook: nextDefaultLook, sectionLooks: Object.fromEntries(nextTargets.filter(target => target.kind === 'section').map(target => [target.id, target.look])) }) : null,
      });
      return { nextLook, nextBoard, nextController, nextTargets };
    };

    // ── handlers ────────────────────────────────────────────────────────
    const promotePatternFirst = (controller, patternId) => {
      const controllerLooks = normalizeSavedLooks(controller?.looks);
      const currentPlaylist = normalizeCardPlaylist(controller?.playlist, {
        savedLooks: controllerLooks,
        fallbackPatternIds: [
          patternId,
          ...(Array.isArray(controller?.controls?.encoder?.patternCycleIds) ? controller.controls.encoder.patternCycleIds : []),
        ],
      });
      const item = makePatternPlaylistItem(patternId);
      const nextPlaylist = normalizeCardPlaylist([
        item,
        ...currentPlaylist.filter(entry => !(entry.type === 'pattern' && entry.patternId === patternId)),
      ].filter(Boolean), { savedLooks: controllerLooks, fallbackPatternIds: [patternId] });
      return {
        ...(controller || {}),
        playlist: nextPlaylist,
        controls: {
          ...(controller?.controls || {}),
          encoder: { ...(controller?.controls?.encoder || {}), patternCycleIds: derivePlaylistLookIds(nextPlaylist) },
        },
      };
    };

    const offerCardHandoff = (runtimePackageForCard, message) => {
      setHandoffUrl(buildCardConfigHandoffUrl(cardHost, runtimePackageForCard));
      setStatusKind('err');
      setStatus(message);
    };
    const reportCardPageOpenResult = (result) => {
      if (result?.ok) return true;
      setStatusKind('err');
      setStatus(result?.reason === 'popup-blocked'
        ? 'The browser blocked the card window. Allow popups for Studio, then try again.'
        : 'The card address is not a valid local Lightweaver address. Check it, then try again.');
      return false;
    };
    const openCardInstaller = async () => {
      if (!handoffUrl) return;
      if (currentPatternCardAccess() !== 'ready') {
        blockPatternCardEffect(currentPatternCardAccess());
        return;
      }
      try {
        const evidence = await readCardProjectEvidence({ host: cardHost, transport: cardLink?.transport });
        if (!matchesCurrentCardProjectEvidence(evidence)) {
          blockPatternCardEffect('project');
          return;
        }
      } catch (error) {
        setStatusKind('err');
        setStatus(error?.message || 'The card could not be reverified before opening the installer.');
        return;
      }
      const url = new URL(handoffUrl);
      reportCardPageOpenResult(openLocalCardPage(cardHost, {
        path: `${url.pathname}${url.search}${url.hash}`,
        reason: 'card-installer',
      }));
    };

    const checkCardLayoutWriteSafety = async (runtimePackageForCard, actionLabel = 'saving') => {
      const localPixels = Number(runtimePackageForCard?.config?.led?.pixels) || 0;
      const discovered = await discoverCardStatus({ preferredHost: cardHost, timeoutMs: 650, persist: true });
      if (!discovered.connected) return { ok: true, host: cardHost };
      if (discovered.host) { setCardHost(discovered.host); writeStoredCardHost(discovered.host); }
      const cardPixels = Number(discovered.status?.led?.pixels);
      if (!Number.isFinite(cardPixels) || cardPixels <= 0 || localPixels <= 0 || cardPixels < localPixels * 2) {
        return { ok: true, host: discovered.host || cardHost };
      }
      setStatusKind('err');
      setStatus(`Stopped before ${actionLabel}: this project is the default ${localPixels}-pixel layout, but the card is configured for ${cardPixels} pixels. Load the real project or set the LED counts before saving to the card.`);
      return { ok: false, host: discovered.host || cardHost };
    };

    const savePreviewToCard = async () => {
      if (currentPatternCardAccess() !== 'ready') {
        blockPatternCardEffect(currentPatternCardAccess());
        return;
      }
      if (installIntentRef.current) return;
      // The world this save was started in. Everything below is a long chain of
      // awaits — a deployment verification, an evidence read, and a live
      // preview push with a 2.2s timeout — so by the time it finishes, the
      // authorization it began under may be gone. See the clear at the end.
      const authorizationAtSave = projectAuthorizationRef.current;
      const installIntent = {};
      installIntentRef.current = installIntent;
      let packageForCard = null;
      try {
        const requestedRevision = projectLifecycle.editedRevision;
        const requestedGeneration = projectLifecycle.generation;
        const requestedDraftLooks = { ...draftLooks };
        const requestedBoard = board;
        const requestedController = standaloneController;
        const { nextLook, nextBoard, nextController: draftController } = buildCurrentHardwareState();
        const nextController = promotePatternFirst(draftController, nextLook.patternId);
        const prepared = prepareCardDeployment({
          projectId,
          projectName,
          projectRevision: requestedRevision,
          strips,
          patchBoard: nextBoard,
          compiledWiring,
          standaloneController: nextController,
        });
        const nextPackage = prepared.runtimePackage;
        // Saving a pattern is authoritative project installation. The
        // test-strip override is reserved for explicit previews only.
        packageForCard = runtimePackageForCardOperation(nextPackage, { operation: 'save' });
        setHandoffUrl('');
        setStatusKind('');
        setStatus('');
        prepareCardStoragePayload(packageForCard);
        const safety = await checkCardLayoutWriteSafety(packageForCard, 'saving');
        if (!safety.ok) return;
        if (currentPatternCardAccess() !== 'ready') {
          blockPatternCardEffect(currentPatternCardAccess());
          return;
        }
        const before = await readCardProjectEvidence({ host: safety.host || cardHost, transport: cardLink?.transport });
        if (!matchesCurrentCardProjectEvidence(before)) {
          blockPatternCardEffect('project');
          return;
        }
        const exactPrepared = { ...prepared, cardId: before.cardId };
        dispatchCardSave({ type: 'start', revision: requestedRevision });
        const response = await pushConfigToCard(packageForCard, {
          host: safety.host || cardHost,
          transport: cardLink?.transport,
          timeoutMs: 6000,
          reboot: 'if-needed',
          allowLayoutChange: undefined,
          allowProjectChange: undefined,
        });
        if (response?.state === 'staged') {
          throw new Error(STAGED_WIRING_CONFLICT_MESSAGE);
        }
        const verification = await waitForCardDeploymentVerification(exactPrepared, {
          readEvidence: () => readCardProjectEvidence({ host: safety.host || cardHost, transport: cardLink?.transport }),
        });
        dispatchCardSave({ type: 'confirm' });
        const commitBoard = JSON.stringify(latestBoardRef.current) === JSON.stringify(requestedBoard)
          && JSON.stringify(latestBoardRef.current) !== JSON.stringify(nextBoard);
        const commitController = JSON.stringify(latestControllerRef.current) === JSON.stringify(requestedController)
          && JSON.stringify(latestControllerRef.current) !== JSON.stringify(nextController);
        if (commitBoard || commitController) {
          commitProjectStateWithoutEdit(() => {
            if (commitBoard) setPatchBoard(nextBoard);
            if (commitController) setStandaloneController(nextController);
          });
        }
        setDraftLooks(currentDrafts => Object.fromEntries(
          Object.entries(currentDrafts).filter(([targetId, currentLook]) => (
            !Object.prototype.hasOwnProperty.call(requestedDraftLooks, targetId)
            || JSON.stringify(currentLook) !== JSON.stringify(requestedDraftLooks[targetId])
          )),
        ));
        markProjectInstalled({
          revision: requestedRevision,
          generation: requestedGeneration,
          cardId: verification.cardId,
          projectRevision: exactPrepared.config.projectRevision,
          projectFingerprint: exactPrepared.config.projectFingerprint,
        });
        markCardLookConfirmed({
          ...nextLook,
          zone: selectedTarget?.kind === 'section' ? selectedTarget.zoneId || selectedTarget.id : '',
          syncZones: selectedTarget?.kind !== 'section',
        });
        if (!response.rebooting) {
          const zone = selectedTarget?.kind === 'section' ? selectedTarget.zoneId || selectedTarget.id : '';
          if (currentPatternCardAccess() === 'ready') {
            await pushLivePreviewToCard(
              { ...nextLook, zone, syncZones: nextLook.syncZones },
              { host: safety.host || cardHost, preferBridge: cardLink?.transport === 'bridge', timeoutMs: 2200 },
            ).catch(() => null);
          }
        }
        // "Finished, so nothing to report" is only true if nothing happened
        // while we were working. Losing the project authorization mid-save
        // raises "Open Hardware and verify that this exact Studio project is
        // still installed before sending lights", and this clear used to wipe
        // it about 12ms after it appeared — leaving the owner with no warning
        // at all and a card that may no longer hold their project. A finished
        // save may report its own success; it may not erase someone else's
        // warning.
        if (projectAuthorizationRef.current === authorizationAtSave) {
          setStatusKind('');
          setStatus('');
        }
      } catch (error) {
        dispatchCardSave({ type: 'fail', error: error?.message });
        if (error?.reason === 'mixed-content') {
          offerCardHandoff(packageForCard, 'Saved in Studio. The browser blocked direct local-card access, so open the card installer to finish saving it on the card.');
        } else if (error?.reason === 'layout-mismatch' || error?.reason === 'project-mismatch' || error?.reason === 'config-too-large') {
          setStatusKind('err');
          setStatus(error.message);
        } else if (Number(error?.status) >= 400) {
          // The card WAS reached — it answered, and said no. Reporting that as
          // "could not reach the card" is untrue, and the remedy it offered
          // (paste the setup on the card page) fails in exactly the same way,
          // so the owner is sent to do work that cannot succeed.
          setStatusKind('err');
          setStatus(`The card was reached but would not take this setup: ${error.message}`);
        } else {
          setStatusKind('err');
          setStatus('Saved in the Studio, but could not reach the card. Copy or download the setup JSON and paste it on the card page.');
        }
      } finally {
        if (installIntentRef.current === installIntent) installIntentRef.current = null;
      }
    };

    const saveLook = (saveAsNew = false) => {
      try {
        const label = mixName.trim() || editingSavedLook?.label || `${sel.label} · ${cardHueToDegrees(look.customHue)}°`;
        const { nextController, nextBoard } = buildCurrentHardwareState({ saveNamedLook: true, label, uniqueLookId: saveAsNew });
        setPatchBoard(nextBoard);
        setStandaloneController(nextController);
        setMixName(label);
        setLookSaveState('Saving…');
        setPendingLookSave(true);
        setDeletedLook(null);
        setStatusKind('');
        setStatus('');
      } catch (error) {
        setLookSaveState(error.message || 'Could not save this look.');
        setStatusKind('err');
        setStatus(error.message || 'Could not save this look.');
      }
    };
    const savePreset = () => saveLook();
    const renameLook = () => {
      if (!editingSavedLook || !mixName.trim()) return;
      const label = mixName.trim();
      setStandaloneController(previous => ({
        ...previous,
        looks: previous.looks.map(item => item.id === editingSavedLook.id ? { ...item, label, ...(item.patternLabRecipe ? { patternLabRecipe: { ...item.patternLabRecipe, name: label } } : {}) } : item),
        playlist: (previous.playlist || []).map(item => item.lookId === editingSavedLook.id || item.comboId === editingSavedLook.id ? { ...item, label } : item),
      }));
      keepScratchAfterSave.current = true;
      setPendingLookSave(true);
      setLookSaveState('Saving…');
    };
    const deleteLook = () => {
      if (!editingSavedLook) return;
      const next = deleteSavedLookFromController(standaloneController, editingSavedLook.id);
      setDeletedLook({ previous: standaloneController, next, label: editingSavedLook.label });
      setStandaloneController(next);
      setDraftLooks({});
      setMixName('');
      setPendingLookSave(true);
      setLookSaveState('Saving…');
    };
    const undoDeleteLook = () => {
      if (!deletedLook) return;
      if (JSON.stringify(standaloneController) !== JSON.stringify(deletedLook.next)) {
        setLookSaveState('The project changed after deletion. Undo is unavailable to protect your newer edits.');
        return;
      }
      setStandaloneController(deletedLook.previous);
      setMixName(deletedLook.label);
      setDeletedLook(null);
      setPendingLookSave(true);
      setLookSaveState('Saving…');
    };
    const openLookInLab = () => {
      const { nextController, nextTargets } = buildCurrentHardwareState();
      const value = {
        ...(editingSavedLook || {}),
        id: editingSavedLook?.id || '',
        label: mixName.trim() || editingSavedLook?.label || sel.label,
        defaultLook: nextController.defaultLook,
        selectedTargetId,
        sectionLooks: Object.fromEntries(nextTargets.filter(target => target.kind === 'section').map(target => [target.id, target.look])),
      };
      const result = writePatternLabEditHandoff(projectId, value);
      if (!result.ok) { setLookSaveState(result.error); return; }
      window.location.hash = '#screen=pattern-lab';
    };

    const writePlaylist = (nextItems) => {
      const normalized = normalizeCardPlaylist(nextItems, { savedLooks, allowEmpty: true });
      updateController({
        playlist: normalized,
        controls: { encoder: { patternCycleIds: derivePlaylistLookIds(normalized) } },
      });
      setStatusKind('');
      setStatus('');
    };

    const setPatternInPlaylist = (patternId, enabled) => {
      const next = enabled
        ? playlistContainsPattern(playlist, patternId)
          ? playlist
          : [...playlist, makePatternPlaylistItem(patternId)].filter(Boolean)
        : playlist.filter(item => !(item.type === 'pattern' && item.patternId === patternId));
      writePlaylist(next);
    };

    const setSavedLookInPlaylist = (savedLook, enabled) => {
      const next = enabled
        ? playlistContainsCombo(playlist, savedLook.id)
          ? playlist
          : [...playlist, makeComboPlaylistItem(savedLook)].filter(Boolean)
        : playlist.filter(item => !(item.type === 'combo' && item.lookId === savedLook.id));
      writePlaylist(next);
    };

    // Toggle playlist membership for any browse card (pattern or saved mix).
    const togglePl = (id, e) => {
      e.stopPropagation();
      const adapted = REAL_PATTERN_BY_ID.get(id);
      if (adapted) {
        setPatternInPlaylist(id, !playlistContainsPattern(playlist, id));
        return;
      }
      // saved mix card: id is the adapted look id; find the real saved look.
      const realLook = findSavedLook(id);
      if (realLook) setSavedLookInPlaylist(realLook, !playlistContainsCombo(playlist, realLook.id));
    };
    const inPlaylist = (id) => {
      if (REAL_PATTERN_BY_ID.has(id)) return playlistContainsPattern(playlist, id);
      const realLook = findSavedLook(id);
      return realLook ? playlistContainsCombo(playlist, realLook.id) : false;
    };

    // Select a browse card: pattern -> preview; saved mix -> apply look.
    const selectCard = (p) => {
      if (p.mix) {
        const realLook = findSavedLook(p.id);
        if (realLook) {
          const nextBoard = applySavedLookToPatchBoard({ patchBoard: board, strips, savedLook: realLook });
          setPatchBoard(nextBoard);
          setStandaloneController(prev => ({
            ...(prev || {}),
            defaultLook: realLook.defaultLook,
            activeLookId: realLook.id,
            looks: savedLooks,
          }));
          setDraftLooks({});
          setMixName(realLook.label);
          setLookSaveState('');
          setSelectedTargetId(ALL_SECTIONS_TARGET_ID);
          scheduleBrowseLivePreview(normalizeSectionVisualLook(realLook.defaultLook), sectionTargets[0]);
        }
        return;
      }
      setStandaloneController(previous => ({ ...(previous || {}), activeLookId: '' }));
      setActivePatternId(p.id);
      setMixName('');
      setLookSaveState('');
      const nextLook = updatePreviewLook({ patternId: p.id }, { push: false });
      scheduleBrowseLivePreview(nextLook, selectedTarget);
    };

    const copyConfig = async () => {
      setHandoffUrl('');
      try {
        if (!runtimePackage) throw runtimeBuild.error;
        await navigator.clipboard.writeText(cardStorageJson(runtimePackage));
        setStatusKind('ok');
        setStatus('Setup JSON copied. Paste it into the card page on the same WiFi.');
      } catch (error) {
        setStatusKind('err');
        setStatus(error?.reason === 'config-too-large'
          ? error.message
          : 'Clipboard was blocked. Download the setup JSON instead.');
      }
    };

    const downloadConfig = () => {
      try {
        if (!runtimePackage) throw runtimeBuild.error;
        const blob = new Blob([cardStorageJson(runtimePackage)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeProjectName || 'lightweaver'}-chip-config.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        setStatusKind('err');
        setStatus(error?.reason === 'config-too-large'
          ? error.message
          : 'Could not prepare the setup download. Try again.');
      }
    };

    const repairLed = async () => {
      // F22b: recovering the lights sends a fixed warm-white frame and
      // asserts nothing about which project is installed — it is not a
      // pattern write and must not need the exact-fingerprint pattern-edit
      // authorization (`hasCurrentProjectAuthorization`,
      // `ensureCardEditAuthorization` in cardEditAuthorization.js) that
      // `currentPatternCardAccess()` demands below. That gate exists for
      // installs, which persist a structural claim onto the card; it has no
      // business refusing a recovery just because Studio's wiring has
      // drifted since install. When the card is reachable and paired
      // (`patternAccessRef`, the un-demoted playback fact — same evidence
      // `recoverLightsCardAccess` already enables the button on, F22) and
      // still holds the project open here right now
      // (`installedProjectIdFromCardStatus`, the same fact F18/F22 use, and
      // the same test lw-card.jsx's `cardHoldsOpenProject` makes), send the
      // recovery the same way Card Home's identical button already does
      // (recoverCardBlackout) — no evidence match, no authorization.
      const cardHoldsOpenProjectForRecovery = installedProjectIdFromCardStatus(cardLink?.readiness)
        === String(projectId || '').trim();
      const recoveryBypassesProjectAuthorization = patternAccessRef.current === 'ready'
        && cardHoldsOpenProjectForRecovery;
      if (!recoveryBypassesProjectAuthorization && currentPatternCardAccess() !== 'ready') {
        blockPatternCardEffect(currentPatternCardAccess());
        return;
      }
      if (livePreviewTimer.current) clearTimeout(livePreviewTimer.current);
      const sequence = ++livePreviewSeq.current;
      dispatchPreviewAction({ type: 'reset' });
      setPreviewFailure(null);
      setHandoffUrl('');
      setRecoveryConfirmation('');
      setStatusKind('');
      setStatus(`Sending warm-white LED repair to ${cardHostToUrl(cardHost)}...`);
      try {
        if (!recoveryBypassesProjectAuthorization) {
          const evidence = await readCardProjectEvidence({ host: cardHost, transport: cardLink?.transport });
          if (sequence !== livePreviewSeq.current) return;
          if (!matchesCurrentCardProjectEvidence(evidence)) {
            blockPatternCardEffect('project');
            return;
          }
        }
        // Wrapped so a finished recovery invalidates the shared journey
        // evidence (cardJourneyEvidence.js's hardware-operation listener) —
        // otherwise a cleared blackout would sit unreported until something
        // else happened to re-read the card (F16: "goes away without a
        // click").
        //
        // F33b: this was the one hardware-reaching call in this file that
        // never forwarded `transport` — it built a bare `{ host: cardHost }`
        // instead of the shared `cardConnectionOptionsFor()` that Card
        // Home's identical Recover lights button already used (F33). On the
        // live site (https) that meant `recoveryUsesBridge` in
        // cardLiveControl.js fell back to guessing "bridge" from the page
        // protocol — always true on https — even holding a genuine direct
        // link with no card-page bridge tab open, so the request had
        // nothing to answer it and timed out. Same fix, same shared builder.
        await withStudioHardwareOperation('recover-lights', () => recoverCardLightsVerified(
          { patternId: 'warm-white', brightness: 1, syncZones: true },
          { ...cardConnectionOptionsFor(cardLink, cardHost), timeoutMs: 3200, restartCard: true },
        ));
        if (sequence !== livePreviewSeq.current) return;
        setStatusKind('');
        setRecoveryConfirmation('pending');
        setStatus('Recovery frame sent. Do you see warm white on the real LEDs?');
      } catch (error) {
        if (sequence !== livePreviewSeq.current) return;
        setStatusKind('err');
        setRecoveryConfirmation('');
        if (error?.reason === 'identity-missing' || error?.reason === 'wrong-card') {
          // The write guard refuses an unpaired/wrong card. Surface it as the
          // one-tap pair affordance instead of a tiny reach-failure line.
          openConnectionCenter();
          setStatus('Pair this Lightweaver card before sending lights — tap Connect in the card panel.');
        } else {
          setStatus(error?.message || `LED repair could not reach ${cardHostToUrl(cardHost)}. Check power and WiFi, then try again.`);
        }
      }
    };

    // TODO(test-strip): a "split" preview is inherently multi-zone (it shows
    // different sections different patterns at once), which has no coherent
    // meaning on a single collapsed bench-strip zone. This intentionally does
    // NOT apply applyTestStripToRuntimePackage — it already forces
    // allowLayoutChange: true (below) because committing a real split is
    // itself a real wiring change, so it pushes the actual design regardless
    // of test-strip mode. If bench-testing splits turns out to matter, the
    // real fix is a dedicated multi-output test rig, not a fake split on one
    // zone.
    const sendSplitPreview = async () => {
      if (currentPatternCardAccess() !== 'ready') {
        blockPatternCardEffect(currentPatternCardAccess());
        return;
      }
      const { nextLook, nextBoard, nextController } = buildCurrentHardwareState();
      const prepared = prepareCardDeployment({
        projectId,
        projectName,
        projectRevision: projectLifecycle.editedRevision,
        strips,
        patchBoard: nextBoard,
        compiledWiring,
        standaloneController: nextController,
      });
      const nextPackage = prepared.runtimePackage;
      setHandoffUrl('');
      setStatusKind('');
      setStatus('');
      try {
        const safety = await checkCardLayoutWriteSafety(nextPackage, 'applying split preview');
        if (!safety.ok) return;
        const before = await readCardProjectEvidence({ host: safety.host || cardHost, transport: cardLink?.transport });
        if (!matchesCurrentCardProjectEvidence(before)) {
          blockPatternCardEffect('project');
          return;
        }
        const response = await pushConfigToCard(nextPackage, { host: safety.host || cardHost, transport: cardLink?.transport, timeoutMs: 6000, reboot: 'if-needed', allowLayoutChange: true });
        if (response?.state === 'staged') {
          // Converged on the shared refusal (was: "The split is staged but not
          // installed. …" — same meaning, unasserted by any test).
          throw new Error(STAGED_WIRING_CONFLICT_MESSAGE);
        }
        await waitForCardDeploymentVerification({ ...prepared, cardId: before.cardId }, {
          readEvidence: () => readCardProjectEvidence({ host: safety.host || cardHost, transport: cardLink?.transport }),
        });
        markCardLookConfirmed({ ...nextLook, zone: selectedTarget?.kind === 'section' ? selectedTarget.zoneId || selectedTarget.id : '', syncZones: selectedTarget?.kind !== 'section' });
        setPatchBoard(nextBoard);
        setStandaloneController(nextController);
        setDraftLooks({});
        if (!response.rebooting && currentPatternCardAccess() === 'ready') {
          const zone = selectedTarget?.kind === 'section' ? selectedTarget.zoneId || selectedTarget.id : '';
          await pushLivePreviewToCard({ ...nextLook, zone }, { host: safety.host || cardHost, preferBridge: cardLink?.transport === 'bridge', timeoutMs: 2200 }).catch(() => null);
        }
        setStatusKind('');
        setStatus('');
      } catch (error) {
        if (error?.reason === 'mixed-content') {
          offerCardHandoff(nextPackage, 'The browser blocked direct local-card access from this public page. Open the card installer to apply this split on the card.');
        } else if (error?.reason === 'identity-missing' || error?.reason === 'wrong-card') {
          openConnectionCenter();
          setStatusKind('err');
          setStatus('Pair this Lightweaver card before sending lights — tap Connect in the card panel.');
        } else {
          setStatusKind('err');
          setStatus(error?.message || `Could not apply split preview to the card at ${cardHostToUrl(cardHost)}.`);
        }
      }
    };

    const openCardPage = () => {
      if (patternAccessRef.current !== 'ready') {
        blockPatternCardEffect(patternAccessRef.current);
        return;
      }
      if (typeof window !== 'undefined') reportCardPageOpenResult(openLocalCardPage(cardHost));
    };

    // ── color/geometry mapping for the mockup sliders ───────────────────
    const colorHex = cardColorToHex(look.customHue, look.customSaturation);
    const hueDeg = cardHueToDegrees(look.customHue);
    // Saturation is a SCALE on the pattern's own colors, not an absolute level:
    // the card divides by LW_DEFAULT_CUSTOM_SATURATION (230), so 230 means "leave
    // this pattern's colors alone". Showing 230/255 = 90% made the default look
    // like it had a tenth of the track still to climb, when in truth an already
    // saturated pixel is at its ceiling there and the whole useful travel runs
    // downward. Reading it against 230 puts the default at an honest 100%.
    const satPct = Math.round((look.customSaturation / LW_DEFAULT_CUSTOM_SATURATION) * 100);
    const briPct = Math.round(look.brightness * 100);
    const spd = look.speed;
    const speedSlider = lookSpeedToSliderValue(spd);
    const geo = geometryIdFromSettings(symSettings);
    const updateGeo = (id) => setSymSettings(prev => ({ ...(prev || {}), ...(GEOMETRY_SETTINGS[id] || GEOMETRY_SETTINGS.none) }));
    const patchGeo = (patch) => setSymSettings(prev => ({ ...(prev || {}), enabled: true, ...patch }));
    const fitGeo = () => {
      const points = (strips || []).flatMap(s => s.pixels || []);
      const fit = computeSymmetryFit(points, (strips || []).length);
      if (geo === 'kaleido') patchGeo({ center: fit.center, slices: fit.count });
      else if (geo === 'mandala') patchGeo({ center: fit.center, count: fit.count });
      else patchGeo({ center: fit.center });
    };

    const targetTotal = previewTargetIds.length || 1;
    const selectedTargetName = selectedTarget ? targetLabel(selectedTarget) : 'All sections';
    const showFlashAction = statusKind === 'err' && status === cardBridgeFeatureGap('frame')?.message;
    // The gate's escape hatch, rendered in the notice beside the pattern grid.
    const patternGateActionLabel = patternCardGate === 'blank'
      ? 'Set up LED strips and install on card'
      : patternCardGate === 'project'
        // Verifying and recovering a card is the Card status board's job, not
        // the guided ladder's — so it names that section rather than riding the
        // card default, which now lands on Setup.
        ? 'Verify project in Card status'
        : 'Recover and verify card';
    const runPatternGateAction = () => (patternCardGate === 'blank'
      ? go?.('layout')
      : (window.location.hash = '#screen=card&section=overview'));
    const hasPreviewFailureAction = previewAction.status === 'failed' && Boolean(previewFailure?.actionId);
    // A card fresh out of strip discovery is holding Studio's own bench config,
    // so its project fingerprint cannot match the open project and the check
    // below downgrades it to 'project' — the "somebody else's artwork is
    // installed" verdict. That warning is wrong here: Studio put that config
    // there itself, minutes ago. deriveCardAccess's install verdict re-reads
    // the card's own project evidence (readCardAccessLevel) and upgrades
    // exactly that case to 'bench', so trying a look straight after discovery
    // is not refused as a mismatch.
    const authorizedPatternCardAccess = deriveCardAccess(cardLink, {
      connected,
      authorized: projectAuthorizationCurrent,
    }).install;
    // Shared install precondition (src/lib/cardInstallGate.js). savePreviewToCard
    // only sets allowLayoutChange for the explicit bench test-strip override, and
    // it aborts if the card stages the write as a wiring change, so a normal
    // install from this screen cannot rewrite the physical layout and does not
    // carry the commissioning requirement.
    const installGate = evaluateCardInstallGate({
      hardwareIssue: hardwareConfigurationIssue,
      busy: cardSave.conflictsDisabled,
      cardAccess: authorizedPatternCardAccess,
    });
    // F22: `authorizedPatternCardAccess` (.install) is demoted to 'project'
    // the instant Studio's project no longer matches the card's installed
    // fingerprint EXACTLY — the right gate for an install, which persists a
    // structural claim onto the card, but recovering the lights sends a
    // fixed warm-white frame and asserts nothing about which project is
    // installed. Gating the button on it hid the one working recovery action
    // (Card Home's identical button is not gated this way at all) behind the
    // same wiring drift that F22's bench report was about. While the shared
    // journey reports a blackout, the button reads `patternCardAccess`
    // instead — the un-demoted playback fact (exact card pairing + reachable,
    // src/lib/cardAccess.js) — so it enables on drift the same way Card
    // Home's does. Outside a blackout the install-level gate is unchanged.
    const recoverLightsCardAccess = cardBlackedOut ? patternCardAccess : authorizedPatternCardAccess;
    // Whether Studio has a specific card in mind at all — the same
    // expectedCard-or-persisted-identity read used elsewhere in this file
    // (resolveCardBridgePreference above, the wrong-card checks below). This
    // is deliberately weaker than `connected`: a card can be paired and
    // reachable-in-principle while the command gate is shut (a WiFi
    // reassociation, a boot, a mismatch being resolved) — exactly the
    // uncertain states where Recover lights used to disappear instead of
    // offering the recovery it exists for.
    const pairedCardIdentity = cardLink?.expectedCard || cardLink?.card || null;
    const paired = Boolean(String(pairedCardIdentity?.id || pairedCardIdentity?.cardId || '').trim());
    const recoverLightsDisabledReason = (access) => {
      if (access === 'blank') return 'This card has no strips recorded yet. Find its strips before recovering lights.';
      if (access === 'recovery') return 'This card is not confirmed reachable right now. Reconnect it before recovering lights.';
      return 'This card cannot take a recovery command right now.';
    };
    const runPreviewFailureAction = () => {
      switch (previewFailure?.actionId) {
        case 'update-card':
          window.location.hash = '#screen=flash';
          break;
        case 'reconnect-card':
          openConnectionCenter();
          break;
        case 'open-card-page':
          openCardPage();
          break;
        case 'retry':
          retryLatestPreview();
          break;
        case 'recover-lights':
          void repairLed();
          break;
        default:
          break;
      }
    };

    // ── screen-scoped messages into the notice layer ───────────────────────
    // The hero status used to be a static box in document flow, pushing the
    // pattern grid down every time it appeared. Three exceptions stay in the
    // old in-flow markup, deliberately, because the notice layer's `action`
    // is a single button and these need more than that:
    //   - recoveryConfirmation 'pending'/'dark' is a two-button yes/no
    //     confirmation ("Yes, warm white is visible" / "No, lights are still
    //     dark"), both real, both tested
    //     (tests/patterns-v3.spec.ts: 'Recover lights asks for physical
    //     confirmation…'). Collapsing to one action would silently drop the
    //     "No" answer, which is exactly what constraint 6 forbids.
    // Everything else — the plain info/success/error hero messages, the
    // firmware-gap "Open Flash" case, the mixed-content "Open card installer"
    // case, and the single-button preview-failure recovery case — moves.
    const isPatternRecoveryConfirmFlow = recoveryConfirmation === 'pending' || recoveryConfirmation === 'dark';
    useEffect(() => {
      // While the pattern-gate notice (below) is up, it already carries this
      // exact refusal text as its own alert (blockPatternCardEffect sets both
      // `status` and `patternCardGate` to the same message). The old markup
      // solved the resulting double-announcement by downgrading this box's
      // role from 'alert' to 'status' while still showing both boxes; here
      // there is no role to downgrade, so this notice simply stands down and
      // lets the gate notice own the announcement — same fix, no duplicate.
      if (!status || isPatternRecoveryConfirmFlow || patternCardGate) {
        dismissNoticeKey('pattern-card-status');
        return;
      }
      const isSendingStatus = /(…|\.\.\.)$/.test(status);
      const tone = statusKind === 'err' ? 'error' : statusKind === 'ok' ? 'success' : isSendingStatus ? 'progress' : 'info';
      // Priority when more than one would have rendered (handoffUrl and
      // hasPreviewFailureAction can co-occur on a mixed-content failure —
      // untested in combination, so this follows the boxes' own top-to-bottom
      // order): Open card installer > Open Flash > the preview failure's own
      // recovery action. Nothing here is ever dropped silently in a tested
      // combination — only the untested mixed-content pairing loses its
      // second button.
      let action = null;
      if (handoffUrl) {
        action = { label: 'Open card installer', onSelect: () => { void openCardInstaller(); } };
      } else if (showFlashAction) {
        action = { label: 'Open Flash', onSelect: () => { window.location.hash = '#screen=flash'; } };
      } else if (hasPreviewFailureAction) {
        action = { label: previewFailure.actionLabel, onSelect: runPreviewFailureAction };
      }
      publishNotice({
        key: 'pattern-card-status',
        testId: 'pattern-card-status',
        tone,
        title: status,
        source: 'pattern-status',
        action,
      });
    }, [status, statusKind, isPatternRecoveryConfirmFlow, patternCardGate, handoffUrl, showFlashAction, hasPreviewFailureAction, previewFailure]);

    useEffect(() => {
      if (!hardwareConfigurationIssue) {
        dismissNoticeKey('hardware-configuration-warning');
        return;
      }
      // Two buttons existed in the old box: "Fix automatically" (one-click,
      // only offered when the fix is unambiguous) and "Fix wiring" (always
      // offered, navigates to Layout). When both are available the automatic
      // fix is strictly better, so it is the notice's action and "Fix wiring"
      // is dropped — tests/patterns-v3.spec.ts's own duplicate-encoder test
      // only exercises the case where "Fix automatically" is ABSENT, so
      // "Fix wiring" stays the action in that (tested) case.
      publishNotice({
        key: 'hardware-configuration-warning',
        testId: 'hardware-configuration-warning',
        tone: 'error',
        title: 'Hardware setup needs attention.',
        body: `${hardwareConfigurationIssue} Patterns are still available, but Lightweaver will not send an unsafe setup to the card.`,
        source: 'pattern-hardware',
        action: canRemoveDuplicateAlternatePress
          ? { label: 'Fix automatically', onSelect: removeDuplicateAlternatePress }
          : { label: 'Fix wiring', onSelect: () => { window.location.hash = '#screen=layout&mode=draw'; } },
      });
    }, [hardwareConfigurationIssue, canRemoveDuplicateAlternatePress]);

    // Was: published to the floating notice layer, which meant an
    // absolutely-positioned box over `.pm-target` — hiding Pixels driven and
    // the Save look row underneath it. This notice is about ONE tap on ONE
    // card, not the whole screen, so per noticeLayer.js's own scope rule
    // (screen-scoped floats, field-scoped reserves ground beside the thing
    // it is about) it renders in flow, directly above the Design target
    // card, instead. Content and single action are unchanged; only the
    // layout moved. See the render below (`pattern-gate-inline`).

    // F32 (2026-09-09): this used to publish a floating 'pattern-card-blackout'
    // notice here — "Lights are off on the card." sitting over `.pm-target`,
    // half hidden under the Connect dialog. Adrian: "yes it says it.. find
    // better place to say it". The fact now lives in the footer connection
    // chip (CardStatusControl.jsx), which is on every screen and already the
    // one authority for card state, and its one click runs the same recovery
    // this screen's toolbar button sends. The toolbar's Recover lights button
    // (data-testid="recover-lights", styled primary below) is unchanged and
    // stays the primary action while blacked out — only the floating notice
    // is gone.

    return (
      <div className="screen">
        <div className="screen-scroll">
          <div className="pm">
            {/* hero */}
            <header className="pm-hero">
              <div className="pm-title">
                <span className="pm-kicker">Studio · Patterns</span>
                <h1>Patterns &amp; Looks</h1>
                <p>Choose chip-ready patterns, tune the colors, then install the finished look on the card.</p>
                {/* F18: while the pattern-gate notice is up, it already
                    carries this exact verdict as its own alert with the
                    actionable next step ("Verify project in Card status") —
                    the same stand-down this screen already applies to its
                    'pattern-card-status' notice a few effects down, extended
                    to the chip so an honoured edit intent does not read as
                    routed back to the setup ladder just because this chip's
                    taskId happens to match the ladder's own attribute. */}
                {!patternCardGate && (
                  <SetupJourneyChip cardLink={cardLink} cardLifecycle={cardLifecycle} project={currentProject} />
                )}
              </div>
              <div className="pm-actions">
                <button className="btn primary" title="Install the current look on the card" onClick={savePreviewToCard} disabled={!installGate.allowed}>{I.bolt}{cardSave.status === 'pending' ? 'Sending…' : cardSave.status === 'failed' ? 'Retry install' : 'Install on card'}</button>
                {/* Renders whenever a card is paired, not only while
                    `connected` — the uncertain states (reassociating,
                    booting, a mismatch resolving) are exactly when an owner
                    needs this button, and it used to vanish there and leave
                    only the buried "Repair LED" menu item as a way back. It
                    disables with a reason instead of disappearing. */}
                {paired &&
                  <button
                    className={"btn" + (cardBlackedOut ? " primary" : "")}
                    title={recoverLightsCardAccess !== 'ready'
                      ? recoverLightsDisabledReason(recoverLightsCardAccess)
                      : cardSave.conflictsDisabled
                        ? 'Studio is busy sending another command to the card.'
                        : 'Bring the lights back with a warm-white recovery'}
                    data-testid="recover-lights"
                    onClick={repairLed}
                    disabled={recoverLightsCardAccess !== 'ready' || cardSave.conflictsDisabled}
                  >{I.wrench}Recover lights</button>
                }
                <div className="pm-color-order">
                  <button
                    ref={colorOrderButtonRef}
                    type="button"
                    className={"btn" + (colorOrderOpen ? " toggled" : "")}
                    aria-expanded={colorOrderOpen}
                    aria-haspopup="dialog"
                    disabled={authorizedPatternCardAccess !== 'ready'}
                    onClick={async () => {
                      if (colorOrderOpen) {
                        closeColorOrder();
                        return;
                      }
                      if (currentPatternCardAccess() !== 'ready') {
                        blockPatternCardEffect(currentPatternCardAccess());
                        return;
                      }
                      try {
                        const evidence = await readCardProjectEvidence({ host: cardHost, transport: cardLink?.transport });
                        if (!matchesCurrentCardProjectEvidence(evidence)) {
                          blockPatternCardEffect('project');
                          return;
                        }
                      } catch (error) {
                        setStatusKind('err');
                        setStatus(error?.message || 'The card could not be reverified before the color test.');
                        return;
                      }
                      setMenuOpen(false);
                      setColorOrderOpen(true);
                    }}
                  >{I.refresh}Shift colors</button>
                  {colorOrderOpen &&
                    <>
                      <div className="pm-menu-backdrop" aria-hidden="true" onClick={() => closeColorOrder()} />
                      <div ref={colorOrderPopoverRef} className="pm-color-order-pop" role="dialog" aria-label="Shift colors">
                        <StripColorOrderCheck
                          quick
                          cardHost={cardHost}
                          cardLink={cardLink}
                          controller={standaloneController}
                          setController={setStandaloneController}
                        />
                      </div>
                    </>
                  }
                </div>
                <div className="ag-conn">
                  <button className="btn" onClick={openCardPage}>{I.open}Open card page</button>
                </div>
                <div className="pm-menu">
                  <button ref={menuButtonRef} className="btn" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => { setColorOrderOpen(false); setMenuOpen((o) => !o); }} disabled={cardSave.conflictsDisabled || Boolean(hardwareConfigurationIssue)}>{I.dots}Card tools{I.chevronD}</button>
                  {menuOpen &&
                  <>
                      <div className="pm-menu-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />
                      <div ref={menuRef} className="pm-menu-pop" role="menu" aria-label="Card tools">
                        {/* "Repair LED" removed: it called the identical
                            repairLed() handler as the toolbar's own
                            "Recover lights" button (now rendered whenever a
                            card is paired, see above) — one job, one name,
                            one control. */}
                        <button role="menuitem" className="pm-menu-item" onClick={() => { setMenuOpen(false); sendSplitPreview(); }}>{I.target}Send split preview</button>
                        <div className="pm-menu-sep" />
                        <button role="menuitem" className="pm-menu-item" onClick={() => { setMenuOpen(false); copyConfig(); }}>{I.copy}Copy setup</button>
                        <button role="menuitem" className="pm-menu-item" onClick={() => { setMenuOpen(false); downloadConfig(); }}>{I.download}Download setup</button>
                      </div>
                    </>
                  }
                </div>
              </div>
            </header>

            {/* Two states of this same physical-recovery confirmation stay in
                document flow, unmigrated: the notice layer's `action` is one
                button, and "Yes, warm white is visible" / "No, lights are
                still dark" are both real, both tested
                (tests/patterns-v3.spec.ts: 'Recover lights asks for physical
                confirmation…'). Everything else this box used to show —
                plain info/success/error, the firmware-gap and mixed-content
                cases, the single-button preview-failure recovery — is
                published to the notice layer instead (see the
                'pattern-card-status' effect above). */}
            {status && isPatternRecoveryConfirmFlow &&
              <div className={"pmx-status" + (statusKind === 'ok' ? ' is-ok' : statusKind === 'err' ? ' is-err' : '')} role={statusKind === 'err' ? 'alert' : 'status'} aria-live="polite">
                {status}
                {recoveryConfirmation === 'pending' &&
                  <div className="pmx-status-actions" aria-label="Confirm physical recovery">
                    <button type="button" className="btn primary" onClick={() => {
                      setRecoveryConfirmation('confirmed');
                      setStatusKind('ok');
                      setStatus('Warm white confirmed on the real LEDs.');
                    }}>Yes, warm white is visible</button>
                    <button type="button" className="btn" onClick={() => {
                      setRecoveryConfirmation('dark');
                      setStatusKind('err');
                      setStatus('The card responded, but physical light is not confirmed.');
                    }}>No, lights are still dark</button>
                  </div>
                }
                {recoveryConfirmation === 'dark' &&
                  <div className="pmx-status-actions">
                    <button type="button" className="btn primary" onClick={() => { window.location.hash = '#screen=layout&mode=draw'; }}>Find my LED wire</button>
                  </div>
                }
              </div>
            }

            <div className="pm-grid">
              {/* MAIN */}
              <section className="pm-main">
                {/* browse */}
                <div className="pm-browse" style={{ margin: "5px 0px 0px" }}>
                  {/* One header bar for the whole module: the light, the name,
                      and the counts pushed right. The counts are read with a
                      single separator so the bar scans as one sentence rather
                      than a sum and a fraction. */}
                  {/* Was: "{filtered.length} shown of {REAL_PATTERNS.length}
                      chip-ready" — filtered.length counts across mixes +
                      custom patterns + real patterns, divided against real
                      patterns alone, so it could read as MORE shown than
                      exist the moment a saved look or custom pattern is on
                      the bank. The correct, differently-scoped count already
                      sits a few lines down (`pt-count`, next to the category
                      chips); this header keeps only the two facts nothing
                      else on the panel states. */}
                  <div className="sec-h"><span className="t">Pattern bank</span><span className="m">{realMixes.length} mixes · {playlistSize} in playlist</span>
                    <div className="pm-ledmode" role="group" aria-label="Swatch style">
                      <button type="button" aria-pressed={ledMode === 'beads'}
                              className={ledMode === 'beads' ? 'on' : undefined}
                              onClick={() => chooseLedMode('beads')}>Beads</button>
                      <button type="button" aria-pressed={ledMode === 'gradient'}
                              className={ledMode === 'gradient' ? 'on' : undefined}
                              onClick={() => chooseLedMode('gradient')}>Gradient</button>
                    </div><span className="line" /></div>

                  {/* Was: a "Preview taps on the LED card" checkbox. There is no
                      moment in this screen's job where a tap should not reach the
                      card — it is the scratchpad for trying patterns on the real
                      strip — and an off checkbox only produced taps that looked
                      broken. Every tap sends. */}
                  <div className="pm-livebar">
                    <span className="pm-saved" data-testid="physical-preview-status">{cardActionStatusLabel(previewAction)}</span>
                  </div>
                  <div className="search" style={{ maxWidth: "none", marginBottom: 10 }}>{I.search}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chip patterns" /></div>
                  <div className="pt-tools" style={{ padding: "0px", margin: "0px 0px 10px" }}>
                    <div className="chips">
                      {PATTERN_CATS.map((c) => <button key={c.id} className={"chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}>{c.label}</button>)}
                    </div>
                    <span className="pt-count">{Math.min(visibleCount, filtered.length)} of {filtered.length} shown</span>
                  </div>
                  {/* This refusal now floats (see the 'pattern-gate-notice'
                      effect above) instead of living in document flow here,
                      so it no longer needs scrolling into view when the hero
                      status is off-screen — it is always visible. */}
                  <div className="pm-cards">
                    {filtered.slice(0, visibleCount).map((p) => {
                      const cardInPlaylist = inPlaylist(p.id);
                      return (
                    <div key={p.id} className="pmcard-wrap">
                      <button type="button" className={"pmcard" + (p.id === selId ? " on" : "") + (cardInPlaylist ? " in-playlist" : "")} data-pattern-id={p.id} aria-pressed={p.id === selId} onClick={() => selectCard(p)}>
                        {/* Speed rides the LED window's top-right corner; the
                            playlist star takes the row slot it used to hold.
                            Speed is a property of the preview you are looking
                            at, the star is the action — each now sits where it
                            belongs. */}
                        {/* The tempo used to ride the tile's top-right corner. It reads
                            as a caption on the pattern, not a label on the picture, so it
                            sits with the name alongside the mood the pattern is filed
                            under — the two facts you sort by. */}
                        <div className="pmcard-led"><LedRow pal={p.pal} n={11} mode={ledMode} /></div>
                        <div className="pmcard-row">
                          <span className="pmcard-nm">{p.label}</span>
                          {p.mix && <span className="mixtag">mix</span>}
                        </div>
                        <div className="pmcard-sub"><span className="pmcard-sp">{p.sp}</span><span className="pmcard-dot" aria-hidden="true">·</span><span className="pmcard-cat">{String(p.cat || '').toUpperCase()}</span></div>
                      </button>
                        {/* Rides the top-right corner of the card's LED window
                            instead of a full-width row underneath it. Same tap
                            target, ~33px less height per card. Icon-only at
                            rest; the label slides out on hover/focus, where
                            there is room for it to explain itself. */}
                        <button
                          type="button"
                          aria-pressed={cardInPlaylist}
                          aria-label={cardInPlaylist ? `Remove ${p.label} from playlist` : `Add ${p.label} to playlist`}
                          title={cardInPlaylist ? "In playlist \u2014 tap to remove" : "Add to playlist"}
                          className={"pmcard-pl" + (cardInPlaylist ? " on" : "")}
                          onClick={(e) => togglePl(p.id, e)}
                        >
                          <span className="pmcard-pl-pill">
                            <svg viewBox="0 0 24 24" className="plstar" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.4 4.1 1.2 6L12 16.8 6.6 19.4l1.2-6L3.4 9.3l6-.7z" /></svg>
                            <span className="pmcard-pl-lab">{cardInPlaylist ? "In playlist" : "Playlist"}</span>
                          </span>
                        </button>
                    </div>
                      );
                    })}
                    {!filtered.length && <p style={{ color: "var(--text-faint)", fontSize: 13, gridColumn: "1 / -1", padding: 20 }}>No chip patterns match this search.</p>}
                  </div>
                  {filtered.length > visibleCount &&
                    <div className="pm-showmore" ref={patternSentinelRef} data-testid="patterns-sentinel">
                      <button type="button" className="btn ghost-sm" data-testid="patterns-show-more" onClick={() => setVisibleCount((c) => c + PATTERN_PAGE)}>
                        Show {Math.min(PATTERN_PAGE, filtered.length - visibleCount)} more
                      </button>
                      <button type="button" className="pm-showall" data-testid="patterns-show-all" onClick={() => setVisibleCount(filtered.length)}>
                        Show all {filtered.length}
                      </button>
                    </div>
                  }
                </div>

                {/* Reserved ground above the Design target card: this used to
                    float over `.pm-target` (see the removed effect above) and
                    hide Pixels driven and the Save look row underneath it.
                    Content and single action are unchanged; it now pushes the
                    card down instead of covering it. */}
                {patternCardGate &&
                  <div className="pattern-gate-inline lw-field" data-testid="pattern-gate-notice" role="alert" aria-live="assertive">
                    <p className="pattern-gate-inline-title">That tap was not sent to the card.</p>
                    <p className="pattern-gate-inline-body">{status || patternGateMessage(patternCardGate)}</p>
                    <button type="button" className="btn primary" onClick={runPatternGateAction}>{patternGateActionLabel}</button>
                  </div>
                }

                {/* design target */}
                <div className="pm-target">
                  <div className="sec-h"><span className="t">Design target</span><span className="m">{Math.max(1, previewTargetIds.length)} section · card limit {CARD_HARDWARE_CONTRACT.maxZones}</span><span className="line" /></div>
                  {/* multi-section target tabs (live): All sections / Section 1 / ... */}
                  {sectionTargets.length > 1 &&
                    <div className="chips pm-section-row" style={{ marginBottom: 8 }} aria-label="Target sections">
                      {effectiveSectionTargets.filter(t => t.kind === 'all' || previewTargetIds.includes(t.id)).map((t) =>
                        <button key={t.id} data-testid={`section-target-${t.id}`} className={"chip" + (t.id === selectedTarget?.id ? " on" : "")} onClick={() => selectTarget(t)}>
                          <span className="chip-name">{targetLabel(t)}</span>
                          {/* Each section reads with its pattern beneath it, so four
                              sections are one glance, not four taps. The All chip
                              carries the piece's default look. */}
                          <span className="chip-sub" data-testid={`section-pattern-${t.id}`}>{patternNameFor(t.look?.patternId)}</span>
                        </button>
                      )}
                    </div>
                  }
                  {/* One status line about sections: what the card holds, read from
                      the card itself. Empty until the card has been read. */}
                  {cardHoldsLine &&
                    <p className="pm-cardholds" data-testid="card-holds">{cardHoldsLine}</p>
                  }
                  {sectionCount <= 1 &&
                    <p className="pm-cardholds">
                      One section drives the whole piece.{' '}
                      <button type="button" className="wordlink" data-testid="divide-in-layout" onClick={() => { window.location.hash = '#screen=layout&mode=draw'; }}>Divide in Layout</button>
                    </p>
                  }
                  {/* Three facts on one line, not two rows that said the same
                      thing twice. The old card printed Target above Layer and
                      Pattern above Pattern — the same section name and the same
                      pattern name, one under the other, with a decorative "ALL"
                      key and a layer number that did nothing. What is left is
                      what the target actually IS: which section, how many
                      pixels it drives, and what is on the card.

                      The pixel tile keeps its `tc-layer` / `tc-total` element
                      and its label-then-value DOM order, because that is the
                      readout card-workspace.spec reads back after a project
                      switch. Only the painting order is flipped, so a reader
                      sees "27 LEDs" and a machine still reads "LEDs27". */}
                  <div className="pm-targetcard">
                    <div className="tc-stat">
                      <span className="tc-stat-k">Section</span>
                      <strong className="tc-stat-v">{selectedTargetName}</strong>
                    </div>
                    <div className="tc-stat tc-layer">
                      <span className="tc-stat-k">Pixels driven</span>
                      <div className="tc-total"><span className="lab">LEDs</span><strong>{selectedTarget?.pixelCount || targetTotal}</strong></div>
                    </div>
                    {/* Amber is reserved for what the card is doing right now,
                        so it lights only once the runtime has confirmed the
                        send. Until then this names the pattern being driven,
                        in the neutral ink, and the bank's status line above
                        says whether it has landed. */}
                    <div className={"tc-stat tc-live" + (previewAction.status === 'confirmed' ? " is-live" : "")}>
                      {/* One vocabulary for "has this reached the card" —
                          the same three words the bank's own status line and
                          Playlist use, so the phrase does not change meaning
                          moving between panels and screens. */}
                      <span className="tc-stat-k">{cardActionStatusLabel(previewAction)}</span>
                      <span className="tc-stat-v tc-patval"><span className="sw" style={{ background: tint, boxShadow: `0 0 6px ${tint}` }} />{sel.label}</span>
                    </div>
                  </div>
                </div>

              </section>

              {/* ASIDE */}
              <aside className="pm-aside">
                <div className="pm-instrument" data-testid="pattern-instrument">
                <div className="card pm-pane pm-preview-pane">
                  <div className="pm-preview-controls" aria-label="Pattern preview controls">
                    <div className="pm-preview-meta" data-testid="pattern-preview-meta" title={`${previewTargetName} · ${sel.label}`}>
                      <span className="t">Preview</span>
                      <span className="m">{sel.label}</span>
                    </div>
                    <button
                      type="button"
                      className="pm-preview-step"
                      aria-label="Previous LED target"
                      disabled={previewMode !== 'strip' || previewTargetIds.indexOf(lastPreviewTargetId) <= 0}
                      onClick={() => stepPatternPreviewTarget(-1)}
                    >‹</button>
                    <label className="pm-preview-select">
                      <span className="sr-only">Preview target</span>
                      <select
                        aria-label="Preview target"
                        value={previewMode === 'piece' ? 'piece' : lastPreviewTargetId}
                        onChange={event => choosePatternPreviewTarget(event.target.value)}
                      >
                        <option value="piece">Whole piece</option>
                        {patternPreviewSegments.map(segment => (
                          <option key={segment.id} value={segment.id}>{segment.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="pm-preview-step"
                      aria-label="Next LED target"
                      disabled={previewMode !== 'strip' || previewTargetIds.indexOf(lastPreviewTargetId) >= previewTargetIds.length - 1}
                      onClick={() => stepPatternPreviewTarget(1)}
                    >›</button>
                    <button
                      type="button"
                      className={`pm-piece-toggle${previewMode === 'piece' ? ' on' : ''}`}
                      aria-pressed={previewMode === 'piece'}
                      onClick={togglePatternPiecePreview}
                    >On my piece</button>
                  </div>
                  <div
                    data-testid="pattern-project-preview"
                    data-preview-led-count={projectPreviewStrip?.pts?.length || 0}
                    data-preview-order={(projectPreviewStrip?.order || []).join(',')}
                    data-preview-symmetry={symSettings?.enabled ? symSettings.type : 'none'}
                  >
                    <div
                      className="pm-piece-stage"
                      data-testid="pattern-piece-preview"
                      data-preview-mode={previewMode}
                      data-preview-target={previewMode === 'piece' ? 'piece' : lastPreviewTargetId}
                      data-preview-led-count={visiblePatternPreviewSegments.reduce((sum, segment) => sum + segment.pixels.length, 0)}
                      data-preview-view-box={patternPreviewViewBox}
                      data-preview-targets={visiblePatternPreviewSegments.map(segment => segment.id).join(',')}
                      data-preview-patterns={visiblePatternPreviewSegments.map(segment => segment.sourcePatternId).join(',')}
                    >
                      {visiblePatternPreviewSegments.length ? (
                        <PatternPreview
                          strips={visiblePatternPreviewSegments}
                          hidden={{}}
                          viewBox={patternPreviewViewBox}
                          patternId={visiblePatternPreviewSegments[0].patternId}
                          playing={true}
                          palette={visiblePatternPreviewSegments[0].palette}
                          params={patternParams?.[visiblePatternPreviewSegments[0].patternId] || {}}
                          patternParamsById={patternParams}
                          bpm={bpm}
                          masterSpeed={1}
                          masterBrightness={1}
                          masterSaturation={1}
                          masterHueShift={0}
                          gammaEnabled={gammaEnabled}
                          gammaValue={gammaValue}
                          symSettings={symSettings?.enabled ? symSettings : null}
                          glow={1.1}
                          dotSize={3}
                          motionSmoothing="soft"
                          targetFps={30}
                          ariaLabel={`${previewTargetName} animated LED preview`}
                        />
                      ) : (
                        <p className="pm-preview-empty">Add LEDs in Layout to preview this piece.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="card pm-pane pm-tune-pane">
                  {/* Every panel in this vocabulary opens with a header bar and
                      a status light — that is what makes it read as a module
                      rather than a stack of controls. The tuning pane was the
                      one panel on this screen with no head at all, so four
                      faders floated between two headed modules. */}
                  <div className="sec-h"><span className="t">Tune</span><span className="m">{sel.label}</span><span className="line" /></div>
                  <div aria-label="Keep your look" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px 16px', marginBottom: 8 }}>
                    <input className="pm-input" data-testid="look-name" style={{ flex: '1 1 180px', minWidth: 0 }} aria-label="Look name" placeholder="Name this look (optional)" value={mixName} onChange={event => { setMixName(event.target.value); setLookSaveState(''); }} />
                    <button type="button" className="btn primary" data-testid="look-save-preset" onClick={savePreset}>{editingSavedLook ? `Update ${editingSavedLook.label}` : 'Keep this look'}</button>
                    {editingSavedLook && <>
                      <button type="button" className="btn" data-testid="look-save-as-new" onClick={() => saveLook(true)}>Save as new</button>
                      <button type="button" className="btn" data-testid="look-rename" disabled={!mixName.trim() || mixName.trim() === editingSavedLook.label} onClick={renameLook}>Rename</button>
                      <button type="button" className="btn" data-testid="look-delete" onClick={deleteLook}>Delete{playlist.filter(item => item.lookId === editingSavedLook.id).length ? ` · ${playlist.filter(item => item.lookId === editingSavedLook.id).length} playlist uses` : ''}</button>
                    </>}
                    {deletedLook && <button type="button" className="btn" data-testid="look-delete-undo" onClick={undoDeleteLook}>Undo delete {deletedLook.label}</button>}
                    <div role="status" data-testid="look-save-status" style={{ flexBasis: '100%', display: 'block', lineHeight: 1.5, minHeight: 20, paddingTop: 4 }}>{scratchError || (hasUnsavedLookChanges && (!lookSaveState || lookSaveState === 'Saved in this project') ? 'Unsaved changes · working copy kept on this browser' : lookSaveState || (editingSavedLook ? 'In this project' : 'Choose, play, then keep your look'))}</div>
                  </div>
                  {/* color picker (drives the live custom hue/sat) */}
                  <div className="pm-hue">
                    <div className="pm-hue-lab"><span>Hue</span><span className="hv" data-testid="look-hue-readout">{hueDeg}°</span></div>
                    <input className="lw pm-huerange" type="range" min="0" max="255" step="1" value={look.customHue} style={{ '--pm-hue-thumb': colorHex }} data-testid="look-hue-slider" aria-label="Hue" onChange={(e) => updatePreviewLook({ customHue: parseInt(e.target.value) })} />
                    <input type="color" value={colorHex} data-testid="look-color-picker" aria-label="Pick color" onChange={(e) => updatePreviewLook(hexToCardColor(e.target.value, look))} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
                  </div>
                  <Slider k="Saturation" hint="How much colour" v={`${satPct}%`} value={look.customSaturation} min={0} max={255} step={1} testId="look-saturation" onChange={(customSaturation) => updatePreviewLook({ customSaturation })} />
                  <Slider k="Brightness" hint="Overall output level" v={`${briPct}%`} value={look.brightness} min={0.05} max={1} step={0.01} testId="look-brightness" onChange={(brightness) => updatePreviewLook({ brightness })} />
                  <Slider k="Speed" hint="How fast it moves" v={`${spd.toFixed(2)}×`} value={speedSlider} min={LOOK_SPEED_SLIDER_MIN} max={LOOK_SPEED_SLIDER_MAX} step={1} testId="look-speed" onChange={(position) => updatePreviewLook({ speed: sliderValueToLookSpeed(position) })} />
                  <button
                    type="button"
                    className="btn"
                    data-testid="open-pattern-lab"
                    onClick={openLookInLab}
                  >
                    Sculpt in Lab
                  </button>
                </div>
                </div>

                <div className="card pm-pane">
                  <div className="sec-h"><span className="t">Color</span><button type="button" className="pm-reset" data-testid="look-reset" onClick={() => updatePreviewLook({ brightness: DEFAULT_CARD_VISUAL_LOOK.brightness, speed: DEFAULT_CARD_VISUAL_LOOK.speed, customHue: DEFAULT_CARD_VISUAL_LOOK.customHue, customSaturation: DEFAULT_CARD_VISUAL_LOOK.customSaturation, hueShift: DEFAULT_CARD_VISUAL_LOOK.hueShift, customBreathe: false, breatheLowerPct: 85, breatheUpperPct: 100, breatheCycleSeconds: 9, customDrift: false })}>Reset</button></div>
                  <div className="pm-palette">
                    <span className="pm-palrow">{sel.pal.map((c, i) => {
                      const h = c.replace('#', '');
                      const px = [{ r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }];
                      applyLookColorModifiers(px, 0, look);
                      const cc = px[0];
                      return <span key={i} style={{ background: `rgb(${cc.r},${cc.g},${cc.b})` }} />;
                    })}</span>
                    <div className="pm-palmeta"><strong>{sel.label}</strong><span>{sel.sp} · {sel.cat.toUpperCase()}</span></div>
                  </div>

                  {/* Advanced: Breathe / Drift + Hue-shift, tucked in the mockup idiom */}
                  <details className="pmx-advanced">
                    <summary><span>Advanced</span><span className="pmx-advanced-summary" data-testid="breathe-summary">{breatheSummary}</span></summary>
                    <div className="pmx-advanced-body">
                      <div className="pmx-switches">
                        <label><input type="checkbox" checked={look.customBreathe} onChange={(e) => updatePreviewLook({ customBreathe: e.target.checked })} /> Breathe</label>
                        <label><input type="checkbox" checked={look.customDrift} onChange={(e) => updatePreviewLook({ customDrift: e.target.checked })} /> Drift</label>
                      </div>
                      {look.customBreathe && <div className="pmx-breathe-controls">
                        <Slider k="Lower brightness" hint="Dimmest point" v={`${look.breatheLowerPct}%`} value={look.breatheLowerPct} min={0} max={look.breatheUpperPct} step={1} testId="breathe-lower" onChange={(breatheLowerPct) => updatePreviewLook({ breatheLowerPct })} />
                        <Slider k="Upper brightness" hint="Brightest point" v={`${look.breatheUpperPct}%`} value={look.breatheUpperPct} min={look.breatheLowerPct} max={100} step={1} testId="breathe-upper" onChange={(breatheUpperPct) => updatePreviewLook({ breatheUpperPct })} />
                        <Slider k="Cycle" hint="Seconds per breath" v={`${look.breatheCycleSeconds}s`} value={look.breatheCycleSeconds} min={4} max={30} step={1} testId="breathe-cycle" onChange={(breatheCycleSeconds) => updatePreviewLook({ breatheCycleSeconds })} />
                      </div>}
                      <Slider k="Hue shift" hint="Rotates the palette" v={String(look.hueShift)} value={look.hueShift} min={-128} max={128} step={1} testId="look-hue-shift" onChange={(hueShift) => updatePreviewLook({ hueShift })} />
                    </div>
                  </details>
                </div>

                <div className="card pm-pane">
                  <div className="sec-h"><span className="t">Geometry</span><span className="m">{GEOMETRY.find((g) => g.id === geo).label}</span></div>
                  <div className="geo-seg">
                    {GEOMETRY.map((g) => <button key={g.id} className={geo === g.id ? "on" : ""} onClick={() => updateGeo(g.id)}>{g.id === "mirror" && I.mirror}{g.label}</button>)}
                  </div>
                  {geo !== "none" && (
                    <>
                      <div className="pm-geo-stage">
                        <PatternPreview
                          strips={strips}
                          hidden={hidden}
                          viewBox={viewBox}
                          svgText={svgText}
                          patternId={selId}
                          playing={true}
                          palette={sel.pal}
                          params={patternParams?.[selId] || {}}
                          patternParamsById={patternParams}
                          bpm={bpm}
                          masterSpeed={look.speed}
                          masterBrightness={look.brightness}
                          masterSaturation={look.customSaturation / 255}
                          masterHueShift={look.hueShift / 255}
                          gammaEnabled={gammaEnabled}
                          gammaValue={gammaValue}
                          symSettings={symSettings?.enabled ? symSettings : null}
                          symOverlay={geo !== "none" && Boolean(symSettings?.enabled)}
                          onSymChange={patchGeo}
                          glow={1.1}
                          dotSize={3}
                          motionSmoothing="soft"
                          targetFps={30}
                        />
                      </div>
                      {geo === "mandala" && (
                        <>
                          <div className="geo-lab">Petals</div>
                          <div className="geo-seg geo-counts" aria-label="Mandala petals">
                            {[3, 4, 5, 6, 8, 12].map((c) => (
                              <button key={c} className={(symSettings.count || 8) === c ? "on" : ""} data-testid={`geo-petals-${c}`} onClick={() => patchGeo({ type: "radial", count: c })}>{c}</button>
                            ))}
                          </div>
                          <Slider k="Rotate" hint="Turns the symmetry" v={`${Math.round((symSettings.phase || 0) * 100)}%`} value={Math.round((symSettings.phase || 0) * 100)} min={0} max={100} step={1} testId="geo-rotate" onChange={(pct) => patchGeo({ type: "radial", phase: pct / 100 })} />
                        </>
                      )}
                      {geo === "kaleido" && (
                        <>
                          <Slider k="Petals" hint="Mirrored slices" v={String(symSettings.slices || 6)} value={symSettings.slices || 6} min={2} max={16} step={1} testId="geo-slices" onChange={(s) => patchGeo({ type: "kaleido", slices: Math.round(s) })} />
                          <Slider k="Rotate" hint="Turns the symmetry" v={`${Math.round((symSettings.phase || 0) * 100)}%`} value={Math.round((symSettings.phase || 0) * 100)} min={0} max={100} step={1} testId="geo-rotate" onChange={(pct) => patchGeo({ type: "kaleido", phase: pct / 100 })} />
                        </>
                      )}
                      <div className="geo-fit">
                        <button type="button" className="geo-fit-btn" data-testid="geo-fit" onClick={fitGeo}>Fit to my piece</button>
                        <span className="geo-fit-hint">Drag the dot on the preview to move the center.</span>
                      </div>
                    </>
                  )}
                  {/* swatch grid retained as the round color picks (mockup SWATCHES) */}
                  <div className="pm-swatches" aria-label="Color swatches" style={{ marginTop: 8 }}>
                    {SWATCHES.map((sw, i) => {
                      const hue = Math.round((i / (SWATCHES.length - 1)) * 255);
                      return (
                        <button key={i} className={"pm-sw" + (Math.abs(hue - look.customHue) <= 6 ? " on" : "")} style={{ background: `oklch(72% ${cardSaturationToChroma(look.customSaturation)} ${cardHueToDegrees(hue)})` }} title={`Hue ${hue}`} aria-label={`Set hue ${hue}`} onClick={() => updatePreviewLook({ customHue: hue })} />
                      );
                    })}
                  </div>
                </div>

              </aside>
            </div>
          </div>
        </div>
      </div>);

  }

export { PatternScreen };
