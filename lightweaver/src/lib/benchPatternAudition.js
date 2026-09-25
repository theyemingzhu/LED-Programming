// A Bench audition changes only the card's temporary playback. Geometry comes
// from the provisioned output layout, never from an unconfirmed LED count.
export function benchZoneIdForPin(pin) { return `bench-${Number(pin)}`; }

function zoneWithout(zone, ignored = []) {
  return Object.fromEntries(Object.entries(zone || {}).filter(([key]) => !ignored.includes(key)));
}

const RESTORABLE_ZONE_FIELDS = Object.freeze({
  patternId: 'patternId', brightness: 'brightness', speed: 'speed', hueShift: 'hueShift',
  customHue: 'hue', customSaturation: 'saturation', customBreathe: 'breathe',
  breatheLowerPct: 'breatheLowerPct', breatheUpperPct: 'breatheUpperPct',
  breatheCycleSeconds: 'breatheCycleSeconds', customDrift: 'drift',
  driftHueMin: 'driftMin', driftHueMax: 'driftMax', blackout: 'blackout',
});

function zoneRestoreBody(original, current) {
  const body = { zone: original.id, syncZones: false };
  for (const [field, control] of Object.entries(RESTORABLE_ZONE_FIELDS)) {
    if (field in original && JSON.stringify(original[field]) !== JSON.stringify(current?.[field])) {
      body[control] = original[field];
    }
  }
  return Object.keys(body).length > 2 ? body : null;
}

function matchesStoredDefinition(expected, actual) {
  if (typeof expected === 'number') return Number.isFinite(Number(actual))
    && Math.abs(expected - Number(actual)) < 0.0001;
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length
    && expected.every((value, index) => matchesStoredDefinition(value, actual[index]));
  if (expected && typeof expected === 'object') return actual && typeof actual === 'object'
    && Object.entries(expected).every(([key, value]) => matchesStoredDefinition(value, actual[key]));
  return expected === actual;
}

export function requireBenchZoneMapping(layout, payload) {
  const expected = (layout || []).map(entry => ({
    id: layout.length === 1 ? 'bench-full' : benchZoneIdForPin(entry.pin),
    start: entry.start,
    count: entry.count,
  }));
  const zones = Array.isArray(payload?.zones) ? payload.zones : [];
  if (expected.length > 1 && zones.length === 1 && zones[0]?.id === 'bench-full') {
    throw new Error('This temporary setup needs an update before each GPIO can play its own pattern.');
  }
  if (zones.length !== expected.length || expected.some(item => {
    const zone = zones.find(candidate => candidate.id === item.id);
    return !zone || zone.ranges?.length !== 1
      || Number(zone.ranges[0].start) !== item.start
      || Number(zone.ranges[0].count) !== item.count;
  })) throw new Error('The card zone mapping differs from the provisioned GPIO layout. Reconnect this card before trying patterns.');
  return zones;
}

