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

export function setMirrorEchoFocus(stripId) {
  echo.set(stripId || null);
}

export function useMirrorEchoFocus() {
  return useSyncExternalStore(echo.subscribe, echo.get, () => null);
}

export function requestSymmetryReveal() {
  reveal.set(reveal.get() + 1);
}

export function useSymmetryRevealRequest() {
  return useSyncExternalStore(reveal.subscribe, reveal.get, () => 0);
}
