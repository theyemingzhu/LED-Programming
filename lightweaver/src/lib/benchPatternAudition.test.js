import test from 'node:test';
import assert from 'node:assert/strict';
import { auditionBenchPattern, benchZoneIdForPin, requireBenchInstallReadback, restoreBenchPatternSnapshot } from './benchPatternAudition.js';

const layout = [{ pin: 16, start: 0, count: 30 }, { pin: 17, start: 30, count: 20 }];
const zones = () => ({ syncZones: false, zones: [
  { id: 'bench-16', patternId: 'warm-white', ranges: [{ start: 0, count: 30 }] },
  { id: 'bench-17', patternId: 'warm-white', ranges: [{ start: 30, count: 20 }] },
] });

test('audition targets only one exact bench GPIO zone and proves the other stayed unchanged', async () => {
  let state = zones();
  const posts = [];
  const result = await auditionBenchPattern({
    layout, pin: 17, patternId: 'ocean',
    readZones: async () => structuredClone(state),
    postControl: async body => {
      posts.push(body);
      state.zones[1].patternId = body.patternId;
      return { ok: true, affectedOutputs: ['bench-17'], confirmedLook: { zone: body.zone, patternId: body.patternId } };
    },
  });
  assert.equal(benchZoneIdForPin(17), 'bench-17');
  assert.deepEqual(posts, [{ zone: 'bench-17', syncZones: false, patternId: 'ocean' }]);
  assert.deepEqual(result.patternsByPin, { 16: 'warm-white', 17: 'ocean' });
});

test('legacy one-zone multi-output bench config refuses audition before any write', async () => {
  let posted = false;
  await assert.rejects(auditionBenchPattern({
    layout, pin: 17, patternId: 'ocean',
    readZones: async () => ({ zones: [{ id: 'bench-full', patternId: 'warm-white', ranges: [{ start: 0, count: 50 }] }] }),
    postControl: async () => { posted = true; },
  }), /temporary setup needs an update/i);
  assert.equal(posted, false);
});

test('same-total wrong zone range refuses audition before any write', async () => {
  let posted = false;
  const wrong = zones();
  wrong.zones[1].ranges = [{ start: 29, count: 21 }];
  await assert.rejects(auditionBenchPattern({
    layout, pin: 17, patternId: 'ocean',
    readZones: async () => wrong,
    postControl: async () => { posted = true; },
  }), /zone mapping/i);
  assert.equal(posted, false);
});

test('closing Bench during readback preflight prevents the pattern write', async () => {
  let posted = false;
  await assert.rejects(auditionBenchPattern({ layout, pin: 17, patternId: 'ocean',
    readZones: async () => zones(),
    onBeforeWrite: () => { throw new Error('Bench screen closed'); },
    postControl: async () => { posted = true; },
  }), /screen closed/i);
  assert.equal(posted, false);
});

test('a card that changes an unselected zone fails readback', async () => {
  let state = zones();
  await assert.rejects(auditionBenchPattern({
    layout, pin: 17, patternId: 'ocean',
    readZones: async () => structuredClone(state),
    postControl: async () => {
      state.zones[0].patternId = 'ocean';
      state.zones[1].patternId = 'ocean';
      return { ok: true };
    },
  }), /unselected zone changed/i);
});

test('shuffled zone readback still associates each pattern with its GPIO', async () => {
  let state = zones();
  const result = await auditionBenchPattern({
    layout, pin: 16, patternId: 'fire',
    readZones: async () => ({ ...state, zones: structuredClone(state.zones).reverse() }),
    postControl: async () => { state.zones[0].patternId = 'fire'; return { ok: true }; },
  });
  assert.deepEqual(result.patternsByPin, { 16: 'fire', 17: 'warm-white' });
});

test('single GPIO preview restores original pattern and sync mode', async () => {
  const one = [{ pin: 16, start: 0, count: 30 }];
  const state = { syncZones: true, zones: [{ id: 'bench-full', patternId: 'warm-white', ranges: [{ start: 0, count: 30 }] }] };
  const baseline = structuredClone(state);
  const postControl = async body => {
    if ('patternId' in body) state.zones[0].patternId = body.patternId;
    if ('syncZones' in body) state.syncZones = body.syncZones;
  };
  await auditionBenchPattern({ layout: one, pin: 16, patternId: 'fire',
    readZones: async () => structuredClone(state), postControl });
  assert.equal(state.syncZones, false);
  assert.equal(await restoreBenchPatternSnapshot({ layout: one, baseline,
    readZones: async () => structuredClone(state), postControl }), true);
  assert.deepEqual(state, baseline);
});

