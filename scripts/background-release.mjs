#!/usr/bin/env node
// Local, token-free release observer. GitHub Actions performs the release;
// this process only watches its exact revision and verifies the live result.
import { spawn, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const terminal = new Set(['shipped', 'blocked', 'superseded']);
const signerMessage = 'CI: publish signed Lightweaver firmware release';
const signerEmail = '41898282+github-actions[bot]@users.noreply.github.com';

export function parseOptions(argv) {
  const [command, ...rest] = argv;
  if (!['start', 'status', 'resume', 'worker'].includes(command)) throw new Error('Usage: background-release.mjs start --revision FULLSHA [--repo owner/name] | status | resume');
  const options = { command };
  for (let i = 0; i < rest.length;) {
    const key = rest[i];
    if (key === '--only-interrupted') { options.onlyinterrupted = true; i++; continue; }
    if (!['--revision', '--repo', '--state-dir', '--interval-ms'].includes(key) || !rest[i + 1]) throw new Error(`Invalid option: ${key}`);
    options[key.slice(2).replaceAll('-', '')] = rest[i + 1];
    i += 2;
  }
  if (options.revision && !SHA.test(options.revision)) throw new Error('Revision must be a full lowercase 40-character SHA.');
  if (options.repo && !REPO.test(options.repo)) throw new Error('Repository must be owner/name.');
  return options;
}

export function defaultStateDir() {
  const gitDir = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return join(isAbsolute(gitDir) ? gitDir : resolve(repoRoot, gitDir), 'lightweaver-releases');
}

export function selectInstalledEntry(stateDir, install, currentFile = fileURLToPath(import.meta.url)) {
  if (!install || resolve(install.stateDir || '') !== resolve(stateDir)) return null;
  const runtime = resolve(install.runtimePath || '');
  if (dirname(runtime) !== resolve(stateDir, 'runtime') || !/^[0-9a-f]{64}$/.test(basename(runtime))) return null;
  const entry = join(runtime, 'scripts/background-release.mjs');
  return resolve(entry) === resolve(currentFile) ? null : entry;
}

async function installedEntry(stateDir) {
  try { return selectInstalledEntry(stateDir, JSON.parse(await readFile(join(stateDir, 'install.json'), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function readState(dir) {
  try { return JSON.parse(await readFile(join(dir, 'active.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function saveState(dir, state) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, `active.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, join(dir, 'active.json'));
  if (SHA.test(state.revision)) {
    const history = join(dir, 'revisions');
    await mkdir(history, { recursive: true, mode: 0o700 });
    const snapshot = join(history, `${state.revision}.${process.pid}.tmp`);
    await writeFile(snapshot, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(snapshot, join(history, `${state.revision}.json`));
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function withLock(dir, action) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, 'mutation.lock');
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const handle = await open(lock, 'wx', 0o600);
      try { await handle.writeFile(`${JSON.stringify({ pid: process.pid, at: Date.now() })}\n`); return await action(); }
      finally { await handle.close(); await rm(lock, { force: true }); }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const metadata = JSON.parse(await readFile(lock, 'utf8'));
        if (!pidAlive(metadata.pid) || Date.now() - metadata.at > 30_000) await rm(lock, { force: true });
      } catch (readError) {
        if (readError.code !== 'ENOENT') {
          try { if (Date.now() - (await stat(lock)).mtimeMs > 5_000) await rm(lock, { force: true }); } catch { /* another process cleared it */ }
        }
      }
      await new Promise(done => setTimeout(done, 50));
    }
  }
  throw new Error('Release observer state is busy; retry shortly.');
}

function newState(revision, repo, now = Date.now()) {
  return { revision, repo, origin: 'https://led.mandalacodes.com', phase: 'checking', deployRevision: revision, startedAt: now, updatedAt: now, deadlineAt: now + 2 * 60 * 60 * 1000, failures: 0, reason: '', pid: null };
}

export function prepareStart(current, options, resume = false, now = Date.now()) {
  if (resume) {
    if (options.onlyinterrupted) return current;
    if (!current || (terminal.has(current.phase) && !current.recoverable)) return current;
    if (!terminal.has(current.phase)) return current;
    return { ...current, phase: current.phase === 'blocked' ? 'checking' : current.phase, reason: '', failures: 0, proofFailures: 0, recoverable: false, deadlineAt: now + 2 * 60 * 60 * 1000, updatedAt: now };
  }
  if (!options.revision || !SHA.test(options.revision)) throw new Error('start requires --revision FULLSHA.');
  if (current?.revision === options.revision) return current;
  return newState(options.revision, options.repo || current?.repo || 'theyemingzhu/LED-Programming', now);
}

async function start(options, resume = false) {
  const dir = options.statedir || defaultStateDir();
  let state;
  await withLock(dir, async () => {
    const current = await readState(dir);
    state = prepareStart(current, options, resume);
    if (!state || terminal.has(state.phase)) return;
    if (resume && options.onlyinterrupted && pidAlive(current?.pid)) return;
    if (!pidAlive(current?.pid)) {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'worker', '--state-dir', dir, ...(options.intervalms ? ['--interval-ms', options.intervalms] : [])], { detached: true, stdio: 'ignore', cwd: process.cwd() });
      child.unref();
      state.pid = child.pid;
    } else state.pid = current.pid;
    await saveState(dir, state);
  });
  return state;
}

async function gh(path) {
  const { stdout } = await exec('gh', ['api', path], { timeout: 30_000, maxBuffer: 2_000_000 });
  return JSON.parse(stdout);
}

export function createGithubApi(repo, ghCall = gh) {
  return {
    async main() { return ghCall(`repos/${repo}/commits/main`); },
    async workflows(file, sha) {
      const data = await ghCall(`repos/${repo}/actions/workflows/${file}/runs?head_sha=${sha}&per_page=100`);
      return (data.workflow_runs || []).filter(run => run.head_sha === sha && ['push', 'workflow_run', 'workflow_dispatch'].includes(run.event)).sort((a, b) => b.id - a.id);
    },
    async jobs(id) {
      const data = await ghCall(`repos/${repo}/actions/runs/${id}/jobs?per_page=100`);
      return data.jobs || [];
    },
  };
}

function failed(run) { return run?.status === 'completed' && ['failure', 'timed_out', 'action_required', 'cancelled'].includes(run.conclusion); }
function stepSucceeded(job, name) { return job?.steps?.some(step => step.name === name && step.conclusion === 'success'); }
function workflowUrl(state, run) { return run?.html_url || (run?.id ? `https://github.com/${state.repo}/actions/runs/${run.id}` : undefined); }
function actualPublish(jobs) {
  const job = jobs.find(item => item.name === 'deploy' && item.conclusion === 'success');
  return Boolean(job && stepSucceeded(job, 'Build and deploy to Cloudflare Pages') && stepSucceeded(job, 'Verify the live Production Setup release'));
}
function signerDeferred(jobs) {
  return jobs.some(job => job.name === 'deferred' && job.conclusion === 'success' && stepSucceeded(job, 'A deferral to the signer is only green once the signer publishes'));
}
function isSignerChild(commit, parent) {
  return commit?.parents?.[0]?.sha === parent && commit?.commit?.message?.split('\n')[0] === signerMessage && commit?.commit?.committer?.email === signerEmail;
}

export async function advanceRelease(state, api, proof, now = Date.now()) {
  if (terminal.has(state.phase)) return state;
  if (now > state.deadlineAt) return { ...state, phase: 'blocked', recoverable: true, reason: 'Observer timed out before verified production proof.', updatedAt: now };
  const main = await api.main();
  const child = isSignerChild(main, state.revision) ? main.sha : null;
  if (main.sha !== state.revision && !child) return { ...state, phase: 'superseded', reason: `main advanced to ${main.sha}`, updatedAt: now };

  const tests = (await api.workflows('test.yml', state.revision))[0];
  if (tests?.status === 'completed' && tests.conclusion !== 'success') return { ...state, phase: 'blocked', testsUrl: workflowUrl(state, tests), reason: `Tests failed for ${state.revision}: ${tests.conclusion}`, updatedAt: now };
  if (!tests || tests.status !== 'completed' || tests.conclusion !== 'success') return { ...state, phase: 'checking', testsUrl: workflowUrl(state, tests), reason: 'Waiting for exact Tests run.', updatedAt: now };

  const signer = (await api.workflows('build-firmware.yml', state.revision))[0];
  if (failed(signer)) return { ...state, phase: 'blocked', reason: `Firmware signer failed: ${signer.conclusion}`, updatedAt: now };
  if (child && (!signer || signer.status !== 'completed')) return { ...state, phase: 'publishing', signerUrl: workflowUrl(state, signer), reason: 'Waiting for signer completion.', updatedAt: now };

  const target = child || state.revision;
  if (child) {
    const childTests = (await api.workflows('test.yml', child))[0];
    if (childTests?.status === 'completed' && childTests.conclusion !== 'success') return { ...state, phase: 'blocked', deployRevision: child, testsUrl: workflowUrl(state, childTests), reason: `Signed child Tests failed: ${childTests.conclusion}`, updatedAt: now };
    if (!childTests || childTests.status !== 'completed' || childTests.conclusion !== 'success') return { ...state, phase: 'checking', deployRevision: child, testsUrl: workflowUrl(state, childTests), reason: 'Waiting for signed child Tests.', updatedAt: now };
  }
  const deploys = await api.workflows('deploy-site.yml', target);
  let deploy = null;
  let deferred = false;
  let skipped = false;
  for (const run of deploys) {
    if (run.status !== 'completed') continue;
    const jobs = await api.jobs(run.id);
    if (run.conclusion === 'success' && actualPublish(jobs)) { deploy = run; break; }
    if (signerDeferred(jobs)) deferred = true;
    else if (run.conclusion === 'success') skipped = true;
  }
  if (!deploy) {
    const failedDeploy = deploys.find(failed);
    if (failedDeploy) return { ...state, phase: 'blocked', deployRevision: target, deployUrl: workflowUrl(state, failedDeploy), reason: `Deploy site failed: ${failedDeploy.conclusion}`, updatedAt: now };
    if (skipped) return { ...state, phase: 'blocked', deployRevision: target, reason: 'Deploy site completed without a successful publish and live freshness check.', updatedAt: now };
    if (deferred && !child) return { ...state, phase: 'publishing', signerUrl: workflowUrl(state, signer), reason: 'Exact source deploy deferred to the protected signer.', updatedAt: now };
    return { ...state, phase: 'publishing', deployRevision: target, reason: 'Waiting for exact Deploy site publish.', updatedAt: now };
  }
  const result = await proof({ revision: target, runId: deploy.id, runAttempt: deploy.run_attempt || 1, repo: state.repo });
  if (result?.superseded) return { ...state, phase: 'superseded', deployRevision: target, deployUrl: workflowUrl(state, deploy), reason: result.reason || 'Production revision was superseded.', updatedAt: now };
  if (!result?.ok) {
    const proofFailures = (state.proofFailures || 0) + 1;
    return { ...state, phase: result?.retryable && proofFailures < 3 ? 'verifying' : 'blocked', proofFailures, recoverable: Boolean(result?.retryable), deployRevision: target, deployUrl: workflowUrl(state, deploy), reason: result?.reason || 'Independent live proof failed.', updatedAt: now };
  }
  return { ...state, phase: 'shipped', deployRevision: target, deployUrl: workflowUrl(state, deploy), studioBuildNumber: result.studioBuildNumber, firmwareBuildNumber: result.firmwareBuildNumber, ...(result.clientBuildNumber ? { clientBuildNumber: result.clientBuildNumber } : {}), reason: 'Independent live proof passed.', updatedAt: now };
}

async function runProof({ revision, runId, runAttempt, repo }, dir) {
  const script = join(here, 'background-release-proof.mjs');
  try {
    const { stdout } = await exec(process.execPath, [script, '--revision', revision, '--state-dir', dir, '--run-id', String(runId), '--run-attempt', String(runAttempt), '--repo', repo], { cwd: repoRoot, timeout: 90_000, maxBuffer: 100_000 });
    return JSON.parse(stdout.trim());
  } catch (error) {
    try { return JSON.parse(String(error.stdout || '').trim()); }
    catch { return { ok: false, retryable: error.code === 'ENOENT' || error.killed, reason: `Independent proof failed: ${error.code || 'exit'}` }; }
  }
}

export function terminalNotice(state) {
  const short = state.revision.slice(0, 12);
  return {
    title: `Lightweaver release ${state.phase}: ${short}`,
    body: state.phase === 'shipped'
      ? `Studio build ${state.studioBuildNumber}; firmware build ${state.firmwareBuildNumber}${state.clientBuildNumber ? `; Client build ${state.clientBuildNumber}` : ""}.`
      : String(state.reason || 'Release observer stopped.').slice(0, 240),
  };
}

async function notifyTerminal(dir, state) {
  const events = join(dir, 'events');
  await mkdir(events, { recursive: true, mode: 0o700 });
  const event = join(events, `${state.revision}-${state.phase}.json`);
  let handle;
  try { handle = await open(event, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return; throw error; }
  const notice = terminalNotice(state);
  try { await handle.writeFile(`${JSON.stringify({ ...notice, revision: state.revision, phase: state.phase, at: Date.now() })}\n`); }
  finally { await handle.close(); }
  await withLock(dir, async () => {
    const latest = await readState(dir);
    if (latest?.revision === state.revision && latest.phase === state.phase) await saveState(dir, { ...latest, notified: true });
  });
  if (process.platform !== 'darwin') return;
  try {
    await exec('osascript', ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', notice.title, notice.body], { timeout: 10_000 });
  } catch { /* The durable event remains available when macOS notifications are unavailable. */ }
}

async function worker(options) {
  const dir = options.statedir || defaultStateDir();
  const interval = Math.max(60_000, Math.min(180_000, Number(options.intervalms) || 60_000));
  // Parent writes the child PID under the mutation lock just after spawn.
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await readState(dir);
    if (state?.pid === process.pid) break;
    await new Promise(done => setTimeout(done, 100));
  }
  while (true) {
    const current = await readState(dir);
    if (!current || current.pid !== process.pid || terminal.has(current.phase)) return;
    let next;
    try {
      next = await advanceRelease(current, createGithubApi(current.repo), args => runProof(args, dir));
      next.failures = 0;
    } catch (error) {
      const failures = current.failures + 1;
      next = { ...current, failures, phase: failures >= 8 ? 'blocked' : current.phase, recoverable: true, reason: failures >= 8 ? 'GitHub API unavailable after eight attempts; run resume when connectivity returns.' : 'GitHub API temporarily unavailable.', updatedAt: Date.now() };
    }
    let saved = false;
    await withLock(dir, async () => {
      const latest = await readState(dir);
      if (latest?.pid === process.pid && latest.revision === current.revision) { await saveState(dir, next); saved = true; }
    });
    if (saved && terminal.has(next.phase)) { await notifyTerminal(dir, next); return; }
    await new Promise(done => setTimeout(done, Math.min(180_000, interval * Math.max(1, next.failures))));
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const dir = options.statedir || defaultStateDir();
  if (options.command !== 'worker') {
    const entry = await installedEntry(dir);
    if (entry) {
      const { stdout } = await exec(process.execPath, [entry, ...process.argv.slice(2), '--state-dir', dir], { timeout: 15_000, maxBuffer: 100_000 });
      process.stdout.write(stdout);
      return;
    }
  }
  if (options.command === 'status') {
    const state = await readState(dir);
    process.stdout.write(`${JSON.stringify(state ? { revision: state.revision, deployRevision: state.deployRevision, phase: state.phase, reason: state.reason, origin: state.origin, testsUrl: state.testsUrl, signerUrl: state.signerUrl, deployUrl: state.deployUrl, studioBuildNumber: state.studioBuildNumber, firmwareBuildNumber: state.firmwareBuildNumber, clientBuildNumber: state.clientBuildNumber, notified: Boolean(state.notified), observerAlive: pidAlive(state.pid) } : { phase: 'idle' })}\n`);
  } else if (options.command === 'worker') await worker(options);
  else {
    const state = await start(options, options.command === 'resume');
    process.stdout.write(`${JSON.stringify(state ? { revision: state.revision, phase: state.phase, pid: state.pid, stateDir: dir } : { phase: 'idle', stateDir: dir })}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
