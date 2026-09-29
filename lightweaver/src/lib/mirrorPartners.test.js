import test from 'node:test';
import assert from 'node:assert/strict';

import { rankMirrorPartners } from './mirrorPartners.js';

// A strip as Layout holds it: LED positions in LED order.
function line(id, from, to, count) {
  return {
    id,
    pixels: Array.from({ length: count }, (_, index) => ({
      x: from.x + (to.x - from.x) * index / (count - 1),
      y: from.y + (to.y - from.y) * index / (count - 1),
    })),
  };
}

const centre = { x: 100, y: 100 };
// Left wing drawn from the centre outward and up.
const left = line('left', { x: 90, y: 100 }, { x: 20, y: 60 }, 41);

test('the reflected wing ranks first and is a likely match', () => {
  const right = line('right', { x: 110, y: 100 }, { x: 180, y: 60 }, 41);
  const stray = line('stray', { x: 30, y: 170 }, { x: 60, y: 190 }, 41);
  const ranked = rankMirrorPartners(left, [stray, right], { centre });
  assert.equal(ranked[0].id, 'right');
  assert.equal(ranked[0].likely, true);
  assert.equal(ranked[0].needsFlip, false);
  assert.equal(ranked[1].id, 'stray');
  assert.equal(ranked[1].likely, false);
});

test('a reflected wing drawn from the outside in needs a flip', () => {
  const rightBackwards = line('right', { x: 180, y: 60 }, { x: 110, y: 100 }, 41);
  const [entry] = rankMirrorPartners(left, [rightBackwards], { centre });
  assert.equal(entry.likely, true);
  assert.equal(entry.needsFlip, true);
});

test('all three partners of a four-way piece rank ahead of an unrelated strip', () => {
  const up = line('up', { x: 100, y: 90 }, { x: 100, y: 20 }, 30);
  const right = line('right', { x: 110, y: 100 }, { x: 180, y: 100 }, 30);
  const down = line('down', { x: 100, y: 110 }, { x: 100, y: 180 }, 30);
  const leftArm = line('left', { x: 90, y: 100 }, { x: 20, y: 100 }, 30);
  const stray = line('stray', { x: 20, y: 20 }, { x: 40, y: 30 }, 30);
  const ranked = rankMirrorPartners(up, [stray, right, down, leftArm], { centre });
  assert.deepEqual(ranked.slice(0, 3).map(entry => entry.likely), [true, true, true]);
  assert.deepEqual(new Set(ranked.slice(0, 3).map(entry => entry.id)), new Set(['right', 'down', 'left']));
  assert.equal(ranked[3].id, 'stray');
  assert.ok(ranked.slice(0, 3).every(entry => !entry.needsFlip));
});

test('a ring quarter rotated a quarter turn matches as drawn, no flip', () => {
  const arc = (id, start, count = 20) => ({
    id,
    pixels: Array.from({ length: count }, (_, index) => {
      const angle = start + (Math.PI / 2) * index / (count - 1);
      return { x: 100 + 60 * Math.cos(angle), y: 100 + 60 * Math.sin(angle) };
    }),
  });
  const [entry] = rankMirrorPartners(arc('q1', 0), [arc('q2', Math.PI / 2)], { centre });
  assert.equal(entry.likely, true);
  assert.equal(entry.needsFlip, false);
});

test('a matching shape with a very different count is not called likely', () => {
  const right = line('right', { x: 110, y: 100 }, { x: 180, y: 60 }, 12);
  const [entry] = rankMirrorPartners(left, [right], { centre });
  assert.equal(entry.likely, false);
});

test('without artwork, a stray strip off to one side does not hide the reflected wing', () => {
  const right = line('right', { x: 110, y: 100 }, { x: 180, y: 60 }, 41);
  const stray = line('stray', { x: 10, y: 260 }, { x: 60, y: 280 }, 41);
  const ranked = rankMirrorPartners(left, [stray, right]);
  assert.equal(ranked[0].id, 'right');
  assert.equal(ranked[0].likely, true);
  assert.equal(ranked[1].likely, false);
});

test('unrelated strips keep their list order', () => {
  const a = line('a', { x: 20, y: 20 }, { x: 40, y: 30 }, 10);
  const b = line('b', { x: 150, y: 170 }, { x: 170, y: 190 }, 10);
  const c = line('c', { x: 60, y: 180 }, { x: 70, y: 150 }, 10);
  assert.deepEqual(rankMirrorPartners(left, [a, b, c], { centre }).map(entry => entry.id), ['a', 'b', 'c']);
});

test('strips without positions are ranked last and never likely', () => {
  const ranked = rankMirrorPartners(left, [{ id: 'empty', pixels: [] }], { centre });
  assert.deepEqual(ranked, [{ id: 'empty', likely: false, needsFlip: false, score: Infinity }]);
  assert.deepEqual(rankMirrorPartners({ id: 'x', pixels: [] }, [left]).map(entry => entry.likely), [false]);
});
