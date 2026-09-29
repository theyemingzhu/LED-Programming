import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPixelFrame } from './frameEngine.js';
import {
  applyStripMirrors,
  applySymmetrySides,
  mirrorSourceIndex,
  planSymmetrySides,
  sideFlippedByRule,
  sideRunByStrip,
} from './mirrorFrame.js';
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

const side = (id, stripIds) => ({ id, label: id, stripIds });
const sym = (sides, orientation = 'mirror') => ({ fold: sides.length, orientation, sides });

// Sides sit somewhere else entirely, so re-evaluating the pattern on a twin's own
// coordinates would not reproduce side 1. Only a colour copy can.
const L1 = makeStrip('l1', 6, { x0: 0, y0: 0 });
const L2 = makeStrip('l2', 6, { x0: 0, y0: 20 });
const R1 = makeStrip('r1', 6, { x0: 40, y0: 25, dx: -1.7 });
const R2 = makeStrip('r2', 6, { x0: 40, y0: 45, dx: -1.7 });
const OWN = makeStrip('own', 7, { x0: 10, y0: 60, dx: 2 });

const TWO = sym([side('side-1', ['l1', 'l2']), side('side-2', ['r1', 'r2'])]);

const ctx = (strips, extra = {}) => ({ t: 3.7, strips, patternId: 'aurora', bpm: 100, ...extra });
const colors = frameStrip => frameStrip.leds.map(({ r, g, b }) => ({ r, g, b }));

// A pattern that reports where it was asked to draw, so a test can read the run
// the renderer built rather than infer it from colours.
const probe = (log) => (index, x, y, t, time, count, palette, beat, beatSin, params, stripId, stripProgress) => {
  log.push({ index, count, stripId, stripProgress });
  return [stripProgress, 0, 0];
};

test('mirrorSourceIndex is identity for equal counts and maps ends to ends when stretched', () => {
  for (let i = 0; i < 9; i++) assert.equal(mirrorSourceIndex(i, 9, 9), i);
  assert.equal(mirrorSourceIndex(0, 38, 41), 0);
  assert.equal(mirrorSourceIndex(37, 38, 41), 40);
  assert.equal(mirrorSourceIndex(0, 1, 41), 0);
  assert.equal(mirrorSourceIndex(0, 5, 1), 0);
  // interior values, worked by hand: source = round(i * (lead - 1) / (twin - 1))
  assert.deepEqual([0, 1, 7, 15, 22, 29].map(i => mirrorSourceIndex(i, 30, 24)), [0, 1, 6, 12, 17, 23]);
  assert.deepEqual([0, 1, 2, 3, 4].map(i => mirrorSourceIndex(i, 5, 6)), [0, 1, 3, 4, 5]);
});

test('the flip rule flips odd sides only, and only for mirror images', () => {
  const mirror = sym([side('a', []), side('b', []), side('c', []), side('d', [])], 'mirror');
  const same = sym([side('a', []), side('b', []), side('c', []), side('d', [])], 'same');
  assert.deepEqual([0, 1, 2, 3].map(i => sideFlippedByRule(mirror, i)), [false, true, false, true]);
  assert.deepEqual([0, 1, 2, 3].map(i => sideFlippedByRule(same, i)), [false, false, false, false]);
  assert.equal(sideFlippedByRule(null, 1), false);
});

test('a side of two strips is ONE continuous run: progress, index and count span both', () => {
  const log = [];
  renderPixelFrame(ctx([L1, L2, OWN], { activeFn: probe(log), symmetry: sym([side('side-1', ['l1', 'l2'])]), sidesMirrored: false }));
  const inSide = log.filter(entry => entry.stripId !== 'own');
  assert.equal(inSide.length, 12);
  assert.deepEqual(inSide.map(entry => entry.index), Array.from({ length: 12 }, (_, i) => i));
  assert.ok(inSide.every(entry => entry.count === 12));
  inSide.forEach((entry, i) => assert.ok(Math.abs(entry.stripProgress - i / 11) < 1e-9, `progress at ${i}`));
  // the second strip does not restart: its first LED continues where the first ended
  assert.ok(inSide[6].stripProgress > inSide[5].stripProgress);
});

