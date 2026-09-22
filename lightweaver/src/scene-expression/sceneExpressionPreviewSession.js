import { createCardFrameStream } from '../lib/cardFrameStream.js';
import { postPlaylistControlToCard, pushLivePreviewToCard } from '../lib/cardLiveControl.js';

function previewError(reason, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.reason = reason;
  return error;
}

function normalizedCardId(value) {
  return String(value || '').trim().toLowerCase();
}

function snapshotPlaylist(status) {
  const playlist = status?.playlist;
  if (!playlist || typeof playlist.configured !== 'boolean' || typeof playlist.playing !== 'boolean') {
    throw previewError('playlist-snapshot-unavailable', 'The card did not report a complete playlist state. Physical preview was not started.');
  }
  const snapshot = {
    configured: playlist.configured,
    playing: playlist.playing,
    entryIndex: Number(playlist.entryIndex),
    entryCount: Number(playlist.entryCount),
    patternId: String(playlist.patternId || '').trim(),
  };
  if (snapshot.configured && (
    !Number.isInteger(snapshot.entryIndex)
    || !Number.isInteger(snapshot.entryCount)
    || snapshot.entryCount < 1
    || snapshot.entryIndex < 0
    || snapshot.entryIndex >= snapshot.entryCount
    || !snapshot.patternId
  )) {
    throw previewError('playlist-snapshot-unavailable', 'The card playlist position could not be captured exactly. Physical preview was not started.');
  }
  return snapshot;
}

function assertReadySnapshot(snapshot, expectedCardId) {
  const status = snapshot?.status;
  if (!status || !Array.isArray(snapshot?.zones)) {
    throw previewError('card-snapshot-unavailable', 'The card state could not be captured exactly. Physical preview was not started.');
  }
  if (!expectedCardId || normalizedCardId(status.cardId) !== normalizedCardId(expectedCardId)) {
    throw previewError('card-identity-changed', 'The connected card identity changed before physical preview could start.');
  }
  const ready = status.runtimePhase === 'ready'
    && status.knownGoodProject === true
    && status.commandReady === true
    && status.outputReady === true
    && status.playbackReady === true;
  if (!ready) {
    throw previewError('card-not-ready', 'The connected card is not ready for an exact physical preview.');
  }
  if (status.streaming === true) {
    throw previewError('card-already-streaming', 'Another physical preview already owns the connected card.');
  }
  return { status, zones: structuredClone(snapshot.zones), playlist: snapshotPlaylist(status) };
}

function playlistMatches(actualStatus, expected) {
  const actual = actualStatus?.playlist;
  if (!actual || actual.configured !== expected.configured || actual.playing !== expected.playing) return false;
  if (!expected.configured) return true;
  return Number(actual.entryIndex) === expected.entryIndex
    && Number(actual.entryCount) === expected.entryCount
    && String(actual.patternId || '').trim() === expected.patternId;
}

function validFrame(frame) {
  return Array.isArray(frame)
    && frame.length > 0
    && frame.every(pixel => typeof pixel === 'string' && /^[0-9A-F]{6}$/.test(pixel));
}

