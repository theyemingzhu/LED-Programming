#!/usr/bin/env node
// Repair the exact optional binding requested by the installed Rollup loader.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodeToolEnvironment, resolveNodeToolCommand } from '../../scripts/node-tool-command.mjs';

const require = createRequire(import.meta.url);

export function missingRollupNativePackage(error, optionalDependencies) {
  for (let cause = error; cause; cause = cause.cause) {
    if (cause.code !== 'MODULE_NOT_FOUND') continue;
    const name = /^Cannot find module '(@rollup\/rollup-[a-z0-9-]+)'/.exec(cause.message)?.[1];
    const version = name && optionalDependencies[name];
    if (typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) return { name, version };
  }
  return null;
}

export function ensureRollupNative() {
  const rollup = require('rollup/package.json');
  try {
    require('rollup');
    console.log('[ensure-rollup-native] Installed Rollup native binding is ready.');
    return;
  } catch (error) {
    const missing = missingRollupNativePackage(error, rollup.optionalDependencies || {});
    if (!missing) throw error;
    const dependency = `${missing.name}@${missing.version}`;
    console.log(`[ensure-rollup-native] Installing missing ${dependency} without changing the lockfile.`);
    const invocation = resolveNodeToolCommand('npm', ['install', '--no-save', '--package-lock=false', dependency]);
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit',
      env: nodeToolEnvironment(), windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Native Rollup dependency installation failed (${result.status ?? result.signal}).`);
    require('rollup');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { ensureRollupNative(); }
  catch (error) { console.error(`[ensure-rollup-native] ${error.message}`); process.exitCode = 1; }
}
