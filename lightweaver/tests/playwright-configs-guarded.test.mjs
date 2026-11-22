// Every Playwright config in the repo loads, and every one that can reach a
// card carries the network guard (tests/harness/networkGuard.ts).
//
// Why: PR #452's guard used a relative globalTeardown path. Four configs that
// spread the root config from tests/ resolved it from their own folder and
// failed to load at all. Configs are found from git, so a new one is checked
// the day it is added. Uses `playwright test --list` only: no browser starts.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lightweaver = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(lightweaver, '..');

const tracked = spawnSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).stdout.split('\n')
  .filter(file => /(^|\/)[^/]*playwright[^/]*\.config\.(ts|js|mjs|cjs)$/.test(file));

// The repo-root config drives the led-art-mapper tests in e2e/ from a CommonJS
// package that cannot import the guard (an ES module). It is exempt only while
// those tests never name a card address.
const EXEMPT = { 'playwright.config.ts': 'e2e/' };

// The guard must be ON for the listing, and node:test's own context variable
// must not leak into the child: Playwright loads *.test.mjs files under the
// root config, and with it set they stream node:test protocol into stdout.
const childEnv = { ...process.env, LW_ALLOW_PHYSICAL_CARD: '' };
delete childEnv.NODE_TEST_CONTEXT;

const CARD_ADDRESS = /192\.168\.|10\.\d+\.\d+\.\d+|lightweaver\.local|\.local\b/;

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

test('the configs were found', () => {
  assert.ok(tracked.filter(f => f.startsWith('lightweaver/')).length >= 11, `found only ${tracked.length} configs`);
});

describe('every Playwright config', { concurrency: 4 }, () => {
for (const file of tracked) {
  if (EXEMPT[file]) {
    test(`${file} is exempt only while ${EXEMPT[file]} names no card address`, () => {
      const hits = filesUnder(path.join(repo, EXEMPT[file]))
        .filter(f => /\.(ts|js|mjs)$/.test(f))
        .filter(f => CARD_ADDRESS.test(readFileSync(f, 'utf8')));
      assert.deepEqual(hits, [], `these tests name a card address, so ${file} needs the network guard`);
    });
    continue;
  }
  test(`${file} loads and carries the network guard`, async () => {
    const cwd = path.join(repo, path.dirname(file).split('/')[0] === 'lightweaver' ? 'lightweaver' : '.');
    // Local playwright binary: no npx lookup per config.
    const bin = path.join(lightweaver, 'node_modules', '.bin', 'playwright');
    const run = await execFileAsync(bin, ['test', '-c', path.join(repo, file), '--list', '--reporter=json'], {
      cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: childEnv,
    }).catch(error => ({ stdout: error.stdout || '', stderr: error.stderr || String(error) }));
    let report;
    // The root config also collects node:test files, which print TAP on load;
    // the Playwright report is the JSON object that starts with "config".
    const start = run.stdout.indexOf('{\n  "config"');
    try { report = JSON.parse(start >= 0 ? run.stdout.slice(start) : run.stdout); } catch {
      assert.fail(`${file} did not load:\n${(run.stderr || run.stdout).slice(0, 1500)}`);
    }
    assert.deepEqual((report.errors || []).map(e => e.message), [], `${file} reported errors`);
    assert.match(String(report.config.globalTeardown || ''), /networkGuard\.ts$/, `${file}: globalTeardown is not the guard`);
    for (const project of report.config.projects) {
      assert.ok((project.testIgnore || []).includes('**/live-*.spec.ts'), `${file} project ${project.name}: live-hardware specs are collected`);
    }
    // launchOptions are not in the JSON report: check the config chain names them.
    const text = readFileSync(path.join(repo, file), 'utf8');
    const spreads = /\.\.\.(base|matrix|isolation)\b/.test(text);
    assert.ok(spreads || text.includes('launchOptions: guardLaunchOptions'),
      `${file} sets its own use but not launchOptions: guardLaunchOptions`);
    if (spreads && /\n  use:\s*\{/.test(text)) {
      assert.ok(text.includes('guardLaunchOptions') || /\.\.\.(base|matrix|isolation)\.use/.test(text),
        `${file} replaces use without keeping the guard's launchOptions`);
    }
  });
}
});
