import test from 'node:test';
import assert from 'node:assert/strict';

import { isMirrorSetTarget, mirrorSetStripCount } from './mirrorSectionCopy.js';

test('a mirror-set section reads its strip count from its ranges', () => {
  const target = { kind: 'section', id: 'patch-a', zoneId: 'mirror-1', ranges: [{ start: 0, count: 5 }, { start: 5, count: 5 }] };
  assert.equal(isMirrorSetTarget(target), true);
  assert.equal(mirrorSetStripCount(target), 2);
});

test('ordinary sections and the all target are not mirror sets', () => {
  assert.equal(isMirrorSetTarget({ kind: 'section', id: 'patch-a', zoneId: 'strip-a', ranges: [{ start: 0, count: 5 }] }), false);
  assert.equal(isMirrorSetTarget({ kind: 'all', id: 'all', zoneId: '' }), false);
  assert.equal(isMirrorSetTarget(null), false);
  assert.equal(mirrorSetStripCount(null), 0);
});
