import { useSyncExternalStore } from 'react';

// The look designer's hand-off between the Layout inspector (sliders, picks)
// and the canvas (LED colours, touch), which are siblings. Same idea as
// mirrorEcho.js's placed look: in-session only, never part of the project, so
// a reload starts without it.
//
//   { look, model, tiles, chosen, selected, tuneOpen, say, names }
//   names     the owner's own area names, { [areaId]: string }; a pick does not touch them
//   look      the look being played, or null when the designer is off
//   model     lib/lookEngine/model.js: areas and the piece map of the shown strips
//   tiles     the six looks on offer; chosen is the one picked, or -1
//   selected  the area the drawer edits (an area id)
const OFF = Object.freeze({ look: null, model: null, tiles: [], chosen: -1, selected: null, tuneOpen: false, say: '', names: {} });
let state = OFF;
const listeners = new Set();

export const getLookDesigner = () => state;
export function setLookDesigner(patch) {
  state = patch === null ? OFF : { ...state, ...patch };
  listeners.forEach(listener => listener());
}
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const useLookDesigner = () => useSyncExternalStore(subscribe, getLookDesigner, () => OFF);
