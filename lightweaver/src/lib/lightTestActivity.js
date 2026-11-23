// Studio's own light test is in progress: the card is being restarted into
// the tested wiring, is running it, or is being confirmed or restored.
//
// During those steps the card goes quiet on purpose, and Card Home used to
// read that silence as a lost card: "Card stopped responding", then "A
// Lightweaver card is not connected" about a save that was working (FS3,
// todo/plans/practice-card-interruptions.md). This is a separate signal for
// the WORDING only. It never touches the card link — telling the link a
// restart was planned is what broke the light test's own requests
// (step3-activate, 2026-11-23).
//
// The light-test control (CardPushControl) sets it; deriveCardLifecycle reads
// it. A phase expires on its own, so a stuck signal can never hide a card
// that really has gone.
export const LIGHT_TEST_PHASES = Object.freeze(['starting', 'testing', 'finishing']);
export const LIGHT_TEST_ACTIVITY_MAX_MS = 120000;

let current = Object.freeze({ phase: '', at: 0 });
const listeners = new Set();

export function setLightTestActivity(phase, { now = Date.now() } = {}) {
  const next = LIGHT_TEST_PHASES.includes(phase) ? phase : '';
  if (next === current.phase && next === '') return;
  current = Object.freeze({ phase: next, at: next ? now : 0 });
  for (const listener of [...listeners]) listener();
}

export function getLightTestActivity() {
  return current;
}

/** The phase still in force, or '' once it has expired. */
export function activeLightTestPhase(activity = current, { now = Date.now() } = {}) {
  if (!activity?.phase) return '';
  return now - Number(activity.at || 0) < LIGHT_TEST_ACTIVITY_MAX_MS ? activity.phase : '';
}

export function subscribeLightTestActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
