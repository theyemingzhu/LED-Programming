// A card that behaves like a card.
//
// Every existing spec stubs the hardware with a frozen JSON blob, which is why
// "click a pattern and it plays" has never been assertable: the stub answered
// the same before and after the click. This is a state machine. Writes mutate
// it, reads reflect the mutation, and the currently-playing pattern is a fact
// about the simulated card rather than a fact about the screen.
//
// It also refuses to model a card that could not exist. Readiness flags are
// DERIVED from the state, never set by hand — several fixtures in this suite
// describe a ready card reporting no installed project, which no real card
// does, and an authorization test written against one passes while the real
// journey fails.
//
// Field-for-field against the firmware: LightweaverStorage.cpp runtimeStatusJson,
// LightweaverWeb.cpp handleControlPost / handleWiringStatus / handlePatterns,
// and the validators in src/lib/cardReadiness.js, cardWiringSafety.js and
// cardLiveControl.js that reject anything less.
//
// See docs/card-state-matrix.md.
import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { CUSTOMER_CONTROL_WIRE_FIELDS } from '../../src/lib/cardCustomerControlContract.js';
import type { CardStateSpec, PatternEntry } from './cardStates.js';
import { MATRIX_CARD_ID, MATRIX_FIRMWARE_VERSION, MATRIX_BUILD_ID, cardState } from './cardStates.js';

/** Every host Studio might reach a card on. */
export const CARD_HOSTS = ['lightweaver.local', '192.168.4.1', '192.168.18.70'];

// The approved output menu minus the GPIOs the default control assignment
// claims (encoder, buttons, status LED) — see BENCH_RESERVED_CONTROL_PINS in
// src/lib/benchConfig.js. Verified against LightweaverWeb.cpp's compiled pin
// menu the same way tests/strip-discovery.spec.ts's own BEACON_PORTS is.
export const BEACON_PORTS = [15, 16, 17, 18, 21, 38, 40, 41, 42, 47, 48];

export type CardRequest = { method: string; path: string; body: unknown; at: number };

export type CardSimulator = {
  /** Live, mutable. Assertions read this to ask the CARD what it is doing. */
  state: CardStateSpec & {
    cardId: string; bootId: string; stateRevision: number;
    /** True from activate until confirm/rollback/expiry — the probation window. */
    wiringTestActive: boolean;
    wiringProbationRemainingMs: number;
    /** Per-zone brightness/speed/colour/breathe/drift, as `/api/control`
     * writes have actually left it — see `zoneControlsFor`. */
    zoneControls: Map<string, ZoneControlValues>;
  };
  install(page: Page): Promise<void>;
  /** The pattern the card is actually playing right now. */
  playingId(): string;
  requests: CardRequest[];
  /** Paths Studio asked for that this simulator does not model. */
  unhandled: string[];
  /** Raw pixel-array frames received over the frame-stream WebSocket (see `frames` above). */
  frames: string[][];
  waitForPlaying(id: string, timeoutMs?: number): Promise<void>;
  /** Answer one bridge-relayed request from the same state. */
  handleBridge(type: string, payload: unknown): Record<string, unknown>;

  // ── Things real cards do and a happy-path stub never will ────────────────
  /**
   * Refuse the next `times` requests to `path` with a real firmware refusal.
   * A card that only ever says yes cannot tell you what the owner sees when it
   * says no, which is most of what goes wrong in a room.
   */
  refuse(path: string, refusal: { status: number; body?: unknown; times?: number }): void;
  /** Power-cycle: a new bootId, and whatever was playing stops. */
  reboot(): void;
  /** Stop answering entirely — a Wi-Fi drop, a pulled plug, a sleeping router. */
  goOffline(): void;
  /** Answer again. Pass a new host to model the card returning on a new address. */
  goOnline(): void;

  // ── Wiring test lifecycle ─────────────────────────────────────────────────
  /**
   * Put the card straight into the "testing" state, as if Studio had already
   * staged a wiring change and activated it (the card rebooted with the
   * candidate live and probation running). Skips the staged intermediate —
   * use this when a test's subject is what happens DURING the test, not the
   * activation itself.
   */
  beginWiringTest(options?: { pixels?: number; pin?: number }): void;
  /**
   * The card's own probation deadline elapses with nobody confirming or
   * rolling back — exactly what firmware does when nothing calls
   * /api/wiring/confirm before LW_WIRING_PROBATION_MS: it reboots back to the
   * prior known-good wiring on its own.
   */
  expireWiringProbation(): void;

  /**
   * A request that the card genuinely APPLIES — the mutation lands — but
   * whose reply never arrives, modelling a lost reply after a successful
   * write. Different from `refuse`, which never applies the request at all;
   * this is the case that makes a naive retry send a second, real, duplicate
   * command.
   */
  respondThenDrop(path: string, options?: { times?: number }): void;
  /**
   * Hold the next reply to `path`: the write still lands and the fixed
   * write-latency timer still runs, but `route.fulfill` waits for the
   * returned function to be called. Use this to assert an intermediate
   * "sending" UI state deterministically, instead of racing Playwright's
   * click-actionability delay against the fixed mock latency.
   */
  holdNextReply(path: string): () => void;

  // ── Timed playlist (F2/F26 contract) ─────────────────────────────────────
  /**
   * Advance the playlist's own virtual dwell clock by `ms`, without a real
   * wait. Only moves anything while the card reports the playlist as
   * playing — a no-op on a paused or unconfigured playlist, exactly like the
   * card's own dwell timer would be. Crossing one or more dwell boundaries
   * within a single call advances entryIndex (wrapping) that many times, the
   * same way the real firmware's timer would tick through them.
   */
  advancePlaylistClock(ms: number): void;
};

const ZONE_ID = 'zone-all';
const STAGED_ACTIVATION_ID = 'act-matrix-1';
/** LW_WIRING_PROBATION_MS in firmware/lightweaver-controller/src/LightweaverTypes.h. */
const WIRING_PROBATION_MS = 90000;

function hasProject(state: CardStateSpec) {
  return String(state.projectId || '').trim() !== '';
}

/**
 * Readiness is derived, never authored. cardReadiness.js only reaches
 * state:'connected' when all four of these are true booleans and runtimePhase
 * is 'ready'; a fixture that sets them by hand can describe a card that cannot
 * exist, which is how "ready card with no project" got into this suite.
 */
function outputReadyOf(state: CardStateSpec) {
  return state.pixels > 0;
}

function derivedReadiness(state: CardStateSpec) {
  const outputReady = outputReadyOf(state);
  // Explicit only where a real card genuinely varies independently of its
  // configuration; everything else stays derived so an impossible card cannot
  // be described.
  const commandReady = state.commandReady ?? true;
  return {
    runtimePhase: state.runtimePhase || 'ready',
    knownGoodProject: hasProject(state) && !state.provisionalSetup,
    commandReady,
    outputReady,
    projectOutputReady: outputReady,
    outputDriverReady: outputReady,
    playbackReady: commandReady && outputReady && state.patterns.length > 0,
    configValid: hasProject(state) ? outputReady : true,
    safeMode: false,
  };
}

type ZoneControlValues = {
  brightness: number; speed: number; hueShift: number;
  customHue: number; customSaturation: number; customBreathe: boolean;
  breatheLowerPct: number; breatheUpperPct: number; breatheCycleSeconds: number;
  customDrift: boolean; driftHueMin: number; driftHueMax: number;
};

/** The values every zone starts at, before any `/api/control` has touched it
 * — the same numbers this simulator always reported, now the DEFAULT rather
 * than the permanent answer. */
