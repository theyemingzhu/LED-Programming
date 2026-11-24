import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLook, normalizeLookWithWarnings, LOOK_VERSION } from './schema.js';

test('an empty record becomes a complete look', () => {
  const look = normalizeLook(null, { areaIds: ['a', 'b'] });
  assert.equal(look.version, LOOK_VERSION);
  assert.equal(look.breath, 7);
  assert.deepEqual(Object.keys(look.areas), ['a', 'b']);
  assert.equal(look.areas.a.motion.type, 'pulse');
  assert.equal(look.areas.a.copies, 'together');
  assert.equal(look.piece.takeTurns, false);
});

test('values are clamped and bad choices fall back', () => {
  const look = normalizeLook({ breath: 99, ground: -3, areas: { a: { begins: 5, speed: 3, direction: 'sideways', copies: 'x', smoothness: 4, fade: 'no', breathe: 0.5 } } });
  assert.equal(look.breath, 16);
  assert.equal(look.ground, 0);
  const a = look.areas.a;
  assert.deepEqual([a.begins, a.speed, a.direction, a.copies, a.smoothness, a.fade, a.breathe], [0.9, 1, 'forward', 'together', 1, 0, 0.5]);
});

test('unknown keys survive, and an unknown motion falls back with a warning but remembers its name', () => {
  const { look, warnings } = normalizeLookWithWarnings({ future: { x: 1 }, areas: { a: { colour: 'teal', motion: { type: 'swirl', params: { k: 1 } } } } });
  assert.deepEqual(look.future, { x: 1 });
  assert.equal(look.areas.a.colour, 'teal');
  assert.equal(look.areas.a.motion.type, 'pulse');
  assert.equal(look.areas.a.motion.wantedType, 'swirl');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /swirl/);
});

test('normalizing twice changes nothing', () => {
  const once = normalizeLook({ breath: 5, areas: { a: { motion: { type: 'chase', params: { width: 0.3 } } } } });
  assert.deepEqual(normalizeLook(once), once);
});
