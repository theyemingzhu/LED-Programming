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
