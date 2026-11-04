import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { release as osRelease } from 'node:os';

const exec = promisify(execFile);
export const CHECK_PLAN_VERSION = 1;
const sha256 = value => createHash('sha256').update(value).digest('hex');
// The only narrowed group is audited: imports stay within installer-core;
// its tests additionally read release fixtures and the pinned public key.
const PURE_INPUTS = new Map([
  ['node --test ../packages/installer-core/test/*.test.js', [
    'packages/installer-core', 'release/test-vectors', 'release/keys/lightweaver-release-public.pem',
  ]],
]);
// Audited Node test suites create fixtures only in temporary directories or
// mocks; no later release stage consumes their outputs. Exact whole-tree keys
// intentionally invalidate these groups on any tracked change. Commands are
// pinned here: changing a package script requires a new cache eligibility audit.
const PURE_WHOLE_TREE_COMMANDS = new Set([
  "node --test src/lib/*.test.js src/scene-expression/*.test.js tests/ci-changed-lanes.test.mjs tests/mandala-engine.mjs tests/mandala-engine-transients.mjs ../scripts/color-journey-shared.test.mjs ../scripts/development-workflow.test.mjs ../scripts/node-tool-command.test.mjs scripts/ensure-rollup-native.test.mjs", // test:unit
  "node --test src/lib/productionDeploymentCheck.test.js src/lib/productionReleaseGate.test.js", // test:prod-deploy
  "node --test scripts/generate-studio-build-graph.test.mjs", // test:build-graph
  "node --test src/lib/studioRelease.test.js scripts/studio-release-identity.test.mjs scripts/studio-release-vite.test.mjs", // test:studio-release
  "node --test functions/api/firmware/update-grant.test.js scripts/check-firmware-update-service.test.mjs functions/api/library/_shared/accountAuth.test.js functions/api/library/library-api.test.js tests/cloud-bindings.mjs src/lib/cloudLibraryClient.test.js src/lib/libraryBackup.test.js src/lib/workspaceAssets.test.js", // test:projects
  "node --test scripts/client-release.test.mjs tests/owner-studio.test.mjs", // test:client-release
  "node --test src/client/*.test.js", // test:client
  "node --test ../scripts/background-release*.test.mjs ../scripts/release-controller.test.mjs ../scripts/release-queue.test.mjs ../scripts/release-check-plan.test.mjs ../scripts/release-events.test.mjs ../scripts/install-background-release.test.mjs ../scripts/release-receipt.test.mjs ../scripts/ci-changed-lanes.test.mjs", // test:background-release
]);
const GLOBAL_INPUTS = ['scripts', 'lightweaver/scripts', '.github'];
const within = (path, prefix) => prefix === '.' || path === prefix || path.startsWith(`${prefix}/`);
const globalInput = path => GLOBAL_INPUTS.some(prefix => within(path, prefix))
  || /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|\.npmrc|\.nvmrc|\.node-version)$/.test(path)
  || /(?:^|\/)[^/]*config[^/]*$/.test(path);

// Split only an ordinary top-level && chain. More complex shell syntax remains
// intact so an unfamiliar command cannot silently lose execution semantics.
function chain(command) {
  let quote = '', escape = false, start = 0;
  const parts = [];
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && quote !== "'") { escape = true; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if ('();`\n'.includes(c) || c === '|' || c === '<' || c === '>') return [command.trim()];
    if (c === '&') {
      if (command[i + 1] !== '&') return [command.trim()];
      parts.push(command.slice(start, i).trim()); start = ++i + 1;
    }
  }
  if (quote || escape) throw new Error('Unterminated shell quoting in release check');
  parts.push(command.slice(start).trim());
  if (parts.some(part => !part)) throw new Error('Empty command in release check chain');
  if (parts.some(part => /^(?:cd|export|unset|set|source|\.|exec)\s/.test(part))) return [command.trim()];
  return parts;
}

export function buildCheckPlan(packageScripts) {
  const seen = new Set(), checks = [];
  function expand(name, stack = []) {
    if (stack.includes(name)) throw new Error(`Release script cycle: ${[...stack, name].join(' -> ')}`);
    if (typeof packageScripts?.[name] !== 'string' || !packageScripts[name].trim()) throw new Error(`Missing release script: ${name}`);
    for (const command of chain(packageScripts[name])) {
      const nested = /^npm run ([A-Za-z0-9:_-]+)$/.exec(command);
      if (nested) { expand(nested[1], [...stack, name]); continue; }
      const cacheable = PURE_INPUTS.has(command) || PURE_WHOLE_TREE_COMMANDS.has(command);
      // Only audited pure checks can be skipped or deduplicated. Repeated build,
      // staging, installation or unknown commands may have necessary effects.
      if (cacheable && seen.has(command)) continue;
      const occurrence = checks.filter(check => check.command === command).length;
      seen.add(command);
      checks.push({ id: `check-${sha256(command)}${occurrence ? `-${occurrence + 1}` : ''}`,
        command, inputs: [...(PURE_INPUTS.get(command) || ['.'])], cacheable });
    }
  }
  expand('launch:check');
  return checks;
}

let runtimePromise;
async function runtime() {
  runtimePromise ||= exec('npm', ['--version'], { timeout: 20000 }).then(({ stdout }) => ({
    node: process.version, versions: process.versions, npm: stdout.trim(), platform: process.platform,
    arch: process.arch, osRelease: osRelease(),
  }));
  return runtimePromise;
}

export async function fingerprintCheck(root, check) {
  if (!check || typeof check.command !== 'string' || !check.command.trim()) throw new Error('Release check command required');
  // A caller cannot accidentally narrow an unknown command, or omit one of the
  // audited dependencies. Conservative extra inputs are allowed.
  const required = PURE_INPUTS.get(check.command) || ['.'];
  if (!Array.isArray(check.inputs) || !check.inputs.length || check.inputs.some(path =>
    typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').some(part => part === '..' || !part))) {
    throw new Error('Invalid release check inputs');
  }
  if (!required.every(path => check.inputs.some(prefix => within(path, prefix)))) throw new Error('Unsafe narrowed release check inputs');
  const { stdout } = await exec('git', ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], {
    cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
  });
  const entries = stdout.toString('utf8').split('\0').filter(Boolean).filter(entry => {
    const path = entry.slice(entry.indexOf('\t') + 1);
    return globalInput(path) || check.inputs.some(prefix => within(path, prefix));
  });
  // Git tree records include path, type, mode and the content-addressed object
  // ID. They include additions/deletions without reading untracked local files.
  return sha256(JSON.stringify({ version: CHECK_PLAN_VERSION, command: check.command,
    inputs: [...check.inputs].sort(), runtime: await runtime(), entries }));
}
