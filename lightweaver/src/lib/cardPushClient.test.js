import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { isUncertainCardWriteFailure } from './cardTransientFailure.js';
import { classifyCardDeploymentResume, orchestrateCardDeploymentStart } from './cardDeployment.js';
import {
  assertCardColorJourneySupport,
  assertCardKaleidoscopeSupport,
  cardConfigNeedsRebootFromInfo,
  cardConfigPinLayoutChangedFromInfo,
  cardConfigStructuralWiringChangedFromInfo,
  assignCardWiringIdentityForChange,
  assignExactCandidateWiringIdentity,
  CardPushError,
  pushConfigToCard,
  readCardFirmwareInfoEnvelope,
  readCardProjectEvidence,
  readCardStatusEnvelope,
  shouldDirectApplyLedCountChange,
} from './cardPushClient.js';

test('firmware-info envelope preserves live controls and color fields for count proof', async () => {
  const result = await readCardFirmwareInfoEnvelope({
    host: '192.168.18.70', transport: 'direct',
    fetchImpl: async (url, options) => {
      assert.match(String(url), /\/api\/firmware-info$/);
      assert.equal(options.cache, 'no-store');
      return response({ cardId: 'lw-a', bootId: 'boot-a', buildNumber: 2160,
        ledType: 'WS2812B', outputColor: { colorOrder: 'GRB' },
        controls: { encoder: { a: 4, b: 5 } } });
    },
  });
  assert.equal(result.controls.encoder.a, 4);
  assert.equal(result.outputColor.colorOrder, 'GRB');
});

const runtimePackage = {
  format: 'lightweaver-card-runtime-package',
  config: {
    version: 1,
    piece: { id: 'commissioned-piece', name: 'Commissioned Piece' },
    led: {
      pixels: 8,
      colorOrder: 'GRB',
      outputs: [{ id: 'main', pin: 16, pixels: 8 }],
    },
    looks: [],
  },
};

test('probation candidate reuses only its exact positive wiring identity on reload', async () => {
  const config = {
    projectRevision: 13, projectFingerprint: 'a'.repeat(64),
    led: { type: 'WS2812B', colorOrder: 'RGB', maxMilliamps: 1500, outputs: [
      { id: 'one', pin: 18, pixels: 28, segments: [{ id: 'run-first', count: 14, direction: 'forward' }, { id: 'run-middle', count: 14, direction: 'forward' }] },
      { id: 'two', pin: 21, pixels: 13, segments: [{ id: 'run-last', count: 13, direction: 'forward' }] },
    ] },
  };
  const identity = { cardId: 'lw-aabbccddeeff', buildId: 'build-123' };
  const digest = (await import('./productionWiringIdentity.js')).productionWiringDigest;
  const candidate = {
    app: 'Lightweaver', ...identity, state: 'testing', hasCandidate: true,
    activationId: 'candidate-probation', projectRevision: 13, projectFingerprint: 'a'.repeat(64),
    wiringRevision: 1, wiringDigest: await digest(config.led, webcrypto),
  };
  assert.equal(await assignExactCandidateWiringIdentity(config, candidate, identity, { cryptoImpl: webcrypto }), true);
  assert.equal(config.wiringRevision, 1);
  assert.equal(config.wiringDigest, candidate.wiringDigest);
  const prepared = { ...identity, config };
  assert.equal(classifyCardDeploymentResume(prepared, candidate), 'resume-physical-test');
  for (const drift of [{ buildId: 'other' }, { projectFingerprint: 'b'.repeat(64) }, { wiringDigest: 'f'.repeat(64) }]) {
    const changed = structuredClone(config);
    delete changed.wiringRevision; delete changed.wiringDigest;
    assert.equal(await assignExactCandidateWiringIdentity(changed, { ...candidate, ...drift }, identity, { cryptoImpl: webcrypto }), false);
    assert.equal(changed.wiringRevision, undefined);
    assert.equal(classifyCardDeploymentResume({ ...identity, config: changed }, { ...candidate, ...drift }), 'candidate-conflict');
  }
});

const colorJourneyRuntimePackage = {
  ...runtimePackage,
  config: {
    ...runtimePackage.config,
    looks: [{
      id: 'journey', label: 'Journey', mode: 'procedural', preset: 'aurora',
      nativeRecipe: {
        version: 1, kind: 'color-journey', id: 'slow-color-drift',
        journey: {
          version: 1,
          stops: [{ color: '#ff0000', holdMs: 0, fadeMs: 1000 }, { color: '#0000ff', holdMs: 0, fadeMs: 1000 }],
          easing: 'linear', loop: true, restart: 'restart', motionSpeedMs: 18000, depth: 0.25,
          phase16: '00000000000000000000000000000000',
        },
      },
    }],
  },
};

