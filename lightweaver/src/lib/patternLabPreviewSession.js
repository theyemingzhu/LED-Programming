import { createCardFrameStream } from './cardFrameStream.js';
import {
  buildLivePreviewControlPayload,
  postPreviewRestoreControl,
  pushLivePreviewToCard,
  readCardZonesFromCard,
  resetLiveOutputOnCard,
  zoneConfirmsLivePreviewIntent,
} from './cardLiveControl.js';
import { CUSTOMER_CONTROL_WIRE_FIELDS } from './cardCustomerControlContract.js';
import { getActiveCardTransportAuthority } from './cardTransport.js';
import { readPersistedCardIdentity } from './cardIdentity.js';
import { getCardBridgeState } from './cardBridge.js';
import { canPushDirectlyToCard, normalizeCardHost, readStoredCardHost } from './cardConnection.js';
import { readCardStatusEnvelope } from './cardPushClient.js';
import { readStudioStripProfile } from './patternLabPreviewCalibration.js';

const RESTORE_FIELDS = [
  'patternId',
  'brightness',
  'speed',
  'hueShift',
  'customHue',
  'customSaturation',
  'customBreathe',
  'breatheLowerPct',
  'breatheUpperPct',
  'breatheCycleSeconds',
  'customDrift',
  'driftHueMin',
  'driftHueMax',
  'blackout',
];

function restoreLookFromZone(zone) {
  const look = {};
  for (const field of RESTORE_FIELDS) {
    if (Object.hasOwn(zone, field)) look[field] = zone[field];
  }
  return { ...look, zone: String(zone.id), syncZones: false };
}

function snapshotLooks(snapshot) {
  if (Array.isArray(snapshot?.zones) && snapshot.zones.length) {
    const looks = snapshot.zones
      .filter(zone => zone && String(zone.id || '').trim())
      .map(restoreLookFromZone);
    if (snapshot.syncZones === true && looks.length) {
      const { zone: _zone, ...first } = looks[0];
      return [{ ...first, syncZones: true }];
    }
    return looks;
  }
  const currentId = String(snapshot?.currentId || snapshot?.patternId || '').trim();
  return currentId ? [{ patternId: currentId, syncZones: true }] : [];
}

const CONTEXT_FIELDS = [
  'cardId', 'bootId', 'projectId', 'projectRevision', 'projectFingerprint',
  'projectHead', 'wiringRevision', 'wiringDigest',
];
const TUNING_FIELDS = ['brightnessScale', 'speedScale', 'hueOffset'];
const PLAYLIST_FIELDS = ['configured', 'playing', 'entryIndex', 'entryCount', 'patternId'];
const OUTPUT_SETTLE_MS = 80;
const OUTPUT_SETTLE_ATTEMPTS = 5;

function sameFields(a, b, fields) {
  return fields.every(field => a?.[field] === b?.[field]);
}

function lookId(status) {
  return String(status?.currentLookId || status?.currentPatternId || '').trim();
}

function sameZones(before, after) {
  return before.syncZones === after.syncZones && before.blackout === after.blackout
    && before.zones.length === after.zones?.length
    && before.zones.every(zone => {
      const actual = after.zones.find(candidate => candidate.id === zone.id);
      return actual && sameFields(zone, actual, RESTORE_FIELDS);
    });
}

function localOutput(status) {
  return status.streaming === false && status.frameSource !== 'artnet'
    && status.lwOutput?.sourceClass !== 'external'
    && status.ok !== false && status.commandReady !== false && status.outputReady !== false;
}

function outputMatches(before, after) {
  const original = before.status.lwOutput;
  const actual = after.status.lwOutput;
  return localOutput(after.status)
    && sameFields(original, actual, ['gammaEnabled', 'gammaValue'])
    && sameFields(original?.calibration, actual?.calibration, ['red', 'green', 'blue']);
}