export async function auditionBenchPattern({ layout, confirmedPins, pin = null, patternId, readZones, readStatus, postControl, onBeforeWrite }) {
  if (typeof readZones !== 'function' || typeof postControl !== 'function') throw new TypeError('Verified card transport is required.');
  const chosen = String(patternId || '');
  if (!/^[a-z0-9-]{1,64}$/.test(chosen)) throw new Error('Choose a supported card pattern.');
  const beforePayload = await readZones();
  const before = requireBenchZoneMapping(layout, beforePayload);
  const eligible = (layout || []).filter(entry => confirmedPins == null || confirmedPins.some(value => Number(value) === Number(entry.pin)));
  if (!eligible.length) throw new Error('Count and confirm a GPIO strip before trying a pattern.');
  const targets = pin == null ? eligible : eligible.filter(entry => Number(entry.pin) === Number(pin));
  if (!targets.length) throw new Error('This GPIO has not been confirmed as a measured strip.');
  const targetIds = new Set(targets.map(entry => layout.length === 1 ? 'bench-full' : benchZoneIdForPin(entry.pin)));
  const beforeStatus = readStatus ? await readStatus() : null;
  if (beforeStatus?.streaming) throw new Error('The discovery light stream still owns this card. Stop it before trying patterns.');
  if (readStatus && beforeStatus?.nativeRenderArmSupported !== true) {
    throw new Error('This card needs a preserving firmware update before it can safely play Bench patterns. Open Flash, update the card, then return here.');
  }
  if (readStatus && (beforeStatus?.provisionalSetup !== true || beforeStatus?.outputReady !== true
    || beforeStatus?.maxMilliampsSource !== 'config'
    || Number(beforeStatus?.maxMilliamps) > 2000 || Number(beforeStatus?.maxMilliamps) < 100)) {
    throw new Error('This card did not confirm a ready provisional setup with an explicit safe current limit.');
  }
  if (beforeStatus?.playlist?.playing) throw new Error('Pause the card playlist before trying a temporary Bench pattern.');
  await onBeforeWrite?.(beforePayload, beforeStatus);
  let current = beforePayload;
  for (const entry of targets) {
    const targetId = layout.length === 1 ? 'bench-full' : benchZoneIdForPin(entry.pin);
    if (current.zones.find(zone => zone.id === targetId)?.patternId === chosen && current.syncZones === false) continue;
    let postError = null;
    try { await postControl({ zone: targetId, syncZones: false, patternId: chosen }); }
    catch (error) { postError = error; }
    current = await readZones();
    requireBenchZoneMapping(layout, current);
    if (current.zones.find(zone => zone.id === targetId)?.patternId !== chosen || current.syncZones !== false) {
      throw postError || new Error(`GPIO pattern readback did not confirm ${chosen}.`);
    }
  }
  const after = requireBenchZoneMapping(layout, await readZones());
  for (const zone of after) {
    if (targetIds.has(zone.id)) {
      if (zone.patternId !== chosen) throw new Error(`GPIO pattern readback did not confirm ${chosen}.`);
    } else if (JSON.stringify(zone) !== JSON.stringify(before.find(item => item.id === zone.id))) {
      throw new Error('An unselected zone changed during the GPIO audition.');
    }
  }
  if (readStatus) {
    let status = await readStatus();
    for (const targetId of targetIds) {
      let postError = null;
      if (!status.nativeArmedZones?.includes(targetId)) {
        try { await postControl({ zone: targetId, armNative: true }); } catch (error) { postError = error; }
        status = await readStatus();
      }
      if (!status.nativeArmedZones?.includes(targetId) || status.streaming || status.blackout
        || status.nativeRendering !== true || Number(status.nativeFadeScale) <= 0) {
        throw postError || new Error(`The card did not arm native playback for ${targetId}.`);
      }
    }
    const expectedArmed = [...new Set([...(beforeStatus.nativeArmedZones || []), ...targetIds])].sort();
    if (JSON.stringify([...(status.nativeArmedZones || [])].sort()) !== JSON.stringify(expectedArmed)) {
      throw new Error('The card armed an unexpected output during this Bench preview.');
    }
  }
  const armedReadback = requireBenchZoneMapping(layout, await readZones());
  for (const zone of armedReadback) {
    const original = before.find(item => item.id === zone.id);
    if (targetIds.has(zone.id)) {
      if (zone.patternId !== chosen || JSON.stringify(zoneWithout(zone, ['patternId', 'blackout']))
        !== JSON.stringify(zoneWithout(original, ['patternId', 'blackout']))) {
        throw new Error('A measured zone changed controls beyond its pattern or native arm state.');
      }
    } else if (JSON.stringify(zone) !== JSON.stringify(original)) {
      throw new Error('An unselected zone changed during the GPIO audition.');
    }
  }
  return { patternsByPin: Object.fromEntries(eligible.map(entry => [
    entry.pin,
    after.find(zone => zone.id === (layout.length === 1 ? 'bench-full' : benchZoneIdForPin(entry.pin)))?.patternId,
  ])), before, previousSyncZones: beforePayload?.syncZones };
}

