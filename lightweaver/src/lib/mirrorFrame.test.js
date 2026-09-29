import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPixelFrame } from './frameEngine.js';
import { applyMirrorSets, mirrorSourceIndex } from './mirrorFrame.js';
import { renderPatternLabRecipeFrame, recipeFromPattern } from './patternLabPatternAdapter.js';

function makeStrip(id, count, { x0 = 0, y0 = 0, dx = 1, dy = 0.3, hidden = false } = {}) {
  return {
    id,
    hidden,
    speed: 1,
    brightness: 1,
    hueShift: 0,
    spacing: 4,
    pts: Array.from({ length: count }, (_, i) => ({
      x: x0 + i * dx,
      y: y0 + i * dy * (i % 2 ? 1 : -1),
      p: count === 1 ? 0 : i / (count - 1),
      i,
    })),
  };
}

// Twins sit somewhere else entirely, so re-evaluating the pattern on their own
// coordinates would not reproduce the lead. Only a colour copy can.
const LEFT = makeStrip('left', 12, { x0: 0, y0: 0 });
const RIGHT = makeStrip('right', 12, { x0: 40, y0: 25, dx: -1.7 });
const OTHER = makeStrip('other', 7, { x0: 10, y0: 60, dx: 2 });
const SET = [{ id: 'mirror-1', name: 'Wings', members: ['left', 'right'] }];

const ctx = (strips, extra = {}) => ({ t: 3.7, strips, patternId: 'aurora', bpm: 100, ...extra });
const colors = frameStrip => frameStrip.leds.map(({ r, g, b }) => ({ r, g, b }));

test('mirrorSourceIndex is identity for equal counts and maps ends to ends when stretched', () => {
  for (let i = 0; i < 9; i++) assert.equal(mirrorSourceIndex(i, 9, 9), i);
  assert.equal(mirrorSourceIndex(0, 38, 41), 0);
  assert.equal(mirrorSourceIndex(37, 38, 41), 40);
  assert.equal(mirrorSourceIndex(0, 1, 41), 0);
  assert.equal(mirrorSourceIndex(0, 5, 1), 0);
});

for (const patternId of ['aurora', 'gradient', 'fire', 'plasma', 'rainbow', 'wave', 'ripple']) {
  test(`equal-length twin LEDs equal the lead LEDs exactly (${patternId})`, () => {
    const strips = [LEFT, OTHER, RIGHT];
    const plain = renderPixelFrame(ctx(strips, { patternId }));
    // Guard against a vacuous pass: unmirrored, the twin must differ from the lead.
    assert.notDeepEqual(colors(plain.stripFrames[2]), colors(plain.stripFrames[0]));
    const mirrored = renderPixelFrame(ctx(strips, { patternId, mirrorSets: SET }));

    const [left, other, right] = mirrored.stripFrames;
    assert.deepEqual(colors(right), colors(left));
    assert.deepEqual(right.leds.map(({ x, y }) => ({ x, y })), RIGHT.pts.map(({ x, y }) => ({ x, y })));
    assert.equal(right.avgR, left.avgR);
    assert.equal(right.avgG, left.avgG);
    assert.equal(right.avgB, left.avgB);
    // flat pixels agree with the per-strip frames
    assert.deepEqual(mirrored.pixels.slice(19), mirrored.pixels.slice(0, 12));
    assert.equal(mirrored.pixels.length, plain.pixels.length);

    // the lead and every strip outside the set are untouched
    assert.deepEqual(mirrored.pixels.slice(0, 12), plain.pixels.slice(0, 12));
    assert.deepEqual(mirrored.pixels.slice(12, 19), plain.pixels.slice(12, 19));
    assert.deepEqual(colors(other), colors(plain.stripFrames[1]));
  });
}

test('the copy is real: without the set the unequal geometry renders different colours', () => {
  const strips = [LEFT, RIGHT];
  const plain = renderPixelFrame(ctx(strips, { patternId: 'gradient' }));
  assert.notDeepEqual(colors(plain.stripFrames[1]), colors(plain.stripFrames[0]));
});

