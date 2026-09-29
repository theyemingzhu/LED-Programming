export const CLIENT_PLAYLIST_LIMIT = 16;
const patternId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function validateClientStatus(status, expected = {}) {
  if (status?.app !== 'Lightweaver' || !status.cardId || !status.bootId) throw new Error('The card did not confirm its identity.');
  if (expected.cardId && expected.cardId !== status.cardId) throw new Error('A different card answered. Reconnect to your original card.');
  if (expected.bootId && expected.bootId !== status.bootId) throw new Error('The card restarted. Reconnect to refresh its controls.');
  if (status.playbackReady !== true) throw new Error('The card is not ready to play. Open its local page to check its status.');
  return status;
}

export function controlPatch(key, value) {
  if (key === 'patternId' && patternId.test(value)) return { patternId: value, syncZones: true };
  if (key === 'brightness' && Number.isFinite(value) && value >= 0 && value <= 1) return { brightness: value };
  if (key === 'hueShift' && Number.isInteger(value) && value >= -128 && value <= 128) return { hueShift: value };
  if (key === 'speed' && Number.isFinite(value) && value >= 0.05 && value <= 3) return { speed: value };
  if (key === 'blackout' && typeof value === 'boolean') return { blackout: value };
  if (key === 'playlist' && ['play', 'pause', 'next', 'previous'].includes(value)) return { playlist: value };
  throw new Error('That control is not supported.');
}

export function normalizeClientPlaylist(value, patterns, cardId) {
  const installed = new Set(patterns.map(pattern => pattern.id));
  if (value?.ok !== true || value.cardId !== cardId || typeof value.revision !== 'string' || !value.revision || typeof value.enabled !== 'boolean'
    || !Number.isInteger(value.fadeMs) || value.fadeMs < 0 || value.fadeMs > 10000
    || !Array.isArray(value.entries) || value.entries.length > CLIENT_PLAYLIST_LIMIT) throw new Error('The card returned an invalid playlist.');
  if (value.entries.some(entry => !installed.has(entry.patternId) || !Number.isInteger(entry.dwellSeconds) || entry.dwellSeconds < 1 || entry.dwellSeconds > 3600)) {
    throw new Error('The saved playlist contains an unavailable pattern or duration.');
  }
  return { ok: true, cardId, revision: value.revision, enabled: value.enabled, fadeMs: value.fadeMs,
    entries: value.entries.map(({ patternId, dwellSeconds }) => ({ patternId, dwellSeconds })) };
}

export function updatePlaylistEntry(entries, index, raw) {
  const value = Number(raw);
  if (String(raw).trim() === '' || !Number.isInteger(value) || value < 1 || value > 3600) throw new Error('Choose a whole number from 1 to 3,600 seconds.');
  return entries.map((entry, position) => position === index ? { ...entry, dwellSeconds: value } : entry);
}

export function movePlaylistEntry(entries, from, to) {
  if (from < 0 || to < 0 || from >= entries.length || to >= entries.length) return entries;
  const next = [...entries];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}
