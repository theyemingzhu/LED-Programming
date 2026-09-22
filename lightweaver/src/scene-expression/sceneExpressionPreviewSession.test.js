import assert from 'node:assert/strict';
import test from 'node:test';
import { createSceneExpressionPreviewSession } from './sceneExpressionPreviewSession.js';

const FRAME = ['AA0000', '00BB00', '0000CC'];
const readyStatus = (playlist = {}) => ({
  cardId: 'lw-aabbccddeeff', runtimePhase: 'ready', knownGoodProject: true,
  commandReady: true, outputReady: true, playbackReady: true, streaming: false,
  playlist: { configured: true, playing: false, entryIndex: 1, entryCount: 3, patternId: 'ocean', ...playlist },
});

function harness({ status = readyStatus(), after = null, current = () => true } = {}) {
  const calls = [];
  let health = null;
  const stream = {
    start: () => (calls.push(['stream-start']), true),
    push: frame => (calls.push(['frame', frame]), true),
    stop: async () => { calls.push(['cancel']); },
  };
  const session = createSceneExpressionPreviewSession({
    expectedCardId: 'lw-aabbccddeeff', host: '192.168.1.9', authority: {},
    readSnapshot: async () => ({ status, zones: [{ id: 'all', patternId: 'ocean' }] }),
    readStatus: async () => after || status,
    createStream: options => { health = options.onHealth; return stream; },
    restorePattern: async look => { calls.push(['look', look]); },
    controlPlaylist: async verb => { calls.push(['playlist', verb]); },
    validateCurrent: current,
  });
  return { session, calls, health: value => health(value) };
}

test('requires an exact frame and complete preflight snapshot before creating a stream', async () => {
  const invalid = harness();
  await assert.rejects(invalid.session.start([]), error => error.reason === 'invalid-preview-frame');
  assert.deepEqual(invalid.calls, []);

  const missing = harness({ status: { ...readyStatus(), playlist: { configured: true } } });
  await assert.rejects(missing.session.start(FRAME), error => error.reason === 'playlist-snapshot-unavailable');
  assert.deepEqual(missing.calls, []);
});

test('starts only after the explicit start call and streams the whole mapped frame', async () => {
  const { session, calls } = harness();
  assert.deepEqual(calls, []);
  await session.start(FRAME);
  assert.deepEqual(calls, [['stream-start'], ['frame', FRAME]]);
  assert.equal(session.push(['FFFFFF', '000000', '123456']), true);
  assert.deepEqual(calls.at(-1), ['frame', ['FFFFFF', '000000', '123456']]);
});

test('stop cancels first and avoids look writes when the playlist already matches', async () => {
  const { session, calls } = harness();
  await session.start(FRAME);
  const result = await session.stop('user');
  assert.equal(result.restored, true);
  assert.deepEqual(calls.slice(2), [['cancel']]);
  assert.equal(session.status().state, 'restored');
});

for (const playing of [false, true]) {
  test(`restores and verifies a ${playing ? 'playing' : 'paused'} playlist after cancel`, async () => {
    const before = readyStatus({ playing, entryIndex: 1, patternId: 'ocean' });
    let reads = 0;
    const calls = [];
    const session = createSceneExpressionPreviewSession({
      expectedCardId: before.cardId, authority: {},
      readSnapshot: async () => ({ status: before, zones: [] }),
      readStatus: async () => (++reads === 1
        ? readyStatus({ playing: true, entryIndex: 2, patternId: 'fire' })
        : before),
      createStream: () => ({ start: () => true, push: () => true, stop: async () => calls.push('cancel') }),
      restorePattern: async look => calls.push(['look', look.patternId]),
      controlPlaylist: async verb => calls.push(['playlist', verb]),
    });
    await session.start(FRAME);
    const result = await session.stop();
    assert.equal(result.restored, true);
    assert.deepEqual(calls, ['cancel', ['look', 'ocean'], ['playlist', playing ? 'play' : 'pause']]);
  });
}

test('ownership transfer stops locally without cancelling or restoring the new owner', async () => {
  const { session, calls, health } = harness();
  await session.start(FRAME);
  health({ delivered: false, reason: 'stream-superseded' });
  const result = await session.whenSettled();
  assert.equal(result.ownershipTransferred, true);
  assert.equal(session.status().state, 'superseded');
  assert.deepEqual(calls.slice(2), [['cancel']]);
  assert.equal(calls.some(call => call[0] === 'look'), false);
});

test('a changed context prevents every restore write and keeps an error visible', async () => {
  let valid = true;
  const { session, calls } = harness({ current: () => valid });
  await session.start(FRAME);
  valid = false;
  const result = await session.stop('navigation');
  assert.equal(result.restored, false);
  assert.equal(result.error.reason, 'preview-context-changed');
  assert.equal(session.status().state, 'error');
  assert.equal(calls.some(call => call[0] === 'look' || call[0] === 'playlist'), false);
});

test('failed restoration is reported until exact readback succeeds', async () => {
  const before = readyStatus({ playing: false, entryIndex: 1, patternId: 'ocean' });
  const after = readyStatus({ playing: true, entryIndex: 2, patternId: 'fire' });
  const { session } = harness({ status: before, after });
  await session.start(FRAME);
  const result = await session.stop();
  assert.equal(result.restored, false);
  assert.equal(result.error.reason, 'playlist-restore-unverified');
  assert.equal(session.status().state, 'error');
});
