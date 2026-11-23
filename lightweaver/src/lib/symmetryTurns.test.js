import test from 'node:test';
import assert from 'node:assert/strict';

import { dividingLineStart, symmetryEchoes, turnSides } from './symmetryTurns.js';
import { suggestBestFold, suggestSymmetry } from './symmetrySuggest.js';
import { normalizeSymmetry, setSymmetryFold, validateSymmetry, SYMMETRY_FOLDS } from './pieceSymmetry.js';

const C = { x: 300, y: 300 };
const polar = (radius, degrees, centre = C) => ({
  x: centre.x + radius * Math.cos(degrees * Math.PI / 180),
  y: centre.y + radius * Math.sin(degrees * Math.PI / 180),
});
function curve(id, a, b, c, count = 24) {
  return {
    id,
    pixels: Array.from({ length: count }, (_, index) => {
      const t = index / (count - 1);
      const u = 1 - t;
      return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y };
    }),
  };
}
function arc(id, radius, from, to, count = 20, centre = C) {
  return { id, pixels: Array.from({ length: count }, (_, index) => polar(radius, from + (to - from) * index / (count - 1), centre)) };
}

// A lotus of `petals` petals, each drawn from the centre outward: two curved
// edges and a rim arc per petal, plus a centre ring that belongs to no side.
function lotus(petals = 6, { centre = C, flipOdd = false } = {}) {
  const strips = [];
  for (let k = 0; k < petals; k += 1) {
    const th = -90 + 360 / petals * k;
    const spread = 180 / petals;
    const edge = sign => [polar(58, th + sign * 10, centre), polar(150, th + sign * spread, centre), polar(206, th, centre)];
    const left = edge(-1);
    const right = edge(1);
    if (flipOdd && k % 2 === 1) { left.reverse(); right.reverse(); }
    strips.push(curve(`petal-${k}-left`, ...left));
    strips.push(curve(`petal-${k}-right`, ...right));
    strips.push(arc(`rim-${k}`, 236, th - spread * 0.6, th + spread * 0.6, 20, centre));
  }
  strips.push(arc('centre-ring', 30, 0, 350, 36, centre));
  return strips;
}

test('six petals divide into six sides of three strips, centre ring on its own', () => {
  const result = turnSides(lotus(6), C, 6);
  assert.equal(result.fold, 6);
  assert.equal(result.sides.length, 6);
  assert.deepEqual(result.onOwn, ['centre-ring']);
  assert.equal(result.score, 1);
  assert.equal(result.orientation, 'same');
  for (const side of result.sides) assert.equal(side.stripIds.length, 3);
  assert.equal(result.matched.length, 3);
  // A petal is never cut in half: both of its edges land in one side.
  for (const side of result.sides) {
    const petals = new Set(side.stripIds.map(id => id.split('-')[1]));
    assert.equal(petals.size, 1, `side ${side.id} mixes petals ${[...petals]}`);
  }
});

test('every side lists its strips in the same order as side 1', () => {
  const result = turnSides(lotus(6), C, 6);
  const shape = side => side.stripIds.map(id => id.replace(/-\d+/, ''));
  for (const side of result.sides) assert.deepEqual(shape(side), shape(result.sides[0]));
});

test('the wrong number of sides scores low and the right one high', () => {
  const strips = lotus(6);
  assert.equal(turnSides(strips, C, 5).score, 0);
  assert.equal(turnSides(strips, C, 8).score, 0);
  assert.equal(turnSides(strips, C, 3).score, 1);
});

test('suggestSymmetry routes 3, 5, 6, 8 and 12 sides and labels them Side n', () => {
  const six = suggestSymmetry(lotus(6), 6, { centre: C });
  assert.equal(six.confidence, 'high');
  assert.deepEqual(six.sides.map(side => side.label), ['Side 1', 'Side 2', 'Side 3', 'Side 4', 'Side 5', 'Side 6']);
  assert.equal(suggestSymmetry(lotus(6), 5, { centre: C }).confidence, 'low');
  assert.equal(suggestSymmetry(lotus(5), 5, { centre: C }).confidence, 'high');
  assert.equal(suggestSymmetry(lotus(8), 8, { centre: C }).confidence, 'high');
  assert.equal(suggestSymmetry(lotus(6), 7, { centre: C }), null);
});

