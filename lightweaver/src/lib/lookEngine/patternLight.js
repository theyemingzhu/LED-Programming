// Pattern light: the area's colour can come from one of Studio's own patterns
// (Aurora, Lava Lamp, Fire, ...). The pattern is the LIGHT; the look only adds
// how that light moves across an area's copies and when the area begins.
//
// HOW STUDIO EVALUATES A PATTERN (surveyed, read-only):
//   frameEngine.renderPixelFrame({ t, strips: [{ id, pts: [{x, y, p}] }], patternId })
//   calls patterns.evalPixel(fn, index, nx, ny, t, time, pixelCount, palette, ...)
//   per LED. Inputs: the LED's position normalised over the WHOLE piece, its
//   index and the total count, strip progress `p`, and a time in seconds. It is
//   stateless, so any `t` can be asked for. A pattern is therefore evaluated
//   over the whole piece (so it looks exactly as it does in Patterns) and each
//   area then takes its own LEDs' colours from that frame.
//
// This file is the only part of the engine that touches the pattern library,
// and it is handed to renderLook as `lights`, so render.js stays pure.

import { renderPixelFrame, compilePattern, normalizePalette } from '../frameEngine.js';
import { PALETTE_DEFAULT } from '../../data.js';
import { getPatternById, listPatterns } from '../patternRegistry.js';
import { resolvePreviewPatternId } from '../patternPiecePreview.js';

const finite = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);

/** The project's real patterns, by their existing names: [{ id, name }]. */
export function patternChoices() {
  return listPatterns().map(pattern => ({ id: pattern.id, name: pattern.name || pattern.id }));
}

// Ids on the Patterns screen are card pattern ids; most are library ids, a few map to one.
const libraryId = id => (id ? resolvePreviewPatternId(id) : null);
export const hasPattern = id => Boolean(libraryId(id));

const compiled = new Map();
function compiledPattern(requested) {
  const id = libraryId(requested);
  if (!id) return null;
  const code = getPatternById(id)?.code;
  if (code === undefined) return null;
  const hit = compiled.get(id);
  if (hit && hit.code === code) return hit.fn;
  const fn = compilePattern(id);
  compiled.set(id, { code, fn });
  return fn;
}

/**
 * `lights(patternId, t) -> Uint8Array(3 * LEDs) | null` for these strips (the
 * piece map's order). null when the pattern does not exist or does not compile.
 * The last frame asked for is remembered, so several areas on one pattern cost one frame.
 */
export function makePatternLights(strips = [], { params = {} } = {}) {
  const frameStrips = strips.map(strip => {
    const pixels = strip.pixels || [];
    const n = pixels.length;
    return {
      id: strip.id,
      pts: pixels.map((point, index) => ({
        x: finite(point) ? point.x : 0, y: finite(point) ? point.y : 0, p: n > 1 ? index / (n - 1) : 0,
      })),
    };
  });
  const palette = normalizePalette(PALETTE_DEFAULT);
  let last = null;
  return (patternId, t) => {
    if (last && last.id === patternId && last.t === t) return last.bytes;
    const fn = compiledPattern(patternId);
    if (!fn) return null;
    const { pixels } = renderPixelFrame({ t, strips: frameStrips, patternId: libraryId(patternId), activeFn: fn, paletteNorm: palette, params });
    const bytes = new Uint8Array(pixels.length * 3);
    pixels.forEach((px, i) => { bytes[i * 3] = px.r; bytes[i * 3 + 1] = px.g; bytes[i * 3 + 2] = px.b; });
    last = { id: patternId, t, bytes };
    return bytes;
  };
}

const HEX = /#([0-9a-f]{6})/gi;
const toRgb = hex => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];

/**
 * A cheap stand-in for a pattern's light: the colours of the pattern's own
 * preview swatch as a short journey. Used for the six small thumbnails, so
 * they do not evaluate six patterns every frame. The main canvas uses the
 * real pattern.
 */
export function patternStandIn(patternId) {
  const swatch = getPatternById(libraryId(patternId) || '')?.preview || '';
  const colours = [...swatch.matchAll(HEX)].map(match => toRgb(match[1]));
  return colours.length >= 2 ? colours : null;
}
