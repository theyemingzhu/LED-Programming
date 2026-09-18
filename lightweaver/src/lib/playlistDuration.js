const MIN_PLAYLIST_LENGTH_SECONDS = 1;
const MAX_PLAYLIST_LENGTH_SECONDS = 3600;
const DEFAULT_PLAYLIST_LENGTH_SECONDS = 30;

export function formatPlaylistLengthMinutes(seconds) {
  const numericSeconds = Number(seconds);
  const normalizedSeconds = Number.isFinite(numericSeconds)
    ? Math.round(numericSeconds)
    : DEFAULT_PLAYLIST_LENGTH_SECONDS;
  const boundedSeconds = Math.max(
    MIN_PLAYLIST_LENGTH_SECONDS,
    Math.min(MAX_PLAYLIST_LENGTH_SECONDS, normalizedSeconds),
  );
  return String(Number((boundedSeconds / 60).toFixed(2)));
}

export function parsePlaylistLengthMinutes(value) {
  if (String(value).trim() === '') return { ok: false };
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return { ok: false };
  return {
    ok: true,
    seconds: Math.max(
      MIN_PLAYLIST_LENGTH_SECONDS,
      Math.min(MAX_PLAYLIST_LENGTH_SECONDS, Math.round(minutes * 60)),
    ),
  };
}
