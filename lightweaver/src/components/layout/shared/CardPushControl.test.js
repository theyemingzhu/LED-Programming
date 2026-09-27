import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeCardProjectEvidence } from '../../../lib/cardIdentity.js';
import { correlateCardDeploymentReadinessEvidence, waitForCardDeploymentVerification } from '../../../lib/cardDeployment.js';

const source = await readFile(new URL('./CardPushControl.jsx', import.meta.url), 'utf8');

test('cached retry and candidate mutations revalidate the prepared project transaction', () => {
  assert.match(source, /assertCurrentAttempt\(attempt\)[\s\S]*pushConfigToCard/);
  assert.match(source, /assertCurrentAttempt\(wiringCandidate\.attempt\)[\s\S]*activateAndWaitForCardWiring/);
  assert.match(source, /if \(visible\)[\s\S]*assertCurrentAttempt\(wiringCandidate\.attempt\)[\s\S]*confirmCardWiringCandidate/);
  assert.match(source, /else \{[\s\S]*assertCurrentAttempt\(wiringCandidate\.attempt\)[\s\S]*rollbackCardWiringCandidate/);
});

test('final card verification combines project identity with fresh runtime readiness', () => {
  assert.match(source, /readReadyDeploymentEvidence/);
  assert.match(source, /readCardProjectEvidence/);
  assert.match(source, /readCardStatusEnvelope/);
});

test('a resumed or expiring wiring test re-reads the exact card and clears stale confirmation controls', () => {
  assert.match(source, /resume-physical-test[\s\S]*expiresAt/);
  assert.match(source, /wiringTestState !== 'testing'[\s\S]*getCardWiringStatus/);
  assert.match(source, /status\.cardId === expectedCardId/);
  assert.match(source, /setWiringCandidate\(null\)[\s\S]*dispatchAction\(\{ type: 'fail'/);
});

// Captured from the paired GPIO 18 / 41-pixel card after its successful
// reboot. These are the identity and readiness fields from its real
// /api/firmware-info and /api/status responses (boot-ba0b2420).
const installedCard = {
  app: 'Lightweaver', cardId: 'lw-b0fe81f61b44', firmwareVersion: '1.1.47',
  buildId: '8c45aa2a2bf97acdfd73cc318d86d71fc51bb6ac',
  bootId: 'boot-ba0b2420-b0fe81f61b44', projectRevision: 1,
  projectFingerprint: '5114901f1ff2db01f25fc15b660464e95114901f1ff2db01f25fc15b660464e9',
  outputs: [{ pin: 18, pixels: 41 }], knownGoodProject: true,
  commandReady: true, runtimePhase: 'ready', playbackReady: true, outputReady: true,
};

test('verified reboot readback remains installed when Studio changes, and Retry never resends an inconclusive write', async () => {
  const project = normalizeCardProjectEvidence(installedCard);
  const status = { ...installedCard };
  const prepared = { cardId: installedCard.cardId, config: {
    projectRevision: installedCard.projectRevision,
    projectFingerprint: installedCard.projectFingerprint,
  } };
  const readEvidence = async () => ({ ...correlateCardDeploymentReadinessEvidence(project, status), readiness: status });
  const verified = await waitForCardDeploymentVerification(prepared, { readEvidence, attempts: 1, requireReady: true });
  assert.equal(verified.ok, true);

  // Exercise the component's actual post-POST decision and Retry functions
  // with injected card I/O, so no browser, hardware, or duplicate write runs.
  const installStart = source.indexOf('      let verification;');
  const installEnd = source.indexOf('\n    } catch (err) {', installStart);
  const retryStart = source.indexOf('  const retryAfterCardRestart = async () => {');
  const retryEnd = source.indexOf('\n  const startWiringTest = async () => {', retryStart);
  assert.ok(installStart > 0 && installEnd > installStart && retryStart > 0 && retryEnd > retryStart);

  const actions = [];
  const statuses = [];
  const failedAttemptRef = { current: null };
  let localGeneration = 3;
  let postCount = 1; // the one already accepted /api/config POST
  const attempt = { host: 'lightweaver.local', revision: 1, generation: 3, zoneCount: 1, prepared };
  const changedError = Object.assign(new Error('Studio project changed'), { reason: 'project-changed' });
  const deps = {
    attempt, response: { requiresReboot: true }, cleanHost: attempt.host,
    failedAttemptRef, standaloneController: {}, onInstalled: () => {},
    setPushStatus: value => statuses.push(value), setInstallRestarting: () => {},
    dispatchAction: value => actions.push(value), markProjectInstalled: () => assert.fail('stale local project was marked installed'),
    markCardLookConfirmed: () => assert.fail('stale local project was confirmed'),
    waitForReadyDeploymentVerification: async () => ({ verification: verified }),
    publishVerifiedReadiness: async () => { localGeneration += 1; },
    assertCurrentAttempt: () => { if (localGeneration !== attempt.generation) throw changedError; },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(...Object.keys(deps), source.slice(installStart, installEnd))(...Object.values(deps));
  assert.equal(postCount, 1);
  assert.equal(failedAttemptRef.current.cardVerified, true);
  assert.equal(failedAttemptRef.current.verifyReason, 'project-changed');
  assert.match(statuses.at(-1), /Installed revision 1 on the card, but the Studio project changed/);
  assert.doesNotMatch(statuses.at(-1), /does not hold this project|Confirmed revision 0/);

  const retryDeps = {
    ...deps,
    actionLabel: 'Install on card',
    pushToCard: async () => { postCount += 1; },
    readReadyDeploymentEvidence: readEvidence,
    waitForCardDeploymentVerification,
  };
  const retry = new Function(...Object.keys(retryDeps), `${source.slice(retryStart, retryEnd)}\nreturn retryAfterCardRestart;`)(...Object.values(retryDeps));
  await retry();
  assert.equal(postCount, 1);
  assert.equal(failedAttemptRef.current.verifyReason, 'project-changed');
  assert.match(statuses.at(-1), /Studio project changed/);

  // The first Retry can obtain exact proof and then fail while publishing.
  // Its stored attempt must retain that new proof for later offline reads.
  failedAttemptRef.current = { ...attempt, awaitingRestartConfirmation: true, cardVerified: false };
  await retry();
  assert.equal(failedAttemptRef.current.cardVerified, true);
  assert.equal(postCount, 1);

  // Offline or missing readiness is also inconclusive, including after a
  // prior exact readback. It cannot turn Retry into another POST.
  retryDeps.waitForCardDeploymentVerification = async () => { throw Object.assign(new Error('offline'), { reason: 'read-back-missing' }); };
  const offlineRetry = new Function(...Object.keys(retryDeps), `${source.slice(retryStart, retryEnd)}\nreturn retryAfterCardRestart;`)(...Object.values(retryDeps));
  await offlineRetry();
  assert.equal(postCount, 1);
  assert.match(statuses.at(-1), /read-back-missing/);
  assert.equal(actions.at(-1).type, 'fail');

  failedAttemptRef.current = { ...attempt, awaitingRestartConfirmation: true, cardVerified: false };
  await offlineRetry();
  assert.equal(postCount, 1);
  assert.match(statuses.at(-1), /use Install on card to start a new send/);
});
