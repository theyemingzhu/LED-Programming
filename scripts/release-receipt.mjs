import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECEIPT_FILES = [
  'studio-release.json',
  'studio-build-graph.json',
  'firmware/release-manifest.json',
  'firmware/release-manifest.sig',
  'firmware/release-build-graph.json',
];

const fullRevision = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const positiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const validStudioRelease = (value, revision) => value?.schemaVersion === 1
  && value.sourceRevision === revision
  && value.buildId === revision.slice(0, 12)
  && Number.isSafeInteger(value.buildNumber)
  && value.buildNumber > 0;

export function createReleaseReceipt(input) {
  const credentialedPublish = input.credentialsEnabled === 'true'
    && input.migrationOutcome === 'success'
    && input.publishOutcome === 'success';
  const liveProofPassed = credentialedPublish && input.freshnessOutcome === 'success';
  const missingFiles = RECEIPT_FILES.filter(path => !input.availableFiles.includes(path));
  const studioBuildNumber = input.studioRelease?.buildNumber ?? null;
  const firmwareBuildNumber = input.firmwareManifest?.buildNumber ?? null;
  let reason = null;

  if (!fullRevision(input.revision)) reason = 'invalid_revision';
  else if (input.credentialsEnabled !== 'true') reason = 'credentials_unavailable';
  else if (input.migrationOutcome !== 'success') reason = 'migration_failed';
  else if (input.publishOutcome !== 'success') reason = 'publish_failed';
  else if (input.freshnessOutcome !== 'success') reason = 'live_proof_failed';
  else if (missingFiles.length) reason = 'staged_artifacts_missing';
  else if (input.studioRelease?.sourceRevision !== input.revision) reason = 'staged_revision_mismatch';
  else if (!validStudioRelease(input.studioRelease, input.revision)
    || Number(studioBuildNumber) !== Number(input.expectedStudioBuildNumber)) reason = 'studio_build_mismatch';
  else if (!Number.isSafeInteger(firmwareBuildNumber) || firmwareBuildNumber < 1) reason = 'firmware_build_missing';
  else if (!fullRevision(input.currentMainRevision)) reason = 'main_unavailable';
  else if (input.currentMainRevision !== input.revision) reason = 'main_changed';
  else if (input.workflow !== 'Deploy site' || !input.repository || !positiveInteger(input.runId)
    || !positiveInteger(input.runAttempt)) reason = 'workflow_identity_missing';

  return {
    schemaVersion: 1,
    repository: input.repository,
    workflow: input.workflow,
    revision: input.revision,
    studioBuildNumber: positiveInteger(studioBuildNumber) ? Number(studioBuildNumber) : null,
    firmwareBuildNumber: positiveInteger(firmwareBuildNumber) ? Number(firmwareBuildNumber) : null,
    runId: positiveInteger(input.runId) ? Number(input.runId) : null,
    runAttempt: positiveInteger(input.runAttempt) ? Number(input.runAttempt) : null,
    credentialedPublish,
    liveProofPassed,
    currentMainRevision: fullRevision(input.currentMainRevision) ? input.currentMainRevision : null,
    shipped: reason === null,
    reason,
    ...(missingFiles.length ? { missingFiles } : {}),
  };
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return null; }
}

export async function writeReleaseReceipt({ stagedRoot, outputDir, ...input }) {
  await mkdir(outputDir, { recursive: true });
  const availableFiles = [];
  for (const path of RECEIPT_FILES) {
    const source = join(stagedRoot, path);
    const target = join(outputDir, path);
    try {
      await mkdir(join(target, '..'), { recursive: true });
      await copyFile(source, target);
      availableFiles.push(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const receipt = createReleaseReceipt({
    ...input,
    availableFiles,
    studioRelease: await readJson(join(outputDir, 'studio-release.json')),
    firmwareManifest: await readJson(join(outputDir, 'firmware/release-manifest.json')),
  });
  await writeFile(join(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const receipt = await writeReleaseReceipt({
    stagedRoot: process.env.STAGED_ROOT,
    outputDir: process.env.RECEIPT_OUTPUT_DIR,
    repository: process.env.GITHUB_REPOSITORY,
    workflow: process.env.GITHUB_WORKFLOW,
    revision: process.env.DEPLOY_REVISION,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    credentialsEnabled: process.env.CREDENTIALS_ENABLED,
    migrationOutcome: process.env.MIGRATION_OUTCOME,
    publishOutcome: process.env.PUBLISH_OUTCOME,
    freshnessOutcome: process.env.FRESHNESS_OUTCOME,
    expectedStudioBuildNumber: process.env.EXPECTED_STUDIO_BUILD_NUMBER,
    currentMainRevision: process.env.CURRENT_MAIN_REVISION,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
