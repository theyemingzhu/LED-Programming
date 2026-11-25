// A placed look: a frame the owner drags over the strips on the Layout canvas.
// Inside it a moving picture runs as a sweep (a bar crossing the frame) or as
// rings (growing from the frame's centre), and each LED takes the colour under
// it. Outside the frame the lights are dark.
//
//   { kind: 'placed', mode: 'sweep' | 'rings',
//     frame: { x, y, halfWidth, halfHeight, turn },
//     colours: [[r, g, b], [r, g, b]],
//     width, softness, repeat, speed, reverse, alikeOnSides }
//
// COORDINATES. `frame.x/y/halfWidth/halfHeight` are in the same space as a
// strip's `pixels`: artwork viewBox units with the strip's own `x`/`y` move
// already added (layoutGeometry.sampleStripPixels bakes it in, and the Layout
// canvas draws the LED dots at `pixels[i]` with no further transform). So the
// frame stays on the artwork when the view zooms or pans. `turn` is degrees,
// clockwise on screen.
//
// MATHS (the approved sketch). Frame-local u, v run 0..1 across the frame.
//   along  = u                              (sweep)
//          = 2 * hypot(u - .5, v - .5)      (rings)
//   p      = fract(along * repeat - phase * dir)      phase = t * speed
//   d      = |p - .5| * 2                   0 mid-band, 1 at its edge
//   level  = smoothstep over the last `softness * width` of the band
//   colour = mix(colourA, colourB, p) * level
// `speed` is whole passes per second, so the picture repeats every 1 / speed s.
//
// Every function here is pure: it returns new objects and never mutates input.

import { applySymmetrySides } from './mirrorFrame.js';
import { LWSEQ_HEADER_BYTES, toLwseqBytes } from './standaloneController.js';

// The same two limits the other recorders use. Kept as literals so this file
// does not pull the Pattern Lab baker or the asset store into Layout;
// placedLook.test.js fails if either drifts from lwseqBake.js (MAX_BAKE_FPS)
// or recordedSequenceAsset.js (MAX_STORED_SEQUENCE_BYTES).
export const PLACED_LOOK_MAX_FPS = 24;
export const PLACED_LOOK_MAX_BYTES = 16 * 1024 * 1024;
export const PLACED_LOOK_MAX_PIXELS = 4096;

export const PLACED_LOOK_PALETTES = Object.freeze({
  ember: Object.freeze([Object.freeze([255, 196, 96]), Object.freeze([214, 72, 30])]),
  tide: Object.freeze([Object.freeze([150, 230, 255]), Object.freeze([40, 96, 210])]),
  moss: Object.freeze([Object.freeze([214, 240, 150]), Object.freeze([52, 150, 96])]),
});

export const PLACED_LOOK_LIMITS = Object.freeze({
  width: [0.05, 0.9],
  softness: [0, 1],
  repeat: [1, 6],
  speed: [0, 1],
  turn: [-180, 180],
  minHalf: 1,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback);
const fract = value => value - Math.floor(value);
const rad = degrees => degrees * Math.PI / 180;
const BLACK = Object.freeze({ r: 0, g: 0, b: 0 });

function normalizeColour(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [0, 1, 2].map(index => clamp(Math.round(number(value[index], fallback[index])), 0, 255));
}

const finitePoints = strip => (strip?.pixels || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));

/** A frame that covers every LED with a little room, or a plain one when there are none. */
export function defaultPlacedLookFrame(strips = []) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const strip of strips || []) {
    for (const point of finitePoints(strip)) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, halfWidth: 100, halfHeight: 100, turn: 0 };
  const room = Math.max(maxX - minX, maxY - minY) * 0.06 + 4;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    halfWidth: (maxX - minX) / 2 + room,
    halfHeight: (maxY - minY) / 2 + room,
    turn: 0,
  };
}

