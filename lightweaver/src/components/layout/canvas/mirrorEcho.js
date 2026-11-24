import { useSyncExternalStore } from 'react';

// Two tiny hand-offs between the Layout inspector and the canvas, which are
// siblings: the hint travels through a store rather than through the screen.
//
// 1. Echo: the strip a sidebar row is pointing at (hovered), so the canvas
//    can light that strip while the owner arranges sides by eye.
// 2. Reveal: "Choose sides myself" on the canvas asks the inspector to bring
//    the symmetry sides into view. A counter, so every request is new.
function createStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set(next) {
      if (next === value) return;
      value = next;
      listeners.forEach(listener => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const echo = createStore(null);
const reveal = createStore(0);
// 3. Focus: the owner just chose a number of sides, so the canvas shows the
//    amber copies and the centre mark until they say Done. `centre` is null
//    until they drag the mark. Never saved: it is a way of looking.
const focus = createStore(null);

export function setMirrorEchoFocus(stripId) {
  echo.set(stripId || null);
}

export function useMirrorEchoFocus() {
  return useSyncExternalStore(echo.subscribe, echo.get, () => null);
}

export function setSymmetryFocus(value) {
  focus.set(value ? { centre: value.centre || null } : null);
}

export function useSymmetryFocus() {
  return useSyncExternalStore(focus.subscribe, focus.get, () => null);
}

export function requestSymmetryReveal() {
  reveal.set(reveal.get() + 1);
}

export function useSymmetryRevealRequest() {
  return useSyncExternalStore(reveal.subscribe, reveal.get, () => 0);
}

// 4. Placed look: the look the owner is trying on the artwork (lib/placedLook.js),
//    or null. The inspector's controls and the frame on the canvas both write
//    it. The try-out itself is in-session; "Save as a look" records it into the
//    project's recordings (placedLookRecording.js), and `savedAs` names the
//    recording it was saved as or opened from, so saving again updates that one.
const placedLook = createStore(null);
const placedLookSavedAs = createStore(null);

export function setPlacedLookPreview(look, { savedAs } = {}) {
  if (!look || savedAs !== undefined) placedLookSavedAs.set(look ? savedAs || null : null);
  placedLook.set(look || null);
}

export function setPlacedLookSavedAs(savedAs) {
  placedLookSavedAs.set(savedAs || null);
}

export function usePlacedLookSavedAs() {
  return useSyncExternalStore(placedLookSavedAs.subscribe, placedLookSavedAs.get, () => null);
}

export function usePlacedLookPreview() {
  return useSyncExternalStore(placedLook.subscribe, placedLook.get, () => null);
}