function samePlayback(before, after) {
  return lookId(before.status) === lookId(after.status)
    && sameFields(before.status.playlist, after.status.playlist, PLAYLIST_FIELDS)
    && sameZones(before, after)
    && (after.status.streaming || sameFields(before.lookTuning?.live, after.lookTuning?.live, TUNING_FIELDS));
}

function superseded(message) {
  return Object.assign(new Error(message), { reason: 'preview-playback-changed' });
}

async function readStatusForPreview({ host, authority }) {
  if (authority) return authority.request('/api/status', { signal: AbortSignal.timeout(1800) });
  const bridge = getCardBridgeState();
  const transport = bridge?.verified && bridge?.connected && normalizeCardHost(bridge.host) === normalizeCardHost(host)
    ? 'bridge' : undefined;
  return readCardStatusEnvelope({ host, transport, timeoutMs: 1800 });
}

function sessionAuthority(host) {
  const candidate = getActiveCardTransportAuthority(host);
  // Local HTTP already has an exact-card direct path. Keep only authorities
  // required for the current transport or for a leased frame stream.
  return !canPushDirectlyToCard() || candidate?.transport === 'local-origin' || candidate?.ownerCapability
    ? candidate : null;
}

function restoreZonePayload(zone, includePattern) {
  return Object.fromEntries(CUSTOMER_CONTROL_WIRE_FIELDS
    .filter(({ control }) => (includePattern || control !== 'patternId') && Object.hasOwn(zone, control))
    .map(({ control, wire }) => [wire, zone[control]]));
}

