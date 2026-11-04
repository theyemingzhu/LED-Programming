#!/usr/bin/env node
// Durable, model-free pre-merge release checks. Production remains in GitHub CI.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename, open, rm, readdir } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = /^[a-f0-9]{40}$/;
const ID = /^pr[1-9][0-9]*$/;
const SCHEMA = 1;
const REPO = 'theyemingzhu/LED-Programming';
const ACTIVE = new Set(['starting', 'checking', 'merging', 'handoff']);
const alive = pid => { if (!Number.isInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const json = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
async function atomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
export async function withCandidateLock(dir, action, { pidAlive = alive, pid = process.pid } = {}) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, 'runner.lock');
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { handle = await open(path, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const lock = await json(path);
      // Never steal a live or partially-written lock based on age.
      if (!lock || !Number.isInteger(lock.pid) || pidAlive(lock.pid)) throw new Error('Candidate has an active or unreadable runner lock.');
      const recoveryPath = join(dir, 'lock-recovery.lock');
      const recovery = await open(recoveryPath, 'wx', 0o600);
      try {
        const current = await json(path);
        if (current && (!Number.isInteger(current.pid) || pidAlive(current.pid))) throw new Error('Candidate runner became active during lock recovery.');
        await rm(path, { force: true });
      } finally { await recovery.close(); await rm(recoveryPath, { force: true }); }
    }
  }
  if (!handle) throw new Error('Candidate runner lock is busy.');
  await handle.writeFile(JSON.stringify({ pid, startedAt: Date.now() }));
  try { return await action(); }
  finally { await handle.close(); const lock = await json(path); if (lock?.pid === pid) await rm(path, { force: true }); }
}
async function command(root, file, args, timeout = 30_000) {
  const { stdout } = await exec(file, args, { cwd: root, timeout, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}
async function executeCheck(root, check, log, timeout, onStarted = async () => {}) {
  const fd = await open(log, 'a', 0o600);
  let child, timer;
  try {
    let timedOut = false;
    child = spawn(check.command, { cwd: root, shell: true, detached: true, stdio: ['ignore', fd.fd, fd.fd], env: { ...process.env, PATH: `${join(root, 'node_modules/.bin')}${delimiter}${process.env.PATH || ''}` } });
    const completion = new Promise(resolveResult => {
      child.on('error', error => resolveResult({ code: 1, cause: error.message }));
      child.on('close', (code, signal) => resolveResult({ code: code ?? 1, cause: timedOut ? 'Check deadline exceeded.' : signal ? `Check terminated by ${signal}.` : '', timedOut }));
    });
    timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeout);
    await onStarted(child.pid);
    return await completion;
  } finally { clearTimeout(timer); await fd.close(); }
}

export async function defaultStateDir(root = sourceRoot) {
  const common = await command(root, 'git', ['rev-parse', '--git-common-dir']);
  return join(isAbsolute(common) ? common : resolve(root, common), 'lightweaver-releases');
}
export function createReleaseController({ root = sourceRoot, stateDir, git, gh, buildCheckPlan, fingerprintCheck, execute, notify, startObserver, pidAlive = alive, now = Date.now, stepTimeoutMs = 30 * 60_000 } = {}) {
  root = resolve(root);
  const gitCall = git || (args => command(root, 'git', args));
  const ghCall = gh || (async (path, options = {}) => JSON.parse(await command(root, 'gh', ['api', path, ...(options.method ? ['--method', options.method] : []), ...Object.entries(options.fields || {}).flatMap(([key, value]) => ['-f', `${key}=${value}`])])));
  const dirPromise = stateDir ? Promise.resolve(resolve(stateDir)) : defaultStateDir(root);
  const candidateDir = async id => { if (!ID.test(id)) throw new Error('Candidate id must be prNUMBER.'); return join(await dirPromise, 'candidates', id); };
  const read = async id => json(join(await candidateDir(id), 'state.json'));
  const save = async state => { state.updatedAt = now(); await atomic(join(await candidateDir(state.id), 'state.json'), state); return state; };
  const emit = async state => { try { const event = await (notify || (async (dir, value) => (await import('./release-events.mjs')).publishReleaseEvent(dir, value)))(await dirPromise, state); if (event?.key && state.eventKey !== event.key) { state.eventKey = event.key; state.notification = event.notification; state.repair = event.repair; await save(state); } } catch (error) { state.notificationError = error.message; await save(state); } };
  const clean = async state => {
    if (await gitCall(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Checkout is dirty; candidate checks require the pinned clean revision.');
    if (await gitCall(['rev-parse', 'HEAD']) !== state.revision) throw new Error('Checkout HEAD changed from the pinned candidate revision.');
    if (await gitCall(['rev-parse', 'HEAD^{tree}']) !== state.tree) throw new Error('Checkout tree changed from the pinned candidate tree.');
  };
  const remote = async state => {
    const pr = await ghCall(`repos/${state.repo}/pulls/${state.pr}`);
    if (pr.head?.sha !== state.revision || pr.base?.sha !== state.base || pr.base?.ref !== 'main') throw new Error('GitHub PR head or main base changed from the pinned candidate.');
    if (pr.head?.repo?.full_name && pr.head.repo.full_name !== state.repo) throw new Error('Release candidate must come from this repository.');
    if (pr.state !== 'open' || pr.merged === true) throw new Error('PR is not open for this candidate.');
    const main = await ghCall(`repos/${state.repo}/git/ref/heads/main`);
    if (main.object?.sha !== state.base) throw new Error('GitHub main advanced beyond the pinned base.');
    return pr;
  };
  const hashCheck = async check => {
    const fingerprint = fingerprintCheck || (await import('./release-check-plan.mjs')).fingerprintCheck;
    const inputHash = await fingerprint(root, check);
    return createHash('sha256').update(JSON.stringify({ command: check.command, inputs: check.inputs, inputHash })).digest('hex');
  };
  async function prepare({ pr, revision, base, owner }) {
    if (!/^[1-9][0-9]*$/.test(String(pr)) || !SHA.test(revision || '') || !SHA.test(base || '') || !String(owner || '').trim()) throw new Error('prepare requires --pr NUMBER --revision FULLSHA --base FULLSHA --owner NAME and explicit ship authorization.');
    const id = `pr${pr}`;
    return withCandidateLock(await candidateDir(id), async () => {
      const previous = await read(id);
      if (previous && previous.phase !== 'blocked') throw new Error('Only a blocked candidate may be prepared again; use resume for an interruption.');
      if ((previous?.pid && pidAlive(previous.pid)) || pidAlive(previous?.checkPid)) throw new Error('Candidate runner is still alive.');
      const state = { schemaVersion: SCHEMA, id, pr: Number(pr), repo: REPO, root, checkout: root, owner: String(owner).trim(), revision, base, tree: await gitCall(['rev-parse', `${revision}^{tree}`]), phase: 'prepared', pid: null, createdAt: now(), updatedAt: now(), checks: [], history: [...(previous?.history || []), ...(previous ? [{ revision: previous.revision, base: previous.base, checks: previous.checks, phase: previous.phase, cause: previous.cause, updatedAt: previous.updatedAt }] : [])], nextAction: `Run node scripts/release-controller.mjs run --id ${id}`, cause: '', stepTimeoutMs };
      await clean(state);
      await gitCall(['merge-base', '--is-ancestor', base, revision]);
      await remote(state);
      const scripts = JSON.parse(await readFile(join(root, 'lightweaver/package.json'), 'utf8')).scripts;
      const plan = await (buildCheckPlan || (await import('./release-check-plan.mjs')).buildCheckPlan)(scripts);
      if (!Array.isArray(plan) || !plan.length) throw new Error('Release check plan is empty.');
      const historical = [ ...(previous?.checks || []), ...state.history.slice().reverse().flatMap(item => item.checks || []) ];
      for (const check of plan) {
        if (!/^[a-zA-Z0-9_.:-]+$/.test(check.id) || typeof check.command !== 'string' || !check.command.trim()) throw new Error('Invalid repository release check plan.');
        const inputHash = await hashCheck(check);
        const latest = historical.find(item => item.id === check.id && item.command === check.command && item.inputHash === inputHash);
        const passed = check.cacheable === true && latest?.status === 'passed' ? latest : null;
        state.checks.push({ ...check, inputHash, status: passed ? 'passed' : 'pending', ...(passed ? { originalRevision: passed.originalRevision, completedAt: passed.completedAt, log: passed.log, reused: true } : {}) });
      }
      return save(state);
    }, { pidAlive });
  }
  async function block(state, error, log) {
    state.phase = 'blocked'; state.cause = error.message || String(error); state.reason = state.cause; state.log = log || state.log || '';
    state.nextAction = `Owner ${state.owner}: inspect ${state.log || 'candidate state'}, repair the cause, and explicitly prepare ${state.id} with its clean revision and current base.`;
    state.pid = null; await save(state); await emit(state); return state;
  }
  async function publicationAvailable(state) {
    const observer = await json(join(await dirPromise, 'active.json'));
    if (observer && !['shipped', 'blocked', 'superseded'].includes(observer.phase) && observer.revision !== state.mergedRevision) throw new Error(`Production publication is owned by ${observer.revision}; reconcile that release before this candidate merges.`);
  }
  const withPublication = async action => withCandidateLock(join(await dirPromise, 'publication'), action, { pidAlive });
  async function handoff(state) {
    await publicationAvailable(state);
    const commit = await ghCall(`repos/${state.repo}/git/commits/${state.mergedRevision}`);
    if (commit.tree?.sha !== state.tree) throw new Error('Merged tree differs from the exact tested candidate; observer was not started.');
    const main = await ghCall(`repos/${state.repo}/git/ref/heads/main`);
    if (main.object?.sha !== state.mergedRevision) throw new Error('Main moved after merge; exact candidate handoff requires reconciliation.');
    const dir = await dirPromise;
    if (startObserver) await startObserver(state);
    else await command(root, process.execPath, [join(root, 'scripts/background-release.mjs'), 'start', '--revision', state.mergedRevision, '--repo', state.repo, '--state-dir', dir]);
    const observer = await json(join(dir, 'active.json'));
    if (observer?.revision !== state.mergedRevision || (!pidAlive(observer.pid) && observer.phase !== 'shipped')) throw new Error('Background observer did not persist this exact merged revision with a live runner.');
    state.phase = 'publishing'; state.pid = null; state.observerRevision = observer.revision;
    state.nextAction = `Production CI and the model-free observer own ${state.mergedRevision}; read release-controller.mjs status --id ${state.id}.`;
    return save(state);
  }
  async function run(id) {
    return withCandidateLock(await candidateDir(id), async () => {
      let state = await read(id);
      if (state?.schemaVersion !== SCHEMA || !['prepared', 'starting', 'interrupted'].includes(state.phase)) throw new Error('Candidate is not prepared/interrupted; blocked checks need explicit repair preparation.');
      if (resolve(state.root) !== root) throw new Error('Candidate checkout does not match this runner.');
      state.pid = process.pid; state.phase = 'checking'; state.cause = ''; state.nextAction = 'Durable runner is checking this exact candidate.'; await save(state);
      try {
        await clean(state);
        // An interrupted merge is reconciled by read, never blindly merged twice.
        const pr = await ghCall(`repos/${state.repo}/pulls/${state.pr}`);
        if (pr.merged === true) {
          if (!state.checks.length || state.checks.some(check => check.status !== 'passed')) throw new Error('PR merged outside this runner before all recorded candidate checks passed.');
          if (pr.head?.sha !== state.revision || !SHA.test(pr.merge_commit_sha || '')) throw new Error('Merged PR no longer identifies this exact candidate.');
          state.mergedRevision = pr.merge_commit_sha; state.phase = 'handoff'; await save(state); return await withPublication(() => handoff(state));
        }
        await remote(state);
        for (const check of state.checks) {
          await clean(state);
          if (await hashCheck(check) !== check.inputHash) throw new Error(`Inputs changed for ${check.id}; prepare a new clean candidate.`);
          if (check.status === 'passed' && check.cacheable === true) continue;
          const log = join(await candidateDir(id), `${check.id.replaceAll(':', '_')}.${state.revision}.${now()}.log`);
          check.status = 'running'; check.log = log; check.startedAt = now(); check.deadlineAt = now() + state.stepTimeoutMs; state.currentCheck = check.id; state.log = log; await save(state);
          const result = await (execute || executeCheck)(join(root, 'lightweaver'), check, log, state.stepTimeoutMs, async pid => { state.checkPid = pid; await save(state); });
          state.checkPid = null;
          if (result.code !== 0) { check.status = 'failed'; check.completedAt = now(); throw new Error(`${check.id} failed${result.cause ? `: ${result.cause}` : ` (exit ${result.code})`}`); }
          await clean(state);
          if (await hashCheck(check) !== check.inputHash) throw new Error(`${check.id} changed its own inputs; result is not reusable.`);
          check.status = 'passed'; check.originalRevision = state.revision; check.completedAt = now(); check.reused = false; await save(state);
        }
        return await withPublication(async () => {
        await clean(state); const mergePr = await remote(state); await publicationAvailable(state);
        if (mergePr.draft) {
          if (!mergePr.node_id) throw new Error('Draft PR is missing its node identity; mark it ready before resuming.');
          const ready = await ghCall('graphql', { method: 'POST', fields: { query: `mutation { markPullRequestReadyForReview(input: {pullRequestId: ${JSON.stringify(mergePr.node_id)}}) { pullRequest { isDraft } } }` } });
          if (ready?.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !== false) throw new Error('GitHub did not confirm the checked PR is ready for review.');
          await remote(state);
        }
        state.phase = 'merging'; state.currentCheck = null; state.nextAction = 'Merging the checked exact PR head after pinned main-base verification.'; await save(state);
        const merged = await ghCall(`repos/${state.repo}/pulls/${state.pr}/merge`, { method: 'PUT', fields: { sha: state.revision, merge_method: 'merge' } });
        if (merged.merged !== true || !SHA.test(merged.sha || '')) throw new Error(merged.message || 'GitHub refused the exact-head merge.');
        state.mergedRevision = merged.sha; state.phase = 'handoff'; await save(state);
        return await handoff(state);
        });
      } catch (error) { return block(state, error); }
    }, { pidAlive });
  }
  async function status(id) {
    const dir = await dirPromise;
    let names = [];
    try { names = await readdir(join(dir, 'candidates')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const candidates = [];
    for (const name of names.filter(name => ID.test(name) && (!id || name === id))) {
      let candidate = await read(name);
      if (!candidate) continue;
      if (candidate.schemaVersion !== SCHEMA) {
        candidate = { ...candidate, id: name, legacy: true, root: candidate.checkout, cause: candidate.reason || '', updatedAt: Number(candidate.updatedAt) < 1e12 ? Number(candidate.updatedAt) * 1000 : candidate.updatedAt, nextAction: `Legacy candidate: inspect its log; explicitly prepare ${name} with the versioned controller after repair. Legacy runners are not automatically resumed.` };
      }
      if (!candidate.legacy && ACTIVE.has(candidate.phase) && !pidAlive(candidate.pid)) {
        // Status is conservative and read-only: it never restarts a process.
        candidate = { ...candidate, phase: 'interrupted', cause: 'Runner is no longer alive.', nextAction: `Run node scripts/release-controller.mjs resume --id ${name}` };
      }
      candidates.push(candidate);
    }
    candidates.sort((a, b) => b.updatedAt - a.updatedAt);
    const observer = await json(join(dir, 'active.json'));
    const candidate = candidates[0] || null;
    const recordedObserver = candidate?.mergedRevision ? await json(join(dir, 'revisions', `${candidate.mergedRevision}.json`)) : null;
    const joinedObserver = candidate?.mergedRevision && observer?.revision === candidate.mergedRevision ? observer : recordedObserver?.revision === candidate?.mergedRevision ? recordedObserver : null;
    const eventKey = (candidate?.phase === 'blocked' ? candidate.eventKey : joinedObserver?.eventKey) || candidate?.eventKey;
    const event = /^[a-f0-9]{64}$/.test(eventKey || '') ? await json(join(dir, 'events', `release-${eventKey}.json`)) : null;
    let queueNames = [];
    try { queueNames = await readdir(join(dir, 'queue')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const queues = (await Promise.all(queueNames.filter(name => /^pr[1-9][0-9]*\.json$/.test(name) && (!id || name === `${id}.json`)).map(name => json(join(dir, 'queue', name))))).filter(Boolean);
    const queued = queues.sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
    return { schemaVersion: SCHEMA, queued, queues, candidate, candidates, notification: event?.notification || null, repair: event?.repair || null, event, observer: joinedObserver || (!candidate && !id ? observer : null), phase: (candidate?.phase === 'blocked' ? 'blocked' : joinedObserver?.phase) || candidate?.phase || (!id ? observer?.phase : null) || queued?.phase || 'missing', cause: candidate?.phase === 'blocked' ? candidate.cause : joinedObserver?.reason || candidate?.cause || '', nextAction: candidate?.nextAction || queued?.nextAction || '', stateDir: dir };
  }
  return { prepare, run, status, read, save, emit, block, now, candidateDir, dirPromise };
}

export async function getReleaseStatus(options = {}) { return createReleaseController(options).status(options.id); }

export function parseOptions(argv) {
  const [commandName, ...args] = argv;
  if (!['prepare', 'run', 'resume', 'status', 'worker', 'resume-all'].includes(commandName)) throw new Error('Usage: release-controller.mjs prepare --pr NUMBER --revision FULLSHA --base FULLSHA --owner NAME | run/resume --id prNUMBER | status [--id prNUMBER] | resume-all --only-interrupted');
  const result = { command: commandName };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--only-interrupted') { result.onlyInterrupted = true; continue; }
    if (!['--pr', '--revision', '--base', '--owner', '--id', '--state-dir', '--root'].includes(args[i]) || !args[i + 1]) throw new Error(`Unknown or missing option ${args[i]}`);
    result[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = args[++i];
  }
  if (result.id && !ID.test(result.id)) throw new Error('Candidate id must be prNUMBER.');
  return result;
}
export async function startCandidate(controller, id, { resume = false, spawnWorker = spawn, pidAlive = alive } = {}) {
  const dir = await controller.candidateDir(id);
  return withCandidateLock(dir, async () => {
    let state = await controller.read(id);
    if (!state) throw new Error('Candidate does not exist.');
    if (pidAlive(state.pid)) return state;
    if (state.phase === 'blocked') throw new Error('Blocked candidates require explicit repair preparation.');
    if (pidAlive(state.checkPid)) {
      const check = state.checks?.find(item => item.id === state.currentCheck) || state.checks?.find(item => item.status === 'running');
      if (Number.isFinite(check?.deadlineAt) && controller.now() > check.deadlineAt) {
        return controller.block(state, new Error(`Runner exited while check process ${state.checkPid} remained alive past its recorded deadline. Inspect and stop that exact process before preparing a repair; no duplicate or arbitrary PID termination was attempted.`), check.log);
      }
      state.phase = 'interrupted';
      state.nextAction = `Previous check process ${state.checkPid} is still running; no duplicate will start. Inspect its log if its recorded deadline has passed.`;
      return controller.save(state);
    }
    if (ACTIVE.has(state.phase)) state = { ...state, phase: 'interrupted' };
    if (state.phase !== 'prepared' && !(resume && state.phase === 'interrupted')) throw new Error('Only prepared or interrupted candidates can start; blocked candidates require explicit repair preparation.');
    const log = await open(join(dir, 'runner.log'), 'a', 0o600);
    try {
      state.phase = 'starting'; state.pid = null; await controller.save(state);
      const child = spawnWorker(process.execPath, [fileURLToPath(import.meta.url), 'worker', '--id', id, '--state-dir', await controller.dirPromise, '--root', state.root], { cwd: state.root, detached: true, stdio: ['ignore', log.fd, log.fd] });
      if (!Number.isInteger(child.pid)) throw new Error('Detached runner did not start.');
      state.pid = child.pid; state.nextAction = `Runner ${child.pid} owns checks for ${state.revision}; status --id ${id} reports persisted progress.`; await controller.save(state);
      child.unref();
      if (!pidAlive(child.pid)) throw new Error('Detached runner exited before its start was verified.');
      return state;
    } finally { await log.close(); }
  }, { pidAlive });
}
export async function resumeInterruptedCandidates(controller, { start = async (state, stateDir) => startCandidate(createReleaseController({ root: state.root, stateDir }), state.id, { resume: true }) } = {}) {
  const snapshot = await controller.status();
  const resumed = [];
  for (const state of snapshot.candidates.filter(item => !item.legacy && item.schemaVersion === SCHEMA)) {
    try {
      if (state.phase === 'blocked') {
        // Covers a crash after persisting failure but before recording its event.
        // publishReleaseEvent claims a durable key, so repeats never notify twice.
        await withCandidateLock(await controller.candidateDir(state.id), async () => {
          const current = await controller.read(state.id);
          if (current?.schemaVersion === SCHEMA && current.phase === 'blocked') await controller.emit(current);
        });
      } else if (state.phase === 'interrupted') resumed.push(await start(state, snapshot.stateDir));
    } catch (error) { resumed.push({ id: state.id, error: error.message }); }
  }
  return { resumed };
}
async function main(options) {
  const controller = createReleaseController(options);
  if (options.command === 'prepare') return controller.prepare(options);
  if (options.command === 'status') return controller.status(options.id);
  if (options.command === 'resume-all') {
    if (!options.onlyInterrupted) throw new Error('resume-all requires --only-interrupted.');
    const recovered = await resumeInterruptedCandidates(controller);
    const queued = await (await import('./release-queue.mjs')).processReleaseQueue(await controller.dirPromise);
    return { ...recovered, queued };
  }
  if (!options.id) throw new Error(`${options.command} requires --id prNUMBER.`);
  if (options.command === 'worker') {
    // The starter persists the PID before releasing its short startup lock.
    for (let n = 0; n < 100; n++) {
      const lock = await json(join(await controller.candidateDir(options.id), 'runner.lock'));
      if (!lock || !alive(lock.pid)) break;
      await new Promise(done => setTimeout(done, 50));
    }
    return controller.run(options.id);
  }
  const state = await controller.read(options.id);
  const exact = state ? createReleaseController({ root: state.root, stateDir: await controller.dirPromise }) : controller;
  return startCandidate(exact, options.id, { resume: options.command === 'resume' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(parseOptions(process.argv.slice(2))).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