export function createSceneExpressionPreviewSession({
  expectedCardId,
  host = '',
  transport = null,
  authority = null,
  fps = 18,
  readSnapshot = async () => ({
    status: await authority.request('/api/status'),
    zones: await authority.request('/api/zones'),
  }),
  readStatus = () => authority.request('/api/status'),
  createStream = options => createCardFrameStream(options),
  restorePattern = (look, options) => pushLivePreviewToCard(look, options),
  controlPlaylist = (verb, options) => postPlaylistControlToCard(verb, options),
  validateCurrent = () => true,
  onStateChange = null,
} = {}) {
  let state = 'idle';
  let stream = null;
  let snapshot = null;
  let lastError = null;
  let restored = null;
  let delivered = false;
  let stoppingPromise = null;
  let ownershipTransferred = false;

  function emit(next) {
    state = next;
    try { onStateChange?.({ state, active: state === 'live', error: lastError, restored, delivered }); } catch {}
  }

  function currentOrThrow() {
    if (validateCurrent() !== true) {
      throw previewError('preview-context-changed', 'The project, card, or physical mapping changed during preview. The previous card state was not written to a different context.');
    }
  }

  async function verifyIdentityAndReadStatus() {
    currentOrThrow();
    const status = await readStatus({ host, authority });
    currentOrThrow();
    if (normalizedCardId(status?.cardId) !== normalizedCardId(expectedCardId)) {
      throw previewError('card-identity-changed', 'The connected card changed during preview. The previous card state was not written to the new card.');
    }
    return status;
  }

  async function restoreAfterCancel() {
    let status = await verifyIdentityAndReadStatus();
    if (playlistMatches(status, snapshot.playlist)) return true;
    if (!snapshot.playlist.configured) {
      throw previewError('playlist-restore-unverified', 'The card playlist changed during preview and its previous unconfigured state could not be restored safely.');
    }
    currentOrThrow();
    await restorePattern({ patternId: snapshot.playlist.patternId, syncZones: true }, {
      host, authority, latestOnly: false,
    });
    currentOrThrow();
    await controlPlaylist(snapshot.playlist.playing ? 'play' : 'pause', { host, authority });
    status = await verifyIdentityAndReadStatus();
    if (!playlistMatches(status, snapshot.playlist)) {
      throw previewError('playlist-restore-unverified', 'The card answered, but its previous playlist state was not restored exactly.');
    }
    return true;
  }

  async function stop(reason = 'user') {
    if (stoppingPromise) return stoppingPromise;
    if (!stream) return { reason, restored: state === 'restored', ownershipTransferred };
    stoppingPromise = (async () => {
      emit('stopping');
      try {
        await stream.stop();
        stream = null;
        if (ownershipTransferred) {
          restored = null;
          emit('superseded');
          return { reason, restored: false, ownershipTransferred: true };
        }
        restored = await restoreAfterCancel();
        emit('restored');
        return { reason, restored: true, ownershipTransferred: false };
      } catch (error) {
        stream = null;
        lastError = error;
        restored = false;
        emit('error');
        return { reason, restored: false, ownershipTransferred: false, error };
      }
    })();
    return stoppingPromise;
  }

  function onHealth(health) {
    if (state !== 'live') return;
    if (health?.delivered === true) {
      delivered = true;
      emit('live');
      return;
    }
    if (health?.delivered !== false) return;
    lastError = health.lastError || previewError(health.reason || 'delivery-failed', 'The physical preview frame did not reach the card.');
    if (health.reason === 'stream-superseded' || health.reason === 'stream-reclaimed') ownershipTransferred = true;
    void stop(health.reason || 'delivery-failed');
  }

  return {
    async start(initialFrame) {
      if (state !== 'idle') throw previewError('preview-already-started', 'This physical preview session has already started.');
      if (!validFrame(initialFrame)) throw previewError('invalid-preview-frame', 'An exact complete preview frame is required before physical preview can start.');
      emit('starting');
      try {
        currentOrThrow();
        snapshot = assertReadySnapshot(await readSnapshot({ host, authority }), expectedCardId);
        currentOrThrow();
        stream = createStream({ host, transport, authority, fps, canSendFrame: validateCurrent, onHealth });
        if (stream.start() === false) throw previewError('stream-start-failed', 'The physical preview stream could not start.');
        if (stream.push(initialFrame) !== true) throw previewError('stream-frame-rejected', 'The exact preview frame could not be queued for the card.');
        emit('live');
        return true;
      } catch (error) {
        lastError = error;
        if (stream) await stream.stop().catch(() => {});
        stream = null;
        restored = snapshot ? false : null;
        emit('error');
        throw error;
      }
    },
    push(frame) {
      if (state !== 'live' || !validFrame(frame) || validateCurrent() !== true) return false;
      return stream?.push(frame) === true;
    },
    stop,
    whenSettled() { return stoppingPromise || Promise.resolve(); },
    status() { return { state, active: state === 'live', delivered, restored, error: lastError, ownershipTransferred }; },
  };
}

