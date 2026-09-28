#!/usr/bin/env node
// Install a model-free, per-user observer from a content-addressed runtime.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RUNTIME_FILES = [
  'scripts/background-release.mjs',
  'scripts/background-release-proof.mjs',
  'lightweaver/src/lib/studioRelease.js',
  'lightweaver/src/lib/productionDeploymentCheck.js',
];
const packageBytes = Buffer.from('{"type":"module"}\n');
const xml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]);

export function launchAgentPlist(plan) {
  const args = [plan.nodePath, join(plan.runtimePath, 'scripts/background-release.mjs'),
    'resume', '--only-interrupted', '--state-dir', plan.stateDir];
  const items = args.map(value => `    <string>${xml(value)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>${xml(plan.label)}</string>\n  <key>ProgramArguments</key>\n  <array>\n${items}\n  </array>\n  <key>WorkingDirectory</key><string>${xml(plan.repoRoot)}</string>\n  <key>EnvironmentVariables</key>\n  <dict><key>PATH</key><string>${xml(plan.pathEnv)}</string></dict>\n  <key>RunAtLoad</key><true/>\n  <key>StartInterval</key><integer>300</integer>\n  <key>ProcessType</key><string>Background</string>\n</dict>\n</plist>\n`;
}

export async function buildInstallPlan({ checkoutRoot = sourceRoot, gitCommonDir, userHome = homedir(), nodePath = process.execPath, pathEnv = process.env.PATH || '' } = {}) {
  if (!isAbsolute(checkoutRoot) || !isAbsolute(gitCommonDir) || !isAbsolute(userHome) || !isAbsolute(nodePath)) {
    throw new Error('Checkout, Git common dir, home and Node executable must be absolute paths.');
  }
  const files = await Promise.all(RUNTIME_FILES.map(async path => ({ path, bytes: await readFile(join(checkoutRoot, path)) })));
  files.push({ path: 'lightweaver/package.json', bytes: packageBytes });
  const contentHash = createHash('sha256');
  for (const file of files) contentHash.update(file.path).update('\0').update(file.bytes).update('\0');
  const runtimeHash = contentHash.digest('hex');
  const repoRoot = dirname(gitCommonDir);
  const repoHash = createHash('sha256').update(repoRoot).digest('hex').slice(0, 12);
  const label = `com.mandalacodes.lightweaver.release.${repoHash}`;
  const stateDir = join(gitCommonDir, 'lightweaver-releases');
  const runtimePath = join(stateDir, 'runtime', runtimeHash);
  return {
    checkoutRoot, gitCommonDir, repoRoot, stateDir, runtimePath, runtimeHash,
    label, plistPath: join(userHome, 'Library', 'LaunchAgents', `${label}.plist`),
    nodePath, pathEnv, files,
  };
}

export async function writeRuntime(plan) {
  await mkdir(dirname(plan.runtimePath), { recursive: true, mode: 0o700 });
  const tempPath = `${plan.runtimePath}.${process.pid}.tmp`;
  await rm(tempPath, { recursive: true, force: true });
  await mkdir(tempPath, { recursive: true, mode: 0o700 });
  try {
    for (const file of plan.files) {
      const target = join(tempPath, file.path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, file.bytes, { mode: 0o600 });
    }
    try { await rename(tempPath, plan.runtimePath); }
    catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
    }
    for (const file of plan.files) {
      const copied = await readFile(join(plan.runtimePath, file.path));
      if (!copied.equals(file.bytes)) throw new Error(`Pinned runtime changed: ${file.path}`);
    }
  } finally { await rm(tempPath, { recursive: true, force: true }); }
}

function launchctl(args) {
  const result = spawnSync('launchctl', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

export async function installBackgroundRelease({ dryRun = false, platform = process.platform, uid = process.getuid?.(), ...options } = {}) {
  const plan = await buildInstallPlan(options);
  const publicPlan = {
    label: plan.label, plistPath: plan.plistPath, runtimePath: plan.runtimePath,
    stateDir: plan.stateDir, repoRoot: plan.repoRoot, intervalSeconds: 300,
  };
  if (dryRun) return { dryRun: true, ...publicPlan };
  if (platform !== 'darwin' || !Number.isInteger(uid)) throw new Error('A macOS per-user GUI session is required.');
  await writeRuntime(plan);
  await mkdir(dirname(plan.plistPath), { recursive: true, mode: 0o700 });
  await mkdir(plan.stateDir, { recursive: true, mode: 0o700 });
  const service = `gui/${uid}/${plan.label}`;
  if (launchctl(['print', service]).status === 0) {
    const bootout = launchctl(['bootout', service]);
    if (bootout.status !== 0) throw new Error(`Could not stop existing observer: ${bootout.stderr.trim()}`);
  }
  const plistTemp = `${plan.plistPath}.${process.pid}.tmp`;
  await writeFile(plistTemp, launchAgentPlist(plan), { mode: 0o644 });
  await rename(plistTemp, plan.plistPath);
  const bootstrap = launchctl(['bootstrap', `gui/${uid}`, plan.plistPath]);
  if (bootstrap.status !== 0) throw new Error(`Could not start release observer: ${bootstrap.stderr.trim()}`);
  const installRecord = { label: plan.label, plistPath: plan.plistPath, runtimePath: plan.runtimePath, stateDir: plan.stateDir };
  await writeFile(join(plan.stateDir, 'install.json'), `${JSON.stringify(installRecord, null, 2)}\n`, { mode: 0o600 });
  return { dryRun: false, ...publicPlan };
}

function commonGitDir() {
  const value = execFileSync('git', ['-C', sourceRoot, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return isAbsolute(value) ? value : resolve(sourceRoot, value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === '--dry-run')) {
    process.stderr.write('Usage: install-background-release.mjs [--dry-run]\n');
    process.exitCode = 2;
  } else {
    installBackgroundRelease({ dryRun: args[0] === '--dry-run', checkoutRoot: sourceRoot, gitCommonDir: commonGitDir() })
      .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  }
}
