import { useSyncExternalStore } from 'react';

// The strip a "Mirror with…" checklist row is pointing at (hovered or
// focused), so the canvas can light that strip while the owner picks by eye.
// The checklist lives in the inspector and the canvas is its sibling, so the
// hint travels through this tiny store rather than through the screen.
let focusedStripId = null;
const listeners = new Set();

export function setMirrorEchoFocus(stripId) {
  const next = stripId || null;
  if (next === focusedStripId) return;
  focusedStripId = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMirrorEchoFocus() {
  return useSyncExternalStore(subscribe, () => focusedStripId, () => null);
}
