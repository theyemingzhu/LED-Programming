import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBreathe, applyDirection, applyFade, applyGround, applySmoothness, applySpeed, frac } from './modifiers.js';

test('speed scales the cycles by a whole ratio; speed 2 wraps exactly twice per breath', () => {
  assert.equal(applySpeed(1, 2), 2);
  assert.equal(applySpeed(1, 0.5), 0.5);
  assert.equal(applySpeed(1, 3), 1); // not an allowed ratio: stays in step
  let wraps = 0;
  let last = frac(applySpeed(0, 2));
  for (let i = 1; i <= 1000; i += 1) {
    const now = frac(applySpeed(i / 1000, 2));
    if (now < last) wraps += 1;
    last = now;
  }
  assert.equal(wraps, 2); // cycle 1.0 at the half-way step, cycle 2.0 at the last
  assert.equal(frac(applySpeed(1, 2)), 0);
});

test('direction: forward, backward, and bounce returns to where it began', () => {
  assert.equal(applyDirection(0.25, 'forward'), 0.25);
  assert.ok(Math.abs(applyDirection(0.25, 'backward') - 0.75) < 1e-9);
  assert.equal(applyDirection(0, 'bounce'), 0);
  assert.equal(applyDirection(0.5, 'bounce'), 1);
  assert.ok(Math.abs(applyDirection(0.999999, 'bounce')) < 1e-4);
  assert.equal(applyDirection(0.25, 'bounce'), applyDirection(0.75, 'bounce'));
});

test('smoothness: 0 is the motion itself, more softens a hard edge, values stay 0..1', () => {
  const step = p => (p <= 0.5 ? 1 : 0);
  assert.equal(applySmoothness(step, 0.5, 0), 1);
  const soft = applySmoothness(step, 0.5, 1);
  assert.ok(soft > 0 && soft < 1);
  assert.ok(applySmoothness(step, 0.55, 1) > applySmoothness(step, 0.55, 0));
  for (let p = 0; p <= 1; p += 0.1) { const v = applySmoothness(step, p, 1); assert.ok(v >= 0 && v <= 1); }
});

test('fade is 1 mid-turn, 0 at the turn edges when full, and 1 when off', () => {
  assert.equal(applyFade(0, 0), 1);
  assert.equal(applyFade(0, 1), 0);
  assert.equal(applyFade(0.5, 1), 1);
  assert.ok(applyFade(0.1, 1) > 0 && applyFade(0.1, 1) < 1);
  assert.equal(applyFade(0.1, 0.1), 1);
});

test('breathe swells between (1 - amount) and 1, once per breath; off is 1', () => {
  assert.equal(applyBreathe(0.3, 0), 1);
  assert.equal(applyBreathe(0, 0.6), 1);
  assert.ok(Math.abs(applyBreathe(0.5, 0.6) - 0.4) < 1e-9);
  assert.ok(Math.abs(applyBreathe(1, 0.6) - applyBreathe(0, 0.6)) < 1e-9);
});

test('ground lifts the floor and keeps full at full', () => {
  assert.equal(applyGround(0, 0.2), 0.2);
  assert.equal(applyGround(1, 0.2), 1);
  assert.equal(applyGround(0.5, 0), 0.5);
});
