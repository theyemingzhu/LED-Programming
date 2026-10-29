import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { guardFetch } from '../functions/_shared/allowanceGuard.mjs';

const binding = 'PROJECTS_DB', project = 'lightweaver';
const onRequest = context => guardFetch(context.request, context.env, context, { fetch(request, env, runtime) { return context.next({ request, env, waitUntil: runtime.waitUntil }); } }, { binding, project });
function fixture(path = '/api/profile/get', { denied = false, missing = false } = {}) {
  const calls = [], work = [], statements = [];
  const namespace = {
    idFromName(name) { assert.equal(name, 'account'); return 'account'; },
    get() { return { async fetch(request, init) {
      const req = request instanceof Request ? request : new Request(request, init);
      const input = await req.json(); const action = new URL(req.url).pathname;
      calls.push({ action, input });
      if (action === '/reserve') return Response.json(denied
        ? { allowed: false, code: 'shared_allowance_paused', reason: 'feature_budget', retryable: false, retry_at: '2099-01-01T00:00:00Z' }
        : { allowed: true, id: 'lease', rows: 5000, writes: 128, statements: 200, expiresAt: Date.now() + 600000 });
      return Response.json({ settled: true });
    } }; },
  };
  let reads = 0;
  const result = { success: true, results: [{ id: 'kept' }], meta: { rows_read: 9, rows_written: 0, changes: 0 } };
  const db = { prepare(sql) {
    const statement = { bind() { return statement; }, async all() { reads++; return result; }, async first(column) { reads++; return column ? result.results[0][column] : result.results[0]; }, async run() { reads++; return result; } };
    statements.push(statement); return statement;
  }, async batch(items) { reads += items.length; return items.map(() => result); } };
  const context = { request: new Request('https://led.mandalacodes.com' + path), env: { [binding]: db, ...(missing ? {} : { SHARED_ALLOWANCE: namespace }) }, waitUntil(promise) { work.push(promise); }, async next(runtime = context) {
    const value = await runtime.env[binding].prepare('SELECT id FROM fixture WHERE id=?').bind('kept').first();
    return Response.json(value);
  } };
  return { context, calls, work, db, get reads() { return reads; }, async finish() { await Promise.all(work); } };
}

test('all cloud D1 work reserves this project and settles measured rows', async () => {
  const f = fixture(); const response = await onRequest(f.context); await f.finish();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { id: 'kept' }); assert.equal(f.reads, 1);
  const reservation = f.calls.find(x => x.action === '/reserve'); assert.ok(reservation); assert.equal(reservation.input.project, project);
  const settlement = f.calls.find(x => x.action === '/settle'); assert.ok(settlement); assert.equal(settlement.input.rowsRead, 9);
});

test('daily feature cutoff blocks before any D1 query and forbids automatic retry', async () => {
  const f = fixture('/mcp', { denied: true }); const response = await onRequest(f.context); await f.finish();
  assert.equal(response.status, 503); assert.equal(f.reads, 0); const body = await response.json();
  assert.equal(body.code, 'shared_allowance_paused'); assert.equal(body.retryable, false);
});

test('production DB binding cannot bypass the guard when its namespace is missing', async () => {
  const f = fixture('/api/profile/get', { missing: true }); const response = await onRequest(f.context); await f.finish();
  assert.equal(response.status, 503); assert.equal(f.reads, 0);
});

test('static and media responses incur zero database and governor work', async () => {
  const f = fixture('/media/image/art.jpg'); f.context.next = async () => new Response('image');
  assert.equal((await onRequest(f.context)).status, 200); await f.finish(); assert.equal(f.reads, 0); assert.equal(f.calls.length, 0);
});

test('authentication reserves critical capacity and background sync is separately budgeted', async () => {
  for (const [path, priority] of [['/api/auth/get-session', 'critical'], ['/api/sync', 'background']]) {
    const f = fixture(path); assert.equal((await onRequest(f.context)).status, 200); await f.finish();
    assert.equal(f.calls.find(x => x.action === '/reserve').input.priority, priority);
  }
});

test('Pages configuration preserves the external shared ledger on future deploys', () => {
  const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /name\s*=\s*"SHARED_ALLOWANCE"/); assert.match(config, /class_name\s*=\s*"AllowanceGovernor"/); assert.match(config, /script_name\s*=\s*"i64os-quota-guard"/);
});

test('deferred auth work remains guarded and included in its original reservation', async () => {
  const f = fixture('/api/auth/get-session'); let release;
  const ready = new Promise(resolve => { release = resolve; });
  f.context.next = async runtime => {
    const immediate = await runtime.env[binding].prepare('SELECT id').first();
    runtime.waitUntil(ready.then(() => runtime.env[binding].prepare('SELECT id').first()));
    return Response.json(immediate);
  };
  const response = await onRequest(f.context); assert.equal(response.status, 200); release(); await f.finish();
  assert.equal(f.reads, 2);
  assert.equal(f.calls.find(x => x.action === '/settle').input.rowsRead, 18);
});

test('the actual generated Pages router receives the guarded binding and deferred context', async () => {
  const { mkdtemp, mkdir, writeFile, symlink, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { buildAllowancePages } = await import('../scripts/build-pages-allowance.mjs');
  const root = await mkdtemp(join(tmpdir(), 'real-pages-allowance-test-')); const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  try {
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await symlink(join(projectRoot, 'node_modules'), join(root, 'node_modules'));
    await mkdir(join(root, 'functions/_shared'), { recursive: true });
    await copyFile(join(projectRoot, 'functions/_shared/allowanceGuard.mjs'), join(root, 'functions/_shared/allowanceGuard.mjs'));
    await writeFile(join(root, 'functions/_middleware.js'), 'export const onRequest = context => context.next();');
    await writeFile(join(root, 'functions/index.js'), `export async function onRequest({env,waitUntil}) { const value=await env.${binding}.prepare('SELECT id').first(); waitUntil(env.DEFERRED_READY.then(()=>env.${binding}.prepare('SELECT id').first())); return Response.json(value); }`);
    await buildAllowancePages({ root, project, binding });
    const { default: worker } = await import(pathToFileURL(join(root, 'dist/_worker.js/index.js')).href);
    const f = fixture('/'); let release; f.context.env.DEFERRED_READY = new Promise(resolve => { release = resolve; });
    const native = f.context.env[binding]; const response = await worker.fetch(f.context.request, f.context.env, f.context);
    assert.equal(response.status, 200); assert.ok(response.headers.get('X-Shared-Allowance-Revision')); assert.equal(f.context.env[binding], native); release(); await f.finish();
    assert.equal(f.reads, 2); assert.equal(f.calls.find(x => x.action === '/settle').input.rowsRead, 18);
    const manifest = JSON.parse(readFileSync(join(root, 'dist/_shared-allowance-release.json'), 'utf8'));
    const { createHash } = await import('node:crypto'); assert.equal(manifest.workerSha256, createHash('sha256').update(readFileSync(join(root, 'dist/_worker.js/index.js'))).digest('hex')); assert.equal(manifest.project, project);
  } finally { await rm(root, { recursive: true, force: true }); }
});
