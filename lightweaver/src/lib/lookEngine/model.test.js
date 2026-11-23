import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPieceModel, frameByStrip } from './model.js';
import { startingLooks } from './variations.js';
import { C, lotus } from './testFixtures.js';

const strips = lotus().map((s, i) => (i === 0 ? { ...s, name: 'First petal edge' } : s));

test('the model names single-strip areas by the strip and the rest plainly', () => {
  const lone = buildPieceModel(strips.slice(0, 2), {});
  assert.equal(lone.names[0], 'First petal edge');
  assert.equal(lone.names[1], 'Area 2');
  const piece = buildPieceModel(strips, { fold: 6, centre: C });
  assert.ok(piece.names.every(name => /^Area \d$/.test(name) || name === 'First petal edge'));
  assert.equal(piece.areaOfStrip.get('centre-ring'), 0);
});

test('frameByStrip gives every strip one colour per LED, in strip order', () => {
  const model = buildPieceModel(strips, { fold: 6, centre: C });
  const look = startingLooks(model.derived.areas)[0].look;
  const frame = frameByStrip(look, model, 3);
  assert.equal(frame.size, strips.length);
  for (const strip of strips) assert.equal(frame.get(strip.id).leds.length, strip.pixels.length);
  assert.notDeepEqual(frameByStrip(look, model, 3), frameByStrip(look, model, 3.7));
  assert.deepEqual(frameByStrip(look, model, 3), frameByStrip(look, model, 3));
});

test('a piece with no symmetry still previews, one area per strip', () => {
  const model = buildPieceModel(strips, {});
  assert.equal(model.derived.areas.length, strips.length);
  const look = startingLooks(model.derived.areas)[1].look;
  assert.equal(frameByStrip(look, model, 1).size, strips.length);
});
