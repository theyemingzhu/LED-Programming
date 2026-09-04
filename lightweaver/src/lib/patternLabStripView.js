// The Lab's two ways of looking at the same pattern.
//
// PIECE is the artwork: every light where it physically sits, which is what
// the room will see. STRIP is the same lights straightened into the order the
// data reaches them — the order the card addresses, and the order you solder.
// A pattern that looks calm on a ring can be travelling fast along the strip,
// and nothing in Studio showed that.
//
// Nothing here renders or recolours anything. It rewrites POSITIONS and hands
// the result to the same preview: same pattern function, same palette, same
// frame — the lights are just standing in a line. Any other approach would be
// a second renderer that could disagree with the first about what the piece
// is doing.

// Room to breathe at each end so the first and last light are not clipped
// against the frame edge.
const MARGIN = 6;

function pointsOf(strip) {
  if (Array.isArray(strip?.pts) && strip.pts.length) return strip.pts;
  if (Array.isArray(strip?.pixels) && strip.pixels.length) return strip.pixels;
  return [];
}

/**
 * How many lights the piece has, and how they are divided between strips.
 *
 * Returned separately because the strip view draws a seam between strips —
 * the point where one reel ends and the next begins is exactly what somebody
 * wiring the piece is looking for.
 */
export function stripRunLengths(geometry) {
  const hidden = geometry?.hidden || {};
  return (geometry?.strips || [])
    .filter(strip => !hidden[strip.id])
    .map(strip => ({ id: strip.id, name: strip.name || strip.id, count: pointsOf(strip).length }))
    .filter(run => run.count > 0);
}

/**
 * The same geometry with every light moved onto one horizontal line, in the
 * order the strips are chained.
 *
 * The viewBox is rebuilt to fit that line rather than reused: the artwork's
 * box describes a shape this view no longer has, and keeping it would leave
 * the row floating in a corner of an empty canvas.
 */
export function flattenToStripView(geometry) {
  const runs = stripRunLengths(geometry);
  const total = runs.reduce((sum, run) => sum + run.count, 0);
  if (!total) return geometry;

  // One unit of spacing per gap, so a 1-light piece still has a sane box.
  const spacing = 10;
  const width = MARGIN * 2 + Math.max(1, total - 1) * spacing;
  const height = 40;
  const y = height / 2;

  let index = 0;
  const strips = [];
  for (const run of runs) {
    const source = (geometry.strips || []).find(strip => strip.id === run.id) || {};
    const pts = [];
    for (let i = 0; i < run.count; i += 1) {
      pts.push({ x: MARGIN + index * spacing, y });
      index += 1;
    }
    strips.push({
      ...source,
      // Both keys: callers downstream read one or the other depending on age.
      pts,
      pixels: pts,
      // A straight run has no curvature and no reflection to preserve; leaving
      // a kaleidoscope on a line would place points that are not on it.
      kaleidoscope: null,
      pathData: `M${pts[0].x} ${y} L${pts[pts.length - 1].x} ${y}`,
      svgLength: Math.max(1, (run.count - 1) * spacing),
    });
  }

  return {
    ...geometry,
    strips,
    viewBox: `0 0 ${width} ${height}`,
    // The artwork underneath is the wrong drawing for this view.
    svgText: '',
    // Mirroring or mandala symmetry describes the piece's shape, not a line.
    symSettings: null,
  };
}