function defaultZoneControlValues(): ZoneControlValues {
  return {
    brightness: 0.65,
    speed: 1,
    hueShift: 0,
    customHue: 32,
    customSaturation: 230,
    customBreathe: false,
    breatheLowerPct: 85,
    breatheUpperPct: 100,
    breatheCycleSeconds: 9,
    customDrift: false,
    driftHueMin: 0,
    driftHueMax: 255,
  };
}

/** Every CUSTOMER_CONTROL_WIRE_FIELDS control that is genuinely per-zone
 * state in this model. `patternId` and `blackout` are deliberately excluded —
 * both already come from `state.currentId`, which a real `/api/control` write
 * mutates for real (see `applyControl`); only the fields below were still
 * hardcoded literals that `/api/zones` handed back unchanged. */
const ZONE_CONTROL_FIELDS = CUSTOMER_CONTROL_WIRE_FIELDS.filter(
  field => field.control !== 'patternId' && field.control !== 'blackout',
);

function zoneControlsFor(
  state: { zoneControls: Map<string, ZoneControlValues> },
  id: string,
): ZoneControlValues {
  let controls = state.zoneControls.get(id);
  if (!controls) {
    controls = defaultZoneControlValues();
    state.zoneControls.set(id, controls);
  }
  return controls;
}

function zonesFor(state: CardStateSpec & { zoneIds?: string[]; zoneControls: Map<string, ZoneControlValues> }) {
  if (!state.pixels) return [];
  // One entry per id the card currently answers under — normally just
  // 'zone-all' for the matrix's abstract fixtures, but a real project's
  // /api/config push can declare several (e.g. a default project's own
  // "outer circle" / "inner circle" board), and a save-then-verify install
  // has to read back every one of those ids, not a fixture default. Ranges
  // are computed fresh from the CURRENT pixel count on every call — never
  // snapshotted — so a wiring change that resizes the strip can't leave a
  // stale zone shape behind.
  const ids = state.zoneIds && state.zoneIds.length ? state.zoneIds : [ZONE_ID];
  return ids.map(id => ({
    id,
    label: 'All lights',
    patternId: state.currentId,
    ...zoneControlsFor(state, id),
    blackout: state.currentId === 'blackout',
    ranges: [{ start: 0, count: state.pixels }],
  }));
}

function statusBody(state: CardSimulator['state']) {
  const project = hasProject(state);
  const blank = !project;
  return {
    app: 'Lightweaver',
    provisioningContractVersion: 1,
    configSchemaVersion: 1,
    capabilitiesVersion: 2,
    cardId: state.cardId,
    firmwareVersion: state.firmwareVersion,
    buildId: state.buildId,
    buildNumber: state.buildNumber,
    bootId: state.bootId,
    uptimeMs: 60000,
    ...derivedReadiness(state),
    provisionalSetup: state.provisionalSetup,
    // A card holding nothing reports how it got there — cardReadiness.js only
    // classifies 'blank' when one of these says so.
    mode: blank ? 'factory-flash' : 'website-flash',
    source: blank ? 'defaults' : 'internal-flash',
    runtimeSource: blank ? 'defaults' : 'internal-flash',
    ok: true,
    errorCode: 0,
    resetReason: 3,
    projectId: state.projectId,
    projectRevision: state.projectRevision,
    projectFingerprint: state.projectFingerprint,
    projectHead: state.projectFingerprint || '',
    productionJobId: '',
    productionJobDigest: '',
    capabilities: {
      kaleidoscopeReflectionPoints: 1,
      firmwareUpdate: { version: 1, network: true, softwareGrant: true },
    },
    firmwareUpdate: {
      phase: 'idle', receivedBytes: 0, expectedBytes: 0, expectedBuildId: '',
      activeSlot: 'app0', pendingSlot: '', lastError: '', rollbackReason: '',
      rebootCorrelation: '', restoredFirmwareVersion: '', restoredBuildId: '',
      restoredBuildNumber: 0,
    },
    pixelCapacity: { schemaLimit: 65535, allocatedBoot: 512 },
    outputInitialization: outputReadyOf(state)
      ? { ok: true, code: 'ready', message: 'configured project outputs initialized' }
      : { ok: false, code: 'no-outputs', message: 'no configured project outputs' },
    wiringProbation: {
      active: state.wiringTestActive === true,
      remainingMs: state.wiringTestActive ? state.wiringProbationRemainingMs : 0,
    },
    limits: { pixels: 65535, outputs: 4, looks: 32, zones: 12, rangesPerZone: 6, configStorageBytes: 3968 },
    kaleidoscopeMappings: [],
    recipeCapabilities: {
      version: 1,
      firmwareVersion: state.firmwareVersion,
      buildId: state.buildId,
      schemaVersions: [1],
      supportedNodes: [
        'solid', 'palette', 'wave', 'fastled-noise', 'hash-sparkle', 'scale',
        'offset', 'repeat', 'mirror', 'radial-mask', 'linear-mask', 'threshold',
      ],
      supportedBlends: ['add', 'max', 'multiply', 'crossfade'],
      supportedModulators: ['lfo', 'noise-clock'],
      bakeOnlyNodes: ['particles', 'reaction-diffusion', 'graph', 'shader', 'audio'],
      maxLayers: 3,
      maxConfigBytes: 3968,
      maxOperationsPerFrame: 250000,
      maxEstimatedStateBytes: 2048,
      physicalParityVerified: false,
    },
    ...(project ? { piece: { id: state.projectId, name: state.projectName, hostname: 'lightweaver' } } : {}),
    led: {
      pixels: state.pixels,
      type: 'WS2812B',
      colorOrder: 'GRB',
      outputGammaEnabled: false,
      outputGammaValue: 2.2,
      // A scale factor, not a byte. The real card reports 1, and a simulator
      // reporting 255 would let a unit-confusion bug pass unseen.
      calibration: { red: 1, green: 1, blue: 1 },
      maxMilliamps: 2000,
      estimatedFullWhiteMilliamps: state.pixels * 60,
      limitedFullWhiteMilliamps: 2000,
    },
    wiringRevision: state.pixels ? 1 : 0,
    wiringDigest: state.pixels ? 'd'.repeat(64) : '',
    // The primary readback for "what is playing" — cardLiveControl.js reads
    // this, not /api/patterns, when confirming a blackout or a reset.
    currentPatternId: state.currentId,
    currentLookId: state.currentId,
    currentLookIndex: state.currentIndex,
    outputs: state.pixels > 0
      ? [{
        id: 'out1', pin: state.pin, pixels: state.pixels, gpio: state.pin, count: state.pixels,
        segments: [{ id: 'run-strip-1', count: state.pixels, direction: 'forward' }],
      }]
      : [],
    lwOutput: {
      contract: 1,
      sourceClass: 'local',
      requestedBrightnessByte: state.currentId === 'blackout' ? 0 : 166,
      brightnessByte: state.currentId === 'blackout' ? 0 : 166,
      brightnessScale: 1,
      powerLimited: false,
      gammaEnabled: false,
      gammaValue: 2.2,
      calibration: { red: 255, green: 255, blue: 255 },
      measuredFps: 60,
      dithering: false,
    },
    wifi: {
      transport: 'station', hostname: 'lightweaver', ip: '192.168.18.70',
      transition: 'none', phase: 'connected', transitionPending: false,
      apActive: false, stationIp: '192.168.18.70', handoffGeneration: 0,
      phaseStartedMs: 0, lastAttemptMs: 0, attemptCount: 1, lastError: '',
      networkBindingsPending: false, wledListenerReady: true,
      artnetListenerReady: true, lastBindingAttemptMs: 0, configured: true,
    },
    streaming: false,
    frameSource: 'internal',
    maxMilliamps: 2000,
    maxMilliampsSource: 'default',
    // Timed playlist (F2/F26 contract) — field-for-field with
    // normalizeCardReadiness's playlist block in src/lib/cardReadiness.js.
    // entryIndex/patternId report -1/'' when nothing is configured, never a
    // stale value from before the last /api/config clear it.
    playlist: {
      configured: state.playlistEntries.length > 0,
      playing: state.playlistPlaying === true,
      entryIndex: state.playlistEntries.length ? state.playlistEntryIndex : -1,
      entryCount: state.playlistEntries.length,
      patternId: state.playlistEntries.length && state.playlistEntryIndex >= 0
        ? state.playlistEntries[state.playlistEntryIndex].patternId
        : '',
      remainingSeconds: state.playlistEntries.length ? Math.max(0, Math.round(state.playlistRemainingSeconds)) : 0,
    },
  };
}

