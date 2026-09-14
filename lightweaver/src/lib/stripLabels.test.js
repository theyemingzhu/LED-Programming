import test from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratedStripName, nextStripNames, placeStripLabels } from './stripLabels.js';

test('numbered identities avoid custom names and preserve source ids', () => {
  const strips = [{ id: 'original', name: 'Untitled Project' }, { id: 'custom', name: 'Strip 2' }];
  assert.deepEqual(nextStripNames(strips, 4, 'original'), ['Strip 1', 'Strip 3', 'Strip 4', 'Strip 5']);
  assert.equal(strips[0].id, 'original');
  assert.equal(isGeneratedStripName('Untitled Project'), true);
  assert.equal(isGeneratedStripName('Mandala', 'Mandala'), true);
  assert.equal(isGeneratedStripName('North arch', 'Mandala'), false);
});

test('crowded labels occupy separate lanes without changing strip geometry', () => {
  const strips = Array.from({ length: 4 }, (_, i) => ({ id: `strip-${i}`, pixels: [{ x: 200 + i, y: 200 }] }));
  const labels = placeStripLabels(strips, 1, { x: 0, y: 0, w: 500, h: 500 });
  assert.equal(labels.length, 4);
  assert.equal(new Set(labels.map(l => l.y)).size, 4);
  assert.deepEqual(strips[0].pixels, [{ x: 200, y: 200 }]);
});

test('dividing an existing numbered strip keeps its identity and allocates free sibling numbers', () => {
  assert.deepEqual(nextStripNames([{ id: 'keep', name: 'Strip 4' }, { id: 'other', name: 'Strip 1' }], 3, 'keep'), ['Strip 4', 'Strip 2', 'Strip 3']);
});
