// A Bench audition changes only the card's temporary playback. Geometry comes
// from the provisioned output layout, never from an unconfirmed LED count.
export function benchZoneIdForPin(pin) { return `bench-${Number(pin)}`; }

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

export async function auditionBenchPattern({ layout, pin = null, patternId, readZones, postControl, onBeforeWrite }) {
  if (typeof readZones !== 'function' || typeof postControl !== 'function') throw new TypeError('Verified card transport is required.');
  const chosen = String(patternId || '');
  if (!/^[a-z0-9-]{1,64}$/.test(chosen)) throw new Error('Choose a supported card pattern.');
  const beforePayload = await readZones();
  const before = requireBenchZoneMapping(layout, beforePayload);
  const target = pin == null ? null : (layout || []).find(entry => Number(entry.pin) === Number(pin));
  if (pin != null && !target) throw new Error('This GPIO is not part of the temporary setup.');
  const targetId = target ? (layout.length === 1 ? 'bench-full' : benchZoneIdForPin(target.pin)) : '';
  const body = target
    ? { zone: targetId, syncZones: false, patternId: chosen }
    : { syncZones: true, patternId: chosen };
  await onBeforeWrite?.(beforePayload);
  let postError = null;
  try { await postControl(body); } catch (error) { postError = error; }
  const after = requireBenchZoneMapping(layout, await readZones());
  for (const zone of after) {
    if (!target || zone.id === targetId) {
      if (zone.patternId !== chosen) throw postError || new Error(`GPIO pattern readback did not confirm ${chosen}.`);
    } else if (zone.patternId !== before.find(item => item.id === zone.id)?.patternId) {
      throw new Error('An unselected zone changed during the GPIO audition.');
    }
  }
  return { patternsByPin: Object.fromEntries(layout.map(entry => [
    entry.pin,
    after.find(zone => zone.id === (layout.length === 1 ? 'bench-full' : benchZoneIdForPin(entry.pin)))?.patternId,
  ])), before, previousSyncZones: beforePayload?.syncZones };
}

export async function restoreBenchPatternSnapshot({ layout, baseline, readZones, postControl }) {
  requireBenchZoneMapping(layout, await readZones());
  for (const zone of baseline.zones || []) {
    const entry = layout.find(item => zone.id === (layout.length === 1 ? 'bench-full' : benchZoneIdForPin(item.pin)));
    if (!entry) throw new Error('The original pattern area is missing.');
    await auditionBenchPattern({ layout, pin: entry.pin, patternId: zone.patternId, readZones, postControl });
  }
  if (typeof baseline.syncZones === 'boolean') await postControl({ syncZones: baseline.syncZones });
  const restored = await readZones();
  requireBenchZoneMapping(layout, restored);
  if (restored.syncZones !== baseline.syncZones || baseline.zones.some(zone =>
    restored.zones.find(item => item.id === zone.id)?.patternId !== zone.patternId)) {
    throw new Error('The card did not confirm the original temporary patterns and synchronization.');
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
    return !actual || Number(actual.pin) !== Number(output.pin) || Number(actual.pixels) !== Number(output.pixels);
  })) throw new Error('The final GPIO output readback did not match the measured strips.');
  const expectedZones = config?.zones || [];
  const startup = (config?.looks || []).find(look => look.id === config?.startupPatternId);
  const startupReadback = patternsPayload?.patterns?.find(look => look.id === config?.startupPatternId);
  if (patternsPayload?.currentId !== config?.startupPatternId || !startupReadback
    || startupReadback.mode !== startup?.mode) {
    throw new Error('The final startup look readback did not match this install.');
  }
  if (expectedZones.length > 1 && new Set(expectedZones.map(zone => zone.patternId)).size > 1
    && (startup?.mode !== 'combo' || expectedZones.some(zone =>
      !startupReadback.zones?.some(item => item.id === zone.id && item.patternId === zone.patternId)))) {
    throw new Error('The final startup combination does not match the chosen GPIO patterns.');
  }
  const actualZones = zonePayload?.zones || [];
  if (actualZones.length !== expectedZones.length || expectedZones.some(zone => {
    const actual = actualZones.find(item => item.id === zone.id);
    return !actual || actual.patternId !== zone.patternId
      || JSON.stringify(actual.ranges) !== JSON.stringify(zone.ranges);
  })) throw new Error('The final section readback did not match the measured strips and chosen patterns.');
  return true;
}