const kaleidoscopeRuntimePackage = {
  ...runtimePackage,
  config: {
    ...runtimePackage.config,
    zones: [{ id: 'frame', ranges: [{ start: 0, count: 8 }] }],
    kaleidoscopeMappings: [{
      id: 'frame', zoneId: 'frame', pixelCount: 8,
      pointCount: 4, startLed: 0, offsets: [0, 0, 0, 0],
      spans: [{ start: 0, count: 8, sourceStart: 0, sourceStep: 1 }],
    }],
  },
};

function browserWithIdentity(protocol = 'http:') {
  const values = new Map([
    ['lw_card_identity_v1', JSON.stringify({ version: 1, id: 'lw-aabbccddeeff' })],
  ]);
  return {
    location: { protocol },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
  };
}

function response(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('status preflight performs an uncached full status GET', async () => {
  let call;
  const status = { app: 'Lightweaver', cardId: 'lw-aabbccddeeff', commandReady: true };
  assert.equal(await readCardStatusEnvelope({
    host: '192.168.4.1', transport: 'direct',
    fetchImpl: async (url, init) => {
      call = { url, init };
      return { ok: true, json: async () => status };
    },
  }), status);
  assert.match(call.url, /\/api\/status$/);
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.cache, 'no-store');
});

test('project evidence reader performs an uncached independent branded firmware-info GET', async () => {
  let call;
  const body = {
    app: 'Lightweaver',
    cardId: 'lw-aabbccddeeff',
    firmwareVersion: '1.2.3',
    buildId: 'build-123',
    projectRevision: 7,
    projectFingerprint: 'a'.repeat(16),
    productionJobId: 'job-42',
    productionJobDigest: 'b'.repeat(64),
  };
  const result = await readCardProjectEvidence({
    host: '192.168.4.1',
    transport: 'direct',
    fetchImpl: async (url, init) => {
      call = { url, init };
      return { ok: true, json: async () => body };
    },
  });
  assert.deepEqual(result, body);
  assert.match(call.url, /\/api\/firmware-info$/);
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.cache, 'no-store');
});

test('Color Journey installs require the exact versioned firmware capability and preserve it in evidence', async () => {
  const expected = {
    version: 1,
    maxPixels: 256,
    phaseEncoding: 'q0.16-hex',
    restart: 'restart',
  };
  assert.equal(assertCardColorJourneySupport(runtimePackage, null), true);
  assert.equal(assertCardColorJourneySupport(colorJourneyRuntimePackage, { recipeCapabilities: { colorJourney: expected } }), true);
  for (const evidence of [
    null,
    {},
    { recipeCapabilities: { colorJourney: { ...expected, version: 0 } } },
    { recipeCapabilities: { colorJourney: { ...expected, maxPixels: 128 } } },
    { recipeCapabilities: { colorJourney: { ...expected, phaseEncoding: 'u16' } } },
    { recipeCapabilities: { colorJourney: { ...expected, restart: 'resume' } } },
  ]) {
    assert.throws(
      () => assertCardColorJourneySupport(colorJourneyRuntimePackage, evidence),
      error => error instanceof CardPushError && error.reason === 'color-journey-unsupported',
    );
  }
  const body = {
    app: 'Lightweaver', cardId: 'lw-aabbccddeeff', firmwareVersion: '1.2.3', buildId: 'build-123',
    recipeCapabilities: {
      colorJourney: expected,
      colorJourneyV2: { version: 2, maxPixels: 65535, maxPhaseSpans: 64, phaseEncoding: 'q0.16-affine', restart: 'restart' },
      colorJourneyV3: { version: 3, maxPixels: 65535, maxPhaseSpans: 64, maxPhaseErrorTicks: 194,
        phaseEncoding: 'q0.16-affine-rgb1', restart: 'restart' },
    },
  };
  const normalized = await readCardProjectEvidence({
    host: '192.168.4.1', transport: 'direct', fetchImpl: async () => response(body),
  });
  assert.deepEqual(normalized.recipeCapabilities, body.recipeCapabilities);
});

test('Color Journey bridge install fails before config mutation without capability and sends once with exact support', async () => {
  const oldWindow = globalThis.window;
  globalThis.window = browserWithIdentity('https:');
  try {
    let writes = 0;
    const options = {
      host: 'lightweaver.local',
      transport: 'bridge',
      initialConfigAuthorityImpl: () => true,
      bridgeRequestImpl: async type => {
        if (type === 'config') writes += 1;
        return { ok: true };
      },
    };
    await assert.rejects(
      pushConfigToCard(colorJourneyRuntimePackage, options),
      error => error instanceof CardPushError && error.reason === 'color-journey-unsupported',
    );
    assert.equal(writes, 0);
    await pushConfigToCard(colorJourneyRuntimePackage, {
      ...options,
      cardEvidence: {
        recipeCapabilities: {
          colorJourney: { version: 1, maxPixels: 256, phaseEncoding: 'q0.16-hex', restart: 'restart' },
        },
      },
    });
    assert.equal(writes, 1);
  } finally {
    globalThis.window = oldWindow;
  }
});

