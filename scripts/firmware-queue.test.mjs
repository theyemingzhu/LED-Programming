// End-to-end proof for the card-update waiting list.
//
// It builds a throwaway copy of this repository with its own local "shared
// copy", parks a trivial change in it, and redeems it — then does the same
// with a change that no longer applies, and checks that the failure is loud,
// specific, and leaves nothing behind.
//
// Run it with:  node --test scripts/firmware-queue.test.mjs
//
// It never touches the real repository, the real shared copy, or the real
// waiting list.

import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  describeReleaseBranchCollision,
  describeRegister,
  emptyRegister,
  isReleaseBranchCollision,
  isGreater,
  nextVersion,
  readableDate,
  validateEntry,
} from './firmware-queue.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// A minimal stand-in repository: the four files the release path reads or
// writes, plus the queue tooling itself. Cloning the real repository would
// take minutes and prove nothing extra.
function buildSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'firmware-queue-test-'));
  const upstream = join(root, 'upstream.git');
  const seed = join(root, 'seed');
  run(['init', '--quiet', '--bare', '--initial-branch=main', upstream], root);
  run(['init', '--quiet', '--initial-branch=main', seed], root);
  run(['config', 'user.email', 'test@example.com'], seed);
  run(['config', 'user.name', 'Queue Test'], seed);

  const write = (relative, contents) => {
    execFileSync('mkdir', ['-p', dirname(join(seed, relative))]);
    writeFileSync(join(seed, relative), contents);
  };

  write('firmware/lightweaver-controller/VERSION', '1.2.3\n');
  write(
    'firmware/lightweaver-controller/tests/firmware-version-policy.mjs',
    "assert.equal(readFileSync(versionPath, 'utf8').trim(), '1.2.3');\n",
  );
  write('lightweaver/public/firmware/release-manifest.json', JSON.stringify({ firmwareVersion: '1.2.3' }));
  write('carried.txt', 'before\n');
  write('firmware-queue/queue.json', `${JSON.stringify(emptyRegister(), null, 2)}\n`);
  execFileSync('cp', [join(repoRoot, 'scripts/firmware-queue.mjs'), join(seed, 'firmware-queue.mjs')]);
  execFileSync('mkdir', ['-p', join(seed, 'scripts')]);
  execFileSync('mv', [join(seed, 'firmware-queue.mjs'), join(seed, 'scripts/firmware-queue.mjs')]);

  run(['add', '-A'], seed);
  run(['commit', '--quiet', '-m', 'seed'], seed);
  run(['remote', 'add', 'origin', upstream], seed);
  run(['push', '--quiet', 'origin', 'main'], seed);
  return { root, upstream, seed };
}

function clone(root, upstream, name) {
  const path = join(root, name);
  run(['clone', '--quiet', upstream, path], root);
  run(['config', 'user.email', 'test@example.com'], path);
  run(['config', 'user.name', 'Queue Test'], path);
  return path;
}

function queue(cwd, args) {
  return spawnSync('node', [join(cwd, 'scripts/firmware-queue.mjs'), ...args], { cwd, encoding: 'utf8' });
}

function park(cwd, entry) {
  const path = join(cwd, 'firmware-queue/queue.json');
  const register = JSON.parse(readFileSync(path, 'utf8'));
  register.waiting.push(entry);
  writeFileSync(path, `${JSON.stringify(register, null, 2)}\n`);
  run(['add', '-A'], cwd);
  run(['commit', '--quiet', '-m', 'park'], cwd);
  run(['push', '--quiet', 'origin', 'main'], cwd);
}

test('the next version beats both the tree and what is already signed', () => {
  assert.equal(nextVersion('1.1.28', '1.1.27'), '1.1.29');
  assert.equal(nextVersion('1.1.27', '1.1.28'), '1.1.29');
  assert.equal(nextVersion('1.1.27', '1.1.27'), '1.1.28');
  assert.ok(isGreater('1.2.0', '1.1.99'));
  assert.ok(!isGreater('1.1.0', '1.1.0'));
});

test('a waiting item must say what it is, why, and where it lives', () => {
  const good = { id: 'a-thing', what: 'A thing.', why: 'A reason.', source: { kind: 'branch', branch: 'b' } };
  assert.doesNotThrow(() => validateEntry(good));
  assert.throws(() => validateEntry({ ...good, id: 'Not A Slug' }), /short lowercase name/);
  assert.throws(() => validateEntry({ ...good, what: '' }), /plain-language/);
  assert.throws(() => validateEntry({ ...good, source: {} }), /branch or a patch/);
  assert.throws(() => validateEntry(good, [good]), /already waiting/);
});

