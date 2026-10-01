import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enqueueRelease, processReleaseQueue, resumeQueuedRelease } from './release-queue.mjs';
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40), E = 'e'.repeat(40), T = 'f'.repeat(40);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'lw-queue-')); t.after(() => rm(root, { recursive: true, force: true }));
  const stateDir = join(root, 'state');
  const model = { head: A, remoteHead: A, base: D, tree: T, mergeHead: '', dirty: '', conflict: false, git: [], gh: [], prepared: null, starts: 0, events: [] };
  const controller = {
    read: async () => model.prepared,
    prepare: async args => { model.prepared = { ...args, phase: 'prepared', id: 'pr380' }; return model.prepared; },
  };
  const deps = {
    git: async (_root, args) => {
      model.git.push(args);
      if (args[0] === 'status') return model.dirty;
      if (args[0] === 'symbolic-ref') return 'codex/queued';
      if (args[0] === 'rev-list') return `${model.head} ${A} ${D}`;
      if (args[0] === 'merge-base') return '';
      if (args[0] === 'rev-parse') {
        if (args.includes('MERGE_HEAD')) { if (model.mergeHead) return model.mergeHead; throw Error('no merge'); }
        if (args[1] === 'HEAD') return model.head;
        if (args[1] === 'origin/main') return model.base;
        return model.tree;
      }
      if (args[0] === 'fetch') return '';
      if (args[0] === 'push') { assert.equal(args[2], `${model.head}:refs/heads/codex/queued`); model.remoteHead = model.head; return ''; }
      if (args[0] === 'merge' && args[1] === '--abort') { model.mergeHead = ''; return ''; }
      if (args[0] === 'merge') { if (model.conflict) { model.mergeHead = D; throw Error('conflict'); } model.head = E; return ''; }
      throw Error(`Unexpected git ${args}`);
    },
    gh: async (path, options) => {
      model.gh.push({ path, options });
      if (path.endsWith('/pulls/379')) return { merged: true, merge_commit_sha: C, head: { sha: B } };
      if (path.endsWith('/pulls/380')) return { state: 'open', head: { sha: model.remoteHead, ref: 'codex/queued' } };
      if (path.includes('/git/ref/')) return { object: { sha: model.base } };
      throw Error(`Unexpected gh ${path}`);
    },
    controller: () => controller,
    start: async () => { model.starts++; model.prepared.phase = 'starting'; model.prepared.pid = 123; return model.prepared; },
    publish: async (_dir, state) => { model.events.push(structuredClone(state)); return { key: 'event-key' }; },
  };
  const enqueue = () => enqueueRelease({ stateDir, root, pr: 380, revision: A, afterPr: 379, owner: 'release owner' }, deps);
  const prove = async () => {
    await mkdir(join(stateDir, 'candidates/pr379'), { recursive: true }); await mkdir(join(stateDir, 'revisions'), { recursive: true });
    await writeFile(join(stateDir, 'candidates/pr379/state.json'), JSON.stringify({ phase: 'handed-off', pr: 379, revision: B, mergedRevision: C, owner: 'dependency owner' }));
    await writeFile(join(stateDir, 'revisions', `${C}.json`), JSON.stringify({ phase: 'shipped', revision: C, deployRevision: D, studioBuildNumber: 2320 }));
  };
  const queued = async () => JSON.parse(await readFile(join(stateDir, 'queue/pr380.json'), 'utf8'));
  const save = state => writeFile(join(stateDir, 'queue/pr380.json'), JSON.stringify(state));
  return { root, stateDir, model, deps, enqueue, prove, queued, save, tick: () => processReleaseQueue(stateDir, deps) };
}
test('queued immutable revision waits without integration until dependency has exact live proof', async t => {
  const f = await fixture(t); await f.enqueue(); await f.tick();
  assert.equal((await f.queued()).phase, 'waiting'); assert.match((await f.queued()).reason, /no recorded/);
  assert.equal(f.model.git.some(args => args[0] === 'merge' || args[0] === 'push'), false);
});
test('different live main blocks with an event rather than silently waiting on stale proof', async t => {
  const f = await fixture(t); await f.enqueue(); await f.prove(); f.model.base = E;
  await f.tick(); assert.match((await f.queued()).reason, /newer main requires its own proof/); assert.equal((await f.queued()).phase, 'blocked'); assert.equal(f.model.events.length, 1); assert.equal(f.model.starts, 0);
});
test('exact signer-child main proof integrates records pushes and starts controller once', async t => {
  const f = await fixture(t); await f.enqueue(); await f.prove(); await f.tick();
  const state = await f.queued(); assert.equal(state.phase, 'started'); assert.equal(state.revision, E); assert.equal(state.baseRevision, D); assert.equal(state.tree, T);
  assert.equal(f.model.prepared.revision, E); assert.equal(f.model.prepared.base, D);
  await f.tick(); assert.equal(f.model.starts, 1); assert.equal(f.model.git.filter(args => args[0] === 'merge').length, 1);
});
test('integration conflict aborts only its own merge then blocks with concrete event', async t => {
  const f = await fixture(t); await f.enqueue(); await f.prove(); f.model.conflict = true; await f.tick();
  assert.equal((await f.queued()).phase, 'blocked'); assert.equal(f.model.starts, 0);
  assert.equal(f.model.git.some(args => args[0] === 'merge' && args[1] === '--abort'), true);
  assert.match(f.model.events[0].cause, /conflict/);
});
test('restart after exact push does not repeat merge or push', async t => {
  const f = await fixture(t); const state = await f.enqueue();
  Object.assign(state, { phase: 'integrated', revision: E, tree: T, baseRevision: D }); await f.save(state);
  f.model.head = E; f.model.remoteHead = E;
  await f.tick(); assert.equal((await f.queued()).phase, 'started');
  assert.equal(f.model.git.some(args => ['merge', 'push'].includes(args[0])), false);
});
test('restart after preparation or start reuses exact candidate and never reintegrates', async t => {
  const f = await fixture(t); const state = await f.enqueue();
  Object.assign(state, { phase: 'pushed', revision: E, tree: T, baseRevision: D }); await f.save(state);
  f.model.head = E; f.model.remoteHead = E; f.model.prepared = { phase: 'publishing', id: 'pr380', revision: E, base: D };
  await f.tick(); assert.equal((await f.queued()).phase, 'started'); assert.equal(f.model.starts, 0);
  assert.equal(f.model.git.some(args => args[0] === 'merge'), false);
});
test('dependency failure emits its actual legacy state and leaves dependent queued', async t => {
  const f = await fixture(t); await f.enqueue();
  await mkdir(join(f.stateDir, 'candidates/pr379'), { recursive: true });
  await writeFile(join(f.stateDir, 'candidates/pr379/state.json'), JSON.stringify({ phase: 'blocked', revision: B, owner: 'dependency owner', reason: 'Pinned base changed', checkout: '/dependency' }));
  await f.tick(); assert.equal((await f.queued()).phase, 'waiting'); assert.match((await f.queued()).reason, /Pinned base changed/);
  assert.equal(f.model.events[0].revision, B); assert.equal(f.model.events[0].owner, 'dependency owner');
});
test('dirty queued checkout blocks before integration and cannot replace immutable queue revision', async t => {
  const f = await fixture(t); await f.enqueue(); await f.prove(); f.model.dirty = ' M source';
  await f.tick(); assert.equal((await f.queued()).phase, 'blocked');
  assert.equal(f.model.git.some(args => args[0] === 'merge'), false);
  await assert.rejects(enqueueRelease({ stateDir: f.stateDir, root: f.root, pr: 380, revision: E, afterPr: 379, owner: 'owner' }, f.deps), /immutable/);
});


