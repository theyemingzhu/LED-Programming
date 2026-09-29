import { createHash } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStudioRelease } from '../src/lib/studioRelease.js';

export const CLIENT_GRAPH = 'client-build-graph.json';
export const CLIENT_RELEASE = 'client-release.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function assets(root, directory = 'assets') {
  const result = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Client artifact contains symlink: ${path}`);
    if (entry.isDirectory()) result.push(...await assets(root, path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export async function createClientGraph(root) {
  const release = parseStudioRelease(await readFile(join(root, CLIENT_RELEASE), 'utf8'));
  const files = [];
  for (const path of ['index.html', CLIENT_RELEASE, ...await assets(root)].sort()) {
    const bytes = await readFile(join(root, path));
    files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  return { schemaVersion: 1, sourceRevision: release.sourceRevision, buildNumber: release.buildNumber, files };
}

export async function stageClient(root) {
  await rename(join(root, 'client.html'), join(root, 'index.html'));
  const graph = await createClientGraph(root);
  await writeFile(join(root, CLIENT_GRAPH), JSON.stringify(graph, null, 2) + '\n');
  return graph;
}

export async function verifyClientRoot(root) {
  const graph = await createClientGraph(root);
  const actual = JSON.parse(await readFile(join(root, CLIENT_GRAPH), 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(graph)) throw new Error('Client staged build graph does not match its exact files');
  return graph;
}

export async function verifyClientOrigin(origin, root, { fetchImpl = fetch } = {}) {
  const expected = await verifyClientRoot(root);
  const base = new URL(origin);
  if (base.protocol !== 'https:') throw new Error('Client live proof requires HTTPS');
  async function get(path, noStore = false) {
    const response = await fetchImpl(new URL(`/${path}`, base), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (response.status !== 200) throw new Error(`Client live ${path}: HTTP ${response.status}`);
    if (noStore && !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control') || '')) {
      throw new Error(`Client live ${path} must have Cache-Control: no-store`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  const graph = JSON.parse((await get(CLIENT_GRAPH, true)).toString());
  if (JSON.stringify(graph) !== JSON.stringify(expected)) throw new Error('Client live build graph differs from staged candidate');
  for (const entry of expected.files) {
    const bytes = await get(entry.path, entry.path === CLIENT_RELEASE);
    if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw new Error(`Client live bytes differ: ${entry.path}`);
  }
  // Prove the customer-facing root, not merely the separately fetchable HTML path.
  const index = expected.files.find(entry => entry.path === 'index.html');
  if (hash(await get('')) !== index.sha256) throw new Error('Client live root differs from staged index');
  return expected;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [mode, root = '.pages/lightweaver-client', origin = 'https://light.mandalacodes.com'] = process.argv.slice(2);
  const graph = mode === 'stage' ? await stageClient(root)
    : mode === 'verify' ? await verifyClientRoot(root)
      : mode === 'live' ? await verifyClientOrigin(origin, root)
        : (() => { throw new Error('Usage: client-release.mjs stage|verify|live [root] [origin]'); })();
  console.log(`Client build ${graph.buildNumber}: ${graph.files.length} files verified (${graph.sourceRevision})`);
}
