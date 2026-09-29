// v1 mirror sets are retired (see pieceSymmetry.test.js for the replacement).
// This file only guards what survives: cleaning saved sets and remapping their
// strip ids so migrateMirrorSetsToSymmetry receives sound input.
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMirrorSets, remapMirrorSetStripIds } from './mirrorSets.js';

const set = (id, members, name = '') => ({ id, name, members });

test('remapMirrorSetStripIds is pure and accepts a Map or an object', () => {
  const original = [set('mirror-1', ['a', 'b'], 'Wings')];
  const remapped = remapMirrorSetStripIds(original, new Map([['a', 'strip-1']]));
  assert.deepEqual(remapped[0].members, ['strip-1', 'b']);
  assert.deepEqual(original[0].members, ['a', 'b']);
  assert.deepEqual(remapMirrorSetStripIds(original, { b: 'strip-2' })[0].members, ['a', 'strip-2']);
  assert.deepEqual(remapMirrorSetStripIds(undefined, new Map()), []);
});

test('normalizeMirrorSets keeps good sets and drops sets that cannot hold together', () => {
  const normalized = normalizeMirrorSets([
    set('m1', ['a', 'b', 'a']),
    set('m2', ['b', 'c']),
    set('m3', ['x']),
    { id: '', members: ['p', 'q'] },
    null,
  ]);
  assert.deepEqual(normalized, [{ id: 'm1', name: '', members: ['a', 'b'] }]);
  assert.deepEqual(normalizeMirrorSets(undefined), []);
  assert.deepEqual(
    normalizeMirrorSets([set('m1', ['a', 'b', 'gone'])], { strips: [{ id: 'a' }, { id: 'b' }] })[0].members,
    ['a', 'b'],
  );
  assert.deepEqual(normalizeMirrorSets([set('m1', ['a', 'gone'])], { strips: [{ id: 'a' }] }), []);
});
