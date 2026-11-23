import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAreas } from './areas.js';
import { buildPieceMap, previewPieceMap } from './pieceMap.js';
import { renderLook, beginRanks } from './render.js';
import { resolveJourney } from './journeys.js';
import { startingLooks } from './variations.js';
import { normalizeLook } from './schema.js';
import { C, lotus } from './testFixtures.js';

const strips = lotus();
const derived = deriveAreas(strips, { fold: 6, centre: C });
const map = previewPieceMap(buildPieceMap(strips, derived, C));
const colours = resolveJourney('dawn');
const looks = startingLooks(derived.areas);
const sum = bytes => bytes.reduce((a, b) => a + b, 0);

test('same inputs, same bytes; different times, different bytes', () => {
  const a = renderLook(looks[0].look, map, colours, 3.3);
  const b = renderLook(looks[0].look, map, colours, 3.3);
  assert.equal(a.length, map.leds.length * 3);
  assert.deepEqual([...a], [...b]);
  assert.notDeepEqual([...a], [...renderLook(looks[0].look, map, colours, 4.1)]);
});

test('the render reads the table and nothing else: a look from the table alone renders', () => {
  const bare = { areaIds: null, copyCounts: map.copyCounts, leds: map.leds };
  const look = { ...looks[0].look, areas: Object.fromEntries(Object.entries(looks[0].look.areas)) };
  assert.equal(renderLook(look, bare, colours, 2).length, map.leds.length * 3);
});

test('a look repeats every breath when every area runs at speed 1 or 2 with no journey drift', () => {
  const look = normalizeLook({ ...looks[1].look, breath: 6 });
  const at = t => [...renderLook(look, map, [[200, 100, 50]], t)];
  assert.deepEqual(at(1.5), at(7.5));
});

test('an unknown motion still renders, as the default', () => {
  const odd = { ...looks[0].look, areas: Object.fromEntries(Object.entries(looks[0].look.areas).map(([id, rec]) => [id, { ...rec, motion: { type: 'swirl', params: {} } }])) };
  const plain = { ...looks[0].look, areas: Object.fromEntries(Object.entries(looks[0].look.areas).map(([id, rec]) => [id, { ...rec, motion: { type: 'pulse', params: {} } }])) };
  assert.deepEqual([...renderLook(odd, map, colours, 2.2)], [...renderLook(plain, map, colours, 2.2)]);
});

test('every look is lit at some moment, and ground keeps it from going fully dark', () => {
  for (const { look } of looks) assert.ok(sum(renderLook(look, map, colours, 2.5)) > 0);
  const dark = normalizeLook({ ...looks[0].look, ground: 0 });
  const glow = normalizeLook({ ...looks[0].look, ground: 0.3 });
  assert.ok(sum(renderLook(glow, map, colours, 1)) > sum(renderLook(dark, map, colours, 1)));
});

test('take turns darkens areas that are not having their turn; petal by petal staggers the copies', () => {
  const base = looks[1].look;
  const turns = normalizeLook({ ...base, ground: 0, piece: { ...base.piece, takeTurns: true } });
  assert.notDeepEqual([...renderLook(turns, map, colours, 2.5)], [...renderLook(base, map, colours, 2.5)]);
  const round = normalizeLook({ ...base, piece: { ...base.piece, petalByPetal: true } });
  assert.notDeepEqual([...renderLook(round, map, colours, 2.5)], [...renderLook(base, map, colours, 2.5)]);
});

test('each modifier changes the picture', () => {
  const base = looks[1].look;
  const id = Object.keys(base.areas)[1];
  const bytes = look => [...renderLook(look, map, colours, 2.7)];
  const baseline = bytes(base);
  for (const patch of [{ direction: 'backward' }, { direction: 'bounce' }, { speed: 2 }, { smoothness: 1 }, { fade: 1 }, { breathe: 1 }, { copies: 'after' }, { begins: 0.7 }]) {
    const changed = normalizeLook({ ...base, areas: { ...base.areas, [id]: { ...base.areas[id], motion: { type: 'chase', params: {} }, ...patch } } });
    const reference = normalizeLook({ ...base, areas: { ...base.areas, [id]: { ...base.areas[id], motion: { type: 'chase', params: {} } } } });
    assert.notDeepEqual(bytes(changed), bytes(reference), JSON.stringify(patch));
  }
  assert.ok(baseline.length > 0);
});

test('begin ranks put the first area to begin at 0 and the last at 1', () => {
  assert.deepEqual(beginRanks([0.3, 0, 0.6]), [0.5, 0, 1]);
  assert.deepEqual(beginRanks([0]), [0]);
});