test('restart never aborts an unrelated unfinished merge', async t => {
  const f = await fixture(t); const state = await f.enqueue();
  Object.assign(state, { phase: 'integrating', baseRevision: D }); await f.save(state); f.model.mergeHead = B;
  await f.tick(); assert.equal((await f.queued()).phase, 'blocked');
  assert.equal(f.model.git.some(args => args[0] === 'merge' && args[1] === '--abort'), false);
});
test('restart adopts only the exact queue-owned merge parents', async t => {
  const f = await fixture(t); const state = await f.enqueue();
  Object.assign(state, { phase: 'integrating', baseRevision: D }); await f.save(state); f.model.head = E; f.model.remoteHead = E;
  await f.tick(); assert.equal((await f.queued()).phase, 'started');
  assert.equal(f.model.git.some(args => args[0] === 'merge' || args[0] === 'push'), false);
});
test('cold service process imports the queue safely and exits with no work', async t => {
  const f = await fixture(t);
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
  const entry = new URL('./release-controller.mjs', import.meta.url);
  const { stdout } = await promisify(execFile)(process.execPath, [entry.pathname, 'resume-all', '--only-interrupted', '--state-dir', f.stateDir], { timeout: 10000 });
  assert.ok(JSON.parse(stdout));
});


test('explicit repair resume preserves authorization and revalidates corrected main before progressing', async t => {
  const f = await fixture(t); await f.enqueue(); await f.prove(); f.model.base = E;
  await f.tick(); const blocked = await f.queued(); assert.equal(blocked.blockedFrom, 'waiting');
  f.model.base = D; await f.tick(); assert.equal((await f.queued()).phase, 'blocked');
  const resumed = await resumeQueuedRelease({ stateDir: f.stateDir, pr: 380 }, f.deps);
  assert.equal(resumed.authorization, 'explicit-owner-ship'); assert.equal(resumed.originalRevision, A); assert.equal(resumed.phase, 'waiting');
  await f.tick(); assert.equal((await f.queued()).phase, 'started');
});