test('project evidence reader rejects a response branded as another product', async () => {
  await assert.rejects(readCardProjectEvidence({
    host: '192.168.4.1',
    transport: 'direct',
    fetchImpl: async () => ({ ok: true, json: async () => ({ app: 'Other', cardId: 'lw-aabbccddeeff' }) }),
  }), /Lightweaver/i);
});

test('project evidence reader rejects identity without an exact Lightweaver provenance marker', async () => {
  await assert.rejects(readCardProjectEvidence({
    host: '192.168.4.1',
    transport: 'direct',
    fetchImpl: async () => ({ ok: true, json: async () => ({
      cardId: 'lw-aabbccddeeff',
      firmwareVersion: '1.2.3',
      buildId: 'build-123',
      projectRevision: 7,
      projectFingerprint: 'a'.repeat(16),
    }) }),
  }), /Lightweaver/i);
});

test('project evidence reader rejects malformed card-owned identity fields', async () => {
  await assert.rejects(readCardProjectEvidence({
    host: '192.168.4.1',
    transport: 'direct',
    fetchImpl: async () => ({ ok: true, json: async () => ({
      app: 'Lightweaver',
      cardId: 'lw-aabbccddeeff',
      firmwareVersion: '1.2.3',
      buildId: 'build-123',
      projectRevision: 7,
      projectFingerprint: 'ABCDEF0123456789',
    }) }),
  }), /project fingerprint/i);
});

test('project evidence rejects a partial production job identity', async () => {
  for (const partial of [
    { productionJobId: 'job-42' },
    { productionJobDigest: 'b'.repeat(64) },
  ]) {
    await assert.rejects(readCardProjectEvidence({
      host: '192.168.4.1',
      transport: 'direct',
      fetchImpl: async () => ({ ok: true, json: async () => ({
        app: 'Lightweaver',
        cardId: 'lw-aabbccddeeff',
        firmwareVersion: '1.2.3',
        buildId: 'build-123',
        projectRevision: 7,
        projectFingerprint: 'a'.repeat(16),
        ...partial,
      }) }),
    }), /production job identity/i);
  }
});

test('requires Kaleidoscope capability evidence only for packages that use standalone mappings', () => {
  assert.equal(assertCardKaleidoscopeSupport(runtimePackage, null), true);
  for (const evidence of [null, {}, { capabilities: {} }, { capabilities: { kaleidoscopeReflectionPoints: 0 } }]) {
    assert.throws(
      () => assertCardKaleidoscopeSupport(kaleidoscopeRuntimePackage, evidence),
      error => error?.reason === 'kaleidoscope-unsupported' && /Update the card firmware/i.test(error.message),
    );
  }
  assert.equal(assertCardKaleidoscopeSupport(
    kaleidoscopeRuntimePackage,
    { capabilities: { kaleidoscopeReflectionPoints: 1 } },
  ), true);
});

