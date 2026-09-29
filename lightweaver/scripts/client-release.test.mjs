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

test('live proof accepts only permanent index canonicalization and still proves exact bytes', async t => {
  const root = await fixture(t);
  const serve = fetcher(root);
  for (const [status, location] of [[308, '/'], [301, '/'], [308, 'https://light.mandalacodes.com/']]) {
    await verifyClientOrigin('https://light.mandalacodes.com', root, { fetchImpl: (url, options) => {
      assert.equal(options.redirect, 'manual');
      return url.pathname === '/index.html'
        ? new Response(null, { status, headers: { location } }) : serve(url);
    } });
  }
  for (const [status, location] of [[302, '/'], [308, 'https://other.example/'], [308, '/login'], [308, '/?old=1'], [308, '/#old'], [308, 'https://user:pass@light.mandalacodes.com/']]) {
    await assert.rejects(verifyClientOrigin('https://light.mandalacodes.com', root, { fetchImpl: url =>
      url.pathname === '/index.html' ? new Response(null, { status, headers: { location } }) : serve(url)
    }), /HTTP|redirect/);
  }
  await assert.rejects(verifyClientOrigin('https://light.mandalacodes.com', root, { fetchImpl: url => {
    if (url.pathname === '/index.html') return new Response(null, { status: 308, headers: { location: '/' } });
    if (url.pathname === '/') return new Response('old client');
    return serve(url);
  } }), /bytes differ/);
  for (const path of ['/', '/assets/client.js', '/client-release.json', '/client-build-graph.json']) {
    await assert.rejects(verifyClientOrigin('https://light.mandalacodes.com', root, { fetchImpl: url => {
      if (url.pathname === '/index.html' || url.pathname === path) return new Response(null, { status: 308, headers: { location: '/' } });
      return serve(url);
    } }), /HTTP|redirect/);
  }
});
