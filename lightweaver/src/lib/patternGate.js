// Whether a Patterns "not sent" refusal may step down by itself.
//
// Only a 'recovery' refusal raised while the card was NOT ready clears, and
// only once access reads 'ready' again (the card came back after a drop). A
// refusal raised while access already read 'ready' was about something else
// (stale authority, a bridge that is not fresh) and stays until the owner acts.
export function shouldClearRecoveryGate({ access, gate, raisedWhileUnready }) {
  return access === 'ready' && gate === 'recovery' && raisedWhileUnready === true;
}

// Failures that say nothing about the card itself: it was slow, restarting,
// or still starting up. Once the card answers again they are no longer
// true, so Patterns resends the owner's last tap instead of leaving the
// message and its Retry button on screen over a healthy card.
// A 409 "busy with another change" is NOT here: it usually means another
// browser changed the card, and resending would override that newer choice.
const TRANSIENT_PREVIEW_FAILURES = new Set(['timeout', 'card-restarted', 'not-ready']);

// A resend is the owner's tap arriving late. After this long it is no longer
// what they meant now (they, or another browser, may have moved on), so the
// message and its Retry button stay instead.
export const TRANSIENT_RETRY_WINDOW_MS = 30_000;

export function isTransientPreviewFailure(failure) {
  return TRANSIENT_PREVIEW_FAILURES.has(failure?.code);
}

// `failedReading` is the card reading current when the tap failed; a retry is
// owed only once a NEWER reading shows the card ready, only once, and only
// within TRANSIENT_RETRY_WINDOW_MS of the failure.
export function shouldRetryAfterTransientFailure({ access, failure, failedReading, reading, alreadyRetried, failedAt, now }) {
  if (alreadyRetried || access !== 'ready' || !isTransientPreviewFailure(failure)) return false;
  if (!Number.isFinite(failedAt) || !Number.isFinite(now) || now - failedAt > TRANSIENT_RETRY_WINDOW_MS) return false;
  return Boolean(reading) && reading !== failedReading;
}

// Whether the card's project moved since this window last saw it. The record
// is this window's own installation binding (from its last save or pick-up);
// the evidence is a fresh read taken just before a save. A different
// well-formed fingerprint means another window saved in between, and saving
// now would overwrite that work without anyone knowing.
export function cardChangedSinceSeen(record, evidence) {
  const seen = String(record?.projectFingerprint || '').toLowerCase();
  const now = String(evidence?.projectFingerprint || '').toLowerCase();
  if (!/^[a-f0-9]{16,64}$/.test(seen) || !/^[a-f0-9]{16,64}$/.test(now)) return false;
  if (record?.cardId && evidence?.cardId && record.cardId !== evidence.cardId) return false;
  return seen !== now;
}