/** Clamp and fill in a placed look. Always returns a new, complete record. */
export function normalizePlacedLook(value, { strips = null } = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const rawFrame = raw.frame && typeof raw.frame === 'object' ? raw.frame : {};
  const home = defaultPlacedLookFrame(strips || []);
  const limits = PLACED_LOOK_LIMITS;
  const coloursIn = Array.isArray(raw.colours) ? raw.colours : [];
  return {
    kind: 'placed',
    mode: raw.mode === 'sweep' ? 'sweep' : 'rings',
    frame: {
      x: number(rawFrame.x, home.x),
      y: number(rawFrame.y, home.y),
      halfWidth: Math.max(limits.minHalf, Math.abs(number(rawFrame.halfWidth, home.halfWidth))),
      halfHeight: Math.max(limits.minHalf, Math.abs(number(rawFrame.halfHeight, home.halfHeight))),
      turn: clamp(number(rawFrame.turn, 0), ...limits.turn),
    },
    colours: [
      normalizeColour(coloursIn[0], PLACED_LOOK_PALETTES.ember[0]),
      normalizeColour(coloursIn[1], PLACED_LOOK_PALETTES.ember[1]),
    ],
    width: clamp(number(raw.width, 0.38), ...limits.width),
    softness: clamp(number(raw.softness, 0.7), ...limits.softness),
    repeat: clamp(Math.round(number(raw.repeat, 2)), ...limits.repeat),
    speed: clamp(number(raw.speed, 0.3), ...limits.speed),
    reverse: raw.reverse === true,
    alikeOnSides: raw.alikeOnSides !== false,
  };
}

/** The same look with its frame's centre on `centre`. */
export function placedLookOnCentre(look, centre) {
  if (!Number.isFinite(centre?.x) || !Number.isFinite(centre?.y)) return look;
  return { ...look, frame: { ...look.frame, x: centre.x, y: centre.y } };
}

/** Artwork point -> the frame's own 0..1 space (outside the frame is outside 0..1). */
export function toPlacedFrame(look, point) {
  const frame = look.frame;
  const c = Math.cos(rad(-frame.turn));
  const s = Math.sin(rad(-frame.turn));
  const dx = point.x - frame.x;
  const dy = point.y - frame.y;
  return {
    u: (dx * c - dy * s) / (2 * frame.halfWidth) + 0.5,
    v: (dx * s + dy * c) / (2 * frame.halfHeight) + 0.5,
  };
}

/** The frame's four corners in artwork space: top-left, top-right, bottom-right, bottom-left. */
export function placedFrameCorners(look) {
  const frame = look.frame;
  const c = Math.cos(rad(frame.turn));
  const s = Math.sin(rad(frame.turn));
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({
    x: frame.x + i * frame.halfWidth * c - j * frame.halfHeight * s,
    y: frame.y + i * frame.halfWidth * s + j * frame.halfHeight * c,
  }));
}

// Brightness 0..1 and place in the colour range for `band` = along * repeat
// and a phase counted in whole passes.
function bandAt(look, band, phase) {
  const p = fract(band - phase * (look.reverse ? -1 : 1));
  const d = Math.abs(p - 0.5) * 2;
  const half = look.width;
  const edge = Math.max(0.02, look.softness * half);
  const level = d <= half - edge ? 1 : d >= half ? 0 : (half - d) / edge;
  return { level: level * level * (3 - 2 * level), mix: p };
}

function levelAt(look, u, v, phase) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const along = look.mode === 'rings' ? Math.hypot(u - 0.5, v - 0.5) * 2 : u;
  return bandAt(look, along * look.repeat, phase);
}

function colourAtPhase(look, point, phase) {
  const { u, v } = toPlacedFrame(look, point);
  const hit = levelAt(look, u, v, phase);
  if (!hit) return null;
  const [a, b] = look.colours;
  return [0, 1, 2].map(index => Math.round((a[index] + (b[index] - a[index]) * hit.mix) * hit.level));
}

/**
 * The colour under one artwork point at time `t` (seconds): `[r, g, b]`, or
 * null outside the frame. A bare point belongs to no side, so "alike on all
 * sides" is not applied here: placedLookFrame applies it, from the piece's own
 * side membership.
 */
export function placedLookColour(look, point, t = 0) {
  return colourAtPhase(look, point, t * look.speed);
}

function frameAtPhase(look, strips, phase, { symmetry = null } = {}) {
  const pixels = [];
  for (const strip of strips) {
    for (const point of strip.pixels || []) {
      const rgb = Number.isFinite(point?.x) && Number.isFinite(point?.y) ? colourAtPhase(look, point, phase) : null;
      pixels.push(rgb ? { r: rgb[0], g: rgb[1], b: rgb[2] } : BLACK);
    }
  }
  // Sides 2..n take side 1's finished colours through the same copy the
  // preview and the recorders already use (strip order inside a side, stretch
  // to length, flip rule), so a placed look agrees with every other look.
  if (look.alikeOnSides && symmetry) applySymmetrySides({ framePixels: pixels, strips, symmetry, sidesMirrored: true });
  const byStrip = new Map();
  let offset = 0;
  for (const strip of strips) {
    const count = strip.pixels?.length || 0;
    const leds = pixels.slice(offset, offset + count);
    offset += count;
    let r = 0, g = 0, b = 0;
    for (const led of leds) { r += led.r; g += led.g; b += led.b; }
    byStrip.set(strip.id, {
      leds,
      avgR: count ? Math.round(r / count) : 0,
      avgG: count ? Math.round(g / count) : 0,
      avgB: count ? Math.round(b / count) : 0,
    });
  }
  return { pixels, byStrip };
}

