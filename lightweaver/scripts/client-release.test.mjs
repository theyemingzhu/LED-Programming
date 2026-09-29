import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stageClient, verifyClientRoot, verifyClientOrigin } from './client-release.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'client-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'client.html'), '<html>Client</html>');
  await writeFile(join(root, 'assets/client.js'), 'window.client=true;');
  await writeFile(join(root, 'client-release.json'), JSON.stringify({ schemaVersion: 1, sourceRevision: 'a'.repeat(40), buildId: 'a'.repeat(12), buildNumber: 2345 }));
  await stageClient(root);
  return root;
}
function fetcher(root, mutate = () => {}) {
  return async url => {
    const path = url.pathname.slice(1) || 'index.html';
    const response = { body: await readFile(join(root, path)), status: 200, headers: { 'cache-control': path.endsWith('.json') ? 'no-store' : 'public' } };
    mutate(path, response);
    return new Response(response.body, response);
  };
}
test('staged root and live client prove every byte and repository build number', async t => {
  const root = await fixture(t);
  assert.equal((await verifyClientRoot(root)).buildNumber, 2345);
  await verifyClientOrigin('https://light.mandalacodes.com', root, { fetchImpl: fetcher(root) });
  await writeFile(join(root, 'assets/client.js'), 'changed');
  await assert.rejects(verifyClientRoot(root), /exact files/);
});
test('live proof rejects cached marker, altered assets, root routing and missing files', async t => {
  const root = await fixture(t);
  for (const [target, change, error] of [
    ['client-release.json', r => { r.headers = {}; }, /no-store/],
    ['client-build-graph.json', r => { r.headers = {}; }, /no-store/],
    ['assets/client.js', r => { r.body = 'old'; }, /bytes differ/],
    ['index.html', r => { r.status = 404; }, /HTTP 404/],
  ]) {
    await assert.rejects(verifyClientOrigin('https://light.mandalacodes.com', root, { fetchImpl: fetcher(root, (p, r) => { if (p === target) change(r); }) }), error);
  }
  const fetchImpl = fetcher(root);
  await assert.rejects(verifyClientOrigin('https://light.mandalacodes.com', root, { fetchImpl: url => url.pathname === '/' ? new Response('Studio') : fetchImpl(url) }), /root differs/);
});
