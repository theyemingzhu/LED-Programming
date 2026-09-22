import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBehaviorFieldPatch,
  blendColorMaps,
  playbackAtElapsed,
  updateAreaSelection,
} from './model.js';

const catalog = {
  areas: [
    { id: 'all', kind: 'all', name: 'Whole artwork', stripIds: ['r1', 'r2', 'r3'] },
    { id: 'family:ribbon', kind: 'family', name: 'All sections', stripIds: ['r1', 'r2', 'r3'] },
    { id: 'group:ends', kind: 'group', name: 'Ends', stripIds: ['r1', 'r3'] },
    { id: 'strip:r1', kind: 'strip', name: 'Left', stripIds: ['r1'] },
    { id: 'strip:r2', kind: 'strip', name: 'Center', stripIds: ['r2'] },
    { id: 'strip:r3', kind: 'strip', name: 'Right', stripIds: ['r3'] },
  ],
};

const behaviors = [
  { id: 'b1', target: { areaIds: ['strip:r1'], domain: 'repeat' }, patternId: 'breathe', palette: ['#100000', '#110000', '#120000', '#130000'], speed: 0.7, brightness: 0.4 },
  { id: 'b2', target: { areaIds: ['strip:r2'], domain: 'repeat' }, patternId: 'chase', palette: ['#001000', '#001100', '#001200', '#001300'], speed: 1.1, brightness: 0.6 },
  { id: 'b3', target: { areaIds: ['strip:r3'], domain: 'repeat' }, patternId: 'sparkle', palette: ['#000010', '#000011', '#000012', '#000013'], speed: 1.5, brightness: 0.8 },
];

test('whole selection palette edit retains three pattern IDs and unrelated fields', () => {
  const result = applyBehaviorFieldPatch({
    behaviors,
    selection: { areaIds: ['all'], domain: 'repeat' },
    catalog,
    patch: { field: 'palette', index: 2, value: '#abcdef' },
  });

  assert.deepEqual(result.map(item => item.patternId), ['breathe', 'chase', 'sparkle']);
  assert.deepEqual(result.map(item => item.palette[2]), ['#abcdef', '#abcdef', '#abcdef']);
  assert.deepEqual(result.map(item => item.speed), [0.7, 1.1, 1.5]);
  assert.deepEqual(result.map(item => item.brightness), [0.4, 0.6, 0.8]);
});

test('whole selection pattern edit retains distinct per-area palettes', () => {
  const beforePalettes = behaviors.map(item => item.palette);
  const result = applyBehaviorFieldPatch({
    behaviors,
    selection: { areaIds: ['all'], domain: 'repeat' },
    catalog,
    patch: { field: 'patternId', value: 'plasma' },
  });

  assert.deepEqual(result.map(item => item.patternId), ['plasma', 'plasma', 'plasma']);
  assert.deepEqual(result.map(item => item.palette), beforePalettes);
});

test('leaf edit splits a group override without changing the untouched member', () => {
  const grouped = [{
    id: 'ends', target: { areaIds: ['group:ends'], domain: 'continuous' },
    patternId: 'ripple', palette: ['#100000', '#200000', '#300000', '#400000'], speed: 1.2, brightness: 0.7,
  }];
  const result = applyBehaviorFieldPatch({
    behaviors: grouped,
    selection: { areaIds: ['strip:r1'], domain: 'repeat' },
    catalog,
    patch: { field: 'brightness', value: 0.25 },
  });

  assert.deepEqual(result.map(item => item.target.areaIds), [['strip:r1'], ['strip:r3']]);
  assert.deepEqual(result.map(item => item.brightness), [0.25, 0.7]);
  assert.deepEqual(result.map(item => item.patternId), ['ripple', 'ripple']);
  assert.deepEqual(result.map(item => item.palette), [grouped[0].palette, grouped[0].palette]);
});

test('playback uses hold time before blending and lands exactly on the next step', () => {
  const steps = [
    { id: 'a', hold: 4, transition: 2 },
    { id: 'b', hold: 3, transition: 1 },
  ];

  assert.deepEqual(playbackAtElapsed(steps, 0), { index: 0, nextIndex: 1, phase: 'hold', localTime: 0, transitionProgress: 0 });
  assert.deepEqual(playbackAtElapsed(steps, 4), { index: 0, nextIndex: 1, phase: 'transition', localTime: 4, transitionProgress: 0 });
  assert.deepEqual(playbackAtElapsed(steps, 5), { index: 0, nextIndex: 1, phase: 'transition', localTime: 5, transitionProgress: 0.5 });
  assert.deepEqual(playbackAtElapsed(steps, 6), { index: 1, nextIndex: 0, phase: 'hold', localTime: 0, transitionProgress: 0 });
  assert.deepEqual(playbackAtElapsed(steps, 10), { index: 0, nextIndex: 1, phase: 'hold', localTime: 0, transitionProgress: 0 });
});

test('frame blending is deterministic at transition beginning, middle, and end', () => {
  const from = { r1: [{ r: 20, g: 40, b: 60 }] };
  const to = { r1: [{ r: 120, g: 140, b: 160 }] };
  assert.deepEqual(blendColorMaps(from, to, 0), from);
  assert.deepEqual(blendColorMaps(from, to, 0.5), { r1: [{ r: 70, g: 90, b: 110 }] });
  assert.deepEqual(blendColorMaps(from, to, 1), to);
});

test('touch leaf selection can add nonadjacent sections while parent selection stays one domain', () => {
  let selection = updateAreaSelection({ areaIds: ['all'], domain: 'continuous' }, catalog.areas[3]);
  assert.deepEqual(selection, { areaIds: ['strip:r1'], domain: 'repeat' });
  selection = updateAreaSelection(selection, catalog.areas[5]);
  assert.deepEqual(selection, { areaIds: ['strip:r1', 'strip:r3'], domain: 'repeat' });
  selection = updateAreaSelection(selection, catalog.areas[1]);
  assert.deepEqual(selection, { areaIds: ['family:ribbon'], domain: 'repeat' });
});
