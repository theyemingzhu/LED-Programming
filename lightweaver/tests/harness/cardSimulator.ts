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

export type CardRequest = { method: string; path: string; body: unknown };

export type CardSimulator = {
  /** Live, mutable. Assertions read this to ask the CARD what it is doing. */
  state: CardStateSpec & { cardId: string; bootId: string; stateRevision: number };
  install(page: Page): Promise<void>;
  /** The pattern the card is actually playing right now. */
  playingId(): string;
  requests: CardRequest[];
  /** Paths Studio asked for that this simulator does not model. */
  unhandled: string[];
  waitForPlaying(id: string, timeoutMs?: number): Promise<void>;
  /** Answer one bridge-relayed request from the same state. */
  handleBridge(type: string, payload: unknown): Record<string, unknown>;
};

const ZONE_ID = 'zone-all';

function hasProject(state: CardStateSpec) {
  return String(state.projectId || '').trim() !== '';
}

/**
 * Readiness is derived, never authored. cardReadiness.js only reaches
 * state:'connected' when all four of these are true booleans and runtimePhase
 * is 'ready'; a fixture that sets them by hand can describe a card that cannot
 * exist, which is how "ready card with no project" got into this suite.
 */
function derivedReadiness(state: CardStateSpec) {
  const outputReady = state.pixels > 0;
  return {
    runtimePhase: 'ready',
    knownGoodProject: hasProject(state) && !state.provisionalSetup,
    commandReady: true,
    outputReady,
    projectOutputReady: outputReady,
    outputDriverReady: outputReady,
    playbackReady: outputReady && state.patterns.length > 0,
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
    mode: blank ? 'factory-flash' : 'project',
    source: blank ? 'defaults' : 'nvs',
    runtimeSource: blank ? 'defaults' : 'nvs',
    ok: true,
    errorCode: 0,
    resetReason: 'power-on',
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
      rebootCorrelation: '',
    },
    wiringProbation: { active: false, remainingMs: 0 },
    limits: { pixels: 65535, outputs: 4, looks: 32, zones: 12, rangesPerZone: 6, configStorageBytes: 3968 },
    kaleidoscopeMappings: [],
    recipeCapabilities: {},
    ...(project ? { piece: { id: state.projectId, name: state.projectName, hostname: 'lightweaver' } } : {}),
    led: {
      pixels: state.pixels,
      type: 'ws2812',
      colorOrder: 'GRB',
      outputGammaEnabled: false,
      outputGammaValue: 2.2,
      calibration: { red: 255, green: 255, blue: 255 },
      maxMilliamps: 1500,
      estimatedFullWhiteMilliamps: state.pixels * 60,
      limitedFullWhiteMilliamps: 1500,
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
      sourceClass: 'internal',
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
    maxMilliamps: 1500,
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
  return {
    app: 'Lightweaver',
    ok: true,
    state: staged ? 'staged' : 'known-good',
    candidateState: staged ? 'staged' : 'none',
    ...(staged ? { activationId: 'act-matrix-1' } : {}),
    hasKnownGood: state.pixels > 0,
    hasCandidate: staged,
    bootedCandidate: false,
    discoveryActive: false,
    probationMs: 90000,
    remainingProbationMs: 0,
    testing: false,
    nextStep: staged ? 'activate' : 'none',
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
    maxMilliamps: 1500,
    currentMaxMilliamps: 1500,
    estimatedFullWhiteMilliamps: state.pixels * 60,
    limitedFullWhiteMilliamps: 1500,
    currentOutputs: state.pixels > 0
      ? [{ id: 'out1', pin: state.pin, pixels: state.pixels, segments: [{ id: 'run-strip-1', count: state.pixels }] }]
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

export function createCardSimulator(spec: CardStateSpec, options: { cardId?: string } = {}): CardSimulator {
  const state = {
    ...spec,
    patterns: spec.patterns.map(pattern => ({ ...pattern })),
    cardId: options.cardId || MATRIX_CARD_ID,
    bootId: 'boot-matrix-1',
    stateRevision: 1,
  };
  const requests: CardRequest[] = [];
  const unhandled: string[] = [];
  let dropped = 0;

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
      case '/api/wiring/confirm':
      case '/api/wiring/rollback':
        state.wiringTransactionOpen = false;
        return ok({
          ok: true, state: path.endsWith('confirm') ? 'known-good' : 'rolled-back',
          activationId: 'act-matrix-1', rebooting: !path.endsWith('confirm'),
          remainingProbationMs: 0, nextStep: path.endsWith('confirm') ? 'none' : 'find-led-wire',
          currentOutputs: wiringStatusBody(state).currentOutputs,
        });
      case '/api/reboot':
        state.bootId = `${state.bootId}-r`;
        return ok({ ok: true, message: 'rebooting' });
      case '/api/config':
        return ok({ ok: true, message: 'applied', requiresReboot: true });
      case '/api/beacon/port':
        return ok({ ok: true, available: true, pixelsPerPort: 8, ports: [state.pin] });
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
    requests.push({ method, path, body });

    const answer = respond(method, path, body);
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
    playingId: () => state.currentId,
    async install(page: Page) {
      for (const host of CARD_HOSTS) {
        await page.route(`http://${host}/**`, handle);
        await page.route(`https://${host}/**`, handle);
      }
    },
    handleBridge(type: string, payload: unknown) {
      if (type === 'release-bridge') return { ok: true, response: { released: true } };
      if (type === 'frame') return { ok: true, response: { ok: true, relayed: true, wsOpen: true } };
      const route = BRIDGE_PATHS[type];
      if (!route) return { ok: false, reason: 'invalid-payload', error: 'unknown bridge request' };
      requests.push({ method: route.method, path: route.path, body: payload });
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