export async function restoreBenchPatternSnapshot({ layout, baseline, readZones, readStatus, postControl }) {
  let fresh = await readZones();
  requireBenchZoneMapping(layout, fresh);
  for (const zone of baseline.zones || []) {
    if (!layout.some(item => zone.id === (layout.length === 1 ? 'bench-full' : benchZoneIdForPin(item.pin)))) {
      throw new Error('The original pattern area is missing.');
    }
  }
  // Restoring a missing original arm clears that zone's blackout. Do it before
  // the zone/global control restore, then disarm new preview zones at the end.
  if (readStatus && Array.isArray(baseline.nativeArmedZones)) {
    let status = await readStatus();
    let rearmed = false;
    for (const targetId of baseline.nativeArmedZones) {
      if (status.nativeArmedZones?.includes(targetId)) continue;
      let postError = null;
      try { await postControl({ zone: targetId, armNative: true }); } catch (error) { postError = error; }
      status = await readStatus();
      if (!status.nativeArmedZones?.includes(targetId)) throw postError || new Error(`The card did not rearm original output ${targetId}.`);
      rearmed = true;
    }
    if (rearmed) {
      fresh = await readZones();
      requireBenchZoneMapping(layout, fresh);
    }
  }
  if (readStatus && baseline.currentPatternId) {
    const status = await readStatus();
    if (status.currentPatternId !== baseline.currentPatternId) {
      let postError = null;
      try { await postControl({ patternId: baseline.currentPatternId }); } catch (error) { postError = error; }
      const after = await readStatus();
      if (after.currentPatternId !== baseline.currentPatternId) throw postError || new Error('The card did not restore its original current look.');
      fresh = await readZones();
      requireBenchZoneMapping(layout, fresh);
    }
  }
  if (readStatus && typeof baseline.blackout === 'boolean') {
    let status = await readStatus();
    if (status.blackout !== baseline.blackout) {
      let postError = null;
      try { await postControl({ blackout: baseline.blackout }); } catch (error) { postError = error; }
      status = await readStatus();
      if (status.blackout !== baseline.blackout) throw postError || new Error('The card did not restore blackout.');
    }
  }
  for (const zone of baseline.zones || []) {
    const body = zoneRestoreBody(zone, fresh.zones.find(item => item.id === zone.id));
    if (!body) continue;
    let postError = null;
    try { await postControl(body); } catch (error) { postError = error; }
    fresh = await readZones();
    requireBenchZoneMapping(layout, fresh);
    if (JSON.stringify(fresh.zones.find(item => item.id === zone.id)) !== JSON.stringify(zone)) {
      throw postError || new Error(`The card did not restore all controls for ${zone.id}.`);
    }
  }
  if (typeof baseline.syncZones === 'boolean' && fresh.syncZones !== baseline.syncZones) {
    let postError = null;
    try { await postControl({ syncZones: baseline.syncZones }); } catch (error) { postError = error; }
    fresh = await readZones();
    requireBenchZoneMapping(layout, fresh);
    if (fresh.syncZones !== baseline.syncZones) throw postError || new Error('The card did not restore synchronization.');
  }
  if (readStatus && Array.isArray(baseline.nativeArmedZones)) {
    let status = await readStatus();
    for (const targetId of status.nativeArmedZones || []) {
      if (baseline.nativeArmedZones.includes(targetId)) continue;
      let postError = null;
      try { await postControl({ zone: targetId, armNative: false }); } catch (error) { postError = error; }
      status = await readStatus();
      if (status.nativeArmedZones?.includes(targetId)) throw postError || new Error(`The card did not restore dark output for ${targetId}.`);
    }
  }
  if (readStatus && typeof baseline.blackout === 'boolean') {
    const status = await readStatus();
    if (status.streaming || (Array.isArray(baseline.nativeArmedZones)
      && JSON.stringify([...(status.nativeArmedZones || [])].sort()) !== JSON.stringify([...baseline.nativeArmedZones].sort()))
      || status.blackout !== baseline.blackout
      || (baseline.nativeFadeScale != null && Number(status.nativeFadeScale) !== Number(baseline.nativeFadeScale))
      || (baseline.currentPatternId != null && status.currentPatternId !== baseline.currentPatternId)
      || status.playlist?.playing !== baseline.playlistPlaying) {
      throw new Error('The card did not restore its original rendering ownership.');
    }
  }
  const restored = await readZones();
  requireBenchZoneMapping(layout, restored);
  if (restored.syncZones !== baseline.syncZones || baseline.zones.some(zone =>
    JSON.stringify(restored.zones.find(item => item.id === zone.id)) !== JSON.stringify(zone))) {
    throw new Error('The card did not confirm the original temporary zone controls and synchronization.');
  }
  return true;
}