test('with no artwork loaded the strips supply their own centre', () => {
  const result = suggestSymmetry(lotus(6), 6);
  assert.equal(result.confidence, 'high');
  assert.ok(Math.hypot(result.centre.x - C.x, result.centre.y - C.y) < 1);
});

test("Studio's guess is the most sides that fit", () => {
  assert.equal(suggestBestFold(lotus(6), { centre: C }), 6);
  assert.equal(suggestBestFold(lotus(5), { centre: C }), 5);
  assert.equal(suggestBestFold(lotus(8), { centre: C }), 8);
  assert.equal(suggestBestFold([arc('lonely', 100, 10, 80)], { centre: C }), 0);
});

test('a dragged centre is the only centre tried', () => {
  const off = { x: C.x + 40, y: C.y };
  const pinned = suggestSymmetry(lotus(6), 6, { centre: off, pinned: true });
  assert.deepEqual(pinned.centre, off);
  assert.notEqual(pinned.confidence, 'high');
  const free = suggestSymmetry(lotus(6), 6, { centre: off });
  assert.equal(free.confidence, 'high');
});

test('alternate petals drawn the other way round play mirrored on an even count', () => {
  const result = turnSides(lotus(6, { flipOdd: true }), C, 6);
  assert.equal(result.orientation, 'mirror');
  assert.ok(result.score > 0.6);
});

test('dividing lines fall in the gap between petals', () => {
  const sided = lotus(6).filter(strip => strip.id !== 'centre-ring');
  const start = dividingLineStart(sided, C, 6);
  // Petals are centred on 0, 60, ... clockwise from the top; the gap is at 30.
  assert.ok(Math.abs(start - 30) < 8, `start ${start}`);
});

test('amber copies land on the strips for the right count and centre', () => {
  const strips = lotus(6);
  const symmetry = setSymmetryFold(null, 6, strips, suggestSymmetry(strips, 6, { centre: C }));
  const echoes = symmetryEchoes(strips, symmetry, C);
  assert.equal(echoes.copies.length, 3 * 5);
  assert.ok(echoes.distance < 0.005);
});

test('amber copies sit beside the strips for the wrong count or a moved centre', () => {
  const strips = lotus(6);
  const four = setSymmetryFold(null, 4, strips, suggestSymmetry(strips, 4, { centre: C }));
  assert.notEqual(suggestSymmetry(strips, 4, { centre: C }).confidence, 'high');
  assert.ok(symmetryEchoes(strips, four, C).distance > 0.01);
  const six = setSymmetryFold(null, 6, strips, suggestSymmetry(strips, 6, { centre: C }));
  assert.ok(symmetryEchoes(strips, six, { x: C.x + 25, y: C.y }).distance > 0.05);
});

test('two mirrored sides line up by reflection, not only by a half turn', () => {
  const strips = [
    curve('left', { x: 280, y: 380 }, { x: 150, y: 300 }, { x: 240, y: 140 }),
    curve('right', { x: 320, y: 380 }, { x: 450, y: 300 }, { x: 360, y: 140 }),
  ];
  const symmetry = setSymmetryFold(null, 2, strips, suggestSymmetry(strips, 2, { centre: C }));
  assert.ok(symmetryEchoes(strips, symmetry, C).distance < 0.005);
});

test('no symmetry or an empty first side gives no copies', () => {
  assert.deepEqual(symmetryEchoes(lotus(6), null, C).copies, []);
  const empty = { fold: 6, orientation: 'same', sides: Array.from({ length: 6 }, (_, i) => ({ id: `side-${i + 1}`, stripIds: [] })) };
  assert.deepEqual(symmetryEchoes(lotus(6), empty, C).copies, []);
});

test('the sides model accepts the new counts and still refuses others', () => {
  assert.deepEqual([...SYMMETRY_FOLDS], [2, 3, 4, 5, 6, 8, 12]);
  const strips = lotus(6);
  const symmetry = setSymmetryFold(null, 6, strips, suggestSymmetry(strips, 6, { centre: C }));
  assert.equal(normalizeSymmetry(symmetry, strips).sides.length, 6);
  assert.equal(validateSymmetry(symmetry, strips).ok, true);
  assert.equal(normalizeSymmetry({ fold: 7, sides: [] }), null);
  assert.equal(setSymmetryFold(null, 7, strips), null);
});
