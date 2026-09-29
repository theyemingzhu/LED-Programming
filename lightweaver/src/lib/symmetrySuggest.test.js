import test from 'node:test';
import assert from 'node:assert/strict';

import { suggestSymmetry, symmetryAxisLine, symmetryConfidence, symmetryStripPlaces } from './symmetrySuggest.js';

// A strip as Layout holds it: LED positions in LED order.
function line(id, from, to, count = 24) {
  return {
    id,
    pixels: Array.from({ length: count }, (_, index) => ({
      x: from.x + (to.x - from.x) * index / (count - 1),
      y: from.y + (to.y - from.y) * index / (count - 1),
    })),
  };
}
function ring(id, centre, radius, count = 32) {
  return {
    id,
    pixels: Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * 2 * index / count;
      return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
    }),
  };
}

const C = { x: 300, y: 200 };
// A winged piece drawn from the centre outward, like the owner's mandala.
const wings = () => [
  line('left-top', { x: 285, y: 190 }, { x: 165, y: 110 }),
  line('right-top', { x: 315, y: 190 }, { x: 435, y: 110 }),
  line('left-bottom', { x: 285, y: 210 }, { x: 165, y: 290 }),
  line('right-bottom', { x: 315, y: 210 }, { x: 435, y: 290 }),
  ring('centre-ring', C, 20),
];

test('two matching wings split left and right, the centre ring plays on its own', () => {
  const suggestion = suggestSymmetry(wings(), 2, { centre: C });
  assert.equal(suggestion.fold, 2);
  assert.equal(suggestion.confidence, 'high');
  assert.equal(suggestion.split, 'x');
  assert.deepEqual(suggestion.sides.map(side => side.label), ['Left side', 'Right side']);
  assert.deepEqual(suggestion.sides[0].stripIds, ['left-top', 'left-bottom']);
  assert.deepEqual(suggestion.sides[1].stripIds, ['right-top', 'right-bottom']);
  assert.deepEqual(suggestion.onOwn, ['centre-ring']);
  // Both sides drawn from the centre outward: side 2 plays the right way round
  // without reversing.
  assert.equal(suggestion.orientation, 'same');
});

test('a right side drawn from the outside in asks for the mirror flip and lists its strips reversed', () => {
  const strips = [
    line('left-top', { x: 285, y: 190 }, { x: 165, y: 110 }),
    line('right-top', { x: 435, y: 110 }, { x: 315, y: 190 }),
    line('left-bottom', { x: 285, y: 210 }, { x: 165, y: 290 }),
    line('right-bottom', { x: 435, y: 290 }, { x: 315, y: 210 }),
  ];
  const suggestion = suggestSymmetry(strips, 2, { centre: C });
  assert.equal(suggestion.confidence, 'high');
  assert.equal(suggestion.orientation, 'mirror');
  assert.deepEqual(suggestion.sides[0].stripIds, ['left-top', 'left-bottom']);
  // Reversed playback runs the whole side backwards, so the partner of the
  // last left strip comes first.
  assert.deepEqual(suggestion.sides[1].stripIds, ['right-bottom', 'right-top']);
});

test('a piece mirrored top to bottom splits into top and bottom sides', () => {
  const strips = [
    line('upper', { x: 200, y: 185 }, { x: 400, y: 120 }),
    line('lower', { x: 200, y: 215 }, { x: 400, y: 280 }),
  ];
  const suggestion = suggestSymmetry(strips, 2, { centre: C });
  assert.equal(suggestion.split, 'y');
  assert.deepEqual(suggestion.sides.map(side => side.label), ['Top side', 'Bottom side']);
  assert.deepEqual(suggestion.sides.map(side => side.stripIds), [['upper'], ['lower']]);
  assert.equal(suggestion.confidence, 'high');
});

test('an unmatched strip is still placed by where it sits but lowers confidence', () => {
  const strips = [...wings(), line('stray', { x: 120, y: 330 }, { x: 180, y: 360 }, 30)];
  const suggestion = suggestSymmetry(strips, 2, { centre: C });
  assert.deepEqual(suggestion.sides[0].stripIds, ['left-top', 'left-bottom', 'stray']);
  assert.notEqual(suggestion.confidence, 'high');
});

test('strips that do not mirror give low confidence', () => {
  const strips = [
    line('a', { x: 100, y: 100 }, { x: 180, y: 120 }),
    line('b', { x: 420, y: 300 }, { x: 440, y: 180 }, 40),
  ];
  const suggestion = suggestSymmetry(strips, 2);
  assert.equal(suggestion.confidence, 'low');
  // Still a usable starting point: one strip on each side.
  assert.deepEqual(suggestion.sides.map(side => side.stripIds.length), [1, 1]);
});

