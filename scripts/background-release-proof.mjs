#!/usr/bin/env node
// Independent, model-free proof. Never rebuild or read the developer's dist:
// the exact deploy run supplies its staged graph in an immutable Actions artifact.
import { createHash, webcrypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseStudioRelease } from '../lightweaver/src/lib/studioRelease.js';
import { assertStudioRoot, verifyStudioRelease, verifyStudioBuildGraph, parseStudioBuildGraph } from '../lightweaver/src/lib/productionDeploymentCheck.js';

import { verifyClientOrigin } from '../lightweaver/scripts/client-release.mjs';

const ORIGIN = 'https://led.mandalacodes.com';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
function check(value, message) { if (!value) throw new Error(message); }
function superseded() { return Object.assign(new Error('Main advanced; this candidate cannot be reported as the current live release.'), { superseded: true }); }
function validPath(path) {
  return typeof path === 'string' && path.startsWith('firmware/')
    && /^[A-Za-z0-9._/-]+$/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');
}
export async function verifyProofBundle({ directory, revision, runId, runAttempt, currentMain, repo = 'theyemingzhu/LED-Programming', fetchImpl = fetch }) {
  check(/^[a-f0-9]{40}$/.test(revision), 'Exact release revision required');
  if (await currentMain() !== revision) throw superseded();
  const receipt = await json(join(directory, 'receipt.json'));
  check(receipt.schemaVersion === 1 && receipt.revision === revision
    && String(receipt.runId) === String(runId) && String(receipt.runAttempt) === String(runAttempt), 'Release receipt identity does not match the exact deploy run');
  check(receipt.credentialedPublish === true && receipt.liveProofPassed === true, 'Release needs a credentialed publish and passing strict live proof');
  check(receipt.shipped === true && receipt.reason === null && receipt.workflow === 'Deploy site'
    && receipt.repository?.toLowerCase() === repo.toLowerCase(), 'Receipt did not prove the canonical release');
  const marker = parseStudioRelease(await readFile(join(directory, 'studio-release.json'), 'utf8'));
  check(marker.sourceRevision === revision && marker.buildNumber === receipt.studioBuildNumber, 'Staged Studio identity does not match receipt');
  const studioGraph = parseStudioBuildGraph(await readFile(join(directory, 'studio-build-graph.json'), 'utf8'));
  const firmware = await json(join(directory, 'firmware/release-manifest.json'));
  const firmwareGraphBytes = await readFile(join(directory, 'firmware/release-build-graph.json'));
  const firmwareGraph = JSON.parse(firmwareGraphBytes.toString('utf8'));
  check(Number.isSafeInteger(receipt.firmwareBuildNumber) && receipt.firmwareBuildNumber > 0
    && firmware.buildNumber === receipt.firmwareBuildNumber && firmwareGraph.buildNumber === firmware.buildNumber
    && firmwareGraph.buildId === firmware.buildId && firmwareGraph.firmwareVersion === firmware.firmwareVersion,
  'Staged firmware identity does not match receipt');
  check(firmwareGraph.schemaVersion === 1 && Array.isArray(firmwareGraph.files) && firmwareGraph.files.length > 0, 'Firmware graph is missing');
  const paths = new Set();
  for (const entry of firmwareGraph.files) {
    check(validPath(entry.path) && !paths.has(entry.path) && Number.isSafeInteger(entry.size)
      && entry.size > 0 && /^[a-f0-9]{64}$/.test(entry.sha256), 'Invalid firmware graph descriptor');
    paths.add(entry.path);
  }
  for (const path of ['firmware/release-manifest.json', 'firmware/release-manifest.sig']) {
    const entry = firmwareGraph.files.find(file => file.path === path);
    const bytes = await readFile(join(directory, path));
    check(entry && bytes.length === entry.size && sha256(bytes) === entry.sha256, 'Staged firmware metadata does not match graph');
  }
  const checkedFetch = async (url, init = {}) => {
    check(new URL(url).origin === ORIGIN, 'Proof request escaped the canonical production origin');
    return fetchImpl(url, { ...init, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(20000) });
  };
  await verifyStudioRelease(checkedFetch, `${ORIGIN}/studio-release.json`, marker);
  const rootBytes = await assertStudioRoot(await checkedFetch(`${ORIGIN}/`), `${ORIGIN}/`);
  await verifyStudioBuildGraph(checkedFetch, webcrypto, `${ORIGIN}/studio-build-graph.json`, studioGraph, rootBytes);
  const graphResponse = await checkedFetch(`${ORIGIN}/firmware/release-build-graph.json`);
  check(graphResponse.status === 200 && sha256(Buffer.from(await graphResponse.arrayBuffer())) === sha256(firmwareGraphBytes), 'Live firmware graph mismatch');
  for (const entry of firmwareGraph.files) {
    const response = await checkedFetch(`${ORIGIN}/${entry.path}`);
    check(response.status === 200, `Live firmware artifact unavailable: ${entry.path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    check(bytes.length === entry.size && sha256(bytes) === entry.sha256, `Live firmware asset mismatch: ${entry.path}`);
  }
  // This closes the race where another release merges while we fetch assets.
  if (await currentMain() !== revision) throw superseded();
  if (receipt.clientRequired) {
    check(receipt.clientBuildNumber === marker.buildNumber, 'Client build differs from exact Studio revision');
    const client = await verifyClientOrigin('https://light.mandalacodes.com', join(directory, 'client'), {
      fetchImpl: (url, init) => fetchImpl(url, { ...init, signal: AbortSignal.timeout(20000) }),
    });
    check(client.sourceRevision === revision && client.buildNumber === receipt.clientBuildNumber, 'Client identity does not match receipt');
    if (await currentMain() !== revision) throw superseded();
  }
  return { ok: true, revision, studioBuildNumber: marker.buildNumber, firmwareBuildNumber: firmware.buildNumber,
    ...(receipt.clientRequired ? { clientBuildNumber: receipt.clientBuildNumber } : {}) };
}
function gh(args) {
  try { return execFileSync('gh', args, { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw Object.assign(new Error('GitHub proof request failed; authentication or connectivity needs attention.'), { retryable: true }); }
}
export async function runProof(args) {
  const flags = new Map();
  for (let i = 0; i < args.length; i += 2) {
    check(['--revision', '--state-dir', '--repo', '--run-id', '--run-attempt'].includes(args[i]) && args[i + 1], 'Unknown or incomplete proof option');
    flags.set(args[i], args[i + 1]);
  }
  const revision = flags.get('--revision'), repo = flags.get('--repo');
  const runId = flags.get('--run-id'), runAttempt = flags.get('--run-attempt');
  check(/^[a-f0-9]{40}$/.test(revision || '') && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '')
    && /^\d+$/.test(runId || '') && /^\d+$/.test(runAttempt || '') && flags.get('--state-dir'), 'Exact revision, repository, run identity and state directory required');
  const run = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${runId}/attempts/${runAttempt}`]));
  check(run.path === '.github/workflows/deploy-site.yml' && run.status === 'completed' && run.conclusion === 'success'
    && String(run.run_attempt) === runAttempt && run.repository?.full_name?.toLowerCase() === repo.toLowerCase(), 'Only a successful canonical deploy run can supply proof');
  const proofRoot = resolve(flags.get('--state-dir'), 'proofs');
  await mkdir(proofRoot, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(proofRoot, `${runId}-${runAttempt}-`));
  gh(['run', 'download', runId, '--repo', repo, '--name', `release-proof-${runId}-${runAttempt}`, '--dir', directory]);
  const currentMain = async () => JSON.parse(gh(['api', `repos/${repo}/git/ref/heads/main`])).object.sha;
  const result = await verifyProofBundle({ directory, revision, runId, runAttempt, currentMain, repo });
  const output = join(proofRoot, `${revision}.json`);
  await writeFile(`${output}.tmp`, `${JSON.stringify({ ...result, runId, runAttempt, proofDirectory: directory, verifiedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  await rename(`${output}.tmp`, output);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await runProof(process.argv.slice(2)))}\n`); }
  catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: error.message, superseded: error.superseded === true,
      retryable: error.retryable === true || error instanceof TypeError || error.name === 'TimeoutError' })}\n`);
    process.exitCode = 1;
  }
}