function patternsBody(state: CardSimulator['state']) {
  return {
    currentIndex: state.currentIndex,
    currentId: state.currentId,
    patterns: state.patterns.map((pattern: PatternEntry) => ({
      id: pattern.id,
      label: pattern.label,
      mode: 'pattern',
      runtimePatternId: pattern.id,
      controls: { customColor: true, breathe: true, drift: true },
      zones: [{ id: ZONE_ID, label: 'All lights', patternId: pattern.id }],
    })),
  };
}

/**
 * The wiring vocabulary Studio accepts is exactly this set — normalizeCardWiringStatus
 * throws 'invalid-response' on anything else, including the firmware's own
 * "factory". A simulator that answers loosely here fails the journey in a way
 * that looks like a Studio bug.
 */
function wiringStatusBody(state: CardSimulator['state']) {
  const staged = state.wiringTransactionOpen;
  // Field-for-field against runtimeWiringSafetyStatus() in
  // firmware/lightweaver-controller/src/main.cpp: state is computed from the
  // candidate's lifecycle (WIRING_CANDIDATE_STAGED → 'staged',
  // WIRING_CANDIDATE_BOOTING/AWAITING_CONFIRMATION → 'testing'), and
  // candidateState carries the finer label — 'awaiting-confirmation' is what
  // the card reports once it has rebooted with the candidate live and is
  // waiting for a human to look at the strip. Before this, /api/wiring/status
  // kept answering 'staged' forever after activate, because nothing here read
  // the testing flag activate had already set on the write side.
  const testing = state.wiringTestActive === true;
  return {
    app: 'Lightweaver',
    ok: true,
    state: testing ? 'testing' : staged ? 'staged' : 'known-good',
    candidateState: testing ? 'awaiting-confirmation' : staged ? 'staged' : 'none',
    activationId: (testing || staged) ? STAGED_ACTIVATION_ID : '',
    ledType: 'WS2812B',
    hasKnownGood: state.pixels > 0,
    hasCandidate: testing || staged,
    bootedCandidate: testing,
    discoveryActive: false,
    probationMs: WIRING_PROBATION_MS,
    remainingProbationMs: testing ? state.wiringProbationRemainingMs : 0,
    testing,
    nextStep: testing ? 'confirm-physical-lights' : staged ? 'activate' : 'none',
    outputsReady: state.pixels > 0,
    cardId: state.cardId,
    firmwareVersion: state.firmwareVersion,
    buildId: state.buildId,
    buildNumber: state.buildNumber,
    projectRevision: state.projectRevision,
    projectFingerprint: state.projectFingerprint,
    productionJobId: '',
    productionJobDigest: '',
    wiringRevision: state.pixels ? 1 : 0,
    wiringDigest: state.pixels ? 'd'.repeat(64) : '',
    currentWiringRevision: state.pixels ? 1 : 0,
    currentWiringDigest: state.pixels ? 'd'.repeat(64) : '',
    colorOrder: 'GRB',
    maxMilliamps: 2000,
    currentMaxMilliamps: 2000,
    estimatedFullWhiteMilliamps: state.pixels * 60,
    limitedFullWhiteMilliamps: 2000,
    currentOutputs: state.pixels > 0
      ? [{
        id: 'out1', pin: state.pin, pixels: state.pixels,
        segments: [{ id: 'run-strip-1', count: state.pixels, direction: 'forward' }],
      }]
      : [],
    candidateOutputs: (staged || testing)
      ? [{
        id: 'out1', pin: state.pin, pixels: state.pixels,
        segments: [{ id: 'run-strip-1', count: state.pixels, direction: 'forward' }],
      }]
      : [],
  };
}

/**
 * Echo back exactly the controls that were sent, under their acknowledgement
 * names. requireLivePreviewAcknowledgement refuses anything less, so a
 * simulator answering a bare {ok:true} would let a real regression pass.
 */
function controlAcknowledgement(state: CardSimulator['state'], body: Record<string, unknown>) {
  const ack: Record<string, unknown> = {
    ok: true,
    cardId: state.cardId,
    stateRevision: state.stateRevision,
    affectedOutputCount: state.pixels > 0 ? 1 : 0,
    affectedOutputScope: body.zone ? 'selected-zones' : 'all-active-outputs',
    affectedOutputs: state.pixels > 0 ? ['out1'] : [],
  };
  for (const field of CUSTOMER_CONTROL_WIRE_FIELDS) {
    if (body[field.wire] !== undefined) ack[field.acknowledgement] = body[field.wire];
  }
  if (body.patternId !== undefined) {
    ack.patternId = body.patternId;
    ack.confirmedLook = { patternId: body.patternId, zone: body.zone || '', syncZones: body.syncZones === true };
  }
  if (body.revision !== undefined) {
    ack.revision = body.revision;
    ack.confirmedRevision = body.revision;
  }
  return ack;
}

/**
 * How long the card takes to answer.
 *
 * A simulator that replies in zero milliseconds is not a fast card, it is an
 * impossible one — and it hides every ordering bug that only appears when a
 * reply lands after the code that expected it. A real ESP32 on a phone's Wi-Fi
 * answers a status read in tens of milliseconds and a control write in
 * hundreds; a busy one is slower still.
 */
export const CARD_LATENCY_MS = { read: 40, write: 120 };

