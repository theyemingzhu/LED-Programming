// The one place Studio keeps the messages it wants to say to the owner.
//
// Why this exists: before it, eleven different class families each drew their
// own message box, and ten of the eleven drew it *in the document flow*. A
// notice appearing therefore pushed the interface down under the owner's
// cursor — you reached for "Install playlist on card" and it had already
// moved. The eleventh (`.workspace-notice`) was the only one that floated,
// and stacking a second one beside it was a hardcoded `top: 122px`.
//
// The rule this store enforces is SCOPE, and it has one right answer every
// time, so nobody has to make a judgement call at the call site:
//
//   screen-scoped  → publish it here. It floats. Nothing reflows.
//   field-scoped   → leave it beside its input on reserved ground
//                    (`.lw-field-note` — the message appears in space the
//                    wrapper already held open). Never publish those here:
//                    an error that jumps to the corner has abandoned the
//                    thing it is about.
//   region-scoped  → empty states and loaders that REPLACE content rather
//                    than adding to it already cause no jump. Leave them.
//
// The store is a module singleton rather than React context on purpose:
// notices are published from plain async lib code (card pushes, cloud saves,
// bridge callbacks) that has no component to hang a hook off, and a notice
// must survive the unmount of whatever screen raised it. That last part is
// the same lesson as `cardEditIntent.js` — a guard held in a component-scoped
// ref defends nothing across exactly the transition that needed guarding.

export const NOTICE_TONES = Object.freeze(['progress', 'info', 'success', 'warning', 'error']);

// How long a tone is allowed to stay before it clears itself, in ms.
// `null` means it never self-clears.
//
// Only `success` self-clears, and this is deliberate. The rule is already
// written into pattern-lab/PatternLabScreen.jsx and this generalises it: a
// message that vanishes after four seconds is not a notification, it is a
// lottery — the owner who looked away at the wrong moment is exactly the one
// who needed it. Anything that asks for an action stays until it is acted on,
// resolved, or dismissed.
const TONE_TTL = Object.freeze({
  progress: null,
  info: null,
  success: 2200,
  warning: null,
  error: null,
});

// Dismissibility is the publisher's call, not the tone's. Most notices carry
// a ×. A few must not: "Saving is paused" is the only sign that work is not
// being kept, so hiding it would hide the problem rather than solve it — that
// one clears when the condition clears and not before. Progress notices have
// nothing to dismiss; they end when the work does.
export function noticeIsDismissible(notice) {
  if (!notice) return false;
  if (notice.tone === 'progress') return false;
  return notice.dismissible !== false;
}

export function noticeTtl(tone) {
  return Object.prototype.hasOwnProperty.call(TONE_TTL, tone) ? TONE_TTL[tone] : null;
}

function normalizeTone(tone) {
  const value = String(tone || '').trim().toLowerCase();
  return NOTICE_TONES.includes(value) ? value : 'info';
}

function normalizeAction(action) {
  if (!action || typeof action !== 'object') return null;
  const label = String(action.label || '').trim();
  if (!label || typeof action.onSelect !== 'function') return null;
  return { label, onSelect: action.onSelect };
}

// The visible stack is capped. Beyond the cap the layer renders an overflow
// count rather than a wall of boxes over the artwork — three is the point at
// which the stack stops reading as "the app is telling me something" and
// starts reading as "the app is broken".
export const MAX_VISIBLE_NOTICES = 3;

const listeners = new Set();
let notices = [];
let seq = 0;
const timers = new Map();

function emit() {
  // A fresh array identity every time, so useSyncExternalStore's reference
  // comparison sees the change. `notices` is never mutated in place.
  for (const listener of listeners) listener();
}

function clearTimer(id) {
  const timer = timers.get(id);
  if (timer === undefined) return;
  clearTimeout(timer);
  timers.delete(id);
}

function armTimer(notice) {
  const ttl = noticeTtl(notice.tone);
  if (!ttl || typeof setTimeout !== 'function') return;
  clearTimer(notice.id);
  timers.set(notice.id, setTimeout(() => dismissNotice(notice.id), ttl));
}

/**
 * Publish a screen-scoped notice.
 *
 * `key` is how a repeating condition stays ONE notice instead of a pile: a
 * publish with a key already on the stack replaces that entry in place,
 * keeping its position so the stack does not reshuffle under a reader. A
 * status that is polled — "card unreachable", "saving…" — must always carry
 * one, or every poll adds a box.
 *
 * Returns the notice id, which `dismissNotice` accepts.
 */
export function publishNotice(input = {}) {
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  if (!title && !body) return '';
  const tone = normalizeTone(input.tone);
  const key = String(input.key || '').trim();
  const testId = String(input.testId || '').trim();
  seq += 1;
  const existingIndex = key ? notices.findIndex(entry => entry.key === key) : -1;
  const id = existingIndex >= 0 ? notices[existingIndex].id : `notice-${seq}`;
  const notice = {
    id,
    key,
    tone,
    title,
    body,
    testId,
    dismissible: input.dismissible !== false,
    // Told when the owner closes the card, so a publisher holding React
    // state for the same condition can retire it too — without this, state
    // and layer disagree and the notice returns on the next unrelated render.
    onDismiss: typeof input.onDismiss === 'function' ? input.onDismiss : null,
    action: normalizeAction(input.action),
    // Every notice records where it came from. When one turns up looking
    // wrong, this is the difference between a five-minute grep and an hour.
    source: String(input.source || '').trim(),
  };
  notices = existingIndex >= 0
    ? notices.map((entry, index) => (index === existingIndex ? notice : entry))
    : [...notices, notice];
  armTimer(notice);
  emit();
  return id;
}

export function dismissNotice(id, { notify = false } = {}) {
  if (!id) return;
  const entry = notices.find(item => item.id === id);
  if (!entry) return;
  clearTimer(id);
  notices = notices.filter(item => item.id !== id);
  emit();
  // Only an owner-initiated close notifies the publisher; a retraction
  // (the condition resolved) must not call back into the code that just
  // resolved it.
  if (notify && entry.onDismiss) entry.onDismiss();
}

/** Retract by key — how a condition that resolves takes its own notice down. */
export function dismissNoticeKey(key) {
  const target = String(key || '').trim();
  if (!target) return;
  const entry = notices.find(item => item.key === target);
  if (entry) dismissNotice(entry.id);
}

export function readNotices() {
  return notices;
}

export function subscribeToNotices(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam. Never called by the app. */
export function resetNotices() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  notices = [];
  seq = 0;
  emit();
}
