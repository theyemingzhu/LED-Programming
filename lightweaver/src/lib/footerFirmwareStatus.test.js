import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyFooterFirmwareStatus, resolveFooterFirmwareInstalled } from './footerFirmwareStatus.js';

const BUILD_ID = 'a'.repeat(40);
const OTHER_BUILD_ID = 'b'.repeat(40);
const RELEASE = { buildNumber: 1154, buildId: BUILD_ID };

test('footer firmware status requires both the numbered build and exact revision for current', () => {
  assert.deepEqual(classifyFooterFirmwareStatus({ buildNumber: 1154, buildId: BUILD_ID }, RELEASE), {
    state: 'current',
    installedBuildNumber: 1154,
    releaseBuildNumber: 1154,
    label: 'Card firmware 1154 ✓',
    actionable: false,
  });
});

test('footer firmware status offers the verified release when the card has an older build', () => {
  assert.deepEqual(classifyFooterFirmwareStatus({ buildNumber: 1123, buildId: BUILD_ID }, RELEASE), {
    state: 'update-available',
    installedBuildNumber: 1123,
    releaseBuildNumber: 1154,
    label: 'Card firmware 1123 → 1154',
    actionable: true,
  });
});

test('footer firmware status treats a same-number different revision as an available update', () => {
  assert.deepEqual(classifyFooterFirmwareStatus({ buildNumber: 1154, buildId: OTHER_BUILD_ID }, RELEASE), {
    state: 'update-available',
    installedBuildNumber: 1154,
    releaseBuildNumber: 1154,
    label: 'Card firmware 1154 → 1154',
    actionable: true,
  });
});

test('footer firmware status offers a release to numbered-build legacy cards with a valid revision', () => {
  for (const installed of [
    { buildNumber: 0, buildId: BUILD_ID },
    { buildId: BUILD_ID },
  ]) {
    assert.deepEqual(classifyFooterFirmwareStatus(installed, RELEASE), {
      state: 'legacy',
      installedBuildNumber: null,
      releaseBuildNumber: 1154,
      label: 'Card firmware legacy → 1154',
      actionable: true,
    });
  }
});

test('footer firmware status identifies newer card builds without offering a downgrade', () => {
  assert.deepEqual(classifyFooterFirmwareStatus({ buildNumber: 1160, buildId: BUILD_ID }, RELEASE), {
    state: 'development-build',
    installedBuildNumber: 1160,
    releaseBuildNumber: 1154,
    label: 'Card firmware 1160 · latest 1154',
    actionable: false,
  });
});

test('footer firmware status fails closed for missing or malformed verified releases', () => {
  for (const release of [undefined, {}, { buildNumber: 0, buildId: BUILD_ID }, { buildNumber: 1154, buildId: 'preview' }]) {
    assert.deepEqual(classifyFooterFirmwareStatus({ buildNumber: 1123, buildId: BUILD_ID }, release), {
      state: 'release-unknown',
      installedBuildNumber: 1123,
      releaseBuildNumber: null,
      label: 'Card firmware 1123 · latest unknown',
      actionable: false,
    });
  }
});

test('footer firmware status truthfully distinguishes an absent card from an unavailable release', () => {
  assert.deepEqual(classifyFooterFirmwareStatus(null, RELEASE), {
    state: 'disconnected',
    installedBuildNumber: null,
    releaseBuildNumber: 1154,
    label: 'Card firmware unknown · latest 1154',
    actionable: false,
  });
  assert.deepEqual(classifyFooterFirmwareStatus(null, undefined), {
    state: 'disconnected',
    installedBuildNumber: null,
    releaseBuildNumber: null,
    label: 'Card firmware unknown · latest unknown',
    actionable: false,
  });
});

test('footer firmware status fails closed for malformed card identity without echoing its values', () => {
  for (const installed of [
    { buildNumber: '1123', buildId: BUILD_ID },
    { buildNumber: 1123, buildId: 'preview' },
    { buildNumber: -1, buildId: BUILD_ID },
  ]) {
    assert.deepEqual(classifyFooterFirmwareStatus(installed, RELEASE), {
      state: 'release-unknown',
      installedBuildNumber: null,
      releaseBuildNumber: 1154,
      label: 'Card firmware unknown · latest 1154',
      actionable: false,
    });
  }
});


test('a card that is mid-restart is checking, not unknown', () => {
  // A wiring light test reboots the card on purpose. Reporting "Card firmware
  // unknown" through every one of those reboots put a fault-shaped line on
  // screen at the exact moment the owner is watching their strip.
  const release = { buildNumber: 1427, buildId: 'f'.repeat(40) };
  const checking = classifyFooterFirmwareStatus(null, release, { checking: true });
  assert.equal(checking.state, 'checking');
  assert.equal(checking.label, 'Checking card firmware · latest 1427');
  assert.equal(checking.actionable, false);

  // With no transport in flight the honest answer is still "unknown".
  assert.equal(classifyFooterFirmwareStatus(null, release).state, 'disconnected');
});

test('a USB-flashed bench card is known firmware, not unknown', () => {
  // Bench flashes report buildId "dev" and buildNumber 0 so they cannot be
  // mistaken for a signed release. Find Connected Card already prints
  // "Build dev". Calling that same identity "unknown" in the footer is the
  // contradiction this test exists to stop.
  const installed = { buildNumber: 0, buildId: 'dev', firmwareVersion: '1.1.15' };
  assert.deepEqual(classifyFooterFirmwareStatus(installed, RELEASE), {
    state: 'legacy',
    installedBuildNumber: null,
    releaseBuildNumber: 1154,
    label: 'Card firmware dev → 1154',
    actionable: true,
  });
});

test('the footer uses USB-found firmware when the Wi-Fi link is down', () => {
  const live = { buildNumber: 1100, buildId: BUILD_ID };
  const usb = { buildNumber: 0, buildId: 'dev' };
  assert.equal(
    resolveFooterFirmwareInstalled({ transportConnected: true, connectedCard: live, usbInspectedFirmware: usb }),
    live,
  );
  assert.equal(
    resolveFooterFirmwareInstalled({ transportConnected: false, connectedCard: live, usbInspectedFirmware: usb }),
    usb,
  );
  assert.equal(
    resolveFooterFirmwareInstalled({ transportConnected: false, usbInspectedFirmware: null }),
    null,
  );
});
