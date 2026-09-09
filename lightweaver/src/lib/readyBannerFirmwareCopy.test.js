import assert from 'node:assert/strict';
import test from 'node:test';

import { readyBannerFirmwareCopy } from './readyBannerFirmwareCopy.js';

test('a compatible-but-older release is optional, worded with the exact build numbers', () => {
  const copy = readyBannerFirmwareCopy({
    state: 'update-available',
    installedBuildNumber: 1524,
    releaseBuildNumber: 1548,
    label: 'Card firmware 1524 → 1548',
    actionable: true,
  });
  assert.deepEqual(copy, {
    required: false,
    heading: 'Card release 1548 available',
    body: 'Your lights keep working on 1524.',
  });
});

test('an unnumbered legacy card keeps the original, more insistent wording', () => {
  const copy = readyBannerFirmwareCopy({
    state: 'legacy',
    installedBuildNumber: null,
    releaseBuildNumber: 1548,
    label: 'Card firmware legacy → 1548',
    actionable: true,
  });
  assert.deepEqual(copy, {
    required: true,
    heading: 'This card’s software is behind',
    body: 'Update the card software before relying on it.',
  });
});

test('no banner copy at all when the firmware status is not actionable', () => {
  for (const state of ['current', 'development-build', 'disconnected', 'checking', 'release-unknown', 'reconnect-needed']) {
    assert.equal(readyBannerFirmwareCopy({ state, actionable: false }), null);
  }
  assert.equal(readyBannerFirmwareCopy(null), null);
  assert.equal(readyBannerFirmwareCopy(undefined), null);
});

test('an actionable update-available state without real numbers falls back to the required wording rather than printing null', () => {
  // Defensive only — classifyFooterFirmwareStatus never actually emits
  // 'update-available' with a missing number, but the copy selector must not
  // print "Your lights keep working on null" if that contract is ever broken.
  const copy = readyBannerFirmwareCopy({
    state: 'update-available',
    installedBuildNumber: null,
    releaseBuildNumber: 1548,
    actionable: true,
  });
  assert.equal(copy.required, true);
});
