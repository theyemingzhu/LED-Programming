import test from 'node:test';
import assert from 'node:assert/strict';
import { deploySetupToCard, exactDeployedStatus, waitForCardOutputs } from './cardSetupDeploy.js';

const config = {
  piece: { id: 'piece' }, projectRevision: 4, projectFingerprint: 'fingerprint',
  led: { outputs: [
    { id: 'out1', pin: 16, pixels: 30, segments: [{ id: 'run-a', count: 30, direction: 'forward' }] },
    { id: 'out2', pin: 17, pixels: 20, segments: [{ id: 'run-b', count: 20, direction: 'reverse' }] },
  ] },
};
const installed = { cardId: 'card', projectId: 'piece', projectRevision: 4,
  projectFingerprint: 'fingerprint', provisionalSetup: false,
  outputs: structuredClone(config.led.outputs) };

test('same total on wrong GPIO, order or physical direction never verifies a final setup', async () => {
  assert.equal(exactDeployedStatus(config, installed, 'card'), true);
  const wrong = structuredClone(installed);
  wrong.outputs[0].pin = 18;
  assert.equal(exactDeployedStatus(config, wrong, 'card'), false);
  assert.equal(exactDeployedStatus(config, { ...installed, outputs: [...installed.outputs].reverse() }, 'card'), false);
  const reverse = structuredClone(installed);
  reverse.outputs[1].segments[0].direction = 'forward';
  assert.equal(exactDeployedStatus(config, reverse, 'card'), false);
  assert.equal(await waitForCardOutputs('card.local', config, { attempts: 1,
    expectedCardId: 'card', statusImpl: async () => wrong, sleepImpl: async () => {} }), null);
});

test('lost config reply is resolved by exact readback without a duplicate POST', async () => {
  let posts = 0;
  const result = await deploySetupToCard({ config }, 'card.local', {
    expectedCardId: 'card',
    reclaimImpl: async () => {}, waitForCardImpl: async () => true,
    clearDanglingImpl: async () => false,
    pushImpl: async () => { posts += 1; const error = new Error('reply lost'); error.name = 'AbortError'; throw error; },
    statusImpl: async () => structuredClone(installed),
    wiringStatusImpl: async () => ({ state: 'known-good', hasCandidate: false }),
    waitForOutputsImpl: async () => structuredClone(installed),
  });
  assert.equal(posts, 1);
  assert.equal(result.state, 'verified-after-lost-reply');
});

test('lost reply with unresolved wiring candidate stays recoverable and does not duplicate POST', async () => {
  let posts = 0;
  let wiringReads = 0;
  await assert.rejects(deploySetupToCard({ config }, 'card.local', {
    expectedCardId: 'card', reclaimImpl: async () => {}, waitForCardImpl: async () => true,
    clearDanglingImpl: async () => false,
    pushImpl: async () => { posts += 1; const error = new Error('reply lost'); error.name = 'AbortError'; throw error; },
    statusImpl: async () => ({ ...installed, projectFingerprint: 'previous' }),
    wiringStatusImpl: async () => (++wiringReads === 1
      ? { state: 'known-good', hasCandidate: false }
      : { state: 'staged', hasCandidate: true, activationId: 'candidate' }),
  }), /staged this setup/i);
  assert.equal(posts, 1);
});

test('matching staged candidate resumes activation and confirmation without posting again', async () => {
  const steps = [];
  const result = await deploySetupToCard({ config }, 'card.local', {
    expectedCardId: 'card', reclaimImpl: async () => {}, waitForCardImpl: async () => true,
    wiringStatusImpl: async () => ({ state: 'staged', hasCandidate: true, cardId: 'card',
      projectRevision: 4, projectFingerprint: 'fingerprint', activationId: 'candidate',
      candidateOutputs: structuredClone(config.led.outputs) }),
    pushImpl: async () => { steps.push('post'); throw new Error('must not post'); },
    activateImpl: async id => { steps.push(`activate:${id}`); },
    confirmImpl: async id => { steps.push(`confirm:${id}`); },
    waitForOutputsImpl: async () => structuredClone(installed),
  });
  assert.deepEqual(steps, ['activate:candidate', 'confirm:candidate']);
  assert.equal(result.activationId, 'candidate');
});

test('a different staged candidate is preserved and blocks a new install write', async () => {
  let posts = 0;
  await assert.rejects(deploySetupToCard({ config }, 'card.local', {
    expectedCardId: 'card', reclaimImpl: async () => {}, waitForCardImpl: async () => true,
    wiringStatusImpl: async () => ({ state: 'staged', hasCandidate: true, cardId: 'card',
      projectRevision: 4, projectFingerprint: 'other', activationId: 'candidate',
      candidateOutputs: structuredClone(config.led.outputs) }),
    pushImpl: async () => { posts += 1; },
  }), /different or unverified wiring candidate/i);
  assert.equal(posts, 0);
});
