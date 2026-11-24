// Shared fixtures for the look engine tests (not a test file itself).
// A six-fold lotus in the style of symmetryTurns.test.js: per petal two curved
// edges that meet at the tip, two small circles beside it, a rim arc; plus one
// ring on the centre. 6 x (2 + 2 + 1) + 1 = 31 strips.

export const C = { x: 300, y: 300 };
const polar = (radius, degrees, centre = C) => ({
  x: centre.x + radius * Math.cos(degrees * Math.PI / 180),
  y: centre.y + radius * Math.sin(degrees * Math.PI / 180),
});
const curve = (id, a, b, c, count = 12) => ({
  id,
  pixels: Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y };
  }),
});
const arc = (id, radius, from, to, count = 10) => ({ id, pixels: Array.from({ length: count }, (_, index) => polar(radius, from + (to - from) * index / (count - 1))) });
// A circle whose first LED points the same way round the piece for every copy.
const circle = (id, centre, start, radius = 16, count = 12) => ({
  id, pixels: Array.from({ length: count }, (_, index) => polar(radius, start + index * 360 / count, centre)),
});

export function lotus({ petals = 6, circles = true, ring = true } = {}) {
  const strips = [];
  for (let k = 0; k < petals; k += 1) {
    const th = -90 + 360 / petals * k;
    const spread = 180 / petals;
    const edge = sign => [polar(58, th + sign * 10), polar(150, th + sign * spread), polar(206, th)];
    strips.push(curve(`petal-${k}-left`, ...edge(-1)));
    strips.push(curve(`petal-${k}-right`, ...edge(1)));
    strips.push(arc(`rim-${k}`, 250, th - spread * 0.6, th + spread * 0.6));
    if (circles) {
      strips.push(circle(`circle-${k}-a`, polar(150, th - 0.45 * 360 / petals), th));
      strips.push(circle(`circle-${k}-b`, polar(150, th + 0.45 * 360 / petals), th));
    }
  }
  if (ring) strips.push(arc('centre-ring', 24, 0, 350, 18));
  return strips;
}
