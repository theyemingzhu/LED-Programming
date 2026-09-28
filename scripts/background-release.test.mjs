import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advanceRelease, createGithubApi, parseOptions, prepareStart, saveState, selectInstalledEntry, terminalNotice, withLock } from './background-release.mjs';

const base = 'a'.repeat(40);
const child = 'b'.repeat(40);
const unrelated = 'c'.repeat(40);
const successful = (id = 1) => ({ id, status: 'completed', conclusion: 'success', run_attempt: 2 });
const state = () => prepareStart(null, { revision: base, repo: 'owner/repo' }, false, 1_000);
const publishedJob = { name: 'deploy', conclusion: 'success', steps: [
  { name: 'Build and deploy to Cloudflare Pages', conclusion: 'success' },
  { name: 'Verify the live Production Setup release', conclusion: 'success' },
] };
function api({ main = base, tests = successful(), signer = null, deploy = successful(9), jobs = [publishedJob], childTests = successful() } = {}) {
  return {
    main: async () => typeof main === 'string' ? { sha: main } : main,
    workflows: async (file, sha) => {
      const value = file === 'test.yml' ? (sha === child ? childTests : tests) : file === 'build-firmware.yml' ? signer : deploy;
      return value ? (Array.isArray(value) ? value : [value]) : [];
    },
    jobs: async id => Array.isArray(jobs) ? jobs : jobs[id] || [],
  };
}

test('start is idempotent and a new revision replaces only the tracked candidate', () => {
  const first = state();
  assert.equal(prepareStart(first, { revision: base }, false, 2_000), first);
  const next = prepareStart(first, { revision: child }, false, 2_000);
  assert.equal(next.revision, child);
  assert.equal(next.phase, 'checking');
  assert.equal(prepareStart(null, {}, true), null);
  assert.equal(prepareStart({ ...first, phase: 'shipped' }, {}, true).phase, 'shipped');
  const recovered = prepareStart({ ...first, phase: 'blocked', recoverable: true, failures: 8 }, {}, true, 2_000);
  assert.equal(recovered.phase, 'checking');
  assert.equal(recovered.failures, 0);
  assert.equal(prepareStart({ ...first, phase: 'blocked', recoverable: true }, { onlyinterrupted: true }, true).phase, 'blocked');
  assert.equal(prepareStart(first, { onlyinterrupted: true }, true).deadlineAt, first.deadlineAt);
  assert.throws(() => parseOptions(['start', '--revision', 'short']), /full lowercase/);
  assert.equal(parseOptions(['resume', '--only-interrupted']).onlyinterrupted, true);
});

