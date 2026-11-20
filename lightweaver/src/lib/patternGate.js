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
// still starting up, or busy. Once the card answers again they are no longer
// true, so Patterns resends the owner's last tap instead of leaving the
// message and its Retry button on screen over a healthy card.
const TRANSIENT_PREVIEW_FAILURES = new Set(['timeout', 'card-restarted', 'not-ready', 'conflict']);

export function isTransientPreviewFailure(failure) {
  return TRANSIENT_PREVIEW_FAILURES.has(failure?.code);
}

// `failedReading` is the card reading current when the tap failed; a retry is
// owed only once a NEWER reading shows the card ready, and only once.
export function shouldRetryAfterTransientFailure({ access, failure, failedReading, reading, alreadyRetried }) {
  if (alreadyRetried || access !== 'ready' || !isTransientPreviewFailure(failure)) return false;
  return Boolean(reading) && reading !== failedReading;
}