test('a 41 to 38 stretch maps first to first and last to last', () => {
  const lead = makeStrip('lead', 41);
  const twin = makeStrip('twin', 38, { y0: 30 });
  const frame = renderPixelFrame(ctx([lead, twin], {
    patternId: 'gradient',
    mirrorSets: [{ id: 'mirror-1', name: 'Pair', members: ['lead', 'twin'] }],
  }));
  const [a, b] = frame.stripFrames;
  assert.equal(a.leds.length, 41);
  assert.equal(b.leds.length, 38);
  assert.deepEqual(colors(b)[0], colors(a)[0]);
  assert.deepEqual(colors(b)[37], colors(a)[40]);
  for (let i = 0; i < 38; i++) {
    assert.deepEqual(colors(b)[i], colors(a)[mirrorSourceIndex(i, 38, 41)], `twin LED ${i}`);
  }
  const total = b.leds.reduce((s, led) => s + led.r, 0);
  assert.equal(b.avgR, Math.round(total / 38));
});

test('a hidden lead leaves the twins rendering themselves', () => {
  const strips = [{ ...LEFT, hidden: true }, RIGHT, OTHER];
  const plain = renderPixelFrame(ctx(strips));
  const mirrored = renderPixelFrame(ctx(strips, { mirrorSets: SET }));
  assert.deepEqual(mirrored, plain);
});

test('a hidden twin is skipped and the visible ones still copy the lead', () => {
  const third = makeStrip('third', 12, { x0: 5, y0: 44 });
  const strips = [LEFT, { ...RIGHT, hidden: true }, third];
  const frame = renderPixelFrame(ctx(strips, {
    mirrorSets: [{ id: 'mirror-1', name: 'Three', members: ['left', 'right', 'third'] }],
  }));
  assert.equal(frame.stripFrames.length, 2);
  assert.deepEqual(colors(frame.stripFrames[1]), colors(frame.stripFrames[0]));
});

test('empty, missing and unrelated mirrorSets leave the frame byte-identical', () => {
  const strips = [LEFT, OTHER, RIGHT];
  const base = JSON.stringify(renderPixelFrame(ctx(strips)));
  assert.equal(JSON.stringify(renderPixelFrame(ctx(strips, { mirrorSets: [] }))), base);
  assert.equal(JSON.stringify(renderPixelFrame(ctx(strips, { mirrorSets: undefined }))), base);
  assert.equal(JSON.stringify(renderPixelFrame(ctx(strips, { mirrorSets: null }))), base);
  assert.equal(JSON.stringify(renderPixelFrame(ctx(strips, {
    mirrorSets: [{ id: 'x', name: 'Ghosts', members: ['nope', 'left'] }],
  }))), base);
});

test('applyMirrorSets with no sets is a no-op that returns the same array', () => {
  const pixels = [{ r: 1, g: 2, b: 3 }];
  assert.equal(applyMirrorSets({ framePixels: pixels, strips: [], mirrorSets: [] }), pixels);
  assert.deepEqual(pixels, [{ r: 1, g: 2, b: 3 }]);
});

test('Pattern Lab recipe frames mirror on the final composited colours, layers included', () => {
  const recipe = recipeFromPattern('gradient', { palette: ['#000000', '#ff0000', '#00ff88'] });
  recipe.layers = [
    { generator: { kind: 'lightweaver-pattern', patternId: 'scanner', params: {} }, opacity: 0.5, blendMode: 'screen', mask: { kind: 'none' } },
  ];
  const strips = [LEFT, OTHER, RIGHT];
  const frame = renderPatternLabRecipeFrame(recipe, { t: 1.3, strips, bpm: 100, mirrorSets: SET });
  const plain = renderPatternLabRecipeFrame(recipe, { t: 1.3, strips, bpm: 100 });
  assert.deepEqual(colors(frame.stripFrames[2]), colors(frame.stripFrames[0]));
  assert.deepEqual(frame.pixels.slice(19), frame.pixels.slice(0, 12));
  assert.deepEqual(colors(frame.stripFrames[1]), colors(plain.stripFrames[1]));
  assert.equal(frame.stripFrames[2].avgR, frame.stripFrames[0].avgR);
});
