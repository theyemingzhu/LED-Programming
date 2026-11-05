import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLayoutPatternFrame } from '../components/layout/hooks/layoutFrameMapping.js';

const color = value => ({ r: value, g: value + 1, b: value + 2 });
test('section physical source LED order, holes, hidden strips and flipped unequal-length sides stay exact', () => {
  const leds = [color(10), color(20), color(30)];
  const frame = { stripFrames: [{ id: 'zone', leds }] };
  const strips = ['lead','twin','new','hidden'].map(id => ({ id, pixelCount: id === 'twin' ? 5 : 3 }));
  const mapping = { strips, renderSegments: [{ id: 'zone', pixels: [{ stripId: 'lead', sourceLed: 2 }, { stripId: 'lead', sourceLed: 0 }, { stripId: 'lead', sourceLed: 1 }] }],
    previewTime: 0, hidden: { hidden: true }, mirrorSides: true,
    symmetry: { orientation: 'mirror', sides: [{ stripIds: ['lead'] }, { stripIds: ['twin','hidden'], flipped: true }] } };
  const result = mapLayoutPatternFrame(frame, mapping);
  assert.deepEqual(result.get('lead').leds, [leds[1], leds[2], leds[0]]);
  assert.equal(result.get('new').leds.filter(Boolean).length, 0);
  assert.equal(result.get('hidden').leds.filter(Boolean).length, 0);
  assert.deepEqual(result.get('twin').leds, [leds[0], leds[0], leds[2], leds[2], leds[1]]);
  assert.deepEqual(result.get('lead'), { id: 'lead', leds: [leds[1], leds[2], leds[0]], avgR: 20, avgG: 21, avgB: 22 });
});
test('without sections the frame engine strip order and mirror output pass through untouched', () => {
  const strip = { id: 'a', leds: [color(2)], avgR: 2, avgG: 3, avgB: 4 };
  assert.equal(mapLayoutPatternFrame({ stripFrames: [strip] }, { renderSegments: [] }).get('a'), strip);
});