export function createCardSimulator(
  spec: CardStateSpec,
  options: { cardId?: string; latencyMs?: { read: number; write: number } } = {},
): CardSimulator {
  const latency = options.latencyMs || CARD_LATENCY_MS;
  const state = {
    ...spec,
    patterns: spec.patterns.map(pattern => ({ ...pattern })),
    cardId: options.cardId || MATRIX_CARD_ID,
    bootId: 'boot-matrix-1',
    stateRevision: 1,
    // The id(s) /api/zones reports. Defaults to the fixed 'zone-all' every
    // existing fixture already expects; a /api/config apply that carries a
    // real project's own zone topology (e.g. a default project's separate
    // "outer circle" / "inner circle" zones) replaces this list to match, so
    // a save-then-verify flow reads back the zones the card actually holds
    // instead of a fixture default no pushed project ever declared.
    zoneIds: [ZONE_ID] as string[],
    // Per-zone brightness/speed/colour/breathe/drift, keyed by zone id — see
    // `zoneControlsFor`. Starts empty; a zone reads its defaults the first
    // time it is asked for, and `/api/control` mutates real entries here so
    // `/api/zones` stops reporting the same fixed numbers forever.
    zoneControls: new Map<string, ZoneControlValues>(),
    // Wiring the card is holding but has not adopted — the candidate slot.
    stagedPixels: undefined as number | undefined,
    stagedPin: undefined as number | undefined,
    // The FULL /api/config payload behind a staged wiring change (F4, for
    // journey-j01.spec.ts [J01]) — firmware's stageRuntimeConfigJson stages the
    // entire submitted runtime config, not just the wiring fields
    // (LightweaverStorage.cpp), and the candidate boot that follows activation
    // runs off that whole config, not a wiring-only patch. Before this the
    // simulator only staged stagedPixels/stagedPin and silently dropped the
    // rest of the payload (projectId, patterns, revision, fingerprint…), so a
    // wiring-changing install could never be proven to leave the card holding
    // the new project after confirm — every field but the wiring itself just
    // vanished. undefined for the bare-wiring-only /api/wiring/candidate path
    // (J07), which genuinely has no project payload to apply.
    stagedConfigPayload: undefined as Record<string, unknown> | undefined,
    // Set on activate/beginWiringTest, cleared on confirm/rollback/expiry.
    wiringTestActive: false,
    wiringProbationRemainingMs: 0,
    // What the card was running before this test began — the rollback target.
    preTestPixels: undefined as number | undefined,
    preTestPin: undefined as number | undefined,
    // The project identity this test's activation is about to overwrite —
    // captured only when stagedConfigPayload applies, so a rollback (owner
    // "No"/"Cancel change", or the probation clock elapsing) restores project
    // identity exactly as it restores pixels/pin, instead of leaving the new
    // project's id/patterns behind while pretending the wiring alone reverted.
    preTestProjectSnapshot: undefined as {
      projectId: string; projectName: string; projectRevision: number;
      projectFingerprint: string; provisionalSetup: boolean;
      patterns: PatternEntry[]; zoneIds: string[];
    } | undefined,
    // The one GPIO the factory beacon is currently holding lit, or null. Only
    // meaningful before a real project exists (see /api/beacon/port above).
    beaconPinned: null as number | null,
    // ── Timed playlist (F2/F26 contract) ────────────────────────────────
    // What the card was TOLD to hold — set only by a /api/config `playlist`
    // block (applyConfigProjectFields). Empty entries means "not configured",
    // field-for-field with what a card running pre-F2 firmware reports by
    // omitting the block entirely.
    playlistEntries: [] as { patternId: string; dwellSeconds: number }[],
    playlistFadeMs: 1500,
    // Whether an install should start the card playing on its own — the
    // config's own `enabled` flag, distinct from `playlistPlaying` below
    // (the LIVE transport state, which /api/control's play/pause/next/
    // previous verbs move and which — per the contract — survives a
    // power-cycle on its own, unlike currentId/currentIndex).
    playlistEnabled: false,
    playlistPlaying: false,
    playlistEntryIndex: -1,
    playlistRemainingSeconds: 0,
  };
  const requests: CardRequest[] = [];
  const unhandled: string[] = [];
  // Raw pixel arrays received over the frame-stream WebSocket
  // (ws://<host>:81/ws), one entry per frame — see cardFrameStream.js. Strip
  // discovery's probe/decade/end-marker steps push frames this way, not
  // through /api/control, so a simulator with HTTP routes only would leave
  // that whole path unmodelled and every discovery frame silently lost.
  const frames: string[][] = [];
  let dropped = 0;
  let offline = false;
  const refusals = new Map<string, { status: number; body: unknown; times: number }>();
  // Requests whose mutation is applied for real, but whose HTTP reply is
  // withheld — a lost reply after a successful write, not a refusal.
  const dropRepliesAfterApply = new Map<string, number>();
  // A one-shot gate on the next reply to a path: the mutation still lands
  // and the fixed write-latency timer still runs, but `route.fulfill` waits
  // for the test to call the release function `holdNextReply` returns. This
  // exists so a test asserting an intermediate "sending" UI state does not
  // have to race Playwright's own click-actionability delay against
  // CARD_LATENCY_MS.write — under load the actionability wait can exceed the
  // mock latency, and the pending state has already resolved by the time the
  // test looks for it. Holding the reply makes the pending state observable
  // on every run, fast host or busy one, without touching the real clock.
  const heldReplyGates = new Map<string, Promise<void>>();

  /** `body.zone` names one zone; an absent/empty zone means every zone the
   * card currently answers under — the same rule `controlAcknowledgement`
   * already encodes for `affectedOutputScope` (`body.zone ? 'selected-zones'
   * : 'all-active-outputs'`). `syncZones` is a different flag (whether
   * several zones stay in step with each other) and does not gate this. */
  function targetZoneIds(body: Record<string, unknown>): string[] {
    const explicit = typeof body.zone === 'string' ? body.zone.trim() : '';
    if (explicit) return [explicit];
    return state.zoneIds.length ? state.zoneIds : [ZONE_ID];
  }

  function applyZoneControlFields(body: Record<string, unknown>) {
    const present = ZONE_CONTROL_FIELDS.filter(field => body[field.wire] !== undefined);
    if (!present.length) return;
    for (const id of targetZoneIds(body)) {
      const controls = zoneControlsFor(state, id);
      for (const field of present) {
        const raw = body[field.wire];
        (controls as Record<string, number | boolean>)[field.control] =
          typeof raw === 'boolean' ? raw : Number(raw);
      }
    }
  }

  /** Set currentId/currentIndex to a playlist entry's pattern, the same way a
   * direct /api/control patternId write does — an unknown id (a look the
   * card does not hold) is ignored, not invented. */
  function applyPlaylistPatternById(patternId: string) {
    const index = state.patterns.findIndex(pattern => pattern.id === patternId);
    if (index < 0) return;
    state.currentIndex = index;
    state.currentId = patternId;
  }

  /** POST { playlist: 'play' | 'pause' | 'next' | 'previous' } — the F2/F26
   * transport contract. A verb against an unconfigured playlist (no entries)
   * is a no-op, the same as a real card with nothing to play. */
  function applyPlaylistVerb(verb: string) {
    const entries = state.playlistEntries;
    if (!entries.length) return;
    if (verb === 'play') {
      state.playlistPlaying = true;
      if (state.playlistEntryIndex < 0) state.playlistEntryIndex = 0;
      state.playlistRemainingSeconds = entries[state.playlistEntryIndex].dwellSeconds;
      applyPlaylistPatternById(entries[state.playlistEntryIndex].patternId);
      return;
    }
    if (verb === 'pause') {
      state.playlistPlaying = false;
      return;
    }
    if (verb === 'next' || verb === 'previous') {
      const direction = verb === 'next' ? 1 : -1;
      const from = state.playlistEntryIndex < 0 ? 0 : state.playlistEntryIndex;
      const nextIndex = (from + direction + entries.length) % entries.length;
      state.playlistEntryIndex = nextIndex;
      state.playlistRemainingSeconds = entries[nextIndex].dwellSeconds;
      state.playlistPlaying = true;
      applyPlaylistPatternById(entries[nextIndex].patternId);
    }
  }

  function applyControl(body: Record<string, unknown>) {
    state.stateRevision += 1;
    applyZoneControlFields(body);
    const playlistVerb = typeof body.playlist === 'string' ? body.playlist : '';
    if (playlistVerb) {
      applyPlaylistVerb(playlistVerb);
      return;
    }
    if (body.blackout === true) {
      state.currentIndex = -1;
      state.currentId = 'blackout';
      // Any manual look change — blackout included — pauses the playlist.
      state.playlistPlaying = false;
      return;
    }
    const requested = String(body.patternId || '').trim();
    if (!requested) return;
    if (requested === 'blackout') {
      state.currentIndex = -1;
      state.currentId = 'blackout';
      state.playlistPlaying = false;
      return;
    }
    const index = state.patterns.findIndex(pattern => pattern.id === requested);
    // A card asked for a pattern it does not hold keeps playing what it had.
    // It does not invent a list entry.
    if (index < 0) return;
    state.currentIndex = index;
    state.currentId = requested;
    // Any manual look change pauses the playlist on the card (F2/F26
    // contract) — a direct pattern write is not a playlist verb.
    state.playlistPlaying = false;
  }

  /**
   * Apply a full /api/config payload's project fields to the live state —
   * everything a non-wiring-changing save has always applied immediately
   * (pixels/pin/projectId/projectName/projectRevision/projectFingerprint/
   * provisionalSetup/patterns/zoneIds). Shared by that direct-apply path and
   * by `/api/wiring/activate`'s candidate boot below, which — field-for-field
   * against LightweaverStorage.cpp's stageRuntimeConfigJson /
   * activateStagedRuntimeConfig — runs off the ENTIRE staged config once the
   * card reboots into it, not a wiring-only patch of the project it already
   * had.
   */
  function applyConfigProjectFields(payload: Record<string, unknown>) {
    const led = (payload.led || {}) as Record<string, unknown>;
    const nextPixels = Number(led.pixels ?? state.pixels);
    const outputs = (led.outputs || []) as { pin?: number }[];
    const nextPin = Number(outputs[0]?.pin ?? state.pin);
    const piece = (payload.piece || {}) as Record<string, unknown>;
    state.pixels = nextPixels;
    state.pin = nextPin;
    state.projectId = String(piece.id || payload.projectId || state.projectId);
    state.projectName = String(piece.name || state.projectName);
    state.projectRevision = Number(payload.projectRevision ?? state.projectRevision);
    state.projectFingerprint = String(payload.projectFingerprint ?? state.projectFingerprint);
    state.provisionalSetup = payload.provisional === true;
    const looks = (payload.looks || payload.patterns || []) as { id?: string; label?: string }[];
    if (looks.length) {
      state.patterns = looks.map(look => ({
        id: String(look.id || ''),
        label: String(look.label || look.id || ''),
      })).filter(entry => entry.id);
    }
    // A save that isn't a wiring change still carries the pushed project's
    // own zone topology — possibly more than one zone (a default project's
    // separate "outer circle" / "inner circle" board, for instance). Adopt
    // every id so a save-then-verify flow (syncRuntimePackageToCard's
    // waitForCardZones) reads back the exact zones the card genuinely holds,
    // not the fixture default.
    const pushedZones = (payload.zones || []) as { id?: string }[];
    const pushedZoneIds = pushedZones.map(zone => String(zone?.id || '').trim()).filter(Boolean);
    if (pushedZoneIds.length) state.zoneIds = pushedZoneIds;

    // Timed playlist (F2/F26 contract): absent or disabled means the config
    // carried no `playlist` key at all — field-for-field with
    // buildCardPlaylistConfig, which omits the key rather than sending
    // `enabled: false`. A save that stops sending the block genuinely clears
    // whatever the card was holding, the same way it clears any other field
    // this function applies from a fresh payload.
    const playlistPayload = (payload.playlist || {}) as {
      enabled?: boolean; fadeMs?: number;
      entries?: { patternId?: string; dwellSeconds?: number }[];
    };
    const nextEntries = Array.isArray(playlistPayload.entries)
      ? playlistPayload.entries
          .map(entry => ({
            patternId: String(entry?.patternId || '').trim(),
            dwellSeconds: Math.max(1, Math.min(3600, Math.round(Number(entry?.dwellSeconds) || 30))),
          }))
          .filter(entry => entry.patternId)
      : [];
    state.playlistEntries = nextEntries;
    state.playlistFadeMs = Number.isFinite(Number(playlistPayload.fadeMs)) ? Number(playlistPayload.fadeMs) : 1500;
    state.playlistEnabled = playlistPayload.enabled === true && nextEntries.length > 0;
    // A fresh config write is a new thing to hold, not an instruction to
    // play it — `enabled` alone decides whether THIS install starts playing.
    state.playlistEntryIndex = nextEntries.length ? 0 : -1;
    state.playlistPlaying = state.playlistEnabled;
    state.playlistRemainingSeconds = nextEntries.length ? nextEntries[0].dwellSeconds : 0;
    if (state.playlistPlaying && nextEntries.length) {
      applyPlaylistPatternById(nextEntries[0].patternId);
    }
  }

  /** Restore the project identity a wiring-change activation is about to
   * overwrite — the counterpart to `applyConfigProjectFields`, used on
   * rollback (owner-driven or probation expiry) so a project's id/patterns/
   * revision revert exactly as pixels/pin already did. No-op when the test
   * being rolled back never carried a staged project (e.g. the bare
   * /api/wiring/candidate path [J07], which has no project payload at all). */
  function restorePreTestProjectSnapshot() {
    const snapshot = state.preTestProjectSnapshot;
    if (!snapshot) return;
    state.projectId = snapshot.projectId;
    state.projectName = snapshot.projectName;
    state.projectRevision = snapshot.projectRevision;
    state.projectFingerprint = snapshot.projectFingerprint;
    state.provisionalSetup = snapshot.provisionalSetup;
    state.patterns = snapshot.patterns;
    state.zoneIds = snapshot.zoneIds;
  }

  /**
   * The one place a request is answered, whichever transport carried it.
   * The bridge relays exactly these paths, so routing both through here is
   * what stops the two transports drifting into two different cards.
   */
  function respond(method: string, path: string, body: unknown): { body: unknown; status: number } {
    const ok = (value: unknown) => ({ body: value, status: 200 });
    const payload = (body || {}) as Record<string, unknown>;
    const refusal = refusals.get(path);
    if (refusal && refusal.times > 0) {
      refusal.times -= 1;
      if (refusal.times === 0) refusals.delete(path);
      return { body: refusal.body, status: refusal.status };
    }
    switch (path) {
      case '/api/status':
        return ok(statusBody(state));
      case '/api/firmware-info':
        return ok({
          ...statusBody(state),
          bridgeVersion: 6,
          build: state.buildId,
          pixels: state.pixels,
          lookCount: state.patterns.length,
          freeHeap: 180000,
          rssi: -52,
        });
      case '/api/patterns':
        return ok(patternsBody(state));
      case '/api/zones':
        return ok({ syncZones: true, kaleidoscopeMappings: [], zones: zonesFor(state) });
      case '/api/control':
        if (state.commandReady === false) {
          return {
            body: {
              ok: false, error: 'card is not ready for runtime control',
              cardId: state.cardId, bootId: state.bootId,
              runtimePhase: state.runtimePhase || 'starting', commandReady: false,
            },
            status: 423,
          };
        }
        applyControl(payload);
        return ok(controlAcknowledgement(state, payload));
      case '/api/identify':
        return ok({ ok: true, cardId: state.cardId });
      case '/api/recover-lights': {
        // NOT routed through applyControl. Real firmware's runtimeRecoverLights
        // (main.cpp) is not constrained by /api/control's known-pattern-list
        // rule — it unconditionally applies whatever patternId it is given
        // (rendering a fallback warm frame when the id names nothing it
        // recognises) and always clears blackout on every zone. Every recovery
        // call in Studio sends patternId 'warm-white', which is not one of the
        // matrix fixture's three named patterns (aurora/plasma/fire), so
        // reusing applyControl's /api/control-shaped restriction here left a
        // blacked-out simulated card blacked out forever after every recovery
        // (F16: the real card recovered fine; only this fixture was wrong).
        state.stateRevision += 1;
        applyZoneControlFields(payload);
        const requestedId = String(payload.patternId || '').trim() || 'warm-white';
        state.currentIndex = state.patterns.findIndex(pattern => pattern.id === requestedId);
        state.currentId = requestedId;
        return ok({
          ok: true, accepted: true, recovered: true, cardId: state.cardId,
          patternId: state.currentId,
          diagnostics: {
            rendered: true, framePrepared: true, frameSubmitted: true,
            pixels: state.pixels, nonBlackPixels: Math.max(1, state.pixels),
            brightnessByte: 166, brightnessLimit: 255, blackout: false, streaming: false,
          },
        });
      }
      case '/api/clear-project':
        if (payload.confirm !== 'CLEAR') {
          return { body: { ok: false, error: 'missing confirmation' }, status: 400 };
        }
        state.projectId = '';
        state.projectName = '';
        state.projectFingerprint = '';
        state.projectRevision = 0;
        state.provisionalSetup = false;
        state.pixels = 0;
        state.patterns = [];
        state.currentIndex = -1;
        state.currentId = 'blackout';
        state.bootId = `${state.bootId}-cleared`;
        return {
          body: { ok: true, accepted: true, wifiPreserved: true, requiresReboot: true, message: 'cleared' },
          status: 202,
        };
      case '/api/wiring/status':
        return ok(wiringStatusBody(state));
      case '/api/wiring/candidate': {
        // Added for journey-edits.spec.ts [J07]: stageCardWiringCandidate() in
        // src/lib/cardWiringSafety.js posts here directly (a bare stage, no
        // full project save), and nothing in this suite modelled it before —
        // every other wiring-change fixture went through the `/api/config`
        // "wiringChanged" branch below instead. Mirrors that branch's staging
        // behaviour exactly so the real stage -> activate -> confirm cycle can
        // be driven end to end against this simulator.
        const candidate = (payload.candidate || {}) as Record<string, unknown>;
        const led = (candidate.led || {}) as Record<string, unknown>;
        const nextPixels = Number(led.pixels ?? state.pixels);
        const outputs = (led.outputs || []) as { pin?: number }[];
        const nextPin = Number(outputs[0]?.pin ?? state.pin);
        state.wiringTransactionOpen = true;
        state.stagedPixels = nextPixels;
        state.stagedPin = nextPin;
        return ok(wiringStatusBody(state));
      }
      case '/api/wiring/activate': {
        // The card boots the candidate and enters probation with a new bootId,
        // exactly as the firmware does — which is what makes Studio have to
        // survive a reboot mid-install. Save what was running before, so a
        // rollback (owner-driven or on probation expiry) has something to
        // return to.
        state.preTestPixels = state.pixels;
        state.preTestPin = state.pin;
        if (Number.isFinite(state.stagedPixels)) state.pixels = Number(state.stagedPixels);
        if (Number.isFinite(state.stagedPin)) state.pin = Number(state.stagedPin);
        // A wiring-changing /api/config staged the ENTIRE project, not just
        // pixels/pin (see applyConfigProjectFields above) — the candidate
        // boot this activation triggers runs off that whole config, exactly
        // as firmware's activateStagedRuntimeConfig does. Snapshot what the
        // card was holding first so a rollback can put it back complete, not
        // just its wiring.
        if (state.stagedConfigPayload) {
          state.preTestProjectSnapshot = {
            projectId: state.projectId,
            projectName: state.projectName,
            projectRevision: state.projectRevision,
            projectFingerprint: state.projectFingerprint,
            provisionalSetup: state.provisionalSetup,
            patterns: state.patterns.map(pattern => ({ ...pattern })),
            zoneIds: [...state.zoneIds],
          };
          applyConfigProjectFields(state.stagedConfigPayload);
          state.stagedConfigPayload = undefined;
        }
        state.wiringTransactionOpen = false;
        state.wiringTestActive = true;
        state.wiringProbationRemainingMs = WIRING_PROBATION_MS;
        state.bootId = `${state.bootId}-act`;
        return ok({
          ok: true, state: 'testing', activationId: STAGED_ACTIVATION_ID,
          rebooting: true, remainingProbationMs: WIRING_PROBATION_MS,
          nextStep: 'confirm-physical-lights',
          currentOutputs: wiringStatusBody(state).currentOutputs,
        });
      }
      case '/api/wiring/confirm':
      case '/api/wiring/rollback': {
        const rollback = path.endsWith('rollback');
        // A confirm promotes the candidate that is already running (activate
        // applied it); a rollback returns to what was running before the
        // test, exactly as the firmware's own rollback reboot does.
        if (rollback) {
          if (state.preTestPixels !== undefined) state.pixels = state.preTestPixels;
          if (state.preTestPin !== undefined) state.pin = state.preTestPin;
          restorePreTestProjectSnapshot();
        }
        state.wiringTransactionOpen = false;
        state.wiringTestActive = false;
        state.wiringProbationRemainingMs = 0;
        state.stagedPixels = undefined;
        state.stagedPin = undefined;
        state.preTestPixels = undefined;
        state.preTestPin = undefined;
        state.preTestProjectSnapshot = undefined;
        if (rollback) state.bootId = `${state.bootId}-rb`;
        return ok({
          ok: true, state: rollback ? 'rolled-back' : 'known-good',
          activationId: STAGED_ACTIVATION_ID, rebooting: rollback,
          remainingProbationMs: 0, nextStep: rollback ? 'find-led-wire' : 'none',
          currentOutputs: wiringStatusBody(state).currentOutputs,
        });
      }
      case '/api/reboot':
        state.bootId = `${state.bootId}-r`;
        return ok({ ok: true, message: 'rebooting' });
      case '/api/config': {
        // The firmware's actual rule (LightweaverStorage.cpp
        // runtimeConfigJsonChangesWiring, F14): a REWIRE — output identity/
        // pin, LED type, current ceiling, segment count/id/reversed — is
        // staged, not applied, and waits for a human to confirm the lights
        // still look right through the candidate dance. A changed PIXEL
        // COUNT on the SAME outputs is the length the owner typed: apply it
        // and reboot AT ONCE, no candidate dance. Firmware's own comment:
        // "Pixel count on the same outputs is the length the owner typed —
        // save and reboot, do not send them through the LED-check candidate
        // dance." This simulator only tracks output pin identity as the
        // wiring fact (matching hardwareFacts() in src/lib/cardDeployment.js,
        // which independently agrees pixel count alone is not a wiring
        // change), so only a pin change stages here — a pixel-only change
        // falls to the apply-and-reboot branch below.
        const led = (payload.led || {}) as Record<string, unknown>;
        const nextPixels = Number(led.pixels ?? state.pixels);
        const outputs = (led.outputs || []) as { pin?: number }[];
        const nextPin = Number(outputs[0]?.pin ?? state.pin);
        const wiringChanged = state.pixels > 0 && nextPin !== state.pin;
        const pixelCountChanged = state.pixels > 0 && nextPixels !== state.pixels;

        if (wiringChanged) {
          state.wiringTransactionOpen = true;
          state.stagedPixels = nextPixels;
          state.stagedPin = nextPin;
          // Stage the WHOLE payload, not just the wiring fields — see
          // applyConfigProjectFields's doc comment. Applied (and the pre-test
          // project snapshotted) when /api/wiring/activate boots the
          // candidate, exactly like a real card's confirm-pending reboot.
          state.stagedConfigPayload = payload;
          return {
            body: {
              ok: true, state: 'staged', activationId: STAGED_ACTIVATION_ID,
              message: 'wiring change staged', requiresReboot: false,
              requiresConfirmation: true,
            },
            status: 200,
          };
        }

        applyConfigProjectFields(payload);

        if (pixelCountChanged) {
          // The write above already landed for real — state was just
          // mutated. What a real card loses next is the reply itself, mid-
          // restart: it saves and restarts at once (F14). Model the whole
          // thing: drop THIS one reply (the write already landed; a naive
          // "no reply, so retry" would resend a real second command, which
          // is exactly the duplicate write the journey contract forbids),
          // and take the card off the air for a beat under a new boot id —
          // the same shape `reboot()` produces, just delayed so a caller
          // polling status mid-window genuinely finds the card gone before
          // it answers again.
          state.bootId = `${state.bootId}-r`;
          state.stateRevision += 1;
          offline = true;
          setTimeout(() => { offline = false; }, 1500);
          dropRepliesAfterApply.set('/api/config', (dropRepliesAfterApply.get('/api/config') || 0) + 1);
        }

        return ok({ ok: true, message: 'applied', requiresReboot: pixelCountChanged });
      }
      case '/api/beacon/port': {
        // Field-for-field against LightweaverWeb.cpp's factory beacon probe
        // (src/lib/beaconProbe.js): GET lists the ports this card can light
        // right now (only while it is not yet holding a real project — the
        // beacon steps aside for the ordinary frame path the moment a project
        // exists), POST {gpio} pins one, POST {release:true} hands it back.
        // A simulator that answered the same body for every method (the
        // original stub here) could not model strip discovery's port-probe
        // step at all — every pin looked lit and none looked released.
        if (method === 'GET') {
          return ok({
            ok: true,
            available: !hasProject(state) || state.provisionalSetup === true,
            ports: BEACON_PORTS,
            pixelsPerPort: 8,
          });
        }
        if (payload.release === true) {
          state.beaconPinned = null;
          return ok({ ok: true, pinned: false });
        }
        const gpio = Number(payload.gpio);
        if (!BEACON_PORTS.includes(gpio)) {
          return { body: { ok: false, error: 'this card cannot light that port right now' }, status: 409 };
        }
        state.beaconPinned = gpio;
        return ok({ ok: true, pinned: true, gpio, litPixels: 8, holdMs: 20000 });
      }
      default:
        // Recorded, not silently swallowed. A path that matters to the journey
        // and is missing here fails the matrix loudly rather than 404-ing and
        // letting Studio degrade into a workaround.
        if (!unhandled.includes(path)) unhandled.push(path);
        return { body: { ok: false, error: 'not-modelled-by-simulator', path }, status: 404 };
    }
  }

  /** Exactly the relay table in the card's own page (LightweaverWeb.cpp). */
  const BRIDGE_PATHS: Record<string, { method: string; path: string }> = {
    status: { method: 'GET', path: '/api/status' },
    ping: { method: 'GET', path: '/api/status' },
    zones: { method: 'GET', path: '/api/zones' },
    patterns: { method: 'GET', path: '/api/patterns' },
    'firmware-info': { method: 'GET', path: '/api/firmware-info' },
    control: { method: 'POST', path: '/api/control' },
    'recover-lights': { method: 'POST', path: '/api/recover-lights' },
    'clear-project': { method: 'POST', path: '/api/clear-project' },
    'wiring-status': { method: 'GET', path: '/api/wiring/status' },
    'wiring-candidate': { method: 'POST', path: '/api/wiring/candidate' },
    'wiring-activate': { method: 'POST', path: '/api/wiring/activate' },
    'wiring-confirm': { method: 'POST', path: '/api/wiring/confirm' },
    'wiring-rollback': { method: 'POST', path: '/api/wiring/rollback' },
    'beacon-ports': { method: 'GET', path: '/api/beacon/port' },
    reboot: { method: 'POST', path: '/api/reboot' },
    config: { method: 'POST', path: '/api/config' },
  };

  async function handle(route: Route) {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (offline) return route.abort('connectionrefused');
    if (dropped < state.dropFirstRequests) {
      dropped += 1;
      return route.abort('connectionrefused');
    }

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Private-Network': 'true',
        },
      });
    }

    let body: unknown = null;
    if (method !== 'GET') {
      try { body = JSON.parse(request.postData() || 'null'); } catch { body = request.postData(); }
    }
    requests.push({ method, path, body, at: Date.now() });

    await new Promise(resolve => setTimeout(resolve, method === 'GET' ? latency.read : latency.write));

    const answer = respond(method, path, body);

    // The write already landed above — respond() mutated state — but the
    // reply the owner would use to know that is withheld, modelling exactly
    // the case that makes a naive "no reply, so retry" turn one real command
    // into two.
    const dropCount = dropRepliesAfterApply.get(path);
    if (dropCount && dropCount > 0) {
      const remaining = dropCount - 1;
      if (remaining > 0) dropRepliesAfterApply.set(path, remaining);
      else dropRepliesAfterApply.delete(path);
      return route.abort('connectionrefused');
    }

    // The write and its fixed latency timer already ran above — a test
    // holding this path is waiting on the UI's pending state, not on the
    // card. Hold the reply itself, one-shot, until released.
    const heldGate = heldReplyGates.get(path);
    if (heldGate) {
      heldReplyGates.delete(path);
      await heldGate;
    }

    return route.fulfill({
      status: answer.status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(answer.body),
    });
  }

  return {
    state,
    requests,
    unhandled,
    frames,
    playingId: () => state.currentId,
    refuse(path, refusal) {
      refusals.set(path, {
        status: refusal.status,
        // Default to the firmware's own shape for a not-ready refusal, which is
        // by far the most common one an owner meets: the card is still booting.
        body: refusal.body ?? {
          ok: false,
          error: 'runtime not ready',
          cardId: state.cardId,
          bootId: state.bootId,
          runtimePhase: 'starting',
          commandReady: false,
        },
        times: refusal.times ?? 1,
      });
    },
    reboot() {
      state.bootId = `boot-matrix-${Date.now()}`;
      state.stateRevision = 1;
      state.currentIndex = -1;
      state.currentId = 'blackout';
    },
    goOffline() { offline = true; },
    goOnline() { offline = false; },
    beginWiringTest(options = {}) {
      state.preTestPixels = state.pixels;
      state.preTestPin = state.pin;
      if (Number.isFinite(options.pixels)) state.pixels = Number(options.pixels);
      if (Number.isFinite(options.pin)) state.pin = Number(options.pin);
      state.wiringTransactionOpen = false;
      state.wiringTestActive = true;
      state.wiringProbationRemainingMs = WIRING_PROBATION_MS;
      state.bootId = `${state.bootId}-act`;
    },
    expireWiringProbation() {
      if (!state.wiringTestActive) return;
      if (state.preTestPixels !== undefined) state.pixels = state.preTestPixels;
      if (state.preTestPin !== undefined) state.pin = state.preTestPin;
      state.wiringTransactionOpen = false;
      state.wiringTestActive = false;
      state.wiringProbationRemainingMs = 0;
      state.stagedPixels = undefined;
      state.stagedPin = undefined;
      state.preTestPixels = undefined;
      state.preTestPin = undefined;
      state.bootId = `${state.bootId}-exp`;
    },
    respondThenDrop(path, options = {}) {
      const times = options.times ?? 1;
      dropRepliesAfterApply.set(path, (dropRepliesAfterApply.get(path) || 0) + times);
    },
    holdNextReply(path) {
      let release: () => void = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      heldReplyGates.set(path, gate);
      return () => release();
    },
    async install(page: Page) {
      for (const host of CARD_HOSTS) {
        await page.route(`http://${host}/**`, handle);
        await page.route(`https://${host}/**`, handle);
        // The frame streamer's direct transport (cardFrameStream.js) opens
        // ws://<host>:81/ws itself — a page.route on the HTTP origin above
        // never sees it. Without this the strip-discovery probe/decade/
        // end-marker steps run against a stream that can never open, which
        // reads to Studio as "the card is not reaching us" even though every
        // HTTP fact about the card is fine.
        await page.routeWebSocket(`ws://${host}:81/ws`, socket => {
          socket.onMessage(message => {
            try {
              const payload = JSON.parse(String(message));
              const pixels = payload?.seg?.[0]?.i;
              if (Array.isArray(pixels)) frames.push(pixels);
            } catch { /* not a frame chunk this simulator understands — ignored, not fatal */ }
          });
        });
      }
    },
    // The bridge relay adds a postMessage hop each way on top of the card's own
    // reply time. Callers await this, so the delay is honoured there too.
    handleBridge(type: string, payload: unknown) {
      if (type === 'release-bridge') return { ok: true, response: { released: true } };
      if (type === 'frame') return { ok: true, response: { ok: true, relayed: true, wsOpen: true } };
      const route = BRIDGE_PATHS[type];
      if (!route) return { ok: false, reason: 'invalid-payload', error: 'unknown bridge request' };
      requests.push({ method: route.method, path: route.path, body: payload, at: Date.now() });
      const answer = respond(route.method, route.path, payload);
      if (answer.status >= 400) return { ok: false, reason: 'http', error: `HTTP ${answer.status}` };
      return { ok: true, response: answer.body };
    },
    advancePlaylistClock(ms: number) {
      if (!state.playlistPlaying || !state.playlistEntries.length) return;
      let remainingMs = Math.max(0, ms);
      let moved = false;
      while (remainingMs > 0) {
        const remainingCurrentMs = state.playlistRemainingSeconds * 1000;
        if (remainingMs < remainingCurrentMs) {
          state.playlistRemainingSeconds -= remainingMs / 1000;
          remainingMs = 0;
        } else {
          remainingMs -= remainingCurrentMs;
          const nextIndex = (state.playlistEntryIndex + 1) % state.playlistEntries.length;
          state.playlistEntryIndex = nextIndex;
          const nextEntry = state.playlistEntries[nextIndex];
          state.playlistRemainingSeconds = nextEntry.dwellSeconds;
          applyPlaylistPatternById(nextEntry.patternId);
          moved = true;
        }
      }
      if (moved) state.stateRevision += 1;
    },
    async waitForPlaying(id: string, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (state.currentId === id) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const controls = requests.filter(entry => entry.path === '/api/control').map(entry => entry.body);
      throw new Error(
        `card never started playing "${id}" within ${timeoutMs}ms — it is playing "${state.currentId}". `
        + `Control posts seen: ${JSON.stringify(controls)}`,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// F22 fixture — a browser holding the SAME project id the card reports, but
// with an unsaved wiring edit since install, so the structural fingerprint
// differs. Copied verbatim from tests/journey-edit-intent.spec.ts's F18
// fixture (`readyInstallProject` + `seedWiringDivergedProject`, both local to
// that spec file) per that file's own header convention — spec files in this
// suite copy each other's fixture recipes instead of importing them — and
// exported here instead so journey-continuity.spec.ts's F22 blackout test
// does not have to duplicate the recipe a second time. `seedWiringDivergedProject`
// gained one parameter (`stateId`, default 'installed-match') so a caller can
// diverge against any base card state — F22 needs the 'blackout' fixture,
// which shares 'installed-match''s project id and pixel count and differs
// only in currentIndex/currentId.
// ---------------------------------------------------------------------------
const HARNESS_CONNECT_BUDGET_MS = 15000;
const HARNESS_INSTALL_ROUTE = '/#screen=card&section=setup&task=install-project';

/**
 * Boots Studio's own default project directly on the install screen, marks it
 * verified/locked/color-confirmed, and reloads so the mutated copy —
 * `portRoles` properly derived from the now-verified wiring — is what the app
 * actually runs on.
 */
export async function readyInstallProject(page: Page, edit?: (project: Record<string, any>) => void) {
  await page.goto(HARNESS_INSTALL_ROUTE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('lw_autosave_v3'))), {
    timeout: HARNESS_CONNECT_BUDGET_MS,
  }).toBe(true);
  await page.waitForTimeout(600);
  const project = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  project.layout.wiring.verified = true;
  project.layout.wiring.locked = true;
  project.layout.wiring.runs.forEach((run: Record<string, any>) => { run.verified = true; });
  const led = project.devices.standaloneController.led;
  led.colorOrder = led.colorOrder || 'GRB';
  led.colorOrderConfirmed = true;
  led.confirmedColorOrder = led.colorOrder;
  edit?.(project);
  await page.addInitScript(value => localStorage.setItem('lw_autosave_v3', value), JSON.stringify(project));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('commissioning-step')).toBeVisible({ timeout: HARNESS_CONNECT_BUDGET_MS });
  await expect(page.getByText('Ready to install on the card.')).toBeVisible({ timeout: HARNESS_CONNECT_BUDGET_MS });
  await expect(page.getByTestId('layout-send-to-card')).toBeEnabled({ timeout: HARNESS_CONNECT_BUDGET_MS });
  return project;
}

