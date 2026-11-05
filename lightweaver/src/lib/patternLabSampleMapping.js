import { mirrorSourceIndex, planSymmetrySides, sideRunByStrip } from './mirrorFrame.js';

// Decimation chooses display pixels, not a new side length or a new pattern
// index domain. Resolve mirrored display pixels to the exact full lead pixel
// first, so compositing and per-strip controls run on the same source as full.
export function planPatternLabSideSamples(geometry, requestedIndices) {
  const fullStrips = geometry.strips.map(strip => ({ ...strip, pts: { length: strip.count } }));
  const sides = planSymmetrySides({ symmetry: geometry.symmetry, strips: fullStrips });
  const byStrip = sideRunByStrip({ symmetry: geometry.symmetry, strips: fullStrips });
  const lead = sides[0];
  const sourceIndices = [...requestedIndices].map(index => {
    const strip = geometry.strips.find(item => index >= item.start && index < item.start + item.count);
    const run = strip && byStrip.get(strip.id);
    const side = run && sides.find(item => item.id === run.sideId);
    if (geometry.sidesMirrored === false || !lead?.length || !side?.index) return index;
    const along = run.before + index - strip.start;
    const logical = side.flip ? side.length - 1 - along : along;
    const source = mirrorSourceIndex(logical, side.length, lead.length);
    const span = lead.spans.find(item => source >= item.before && source < item.before + item.length);
    return span.offset + source - span.before;
  });
  const indices = Uint32Array.from([...new Set(sourceIndices)].sort((a, b) => a - b));
  const slots = new Map([...indices].map((index, slot) => [index, slot]));
  return { indices, slots: sourceIndices.map(index => slots.get(index)), fullRuns: byStrip };
}

export function sampledSideContexts(geometry, strips, fullRuns) {
  const sampledRuns = sideRunByStrip({ symmetry: geometry.symmetry, strips });
  const contexts = new Map();
  for (const strip of strips) {
    const full = fullRuns.get(strip.id);
    if (!full) continue;
    contexts.set(strip.id, {
      full, sampled: sampledRuns.get(strip.id),
      start: geometry.strips.find(item => item.id === strip.id).start,
      indices: strip.pts.map(point => point.i),
      hasKaleidoscope: Boolean(strip.pts[0]?.hasKaleidoscope),
    });
  }
  return contexts;
}

// Worker frames already contain side flow, mirrors and final color controls.
// The canvas lookup consumes global visible-pixel indices and must only decode.
export function patternLabDisplayStrips(strips = []) {
  return strips.map(strip => {
    const { run, mirrorOf, mirrorFlip, visualLook, compiledFn, patternFn, ...geometry } = strip;
    return { ...geometry, patternId: null, brightness: 1, speed: 1, hueShift: 0 };
  });
}

export function patternLabWorkerColorLookup(frame) {
  if (!frame?.colors?.length || !frame?.indices?.length) return null;
  const { colors, indices } = frame;
  return index => {
    let low = 0, high = indices.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (indices[middle] < index) low = middle + 1;
      else high = middle;
    }
    let selected = low;
    if (selected > 0 && Math.abs(indices[selected - 1] - index) <= Math.abs(indices[selected] - index)) selected--;
    return { r: colors[selected * 3], g: colors[selected * 3 + 1], b: colors[selected * 3 + 2] };
  };
}
