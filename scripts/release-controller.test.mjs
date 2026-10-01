import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReleaseController, withCandidateLock, startCandidate, parseOptions, resumeInterruptedCandidates } from './release-controller.mjs';
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40), T = 'e'.repeat(40);
async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'lw-controller-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateDir = join(root, 'state');
  await mkdir(join(root, 'lightweaver'));
  await writeFile(join(root, 'lightweaver/package.json'), JSON.stringify({ scripts: {} }));
  const model = { head: A, base: B, tree: T, dirty: '', merged: false, mergedTree: T, calls: [], executed: [], hash: 'same-inputs', fail: '', observerCalls: 0, tick: 100, events: [], ...overrides };
  const plan = [{ id: 'pure', command: 'node --test pure.test.mjs', inputs: ['src'], cacheable: true }, { id: 'build', command: 'node build.mjs', inputs: ['.'], cacheable: false }];
  const deps = { root, stateDir, now: () => ++model.tick, pidAlive: pid => pid === process.pid || pid === 777,
    buildCheckPlan: () => plan,
    fingerprintCheck: async () => model.hash,
    git: async args => {
      if (args[0] === 'status') return model.dirty;
      if (args[0] === 'merge-base') return '';
      if (args[1] === 'HEAD') return model.head;
      if (args[0] === 'rev-parse') return model.tree;
      throw Error(`unexpected git ${args}`);
    },
    gh: async (path, options) => {
      model.calls.push({ path, options });
      if (path.endsWith('/merge')) { model.merged = true; return { merged: true, sha: C }; }
      if (path.includes('/pulls/')) return { head: { sha: model.head }, base: { sha: model.base, ref: 'main' }, state: model.merged ? 'closed' : 'open', merged: model.merged, merge_commit_sha: C };
      if (path.includes('/git/commits/')) return { tree: { sha: model.mergedTree } };
      if (path.includes('/git/ref/')) return { object: { sha: model.merged ? C : model.base } };
      throw Error(`unexpected gh ${path}`);
    },
    execute: async (cwd, check, log) => { assert.equal(cwd, join(root, 'lightweaver')); model.executed.push(check.id); await writeFile(log, 'test output'); return { code: model.fail === check.id ? 1 : 0 }; },
    notify: async (_dir, state) => model.events.push(structuredClone(state)),
    startObserver: async state => { model.observerCalls++; await writeFile(join(stateDir, 'active.json'), JSON.stringify({ revision: state.mergedRevision, phase: 'publishing', pid: 777 })); },
  };
  const controller = createReleaseController(deps);
  const prepare = () => controller.prepare({ pr: 12, revision: model.head, base: model.base, owner: 'owner' });
  return { root, stateDir, model, controller, prepare, deps };
}
test('exact clean candidate checks once, merges pinned head and hands off matching tree to observer', async t => {
  const f = await fixture(t); await f.prepare();
  const state = await f.controller.run('pr12');
  assert.equal(state.phase, 'publishing'); assert.equal(state.mergedRevision, C);
  assert.deepEqual(f.model.executed, ['pure', 'build']); assert.equal(f.model.observerCalls, 1);
  assert.deepEqual(f.model.calls.find(c => c.path.endsWith('/merge')).options.fields, { sha: A, merge_method: 'merge' });
  assert.equal(state.checks[0].originalRevision, A);
});
test('failure persists cause, owner, log and repair action; resume never retries failed checks', async t => {
  const f = await fixture(t, { fail: 'build' }); await f.prepare();
  const state = await f.controller.run('pr12');
  assert.equal(state.phase, 'blocked'); assert.match(state.cause, /build failed/); assert.equal(state.owner, 'owner');
  assert.equal(await readFile(state.log, 'utf8'), 'test output'); assert.match(state.nextAction, /repair/);
  assert.equal(f.model.events.length, 1); assert.equal(f.model.observerCalls, 0);
  await assert.rejects(f.controller.run('pr12'), /blocked checks/);
});
test('explicit repaired revision reuses only passed pure input hash and preserves original provenance', async t => {
  const f = await fixture(t, { fail: 'build' }); await f.prepare(); await f.controller.run('pr12');
  f.model.head = D; f.model.fail = '';
  const prepared = await f.prepare();
  assert.equal(prepared.checks[0].status, 'passed'); assert.equal(prepared.checks[0].originalRevision, A);
  assert.equal(prepared.checks[1].status, 'pending');
  await f.controller.run('pr12'); assert.deepEqual(f.model.executed, ['pure', 'build', 'build']);
});
test('changed dependency invalidates a formerly passing check', async t => {
  const f = await fixture(t, { fail: 'build' }); await f.prepare(); await f.controller.run('pr12');
  f.model.head = D; f.model.hash = 'new inputs';
  const state = await f.prepare(); assert.equal(state.checks[0].status, 'pending');
});
test('dirty checkout or changed exact revision blocks checks before any merge', async t => {
  const f = await fixture(t); await f.prepare(); f.model.dirty = ' M source.js';
  assert.equal((await f.controller.run('pr12')).phase, 'blocked');
  assert.deepEqual(f.model.executed, []); assert.equal(f.model.calls.some(c => c.path.endsWith('/merge')), false);
});
test('changed remote base blocks rather than merging a newer untested integration', async t => {
  const f = await fixture(t); await f.prepare(); f.model.base = D;
  assert.match((await f.controller.run('pr12')).cause, /base changed/);
  assert.equal(f.model.calls.some(c => c.path.endsWith('/merge')), false);
});
test('merge tree mismatch blocks observer publication', async t => {
  const f = await fixture(t, { mergedTree: D }); await f.prepare();
  assert.match((await f.controller.run('pr12')).cause, /Merged tree differs/);
  assert.equal(f.model.observerCalls, 0);
});
test('dead runner status is interrupted, dominates stale unrelated observer and gives resume path', async t => {
  const f = await fixture(t); const state = await f.prepare(); state.phase = 'checking'; state.pid = 999; await f.controller.save(state);
  await writeFile(join(f.stateDir, 'active.json'), JSON.stringify({ revision: D, phase: 'shipped' }));
  const status = await f.controller.status(); assert.equal(status.phase, 'interrupted'); assert.equal(status.observer, null); assert.match(status.nextAction, /resume --id pr12/);
  const persisted = await f.controller.read('pr12'); assert.equal(persisted.phase, 'checking');
});
test('candidate blocker wins over matching stale observer state', async t => {
  const f = await fixture(t, { fail: 'pure' }); await f.prepare(); const state = await f.controller.run('pr12');
  state.mergedRevision = C; await f.controller.save(state);
  await writeFile(join(f.stateDir, 'active.json'), JSON.stringify({ revision: C, phase: 'shipped' }));
  assert.equal((await f.controller.status()).phase, 'blocked');
});
test('live lock is never stolen because of its age', async t => {
  const f = await fixture(t); const dir = await f.controller.candidateDir('pr12'); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'runner.lock'), JSON.stringify({ pid: 777, startedAt: 0 }));
  await assert.rejects(withCandidateLock(dir, () => assert.fail('stole lock'), { pidAlive: pid => pid === 777 }), /active/);
});
test('interrupted merge reconciles exact merged tree without a second merge mutation', async t => {
  const f = await fixture(t); const state = await f.prepare(); state.phase = 'interrupted'; state.checks.forEach(check => { check.status = 'passed'; check.originalRevision = A; }); await f.controller.save(state); f.model.merged = true;
  assert.equal((await f.controller.run('pr12')).phase, 'publishing');
  assert.equal(f.model.calls.some(c => c.path.endsWith('/merge')), false);
});
test('detached start persists candidate revision and child PID before returning', async t => {
  const f = await fixture(t); await f.prepare(); let unref = false;
  const state = await startCandidate(f.controller, 'pr12', { pidAlive: pid => pid === 777, spawnWorker: () => ({ pid: 777, unref() { unref = true; } }) });
  assert.equal(state.pid, 777); assert.equal(state.revision, A); assert.equal(unref, true);
  assert.equal((await f.controller.read('pr12')).pid, 777);
});
test('CLI rejects unknown actions and supports service interrupted-only entry', () => {
  assert.deepEqual(parseOptions(['resume-all', '--state-dir', '/tmp/state', '--only-interrupted']), { command: 'resume-all', stateDir: '/tmp/state', onlyInterrupted: true });
  assert.throws(() => parseOptions(['deploy']), /Usage/);
});


