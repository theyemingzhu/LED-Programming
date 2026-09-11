// "Use on every section" (sections-effortless plan, change 6).
import assert from 'node:assert/strict';
import { ALL_SECTIONS_TARGET_ID, copyLookToAllSections, normalizeSectionVisualLook } from '../src/lib/sectionLookModel.js';

const targets = [
  { id: ALL_SECTIONS_TARGET_ID, kind: 'all' },
  { id: 'p1', kind: 'section' },
  { id: 'p2', kind: 'section' },
  { id: 'p3', kind: 'section' },
];
const source = { patternId: 'plasma', brightness: 0.42, speed: 1.5 };
const before = { p2: { patternId: 'ocean' } };
const next = copyLookToAllSections(before, source, targets);

// Every section and the default carry the same normalised look.
const expected = normalizeSectionVisualLook(source);
for (const id of ['p1', 'p2', 'p3', ALL_SECTIONS_TARGET_ID]) assert.deepEqual(next[id], expected, id);
// Independent copies: editing one section afterwards never bleeds into another.
next.p1.brightness = 0.1;
assert.equal(next.p2.brightness, 0.42);
// The source map is untouched.
assert.deepEqual(before, { p2: { patternId: 'ocean' } });
// Non-section targets are never written by id.
assert.equal(Object.keys(next).length, 4);
console.log('section-look-copy: ok');
