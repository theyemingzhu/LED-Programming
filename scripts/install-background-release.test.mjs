import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { buildInstallPlan, installBackgroundRelease, launchAgentPlist, RUNTIME_FILES, writeRuntime } from './install-background-release.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'release installer & '));
  const checkoutRoot = join(root, 'checkout & <work>');
  const gitCommonDir = join(root, 'stable repo & <main>', '.git');
  const userHome = join(root, 'home & <user>');
  for (const path of RUNTIME_FILES) {
    const file = join(checkoutRoot, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `// ${path}\n`);
  }
  return { root, checkoutRoot, gitCommonDir, userHome, nodePath: '/opt/node & <test>/bin/node', pathEnv: '/opt/bin & <test>:/usr/bin' };
}

test('plist invokes pinned Node and runtime directly on a five-minute per-user schedule', async () => {
  const plan = await buildInstallPlan(await fixture());
  const plist = launchAgentPlist(plan);
  assert.match(plist, /<key>StartInterval<\/key><integer>300<\/integer>/);
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(plist, /<key>ProgramArguments<\/key>/);
  assert.match(plist, /<string>resume<\/string>/);
  assert.match(plist, /<string>--only-interrupted<\/string>/);
  assert.match(plist, /<string>--only-interrupted<\/string>\n    <string>--state-dir<\/string>/);
  assert.match(plist, /<string>--state-dir<\/string>/);
  assert.match(plist, /<string>\/opt\/node &amp; &lt;test&gt;\/bin\/node<\/string>/);
  assert.match(plist, /<key>WorkingDirectory<\/key><string>.*stable repo &amp; &lt;main&gt;<\/string>/);
  assert.match(plist, /<key>PATH<\/key><string>\/opt\/bin &amp; &lt;test&gt;:\/usr\/bin<\/string>/);
  assert.doesNotMatch(plist, /(?:sh -c|bash|codex|claude|TOKEN|SECRET)/i);
});

test('dry run plans paths without writing the runtime or plist', async () => {
  const paths = await fixture();
  const plan = await installBackgroundRelease({ ...paths, dryRun: true, platform: 'linux' });
  assert.equal(plan.dryRun, true);
  assert.match(plan.label, /^com\.mandalacodes\.lightweaver\.release\.[a-f0-9]{12}$/);
  assert.match(plan.runtimePath, /lightweaver-releases\/runtime\/[a-f0-9]{64}$/);
  assert.equal(plan.plistPath, join(paths.userHome, 'Library', 'LaunchAgents', `${plan.label}.plist`));
  await assert.rejects(readFile(plan.plistPath), { code: 'ENOENT' });
  await assert.rejects(readFile(join(plan.runtimePath, 'lightweaver/package.json')), { code: 'ENOENT' });
});

test('runtime snapshot copies exact import tree and refuses changed bytes at the same hash', async () => {
  const paths = await fixture();
  const plan = await buildInstallPlan(paths);
  await writeRuntime(plan);
  for (const path of RUNTIME_FILES) {
    assert.deepEqual(await readFile(join(plan.runtimePath, path)), await readFile(join(paths.checkoutRoot, path)));
  }
  assert.equal(JSON.parse(await readFile(join(plan.runtimePath, 'lightweaver/package.json'), 'utf8')).type, 'module');
  await writeFile(join(plan.runtimePath, RUNTIME_FILES[0]), 'tampered');
  await assert.rejects(writeRuntime(plan), /Pinned runtime changed/);
});

test('a source byte change produces a new runtime path but retains one stable job label', async () => {
  const paths = await fixture();
  const before = await buildInstallPlan(paths);
  await writeFile(join(paths.checkoutRoot, RUNTIME_FILES[0]), 'changed observer');
  const after = await buildInstallPlan(paths);
  assert.notEqual(after.runtimePath, before.runtimePath);
  assert.equal(after.label, before.label);
});