test('without artwork the strips find their own centre', () => {
  const shifted = wings().map(strip => ({ ...strip, pixels: strip.pixels.map(p => ({ x: p.x + 70, y: p.y - 40 })) }));
  const suggestion = suggestSymmetry(shifted, 2, { centre: C });
  assert.equal(suggestion.confidence, 'high');
  assert.deepEqual(suggestion.onOwn, ['centre-ring']);
});

test('four arms turning about the centre make four sides, top first, running the same way round', () => {
  const strips = [
    line('left-arm', { x: 290, y: 200 }, { x: 170, y: 200 }, 30),
    line('top-arm', { x: 300, y: 190 }, { x: 300, y: 70 }, 30),
    line('bottom-arm', { x: 300, y: 210 }, { x: 300, y: 330 }, 30),
    line('right-arm', { x: 310, y: 200 }, { x: 430, y: 200 }, 30),
    ring('centre-ring', C, 12, 24),
  ];
  const suggestion = suggestSymmetry(strips, 4, { centre: C });
  assert.equal(suggestion.confidence, 'high');
  assert.equal(suggestion.orientation, 'same');
  assert.deepEqual(suggestion.sides.map(side => side.label), ['Side 1', 'Side 2', 'Side 3', 'Side 4']);
  assert.deepEqual(suggestion.sides.map(side => side.stripIds), [['top-arm'], ['right-arm'], ['bottom-arm'], ['left-arm']]);
  assert.deepEqual(suggestion.onOwn, ['centre-ring']);
});

test('four curved wings that only reflect still make four sides', () => {
  // Curved wings: a quarter turn does not carry one onto the next, the two
  // reflections do.
  const wing = (id, sx, sy) => ({
    id,
    pixels: Array.from({ length: 20 }, (_, index) => {
      const t = index / 19;
      return { x: C.x + sx * (10 + 120 * t), y: C.y + sy * (10 + 40 * t * t) };
    }),
  });
  const strips = [wing('ul', -1, -1), wing('ur', 1, -1), wing('lr', 1, 1), wing('ll', -1, 1)];
  const suggestion = suggestSymmetry(strips, 4, { centre: C });
  assert.equal(suggestion.confidence, 'high');
  assert.equal(new Set(suggestion.sides.flatMap(side => side.stripIds)).size, 4);
  assert.ok(suggestion.sides.every(side => side.stripIds.length === 1));
  // Clockwise from the top-left diagonal. These wings are wide and low, so ul
  // sits in the left quarter and comes last.
  assert.deepEqual(suggestion.sides.map(side => side.stripIds[0]), ['ur', 'lr', 'll', 'ul']);
});

test('other folds and empty pieces are handled', () => {
  assert.equal(suggestSymmetry(wings(), 3), null);
  const empty = suggestSymmetry([], 2);
  assert.equal(empty.confidence, 'low');
  assert.deepEqual(empty.sides.map(side => side.stripIds), [[], []]);
  const noPixels = suggestSymmetry([{ id: 'pending', pixels: [] }], 2);
  assert.deepEqual(noPixels.onOwn, ['pending']);
});

test('confidence buckets', () => {
  assert.equal(symmetryConfidence(1), 'high');
  assert.equal(symmetryConfidence(0.7), 'medium');
  assert.equal(symmetryConfidence(0.2), 'low');
});

test('strip places number each side from 1 in flow order', () => {
  const places = symmetryStripPlaces({
    fold: 2,
    sides: [{ id: 'side-1', label: 'Left side', stripIds: ['a', 'b'] }, { id: 'side-2', label: 'Right side', stripIds: ['c'] }],
  });
  assert.deepEqual(places.get('b'), { sideIndex: 0, sideId: 'side-1', label: 'Left side', position: 2, count: 2 });
  assert.equal(places.get('c').position, 1);
  assert.equal(places.has('d'), false);
  assert.equal(symmetryStripPlaces(null).size, 0);
});

test('the mirror line runs between the two sides', () => {
  const strips = wings();
  const axis = symmetryAxisLine({
    fold: 2,
    sides: [
      { id: 'side-1', label: 'Left side', stripIds: ['left-top', 'left-bottom'] },
      { id: 'side-2', label: 'Right side', stripIds: ['right-top', 'right-bottom'] },
    ],
  }, strips);
  assert.ok(Math.abs(axis.x1 - 300) < 1e-6 && Math.abs(axis.x2 - 300) < 1e-6);
  assert.ok(Math.min(axis.y1, axis.y2) < 110 && Math.max(axis.y1, axis.y2) > 290);
  assert.equal(symmetryAxisLine({ fold: 4, sides: [] }, strips), null);
  assert.equal(symmetryAxisLine({ fold: 2, sides: [{ stripIds: [] }, { stripIds: ['right-top'] }] }, strips), null);
});
