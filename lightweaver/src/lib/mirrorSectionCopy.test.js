import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIDES_HEADING,
  SIDES_OPTIONS,
  hasSymmetrySides,
  isMirroredSidesTarget,
  isSideTarget,
  mirroredSectionLabel,
  sectionLabelCopy,
  sectionMetaCopy,
  sidesHintCopy,
} from './mirrorSectionCopy.js';

const two = {
  fold: 2,
  orientation: 'mirror',
  sides: [
    { id: 'side-1', label: 'Left side', stripIds: ['a', 'b'] },
    { id: 'side-2', label: 'Right side', stripIds: ['c', 'd'] },
  ],
};
const four = {
  fold: 4,
  orientation: 'same',
  sides: [1, 2, 3, 4].map(n => ({ id: `side-${n}`, label: `Side ${n}`, stripIds: [`s${n}`] })),
};
const strips = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({ id, pixelCount: 10 * (index + 1) }));

test('the control names the choice and its two options', () => {
  assert.equal(SIDES_HEADING, 'In this look, the sides');
  assert.deepEqual(SIDES_OPTIONS.map(option => option.label), ['Mirror each other', 'Play their own']);
  assert.deepEqual(SIDES_OPTIONS.map(option => option.mirrored), [true, false]);
});

test('the hint line follows the choice, the side count and the orientation', () => {
  assert.equal(sidesHintCopy({ symmetry: two, sidesMirrored: true }),
    'Pick a pattern for Left side. The other side plays it as a mirror image.');
  assert.equal(sidesHintCopy({ symmetry: { ...four, orientation: 'mirror' }, sidesMirrored: true }),
    'Pick a pattern for Side 1. The other sides play it as a mirror image.');
  assert.equal(sidesHintCopy({ symmetry: four, sidesMirrored: true }),
    'Pick a pattern for Side 1. The other sides play it the same way round.');
  assert.equal(sidesHintCopy({ symmetry: two, sidesMirrored: false }), 'Each side gets its own pattern.');
  assert.equal(sidesHintCopy({ symmetry: null, sidesMirrored: true }), '');
});

test('a piece without symmetry has no sides', () => {
  assert.equal(hasSymmetrySides(null), false);
  assert.equal(hasSymmetrySides(two), true);
});

test('the mirrored group is named for how many sides it drives', () => {
  assert.equal(mirroredSectionLabel(2), 'Both sides, mirrored');
  assert.equal(mirroredSectionLabel(4), 'All four sides, mirrored');
  const target = { kind: 'section', zoneId: 'side-1', label: 'anything', mirroredSides: ['side-2'] };
  assert.equal(sectionLabelCopy({ target, symmetry: two }), 'Both sides, mirrored');
  assert.equal(sectionLabelCopy({ target: { ...target, mirroredSides: ['side-2', 'side-3', 'side-4'] }, symmetry: four }),
    'All four sides, mirrored');
  assert.equal(sectionLabelCopy({ target: { kind: 'section', label: 'Left side', zoneId: 'side-1' }, symmetry: two }), 'Left side');
});

test('sides, the mirrored group and on-its-own strips are told apart', () => {
  const group = { kind: 'section', zoneId: 'side-1', mirroredSides: ['side-2'] };
  const own = { kind: 'section', zoneId: 'side-1' };
  const alone = { kind: 'section', zoneId: 'strip-e' };
  assert.equal(isMirroredSidesTarget(group), true);
  assert.equal(isMirroredSidesTarget(own), false);
  assert.equal(isSideTarget(group, two), true);
  assert.equal(isSideTarget(own, two), true);
  assert.equal(isSideTarget(alone, two), false);
  assert.equal(isSideTarget({ kind: 'all', zoneId: '' }, two), false);
  assert.equal(isSideTarget(null, two), false);
});

test('row meta counts strips and LEDs for sides and says on its own for the rest', () => {
  const group = { kind: 'section', zoneId: 'side-1', mirroredSides: ['side-2'], pixelCount: 30 };
  assert.equal(sectionMetaCopy({ target: group, symmetry: two, strips }), '4 strips · 100 LEDs');
  const left = { kind: 'section', zoneId: 'side-1', pixelCount: 30 };
  assert.equal(sectionMetaCopy({ target: left, symmetry: two, strips, ledCount: 30 }), '2 strips · 30 LEDs');
  const alone = { kind: 'section', zoneId: 'strip-e' };
  assert.equal(sectionMetaCopy({ target: alone, symmetry: two, strips, ledCount: 50 }), 'On its own · 50 LEDs');
  assert.equal(sectionMetaCopy({ target: alone, symmetry: null, strips, ledCount: 50 }), null);
  assert.equal(sectionMetaCopy({ target: { kind: 'all' }, symmetry: two, strips }), null);
});
