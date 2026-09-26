import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSectionPresentationRows } from './sectionPresentation.js';

test('section presentation keeps patch identity distinct from zones and GPIOs', () => {
  const targets = [
    { id: 'all', kind: 'all', label: 'All sections', pixelCount: 5, look: { patternId: 'fire' } },
    { id: 'patch-a', zoneId: 'zone-a', kind: 'section', label: 'Branch', pixelCount: 3, ranges: [{ start: 0, count: 3 }], look: { patternId: 'fire' } },
    { id: 'patch-b', zoneId: 'zone-b', kind: 'section', label: 'Open line', pixelCount: 2, ranges: [{ start: 3, count: 2 }], look: { patternId: 'ocean' } },
  ];
  const compiledWiring = {
    ok: true,
    outputs: [{ id: 'out-a', pin: 16 }, { id: 'out-b', pin: 17 }],
    pixels: [
      { outputId: 'out-a' }, { outputId: 'out-b' }, { outputId: 'out-b' },
      { outputId: 'out-b' }, { outputId: 'out-b' },
    ],
  };
  const rows = deriveSectionPresentationRows({ targets, compiledWiring, patternNameFor: id => ({ fire: 'Fire', ocean: 'Ocean' })[id] });
  assert.deepEqual(rows.map(row => row.id), ['all', 'patch-a', 'patch-b']);
  assert.equal(rows[0].lookLabel, 'Mixed');
  assert.deepEqual(rows[1].outputIds, ['out-a', 'out-b']);
  assert.deepEqual(rows[1].pins, [16, 17]);
  assert.equal(rows[1].routeLabel, 'GPIO 16 · GPIO 17');
  assert.equal(rows[1].zoneId, 'zone-a');
  assert.equal(rows[2].routeLabel, 'GPIO 17');
});

test('All shows the shared effective section look even when its saved default differs', () => {
  const rows = deriveSectionPresentationRows({
    targets: [
      { id: 'all', kind: 'all', look: { patternId: 'fire' } },
      { id: 'one', kind: 'section', look: { patternId: 'ocean', speed: 1 } },
      { id: 'two', kind: 'section', look: { speed: 1, patternId: 'ocean' } },
    ],
    patternNameFor: id => id === 'ocean' ? 'Ocean' : 'Fire',
  });
  assert.equal(rows[0].lookLabel, 'Ocean');
  assert.equal(rows[0].patternId, 'ocean');
});
