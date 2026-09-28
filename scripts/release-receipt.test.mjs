import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createReleaseReceipt, RECEIPT_FILES, writeReleaseReceipt } from './release-receipt.mjs';

const revision = 'a'.repeat(40);
const good = () => ({
  repository: 'owner/repo', workflow: 'Deploy site', revision,
  runId: '123', runAttempt: '2', credentialsEnabled: 'true',
  migrationOutcome: 'success', publishOutcome: 'success', freshnessOutcome: 'success',
  expectedStudioBuildNumber: '2244', currentMainRevision: revision,
  studioRelease: { schemaVersion: 1, sourceRevision: revision, buildId: revision.slice(0, 12), buildNumber: 2244 },
  firmwareManifest: { buildNumber: 2243 }, availableFiles: [...RECEIPT_FILES],
});

test('receipt requires all trusted outcomes and the terminal main revision', () => {
  const receipt = createReleaseReceipt(good());
  assert.equal(receipt.shipped, true);
  assert.equal(receipt.reason, null);
  assert.equal(receipt.credentialedPublish, true);
  assert.equal(receipt.liveProofPassed, true);
  assert.equal(receipt.studioBuildNumber, 2244);
  assert.equal(receipt.firmwareBuildNumber, 2243);
  assert.equal(receipt.runId, 123);
  assert.equal(receipt.runAttempt, 2);
});

test('credential skip, migration, publish and freshness failures never claim shipment', () => {
  for (const [override, reason] of [
    [{ credentialsEnabled: 'false' }, 'credentials_unavailable'],
    [{ migrationOutcome: 'failure' }, 'migration_failed'],
    [{ publishOutcome: 'failure' }, 'publish_failed'],
    [{ freshnessOutcome: 'failure' }, 'live_proof_failed'],
  ]) {
    const receipt = createReleaseReceipt({ ...good(), ...override });
    assert.equal(receipt.shipped, false);
    assert.equal(receipt.reason, reason);
  }
  assert.equal(createReleaseReceipt({ ...good(), credentialsEnabled: 'false' }).credentialedPublish, false);
  assert.equal(createReleaseReceipt({ ...good(), freshnessOutcome: 'failure' }).liveProofPassed, false);
});

test('wrong staged revision, build count, or current main fail closed', () => {
  for (const [override, reason] of [
    [{ studioRelease: { ...good().studioRelease, sourceRevision: 'b'.repeat(40) } }, 'staged_revision_mismatch'],
    [{ studioRelease: { ...good().studioRelease, buildNumber: 2242 } }, 'studio_build_mismatch'],
    [{ studioRelease: { ...good().studioRelease, buildId: 'incorrect' } }, 'studio_build_mismatch'],
    [{ expectedStudioBuildNumber: '2242' }, 'studio_build_mismatch'],
    [{ firmwareManifest: { buildNumber: 0 } }, 'firmware_build_missing'],
    [{ currentMainRevision: '' }, 'main_unavailable'],
    [{ currentMainRevision: 'b'.repeat(40) }, 'main_changed'],
    [{ runId: '' }, 'workflow_identity_missing'],
  ]) {
    const receipt = createReleaseReceipt({ ...good(), ...override });
    assert.equal(receipt.shipped, false);
    assert.equal(receipt.reason, reason);
  }
});

test('missing staged files produce a receipt and preserve exact available bytes', async () => {
  const base = await mkdtemp(join(tmpdir(), 'lightweaver-receipt-'));
  const stagedRoot = join(base, 'staged');
  const outputDir = join(base, 'proof');
  await mkdir(stagedRoot, { recursive: true });
  const marker = Buffer.from(JSON.stringify(good().studioRelease));
  await writeFile(join(stagedRoot, 'studio-release.json'), marker);
  const receipt = await writeReleaseReceipt({ stagedRoot, outputDir, ...good() });
  assert.equal(receipt.shipped, false);
  assert.equal(receipt.reason, 'staged_artifacts_missing');
  assert.deepEqual(await readFile(join(outputDir, 'studio-release.json')), marker);
  assert.equal(JSON.parse(await readFile(join(outputDir, 'receipt.json'), 'utf8')).reason, 'staged_artifacts_missing');
});

test('a complete staged release is copied without rebuilding any artifact', async () => {
  const base = await mkdtemp(join(tmpdir(), 'lightweaver-receipt-'));
  const stagedRoot = join(base, 'staged');
  const outputDir = join(base, 'proof');
  for (const path of RECEIPT_FILES) {
    const target = join(stagedRoot, path);
    await mkdir(join(target, '..'), { recursive: true });
    const body = path === 'studio-release.json'
      ? JSON.stringify(good().studioRelease)
      : path === 'firmware/release-manifest.json'
        ? JSON.stringify(good().firmwareManifest)
        : `exact bytes: ${path}`;
    await writeFile(target, body);
  }
  const receipt = await writeReleaseReceipt({ stagedRoot, outputDir, ...good() });
  assert.equal(receipt.shipped, true);
  for (const path of RECEIPT_FILES) {
    assert.deepEqual(await readFile(join(outputDir, path)), await readFile(join(stagedRoot, path)));
  }
});
