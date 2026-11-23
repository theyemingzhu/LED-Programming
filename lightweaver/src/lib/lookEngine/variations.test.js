import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAreas } from './areas.js';
import { nudgeLook, randomLook, seededRng, startingLooks } from './variations.js';
import { motionIds } from './motions.js';
import { normalizeLook } from './schema.js';
import { C, lotus } from './testFixtures.js';

const { areas } = deriveAreas(lotus(), { fold: 6, centre: C });

test('six named starting points, each already a normal look', () => {
  const looks = startingLooks(areas);
  assert.deepEqual(looks.map(l => l.label), ['Bloom', 'Tide', 'Call and answer', 'One breath', 'Turning', 'Pairs']);
  for (const { look } of looks) {
    assert.deepEqual(normalizeLook(look), look);
    assert.deepEqual(Object.keys(look.areas), areas.map(a => a.id));
  }
  assert.equal(looks[4].look.piece.petalByPetal, true);
  assert.equal(looks[2].look.piece.takeTurns, true);
});

test('Bloom begins centre first; Tide the other way; One breath all together', () => {
  const [bloom, tide, , one] = startingLooks(areas).map(l => areas.map(a => l.look.areas[a.id].begins));
  assert.equal(bloom[0], 0);
  assert.ok(bloom.every((v, i) => i === 0 || v > bloom[i - 1]));
  assert.deepEqual(tide, [...bloom].reverse());
  assert.ok(one.every(v => v === 0));
});

test('the same seed gives the same looks; no Math.random is read', () => {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random read'); };
  try {
    const a = randomLook(areas, seededRng(7));
    const b = randomLook(areas, seededRng(7));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, randomLook(areas, seededRng(8)));
    const base = startingLooks(areas)[0].look;
    assert.deepEqual(nudgeLook(base, seededRng(3)), nudgeLook(base, seededRng(3)));
  } finally { Math.random = real; }
});

test('a nudge changes the look but stays a normal look; random looks use known motions', () => {
  const base = startingLooks(areas)[0].look;
  let changed = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const next = nudgeLook(base, seededRng(seed));
    assert.deepEqual(normalizeLook(next), next);
    if (JSON.stringify(next) !== JSON.stringify(base)) changed += 1;
    const fresh = randomLook(areas, seededRng(seed));
    for (const rec of Object.values(fresh.areas)) assert.ok(motionIds().includes(rec.motion.type));
  }
  assert.ok(changed >= 15);
});

test('seededRng stays in 0..1', () => {
  const rng = seededRng(42);
  for (let i = 0; i < 1000; i += 1) { const v = rng(); assert.ok(v >= 0 && v < 1); }
});
