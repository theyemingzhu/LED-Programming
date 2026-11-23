import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAreas } from './areas.js';
import { C, lotus } from './testFixtures.js';

const shapeOf = result => result.areas.map(a => [a.copies.length, a.copies[0].length]);

test('a six-fold lotus: centre ring, six two-edged petals, twelve side circles, six rim arcs', () => {
  const result = deriveAreas(lotus(), { fold: 6, centre: C });
  assert.equal(result.source, 'turns');
  assert.deepEqual(shapeOf(result), [[1, 1], [6, 2], [12, 1], [6, 1]]);
  assert.equal(result.areas[0].copies[0][0], 'centre-ring');
  assert.ok(result.areas.every((a, i) => a.name === `Area ${i + 1}`));
  assert.equal(new Set(result.areas.map(a => a.id)).size, result.areas.length);
  // every strip is used exactly once
  assert.equal(result.areas.flatMap(a => a.copies.flat()).length, lotus().length);
});

test('copies run clockwise from the top, and a petal pairs its two edges', () => {
  const petals = deriveAreas(lotus(), { fold: 6, centre: C }).areas[1];
  assert.deepEqual(petals.copies.map(copy => copy[0].split('-')[1]), ['0', '1', '2', '3', '4', '5']);
  assert.ok(petals.copies.every((copy, k) => copy.every(id => id.startsWith(`petal-${k}-`))));
});

test('petals run from the centre outward whichever way the strip was drawn', () => {
  const strips = lotus({ circles: false });
  strips.find(s => s.id === 'petal-2-left').pixels.reverse();
  const result = deriveAreas(strips, { fold: 6, centre: C });
  assert.equal(result.flips['petal-2-left'], true);
  assert.equal(result.flips['petal-1-left'], false);
});

test('ids are stable for the same strips', () => {
  const a = deriveAreas(lotus(), { fold: 6, centre: C }).areas.map(x => x.id);
  const b = deriveAreas(lotus(), { fold: 6, centre: C }).areas.map(x => x.id);
  assert.deepEqual(a, b);
});

test('no symmetry: every strip is its own area with one copy', () => {
  const strips = lotus({ circles: false, ring: false }).slice(0, 4);
  const result = deriveAreas(strips, {});
  assert.equal(result.source, 'strips');
  assert.equal(result.areas.length, 4);
  assert.ok(result.areas.every(a => a.copies.length === 1 && a.copies[0].length === 1));
});

test('strips with no positions still get an area', () => {
  const result = deriveAreas([{ id: 'x', pixels: [] }, { id: 'y' }], { fold: 6, centre: C });
  assert.deepEqual(result.areas.map(a => a.copies), [[['x']], [['y']]]);
});

test('an uneven piece falls back for the strips that do not match, instead of guessing', () => {
  const strips = lotus({ circles: false, ring: false });
  const odd = strips.filter(s => s.id !== 'petal-3-left');
  const result = deriveAreas(odd, { fold: 6, centre: C });
  assert.ok(result.areas.some(a => a.copies.length === 1 && a.copies[0][0].startsWith('petal-')));
  assert.equal(result.areas.flatMap(a => a.copies.flat()).length, odd.length);
});

test('"these belong together" moves strips into one area by hand', () => {
  const result = deriveAreas(lotus({ circles: false, ring: false }), { fold: 6, centre: C, together: [['rim-0', 'rim-3']] });
  const joined = result.areas.find(a => a.copies.length === 2 && a.copies[0][0] === 'rim-0');
  assert.ok(joined);
  assert.equal(result.areas.flatMap(a => a.copies.flat()).filter(id => id === 'rim-0').length, 1);
});

// The piece the features coordinator seeded: centre (320, 200), six petals
// drawn as quadratic curves, six small circles that each start at their own
// leftmost point, one centre ring; 44 lights per strip.
function seededPiece({ reverseCircle = null } = {}) {
  const O = { x: 320, y: 200 };
  const at = (r, deg) => ({ x: O.x + r * Math.cos(deg * Math.PI / 180), y: O.y + r * Math.sin(deg * Math.PI / 180) });
  const loop = (id, c, r, reverse = false) => ({
    id,
    pixels: Array.from({ length: 44 }, (_, i) => {
      const a = Math.PI + (reverse ? -1 : 1) * 2 * Math.PI * i / 43; // starts at the leftmost point
      return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
    }),
  });
  const strips = [];
  for (let k = 0; k < 6; k += 1) {
    const th = -90 + 60 * k;
    const [a, b, c] = [at(40, th - 9), at(105, th - 24), at(150, th)];
    strips.push({ id: `petal-${k}`, pixels: Array.from({ length: 44 }, (_, i) => { const t = i / 43; const u = 1 - t; return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y }; }) });
  }
  for (let k = 0; k < 6; k += 1) strips.push(loop(`circle-${k}`, at(128, -60 + 60 * k), 13, reverseCircle === k));
  strips.push(loop('centre-ring', O, 20));
  return { strips, O };
}

test('the coordinator\'s piece: petals x6, circles x6 and a centre ring, whichever way a circle was drawn', () => {
  for (const reverseCircle of [null, 2]) {
    const { strips, O } = seededPiece({ reverseCircle });
    const result = deriveAreas(strips, { fold: 6, centre: O });
    assert.deepEqual(result.areas.map(a => [a.copies.length, a.copies[0].length]).sort(), [[1, 1], [6, 1], [6, 1]]);
    assert.ok(result.areas.some(a => a.copies[0][0] === 'centre-ring'));
    assert.ok(result.areas.some(a => a.copies.every(c => c[0].startsWith('circle-')) && a.copies.length === 6));
    assert.ok(result.areas.some(a => a.copies.every(c => c[0].startsWith('petal-')) && a.copies.length === 6));
  }
});

test('every circle copy starts in the same place: the light nearest the centre, so they chase in step', async () => {
  const { buildPieceMap } = await import('./pieceMap.js');
  const { strips, O } = seededPiece({ reverseCircle: 2 });
  const derived = deriveAreas(strips, { fold: 6, centre: O });
  const map = buildPieceMap(strips, derived, O);
  const circleArea = derived.areas.findIndex(a => a.copies[0][0].startsWith('circle-'));
  const nearest = new Set();
  strips.forEach((strip, s) => {
    if (!strip.id.startsWith('circle-')) return;
    const from = strips.slice(0, s).reduce((n, x) => n + x.pixels.length, 0);
    let best = 0;
    strip.pixels.forEach((p, i) => { if (Math.hypot(p.x - O.x, p.y - O.y) < Math.hypot(strip.pixels[best].x - O.x, strip.pixels[best].y - O.y)) best = i; });
    assert.equal(map.leds[from + best].area, circleArea);
    nearest.add(map.leds[from + best].shape);
  });
  assert.deepEqual([...nearest], [0]);
});