test('a non-fast-forward rejection describes a collision without guessing ownership', () => {
  const rejection = [
    'To /tmp/upstream.git',
    ' ! [rejected]        HEAD -> firmware-release/1.1.29 (non-fast-forward)',
    "error: failed to push some refs to '/tmp/upstream.git'",
    'hint: Updates were rejected because the tip of your current branch is behind',
  ].join('\n');
  assert.equal(isReleaseBranchCollision(rejection), true);
  assert.equal(isReleaseBranchCollision('ssh: connection refused'), false);
  assert.equal(isReleaseBranchCollision(''), false);
  assert.equal(isReleaseBranchCollision('! [remote rejected] HEAD -> branch (pre-receive hook declined)'), false);
  assert.equal(isReleaseBranchCollision('! [rejected] HEAD -> branch (other reason)\nhint: non-fast-forward'), false);

  const described = describeReleaseBranchCollision('firmware-release/1.1.29', '1.1.29');
  assert.match(described.message, /existing branch is blocking version 1\.1\.29/);
  assert.match(described.message, /firmware-release\/1\.1\.29/);
  assert.match(described.detail, /may still be in use/);
  assert.match(described.detail, /check with its owner/);
  assert.match(described.detail, /gh pr list --state all --head firmware-release\/1\.1\.29/);
  assert.doesNotMatch(`${described.message}\n${described.detail}`, /abandoned|--delete|force.push|Nothing from this run was lost/i);
});

test('an empty waiting list reads as plain English with no jargon', () => {
  const text = describeRegister({ waiting: [] });
  assert.match(text, /Nothing is waiting/);
  assert.doesNotMatch(text, /firmware|VERSION|\.json|git/i);
  assert.equal(readableDate('2026-08-21'), '21 August 2026');
});

