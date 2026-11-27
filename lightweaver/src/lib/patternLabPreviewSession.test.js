import test from 'node:test';
import assert from 'node:assert/strict';

import { createPatternLabPreviewSession } from './patternLabPreviewSession.js';

function harness({ snapshot = { syncZones: false, zones: [{ id: 'outer', patternId: 'ocean', brightness: 0.4, customBreathe: true, breatheLowerPct: 73, breatheUpperPct: 92, breatheCycleSeconds: 16, driftHueMin: 9, driftHueMax: 177 }] }, snapshotError = null } = {}) {
  const calls = [];
  let health = null;
  let active = false;
  const stream = {
    start() { calls.push('stream:start'); active = true; return true; },
    push(frame) { calls.push(['stream:push', frame]); return active; },
    async stop() { calls.push('stream:stop'); active = false; },
    isActive() { return active; },
  };
  const session = createPatternLabPreviewSession({
    fallbackLook: { patternId: 'warm-white', brightness: 0.5 },
    readSnapshot: async () => {
      calls.push('snapshot');
      if (snapshotError) throw snapshotError;
      return snapshot;
    },
    createStream: options => { health = options.onHealth; calls.push('stream:create'); return stream; },
    restoreLook: async look => { calls.push(['restore:look', look]); },
    resetOutput: async look => { calls.push(['restore:fallback', look]); },
  });
  return { calls, session, emitHealth(value) { health?.(value); } };
}

test('does not touch hardware until explicitly started', () => {
  const { calls, session } = harness();
  assert.equal(session.status().state, 'idle');
  assert.deepEqual(calls, []);
});

test('snapshots first, starts the shared stream, and accepts RGB frames', async () => {
  const { calls, session } = harness();
  await session.start(['010203']);
  session.push(['AABBCC']);
  assert.deepEqual(calls, [
    'snapshot',
    'stream:create',
    'stream:start',
    ['stream:push', ['010203']],
    ['stream:push', ['AABBCC']],
  ]);
  assert.equal(session.status().state, 'live');
});

test('stop cancels streaming before restoring every snapshotted zone', async () => {
  const { calls, session } = harness();
  await session.start(['010203']);
  await session.stop('user');
  const stopIndex = calls.indexOf('stream:stop');
  const restoreIndex = calls.findIndex(call => Array.isArray(call) && call[0] === 'restore:look');
  assert.ok(stopIndex >= 0 && restoreIndex > stopIndex);
  assert.deepEqual(calls[restoreIndex][1], {
    patternId: 'ocean', brightness: 0.4, customBreathe: true,
    breatheLowerPct: 73, breatheUpperPct: 92, breatheCycleSeconds: 16,
    driftHueMin: 9, driftHueMax: 177,
    zone: 'outer', syncZones: false,
  });
  assert.equal(session.status().state, 'restored');
});

test('missing snapshots use the safe project fallback after stream cancellation', async () => {
  const { calls, session } = harness({ snapshotError: new Error('offline') });
  await session.start(['010203']);
  await session.stop('unmount');
  assert.deepEqual(calls.slice(-2), [
    'stream:stop',
    ['restore:fallback', { patternId: 'warm-white', brightness: 0.5 }],
  ]);
});

test('generic stream failures trigger exactly one rollback even without a reason code', async () => {
  const { calls, session, emitHealth } = harness();
  await session.start(['010203']);
  emitHealth({ active: true, delivered: false, lastError: new Error('wire failed') });
  emitHealth({ active: true, delivered: false, lastError: new Error('wire failed') });
  await session.whenSettled();
  assert.equal(calls.filter(call => call === 'stream:stop').length, 1);
  assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'restore:look').length, 1);
  assert.equal(session.status().state, 'restored');
});

test('ownership transfers yield without sending a restore that would cancel the new owner', async () => {
  for (const reason of ['stream-superseded', 'stream-reclaimed']) {
    const { calls, session, emitHealth } = harness();
    await session.start(['010203']);
    emitHealth({ active: false, delivered: false, reason });
    await session.whenSettled();
    assert.equal(calls.filter(call => call === 'stream:stop').length, 1, reason);
    assert.equal(calls.filter(call => Array.isArray(call) && call[0].startsWith('restore:')).length, 0, reason);
    assert.equal(session.status().state, 'superseded', reason);
  }
});

