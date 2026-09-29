import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCheckPlan, fingerprintCheck } from './release-check-plan.mjs';
const exec = promisify(execFile);
const pure = 'node --test ../packages/installer-core/test/*.test.js';

test('recursive plan preserves command coverage/order and only deduplicates identical audited pure checks', () => {
  const scripts = {
    'launch:check': 'npm run source && npm run again && node final.mjs',
    source: 'node first.mjs && npm run browser && npm run pure',
    browser: 'playwright test a.spec.ts --grep "a && b" && playwright test a.spec.ts b.spec.ts',
    pure, again: 'npm run pure && playwright test a.spec.ts --grep "different"',
  };
  const plan = buildCheckPlan(scripts);
  assert.deepEqual(plan.map(c => c.command), ['node first.mjs', 'playwright test a.spec.ts --grep "a && b"',
    'playwright test a.spec.ts b.spec.ts', pure, 'playwright test a.spec.ts --grep "different"', 'node final.mjs']);
  assert.deepEqual(plan, buildCheckPlan(scripts));
  assert.equal(new Set(plan.map(c => c.id)).size, plan.length);
  assert.deepEqual(plan[0].inputs, ['.']);
  assert.ok(plan[3].inputs.includes('release/test-vectors'));
  assert.equal(plan[3].cacheable, true);
  assert.equal(plan[0].cacheable, false);
});

test('unknown shell logic stays intact and malformed or recursive scripts fail closed', () => {
  for (const command of ['node a || node b && node c', '(node a && node b)', 'node a > result && node b', 'cd nested && node a', 'export CHECK=1 && node a']) {
    assert.equal(buildCheckPlan({ 'launch:check': command })[0].command, command);
  }
  assert.throws(() => buildCheckPlan({ 'launch:check': 'npm run absent' }), /Missing/);
  assert.throws(() => buildCheckPlan({ 'launch:check': 'npm run again', again: 'npm run launch:check' }), /cycle/);
  assert.throws(() => buildCheckPlan({ 'launch:check': 'node "bad' }), /Unterminated/);
  assert.throws(() => buildCheckPlan({ 'launch:check': 'node a &&' }), /Empty/);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'release-plan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => exec('git', args, { cwd: root });
  await git('init', '-q');
  await git('config', 'user.name', 'Test'); await git('config', 'user.email', 'test@example.invalid');
  async function commit(path, content) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
    await git('add', '--', path); await git('commit', '-qm', 'fixture', '--no-gpg-sign');
  }
  await commit('packages/installer-core/src/example.js', 'first');
  await commit('docs/example.md', 'first');
  return { root, commit, git };
}

test('pure fingerprint reuses docs-only commits but invalidates relevant input, command and global config', async t => {
  const { root, commit } = await fixture(t);
  const check = buildCheckPlan({ 'launch:check': pure })[0];
  let previous = await fingerprintCheck(root, check);
  await commit('docs/example.md', 'second');
  assert.equal(await fingerprintCheck(root, check), previous);
  // Local untracked files never enter the key or expose their contents.
  await writeFile(join(root, 'secret.env'), 'not-an-input');
  assert.equal(await fingerprintCheck(root, check), previous);
  for (const path of ['packages/installer-core/src/example.js', 'release/test-vectors/example.json',
    'release/keys/lightweaver-release-public.pem', 'lightweaver/package-lock.json',
    'lightweaver/scripts/example.mjs', 'lightweaver/vite.config.js', '.github/workflows/test.yml']) {
    await commit(path, 'changed');
    const next = await fingerprintCheck(root, check);
    assert.notEqual(next, previous, path); previous = next;
  }
  assert.notEqual(await fingerprintCheck(root, { ...check, command: `${pure} --test-reporter=tap`, inputs: ['.'] }), previous);
});

test('unknown/browser checks include the whole HEAD tree and reject unsafe narrowing', async t => {
  const { root, commit, git } = await fixture(t);
  const check = buildCheckPlan({ 'launch:check': 'playwright test a.spec.ts' })[0];
  const first = await fingerprintCheck(root, check);
  await commit('docs/example.md', 'second');
  assert.notEqual(await fingerprintCheck(root, check), first);
  await assert.rejects(fingerprintCheck(root, { ...check, inputs: ['lightweaver'] }), /Unsafe narrowed/);
  const pureCheck = buildCheckPlan({ 'launch:check': pure })[0];
  await assert.rejects(fingerprintCheck(root, { ...pureCheck, inputs: ['packages/installer-core'] }), /Unsafe narrowed/);
  const beforeDelete = await fingerprintCheck(root, pureCheck);
  await git('rm', 'packages/installer-core/src/example.js'); await git('commit', '-qm', 'delete', '--no-gpg-sign');
  assert.notEqual(await fingerprintCheck(root, pureCheck), beforeDelete);
});

test('actual launch gate expands without dropping a check or partial overlap', async () => {
  const scripts = JSON.parse(await readFile(new URL('../lightweaver/package.json', import.meta.url))).scripts;
  const plan = buildCheckPlan(scripts);
  assert.ok(plan.some(c => c.command === 'node ../firmware/lightweaver-controller/tests/factory-bin-freshness.mjs'));
  assert.ok(plan.some(c => c.command.includes('tests/three-gpio-playlist-workflow.spec.ts')));
  assert.ok(plan.some(c => c.command.includes('tests/expression-scene-lifecycle.spec.ts')));
  assert.equal(plan.filter(c => c.command === 'node scripts/prepare-local-fonts.mjs').length, 1);
  assert.ok(plan.every(c => !/^npm run [A-Za-z0-9:_-]+$/.test(c.command)));
});

test('side effects and unknown checks always run, including identical repeated commands', () => {
  const commands = ['vite build', 'node scripts/client-release.mjs stage', 'npm ci',
    'node scripts/prepare-local-fonts.mjs', 'playwright test a.spec.ts', 'node --test unknown.test.js'];
  for (const command of commands) {
    const plan = buildCheckPlan({ 'launch:check': `${command} && ${command}` });
    assert.equal(plan.length, 2, command);
    assert.deepEqual(plan.map(check => check.command), [command, command]);
    assert.ok(plan.every(check => check.cacheable === false));
    assert.equal(new Set(plan.map(check => check.id)).size, 2);
  }
  const plan = buildCheckPlan({ 'launch:check': `${pure} && ${pure}` });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].cacheable, true);
});

test('audited Node suites can resume on exact tree while builds and artifacts always execute', async () => {
  const scripts = JSON.parse(await readFile(new URL('../lightweaver/package.json', import.meta.url))).scripts;
  for (const name of ['test:unit', 'test:prod-deploy', 'test:build-graph', 'test:studio-release',
    'test:projects', 'test:client-release', 'test:client', 'test:background-release']) {
    const plan = buildCheckPlan({ ...scripts, 'launch:check': `npm run ${name}` });
    assert.equal(plan.length, 1, name);
    assert.equal(plan[0].cacheable, true, name);
    assert.deepEqual(plan[0].inputs, ['.'], name);
    const changed = buildCheckPlan({ 'launch:check': `${scripts[name]} --test-reporter=tap` });
    assert.equal(changed[0].cacheable, false, `modified ${name} needs audit`);
  }
  for (const name of ['build', 'stage:pages', 'verify:pages', 'build:client', 'verify:client']) {
    assert.ok(buildCheckPlan({ ...scripts, 'launch:check': `npm run ${name}` }).every(c => c.cacheable === false), name);
  }
});