test('redeeming gathers a parked patch into one commit and empties the list', () => {
  const { root, upstream } = buildSandbox();
  try {
    const author = clone(root, upstream, 'author');
    writeFileSync(join(author, 'carried.txt'), 'after\n');
    const patch = run(['diff'], author);
    writeFileSync(join(author, 'firmware-queue/patches-tmp.patch'), `${patch}\n`);
    run(['checkout', '--', 'carried.txt'], author);
    execFileSync('mkdir', ['-p', join(author, 'firmware-queue/patches')]);
    execFileSync('mv', [
      join(author, 'firmware-queue/patches-tmp.patch'),
      join(author, 'firmware-queue/patches/trivial.patch'),
    ]);
    park(author, {
      id: 'trivial',
      what: 'A trivial parked change.',
      why: 'Not worth a card update on its own.',
      added: '2026-08-21',
      source: { kind: 'patch', patch: 'firmware-queue/patches/trivial.patch' },
    });

    const owner = clone(root, upstream, 'owner');
    const result = queue(owner, ['release']);
    assert.match(result.stdout, /now in one pull request|not be opened automatically/);

    // The pushed release branch is the only thing that matters.
    run(['fetch', '--quiet', 'origin'], owner);
    const branch = 'origin/firmware-release/1.2.4';
    assert.equal(run(['show', `${branch}:firmware/lightweaver-controller/VERSION`], owner), '1.2.4');
    assert.equal(run(['show', `${branch}:carried.txt`], owner), 'after');
    assert.match(
      run(['show', `${branch}:firmware/lightweaver-controller/tests/firmware-version-policy.mjs`], owner),
      /'1\.2\.4'/,
    );
    assert.deepEqual(
      JSON.parse(run(['show', `${branch}:firmware-queue/queue.json`], owner)).waiting,
      [],
    );
    // The consumed patch is gone, so it can never be applied twice.
    assert.equal(
      spawnSync('git', ['cat-file', '-e', `${branch}:firmware-queue/patches/trivial.patch`], { cwd: owner }).status !== 0,
      true,
    );
    // The tree the owner ran it from is untouched.
    assert.equal(run(['status', '--porcelain'], owner), '');
    assert.equal(run(['rev-parse', '--abbrev-ref', 'HEAD'], owner), 'main');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a parked change that no longer applies stops loudly and leaves nothing behind', () => {
  const { root, upstream } = buildSandbox();
  try {
    const author = clone(root, upstream, 'author');
    execFileSync('mkdir', ['-p', join(author, 'firmware-queue/patches')]);
    writeFileSync(
      join(author, 'firmware-queue/patches/stale.patch'),
      [
        'diff --git a/carried.txt b/carried.txt',
        'index 0000000..1111111 100644',
        '--- a/carried.txt',
        '+++ b/carried.txt',
        '@@ -1 +1 @@',
        '-a line that is not in the file any more',
        '+something else',
        '',
      ].join('\n'),
    );
    park(author, {
      id: 'stale',
      what: 'A change that the project has moved past.',
      why: 'Not worth a card update on its own.',
      added: '2026-08-21',
      source: { kind: 'patch', patch: 'firmware-queue/patches/stale.patch' },
    });

    const owner = clone(root, upstream, 'owner');
    const result = queue(owner, ['release']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Stopped\. Nothing was changed\./);
    assert.match(result.stderr, /A change that the project has moved past\./);
    assert.match(result.stderr, /nothing was left half-done/);
    assert.equal(run(['status', '--porcelain'], owner), '');
    assert.equal(run(['rev-parse', '--abbrev-ref', 'HEAD'], owner), 'main');
    assert.equal(run(['branch', '--list', 'firmware-release/*'], owner), '');
    assert.equal(run(['worktree', 'list'], owner).split('\n').length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a parked patch folds into the single release commit, not a commit of its own', () => {
  const { root, upstream } = buildSandbox();
  try {
    const author = clone(root, upstream, 'author');
    writeFileSync(join(author, 'carried.txt'), 'after\n');
    const patch = run(['diff'], author);
    run(['checkout', '--', 'carried.txt'], author);
    execFileSync('mkdir', ['-p', join(author, 'firmware-queue/patches')]);
    writeFileSync(join(author, 'firmware-queue/patches/trivial.patch'), `${patch}\n`);
    park(author, {
      id: 'trivial',
      what: 'A trivial parked change.',
      why: 'Not worth a card update on its own.',
      added: '2026-08-21',
      source: { kind: 'patch', patch: 'firmware-queue/patches/trivial.patch' },
    });

    const owner = clone(root, upstream, 'owner');
    queue(owner, ['release']);
    run(['fetch', '--quiet', 'origin'], owner);
    const commits = run(['rev-list', 'origin/main..origin/firmware-release/1.2.4'], owner).split('\n').filter(Boolean);
    assert.equal(commits.length, 1, 'one release commit, carrying everything');
    const touched = run(['show', '--name-only', '--format=', commits[0]], owner).split('\n').filter(Boolean).sort();
    assert.deepEqual(touched, [
      'carried.txt',
      'firmware-queue/patches/trivial.patch',
      'firmware-queue/queue.json',
      'firmware/lightweaver-controller/VERSION',
      'firmware/lightweaver-controller/tests/firmware-version-policy.mjs',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a competing release keeps both branches and offers inspection without assuming abandonment', () => {
  const { root, upstream } = buildSandbox();
  try {
    // The competing branch may have an active PR, a closed PR, or no PR at
    // all. Git's rejection cannot distinguish those ownership states.
    const colleague = clone(root, upstream, 'colleague');
    run(['checkout', '--quiet', '-b', 'firmware-release/1.2.4'], colleague);
    writeFileSync(join(colleague, 'carried.txt'), 'a competing release\n');
    run(['commit', '--quiet', '-am', 'release in progress'], colleague);
    run(['push', '--quiet', 'origin', 'firmware-release/1.2.4'], colleague);
    const remoteHead = run(['rev-parse', 'HEAD'], colleague);

    const author = clone(root, upstream, 'author');
    writeFileSync(join(author, 'carried.txt'), 'after\n');
    const patch = run(['diff'], author);
    run(['checkout', '--', 'carried.txt'], author);
    execFileSync('mkdir', ['-p', join(author, 'firmware-queue/patches')]);
    writeFileSync(join(author, 'firmware-queue/patches/trivial.patch'), `${patch}\n`);
    park(author, {
      id: 'trivial',
      what: 'A trivial parked change.',
      why: 'Not worth a card update on its own.',
      added: '2026-08-21',
      source: { kind: 'patch', patch: 'firmware-queue/patches/trivial.patch' },
    });

    const owner = clone(root, upstream, 'owner');
    const result = queue(owner, ['release']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Stopped\. Nothing was changed\./);
    assert.match(result.stderr, /existing branch is blocking version 1\.2\.4/);
    assert.match(result.stderr, /firmware-release\/1\.2\.4/);
    assert.match(result.stderr, /kept locally/);
    assert.match(result.stderr, /gh pr list --state all --head firmware-release\/1\.2\.4/);
    assert.doesNotMatch(result.stderr, /abandoned|--delete|force.push/i);
    // A raw git rejection line must not be the thing a person reads instead.
    assert.doesNotMatch(result.stderr, /non-fast-forward/);
    // Nothing was left half-done in the tree the owner ran it from.
    assert.equal(run(['status', '--porcelain'], owner), '');
    assert.equal(run(['rev-parse', '--abbrev-ref', 'HEAD'], owner), 'main');
    const localHead = run(['rev-parse', 'firmware-release/1.2.4'], owner);
    assert.equal(run(['show', 'firmware-release/1.2.4:carried.txt'], owner), 'after');
    assert.equal(run(['worktree', 'list'], owner).split('\n').length, 1);
    assert.equal(JSON.parse(readFileSync(join(owner, 'firmware-queue/queue.json'), 'utf8')).waiting.length, 1);
    // The competing release itself is untouched — it was never overwritten.
    run(['fetch', '--quiet', 'origin'], owner);
    assert.equal(run(['rev-parse', 'origin/firmware-release/1.2.4'], owner), remoteHead);
    assert.equal(
      run(['show', 'origin/firmware-release/1.2.4:carried.txt'], owner),
      'a competing release',
    );
    // A retry must not remove the branch retained for inspection.
    assert.notEqual(queue(owner, ['release']).status, 0);
    assert.equal(run(['rev-parse', 'firmware-release/1.2.4'], owner), localHead);
    assert.equal(run(['worktree', 'list'], owner).split('\n').length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a parked branch is merged in, and a branch that has vanished stops the run', () => {
  const { root, upstream } = buildSandbox();
  try {
    const author = clone(root, upstream, 'author');
    run(['checkout', '--quiet', '-b', 'parked-work'], author);
    writeFileSync(join(author, 'carried.txt'), 'from a branch\n');
    run(['commit', '--quiet', '-am', 'work on a branch'], author);
    run(['push', '--quiet', 'origin', 'parked-work'], author);
    run(['checkout', '--quiet', 'main'], author);
    park(author, {
      id: 'parked-work',
      what: 'A change that lives on a branch.',
      why: 'Not worth a card update on its own.',
      added: '2026-08-21',
      source: { kind: 'branch', branch: 'parked-work' },
    });

    const owner = clone(root, upstream, 'owner');
    assert.equal(queue(owner, ['release']).status !== 2, true);
    run(['fetch', '--quiet', 'origin'], owner);
    assert.equal(run(['show', 'origin/firmware-release/1.2.4:carried.txt'], owner), 'from a branch');
    assert.equal(run(['show', 'origin/firmware-release/1.2.4:firmware/lightweaver-controller/VERSION'], owner), '1.2.4');
    assert.deepEqual(
      JSON.parse(run(['show', 'origin/firmware-release/1.2.4:firmware-queue/queue.json'], owner)).waiting,
      [],
    );

    // Same list, but the branch is gone from the shared copy.
    const second = clone(root, upstream, 'second');
    run(['push', '--quiet', 'origin', '--delete', 'parked-work'], second);
    run(['push', '--quiet', 'origin', '--delete', 'firmware-release/1.2.4'], second);
    run(['reset', '--hard', '--quiet', 'HEAD~1'], second);
    run(['push', '--quiet', '--force', 'origin', 'main'], second);
    park(second, {
      id: 'parked-work',
      what: 'A change that lives on a branch.',
      why: 'Not worth a card update on its own.',
      added: '2026-08-21',
      source: { kind: 'branch', branch: 'parked-work' },
    });
    const third = clone(root, upstream, 'third');
    const gone = queue(third, ['release']);
    assert.notEqual(gone.status, 0);
    assert.match(gone.stderr, /has gone missing/);
    assert.match(gone.stderr, /A change that lives on a branch\./);
    assert.equal(run(['status', '--porcelain'], third), '');
    assert.equal(run(['branch', '--list', 'firmware-release/*'], third), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
