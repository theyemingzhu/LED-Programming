// The light check after a blank card's first whole-project save (Find my
// strips, combined flow, way in 1: todo/plans/find-strips-redesign.md §7).
//
// Studio already knows the wiring, so nothing is counted. Two questions, each
// answered by looking at the lights:
//   1. Colour: lights 1, 2 and 3 of the first strip show red, green and blue
//      as sent. The row the owner taps is the colour-order measurement.
//   2. Ends: every light dim, and the last light of every output purple, all
//      at once. The card drives exactly the saved count, so nothing past it can
//      light: the question is whether purple sits on each strip's last light.
//
// Frames are in the card's pixel order: compiled outputs, each at its start.
import {
  DISCOVERY_COLOUR_CHECK_COLORS,
  DISCOVERY_END_MARKER_COLOR,
  DISCOVERY_OFF_COLOR,
  DISCOVERY_PROBE_COLOR,
  channelMapFromColourRow,
  namedColorOrderFromChannelMap,
} from './stripDiscovery.js';

function outputsOf(outputs) {
  return (Array.isArray(outputs) ? outputs : [])
    .map(output => ({ start: Math.max(0, Math.trunc(Number(output?.start) || 0)), count: Math.max(0, Math.trunc(Number(output?.count) || 0)) }))
    .filter(output => output.count > 0);
}

export function firstCheckPixelTotal(outputs) {
  return outputsOf(outputs).reduce((total, output) => Math.max(total, output.start + output.count), 0);
}

export function buildFirstCheckColourFrame(outputs) {
  const list = outputsOf(outputs);
  const frame = new Array(firstCheckPixelTotal(list)).fill(DISCOVERY_OFF_COLOR);
  const first = list[0];
  if (!first) return frame;
  DISCOVERY_COLOUR_CHECK_COLORS.forEach((color, offset) => {
    if (offset < first.count) frame[first.start + offset] = color;
  });
  return frame;
}

export function buildFirstCheckEndsFrame(outputs) {
  const list = outputsOf(outputs);
  const frame = new Array(firstCheckPixelTotal(list)).fill(DISCOVERY_OFF_COLOR);
  for (const output of list) {
    for (let offset = 0; offset < output.count; offset += 1) frame[output.start + offset] = DISCOVERY_PROBE_COLOR;
    frame[output.start + output.count - 1] = DISCOVERY_END_MARKER_COLOR;
  }
  return frame;
}

/**
 * The owner's colour row against the colour order the card was saved with.
 * { ok: true } when the strip shows red, green, blue as sent; otherwise the
 * order that would, and the channel map to correct frames until it is saved.
 */
export function colourRowVerdict(row, savedOrder = 'GRB') {
  const map = channelMapFromColourRow(row);
  if (!map) return { ok: false, valid: false, map: null, colorOrder: '' };
  const identity = map.red === 0 && map.green === 1 && map.blue === 2;
  if (identity) return { ok: true, valid: true, map, colorOrder: String(savedOrder || '').toUpperCase() };
  return { ok: false, valid: true, map, colorOrder: namedColorOrderFromChannelMap(map, savedOrder) };
}