/**
 * Colours for every LED of every strip, in LED order, at time `t`.
 * `strips` are the strips that are showing, in their usual order.
 * Returns `{ pixels, byStrip }`: `pixels` is flat (strip after strip) and
 * `byStrip` maps a strip id to `{ leds, avgR, avgG, avgB }`, the shape the
 * Layout canvas already draws from. With `alikeOnSides` and `options.symmetry`,
 * sides 2..n show what side 1 shows.
 */
export function placedLookFrame(look, strips = [], t = 0, options = {}) {
  return frameAtPhase(look, strips || [], t * look.speed, options);
}

/**
 * One repeat of the picture as gradient stops, for drawing it faintly inside
 * the frame: `offset` 0..1 across one repeat, `rgb` the full colour there and
 * `level` its brightness. A sweep is a linear gradient across 1 / repeat of
 * the frame's width; rings are a radial one of radius 0.5 / repeat; both repeat.
 */
export function placedLookStops(look, t = 0, count = 32) {
  const phase = t * look.speed;
  const [a, b] = look.colours;
  return Array.from({ length: count + 1 }, (_, index) => {
    const offset = index / count;
    // The last stop is the first one again, one repeat on.
    const hit = bandAt(look, index === count ? 0 : offset, phase);
    return { offset, level: hit.level, rgb: [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * hit.mix)) };
  });
}

/**
 * How long a recording runs so that it loops without a seam.
 *
 * RULE. The picture repeats after every whole pass, and a pass takes
 * 1 / speed seconds. So the recording holds a whole number of passes, the
 * nearest to the seconds asked for (at least one), and a whole number of
 * frames. Each frame then moves the picture by exactly passes / frames, which
 * lands the frame after the last one precisely on the first. That nudges the
 * speed by under half a frame per loop. A look that does not move is one frame.
 */
export function placedLookLoop(look, { seconds = 20, fps = PLACED_LOOK_MAX_FPS } = {}) {
  if (!Number.isSafeInteger(fps) || fps < 1 || fps > PLACED_LOOK_MAX_FPS) {
    throw new RangeError(`A recording runs at 1 to ${PLACED_LOOK_MAX_FPS} frames a second.`);
  }
  if (!(Number(seconds) > 0)) throw new RangeError('A recording needs a length in seconds.');
  if (!(look.speed > 0)) return { passes: 0, frameCount: 1, fps, seconds: 1 / fps };
  const passes = Math.max(1, Math.round(seconds * look.speed));
  const frameCount = Math.max(1, Math.round(passes * fps / look.speed));
  return { passes, frameCount, fps, seconds: frameCount / fps };
}

function bakeOutputs(compiledWiring) {
  if (!compiledWiring?.ok || !Array.isArray(compiledWiring.pixels) || !compiledWiring.pixels.length) {
    throw new TypeError('A recording needs the wiring: it follows the order the lights are wired in.');
  }
  const outputs = (compiledWiring.outputs || []).map(output => ({
    id: String(output.id),
    pin: Number(output.pin),
    pixels: compiledWiring.pixels.filter(pixel => String(pixel.outputId) === String(output.id)).length,
  })).filter(output => output.pixels > 0);
  if (!outputs.length || outputs.reduce((sum, output) => sum + output.pixels, 0) !== compiledWiring.pixels.length) {
    throw new TypeError('The wiring does not account for every light, so a recording cannot follow it.');
  }
  if (compiledWiring.pixels.length > PLACED_LOOK_MAX_PIXELS) {
    throw new RangeError(`A recording holds up to ${PLACED_LOOK_MAX_PIXELS} lights.`);
  }
  return outputs;
}

