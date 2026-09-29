// Studio-preview half of "symmetry sides".
//
// A piece with symmetry has 2 or 4 SIDES; each side is an ordered list of
// strips that plays as ONE continuous run (the pattern flows through the strips
// in stripIds order). When the look mirrors its sides, sides 2..n show side 1's
// colours, stretched to their own length and reversed for the sides the flip
// rule flips, so the preview matches what the card plays.
//
// Colours are copied, never re-evaluated: evalPixel receives the pixel's own
// coordinates, so evaluating the pattern on a twin's geometry would not
// reproduce the lead.
//
// `symmetry` is the plain object persisted as `layout.symmetry`:
//   { fold: 2 | 4, orientation: 'mirror' | 'same',
//     sides: [{ id, label, stripIds: [stripId, ...] }, ...] }
//
// A virtual strip (a Patterns preview segment) may also carry
// `mirrorOf: '<stripId>'` and `mirrorFlip: boolean`, the same two fields the
// card's runtime config uses on a zone. `applyStripMirrors` honours those.

/** Index into a lead of `leadLength` LEDs for LED `i` of a twin of `twinLength`. */
export function mirrorSourceIndex(i, twinLength, leadLength) {
  if (twinLength <= 1 || leadLength <= 1) return 0;
  return Math.round(i * (leadLength - 1) / (twinLength - 1));
}

/** Flip rule: side index i (0-based) plays flipped when the sides are mirror images and i is odd. */
export function sideFlippedByRule(symmetry, sideIndex) {
  return symmetry?.orientation === 'mirror' && sideIndex % 2 === 1;
}

function stripLength(strip) {
  return strip?.pts?.length ?? strip?.pixels?.length ?? 0;
}

function collectSlots(strips) {
  const slots = new Map();
  let offset = 0;
  for (let index = 0; index < strips.length; index++) {
    const strip = strips[index];
    const length = stripLength(strip);
    if (strip?.id != null) slots.set(strip.id, { index, offset, length });
    offset += length;
  }
  return slots;
}

/**
 * Work out each side's run over the strips that were actually rendered (the
 * visible ones, in render order). Returns `[]` when there is no usable symmetry.
 * A run is `{ id, index, flip, length, spans: [{ index, offset, length, before }] }`
 * where `before` is how many of the side's LEDs precede this strip.
 */
export function planSymmetrySides({ symmetry, strips = [] } = {}) {
  const sides = Array.isArray(symmetry?.sides) ? symmetry.sides : [];
  if (!sides.length) return [];
  const slots = collectSlots(strips);
  const runs = [];
  sides.forEach((side, sideIndex) => {
    const spans = [];
    let length = 0;
    for (const stripId of Array.isArray(side?.stripIds) ? side.stripIds : []) {
      const slot = slots.get(stripId);
      if (!slot || slot.length === 0) continue;
      spans.push({ ...slot, before: length });
      length += slot.length;
    }
    runs.push({
      id: side?.id ?? `side-${sideIndex + 1}`,
      index: sideIndex,
      flip: sideFlippedByRule(symmetry, sideIndex),
      length,
      spans,
    });
  });
  return runs;
}

/**
 * The per-strip view of that plan: `stripId -> { sideId, before, length }`, used
 * by the renderer so a side's strips share one continuous pattern run. Empty
 * (and free) when the piece has no symmetry.
 */
export function sideRunByStrip({ symmetry, strips = [] } = {}) {
  const byStrip = new Map();
  if (!symmetry) return byStrip;
  for (const run of planSymmetrySides({ symmetry, strips })) {
    for (const span of run.spans) {
      byStrip.set(strips[span.index].id, { sideId: run.id, before: span.before, length: run.length });
    }
  }
  return byStrip;
}

function readRun(framePixels, run) {
  const colors = new Array(run.length);
  let k = 0;
  for (const span of run.spans) {
    for (let i = 0; i < span.length; i++) colors[k++] = framePixels[span.offset + i];
  }
  return colors;
}

function writeRun(framePixels, stripFrames, run, sourceColors, flip) {
  const twinLength = run.length;
  const leadLength = sourceColors.length;
  let k = 0;
  for (const span of run.spans) {
    const twinFrame = stripFrames?.[span.index];
    const leds = twinFrame?.leds;
    let rSum = 0, gSum = 0, bSum = 0;
    for (let i = 0; i < span.length; i++, k++) {
      const logical = flip ? twinLength - 1 - k : k;
      const source = sourceColors[mirrorSourceIndex(logical, twinLength, leadLength)];
      if (!source) { const own = framePixels[span.offset + i]; if (own) { rSum += own.r; gSum += own.g; bSum += own.b; } continue; }
      const color = { r: source.r, g: source.g, b: source.b };
      framePixels[span.offset + i] = color;
      if (leds?.[i]) leds[i] = { ...leds[i], ...color };
      rSum += color.r; gSum += color.g; bSum += color.b;
    }
    if (twinFrame && span.length) {
      twinFrame.avgR = Math.round(rSum / span.length);
      twinFrame.avgG = Math.round(gSum / span.length);
      twinFrame.avgB = Math.round(bSum / span.length);
    }
  }
}

/**
 * Overwrite sides 2..n, in place, with side 1's colours. `strips` must be the
 * visible strips in the order the frame was rendered. Does nothing when there is
 * no symmetry, `sidesMirrored` is false, or side 1 has no visible LEDs (its
 * twins render themselves). Strips outside every side are never touched.
 * Returns `framePixels`.
 */
export function applySymmetrySides({ framePixels, stripFrames = null, strips = [], symmetry = null, sidesMirrored = true }) {
  if (!symmetry || sidesMirrored === false) return framePixels;
  const runs = planSymmetrySides({ symmetry, strips });
  const lead = runs[0];
  if (!lead || lead.length === 0) return framePixels;
  const sourceColors = readRun(framePixels, lead);
  for (let s = 1; s < runs.length; s++) {
    if (runs[s].length === 0) continue;
    writeRun(framePixels, stripFrames, runs[s], sourceColors, runs[s].flip);
  }
  return framePixels;
}

/**
 * Honour `mirrorOf` / `mirrorFlip` on virtual strips (Patterns preview
 * segments): each such strip copies the named strip's finished colours,
 * stretched to its own length, reversed when `mirrorFlip`. A source that is not
 * among the strips leaves the copy rendering itself. Returns `framePixels`.
 */
export function applyStripMirrors({ framePixels, stripFrames = null, strips = [] }) {
  if (!strips.some(strip => strip?.mirrorOf)) return framePixels;
  const slots = collectSlots(strips);
  for (const strip of strips) {
    if (!strip?.mirrorOf || strip.mirrorOf === strip.id) continue;
    const source = slots.get(strip.mirrorOf);
    const twin = strip.id != null ? slots.get(strip.id) : null;
    if (!source || !twin || source.length === 0 || twin.length === 0) continue;
    const sourceRun = { length: source.length, spans: [{ ...source, before: 0 }] };
    const twinRun = { length: twin.length, spans: [{ ...twin, before: 0 }] };
    writeRun(framePixels, stripFrames, twinRun, readRun(framePixels, sourceRun), Boolean(strip.mirrorFlip));
  }
  return framePixels;
}

/** Every mirror the preview knows: symmetry sides (layout strips) then `mirrorOf` strips (segments). */
export function applyPreviewMirrors({ framePixels, stripFrames = null, strips = [], symmetry = null, sidesMirrored = true }) {
  applySymmetrySides({ framePixels, stripFrames, strips, symmetry, sidesMirrored });
  applyStripMirrors({ framePixels, stripFrames, strips });
  return framePixels;
}