export function createPatternLabPreviewSession({
  host = readStoredCardHost(),
  fps = 18,
  fallbackLook = {},
  authority = sessionAuthority(host),
  readStatus = readStatusForPreview,
  readZones = readCardZonesFromCard,
  readSnapshot = null,
  postControl = postPreviewRestoreControl,
  validateCurrent = () => true,
  nativeLook = null,
  createStream = options => createCardFrameStream(options),
  restoreLook = (look, options) => pushLivePreviewToCard(look, options),
  resetOutput = (look, options) => resetLiveOutputOnCard(look, options),
  onStateChange = null,
  getColorProfile = readStudioStripProfile,
} = {}) {
  let state = 'idle';
  let stream = null;
  let snapshot = null;
  let snapshotAvailable = false;
  let nativeApplied = null;
  let nativePending = null;
  let nativeAcknowledged = '';
  let ownershipTransferred = false;
  const options = { host: host || readStoredCardHost(), authority, pinTransport: true };
  const selectedCard = readPersistedCardIdentity()?.id;
  const selectedHost = normalizeCardHost(readStoredCardHost());
  const strictSnapshot = !readSnapshot;
  let lastError = null;
  let restored = null;
  let rollbackPromise = null;
  let cancelled = false;
  let delivered = false;

  function setState(next) {
    state = next;
    try { onStateChange?.({ state, active: state === 'live' || state === 'native-look', error: lastError, restored, delivered }); } catch {}
  }

  function currentSelection() {
    if (validateCurrent() !== true || selectedCard !== readPersistedCardIdentity()?.id) return false;
    // Discovery can change the preferred address for the same paired card.
    // The session still reads and writes only its pinned, revalidated address.
    return Boolean(selectedCard) || selectedHost === normalizeCardHost(readStoredCardHost());
  }

  function requireContext(status) {
    if (!currentSelection()) throw superseded('The open project or card connection changed during preview.');
    if ((selectedCard && status.cardId !== selectedCard)
      || (snapshot?.status && !sameFields(snapshot.status, status, CONTEXT_FIELDS))) {
      throw superseded('The card or its installed project changed during preview.');
    }
  }

  async function capture() {
    const status = await readStatus(options);
    requireContext(status);
    const zones = await readZones({ ...options, expectedCardId: status.cardId });
    // Recheck both identity and playback around the zone read, which identifies
    // the underlying renderer and its controls independently of the status ID.
    const after = await readStatus(options);
    requireContext(after);
    if (!status.cardId || !sameFields(status, after, CONTEXT_FIELDS)
      || lookId(status) !== lookId(after) || status.streaming !== after.streaming
      || !sameFields(status.playlist, after.playlist, PLAYLIST_FIELDS)
      || !Array.isArray(zones?.zones) || !zones.zones.length) {
      throw new Error('The card playback could not be captured consistently.');
    }
    return { ...zones, status: after };
  }

  async function command(payload, isCurrent, expectedPlayback = null) {
    const status = await readStatus(options);
    requireContext(status);
    if (expectedPlayback && (lookId(status) !== lookId(expectedPlayback)
      || !sameFields(status.playlist, expectedPlayback.playlist, PLAYLIST_FIELDS) || status.streaming !== expectedPlayback.streaming)) {
      throw superseded('The card playback changed during preview. Its newer playback was left in place.');
    }
    if (!isCurrent()) throw superseded('Another preview took control of the lights.');
    return postControl(payload, {
      ...options,
      expectedCardId: snapshot.status.cardId,
      previewArbitration: { isCurrent: () => isCurrent() && currentSelection() },
    });
  }

  async function readReleasedOutput() {
    let result = await capture();
    requireContext(result.status);
    for (let attempt = 1; attempt < OUTPUT_SETTLE_ATTEMPTS && !localOutput(result.status); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, OUTPUT_SETTLE_MS));
      result = await capture();
    }
    return result;
  }

  async function restorePlayback(current, isCurrent = currentSelection) {
    const write = payload => command(payload, isCurrent, current.status);
    const before = snapshot;
    const named = lookId(before.status);
    const installed = named && Number.isInteger(before.status.currentLookIndex) && before.status.currentLookIndex >= 0;
    if (before.status.playlist?.playing) {
      throw new Error('The active playlist could not be returned to local output.');
    }

    if (named) {
      if (!nativeApplied && !installed) throw new Error('The card did not confirm that its prior output resumed.');
      await write({ patternId: named, syncZones: installed ? before.syncZones : true });
      current = await capture();
      if (lookId(current.status) !== named) throw new Error('The card did not reselect its previous look.');
    }
    if (typeof before.blackout === 'boolean' && before.blackout !== current.blackout) {
      await write({ blackout: before.blackout, syncZones: before.syncZones });
      current = await capture();
    }
    for (const zone of before.zones) {
      const actual = current.zones.find(candidate => candidate.id === zone.id);
      const fields = named ? RESTORE_FIELDS.filter(field => field !== 'patternId') : RESTORE_FIELDS;
      if (named && actual && sameFields(zone, actual, fields)) continue;
      await write({ ...restoreZonePayload(zone, !named), zone: zone.id, syncZones: false });
      if (!named) {
        current = await capture();
        if (current.zones.length > 1 && lookId(current.status)) {
          throw superseded('The card selected a newer look while restoring its zones.');
        }
      }
    }
    current = await capture();
    if (typeof before.syncZones === 'boolean' && before.syncZones !== current.syncZones) {
      await write({ syncZones: before.syncZones });
      current = await capture();
    }
    const changes = Object.fromEntries(TUNING_FIELDS
      .filter(field => before.lookTuning?.live?.[field] !== undefined
        && before.lookTuning.live[field] !== current.lookTuning?.live?.[field])
      .map(field => [field, before.lookTuning.live[field]]));
    if (Object.keys(changes).length && current.lookTuning) {
      await write({ lookTuning: {
        patternId: named,
        expectedCardId: before.status.cardId,
        expectedBootId: before.status.bootId,
        session: current.lookTuning.session,
        changes,
      } });
    }
    const verified = await readReleasedOutput();
    if (!samePlayback(before, verified) || !outputMatches(before, verified)) {
      throw new Error('The card did not confirm its previous look and output.');
    }
  }

  async function restoreLegacy() {
    const looks = snapshotAvailable ? snapshotLooks(snapshot) : [];
    if (!looks.length) {
      await resetOutput(fallbackLook, { host });
      return;
    }
    for (const look of looks) {
      await restoreLook(look, { host, latestOnly: false });
    }
  }

  async function cancelOwnedStream(isOwner, releaseLease) {
    const current = await capture();
    if (!isOwner()) throw superseded('Another preview took control of the lights.');
    const changed = !samePlayback(snapshot, current);
    if (current.status.streaming && ['artnet', 'wled-realtime'].includes(current.status.frameSource)) {
      throw superseded('Another source took control of the lights.');
    }
    const stillOwns = () => isOwner() && currentSelection();
    if (releaseLease && stillOwns()) await releaseLease();
    else if (current.status.streaming) await command({ cancelStream: true }, stillOwns);
    if (changed) throw superseded('The card playback changed during preview. Its newer playback was left in place.');
    const result = await readReleasedOutput();
    if (!samePlayback(snapshot, result)) {
      throw superseded('The card playback changed during preview. Its newer playback was left in place.');
    }
    if (result.status.streaming) throw new Error('The card did not release the preview stream.');
    if (!localOutput(result.status)) {
      if (!isOwner()) throw superseded('Another preview took control of the lights.');
      await restorePlayback(result, stillOwns);
    } else if (!outputMatches(snapshot, result)) {
      throw new Error('The output resumed, but the card did not confirm its previous colour calibration.');
    }
  }

  async function readNativeApplication() {
    const current = await capture();
    if (lookId(current.status) !== nativeAcknowledged) {
      throw superseded('The card selected a different look during preview. Its newer playback was left in place.');
    }
    return current;
  }

  async function restoreNative() {
    const current = await capture();
    if (current.status.streaming) throw superseded('Another source took control of the lights.');
    if (samePlayback(snapshot, current) && outputMatches(snapshot, current)) return;
    // An accepted command still belongs to this session if the first readback
    // was lost and a fresh read proves the exact preview values are playing.
    const previewPayload = buildLivePreviewControlPayload(nativeLook);
    delete previewPayload.patternId;
    const matchesCommand = nativeAcknowledged && lookId(current.status) === nativeAcknowledged
      && current.zones.every(zone => zoneConfirmsLivePreviewIntent(previewPayload, zone));
    if (nativeApplied ? !samePlayback(nativeApplied, current) : !matchesCommand) {
      throw superseded('The current card playback differs from the preview. Its current playback was left in place.');
    }
    await restorePlayback(current);
  }

  async function rollback(reason = 'stop', terminalState = 'restored') {
    if (rollbackPromise) return rollbackPromise;
    cancelled = true;
    if (!stream && !nativePending) {
      setState('stopped');
      return undefined;
    }
    rollbackPromise = (async () => {
      setState('stopping');
      try {
        if (stream) {
          if (snapshot?.status && typeof snapshot.status.streaming === 'boolean') {
            await stream.stop({ cancel: cancelOwnedStream });
            if (ownershipTransferred) throw superseded('Another preview took control of the lights.');
          } else {
            await stream.stop();
            await restoreLegacy();
          }
        } else {
          // A Stop during a native POST or its readback must settle the
          // pending mutation before another preview is allowed to take over.
          await nativePending.catch(() => {});
          await restoreNative();
        }
        restored = true;
        setState(terminalState);
      } catch (error) {
        lastError = error;
        restored = false;
        if (error.reason === 'preview-playback-changed') {
          setState('superseded');
          return { reason, restored: false };
        }
        setState('error');
        throw error;
      } finally {
        stream = null;
      }
      return { reason, restored };
    })();
    return rollbackPromise;
  }

  async function yieldToNewOwner() {
    if (rollbackPromise) return rollbackPromise;
    rollbackPromise = (async () => {
      setState('stopping');
      await stream?.stop?.();
      stream = null;
      restored = null;
      setState('superseded');
      return { reason: 'stream-superseded', restored: false, ownershipTransferred: true };
    })();
    return rollbackPromise;
  }

  function onHealth(health) {
    if (health?.reason === 'stream-superseded' || health?.reason === 'stream-reclaimed') ownershipTransferred = true;
    if (state !== 'live') return;
    if (health?.delivered === true) {
      delivered = true;
      setState('live');
      return;
    }
    if (health?.delivered !== false) return;
    lastError = health.lastError || Object.assign(new Error('Physical preview stream stopped.'), {
      reason: health.reason || 'delivery-failed',
    });
    if (health.reason === 'stream-superseded' || health.reason === 'stream-reclaimed') {
      // The newer owner now controls the LEDs. Restoring through /api/control
      // would cancel that new stream, so only relinquish local resources.
      void yieldToNewOwner().catch(() => {});
      return;
    }
    void rollback(health.reason || 'delivery-failed').catch(() => {});
  }

  return {
    async start(initialFrame) {
      if (state !== 'idle') throw new Error('Pattern Lab physical preview session has already started');
      restored = null;
      setState('starting');
      try {
        try {
          snapshot = await (readSnapshot ? readSnapshot({ host }) : capture());
          snapshotAvailable = Boolean(snapshot);
        } catch (error) {
          if (strictSnapshot) throw error;
          snapshot = null;
          snapshotAvailable = false;
        }
        if (cancelled) return false;
        if (snapshot?.status?.streaming === true) throw new Error('Another preview is already controlling the lights.');
        if (snapshot?.status?.commandReady === false || snapshot?.status?.outputReady === false) {
          throw new Error('The card is not ready to preview on the lights.');
        }
        if (nativeLook) {
          if (snapshot.status?.playlist?.playing) throw new Error('Pause the card playlist before trying a native look.');
          nativePending = (async () => {
            const reply = await restoreLook({ ...nativeLook, syncZones: true }, {
              ...options, latestOnly: false, autoDiscover: false, expectedCardId: snapshot.status?.cardId,
              previewArbitration: { isCurrent: () => !cancelled && currentSelection() },
            });
            if (reply?.ok === false || reply?.delivered === false || reply?.skipped === true) {
              throw new Error(reply.message || reply.reason || 'The card did not accept this look.');
            }
            nativeAcknowledged = String(reply?.appliedPatternId || '');
            nativeApplied = await readNativeApplication();
          })();
          await nativePending;
          if (cancelled) return false;
          delivered = true;
          setState('native-look');
          return true;
        }
        stream = createStream({
          host, authority, fps, onHealth, getColorProfile, canSendFrame: currentSelection,
          ...(authority ? {} : { transport: canPushDirectlyToCard() ? 'direct' : 'legacy-bridge' }),
        });
        const started = stream.start();
        if (started === false) throw new Error('Pattern Lab physical preview stream could not start');
        setState('live');
        if (initialFrame) stream.push(initialFrame);
        return true;
      } catch (error) {
        if (cancelled && !stream) {
          // The caller already stopped this native write. Its stop result
          // owns the terminal state, even when the first readback failed.
          await rollbackPromise;
          return false;
        }
        lastError = error;
        try {
          await rollback('start-error', 'error');
        } catch {
          setState('error');
        }
        if (state !== 'superseded') setState('error');
        throw error;
      }
    },
    push(frame) {
      return state === 'live' ? Boolean(stream?.push(frame)) : false;
    },
    stop(reason = 'user') {
      return rollback(reason);
    },
    whenSettled() {
      return rollbackPromise || Promise.resolve();
    },
    status() {
      return {
        state,
        active: state === 'live' || state === 'native-look',
        snapshotAvailable,
        delivered,
        error: lastError,
        restored,
      };
    },
  };
}