test('a synchronized snapshot restores one broadcast look with the original sync state', async () => {
  const { calls, session } = harness({ snapshot: {
    syncZones: true,
    zones: [
      { id: 'outer', patternId: 'aurora', brightness: 0.6 },
      { id: 'inner', patternId: 'aurora', brightness: 0.6 },
    ],
  } });
  await session.start(['010203']);
  await session.stop();
  const restores = calls.filter(call => Array.isArray(call) && call[0] === 'restore:look');
  assert.deepEqual(restores, [['restore:look', { patternId: 'aurora', brightness: 0.6, syncZones: true }]]);
});

test('start failure rolls back and rejects without leaving a live session', async () => {
  const calls = [];
  const session = createPatternLabPreviewSession({
    readSnapshot: async () => ({ currentId: 'aurora', zones: [] }),
    createStream: () => ({
      start() { throw new Error('cannot start'); },
      push() {},
      async stop() { calls.push('stop'); },
    }),
    restoreLook: async look => { calls.push(['restore', look]); },
    resetOutput: async () => { calls.push('fallback'); },
  });
  await assert.rejects(session.start(['010203']), /cannot start/);
  assert.deepEqual(calls, ['stop', ['restore', { patternId: 'aurora', syncZones: true }]]);
  assert.equal(session.status().state, 'error');
  assert.equal(session.status().restored, true);
});

test('reports restoration failure without claiming that the prior look was restored', async () => {
  const session = createPatternLabPreviewSession({
    readSnapshot: async () => ({ syncZones: false, zones: [{ id: 'all', patternId: 'aurora' }] }),
    createStream: () => ({ start: () => true, push() {}, async stop() {} }),
    restoreLook: async () => { throw new Error('restore rejected'); },
  });
  await session.start(['010203']);
  await assert.rejects(session.stop(), /restore rejected/);
  assert.equal(session.status().state, 'error');
  assert.equal(session.status().restored, false);
});

test('concurrent stop requests share one cancellation and restore transaction', async () => {
  const { calls, session } = harness();
  await session.start(['010203']);
  await Promise.all([session.stop('user'), session.stop('unmount'), session.stop('user')]);
  assert.equal(calls.filter(call => call === 'stream:stop').length, 1);
  assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'restore:look').length, 1);
});

test('stop while snapshot is pending prevents a stale session starting or restoring over its successor', async () => {
  let finishSnapshot;
  const calls = [];
  const session = createPatternLabPreviewSession({
    readSnapshot: () => new Promise(resolve => { finishSnapshot = resolve; }),
    createStream: () => { calls.push('create'); return { start() {}, push() {}, stop() {} }; },
    resetOutput: async () => calls.push('reset'),
    restoreLook: async () => calls.push('restore'),
  });
  const starting = session.start(['FF0000']);
  await session.stop('switched');
  finishSnapshot({ currentId: 'aurora' });
  assert.equal(await starting, false);
  assert.deepEqual(calls, []);
  assert.equal(session.status().active, false);
});