test('native 422 refusal: restore with baseline sync false sends no redundant sync-only command', async () => {
  const state = { ...zones(), syncZones: false };
  const baseline = structuredClone(state);
  const posts = [];
  const postControl = async body => {
    posts.push(body);
    if (Object.keys(body).length === 1 && body.syncZones === state.syncZones) {
      throw new Error('HTTP 422: command affects zero outputs');
    }
    if (body.zone) state.zones.find(zone => zone.id === body.zone).patternId = body.patternId;
    if ('syncZones' in body) state.syncZones = body.syncZones;
  };
  await auditionBenchPattern({ layout, pin: 17, patternId: 'fire',
    readZones: async () => structuredClone(state), postControl });
  assert.equal(await restoreBenchPatternSnapshot({ layout, baseline,
    readZones: async () => structuredClone(state), postControl }), true);
  assert.deepEqual(state, baseline);
  assert.equal(posts.filter(body => Object.keys(body).length === 1 && 'syncZones' in body).length, 0);
});

test('whole measured piece leaves provisioned but unconfirmed GPIO unchanged', async () => {
  const state = { ...zones(), syncZones: false };
  const posts = [];
  const result = await auditionBenchPattern({ layout, confirmedPins: [16], patternId: 'fire',
    readZones: async () => structuredClone(state), postControl: async body => {
      posts.push(body);
      if (!body.zone) throw new Error('broadcast is forbidden for partial measurements');
      state.zones.find(zone => zone.id === body.zone).patternId = body.patternId;
    } });
  assert.deepEqual(posts, [{ zone: 'bench-16', syncZones: false, patternId: 'fire' }]);
  assert.deepEqual(result.patternsByPin, { 16: 'fire' });
  assert.equal(state.zones[1].patternId, 'warm-white');
});

test('native arming is a separate exact-zone command and Stop restores startup-dark ownership', async () => {
  const state = { ...zones(), syncZones: false };
  const status = { streaming: false, blackout: false, nativeRenderArmSupported: true,
    nativeRenderArmed: false, nativeRendering: false, nativeFadeScale: 0, nativeArmedZones: [],
    provisionalSetup: true, outputReady: true, maxMilliamps: 2000, maxMilliampsSource: 'config' };
  const baseline = { ...structuredClone(state), nativeArmedZones: [] };
  const posts = [];
  const postControl = async body => {
    posts.push(body);
    if ('armNative' in body) {
      if ('patternId' in body || !body.zone) throw new Error('native arm must be exact and separate');
      status.nativeArmedZones = body.armNative ? [body.zone] : [];
      status.nativeRenderArmed = status.nativeArmedZones.length > 0;
      status.nativeRendering = status.nativeRenderArmed;
      status.nativeFadeScale = status.nativeRenderArmed ? 1 : 0;
    }
    if ('patternId' in body) state.zones.find(zone => zone.id === body.zone).patternId = body.patternId;
  };
  await auditionBenchPattern({ layout, confirmedPins: [16], patternId: 'fire',
    readZones: async () => structuredClone(state), readStatus: async () => structuredClone(status), postControl });
  assert.deepEqual(posts, [
    { zone: 'bench-16', syncZones: false, patternId: 'fire' },
    { zone: 'bench-16', armNative: true },
  ]);
  await restoreBenchPatternSnapshot({ layout, baseline,
    readZones: async () => structuredClone(state), readStatus: async () => structuredClone(status), postControl });
  assert.deepEqual(status.nativeArmedZones, []);
  assert.deepEqual(state, { ...zones(), syncZones: false });
});