test('the order a side lists its strips is the order the pattern flows', () => {
  const log = [];
  renderPixelFrame(ctx([L1, L2], { activeFn: probe(log), symmetry: sym([side('side-1', ['l2', 'l1'])]), sidesMirrored: false }));
  const first = log.filter(entry => entry.stripId === 'l2').map(entry => entry.stripProgress);
  const second = log.filter(entry => entry.stripId === 'l1').map(entry => entry.stripProgress);
  assert.ok(Math.max(...first) < Math.min(...second), 'l2 comes first in the side, so it carries the low progress');
});

test('a strip on its own is untouched by symmetry', () => {
  const plain = renderPixelFrame(ctx([L1, L2, OWN], { patternId: 'gradient' }));
  const withSides = renderPixelFrame(ctx([L1, L2, OWN], { patternId: 'gradient', symmetry: sym([side('side-1', ['l1', 'l2'])]), sidesMirrored: false }));
  const ownIndex = 2;
  assert.notDeepEqual(colors(withSides.stripFrames[1]), colors(plain.stripFrames[1]), 'the side really changed');
  assert.deepEqual(colors(withSides.stripFrames[ownIndex]), colors(plain.stripFrames[ownIndex]));
});

for (const patternId of ['aurora', 'gradient', 'fire', 'plasma', 'rainbow', 'wave', 'ripple']) {
  test(`mirrored equal-length side: the twin is the lead, reversed (${patternId})`, () => {
    const strips = [L1, L2, OWN, R1, R2];
    const own = renderPixelFrame(ctx(strips, { patternId, symmetry: TWO, sidesMirrored: false }));
    const mirrored = renderPixelFrame(ctx(strips, { patternId, symmetry: TWO, sidesMirrored: true }));
    const lead = [...colors(mirrored.stripFrames[0]), ...colors(mirrored.stripFrames[1])];
    const twin = [...colors(mirrored.stripFrames[3]), ...colors(mirrored.stripFrames[4])];
    // side 2 is a mirror image: same length, so exactly the lead reversed
    assert.deepEqual(twin, [...lead].reverse());
    // Guard against a vacuous pass: the copy really changed the twin.
    assert.notDeepEqual(twin, [...own.stripFrames[3].leds, ...own.stripFrames[4].leds].map(({ r, g, b }) => ({ r, g, b })));
    // flat pixels agree with the per-strip frames
    assert.deepEqual(mirrored.pixels.slice(19), mirrored.pixels.slice(0, 12).reverse());
    assert.equal(mirrored.pixels.length, own.pixels.length);
    // the lead and the strip on its own are untouched by the copy
    assert.deepEqual(mirrored.pixels.slice(0, 12), own.pixels.slice(0, 12));
    assert.deepEqual(colors(mirrored.stripFrames[2]), colors(own.stripFrames[2]));
    // averages are recomputed for the copied strips
    const avg = frameStrip => Math.round(frameStrip.leds.reduce((sum, led) => sum + led.r, 0) / frameStrip.leds.length);
    assert.equal(mirrored.stripFrames[3].avgR, avg(mirrored.stripFrames[3]));
  });
}

test('orientation "same" copies without reversing', () => {
  const same = sym([side('side-1', ['l1', 'l2']), side('side-2', ['r1', 'r2'])], 'same');
  const frame = renderPixelFrame(ctx([L1, L2, R1, R2], { patternId: 'gradient', symmetry: same, sidesMirrored: true }));
  assert.deepEqual(frame.pixels.slice(12), frame.pixels.slice(0, 12));
});

test('four sides: odd sides are reversed, even sides copy straight', () => {
  const strips = ['a', 'b', 'c', 'd'].map((id, i) => makeStrip(id, 8, { x0: i * 30, y0: i * 11 }));
  const four = sym(strips.map((strip, i) => side(`side-${i + 1}`, [strip.id])), 'mirror');
  const frame = renderPixelFrame(ctx(strips, { patternId: 'gradient', symmetry: four }));
  const [a, b, c, d] = [0, 1, 2, 3].map(i => frame.pixels.slice(i * 8, i * 8 + 8));
  assert.deepEqual(b, [...a].reverse());
  assert.deepEqual(c, a);
  assert.deepEqual(d, [...a].reverse());
});

