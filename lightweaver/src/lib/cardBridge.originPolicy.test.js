import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCardBridgeLaunchUrl, isExactProbationWiringMutation } from './cardBridge.js';

test('only an exact active candidate can be confirmed or rolled back while runtime is recovering', () => {
  const status = {
    app: 'Lightweaver', cardId: 'lw-123456789abc', buildId: 'a'.repeat(40), bootId: 'boot-candidate',
    runtimePhase: 'recovering', configValid: true, knownGoodProject: false,
    commandReady: false, outputReady: true, safeMode: false,
    projectId: 'saved-project', projectRevision: 7, projectFingerprint: 'b'.repeat(64),
    wiringRevision: 3, wiringDigest: 'c'.repeat(64),
  };
  const wiring = {
    app: 'Lightweaver', ok: true, cardId: status.cardId, buildId: status.buildId,
    state: 'testing', candidateState: 'awaiting-confirmation', hasCandidate: true,
    bootedCandidate: true, activationId: 'act-7', projectRevision: 7,
    projectFingerprint: status.projectFingerprint, wiringRevision: 3,
    wiringDigest: 'c'.repeat(64), ledType: 'WS2815', maxMilliamps: 1500,
  };
  const expected = { cardId: status.cardId, buildId: status.buildId };
  for (const type of ['wiring-confirm', 'wiring-rollback']) {
    assert.equal(isExactProbationWiringMutation(type, { activationId: 'act-7' }, status, wiring, expected), true);
  }
  for (const type of ['wiring-candidate', 'wiring-activate', 'config', 'control', 'frame']) {
    assert.equal(isExactProbationWiringMutation(type, { activationId: 'act-7' }, status, wiring, expected), false);
  }
  const mismatches = [
    [{ ...status, cardId: 'lw-wrong' }, wiring, expected],
    [status, { ...wiring, buildId: 'd'.repeat(40) }, expected],
    [status, { ...wiring, activationId: 'act-other' }, expected],
    [status, { ...wiring, projectFingerprint: 'd'.repeat(64) }, expected],
    [{ ...status, wiringRevision: 4 }, wiring, expected],
    [{ ...status, wiringDigest: 'd'.repeat(64) }, wiring, expected],
    [{ ...status, productionJobId: 'other-job' }, wiring, expected],
    [status, { ...wiring, wiringDigest: '' }, expected],
    [{ ...status, safeMode: true }, wiring, expected],
    [{ ...status, knownGoodProject: true }, wiring, expected],
    [{ ...status, runtimePhase: 'ready' }, wiring, expected],
    [status, { ...wiring, bootedCandidate: false }, expected],
    [status, { ...wiring, candidateState: 'staged' }, expected],
  ];
  for (const [nextStatus, nextWiring, nextExpected] of mismatches) {
    assert.equal(isExactProbationWiringMutation('wiring-confirm', { activationId: 'act-7' }, nextStatus, nextWiring, nextExpected), false);
  }
});

function relayedStudioOrigin(origin) {
  globalThis.window = { location: { origin, href: `${origin}/#screen=patterns` } };
  const launch = new URL(buildCardBridgeLaunchUrl('192.168.4.1'));
  return new URLSearchParams(launch.hash.slice(1)).get('studioOrigin');
}

test('card bridge launch trusts every direct CORS Studio origin', () => {
  const trustedOrigins = [
    'https://led.mandalacodes.com',
    'https://light.mandalacodes.com',
    'https://lightweaver-edw.pages.dev',
    'http://localhost',
    'http://localhost:5173',
    'https://localhost',
    'https://localhost:5173',
    'http://127.0.0.1',
    'http://127.0.0.1:5173',
  ];

  for (const origin of trustedOrigins) {
    assert.equal(relayedStudioOrigin(origin), origin);
  }
});

test('card bridge launch rejects Cloudflare Pages preview subdomains', () => {
  for (const origin of [
    'https://attacker.lightweaver-edw.pages.dev',
    'https://studio.lightweaver-edw.pages.dev',
  ]) {
    assert.equal(relayedStudioOrigin(origin), null);
  }
});

test('card bridge launch rejects origins excluded by direct CORS', () => {
  for (const origin of ['https://127.0.0.1', 'https://evil.example']) {
    assert.equal(relayedStudioOrigin(origin), null);
  }
});
