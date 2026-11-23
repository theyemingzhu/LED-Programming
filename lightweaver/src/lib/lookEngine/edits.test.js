import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBend, readBend, setArea, setOrder, setPiece, stepMotion } from './edits.js';
import { motionIds } from './motions.js';
import { normalizeLook } from './schema.js';

const base = normalizeLook({ areas: { a: {}, b: {}, c: {} } });

test('bend sliders move the breath, the spread and the ground, and read back', () => {
  assert.equal(applyBend(base, 'pace', 100).breath, 3);
  assert.equal(applyBend(base, 'pace', 0).breath, 13);
  assert.equal(applyBend(base, 'spread', 0).piece.spread, 0);
  assert.ok(applyBend(base, 'glow', 100).ground > base.ground);
  const bent = applyBend(applyBend(base, 'pace', 80), 'glow', 40);
  assert.deepEqual([readBend(bent).pace, readBend(bent).glow], [80, 40]);
});

test('a tap steps to the next motion in the registry, round to the start', () => {
  let look = base;
  const seen = [look.areas.a.motion.type];
  for (let i = 0; i < motionIds().length; i += 1) { look = stepMotion(look, 'a'); seen.push(look.areas.a.motion.type); }
  assert.equal(seen[0], seen[seen.length - 1]);
  assert.equal(new Set(seen).size, motionIds().length);
  assert.equal(stepMotion(base, 'b').areas.a.motion.type, base.areas.a.motion.type);
});

test('a drag sets the order areas begin in; the rest follow, and turns stop', () => {
  const look = setOrder(setPiece(base, { takeTurns: true, spread: 0 }), ['c', 'a']);
  assert.equal(look.areas.c.begins, 0);
  assert.ok(look.areas.a.begins > look.areas.c.begins);
  assert.ok(look.areas.b.begins > look.areas.a.begins);
  assert.equal(look.piece.takeTurns, false);
  assert.equal(look.piece.spread, 1);
});

test('setArea and setPiece keep the look normal', () => {
  assert.equal(setArea(base, 'a', { fade: 7 }).areas.a.fade, 1);
  assert.equal(setPiece(base, { petalByPetal: true }).piece.petalByPetal, true);
});

test('the colour journey only matters while some area takes the look\'s colours', async () => {
  const { lookUsesJourney } = await import('./edits.js');
  const { buildPieceModel, frameByStrip } = await import('./model.js');
  const { startingLooks } = await import('./variations.js');
  const { lotus } = await import('./testFixtures.js');
  const model = buildPieceModel(lotus({ circles: false }), {});
  const ids = model.derived.areas.map(a => a.id);
  const onPatterns = startingLooks(model.derived.areas, { patterns: ['aurora', 'lava', 'fire'] })[0].look;
  assert.equal(lookUsesJourney(onPatterns, ids), false);
  const frame = look => JSON.stringify([...frameByStrip(look, model, 2.6).values()].map(v => v.leds));
  // Every area on a pattern: changing the journey changes nothing, so the screen says so.
  assert.equal(frame({ ...onPatterns, journey: 'tide' }), frame(onPatterns));
  // One area back on the look's colours: the journey now changes the picture.
  const one = setArea(onPatterns, ids[0], { source: { kind: 'journey' } });
  assert.equal(lookUsesJourney(one, ids), true);
  assert.notEqual(frame({ ...one, journey: 'tide' }), frame(one));
});