test('a 24 to 30 stretch maps first to first and last to last', () => {
  const lead = makeStrip('lead', 24);
  const twin = makeStrip('twin', 30, { y0: 30 });
  const same = sym([side('side-1', ['lead']), side('side-2', ['twin'])], 'same');
  const frame = renderPixelFrame(ctx([lead, twin], { patternId: 'gradient', symmetry: same }));
  const [a, b] = frame.stripFrames;
  assert.equal(a.leds.length, 24);
  assert.equal(b.leds.length, 30);
  assert.deepEqual(colors(b)[0], colors(a)[0]);
  assert.deepEqual(colors(b)[29], colors(a)[23]);
  for (let i = 0; i < 30; i++) {
    // written out, not through mirrorSourceIndex, so the two can disagree
    assert.deepEqual(colors(b)[i], colors(a)[Math.round(i * 23 / 29)], `twin LED ${i}`);
  }
  // and reversed, the ends swap
  const flipped = renderPixelFrame(ctx([lead, twin], { patternId: 'gradient', symmetry: sym([side('side-1', ['lead']), side('side-2', ['twin'])], 'mirror') }));
  assert.deepEqual(colors(flipped.stripFrames[1])[0], colors(flipped.stripFrames[0])[23]);
  assert.deepEqual(colors(flipped.stripFrames[1])[29], colors(flipped.stripFrames[0])[0]);
});

test('own mode (sidesMirrored false) leaves every side independent', () => {
  const own = renderPixelFrame(ctx([L1, L2, R1, R2], { patternId: 'gradient', symmetry: TWO, sidesMirrored: false }));
  assert.notDeepEqual(own.pixels.slice(12), own.pixels.slice(0, 12).reverse());
  // each side still flows as its own run: two sides of equal length agree on progress
  const log = [];
  renderPixelFrame(ctx([L1, L2, R1, R2], { activeFn: probe(log), symmetry: TWO, sidesMirrored: false }));
  const one = log.filter(entry => ['l1', 'l2'].includes(entry.stripId)).map(entry => entry.stripProgress);
  const two = log.filter(entry => ['r1', 'r2'].includes(entry.stripId)).map(entry => entry.stripProgress);
  assert.deepEqual(two, one);
});

test('null symmetry is byte-identical to a render that never heard of it', () => {
  const strips = [L1, L2, OWN, R1, R2];
  const base = JSON.stringify(renderPixelFrame(ctx(strips)));
  assert.equal(JSON.stringify(renderPixelFrame(ctx(strips, { symmetry: null }))), base);
  assert.equal(JSON.stringify(renderPixelFrame(ctx(strips, { symmetry: undefined, sidesMirrored: true }))), base);
  assert.equal(JSON.stringify(renderPixelFrame(ctx(strips, { symmetry: null, sidesMirrored: false }))), base);
  // what the pattern is asked, not just what it returns: global index, piece-wide count
  const asked = extra => {
    const log = [];
    renderPixelFrame(ctx(strips, { activeFn: probe(log), ...extra }));
    return JSON.stringify(log);
  };
  assert.equal(asked({ symmetry: null }), asked({}));
  assert.ok(JSON.parse(asked({})).every(entry => entry.count === 31));
  // a symmetry naming strips that are not there changes nothing either
  assert.equal(JSON.stringify(renderPixelFrame(ctx(strips, { symmetry: sym([side('side-1', ['nope']), side('side-2', ['nada'])]) }))), base);
});

test('a hidden lead leaves the twin side rendering itself', () => {
  const strips = [{ ...L1, hidden: true }, { ...L2, hidden: true }, R1, R2];
  const plain = renderPixelFrame(ctx(strips, { symmetry: sym([side('side-1', []), side('side-2', ['r1', 'r2'])]), sidesMirrored: false }));
  const mirrored = renderPixelFrame(ctx(strips, { symmetry: TWO }));
  assert.deepEqual(mirrored.pixels, plain.pixels);
});

