import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginInstallFirmwareVerification,
  clearInstallFirmwareEvidence,
  getInstallFirmwareEvidence,
  reportInstallFirmwareEvidence,
  restoreInstallFirmwareVerification,
  settleInstallFirmwareVerification,
  subscribeInstallFirmwareEvidence,
} from './installFirmwareEvidence.js';

test.afterEach(() => {
  clearInstallFirmwareEvidence();
});

test('a completed write invalidates preflash identity until the exact restarted card answers', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  reportInstallFirmwareEvidence({ cardId: 'lw-b0fe81f61b44', buildNumber: 1446, buildId: 'a'.repeat(40) });
  beginInstallFirmwareVerification({
    cardId: 'lw-b0fe81f61b44', buildNumber: 1524, buildId: 'b'.repeat(40),
    previousBuildId: 'a'.repeat(40), previousBootId: 'boot-before',
  }, { storage, now: 1_000 });
  assert.deepEqual(getInstallFirmwareEvidence(), {
    verification: 'restarting',
    cardId: 'lw-b0fe81f61b44',
    expectedBuildNumber: 1524,
    expectedBuildId: 'b'.repeat(40),
    previousBuildId: 'a'.repeat(40),
    previousBootId: 'boot-before',
    expiresAt: 61_000,
  });
  clearInstallFirmwareEvidence({ preserveVerification: true, storage });
  assert.equal(getInstallFirmwareEvidence()?.verification, 'restarting', 'installer unmount preserves the pending proof');
  clearInstallFirmwareEvidence({ storage });
  assert.equal(restoreInstallFirmwareVerification({ storage, now: 2_000 }), null);
});

test('pending verification survives reload and settles only on target or fresh reboot evidence', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  beginInstallFirmwareVerification({
    cardId: 'lw-b0fe81f61b44', buildNumber: 1524, buildId: 'b'.repeat(40),
    previousBuildId: 'a'.repeat(40), previousBootId: 'boot-before',
  }, { storage, now: 1_000 });
  assert.equal(restoreInstallFirmwareVerification({ storage, now: 2_000 })?.expectedBuildNumber, 1524);
  assert.equal(settleInstallFirmwareVerification({
    id: 'lw-b0fe81f61b44', buildNumber: 1446, buildId: 'a'.repeat(40), bootId: 'boot-before',
  }, { storage, now: 2_000 }), false, 'the preflash status is stale');
  assert.equal(settleInstallFirmwareVerification({
    id: 'lw-b0fe81f61b44', buildNumber: 1446, buildId: 'a'.repeat(40), bootId: 'boot-after',
  }, { storage, now: 3_000 }), true, 'a new boot is truthful rollback evidence');
  assert.equal(getInstallFirmwareEvidence()?.buildNumber, 1446);
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


test('verification deadline notifies listeners and preserves reconnect-needed evidence across reload', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  beginInstallFirmwareVerification({ cardId: 'lw-b0fe81f61b44', buildId: 'b'.repeat(40) }, { storage });
  const seen = [];
  const stop = subscribeInstallFirmwareEvidence(() => seen.push(getInstallFirmwareEvidence()));
  t.mock.timers.tick(60001);
  assert.equal(getInstallFirmwareEvidence()?.verification, 'reconnect-needed');
  assert.equal(seen.length, 1);
  assert.equal(restoreInstallFirmwareVerification({ storage })?.verification, 'reconnect-needed');
  assert.equal(getInstallFirmwareEvidence()?.buildId, undefined);
  assert.equal(settleInstallFirmwareVerification({
    id: 'lw-b0fe81f61b44', buildId: 'a'.repeat(40), buildNumber: 1446,
  }, { storage }), false, 'expiry cannot make an old cached identity fresh');
  stop();
});
