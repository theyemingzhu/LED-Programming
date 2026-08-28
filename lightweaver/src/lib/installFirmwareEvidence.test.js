import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearInstallFirmwareEvidence,
  getInstallFirmwareEvidence,
  reportInstallFirmwareEvidence,
  subscribeInstallFirmwareEvidence,
} from './installFirmwareEvidence.js';

test.afterEach(() => {
  clearInstallFirmwareEvidence();
});

test('install firmware evidence is the identity the install screen just resolved', () => {
  const seen = [];
  const stop = subscribeInstallFirmwareEvidence(() => seen.push(getInstallFirmwareEvidence()));
  const identity = { buildId: 'dev', buildNumber: 0 };
  reportInstallFirmwareEvidence(identity);
  assert.equal(getInstallFirmwareEvidence(), identity);
  clearInstallFirmwareEvidence();
  assert.equal(getInstallFirmwareEvidence(), null);
  stop();
  assert.deepEqual(seen, [identity, null]);
});
