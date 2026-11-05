import { applyLookColorModifiers } from '../../../lib/previewColorModifiers.js';
import { sideFlipped } from '../../../lib/pieceSymmetry.js';

// Geometry and physical order are applied to completed, isolated RGB data only.
export function mapLayoutPatternFrame(frame, { strips, renderSegments, previewTime, mirrorSides, symmetry, hidden }) {
  const segmentById = new Map(renderSegments.map(segment => [segment.id, segment]));
  if (!renderSegments.length) return new Map(frame.stripFrames.map(stripFrame => [stripFrame.id, stripFrame]));
  const byStrip = new Map(strips.map(strip => [strip.id, {
    id: strip.id,
    // A newly duplicated strip can appear before its derived wiring zone.
    // Leave unrepresented LEDs undefined so the canvas uses its identity
    // color until reconciliation supplies the actual pattern frame.
    leds: Array(strip.pixels?.length || strip.pixelCount || 0),
    avgR: 0, avgG: 0, avgB: 0,
  }]));
  frame.stripFrames.forEach(stripFrame => {
    const segment = segmentById.get(stripFrame.id);
    if (!segment) return;
    applyLookColorModifiers(stripFrame.leds, previewTime * 1000, segment.visualLook || {});
    segment.pixels.forEach((pixel, ledIndex) => {
      const target = byStrip.get(pixel.stripId);
      if (target && Number.isInteger(pixel.sourceLed)) target.leds[pixel.sourceLed] = stripFrame.leds[ledIndex];
    });
  });
  // Mirrored sides: sides 2..n copy side 1's run stretched to their own
  // length, reversed where the flip rule says (same rule as the card).
  if (mirrorSides) {
    const runOf = side => (side?.stripIds || [])
      .filter(id => !hidden[id] && byStrip.has(id))
      // Array.from, not .map: an unrendered strip's LEDs are holes, and
      // .map skips holes.
      .flatMap(id => Array.from(byStrip.get(id).leds, (_, index) => ({ frame: byStrip.get(id), index })));
    const source = runOf(symmetry.sides[0]).map(({ frame, index }) => frame.leds[index]);
    if (source.length) {
      symmetry.sides.slice(1).forEach((side, offset) => {
        const flipped = sideFlipped(symmetry, offset + 1);
        const run = runOf(side);
        run.forEach(({ frame, index }, position) => {
          const at = flipped ? run.length - 1 - position : position;
          frame.leds[index] = source[run.length <= 1 || source.length <= 1
            ? 0 : Math.round(at * (source.length - 1) / (run.length - 1))];
        });
      });
    }
  }
  for (const stripFrame of byStrip.values()) {
    const active = stripFrame.leds.filter(Boolean);
    if (!active.length) continue;
    stripFrame.avgR = Math.round(active.reduce((sum, led) => sum + led.r, 0) / active.length);
    stripFrame.avgG = Math.round(active.reduce((sum, led) => sum + led.g, 0) / active.length);
    stripFrame.avgB = Math.round(active.reduce((sum, led) => sum + led.b, 0) / active.length);
  }
  return byStrip;
}