test('legacy candidate blocker is visible ahead of unrelated observer and uses normalized epoch time', async t => {
  const f = await fixture(t); await f.prepare();
  const dir = join(f.stateDir, 'candidates/pr379'); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'state.json'), JSON.stringify({ phase: 'blocked', revision: D, owner: 'legacy owner', checkout: f.root, reason: 'Legacy browser failed', updatedAt: 1790693315.7 }));
  await writeFile(join(f.stateDir, 'active.json'), JSON.stringify({ revision: C, phase: 'shipped' }));
  const status = await f.controller.status();
  assert.equal(status.candidate.id, 'pr379'); assert.equal(status.phase, 'blocked'); assert.equal(status.candidate.legacy, true); assert.match(status.cause, /Legacy browser failed/);
});
test('status reads current repair outcome from durable event rather than stale state copy', async t => {
  const f = await fixture(t, { fail: 'pure' }); await f.prepare(); const state = await f.controller.run('pr12');
  state.eventKey = 'f'.repeat(64); state.repair = { status: 'started' }; await f.controller.save(state);
  await mkdir(join(f.stateDir, 'events')); await writeFile(join(f.stateDir, 'events', `release-${state.eventKey}.json`), JSON.stringify({ notification: { status: 'submitted' }, repair: { status: 'completed' } }));
  assert.equal((await f.controller.status()).repair.status, 'completed');
});
test('another active publication blocks merging this candidate', async t => {
  const f = await fixture(t); await f.prepare();
  await writeFile(join(f.stateDir, 'active.json'), JSON.stringify({ revision: D, phase: 'publishing', pid: 777 }));
  const result = await f.controller.run('pr12'); assert.equal(result.phase, 'blocked'); assert.match(result.cause, /publication is owned/);
  assert.equal(f.model.calls.some(call => call.path.endsWith('/merge')), false);
});
test('live orphan check prevents duplicate execution during detached resume', async t => {
  const f = await fixture(t); const state = await f.prepare(); state.phase = 'checking'; state.pid = 999; state.checkPid = 777; await f.controller.save(state);
  const result = await startCandidate(f.controller, 'pr12', { resume: true, pidAlive: pid => pid === 777, spawnWorker: () => assert.fail('duplicated live check') });
  assert.equal(result.phase, 'interrupted'); assert.match(result.nextAction, /no duplicate/);
});
test('externally merged candidate without completed checks is not handed to observer', async t => {
  const f = await fixture(t); await f.prepare(); f.model.merged = true;
  assert.match((await f.controller.run('pr12')).cause, /before all recorded/); assert.equal(f.model.observerCalls, 0);
});
test('draft is marked ready only after all checks pass and before exact-head merge', async t => {
  const f = await fixture(t); const baseGh = f.deps.gh; let draft = true, readyAfter = null;
  const controller = createReleaseController({ ...f.deps, gh: async (path, options) => {
    if (path === 'graphql') { readyAfter = [...f.model.executed]; draft = false; return { data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } }; }
    const result = await baseGh(path, options); if (path.includes('/pulls/') && !path.endsWith('/merge')) return { ...result, draft, node_id: 'PR_node' }; return result;
  } });
  await controller.prepare({ pr: 12, revision: A, base: B, owner: 'owner' });
  assert.equal((await controller.run('pr12')).phase, 'publishing'); assert.deepEqual(readyAfter, ['pure', 'build']);
});