for (const loseFirstReadback of [false, true]) {
  test(`Stop waits for an accepted native preview with ${loseFirstReadback ? 'failed' : 'pending'} readback`, async () => {
    const initialZones = [{ id: 'all', patternId: 'fire', brightness: 0.91 }];
    let pattern = 'fire';
    let zones = structuredClone(initialZones);
    let finishReadback;
    let readbackStarted;
    const reading = new Promise(resolve => { readbackStarted = resolve; });
    let blockFirstReadback = false;
    const commands = [];
    const session = createPatternLabPreviewSession({
      nativeLook: { patternId: 'aurora', brightness: 1 },
      readStatus: async () => {
        if (blockFirstReadback) {
          blockFirstReadback = false;
          await new Promise((resolve, reject) => {
            finishReadback = () => loseFirstReadback ? reject(new Error('lost native readback')) : resolve();
            readbackStarted();
          });
        }
        return { cardId: 'card', currentLookId: pattern, currentLookIndex: 0, streaming: false };
      },
      readZones: async () => ({ syncZones: true, zones: structuredClone(zones) }),
      restoreLook: async () => {
        pattern = 'aurora';
        zones = [{
          id: 'all', patternId: 'aurora', brightness: 1, speed: 1, hueShift: 0,
          customHue: 32, customSaturation: 230, customBreathe: false,
          breatheLowerPct: 85, breatheUpperPct: 100, breatheCycleSeconds: 9, customDrift: false,
        }];
        blockFirstReadback = true;
        return { ok: true, appliedPatternId: 'aurora' };
      },
      postControl: async command => {
        commands.push(command);
        if (command.patternId === 'fire') {
          pattern = 'fire';
          zones = structuredClone(initialZones);
        }
        return { ok: true };
      },
    });
    const starting = session.start().catch(error => error);
    await reading;
    const stopping = session.stop();
    assert.equal(session.status().state, 'stopping');
    assert.deepEqual(commands, []);
    finishReadback();
    await starting;
    assert.deepEqual(await stopping, { reason: 'user', restored: true });
    assert.deepEqual(commands, [{ patternId: 'fire', syncZones: true }]);
    assert.equal(session.status().active, false);
    assert.equal(session.status().restored, true);
    assert.equal(session.status().state, 'restored');
  });
}

test('a changed discovery address keeps the paired card but changing the pairing fences Stop', async () => {
  const previousWindow = globalThis.window;
  const storage = new Map([
    ['lw_card_host', 'lightweaver.local'],
    ['lw_card_identity_v1', JSON.stringify({ version: 1, id: 'card' })],
  ]);
  globalThis.window = { location: { protocol: 'http:' }, localStorage: { getItem: name => storage.get(name) } };
  try {
    for (const replaceCard of [false, true]) {
      let streaming = false;
      const writes = [];
      const session = createPatternLabPreviewSession({
        host: 'lightweaver.local',
        readStatus: async () => ({ cardId: 'card', currentLookId: 'fire', streaming }),
        readZones: async () => ({ syncZones: false, zones: [{ id: 'all', patternId: 'fire' }] }),
        createStream: () => ({
          start() { streaming = true; return true; },
          async stop({ cancel }) { await cancel(() => true); },
        }),
        postControl: async (body, { host }) => {
          writes.push({ host, body });
          streaming = false;
          return { ok: true };
        },
      });
      await session.start();
      storage.set('lw_card_host', '192.168.18.70');
      if (replaceCard) storage.set('lw_card_identity_v1', JSON.stringify({ version: 1, id: 'another-card' }));
      await session.stop();
      assert.deepEqual(writes, replaceCard ? [] : [{ host: 'lightweaver.local', body: { cancelStream: true } }]);
      assert.equal(session.status().state, replaceCard ? 'superseded' : 'restored');
      storage.set('lw_card_host', 'lightweaver.local');
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('an installed look is reselected once when releasing an unlinked stream does not resume local output', async () => {
  const writes = [];
  const zones = [
    { id: 'outer', patternId: 'fire' },
    { id: 'inner', patternId: 'fire' },
  ];
  let streaming = false;
  let outputSource = 'local';
  const session = createPatternLabPreviewSession({
    readStatus: async () => ({
      cardId: 'card', currentLookId: 'evening', currentLookIndex: 0,
      streaming, lwOutput: { sourceClass: outputSource },
    }),
    readZones: async () => ({ syncZones: false, zones }),
    createStream: () => ({
      start() { streaming = true; outputSource = 'external'; return true; },
      push() { return true; },
      async stop({ cancel }) { await cancel(() => true); },
    }),
    postControl: async command => {
      writes.push(command);
      if (command.cancelStream) streaming = false;
      if (command.patternId === 'evening') outputSource = 'local';
      return { ok: true };
    },
  });

  await session.start(['010203']);
  assert.deepEqual(await session.stop(), { reason: 'user', restored: true });
  assert.deepEqual(writes, [{ cancelStream: true }, { patternId: 'evening', syncZones: false }]);
  assert.equal(session.status().state, 'restored');
});