test('state keeps per-revision history and a dead lock is reclaimed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lw-observer-'));
  try {
    await saveState(dir, state());
    assert.equal(JSON.parse(await readFile(join(dir, 'revisions', `${base}.json`), 'utf8')).revision, base);
    await writeFile(join(dir, 'mutation.lock'), JSON.stringify({ pid: 99999999, at: Date.now() - 60_000 }));
    assert.equal(await withLock(dir, async () => 'reclaimed'), 'reclaimed');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('source CLI selects only the installed pinned runtime inside its state directory', () => {
  const dir = '/tmp/lw-release-state';
  const runtimePath = join(dir, 'runtime', 'd'.repeat(64));
  const install = { stateDir: dir, runtimePath };
  const entry = join(runtimePath, 'scripts/background-release.mjs');
  assert.equal(selectInstalledEntry(dir, install, '/checkout/scripts/background-release.mjs'), entry);
  assert.equal(selectInstalledEntry(dir, install, entry), null);
  assert.equal(selectInstalledEntry(dir, { ...install, runtimePath: '/tmp/untrusted' }), null);
});

test('workflow API includes workflow_run and retains all exact candidate runs', async () => {
  const github = createGithubApi('owner/repo', async path => ({ workflow_runs: [
    { id: 2, head_sha: base, event: 'workflow_run' },
    { id: 3, head_sha: unrelated, event: 'workflow_run' },
    { id: 1, head_sha: base, event: 'workflow_dispatch' },
  ] }));
  assert.deepEqual((await github.workflows('build-firmware.yml', base)).map(run => run.id), [2, 1]);
});

test('failed and canceled exact workflow runs block shipment', async () => {
  assert.match((await advanceRelease(state(), api({ tests: { status: 'completed', conclusion: 'failure' } }), async () => ({}), 2_000)).reason, /Tests failed/);
  const canceled = await advanceRelease(state(), api({ deploy: { status: 'completed', conclusion: 'cancelled' } }), async () => ({}), 2_000);
  assert.equal(canceled.phase, 'blocked');
  assert.match(canceled.reason, /Deploy site failed/);
});

test('green deploy without publish or freshness never ships', async () => {
  const skipped = await advanceRelease(state(), api({ jobs: [{ name: 'deploy', conclusion: 'skipped', steps: [] }] }), async () => ({ ok: true }), 2_000);
  assert.equal(skipped.phase, 'blocked');
  assert.match(skipped.reason, /without a successful publish/);
});

test('normal skipped signer does not prevent a direct UI publish', async () => {
  const shipped = await advanceRelease(state(), api({ signer: { status: 'completed', conclusion: 'skipped' } }), async () => ({ ok: true, studioBuildNumber: 7, firmwareBuildNumber: 6 }), 2_000);
  assert.equal(shipped.phase, 'shipped');
});

test('a later no-op deploy cannot hide the exact published run', async () => {
  const shipped = await advanceRelease(state(), api({
    deploy: [successful(10), successful(9)],
    jobs: { 10: [{ name: 'deploy', conclusion: 'skipped', steps: [] }], 9: [publishedJob] },
  }), async () => ({ ok: true, studioBuildNumber: 7, firmwareBuildNumber: 6 }), 2_000);
  assert.equal(shipped.phase, 'shipped');
  assert.match(shipped.deployUrl, /\/9$/);
});

test('signer deferral waits, but credential-skipped publish blocks promptly', async () => {
  const deferred = { name: 'deferred', conclusion: 'success', steps: [{ name: 'A deferral to the signer is only green once the signer publishes', conclusion: 'success' }] };
  const pending = await advanceRelease(state(), api({ signer: successful(3), jobs: [deferred] }), async () => ({ ok: true }), 2_000);
  assert.equal(pending.phase, 'publishing');
  const skipped = await advanceRelease(state(), api({ signer: successful(3), jobs: [{ name: 'deploy', conclusion: 'success', steps: [{ name: 'Check Cloudflare credentials', conclusion: 'success' }] }] }), async () => ({ ok: true }), 2_000);
  assert.equal(skipped.phase, 'blocked');
});

test('only exact signer child is allowed after main advances', async () => {
  const signerChild = { sha: child, parents: [{ sha: base }], commit: { message: 'CI: publish signed Lightweaver firmware release', committer: { email: '41898282+github-actions[bot]@users.noreply.github.com' } } };
  let proofArgs;
  const shipped = await advanceRelease(state(), api({ main: signerChild, signer: successful(3) }), async args => { proofArgs = args; return { ok: true, studioBuildNumber: 100, firmwareBuildNumber: 99 }; }, 2_000);
  assert.equal(shipped.phase, 'shipped');
  assert.equal(shipped.deployRevision, child);
  assert.deepEqual(proofArgs, { revision: child, runId: 9, runAttempt: 2, repo: 'owner/repo' });
  assert.equal((await advanceRelease(state(), api({ main: unrelated }), async () => ({}), 2_000)).phase, 'superseded');
});

test('independent proof retries bounded network trouble but blocks conclusive failures', async () => {
  const transient = await advanceRelease(state(), api(), async () => ({ ok: false, retryable: true, reason: 'network unavailable' }), 2_000);
  assert.equal(transient.phase, 'verifying');
  assert.equal((await advanceRelease({ ...transient, proofFailures: 2 }, api(), async () => ({ ok: false, retryable: true }), 3_000)).phase, 'blocked');
  const mismatch = await advanceRelease(state(), api(), async () => ({ ok: false, reason: 'hash mismatch' }), 2_000);
  assert.equal(mismatch.phase, 'blocked');
  assert.equal(mismatch.recoverable, false);
  assert.equal((await advanceRelease(state(), api(), async () => ({}), state().deadlineAt + 1)).phase, 'blocked');
  assert.equal((await advanceRelease(state(), api(), async () => ({ ok: false, superseded: true, reason: 'main advanced' }), 2_000)).phase, 'superseded');
  assert.match(terminalNotice({ ...state(), phase: 'blocked', reason: 'Exact deploy failed' }).body, /Exact deploy failed/);
});