test('a newer failed result fences an older matching successful receipt', async t => {
  const f = await fixture(t, { fail: 'build' }); await f.prepare(); const state = await f.controller.run('pr12');
  state.history.push({ checks: [structuredClone(state.checks[0])] });
  state.checks[0].status = 'failed'; await f.controller.save(state);
  f.model.head = D;
  assert.equal((await f.prepare()).checks[0].status, 'pending');
});


test('overdue live orphan persists actionable blocker and emits a terminal event once', async t => {
  const f = await fixture(t); const state = await f.prepare();
  state.phase = 'checking'; state.pid = 999; state.checkPid = 777; state.currentCheck = 'pure';
  state.checks[0] = { ...state.checks[0], status: 'running', deadlineAt: 1, log: '/tmp/exact-check.log' }; await f.controller.save(state);
  const options = { resume: true, pidAlive: pid => pid === 777, spawnWorker: () => assert.fail('duplicated overdue check') };
  const result = await startCandidate(f.controller, 'pr12', options);
  assert.equal(result.phase, 'blocked'); assert.match(result.cause, /past its recorded deadline/);
  assert.equal(result.log, '/tmp/exact-check.log'); assert.equal(result.owner, 'owner');
  assert.equal(f.model.events.length, 1);
  await assert.rejects(startCandidate(f.controller, 'pr12', options), /Blocked candidates/);
  assert.equal(f.model.events.length, 1);
});
test('service recovers missed blocked event idempotently without resuming blocked or legacy candidates', async t => {
  const f = await fixture(t); const state = await f.prepare(); state.phase = 'blocked'; state.cause = 'saved before crash'; await f.controller.save(state);
  const legacyDir = join(f.stateDir, 'candidates/pr379'); await mkdir(legacyDir, { recursive: true });
  await writeFile(join(legacyDir, 'state.json'), JSON.stringify({ phase: 'blocked', revision: D, updatedAt: 1 }));
  let publications = 0;
  const { publishReleaseEvent } = await import('./release-events.mjs');
  const controller = createReleaseController({ ...f.deps, notify: (dir, value) => publishReleaseEvent(dir, value, { startRepair: false, notify: async () => { publications++; } }) });
  const opts = { start: () => assert.fail('resumed terminal candidate') };
  await resumeInterruptedCandidates(controller, opts); const first = await controller.read('pr12');
  await resumeInterruptedCandidates(controller, opts); const second = await controller.read('pr12');
  assert.equal(publications, 1); assert.match(first.eventKey, /^[a-f0-9]{64}$/); assert.equal(second.updatedAt, first.updatedAt);
});

test('explicit queued PR has visible waiting state before candidate preparation',async t=>{
 const f=await fixture(t);await mkdir(join(f.stateDir,'queue'),{recursive:true});await writeFile(join(f.stateDir,'queue','pr380.json'),JSON.stringify({id:'pr380',phase:'waiting',afterPr:379,updatedAt:1,nextAction:'Waiting for PR379 live proof'}));
 const s=await f.controller.status('pr380');assert.equal(s.phase,'waiting');assert.equal(s.queued.afterPr,379);assert.match(s.nextAction,/PR379/);
});
