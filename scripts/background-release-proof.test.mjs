import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyProofBundle } from './background-release-proof.mjs';

const revision = 'a'.repeat(40);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'release-proof-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'firmware'));
  const marker = JSON.stringify({ schemaVersion: 1, sourceRevision: revision, buildId: revision.slice(0, 12), buildNumber: 2248 });
  const manifest = JSON.stringify({ buildNumber: 2160, buildId: 'b'.repeat(40), firmwareVersion: '1.1.47' });
  const files = new Map([
    ['index.html', '<div id="root"></div>'], ['assets/main.js', 'console.log("studio")'],
    ['studio-release.json', marker], ['firmware/release-manifest.json', manifest],
    ['firmware/release-manifest.sig', 'trusted-signature'], ['firmware/card.bin', 'firmware-bytes'],
  ]);
  const studio = { schemaVersion: 1, files: [...files].filter(([p]) => !p.startsWith('firmware/')).map(([path, bytes]) => ({ path, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) })).sort((a,b) => a.path.localeCompare(b.path)) };
  const firmware = { schemaVersion: 1, buildNumber: 2160, buildId: 'b'.repeat(40), firmwareVersion: '1.1.47', files: [...files].filter(([p]) => p.startsWith('firmware/')).map(([path, bytes]) => ({ path, size: Buffer.byteLength(bytes), sha256: hash(bytes) })).sort((a,b) => a.path.localeCompare(b.path)) };
  files.set('studio-build-graph.json', JSON.stringify(studio));
  files.set('firmware/release-build-graph.json', JSON.stringify(firmware));
  for (const path of ['studio-release.json', 'studio-build-graph.json', 'firmware/release-manifest.json', 'firmware/release-manifest.sig', 'firmware/release-build-graph.json']) await writeFile(join(directory, path), files.get(path));
  const receipt = { schemaVersion: 1, revision, studioBuildNumber: 2248, firmwareBuildNumber: 2160, runId: '17', runAttempt: '1', credentialedPublish: true, liveProofPassed: true, shipped: true, reason: null, workflow: 'Deploy site', repository: 'theyemingzhu/LED-Programming' };
  await writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt));
  const fetchImpl = async (url, init) => {
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'manual');
    const path = new URL(url).pathname.slice(1) || 'index.html';
    return new Response(files.get(path) ?? 'missing', { status: files.has(path) ? 200 : 404, headers: { 'cache-control': 'no-store' } });
  };
  const options = { directory, revision, runId: '17', runAttempt: '1', currentMain: async () => revision, fetchImpl };
  return { options, files, receipt, directory, fetchImpl };
}
test('independent proof matches exact Studio and firmware bytes and build numbers', async t => {
  const { options } = await fixture(t);
  assert.deepEqual(await verifyProofBundle(options), { ok: true, revision, studioBuildNumber: 2248, firmwareBuildNumber: 2160 });
});
test('a green credential-skipped run cannot be proof', async t => {
  const f = await fixture(t); f.receipt.credentialedPublish = false;
  await writeFile(join(f.directory, 'receipt.json'), JSON.stringify(f.receipt));
  await assert.rejects(verifyProofBundle(f.options), /credentialed publish/);
});
test('receipt from another attempt cannot complete the tracked release', async t => {
  const f = await fixture(t); f.options.runAttempt = '2';
  await assert.rejects(verifyProofBundle(f.options), /receipt identity/);
});
test('stale build marker and stale JavaScript both fail proof', async t => {
  const f = await fixture(t); const original = f.files.get('studio-release.json');
  f.files.set('studio-release.json', original.replace(revision, 'c'.repeat(40)));
  await assert.rejects(verifyProofBundle(f.options), /release|buildId/);
  f.files.set('studio-release.json', original); f.files.set('assets/main.js', 'old-studio');
  await assert.rejects(verifyProofBundle(f.options), /asset mismatch/);
});
test('firmware asset mismatch cannot be hidden by Studio success', async t => {
  const f = await fixture(t); f.files.set('firmware/card.bin', 'wrong-firmware');
  await assert.rejects(verifyProofBundle(f.options), /firmware.*mismatch/i);
});
test('missing no-store marker is a failure, never an offline skip', async t => {
  const f = await fixture(t);
  f.options.fetchImpl = async (...args) => { const r = await f.fetchImpl(...args); r.headers.delete('cache-control'); return r; };
  await assert.rejects(verifyProofBundle(f.options), /no-store/);
});
test('advancing main during proof supersedes the candidate', async t => {
  const f = await fixture(t); let calls = 0;
  f.options.currentMain = async () => ++calls === 1 ? revision : 'd'.repeat(40);
  await assert.rejects(verifyProofBundle(f.options), error => error.superseded === true);
});
test('network loss fails closed with a bounded retry signal', async t => {
  const f = await fixture(t); f.options.fetchImpl = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(verifyProofBundle(f.options));
});

test('client receipt requires independent live client bytes at the exact build', async t => {
  const f = await fixture(t);
  const clientRoot = join(f.directory, 'client');
  await mkdir(join(clientRoot, 'assets'), { recursive: true });
  await writeFile(join(clientRoot, 'client.html'), '<html>Lightweaver client</html>');
  await writeFile(join(clientRoot, 'assets/client.js'), 'client runtime');
  await writeFile(join(clientRoot, 'client-release.json'), f.files.get('studio-release.json'));
  const { stageClient } = await import('../lightweaver/scripts/client-release.mjs');
  await stageClient(clientRoot);
  f.receipt.clientRequired = true;
  f.receipt.clientBuildNumber = 2248;
  await writeFile(join(f.directory, 'receipt.json'), JSON.stringify(f.receipt));
  let corrupt = false;
  f.options.fetchImpl = async (url, init) => {
    if (new URL(url).origin !== 'https://light.mandalacodes.com') return f.fetchImpl(url, init);
    const path = new URL(url).pathname.slice(1) || 'index.html';
    const bytes = corrupt && path === 'assets/client.js' ? 'stale client' : await readFile(join(clientRoot, path));
    return new Response(bytes, { headers: { 'cache-control': 'no-store' } });
  };
  const result = await verifyProofBundle(f.options);
  assert.equal(result.clientBuildNumber, 2248);
  corrupt = true;
  await assert.rejects(verifyProofBundle(f.options), /Client live bytes differ/);
});
