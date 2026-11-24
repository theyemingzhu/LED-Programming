import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAreas } from './areas.js';
import { buildPieceMap, decodePieceMap, encodePieceMap, previewPieceMap } from './pieceMap.js';
import { C, lotus } from './testFixtures.js';

const strips = lotus();
const derived = deriveAreas(strips, { fold: 6, centre: C });
const map = buildPieceMap(strips, derived, C);

test('one entry per LED, in strip order, with sensible values', () => {
  assert.equal(map.leds.length, strips.reduce((n, s) => n + s.pixels.length, 0));
  assert.deepEqual(map.copyCounts, [1, 6, 12, 6]);
  for (const led of map.leds) {
    assert.ok(led.area >= 0 && led.shape >= 0 && led.shape <= 1 && led.out >= 0 && led.out <= 1);
  }
  const first = map.leds[0]; // petal-0-left LED 1: the centre end of a petal
  assert.equal(strips[0].id, 'petal-0-left');
  assert.equal(first.area, 1);
  assert.equal(first.copy, 0);
  assert.equal(first.shape, 0);
  assert.equal(map.leds[strips[0].pixels.length - 1].shape, 1);
  assert.ok(first.out < 0.2);
});

test('bytes round-trip: area, copy, and shape/out to a byte', () => {
  const bytes = encodePieceMap(map);
  assert.equal(bytes.length, 4 + map.leds.length * 3);
  assert.deepEqual([bytes[0], bytes[1] | (bytes[2] << 8), bytes[3]], [1, map.leds.length, 4]);
  const back = decodePieceMap(bytes);
  assert.deepEqual(back.copyCounts, map.copyCounts);
  back.leds.forEach((led, i) => {
    assert.equal(led.area, map.leds[i].area);
    assert.equal(led.copy, map.leds[i].copy);
    assert.ok(Math.abs(led.shape - map.leds[i].shape) <= 0.5 / 255 + 1e-9);
    assert.ok(Math.abs(led.out - map.leds[i].out) <= 0.5 / 255 + 1e-9);
  });
  assert.deepEqual([...encodePieceMap(back)], [...bytes]);
});

test('a strip in no area is written 0xFF and read back as none', () => {
  const lone = buildPieceMap([{ id: 'z', pixels: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }], { areas: [], flips: {} }, C);
  const bytes = encodePieceMap(lone);
  assert.equal(bytes[4], 0xff);
  assert.equal(decodePieceMap(bytes).leds[0].area, -1);
});

test('too many areas or copies throw, and the preview falls back to the exact table', () => {
  const many = { areaIds: Array(9).fill('a'), copyCounts: Array(9).fill(1), leds: [] };
  assert.throws(() => encodePieceMap(many), RangeError);
  assert.equal(previewPieceMap(many), many);
  assert.throws(() => encodePieceMap({ copyCounts: [40], leds: [{ area: 0, copy: 40, shape: 0, out: 0 }] }), RangeError);
  assert.throws(() => decodePieceMap(new Uint8Array([9, 0, 0, 0])), TypeError);
});

test('previewPieceMap is what the card would receive', () => {
  const preview = previewPieceMap(map);
  assert.deepEqual(preview.areaIds, map.areaIds);
  assert.equal(preview.leds[5].shape, Math.round(map.leds[5].shape * 255) / 255);
});
