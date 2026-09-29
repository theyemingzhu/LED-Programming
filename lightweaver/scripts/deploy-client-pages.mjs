import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyClientRoot } from './client-release.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const staged = join(project, '.pages/lightweaver-client');
const graph = await verifyClientRoot(staged);
// Pages does not accept --config. An isolated cwd also prevents auto-discovery
// of Studio's Functions, D1/R2 bindings, or its production config redirect.
const isolated = await mkdtemp(join(tmpdir(), 'lightweaver-client-pages-'));
try {
  const config = await readFile(join(project, 'wrangler.client.toml'), 'utf8');
  await writeFile(join(isolated, 'wrangler.toml'), config.replace('".pages/lightweaver-client"', JSON.stringify(staged)));
  const result = spawnSync(process.execPath, [
    join(project, 'node_modules/wrangler/bin/wrangler.js'),
    'pages', 'deploy', staged, '--cwd', isolated,
    '--project-name', 'lightweaver-client', '--branch', 'main', '--commit-hash', graph.sourceRevision,
  ], { cwd: isolated, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Client Pages publish failed (${result.status})`);
} finally {
  await rm(isolated, { recursive: true, force: true });
}