test('blocks direct mapped config, candidate, and reboot mutations before any write', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = browserWithIdentity('http:');
  globalThis.fetch = async () => { throw new Error('push must use the supplied direct transport'); };
  try {
    for (const outputs of [
      [{ pin: 16, pixels: 8 }],
      [{ pin: 17, pixels: 8 }],
    ]) {
      const calls = [];
      await assert.rejects(pushConfigToCard(kaleidoscopeRuntimePackage, {
        host: '192.168.18.70', transport: 'direct', autoDiscover: false,
        reboot: 'if-needed', allowLayoutChange: true,
        fetchImpl: async (url, init = {}) => {
          calls.push({ url: String(url), method: init.method || 'GET' });
          if (String(url).endsWith('/api/firmware-info')) return response({
            app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
            firmwareVersion: '1.2.3', buildId: 'build-123',
            piece: { id: 'commissioned-piece' }, outputs,
            capabilities: { kaleidoscopeReflectionPoints: 0 },
          });
          throw new Error(`mutation must not run: ${url}`);
        },
      }), error => error?.reason === 'kaleidoscope-unsupported');
      assert.equal(calls.some(call => call.method === 'POST'), false);
      assert.equal(calls.some(call => /\/api\/(?:config|reboot|wiring\/candidate)/.test(call.url)), false);
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('blocks bridge mapped mutations and requires verified capability for one-shot blank handoff', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = browserWithIdentity('http:');
  globalThis.fetch = async () => { throw new Error('direct HTTP must not run'); };
  try {
    const ordinaryCalls = [];
    await assert.rejects(pushConfigToCard(kaleidoscopeRuntimePackage, {
      host: '192.168.18.70', transport: 'bridge', autoDiscover: false,
      initialConfigAuthorityImpl: () => false,
      bridgeRequestImpl: async (type, payload, options) => {
        ordinaryCalls.push({ type, payload, options });
        if (type === 'firmware-info') return {
          app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
          firmwareVersion: '1.2.3', buildId: 'build-123',
          piece: { id: 'commissioned-piece' }, outputs: [{ pin: 16, pixels: 8 }],
        };
        throw new Error(`bridge mutation must not run: ${type}`);
      },
    }), error => error?.reason === 'kaleidoscope-unsupported');
    assert.deepEqual(ordinaryCalls.map(call => call.type), ['firmware-info']);

    const blankCalls = [];
    await assert.rejects(pushConfigToCard(kaleidoscopeRuntimePackage, {
      host: '192.168.18.70', transport: 'bridge', commissioningFlowId: 'flow-1',
      initialConfigAuthorityImpl: () => true,
      bridgeRequestImpl: async (...args) => { blankCalls.push(args); return { ok: true }; },
    }), error => error?.reason === 'kaleidoscope-unsupported');
    assert.deepEqual(blankCalls, []);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('installs mapped config when exact card evidence reports capability version 1', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = browserWithIdentity('http:');
  globalThis.fetch = async () => { throw new Error('push must use the supplied direct transport'); };
  try {
    const result = await pushConfigToCard(kaleidoscopeRuntimePackage, {
      host: '192.168.18.70', transport: 'direct', autoDiscover: false, reboot: false,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        if (String(url).endsWith('/api/firmware-info')) return response({
          app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
          firmwareVersion: '2.0.0', buildId: 'build-kaleidoscope',
          piece: { id: 'commissioned-piece' }, outputs: [{ pin: 16, pixels: 8 }],
          capabilities: { kaleidoscopeReflectionPoints: 1 },
        });
        if (String(url).endsWith('/api/config')) return response({ ok: true, saved: true });
        throw new Error(`unexpected request ${url}`);
      },
    });
    assert.equal(result.saved, true);
    assert.equal(calls.filter(call => call.url.endsWith('/api/config') && call.method === 'POST').length, 1);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('explicit bridge config transport is honored on an HTTP Studio page', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const bridgeCalls = [];
  globalThis.window = browserWithIdentity('http:');
  globalThis.fetch = async () => { throw new Error('direct HTTP must not run'); };
  try {
    const result = await pushConfigToCard(runtimePackage, {
      host: '192.168.18.70',
      transport: 'bridge',
      autoDiscover: false,
      reboot: 'if-needed',
      bridgeRequestImpl: async (type, payload, options) => {
        bridgeCalls.push({ type, payload, options });
        if (type === 'firmware-info') {
          return { piece: { id: 'commissioned-piece' }, outputs: [{ pin: 16, pixels: 8 }] };
        }
        if (type === 'config') return { ok: true, saved: true };
        throw new Error(`unexpected bridge request ${type}`);
      },
      initialConfigAuthorityImpl: () => false,
    });
    assert.equal(result.saved, true);
    assert.deepEqual(bridgeCalls.map(call => call.type), ['firmware-info', 'config']);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('bridge config refusal preserves its reason instead of claiming a browser block', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  globalThis.window = browserWithIdentity('https:');
  try {
    await assert.rejects(pushConfigToCard(runtimePackage, {
      host: '192.168.18.70', transport: 'bridge', autoDiscover: false,
      initialConfigAuthorityImpl: () => false,
      bridgeRequestImpl: async type => {
        if (type === 'firmware-info') return { piece: { id: 'commissioned-piece' }, outputs: [{ pin: 16, pixels: 8 }] };
        const error = new Error('The verified card is not runtime-ready for this mutation.');
        error.reason = 'runtime-not-ready';
        throw error;
      },
    }), error => error instanceof CardPushError
      && error.reason === 'runtime-not-ready'
      && !/mixed content|browser blocked/i.test(error.message));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('explicit direct config transport is honored on an HTTPS Studio page', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.window = browserWithIdentity('https:');
  globalThis.fetch = async () => { throw new Error('push must use the supplied direct transport'); };
  try {
    const result = await pushConfigToCard(runtimePackage, {
      host: '192.168.18.70',
      transport: 'direct',
      autoDiscover: false,
      reboot: false,
      bridgeRequestImpl: async () => { throw new Error('bridge must not run'); },
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).endsWith('/api/firmware-info')) {
          return response({
            app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
            firmwareVersion: '1.2.3', buildId: 'build-123',
            piece: { id: 'commissioned-piece' }, outputs: [{ pin: 16, pixels: 8 }],
          });
        }
        if (String(url).endsWith('/api/config')) return response({ ok: true, saved: true });
        throw new Error(`unexpected direct request ${url}`);
      },
    });
    assert.equal(result.saved, true);
    assert.equal(urls.filter(url => url.endsWith('/api/config')).length, 1);
    assert.equal(urls.some(url => url.includes('/api/wiring/')), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('a verified discovery bench can be promoted into its measured Studio project', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  globalThis.window = browserWithIdentity('http:');
  const calls = [];
  try {
    const result = await pushConfigToCard(runtimePackage, {
      host: '192.168.18.70', transport: 'direct', autoDiscover: false, reboot: false,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        if (String(url).endsWith('/api/firmware-info')) return response({
          app: 'Lightweaver', cardId: 'lw-aabbccddeeff', firmwareVersion: '1.2.3', buildId: 'build-123',
          provisionalSetup: true,
          piece: { id: 'lightweaver-bench-discovery-v1', name: 'Lightweaver Bench Discovery' },
          outputs: [{ pin: 16, pixels: 8 }],
        });
        if (String(url).endsWith('/api/config')) return response({ ok: true, saved: true });
        throw new Error(`unexpected request ${url}`);
      },
    });
    assert.equal(result.saved, true);
    assert.equal(calls.filter(call => call.url.endsWith('/api/config') && call.method === 'POST').length, 1);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('direct factory commissioning requires fresh exact blank authority and writes config once', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = browserWithIdentity('http:');
  globalThis.fetch = async () => { throw new Error('push must use the supplied direct transport'); };
  try {
    const result = await pushConfigToCard(runtimePackage, {
      host: '192.168.18.70',
      transport: 'direct',
      factoryBlank: true,
      autoDiscover: false,
      reboot: 'if-needed',
      allowProjectChange: true,
      allowLayoutChange: true,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        if (String(url).endsWith('/api/firmware-info')) {
          return response({
            app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
            firmwareVersion: '1.2.3', buildId: 'build-123',
          });
        }
        if (String(url).endsWith('/api/status')) {
          return response({
            app: 'Lightweaver', provisioningContractVersion: 1,
            cardId: 'lw-aabbccddeeff', firmwareVersion: '1.2.3', buildId: 'build-123',
            bootId: 'boot-blank-1', runtimePhase: 'factory', knownGoodProject: false,
            commandReady: false, outputReady: true,
            mode: 'factory-flash', source: 'defaults',
          });
        }
        if (String(url).endsWith('/api/config')) return response({ ok: true, saved: true });
        throw new Error(`unexpected direct request ${url}`);
      },
    });
    assert.equal(result.saved, true);
    assert.equal(calls.filter(call => call.url.endsWith('/api/config')).length, 1);
    assert.equal(calls.some(call => call.url.includes('/api/wiring/')), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('direct factory commissioning refuses stale or nonblank authority before config write', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = browserWithIdentity('http:');
  globalThis.fetch = async () => { throw new Error('push must use the supplied direct transport'); };
  try {
    await assert.rejects(pushConfigToCard(runtimePackage, {
      host: '192.168.18.70',
      transport: 'direct',
      factoryBlank: true,
      autoDiscover: false,
      allowProjectChange: true,
      allowLayoutChange: true,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        if (String(url).endsWith('/api/firmware-info')) {
          return response({
            app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
            firmwareVersion: '1.2.3', buildId: 'build-123',
          });
        }
        if (String(url).endsWith('/api/status')) {
          return response({
            app: 'Lightweaver', provisioningContractVersion: 1,
            cardId: 'lw-aabbccddeeff', firmwareVersion: '1.2.3', buildId: 'build-123',
            bootId: 'boot-ready-1', runtimePhase: 'ready', knownGoodProject: true,
            commandReady: true, outputReady: true,
          });
        }
        if (String(url).endsWith('/api/config')) return response({ ok: true, saved: true });
        throw new Error(`unexpected direct request ${url}`);
      },
    }), error => error?.reason === 'blank-authority');
    assert.equal(calls.filter(call => call.url.endsWith('/api/config')).length, 0);
    assert.equal(calls.some(call => call.url.includes('/api/wiring/')), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

const countedRuntimePackage = {
  ...runtimePackage,
  config: {
    ...runtimePackage.config,
    led: {
      ...runtimePackage.config.led,
      pixels: 41,
      outputs: [{ id: 'main', pin: 16, pixels: 41 }],
    },
  },
};

test('pixel count on the same GPIO is a length change, not a pin-layout change', () => {
  const current = { outputs: [{ pin: 16, pixels: 256 }] };
  assert.equal(cardConfigPinLayoutChangedFromInfo(current, countedRuntimePackage), false);
  assert.equal(cardConfigNeedsRebootFromInfo(current, countedRuntimePackage), true);
  assert.equal(shouldDirectApplyLedCountChange(current, countedRuntimePackage), true);
  assert.equal(shouldDirectApplyLedCountChange({ outputs: [{ pin: 17, pixels: 256 }] }, countedRuntimePackage), false);
  assert.equal(shouldDirectApplyLedCountChange({ outputs: [{ pin: 16, pixels: 41 }] }, countedRuntimePackage), false);
});

test('same-GPIO section split is structural while a single-run length remains direct', () => {
  const current = { ledType: 'WS2812B', maxMilliamps: 1500, outputs: [{ id: 'one-output', pin: 18, pixels: 41,
    segments: [{ id: 'one-output-full', count: 41, direction: 'forward' }] }] };
  const base = { led: { type: 'WS2812B', maxMilliamps: 1500, outputs: [{ id: 'one-output', pin: 18, pixels: 41,
    segments: [{ id: 'one-output-full', count: 41, direction: 'forward' }] }] } };
  const split = { led: { ...base.led, outputs: [{ ...base.led.outputs[0], segments: [
    { id: 'first', count: 14, direction: 'forward' },
    { id: 'second', count: 14, direction: 'forward' },
    { id: 'third', count: 13, direction: 'forward' },
  ] }] } };
  assert.equal(cardConfigStructuralWiringChangedFromInfo(current, split), true);
  assert.equal(cardConfigStructuralWiringChangedFromInfo(current, { led: { ...base.led, outputs: [{ ...base.led.outputs[0], pixels: 44, segments: [{ id: 'one-output-full', count: 44, direction: 'forward' }] }] } }), false);
});

test('same-GPIO three-section install stages one exact candidate and resumes without another POST', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  globalThis.window = browserWithIdentity('http:');
  const cardId = 'lw-aabbccddeeff';
  const buildId = 'build-123';
  const current = {
    app: 'Lightweaver', cardId, firmwareVersion: '1.2.3', buildId,
    piece: { id: 'commissioned-piece' }, ledType: 'WS2812B', maxMilliamps: 1500,
    wiringRevision: 0, outputs: [{ id: 'one-output', pin: 18, pixels: 41,
      segments: [{ id: 'one-output-full', count: 41, direction: 'forward' }] }],
  };
  const target = structuredClone(runtimePackage);
  target.config.projectRevision = 2;
  target.config.projectFingerprint = 'a'.repeat(64);
  target.config.led = { type: 'WS2812B', colorOrder: 'GRB', maxMilliamps: 1500, pixels: 41,
    outputs: [{ id: 'one-output', pin: 18, pixels: 41, segments: [
      { id: 'first', count: 14, direction: 'forward' },
      { id: 'second', count: 14, direction: 'forward' },
      { id: 'third', count: 13, direction: 'forward' },
    ] }] };
  const preparedConfig = structuredClone(target.config);
  await assignCardWiringIdentityForChange(preparedConfig, current, { cryptoImpl: webcrypto });
  assert.equal(preparedConfig.wiringRevision, 1);
  assert.match(preparedConfig.wiringDigest, /^[a-f0-9]{64}$/);
  const calls = [];
  try {
    const result = await pushConfigToCard({ ...target, config: preparedConfig }, {
      host: '192.168.18.70', transport: 'direct', autoDiscover: false, reboot: 'if-needed',
      allowLayoutChange: true,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
        if (String(url).endsWith('/api/firmware-info')) return response(current);
        if (String(url).endsWith('/api/wiring/candidate')) return response({ ok: true, state: 'staged', activationId: 'candidate-split' });
        throw new Error(`unexpected request ${url}`);
      },
    });
    assert.equal(result.state, 'staged');
    const mutation = calls.filter(call => call.method === 'POST');
    assert.equal(mutation.length, 1);
    assert.match(mutation[0].url, /\/api\/wiring\/candidate$/);
    const sent = JSON.parse(mutation[0].body).candidate;
    assert.equal(sent.wiringRevision, preparedConfig.wiringRevision);
    assert.equal(sent.wiringDigest, preparedConfig.wiringDigest);
    const candidate = { state: 'staged', hasCandidate: true, activationId: result.activationId,
      cardId, buildId, projectRevision: sent.projectRevision, projectFingerprint: sent.projectFingerprint,
      wiringRevision: sent.wiringRevision, wiringDigest: sent.wiringDigest };
    const prepared = { cardId, buildId, config: preparedConfig };
    assert.equal(classifyCardDeploymentResume(prepared, candidate), 'resume-activation');
    const resumed = await orchestrateCardDeploymentStart(prepared, {
      readFirmwareInfo: async () => current,
      readStatus: async () => current,
      readWiringStatus: async () => candidate,
      config: async () => { throw new Error('resume must not POST'); },
    });
    assert.equal(resumed.action, 'resume-activation');
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('writes a typed LED count over /api/config without the Test & Install candidate dance', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = browserWithIdentity('http:');
  globalThis.fetch = async () => { throw new Error('push must use the supplied direct transport'); };
  try {
    const result = await pushConfigToCard(countedRuntimePackage, {
      host: '192.168.18.70', transport: 'direct', autoDiscover: false, reboot: 'if-needed',
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        if (String(url).endsWith('/api/firmware-info')) return response({
          app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
          firmwareVersion: '1.2.3', buildId: 'build-123',
          piece: { id: 'commissioned-piece' }, outputs: [{ pin: 16, pixels: 256 }],
        });
        if (String(url).endsWith('/api/config')) return response({ ok: true, saved: true, requiresReboot: true });
        if (String(url).endsWith('/api/reboot')) return response({ ok: true });
        throw new Error(`unexpected request ${url}`);
      },
    });
    assert.equal(result.saved, true);
    assert.equal(calls.filter(call => call.url.endsWith('/api/config') && call.method === 'POST').length, 1);
    assert.equal(calls.filter(call => call.url.endsWith('/api/reboot') && call.method === 'POST').length, 1);
    assert.equal(calls.some(call => call.url.includes('/api/wiring/')), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('a staged direct config response never triggers the requested reboot', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  globalThis.window = browserWithIdentity('http:');
  const calls = [];
  try {
    const result = await pushConfigToCard(countedRuntimePackage, {
      host: '192.168.18.70', transport: 'direct', autoDiscover: false, reboot: true,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        if (String(url).endsWith('/api/firmware-info')) return response({
          app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
          firmwareVersion: '1.2.3', buildId: 'build-123',
          piece: { id: 'commissioned-piece' }, outputs: [{ pin: 16, pixels: 256 }],
        });
        if (String(url).endsWith('/api/config')) return response({
          ok: true, state: 'staged', activationId: 'candidate-a',
          requiresReboot: false, requiresConfirmation: true,
        });
        throw new Error(`unexpected request ${url}`);
      },
    });
    assert.equal(result.state, 'staged');
    assert.equal(calls.filter(call => call.url.endsWith('/api/reboot')).length, 0);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('a GPIO change still needs an intentional layout write and still stages', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  globalThis.window = browserWithIdentity('http:');
  try {
    await assert.rejects(pushConfigToCard(runtimePackage, {
      host: '192.168.18.70', transport: 'direct', autoDiscover: false, reboot: 'if-needed',
      fetchImpl: async (url) => {
        if (String(url).endsWith('/api/firmware-info')) return response({
          app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
          firmwareVersion: '1.2.3', buildId: 'build-123',
          piece: { id: 'commissioned-piece' }, outputs: [{ pin: 18, pixels: 8 }],
        });
        throw new Error(`mutation must not run: ${url}`);
      },
    }), error => error instanceof CardPushError && error.reason === 'layout-mismatch');

    const calls = [];
    const result = await pushConfigToCard(runtimePackage, {
      host: '192.168.18.70', transport: 'direct', autoDiscover: false, reboot: 'if-needed',
      allowLayoutChange: true,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        if (String(url).endsWith('/api/firmware-info')) return response({
          app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
          firmwareVersion: '1.2.3', buildId: 'build-123',
          piece: { id: 'commissioned-piece' }, outputs: [{ pin: 18, pixels: 8 }],
        });
        if (String(url).endsWith('/api/wiring/candidate')) {
          return response({ ok: true, state: 'staged', activationId: 'act-1' });
        }
        throw new Error(`unexpected request ${url}`);
      },
    });
    assert.equal(result.state, 'staged');
    assert.equal(calls.some(call => call.url.endsWith('/api/wiring/candidate') && call.method === 'POST'), true);
    assert.equal(calls.some(call => call.url.endsWith('/api/config')), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('an uncounted Find-my-strips bench can take the typed length without provisionalSetup', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  globalThis.window = browserWithIdentity('http:');
  const calls = [];
  try {
    const result = await pushConfigToCard(countedRuntimePackage, {
      host: '192.168.18.70', transport: 'direct', autoDiscover: false, reboot: 'if-needed',
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        if (String(url).endsWith('/api/firmware-info')) return response({
          app: 'Lightweaver', cardId: 'lw-aabbccddeeff', firmwareVersion: '1.2.3', buildId: 'build-123',
          provisionalSetup: false,
          piece: { id: 'lightweaver-bench-discovery-v1', name: 'Lightweaver Bench Discovery' },
          outputs: [{ pin: 16, pixels: 256 }],
        });
        if (String(url).endsWith('/api/config')) return response({ ok: true, saved: true, requiresReboot: true });
        if (String(url).endsWith('/api/reboot')) return response({ ok: true });
        throw new Error(`unexpected request ${url}`);
      },
    });
    assert.equal(result.saved, true);
    assert.equal(calls.filter(call => call.url.endsWith('/api/config') && call.method === 'POST').length, 1);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

// W1-6: Card Home's Verify hardware reads the status envelope over the link it
// actually holds. On an https page whose browser allows the plain-http card
// fetch that link is direct, and the page-protocol guess ("bridge") is wrong.
test('explicit direct status transport is honored on an HTTPS Studio page', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  globalThis.window = browserWithIdentity('https:');
  try {
    const status = { app: 'Lightweaver', cardId: 'lw-aabbccddeeff', runtimePhase: 'ready' };
    const urls = [];
    const result = await readCardStatusEnvelope({
      host: '192.168.18.70',
      transport: 'direct',
      fetchImpl: async url => { urls.push(String(url)); return response(status); },
    });
    assert.deepEqual(result, status);
    assert.deepEqual(urls, ['http://192.168.18.70/api/status']);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('affine journeys require exact v2 capability and never inherit legacy support', () => {
  const runtime = structuredClone(colorJourneyRuntimePackage);
  runtime.config.looks[0].nativeRecipe.journey.version = 2;
  delete runtime.config.looks[0].nativeRecipe.journey.phase16;
  runtime.config.looks[0].nativeRecipe.journey.phases = [[1024, 0, 65536]];
  const v1 = { version: 1, maxPixels: 256, phaseEncoding: 'q0.16-hex', restart: 'restart' };
  const v2 = { version: 2, maxPixels: 65535, maxPhaseSpans: 64, phaseEncoding: 'q0.16-affine', restart: 'restart' };
  assert.throws(() => assertCardColorJourneySupport(runtime, { recipeCapabilities: { colorJourney: v1 } }), /firmware/);
  assert.equal(assertCardColorJourneySupport(runtime, { recipeCapabilities: { colorJourneyV2: v2 } }), true);
  for (const override of [{ version: 3 }, { maxPixels: 1024 }, { maxPhaseSpans: 128 }, { phaseEncoding: 'hex' }, { restart: 'resume' }]) {
    assert.throws(() => assertCardColorJourneySupport(runtime, { recipeCapabilities: { colorJourney: v1, colorJourneyV2: { ...v2, ...override } } }), /firmware/);
  }
  assert.throws(() => assertCardColorJourneySupport(colorJourneyRuntimePackage, { recipeCapabilities: { colorJourneyV2: v2 } }), /firmware/);
});

test('bounded affine journeys require the exact v3 error capability before writes', () => {
  const runtime = structuredClone(colorJourneyRuntimePackage);
  runtime.config.looks[0].nativeRecipe.journey.version = 3;
  runtime.config.looks[0].nativeRecipe.journey.maxPhaseErrorTicks = 194;
  delete runtime.config.looks[0].nativeRecipe.journey.phase16;
  runtime.config.looks[0].nativeRecipe.journey.phases = [[1024, 0, 65536]];
  const v3 = { version: 3, maxPixels: 65535, maxPhaseSpans: 64,
    maxPhaseErrorTicks: 194, phaseEncoding: 'q0.16-affine-rgb1', restart: 'restart' };
  assert.equal(assertCardColorJourneySupport(runtime, { recipeCapabilities: { colorJourneyV3: v3 } }), true);
  for (const evidence of [
    { recipeCapabilities: { colorJourneyV2: { version: 2, maxPixels: 65535, maxPhaseSpans: 64, phaseEncoding: 'q0.16-affine', restart: 'restart' } } },
    { recipeCapabilities: { colorJourneyV3: { ...v3, maxPhaseErrorTicks: 195 } } },
    { recipeCapabilities: { colorJourneyV3: { ...v3, phaseEncoding: 'q0.16-affine' } } },
  ]) assert.throws(() => assertCardColorJourneySupport(runtime, evidence), /firmware/);
});


test('failed install preflight cannot masquerade as an accepted write or a card restart', { concurrency: false }, async () => {
  const previousWindow = globalThis.window;
  globalThis.window = browserWithIdentity('http:');
  let posts = 0;
  try {
    await assert.rejects(pushConfigToCard(runtimePackage, {
      host: 'lightweaver.local', transport: 'direct', autoDiscover: false,
      fetchImpl: async (_url, init = {}) => {
        if (init.method === 'POST') posts += 1;
        throw new TypeError('Failed to fetch');
      },
    }), error => {
      assert.equal(error.delivery, 'not-sent');
      assert.equal(isUncertainCardWriteFailure(error), false);
      return true;
    });
    assert.equal(posts, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('explicit config refusal stays a refusal while a lost accepted-write reboot remains uncertain', { concurrency: false }, async () => {
  const previousWindow = globalThis.window;
  globalThis.window = browserWithIdentity('http:');
  try {
    for (const accepted of [false, true]) {
      let posts = 0;
      await assert.rejects(pushConfigToCard(runtimePackage, {
        host: 'lightweaver.local', transport: 'direct', autoDiscover: false,
        fetchImpl: async (url, init = {}) => {
          if (init.method === 'POST') posts += 1;
          if (String(url).endsWith('/api/firmware-info')) return response({
            app: 'Lightweaver', cardId: 'lw-aabbccddeeff', firmwareVersion: '1.1.47', buildId: 'build-2160',
            provisionalSetup: true, piece: { id: 'lightweaver-bench-discovery-v1' }, outputs: [{ pin: 16, pixels: 8 }],
          });
          if (String(url).endsWith('/api/config')) return accepted
            ? response({ ok: true, requiresReboot: true })
            : { ...response({ ok: false, error: 'network settings not ready' }, false), status: 400 };
          if (String(url).endsWith('/api/reboot')) throw new TypeError('Failed to fetch');
          throw new Error('unexpected request');
        },
      }), error => {
        assert.equal(isUncertainCardWriteFailure(error), accepted);
        if (!accepted) assert.match(error.message, /network settings not ready/);
        return true;
      });
      assert.equal(posts, accepted ? 2 : 1);
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
