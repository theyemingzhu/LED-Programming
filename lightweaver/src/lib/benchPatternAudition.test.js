import test from 'node:test';
import assert from 'node:assert/strict';
import { auditionBenchPattern, benchZoneIdForPin, requireBenchInstallReadback, restoreBenchPatternSnapshot } from './benchPatternAudition.js';

const layout = [{ pin: 16, start: 0, count: 30 }, { pin: 17, start: 30, count: 20 }];
const zones = () => ({ zones: [
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
    readZones: async () => ({ zones: structuredClone(state.zones).reverse() }),
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
  const patterns = { currentId: 'combo', patterns: structuredClone(config.looks) };
  const wiring = { state: 'known-good', hasCandidate: false, activationId: '', cardId: 'card' };
  assert.equal(requireBenchInstallReadback(config, status, expectedZones, 'card', patterns, wiring), true);
  assert.throws(() => requireBenchInstallReadback(config, status, expectedZones, 'card', patterns,
    { ...wiring, state: 'testing', hasCandidate: true, activationId: 'pending' }), /known-good/i);
  assert.throws(() => requireBenchInstallReadback(config,
    { ...status, outputs: [...status.outputs].reverse() }, expectedZones, 'card', patterns, wiring), /GPIO output readback/i);
  expectedZones.zones[1].ranges = [{ start: 29, count: 21 }];
  assert.throws(() => requireBenchInstallReadback(config, status, expectedZones, 'card', patterns, wiring), /section readback/i);
});