export function requireBenchInstallReadback(config, status, zonePayload, expectedCardId, patternsPayload, wiringStatus) {
  if (wiringStatus?.state !== 'known-good' || wiringStatus.hasCandidate
    || wiringStatus.activationId || (wiringStatus.cardId && wiringStatus.cardId !== expectedCardId)) {
    throw new Error('The final wiring is not yet confirmed as known-good on this card.');
  }
  if (!expectedCardId || status?.cardId !== expectedCardId
    || String(status?.projectId || status?.piece?.id || '') !== config?.piece?.id
    || Number(status?.projectRevision) !== Number(config?.projectRevision)
    || status?.projectFingerprint !== config?.projectFingerprint
    || status?.provisionalSetup !== false) {
    throw new Error('The final card identity or project readback did not match this install.');
  }
  const expectedOutputs = config?.led?.outputs || [];
  const actualOutputs = status?.outputs || [];
  if (actualOutputs.length !== expectedOutputs.length || expectedOutputs.some((output, index) => {
    const actual = actualOutputs[index];
    return !actual || String(actual.id) !== String(output.id)
      || Number(actual.pin) !== Number(output.pin) || Number(actual.pixels) !== Number(output.pixels)
      || JSON.stringify(actual.segments || []) !== JSON.stringify(output.segments || []);
  })) throw new Error('The final GPIO output readback did not match the measured strips.');
  const expectedZones = config?.zones || [];
  const expectedLooks = config?.looks || [];
  const storedLooks = patternsPayload?.patterns || [];
  const startup = expectedLooks.find(look => look.id === config?.startupPatternId);
  const startupReadback = storedLooks.find(look => look.id === config?.startupPatternId);
  if (patternsPayload?.startupPatternId !== config?.startupPatternId || !startupReadback
    || startupReadback.mode !== startup?.mode) {
    throw new Error('The final startup look readback did not match this install.');
  }
  const expectedPlaylist = config?.playlist;
  const storedPlaylist = patternsPayload?.playlist;
  if (!storedPlaylist || (expectedPlaylist
    ? !matchesStoredDefinition(expectedPlaylist, storedPlaylist)
    : storedPlaylist.enabled !== false || (storedPlaylist.entries || []).length !== 0)) {
    throw new Error('The card did not confirm the saved playlist in this install.');
  }
  if (storedLooks.length !== expectedLooks.length || expectedLooks.some(look =>
    !matchesStoredDefinition(look, storedLooks.find(stored => stored.id === look.id)))) {
    throw new Error('The card did not confirm every saved look definition in this install. Update the card if it cannot report look controls.');
  }
  if (expectedZones.length > 1 && new Set(expectedZones.map(zone => zone.patternId)).size > 1
    && (startup?.mode !== 'combo' || expectedZones.some(zone =>
      !startupReadback.zones?.some(item => item.id === zone.id && item.patternId === zone.patternId)))) {
    throw new Error('The final startup combination does not match the chosen GPIO patterns.');
  }
  const playing = status?.playlist?.playing === true;
  const liveId = patternsPayload?.currentId;
  if (playing) {
    if (expectedPlaylist?.enabled !== true || !expectedPlaylist.entries?.some(item => item.patternId === liveId)
      || status.playlist.patternId !== liveId) {
      throw new Error('The live playlist selection did not match the installed playlist.');
    }
  } else if (liveId !== config?.startupPatternId) {
    throw new Error('The final live startup look did not match this install.');
  }
  const liveLook = playing ? expectedLooks.find(look => look.id === liveId) : startup;
  const liveZonePattern = zone => liveLook?.mode === 'combo'
    ? liveLook.zones?.find(item => item.id === zone.id)?.patternId
    : (playing ? liveId : zone.patternId);
  const actualZones = zonePayload?.zones || [];
  if (actualZones.length !== expectedZones.length || expectedZones.some(zone => {
    const actual = actualZones.find(item => item.id === zone.id);
    return !actual || actual.patternId !== liveZonePattern(zone)
      || JSON.stringify(actual.ranges) !== JSON.stringify(zone.ranges);
  })) throw new Error('The final section readback did not match the measured strips and chosen patterns.');
  return true;
}