/** Size of a recording before making it: `{ passes, frameCount, fps, seconds, pixelCount, totalBytes, maxBytes, fits }`. */
export function estimatePlacedLookBake(look, compiledWiring, options = {}) {
  bakeOutputs(compiledWiring);
  const loop = placedLookLoop(look, options);
  const pixelCount = compiledWiring.pixels.length;
  const totalBytes = LWSEQ_HEADER_BYTES + pixelCount * 3 * loop.frameCount;
  const maxBytes = Math.min(PLACED_LOOK_MAX_BYTES, options.maxBytes ?? PLACED_LOOK_MAX_BYTES);
  return { ...loop, pixelCount, totalBytes, maxBytes, fits: totalBytes <= maxBytes };
}

// For each physical pixel (compiledWiring.pixels order), the index of the
// strip LED it shows in a frameAtPhase frame, or -1 for a dark pixel.
function physicalSources(strips, compiledWiring) {
  const slots = new Map();
  let offset = 0;
  for (const strip of strips) {
    slots.set(strip.id, offset);
    offset += strip.pixels?.length || 0;
  }
  return compiledWiring.pixels.map(pixel => {
    if (pixel.inactive || pixel.stripId == null || !Number.isFinite(pixel.sourceLed)) return -1;
    const start = slots.get(pixel.stripId);
    return Number.isFinite(start) ? start + pixel.sourceLed : -1;
  });
}

const hex2 = value => value.toString(16).padStart(2, '0');

/**
 * The look at time `t` as one frame for the card's live stream: hex colours
 * ('rrggbb') in the card's physical pixel order, the same order and mapping a
 * recording uses. `strips` are all the project's strips. Returns [] when the
 * wiring cannot be followed.
 */
export function placedLookPhysicalFrame(look, strips = [], compiledWiring = null, t = 0, options = {}) {
  if (!compiledWiring?.ok || !Array.isArray(compiledWiring.pixels) || !compiledWiring.pixels.length) return [];
  const { pixels } = frameAtPhase(look, strips || [], t * look.speed, { symmetry: options.symmetry || null });
  return physicalSources(strips || [], compiledWiring).map(source => {
    const colour = source >= 0 ? pixels[source] || BLACK : BLACK;
    return hex2(colour.r) + hex2(colour.g) + hex2(colour.b);
  });
}

/**
 * Record the look as an LWSEQ1 file in the card's physical pixel order.
 *
 * The order is `compiledWiring.pixels` (wiringCompiler.js): the one list every
 * other recorder writes from (lwseqBake.js through export.remapFrameToWiring,
 * sceneExpressionRecording.js through its frame mapping). Each physical pixel
 * names its strip and LED; a pixel with no strip is written dark. `strips` are
 * the project's strips (all of them: the card has no "hidden").
 * `options`: `{ seconds, fps, symmetry, maxBytes }`. Throws a RangeError when
 * the file would pass the per-look limit; estimatePlacedLookBake says so first.
 * Returns `{ bytes, byteLength, frameCount, fps, seconds, passes, pixelCount, outputs }`.
 */
export function bakePlacedLook(look, strips = [], compiledWiring = null, options = {}) {
  const outputs = bakeOutputs(compiledWiring);
  const estimate = estimatePlacedLookBake(look, compiledWiring, options);
  if (!estimate.fits) {
    throw new RangeError(`This recording would be ${estimate.totalBytes} bytes; a look can be up to ${estimate.maxBytes}.`);
  }
  const { frameCount, fps, passes, pixelCount } = estimate;
  const order = physicalSources(strips, compiledWiring);
  // The header comes from the one LWSEQ writer; the frames are then written
  // straight into place, as the other recorders do.
  const template = toLwseqBytes([Array.from({ length: pixelCount }, () => BLACK)], { fps, outputs });
  const bytes = new Uint8Array(estimate.totalBytes);
  bytes.set(template.subarray(0, LWSEQ_HEADER_BYTES));
  new DataView(bytes.buffer).setUint32(16, frameCount, true);
  let cursor = LWSEQ_HEADER_BYTES;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const { pixels } = frameAtPhase(look, strips, frameIndex * passes / frameCount, { symmetry: options.symmetry || null });
    for (const source of order) {
      const colour = source >= 0 ? pixels[source] || BLACK : BLACK;
      bytes[cursor++] = colour.r;
      bytes[cursor++] = colour.g;
      bytes[cursor++] = colour.b;
    }
  }
  return { bytes, byteLength: bytes.byteLength, frameCount, fps, seconds: estimate.seconds, passes, pixelCount, outputs };
}
