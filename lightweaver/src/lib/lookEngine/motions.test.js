import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIONS, getMotion, hasMotion, motionParams, DEFAULT_MOTION_ID } from './motions.js';

// Adding a motion: add its object to MOTIONS. This contract runs over every
// registered motion with no list to edit here.
test('every motion is 0..1 across its params, positions and clocks, and closes its loop seam', () => {
  assert.ok(MOTIONS.length >= 3);
  for (const motion of MOTIONS) {
    assert.equal(typeof motion.id, 'string');
    assert.ok(motion.label.length > 0, `${motion.id} has a label`);
    assert.equal(new Set(MOTIONS.map(m => m.id)).size, MOTIONS.length);
    const corners = motion.params.length
      ? motion.params.flatMap(spec => [spec.min, spec.default, spec.max]).map(value => ({ [motion.params[0].id]: value }))
      : [{}];
    for (const given of corners) {
      const params = motionParams(motion, given);
      for (let c = 0; c <= 1.0001; c += 0.05) {
        for (let p = 0; p <= 1.0001; p += 0.1) {
          const v = motion.level(Math.min(1, p), Math.min(1, c), params, {});
          assert.ok(v >= 0 && v <= 1 && Number.isFinite(v), `${motion.id} c=${c} p=${p} gave ${v}`);
        }
      }
      for (let p = 0; p <= 1; p += 0.1) {
        assert.ok(Math.abs(motion.level(p, 0, params, {}) - motion.level(p, 1, params, {})) < 1e-9, `${motion.id} seam at p=${p}`);
      }
    }
    for (const spec of motion.params) assert.ok(spec.min <= spec.default && spec.default <= spec.max && spec.label);
  }
});

test('an unknown motion falls back to the default; params are clamped and filled', () => {
  assert.equal(hasMotion('nope'), false);
  assert.equal(getMotion('nope').id, DEFAULT_MOTION_ID);
  const chase = getMotion('chase');
  assert.equal(motionParams(chase, {}).width, 0.22);
  assert.equal(motionParams(chase, { width: 99 }).width, 0.6);
  assert.equal(motionParams(chase, { width: 'x' }).width, 0.22);
});

test('the three shipped motions behave as the sketch did', () => {
  assert.equal(getMotion('fill').level(0.3, 0.25, {}), 1);
  assert.equal(getMotion('fill').level(0.8, 0.25, {}), 0);
  assert.equal(getMotion('pulse').level(0, 0, {}), 0);
  assert.ok(Math.abs(getMotion('pulse').level(0, 0.5, {}) - 1) < 1e-9);
  const chase = getMotion('chase');
  assert.equal(chase.level(0.5, 0.5, { width: 0.22 }), 1);
  assert.equal(chase.level(0.0, 0.5, { width: 0.22 }), 0);
});
