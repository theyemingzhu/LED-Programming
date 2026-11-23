import test from 'node:test';
import assert from 'node:assert/strict';
import { stripDotAt } from './stripDots.js';

const line = (from, to, n = 5) => ({ pixels: Array.from({ length: n }, (_, i) => ({ x: from.x + (to.x - from.x) * i / (n - 1), y: from.y + (to.y - from.y) * i / (n - 1) })) });

test('the dot sits one reach before LED 1, on the side away from the strip', () => {
  const dot = stripDotAt(line({ x: 100, y: 50 }, { x: 200, y: 50 }), 2);
  assert.equal(dot.x, 100 - 26);
  assert.equal(dot.y, 50);
  assert.deepEqual([dot.dx, dot.dy], [-1, 0]);
});

test('reversing the strip (LED 1 at the other end) moves the dot to that end', () => {
  const forward = stripDotAt(line({ x: 100, y: 50 }, { x: 200, y: 50 }), 1);
  const reversed = stripDotAt({ pixels: line({ x: 100, y: 50 }, { x: 200, y: 50 }).pixels.slice().reverse() }, 1);
  assert.ok(forward.x < 100);
  assert.ok(reversed.x > 200);
});

test('a one-light strip still gets a dot, above the light', () => {
  const dot = stripDotAt({ pixels: [{ x: 10, y: 10 }] }, 1);
  assert.deepEqual([dot.x, dot.y], [10, -3]);
});