test('a hidden strip inside a side is skipped and the side continues over the rest', () => {
  const log = [];
  renderPixelFrame(ctx([L1, { ...L2, hidden: true }, OWN], { activeFn: probe(log), symmetry: sym([side('side-1', ['l1', 'l2'])]), sidesMirrored: false }));
  const inSide = log.filter(entry => entry.stripId === 'l1');
  assert.equal(inSide.length, 6);
  assert.ok(Math.abs(inSide.at(-1).stripProgress - 1) < 1e-9, 'the visible strip alone runs 0 to 1');
});

test('planSymmetrySides and sideRunByStrip agree on where each strip sits in its side', () => {
  const runs = planSymmetrySides({ symmetry: TWO, strips: [L1, L2, OWN, R1, R2] });
  assert.deepEqual(runs.map(run => [run.id, run.length, run.flip]), [['side-1', 12, false], ['side-2', 12, true]]);
  const byStrip = sideRunByStrip({ symmetry: TWO, strips: [L1, L2, OWN, R1, R2] });
  assert.deepEqual(byStrip.get('l2'), { sideId: 'side-1', before: 6, length: 12 });
  assert.equal(byStrip.has('own'), false);
  assert.equal(sideRunByStrip({ symmetry: null, strips: [L1] }).size, 0);
});

test('applySymmetrySides with no symmetry, or sides not mirrored, is a no-op that returns the same array', () => {
  const pixels = [{ r: 1, g: 2, b: 3 }];
  assert.equal(applySymmetrySides({ framePixels: pixels, strips: [], symmetry: null }), pixels);
  assert.equal(applySymmetrySides({ framePixels: pixels, strips: [L1], symmetry: TWO, sidesMirrored: false }), pixels);
  assert.deepEqual(pixels, [{ r: 1, g: 2, b: 3 }]);
});

test('virtual strips honour mirrorOf and mirrorFlip', () => {
  const strips = [
    { id: 'a', pts: { length: 3 } },
    { id: 'b', pts: { length: 3 }, mirrorOf: 'a', mirrorFlip: true },
    { id: 'c', pts: { length: 3 }, mirrorOf: 'a', mirrorFlip: false },
    { id: 'd', pts: { length: 3 }, mirrorOf: 'ghost' },
  ];
  const px = i => ({ r: i, g: i, b: i });
  const frame = [px(1), px(2), px(3), px(4), px(4), px(4), px(5), px(5), px(5), px(9), px(9), px(9)];
  applyStripMirrors({ framePixels: frame, strips });
  assert.deepEqual(frame.slice(3, 6), [px(3), px(2), px(1)]);
  assert.deepEqual(frame.slice(6, 9), [px(1), px(2), px(3)]);
  assert.deepEqual(frame.slice(9, 12), [px(9), px(9), px(9)], 'a missing source leaves the copy as it was');
});

test('Pattern Lab recipe frames mirror on the final composited colours, layers included', () => {
  const recipe = recipeFromPattern('gradient', { palette: ['#000000', '#ff0000', '#00ff88'] });
  recipe.layers = [
    { generator: { kind: 'lightweaver-pattern', patternId: 'scanner', params: {} }, opacity: 0.5, blendMode: 'screen', mask: { kind: 'none' } },
  ];
  const strips = [L1, L2, OWN, R1, R2];
  const frame = renderPatternLabRecipeFrame(recipe, { t: 1.3, strips, bpm: 100, symmetry: TWO, sidesMirrored: true });
  const own = renderPatternLabRecipeFrame(recipe, { t: 1.3, strips, bpm: 100, symmetry: TWO, sidesMirrored: false });
  const lead = [...colors(frame.stripFrames[0]), ...colors(frame.stripFrames[1])];
  const twin = [...colors(frame.stripFrames[3]), ...colors(frame.stripFrames[4])];
  assert.deepEqual(twin, [...lead].reverse());
  assert.deepEqual(colors(frame.stripFrames[2]), colors(own.stripFrames[2]));
  assert.notDeepEqual(colors(own.stripFrames[3]), colors(frame.stripFrames[3]), 'own mode really differs');
});