/**
 * Studio's own default project, relabelled to the given card state's project
 * id, one output marked `role: 'strip'` so `adoptWiringFromCard` treats the
 * piece as already described, and the second strip's pixel count rebalanced
 * so the TOTAL matches the card's — then the card-identity keys and the
 * ticket's exact lifecycle seed (`dirty: true, installation: null`, a wiring
 * edit that invalidated the installation entirely) layered on top.
 */
export async function seedWiringDivergedProject(page: Page, stateId = 'installed-match') {
  const spec = cardState(stateId);
  await readyInstallProject(page, project => {
    project.id = spec.projectId;
    project.name = 'Test Strip';
    const strips = project.layout.strips;
    const currentTotal = strips.reduce((sum: number, strip: Record<string, any>) => sum + (strip.pixelCount || 0), 0);
    const delta = currentTotal - spec.pixels;
    strips[1].pixelCount = Math.max(1, strips[1].pixelCount - delta);
    project.portRoles = (project.portRoles || []).map((entry: Record<string, any>) => (
      entry.pin === 16 ? { ...entry, role: 'strip', pixelCount: spec.pixels, controlKind: '' } : entry
    ));
  });
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    // The install-screen bootstrap above left a resumable commissioning flow
    // behind in sessionStorage (it never clicked Install or Cancel) — and
    // app.jsx's route reconciler forces the URL back to the install route for
    // as long as `installActiveRef` reads one. This owner has already
    // finished setup once and is returning to edit.
    sessionStorage.removeItem('lw_card_commissioning_active_v2');
    localStorage.removeItem('lw_card_commissioning_registry_v2');
    localStorage.removeItem('lw_card_commissioning_registry_v2_backup');
    // The wiring edit invalidated the installation entirely — no verified
    // record survives it.
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      generation: 2,
      editedRevision: 2,
      installedRevision: 1,
      dirty: true,
      installation: null,
    }));
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  return spec;
}
