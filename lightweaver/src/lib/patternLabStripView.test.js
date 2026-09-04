import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenToStripView, stripRunLengths } from './patternLabStripView.js';

const geometry = () => ({
  strips: [
    { id: 'outer', name: 'Outer circle', pts: [{ x: 5, y: 5 }, { x: 9, y: 2 }, { x: 12, y: 7 }] },
    { id: 'inner', name: 'Inner circle', pts: [{ x: 20, y: 20 }, { x: 24, y: 26 }] },
  ],
  viewBox: '0 0 640 400',
  svgText: '<svg/>',
  hidden: {},
  symSettings: { enabled: true, type: 'mirror' },
  bpm: 120,
});

test('the run lengths are the strips in chain order with their counts', () => {
  assert.deepEqual(stripRunLengths(geometry()), [
    { id: 'outer', name: 'Outer circle', count: 3 },
    { id: 'inner', name: 'Inner circle', count: 2 },
  ]);
});

test('a hidden strip is not in the line, because it is not in the run', () => {
  const g = geometry();
  g.hidden = { inner: true };
  assert.deepEqual(stripRunLengths(g).map(r => r.id), ['outer']);
  const flat = flattenToStripView(g);
  assert.equal(flat.strips.reduce((n, s) => n + s.pts.length, 0), 3);
});

test('every light lands on one line, evenly spaced, in chain order', () => {
  const flat = flattenToStripView(geometry());
  const all = flat.strips.flatMap(s => s.pts);
  assert.equal(all.length, 5, 'no light is added or lost');

  const ys = new Set(all.map(p => p.y));
  assert.equal(ys.size, 1, 'a strip view is a line');

  const xs = all.map(p => p.x);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs, 'x increases along the chain');
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.equal(new Set(gaps).size, 1, 'spacing is uniform across the seam too');
});

test('the box is rebuilt to fit the line rather than kept from the artwork', () => {
  const flat = flattenToStripView(geometry());
  assert.notEqual(flat.viewBox, '0 0 640 400');
  const [, , w, h] = flat.viewBox.split(' ').map(Number);
  const xs = flat.strips.flatMap(s => s.pts.map(p => p.x));
  assert.ok(Math.max(...xs) <= w, 'the last light is inside the box');
  assert.ok(Math.min(...xs) > 0, 'the first light is not against the edge');
  assert.ok(h > 0);
});

test('the artwork and its symmetry are dropped — they describe a shape this is not', () => {
  const flat = flattenToStripView(geometry());
  assert.equal(flat.svgText, '');
  assert.equal(flat.symSettings, null);
  for (const strip of flat.strips) assert.equal(strip.kaleidoscope, null);
  // Everything not about shape survives untouched.
  assert.equal(flat.bpm, 120);
  assert.equal(flat.strips[0].name, 'Outer circle');
});

test('a piece with no lights is handed back unchanged rather than a broken box', () => {
  const empty = { strips: [], viewBox: '0 0 10 10' };
  assert.equal(flattenToStripView(empty), empty);
});