test('Stop restores current look, zone blackout and controls after a lost arm reply', async () => {
  const state = { ...zones(), zones: zones().zones.map(zone => ({ ...zone,
    brightness: 0.25, speed: 1, blackout: zone.id === 'bench-16' })) };
  const status = { nativeRenderArmSupported: true, nativeArmedZones: [],
    nativeRendering: false, nativeFadeScale: 0, streaming: false, blackout: false,
    currentPatternId: 'bench-warm', playlist: { playing: false }, provisionalSetup: true,
    outputReady: true, maxMilliamps: 2000, maxMilliampsSource: 'config' };
  const baseline = { ...structuredClone(state), nativeArmedZones: [], blackout: false,
    currentPatternId: 'bench-warm', playlistPlaying: false };
  const posts = [];
  const postControl = async body => {
    posts.push(body);
    if ('armNative' in body) {
      status.nativeArmedZones = body.armNative ? [body.zone] : [];
      status.nativeRendering = body.armNative;
      status.nativeFadeScale = body.armNative ? 1 : 0;
      if (body.armNative) state.zones.find(zone => zone.id === body.zone).blackout = false;
      if (body.armNative) throw new Error('reply lost after arming');
    }
    if (body.patternId === 'bench-warm') {
      status.currentPatternId = 'bench-warm';
      state.zones.forEach(zone => { zone.patternId = 'warm-white'; zone.blackout = false; });
    } else if (body.zone && body.patternId) {
      state.zones.find(zone => zone.id === body.zone).patternId = body.patternId;
      status.currentPatternId = '';
    }
    if (body.zone && 'blackout' in body) state.zones.find(zone => zone.id === body.zone).blackout = body.blackout;
    if ('syncZones' in body) state.syncZones = body.syncZones;
  };
  await auditionBenchPattern({ layout, confirmedPins: [16], pin: 16, patternId: 'fire',
    readZones: async () => structuredClone(state), readStatus: async () => structuredClone(status), postControl });
  assert.equal(state.zones[0].blackout, false);
  assert.equal(await restoreBenchPatternSnapshot({ layout, baseline,
    readZones: async () => structuredClone(state), readStatus: async () => structuredClone(status), postControl }), true);
  assert.deepEqual(state, { syncZones: baseline.syncZones, zones: baseline.zones });
  assert.equal(status.currentPatternId, 'bench-warm');
  assert.deepEqual(status.nativeArmedZones, []);
  assert(posts.some(body => body.patternId === 'bench-warm'));
});

test('Stop rearming a missing original arm restores the original zone blackout', async () => {
  const state = { ...zones(), zones: zones().zones.map(zone => ({ ...zone,
    blackout: zone.id === 'bench-16' })) };
  const baseline = { ...structuredClone(state), nativeArmedZones: ['bench-16'],
    nativeFadeScale: 1, blackout: false, currentPatternId: 'bench-warm', playlistPlaying: false };
  const status = { nativeArmedZones: [], nativeFadeScale: 0, streaming: false,
    blackout: false, currentPatternId: 'bench-warm', playlist: { playing: false } };
  const posts = [];
  const postControl = async body => {
    posts.push(body);
    if (body.armNative === true) {
      status.nativeArmedZones = [body.zone];
      status.nativeFadeScale = 1;
      state.zones.find(zone => zone.id === body.zone).blackout = false;
    }
    if (body.zone && typeof body.blackout === 'boolean') {
      state.zones.find(zone => zone.id === body.zone).blackout = body.blackout;
    }
  };
  assert.equal(await restoreBenchPatternSnapshot({ layout, baseline,
    readZones: async () => structuredClone(state), readStatus: async () => structuredClone(status), postControl }), true);
  assert.deepEqual(posts, [{ zone: 'bench-16', armNative: true },
    { zone: 'bench-16', syncZones: false, blackout: true }]);
});

test('old firmware or active playlist refuses Bench audition before any card write', async () => {
  for (const status of [
    { nativeRenderArmSupported: false, streaming: false },
    { nativeRenderArmSupported: true, streaming: false, provisionalSetup: true,
      outputReady: true, maxMilliamps: 2000, maxMilliampsSource: 'config',
      playlist: { playing: true } },
  ]) {
    const posts = [];
    await assert.rejects(auditionBenchPattern({ layout, confirmedPins: [16], pin: 16,
      patternId: 'fire', readZones: async () => zones(), readStatus: async () => status,
      postControl: async body => posts.push(body) }), /update|playlist/i);
    assert.deepEqual(posts, []);
  }
});

