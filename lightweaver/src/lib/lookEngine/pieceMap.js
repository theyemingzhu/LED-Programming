// The piece map: for every LED of every strip, where it sits in the piece.
// This table is EXACTLY what a future card update will receive, so the preview
// is computed from it and from nothing else (render.js reads no strips).
//
//   { areaIds: [id], copyCounts: [n], leds: [{ area, copy, shape, out }] }
//     area   index into `areas` (centre first), -1 when a strip belongs to none
//     copy   which copy of the area, clockwise from the top
//     shape  0..1 along the LED's own shape (a closed loop: from the light nearest the
//            centre, clockwise, so each copy starts in the same place)
//     out    0..1 from the piece centre, within its area's own range
//
// BYTES (encodePieceMap), little endian, 4 + 3 * LEDs:
//   [0] version (1)   [1..2] LED count (u16)   [3] area count
//   per LED, 3 bytes:
//     byte 0  area (bits 7..5, 0..7) | copy (bits 4..0, 0..30); 0xFF = in no area
//     byte 1  shape * 255, rounded
//     byte 2  out * 255, rounded
// Limits: 8 areas, 31 copies, 65535 LEDs. encodePieceMap throws a RangeError
// beyond them (a piece whose strips match nothing can have more areas than fit).

import { stripCentroid } from '../mirrorPartners.js';

export const PIECE_MAP_VERSION = 1;
export const PIECE_MAP_MAX_AREAS = 8;
export const PIECE_MAP_MAX_COPIES = 31;
const NO_AREA = 0xff;
const finite = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);

/** Build the table. `strips` are in the order the preview draws them; `centre` is the piece centre (or null). */
export function buildPieceMap(strips = [], derived = { areas: [], flips: {} }, centre = null) {
  const where = new Map();
  derived.areas.forEach((area, areaIndex) => area.copies.forEach((copy, copyIndex) => copy.forEach(id => where.set(id, { area: areaIndex, copy: copyIndex }))));
  const middle = finite(centre) ? centre : (() => {
    const mids = strips.map(stripCentroid).filter(Boolean);
    return mids.length ? { x: mids.reduce((s, m) => s + m.x, 0) / mids.length, y: mids.reduce((s, m) => s + m.y, 0) / mids.length } : { x: 0, y: 0 };
  })();
  const leds = [];
  const range = derived.areas.map(() => ({ min: Infinity, max: -Infinity }));
  for (const strip of strips) {
    const slot = where.get(strip.id);
    const pixels = strip.pixels || [];
    const flipped = derived.flips?.[strip.id] === true;
    pixels.forEach((point, index) => {
      const radius = finite(point) ? Math.hypot(point.x - middle.x, point.y - middle.y) : 0;
      const loop = derived.loops?.[strip.id];
      // A loop is read from its start, clockwise, so every copy of it begins in the same place.
      const shape = loop ? (((index - loop.start) * loop.dir) % pixels.length + pixels.length) % pixels.length / pixels.length
        : pixels.length > 1 ? index / (pixels.length - 1) : 0;
      leds.push({ area: slot ? slot.area : -1, copy: slot ? slot.copy : 0, shape: flipped ? 1 - shape : shape, out: radius });
      if (slot) { range[slot.area].min = Math.min(range[slot.area].min, radius); range[slot.area].max = Math.max(range[slot.area].max, radius); }
    });
  }
  for (const led of leds) {
    if (led.area < 0) { led.out = 0; continue; }
    const { min, max } = range[led.area];
    led.out = max > min ? (led.out - min) / (max - min) : 0.5;
  }
  return { areaIds: derived.areas.map(area => area.id), copyCounts: derived.areas.map(area => area.copies.length), leds };
}

const byte = value => Math.max(0, Math.min(255, Math.round(value * 255)));

export function encodePieceMap(map) {
  const leds = map?.leds || [];
  const areaCount = map?.copyCounts?.length || 0;
  if (leds.length > 0xffff) throw new RangeError('A piece map holds up to 65535 lights.');
  if (areaCount > PIECE_MAP_MAX_AREAS) throw new RangeError(`A piece map holds up to ${PIECE_MAP_MAX_AREAS} areas.`);
  const bytes = new Uint8Array(4 + leds.length * 3);
  bytes[0] = PIECE_MAP_VERSION;
  bytes[1] = leds.length & 0xff;
  bytes[2] = leds.length >> 8;
  bytes[3] = areaCount;
  leds.forEach((led, index) => {
    const at = 4 + index * 3;
    if (led.area < 0) bytes[at] = NO_AREA;
    else {
      if (led.copy >= PIECE_MAP_MAX_COPIES) throw new RangeError(`A piece map holds up to ${PIECE_MAP_MAX_COPIES} copies of an area.`);
      bytes[at] = (led.area << 5) | led.copy;
    }
    bytes[at + 1] = byte(led.shape);
    bytes[at + 2] = byte(led.out);
  });
  return bytes;
}

export function decodePieceMap(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== PIECE_MAP_VERSION) throw new TypeError('This is not a piece map this Studio can read.');
  const count = bytes[1] | (bytes[2] << 8);
  if (bytes.length !== 4 + count * 3) throw new TypeError('The piece map is the wrong length.');
  const copyCounts = Array.from({ length: bytes[3] }, () => 0);
  const leds = [];
  for (let index = 0; index < count; index += 1) {
    const at = 4 + index * 3;
    const first = bytes[at];
    const none = first === NO_AREA;
    const area = none ? -1 : first >> 5;
    const copy = none ? 0 : first & 31;
    if (!none && area < copyCounts.length) copyCounts[area] = Math.max(copyCounts[area], copy + 1);
    leds.push({ area, copy, shape: bytes[at + 1] / 255, out: bytes[at + 2] / 255 });
  }
  return { areaIds: null, copyCounts, leds };
}

/** The table the preview should use: what the card would receive when it fits, else the exact table. */
export function previewPieceMap(map) {
  try {
    const decoded = decodePieceMap(encodePieceMap(map));
    return { ...decoded, areaIds: map.areaIds, copyCounts: map.copyCounts };
  } catch {
    return map;
  }
}
