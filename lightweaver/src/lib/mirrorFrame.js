// Studio-preview half of "mirror sets": each non-lead member of a set shows the
// lead's colours, so the preview matches what the card plays (every range of a
// zone restarts the pattern at its own LED 1 on one clock).
//
// Colours are copied, never re-evaluated: evalPixel receives the pixel's own
// coordinates and global index, so evaluating the pattern on the twin's
// geometry would not reproduce the lead.
//
// `mirrorSets` is the plain array persisted as `layout.mirrorSets`:
//   [{ id, name, members: [stripId, ...] }]   (first member is the lead)

/** Index into a lead of `leadLength` LEDs for LED `i` of a twin of `twinLength`. */
export function mirrorSourceIndex(i, twinLength, leadLength) {
  if (twinLength <= 1 || leadLength <= 1) return 0;
  return Math.round(i * (leadLength - 1) / (twinLength - 1));
}

/**
 * Overwrite every non-lead member of every set, in place, with the lead's
 * colours. `strips` must be the visible strips in the order the frame was
 * rendered, so a strip's global offset is the sum of the earlier pts lengths.
 * A set whose lead is not in `strips` (hidden) is left alone: its twins render
 * themselves. Returns `framePixels`.
 */
export function applyMirrorSets({ framePixels, stripFrames = null, strips = [], mirrorSets = [] }) {
  if (!Array.isArray(mirrorSets) || mirrorSets.length === 0) return framePixels;

  const slots = new Map();
  let offset = 0;
  for (let index = 0; index < strips.length; index++) {
    const strip = strips[index];
    const length = strip?.pts?.length ?? 0;
    if (strip?.id != null) slots.set(strip.id, { index, offset, length });
    offset += length;
  }

  for (const set of mirrorSets) {
    const members = Array.isArray(set?.members) ? set.members : [];
    const lead = slots.get(members[0]);
    if (!lead || lead.length === 0) continue;

    for (let m = 1; m < members.length; m++) {
      const twin = slots.get(members[m]);
      if (!twin || twin === lead || twin.length === 0) continue;

      const twinFrame = stripFrames?.[twin.index];
      const leds = twinFrame?.leds;
      let rSum = 0, gSum = 0, bSum = 0;
      for (let i = 0; i < twin.length; i++) {
        const source = framePixels[lead.offset + mirrorSourceIndex(i, twin.length, lead.length)];
        if (!source) continue;
        const color = { r: source.r, g: source.g, b: source.b };
        framePixels[twin.offset + i] = color;
        if (leds?.[i]) leds[i] = { ...leds[i], ...color };
        rSum += color.r; gSum += color.g; bSum += color.b;
      }
      if (twinFrame) {
        twinFrame.avgR = Math.round(rSum / twin.length);
        twinFrame.avgG = Math.round(gSum / twin.length);
        twinFrame.avgB = Math.round(bSum / twin.length);
      }
    }
  }
  return framePixels;
}
