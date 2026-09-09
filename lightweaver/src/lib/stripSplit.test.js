import test from 'node:test';
import assert from 'node:assert/strict';

import { FakeDocument } from './svgDomStub.js';
import {
  MAX_SPLIT_SECTIONS,
  nextSplitNames,
  planStripSplitCounts,
  splitBoundaryFractions,
  splitFractionForCounts,
  splitStripPaths,
  splitStripPathsN,
} from './stripSplit.js';

// pathSegment (used by both splitStripPaths and splitStripPathsN) needs a
// real SVGPathElement.getTotalLength(), which only a browser provides —
// node --test runs headless with no jsdom dependency in this repo, same
// constraint documented in svgImportGeometry.test.js. The stub below hangs a
// document off the global so the two functions don't throw ReferenceError;
// FakeElement has no getTotalLength, so both correctly fall back to null
// here. The REAL geometry (arc length, mirrored cut points) is exercised in
// the browser by tests/layout-strip-split.spec.ts and tests/layout-divide.spec.ts.
globalThis.document = globalThis.document || new FakeDocument(null);

test('planStripSplitCounts is byte-identical for the existing two-way split', () => {
  // The exact case named in the module comment and asserted by
  // tests/layout-strip-split.spec.ts: 41 LEDs cut in half favours the head.
  assert.deepEqual(planStripSplitCounts(41), { counts: [21, 20], total: 41, sections: 2, head: 21, tail: 20 });
  assert.deepEqual(planStripSplitCounts(41, 2), planStripSplitCounts(41));
  // Even counts split exactly in half either way.
  assert.deepEqual(planStripSplitCounts(40, 2), { counts: [20, 20], total: 40, sections: 2, head: 20, tail: 20 });
});

test('planStripSplitCounts spreads the remainder evenly from the first section', () => {
  // The two examples named in the task brief.
  assert.deepEqual(planStripSplitCounts(41, 4).counts, [11, 10, 10, 10]);
  assert.deepEqual(planStripSplitCounts(41, 3).counts, [14, 14, 13]);
  // A few more, including exact division and a large remainder.
  assert.deepEqual(planStripSplitCounts(12, 4).counts, [3, 3, 3, 3]);
  assert.deepEqual(planStripSplitCounts(10, 3).counts, [4, 3, 3]);
  assert.deepEqual(planStripSplitCounts(23, 5).counts, [5, 5, 5, 4, 4]);
  // Every section count always sums back to the total.
  for (const [pixels, sections] of [[41, 2], [41, 3], [41, 4], [41, 12], [7, 5], [100, 12]]) {
    const plan = planStripSplitCounts(pixels, sections);
    assert.equal(plan.counts.reduce((sum, n) => sum + n, 0), pixels, `${pixels} into ${sections}`);
  }
});

test('planStripSplitCounts caps sections at 12 (the card hardware zone limit)', () => {
  assert.equal(MAX_SPLIT_SECTIONS, 12);
  const plan = planStripSplitCounts(100, 20);
  assert.equal(plan.sections, 12);
  assert.equal(plan.counts.length, 12);
});

test('planStripSplitCounts caps sections at the pixel count — never more pieces than LEDs', () => {
  const plan = planStripSplitCounts(5, 12);
  assert.equal(plan.sections, 5);
  assert.deepEqual(plan.counts, [1, 1, 1, 1, 1]);
});

test('planStripSplitCounts refuses a strip with fewer than 2 LEDs', () => {
  assert.equal(planStripSplitCounts(1, 4), null);
  assert.equal(planStripSplitCounts(0, 4), null);
  assert.equal(planStripSplitCounts(-3, 4), null);
});

test('planStripSplitCounts treats a sub-2 request as 2, never as "no split"', () => {
  assert.deepEqual(planStripSplitCounts(41, 1), planStripSplitCounts(41, 2));
  assert.deepEqual(planStripSplitCounts(41, 0), planStripSplitCounts(41, 2));
});

test('splitBoundaryFractions gives N+1 cumulative cut points ending at 1', () => {
  const plan = planStripSplitCounts(41, 4);
  const fractions = splitBoundaryFractions(plan);
  assert.equal(fractions.length, 5);
  assert.equal(fractions[0], 0);
  assert.equal(fractions.at(-1), 1);
  // Cumulative sums of 11, 10, 10, 10 over 41.
  assert.deepEqual(fractions.map(f => Math.round(f * 41)), [0, 11, 21, 31, 41]);
});

test('splitStripPathsN falls back to null exactly like splitStripPaths outside a browser (parity)', () => {
  // Neither function can trace real path geometry without getTotalLength.
  // What matters here is that the new N-way function fails the SAME way the
  // existing two-way function always has — no new crash, no silent wrong
  // answer — so the two-way call site (splitStripInTwo) is unaffected.
  const pathData = 'M 0,0 L 100,0';
  const plan = planStripSplitCounts(41, 2);
  assert.equal(splitStripPaths(pathData, plan, false), null);
  assert.equal(splitStripPathsN(pathData, plan, false), null);
  assert.equal(splitStripPathsN(pathData, planStripSplitCounts(41, 4), false), null);
});

test('splitBoundaryFractions and splitStripPathsN refuse a plan with no counts', () => {
  assert.equal(splitBoundaryFractions(null), null);
  assert.equal(splitBoundaryFractions({}), null);
  assert.equal(splitStripPathsN('M 0,0 L 10,0', null), null);
});

test('nextSplitNames suffixes every piece 1..N, skipping names already taken', () => {
  assert.deepEqual(nextSplitNames('Ring', 4, []), ['Ring 1', 'Ring 2', 'Ring 3', 'Ring 4']);
  // Collisions with existing strip names are skipped, same rule as nextSplitName.
  assert.deepEqual(nextSplitNames('Ring', 3, ['Ring 1', 'Ring 3']), ['Ring 2', 'Ring 4', 'Ring 5']);
});

test('nextSplitNames falls back to "Strip" for a blank base name', () => {
  assert.deepEqual(nextSplitNames('', 2, []), ['Strip 1', 'Strip 2']);
  assert.deepEqual(nextSplitNames('   ', 2, []), ['Strip 1', 'Strip 2']);
});

test('splitFractionForCounts still works unmodified for a plain two-way plan (regression guard)', () => {
  const plan = planStripSplitCounts(41);
  assert.equal(splitFractionForCounts(plan, false), 21 / 41);
  assert.equal(splitFractionForCounts(plan, true), 1 - 21 / 41);
});
