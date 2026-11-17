import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordPendingInstallationVerification,
  readPendingInstallationVerification,
  pendingVerificationForCard,
} from './studioPendingInstallationVerification.js';

const cardId = 'lw-gallery';
const targetBuildId = 'a'.repeat(40);
const head = 'b'.repeat(64);
const fingerprint = 'c'.repeat(64);
const session = {
  cardId, previousBootId: 'old', targetFirmwareVersion: '1.2.3',
  targetBuildId, targetBuildNumber: 123, ticketSha256: 'd'.repeat(64),
  expectedProjectHead: head, expectedProjectFingerprint: fingerprint,
  phase: 'restarting',
};
const readiness = {
  cardId, bootId: 'new', firmwareVersion: '1.2.3', buildId: targetBuildId,
  projectHead: head, projectFingerprint: fingerprint, runtimePhase: 'ready',
  knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
  capabilities: { firmwareUpdate: { version: 1, network: true } },
};
const update = { session, readiness, updateStatus: { phase: 'valid' } };
const link = (status = readiness, overrides = {}) => ({
  state: 'connected-direct', validatedBootId: readiness.bootId,
  card: { id: status.cardId }, readiness: status, ...overrides,
});

function memoryStorage() {
  const entries = new Map();
  return {
    writes: 0,
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) {
      this.writes++;
      entries.set(key, value);
    },
  };
}

test('a correlated update records pending look verification across reload and duplicate completion', () => {
  const storage = memoryStorage();
  const first = recordPendingInstallationVerification(update, { storage });
  assert.equal(first.retained, true);
  assert.equal(first.record.observedBootId, 'new');
  assert.deepEqual(recordPendingInstallationVerification(update, { storage }), first);
  assert.equal(storage.writes, 1);
  const reloaded = readPendingInstallationVerification(cardId, { storage });
  assert.deepEqual(pendingVerificationForCard(reloaded, link()), reloaded);
});

test('unmatched or unconfirmed completion and blank bootstrap never create a receipt', () => {
  const storage = memoryStorage();
  for (const result of [
    { ...update, updateStatus: { phase: 'rolled-back' } },
    { ...update, updateStatus: { phase: 'probation' } },
    { ...update, readiness: { ...readiness, bootId: 'old' } },
    { ...update, readiness: { ...readiness, cardId: 'lw-other' } },
    { ...update, readiness: { ...readiness, projectHead: '0'.repeat(64) } },
    { ...update, readiness: { ...readiness, projectFingerprint: '0'.repeat(64) } },
    { ...update, readiness: { ...readiness, buildId: '0'.repeat(40) } },
    {
      ...update,
      session: { ...session, expectedProjectHead: '', expectedProjectFingerprint: '' },
      readiness: { ...readiness, projectHead: '', projectFingerprint: '' },
    },
  ]) assert.equal(recordPendingInstallationVerification(result, { storage }), null);
  assert.equal(storage.writes, 0);
});

test('a changed boot requires fresh link evidence and cannot borrow the original observation', () => {
  const pending = recordPendingInstallationVerification(update, { storage: memoryStorage() });
  const reboot = { ...readiness, bootId: 'next-boot' };
  assert.equal(pendingVerificationForCard(pending, link(reboot)), null);
  assert.equal(pendingVerificationForCard(pending, link(reboot, { state: 'revalidating' })), null);
  const freshlyRead = pendingVerificationForCard(pending, link(reboot, { validatedBootId: 'next-boot' }));
  assert.equal(freshlyRead.record.observedBootId, 'new');
  for (const changed of [
    { cardId: 'lw-other' }, { projectHead: '0'.repeat(64) },
    { projectFingerprint: '0'.repeat(64) }, { buildId: '0'.repeat(40) },
  ]) assert.equal(pendingVerificationForCard(pending, link({ ...readiness, ...changed })), null);
});

test('storage failure keeps an honest in-memory reminder that cannot be restored after reload', () => {
  const storage = { getItem() { return null; }, setItem() { throw new Error('quota'); } };
  const pending = recordPendingInstallationVerification(update, { storage });
  assert.equal(pending.retained, false);
  assert.deepEqual(pendingVerificationForCard(pending, link()), pending);
  assert.equal(readPendingInstallationVerification(cardId, { storage }), null);
});
