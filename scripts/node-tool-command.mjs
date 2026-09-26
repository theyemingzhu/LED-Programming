import { existsSync } from 'node:fs';
import { dirname, delimiter, win32 } from 'node:path';

// Use npm's JS entry point on Windows so filters/paths remain literal arguments.
export function resolveNodeToolCommand(command, args, {
  platform = process.platform, nodePath = process.execPath, env = process.env,
  exists = existsSync,
} = {}) {
  if (command === 'node') return { command: nodePath, args };
  if (command !== 'npm' || platform !== 'win32') return { command, args };
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  const candidates = [
    env.npm_execpath,
    ...[win32.dirname(nodePath), ...pathValue.split(';')]
      .filter(Boolean).map(directory => win32.join(directory.replace(/^"|"$/g, ''), 'node_modules/npm/bin/npm-cli.js')),
  ];
  const cli = candidates.find(candidate => candidate && win32.basename(candidate) === 'npm-cli.js' && exists(candidate));
  if (!cli) throw new Error('Cannot find npm-cli.js; install Node.js with npm and put it on PATH.');
  return { command: nodePath, args: [cli, ...args] };
}

export function nodeToolEnvironment() {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = `${dirname(process.execPath)}${delimiter}${env[pathKey] || ''}`;
  return env;
}
