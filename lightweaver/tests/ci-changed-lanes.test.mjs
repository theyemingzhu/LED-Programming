import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChangedPaths, LANE_NAMES } from '../../scripts/ci-changed-lanes.mjs';

// The lane classifier decides which CI lanes a change has to satisfy, and it
// had no test at all. That is how a Pattern Lab change shipped a regression
// where a synced draft could not be opened: the cloud lane owns that flow,
// the classifier never selected it for a src/ change, and the gap only
// surfaced when an unrelated package.json edit reclassified a later branch.
//
// A lane that is not selected is not protecting anything, so the mapping is
// now asserted rather than assumed.

const lanesFor = paths => Object.entries(classifyChangedPaths(paths))
  .filter(([, on]) => on)
  .map(([name]) => name)
  .sort();

test('Studio source selects the cloud lane — the regression this file exists for', () => {
  // The cloud specs drive the real Studio UI: the projects panel, workspace
  // asset sync, and the Pattern Lab drafts list. A change under src/ can break
  // them, so it must run them.
  for (const path of [
    'lightweaver/src/pattern-lab/PatternLabScreen.jsx',
    'lightweaver/src/lib/patternLabStripView.js',
    'lightweaver/src/v3/lw-pattern.jsx',
    'lightweaver/src/state/ProjectContext.jsx',
  ]) {
    assert.ok(lanesFor([path]).includes('cloud'), `${path} must select the cloud lane`);
  }
});

test('Studio source still selects the lanes it always did', () => {
  const lanes = lanesFor(['lightweaver/src/pattern-lab/PatternLabScreen.jsx']);
  assert.ok(lanes.includes('source'));
  assert.ok(lanes.includes('browser'));
});

test('a docs-only change does not drag in browser or cloud', () => {
  const lanes = lanesFor(['docs/roadmap.md']);
  assert.ok(!lanes.includes('browser'), 'docs do not need a browser');
  assert.ok(!lanes.includes('cloud'), 'docs do not need the cloud lane');
});

test('firmware source selects firmware, not the Studio browser lane', () => {
  const lanes = lanesFor(['firmware/lightweaver-controller/src/main.cpp']);
  assert.ok(lanes.includes('firmware'));
  assert.ok(!lanes.includes('browser'));
});

test('the cloud worker and its migrations still select cloud on their own', () => {
  for (const path of ['lightweaver/functions/api/library.js', 'lightweaver/migrations/0001_init.sql']) {
    assert.ok(lanesFor([path]).includes('cloud'), `${path} must select the cloud lane`);
  }
});

test('every lane the classifier can return is a known lane', () => {
  const lanes = classifyChangedPaths(['lightweaver/src/v3/app.jsx']);
  for (const name of Object.keys(lanes)) assert.ok(LANE_NAMES.includes(name), `unknown lane ${name}`);
});
