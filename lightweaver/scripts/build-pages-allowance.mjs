// Shared portfolio build: outer fetch is required because Pages creates a new
// context for every route and captures the original environment in next().
import { mkdtemp, mkdir, readFile, rm, writeFile, rename, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

export async function buildAllowancePages({ project, binding, root = process.cwd(), functions = 'functions', output = 'dist' }) {
  if (!/^[a-z0-9-]+$/.test(project) || !/^[A-Z_]+$/.test(binding)) throw new Error('Require a project and D1 binding');
  const target = resolve(root, output); await mkdir(target, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), 'pages-allowance-'));
  const require = createRequire(pathToFileURL(join(root, 'package.json')));
  let wrangler;
  try { wrangler = resolve(require.resolve('wrangler/package.json'), '../bin/wrangler.js'); }
  catch { throw new Error('Pinned Wrangler must be installed before building the guarded Pages worker'); }
  try {
    const router = join(temporary, 'router');
    const run = spawnSync(process.execPath, [wrangler, 'pages', 'functions', 'build', resolve(root, functions), '--outdir', router, '--project-directory', root, '--output-routes-path', join(temporary, '_routes.json'), '--compatibility-flag', 'nodejs_compat'], { cwd: root, stdio: 'inherit', env: process.env });
    if (run.status !== 0) throw new Error('Pages Functions compilation failed');
    const wrapper = join(temporary, 'outer.mjs');
    const localRevision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    const sourceRevision = process.env.CF_PAGES_COMMIT_SHA || (localRevision.status === 0 ? localRevision.stdout.trim() : 'synthetic');
    if (!/^(?:[a-f0-9]{40}|synthetic)$/.test(sourceRevision)) throw new Error('Invalid source revision for guarded artifact');
    const client = resolve(root, 'functions/_shared/allowanceGuard.mjs');
    await writeFile(wrapper, `import router from ${JSON.stringify(join(router, 'index.js'))};\nimport {guardFetch} from ${JSON.stringify(client)};\nexport default {async fetch(request,env,ctx){const response=await guardFetch(request,env,ctx,router,${JSON.stringify({ binding, project })});const headers=new Headers(response.headers);headers.set('X-Shared-Allowance-Revision',${JSON.stringify(sourceRevision)});return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}};\n`);
    const artifactDirectory = join(target, '.allowance-worker-' + process.pid); await mkdir(artifactDirectory, { recursive: true });
    const artifact = join(artifactDirectory, 'index.js');
    await build({ entryPoints: [wrapper], outfile: artifact, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', keepNames: true, minify: true, external: ['node:*', 'cloudflare:*'], plugins: [{ name: 'worker-wasm', setup(bundle) { bundle.onResolve({ filter: /\.wasm$/ }, args => ({ path: './' + basename(args.path), external: true })); } }], logLevel: 'warning' });
    for (const name of await readdir(router)) if (name !== 'index.js' && !name.endsWith('.map')) await copyFile(join(router, name), join(artifactDirectory, name));
    await rm(join(target, '_worker.js'), { recursive: true, force: true });
    await rename(artifactDirectory, join(target, '_worker.js'));
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(target, '_shared-allowance-release.json'), JSON.stringify({ schemaVersion: 1, project, sourceRevision, clientSha256: hash(await readFile(client)), workerSha256: hash(await readFile(join(target, '_worker.js/index.js'))) }, null, 2) + '\n');
    // Honor deliberate public route exclusions; otherwise use the router's list.
    const configuredRoutes = join(root, 'public/_routes.json');
    const routes = existsSync(configuredRoutes) ? await readFile(configuredRoutes) : await readFile(join(temporary, '_routes.json'));
    await writeFile(join(target, '_routes.json'), routes);
    console.log(`Guarded Pages worker built: ${project} (${binding})`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {}; for (let i = 2; i < process.argv.length; i += 2) { const key = process.argv[i].replace(/^--/, ''); if (!['project','binding','root','functions','output'].includes(key) || !process.argv[i + 1]) throw new Error('Unknown or missing build option'); options[key] = process.argv[i + 1]; }
  await buildAllowancePages(options);
}
