// One first-install state for every install panel on screen.
//
// A blank card's first install restarts the card. While it is off the air
// Card Home rebuilds its steps, and the install panel is rebuilt with them, so
// state kept inside the panel was lost mid-save: the rebuilt panel saw a card
// that was no longer blank, and its ordinary install control (auto-started by
// next=patterns) sent the same project a second time (real card
// lw-b0fe81f61b44, live Studio 2653, 2026-11-23: two POST /api/config, two
// restarts, one press). Kept here, the state outlives any rebuild, so one
// press is one write whichever panel is on screen.
//
// phase: '' (no first install), 'running', 'done'.
// status/message: what the blank-card Save to card button shows.
const IDLE = Object.freeze({ phase: '', status: 'idle', message: '' });
let state = IDLE;
const listeners = new Set();

export function getFirstInstallState() {
  return state;
}

export function setFirstInstallState(patch) {
  state = Object.freeze({ ...state, ...patch });
  for (const listener of listeners) listener();
}

export function resetFirstInstallState() {
  state = IDLE;
  for (const listener of listeners) listener();
}

export function subscribeFirstInstallState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
