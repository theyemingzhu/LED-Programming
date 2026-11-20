// Load the practice-card harness (TypeScript) into plain Node.
// The harness imports './x.js' for './x.ts'; esbuild resolves that. The bundle
// sits inside node_modules so @playwright/test still resolves from it.
import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const lightweaverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadPracticeHarness() {
  const outDir = path.join(lightweaverRoot, 'node_modules', '.cache', 'practice-card');
  fs.mkdirSync(outDir, { recursive: true });
  const outfile = path.join(outDir, 'practice-server.mjs');
  await build({
    entryPoints: [path.join(lightweaverRoot, 'tests', 'harness', 'practiceServer.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'node20',
    outfile, external: ['@playwright/test'], logLevel: 'error',
  });
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}
