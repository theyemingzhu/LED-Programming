// One answer to "is this worth simply trying again?".
//
// The product had four separate notions of transient — isTransientCardError in
// cardSetupDeploy.js, RETRYABLE_BRIDGE_TYPES in cardBridge.js, TRANSIENT_REASONS
// in cardConnectionFlow.js, RETRYABLE_PAIR_REASONS in cardPairing.js — and not
// one of them knew about HTTP 423, which is the card's own way of saying "I am
// still starting up". So the single commonest transient condition in the whole
// product was reported to the owner as a failure, every time, immediately.
//
// The rule this encodes: an error about a MOMENT should not become a message
// to somebody who will still be reading it after the moment has passed.

/**
 * Status codes that describe a moment rather than a decision.
 *
 * 423 — the runtime is not ready yet (booting, output not initialised).
 * 409 — a conflict with something already in flight, which will finish.
 * 425 — too early.
 * 503 — temporarily unavailable.
 *
 * Deliberately NOT here: 400 (the request is wrong and will stay wrong), 403
 * (an authority decision), 422 (the card reasoned about it and refused), 404,
 * 413. Retrying those is just asking the same question twice.
 */
const TRANSIENT_STATUS = new Set([409, 423, 425, 503]);

/** Reasons, from any of the transports, that mean "ask again". */
const TRANSIENT_REASONS = new Set([
  'timeout',
  'bridge-timeout',
  'offline',
  'network',
  'no-answer',
  'card-stopped-answering',
  'stale-discovery',
  'stale-identity',
  'runtime-not-ready',
  'checking-card',
  'card-restarted',
]);

const TRANSIENT_TEXT = /abort|network|fetch|reach|timed out|timeout|not ready|starting/i;

export function isTransientCardFailure(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  if (TRANSIENT_STATUS.has(Number(error.status))) return true;
  if (TRANSIENT_REASONS.has(String(error.reason || ''))) return true;
  // A string `code` is one of ours; a DOMException carries a numeric one
  // (AbortError is 20), and reading that as a refusal turned every "the card is
  // still booting" into "the card did not take the setup".
  const code = typeof error.code === 'string' ? error.code : '';
  if (code && code !== 'http' && code !== 'network') return false;
  return TRANSIENT_TEXT.test(String(error.message || ''));
}

/**
 * Run `attempt`, and simply try again while it fails for a reason that will
 * pass on its own.
 *
 * Only ever wrap work that is safe to repeat: a read, or a command whose
 * meaning is the same the second time (set THIS pattern, set THIS brightness).
 * Never wrap something that appends, allocates, or advances a sequence.
 *
 * The delay grows so a card that needs a few seconds to boot gets them without
 * being hammered while it does.
 *
 * `readBack` is for a WRITE whose reply was lost. A dropped reply after the
 * card has already applied the command looks exactly like a card that never
 * heard it, and repeating the command in that case sends a real second
 * command — the duplicate write the journey contract forbids. When supplied,
 * `readBack(error, attemptNumber)` is asked before every retry; a truthy
 * result is the acknowledgement (the card was read and already holds the
 * intent) and is returned instead of trying again. A falsy result, or a
 * read that itself fails, falls through to the ordinary retry.
 */
export async function retryWhileTransient(attempt, {
  attempts = 3,
  delayMs = 400,
  maxDelayMs = 2000,
  onRetry = null,
  readBack = null,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await attempt(index);
    } catch (error) {
      lastError = error;
      const worthRetrying = index < attempts - 1 && isTransientCardFailure(error);
      if (!worthRetrying) break;
      if (typeof readBack === 'function') {
        let settled = null;
        try {
          settled = await readBack(error, index + 1);
        } catch {
          settled = null;
        }
        if (settled) return settled;
      }
      onRetry?.(error, index + 1);
      await sleep(Math.min(maxDelayMs, delayMs * (2 ** index)));
    }
  }
  throw lastError;
}
