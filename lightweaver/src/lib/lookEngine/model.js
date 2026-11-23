// The piece model: everything the screen needs about the owner's strips, built
// once from the shown strips and then only read.
//
//   buildPieceModel(strips, { fold, centre, together }) ->
//     { derived, map, preview, names, areaOfStrip, strips }
//   `map` is the exact table; `preview` is that table as the card would receive
//   it (bytes and back), and is what every preview draws from.
//
//   frameByStrip(look, model, t) -> Map(stripId -> { leds: [{r,g,b}], avgR, avgG, avgB })
//   the shape the Layout canvas already draws LED dots from.

import { deriveAreas } from './areas.js';
import { buildPieceMap, previewPieceMap } from './pieceMap.js';
import { renderLook } from './render.js';
import { resolveJourney } from './journeys.js';
import { makePatternLights, patternStandIn } from './patternLight.js';

export function buildPieceModel(strips = [], { fold = 0, centre = null, together = [] } = {}) {
  const list = (strips || []).filter(strip => strip && strip.id != null);
  const derived = deriveAreas(list, { fold, centre, together });
  const map = buildPieceMap(list, derived, centre);
  const names = derived.areas.map(area => area.name);
  const areaOfStrip = new Map();
  derived.areas.forEach((area, index) => area.copies.forEach(copy => copy.forEach(id => areaOfStrip.set(id, index))));
  return { derived, map, preview: previewPieceMap(map), names, areaOfStrip, strips: list, lights: makePatternLights(list) };
}

/** The same render for the small pictures: patterns are stood in for by their swatch colours. */
export function thumbnailBytes(look, model, t) {
  return renderLook(look, model.preview, resolveJourney(look.journey), t, { standIn: patternStandIn });
}

export function frameByStrip(look, model, t) {
  const bytes = renderLook(look, model.preview, resolveJourney(look.journey), t, { lights: model.lights });
  const byStrip = new Map();
  let led = 0;
  for (const strip of model.strips) {
    const count = strip.pixels?.length || 0;
    const leds = [];
    let r = 0; let g = 0; let b = 0;
    for (let i = 0; i < count; i += 1, led += 1) {
      const px = { r: bytes[led * 3], g: bytes[led * 3 + 1], b: bytes[led * 3 + 2] };
      leds.push(px);
      r += px.r; g += px.g; b += px.b;
    }
    byStrip.set(strip.id, { leds, avgR: count ? Math.round(r / count) : 0, avgG: count ? Math.round(g / count) : 0, avgB: count ? Math.round(b / count) : 0 });
  }
  return byStrip;
}
