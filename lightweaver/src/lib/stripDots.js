// Where a strip's number dot sits: just before its first light (LED 1), on the
// side away from the strip, so it never covers the strip it numbers. `pixels`
// already follow the data direction, so Reverse data and Set first light move it.
// `scale` is artwork units per screen pixel; the dot is 15px across on screen.
export function stripDotAt(strip, scale = 1) {
  const pixels = strip?.pixels || [];
  const first = pixels[0];
  const next = pixels[Math.min(1, pixels.length - 1)] || first;
  const dx = first.x - next.x;
  const dy = first.y - next.y;
  const length = Math.hypot(dx, dy);
  const reach = scale * 13;
  return {
    x: first.x + (length > 0 ? dx / length * reach : 0),
    y: first.y + (length > 0 ? dy / length * reach : -reach),
    dx: length > 0 ? dx / length : 1,
    dy: length > 0 ? dy / length : 0,
  };
}

/**
 * Where a strip's name chip is anchored: just past the end of the strip that is
 * farthest from the piece centre, on the side away from the strip, so the chip
 * sits at the outside of the piece and not over the middle.
 */
export function stripOuterEnd(strip, centre, scale = 1) {
  const pixels = strip?.pixels || [];
  const a = pixels[0];
  const b = pixels[pixels.length - 1] || a;
  const far = !centre || Math.hypot(a.x - centre.x, a.y - centre.y) >= Math.hypot(b.x - centre.x, b.y - centre.y) ? 'first' : 'last';
  const end = far === 'first' ? a : b;
  const inner = far === 'first' ? (pixels[Math.min(1, pixels.length - 1)] || a) : (pixels[Math.max(0, pixels.length - 2)] || b);
  let dx = end.x - inner.x;
  let dy = end.y - inner.y;
  let length = Math.hypot(dx, dy);
  if (!(length > 0) && centre) { dx = end.x - centre.x; dy = end.y - centre.y; length = Math.hypot(dx, dy); }
  const ux = length > 0 ? dx / length : 1;
  const uy = length > 0 ? dy / length : 0;
  return { x: end.x + ux * scale * 13, y: end.y + uy * scale * 13, dx: ux, dy: uy };
}