test('final install rejects same total pixels on a wrong GPIO zone', () => {
  const config = {
    piece: { id: 'piece' }, projectRevision: 5, projectFingerprint: 'abc', startupPatternId: 'combo',
    led: { outputs: [{ id: 'out1', pin: 16, pixels: 30 }, { id: 'out2', pin: 17, pixels: 20 }] },
    zones: [{ id: 'left', patternId: 'fire', ranges: [{ start: 0, count: 30 }] },
      { id: 'right', patternId: 'ocean', ranges: [{ start: 30, count: 20 }] }],
    looks: [{ id: 'combo', mode: 'combo', zones: [{ id: 'left', patternId: 'fire' }, { id: 'right', patternId: 'ocean' }] }],
  };
  const status = { cardId: 'card', projectId: 'piece', projectRevision: 5, projectFingerprint: 'abc', startupPatternId: 'combo',
    provisionalSetup: false, outputs: [{ id: 'out1', pin: 16, pixels: 30 }, { id: 'out2', pin: 17, pixels: 20 }] };
  const expectedZones = { zones: structuredClone(config.zones) };
  const patterns = { currentId: 'combo', startupPatternId: 'combo',
    playlist: { enabled: false, fadeMs: 0, entries: [] }, patterns: structuredClone(config.looks) };
  const wiring = { state: 'known-good', hasCandidate: false, activationId: '', cardId: 'card' };
  assert.equal(requireBenchInstallReadback(config, status, expectedZones, 'card', patterns, wiring), true);
  assert.throws(() => requireBenchInstallReadback(config, status, expectedZones, 'card', patterns,
    { ...wiring, state: 'testing', hasCandidate: true, activationId: 'pending' }), /known-good/i);
  assert.throws(() => requireBenchInstallReadback(config,
    { ...status, outputs: [...status.outputs].reverse() }, expectedZones, 'card', patterns, wiring), /GPIO output readback/i);
  const wrongStoredLook = structuredClone(patterns);
  wrongStoredLook.patterns[0].brightness = 0.8;
  config.looks[0].brightness = 0.25;
  assert.throws(() => requireBenchInstallReadback(config, status, expectedZones, 'card', wrongStoredLook, wiring), /saved look definition/i);
  delete config.looks[0].brightness;
  assert.throws(() => requireBenchInstallReadback(config, status, expectedZones, 'card',
    { ...patterns, startupPatternId: 'other' }, wiring), /startup look/i);
  assert.throws(() => requireBenchInstallReadback(config, status, expectedZones, 'card',
    { ...patterns, playlist: { enabled: true, fadeMs: 0, entries: [] } }, wiring), /saved playlist/i);
  expectedZones.zones[1].ranges = [{ start: 29, count: 21 }];
  assert.throws(() => requireBenchInstallReadback(config, status, expectedZones, 'card', patterns, wiring), /section readback/i);
});

test('enabled playlist may advance without losing the saved startup and zone mapping proof', () => {
  const config = {
    piece: { id: 'piece' }, projectRevision: 5, projectFingerprint: 'abc', startupPatternId: 'combo',
    led: { outputs: [{ id: 'out1', pin: 16, pixels: 30 }] },
    zones: [{ id: 'left', patternId: 'fire', ranges: [{ start: 0, count: 30 }] }],
    looks: [{ id: 'combo', mode: 'combo', zones: [{ id: 'left', patternId: 'fire' }] },
      { id: 'night', mode: 'combo', zones: [{ id: 'left', patternId: 'ocean' }] }],
    playlist: { enabled: true, fadeMs: 500, entries: [{ patternId: 'combo', dwellSeconds: 1 },
      { patternId: 'night', dwellSeconds: 1 }] },
  };
  const status = { cardId: 'card', projectId: 'piece', projectRevision: 5,
    projectFingerprint: 'abc', provisionalSetup: false, outputs: config.led.outputs,
    playlist: { playing: true, patternId: 'night' } };
  const zones = { zones: [{ ...config.zones[0], patternId: 'ocean' }] };
  const patterns = { currentId: 'night', startupPatternId: 'combo',
    playlist: structuredClone(config.playlist), patterns: structuredClone(config.looks) };
  const wiring = { state: 'known-good', hasCandidate: false, activationId: '', cardId: 'card' };
  assert.equal(requireBenchInstallReadback(config, status, zones, 'card', patterns, wiring), true);
  assert.throws(() => requireBenchInstallReadback(config, status, zones, 'card',
    { ...patterns, playlist: { ...patterns.playlist, entries: [{ patternId: 'wrong', dwellSeconds: 1 }] } }, wiring),
  /saved playlist/i);
});
