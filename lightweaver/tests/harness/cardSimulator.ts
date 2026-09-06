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
import type { Page, Route } from '@playwright/test';
import { CUSTOMER_CONTROL_WIRE_FIELDS } from '../../src/lib/cardCustomerControlContract.js';
import type { CardStateSpec, PatternEntry } from './cardStates.js';
import { MATRIX_CARD_ID } from './cardStates.js';

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

function zonesFor(state: CardStateSpec) {
  if (!state.pixels) return [];
  return [{
    id: ZONE_ID,
    label: 'All lights',
    patternId: state.currentId,
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
    blackout: state.currentId === 'blackout',
    ranges: [{ start: 0, count: state.pixels }],
  }];
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
    // Wiring the card is holding but has not adopted — the candidate slot.
    stagedPixels: undefined as number | undefined,
    stagedPin: undefined as number | undefined,
    // Set on activate/beginWiringTest, cleared on confirm/rollback/expiry.
    wiringTestActive: false,
    wiringProbationRemainingMs: 0,
    // What the card was running before this test began — the rollback target.
    preTestPixels: undefined as number | undefined,
    preTestPin: undefined as number | undefined,
    // The one GPIO the factory beacon is currently holding lit, or null. Only
    // meaningful before a real project exists (see /api/beacon/port above).
    beaconPinned: null as number | null,
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

  function applyControl(body: Record<string, unknown>) {
    state.stateRevision += 1;
    if (body.blackout === true) {
      state.currentIndex = -1;
      state.currentId = 'blackout';
      return;
    }
    const requested = String(body.patternId || '').trim();
    if (!requested) return;
    if (requested === 'blackout') {
      state.currentIndex = -1;
      state.currentId = 'blackout';
      return;
    }
    const index = state.patterns.findIndex(pattern => pattern.id === requested);
    // A card asked for a pattern it does not hold keeps playing what it had.
    // It does not invent a list entry.
    if (index < 0) return;
    state.currentIndex = index;
    state.currentId = requested;
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
      case '/api/recover-lights':
        applyControl(payload);
        return ok({
          ok: true, accepted: true, recovered: true, cardId: state.cardId,
          patternId: state.currentId,
          diagnostics: {
            rendered: true, framePrepared: true, frameSubmitted: true,
            pixels: state.pixels, nonBlackPixels: Math.max(1, state.pixels),
            brightnessByte: 166, brightnessLimit: 255, blackout: false, streaming: false,
          },
        });
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
        }
        state.wiringTransactionOpen = false;
        state.wiringTestActive = false;
        state.wiringProbationRemainingMs = 0;
        state.stagedPixels = undefined;
        state.stagedPin = undefined;
        state.preTestPixels = undefined;
        state.preTestPin = undefined;
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
        // The firmware's actual rule, and the reason "save to card" is two
        // steps rather than one: a config that changes WIRING is staged, not
        // applied, and waits for a human to confirm the lights still look
        // right. Anything else applies immediately. A simulator that just
        // answered {ok:true} could not tell those apart, so the entire
        // stage/activate/confirm lifecycle — the part that actually programs
        // the card — was untestable.
        const led = (payload.led || {}) as Record<string, unknown>;
        const nextPixels = Number(led.pixels ?? state.pixels);
        const outputs = (led.outputs || []) as { pin?: number }[];
        const nextPin = Number(outputs[0]?.pin ?? state.pin);
        const wiringChanged = state.pixels > 0
          && (nextPixels !== state.pixels || nextPin !== state.pin);

        if (wiringChanged) {
          state.wiringTransactionOpen = true;
          state.stagedPixels = nextPixels;
          state.stagedPin = nextPin;
          return {
            body: {
              ok: true, state: 'staged', activationId: STAGED_ACTIVATION_ID,
              message: 'wiring change staged', requiresReboot: false,
              requiresConfirmation: true,
            },
            status: 200,
          };
        }

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
        return ok({ ok: true, message: 'applied', requiresReboot: true });
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