test('blocked exact prerequisite proof publishes its actual failure once with candidate ownership', async t => {
  const f = await fixture(t); await f.enqueue(); await f.prove();
  const candidatePath = join(f.stateDir, 'candidates/pr379/state.json');
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
  candidate.checkout = '/exact/prerequisite'; await writeFile(candidatePath, JSON.stringify(candidate));
  await writeFile(join(f.stateDir, 'revisions', `${C}.json`), JSON.stringify({ phase: 'blocked', revision: C, deployRevision: D, reason: 'Production credentials missing', log: '/exact/proof.log' }));
  const { publishReleaseEvent } = await import('./release-events.mjs');
  const events = [];
  const deps = { ...f.deps, publish: (dir, value) => publishReleaseEvent(dir, value, { startRepair: false, notify: async event => events.push(event) }) };
  await processReleaseQueue(f.stateDir, deps); await processReleaseQueue(f.stateDir, deps);
  assert.equal((await f.queued()).phase, 'waiting');
  assert.match((await f.queued()).reason, /Production credentials missing/);
  assert.equal(events.length, 1); assert.equal(events[0].revision, C);
  assert.equal(events[0].owner, 'dependency owner'); assert.equal(events[0].checkout, '/exact/prerequisite');
  assert.equal(events[0].log, '/exact/proof.log'); assert.equal(f.model.starts, 0);
});

test('superseded exact prerequisite proof blocks the dependent queue with an actionable event', async t => {
  const f = await fixture(t); await f.enqueue(); await f.prove();
  await writeFile(join(f.stateDir, 'revisions', `${C}.json`), JSON.stringify({ phase: 'superseded', revision: C, reason: 'main advanced to another revision' }));
  await f.tick();
  assert.equal((await f.queued()).phase, 'blocked');
  assert.match((await f.queued()).reason, /superseded.*main advanced/);
  assert.equal(f.model.events.length, 1); assert.equal(f.model.starts, 0);
});
