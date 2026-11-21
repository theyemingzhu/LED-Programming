// Rules that stop a slow but healthy card from being reported as failed.
// Plan and decisions: todo/plans/false-failures.md.
import test from 'node:test';
import assert from 'node:assert/strict';

import { initialCardLinkState, reduceCardLink, CARD_PLANNED_RESTART_MAX_MS } from './cardLink.js';
import { deriveCardLifecycle, CARD_STARTING_GRACE_MS } from './cardLifecycle.js';
import { waitForCardDeploymentVerification } from './cardDeployment.js';
import { withCardReadRetry, isCardSilenceError, CardPushError, CARD_READ_RETRY } from './cardPushClient.js';

const HOST = 'lightweaver.local';
const CARD_ID = 'lw-aabbccddeeff';
const envelope = (overrides = {}) => ({
  app: 'Lightweaver', provisioningContractVersion: 1, cardId: CARD_ID,
  firmwareVersion: '1.0.0', buildId: 'a'.repeat(40), bootId: 'boot-1',
  runtimePhase: 'ready', knownGoodProject: true, commandReady: true, outputReady: true,
  ...overrides,
});

function connectedDirect() {
  let state = initialCardLinkState(HOST);
  state = reduceCardLink(state, { type: 'card-verified', via: 'direct', host: HOST, card: { id: CARD_ID }, readiness: envelope() });
  return state;
}

test('direct link: one missed keepalive is a slow card, not a gone one', () => {
  const connected = connectedDirect();
  assert.equal(connected.state, 'connected-direct');
  const once = reduceCardLink(connected, { type: 'direct-ping-missed', host: HOST });
  assert.equal(once.state, 'connected-direct');
  assert.equal(once.missedPings, 1);
  const answered = reduceCardLink(once, { type: 'direct-ping-ok', host: HOST });
  assert.equal(answered.missedPings, 0, 'an answer resets the count, so only consecutive misses count');
  const twice = reduceCardLink(reduceCardLink(answered, { type: 'direct-ping-missed', host: HOST }), { type: 'direct-ping-missed', host: HOST });
  assert.equal(twice.state, 'reconnecting', 'two consecutive misses still report the card gone');
});

test('a planned restart reads silence as the restart, ignores the old boot, and ends on the new one', () => {
  const at = 1_000_000;
  const restarting = reduceCardLink(connectedDirect(), { type: 'card-restart-planned', waitMs: 45000, at });
  assert.equal(restarting.state, 'revalidating');
  assert.equal(restarting.reason, 'card-restarting');
  assert.equal(restarting.plannedRestartUntil, at + 45000);

  const quiet = reduceCardLink(reduceCardLink(restarting, { type: 'direct-ping-missed', host: HOST, at: at + 5000 }),
    { type: 'direct-ping-missed', host: HOST, at: at + 10000 });
  assert.equal(quiet.state, 'revalidating', 'never "stopped responding" inside the window');

  const oldBoot = reduceCardLink(quiet, { type: 'direct-ping-ok', host: HOST, readiness: envelope(), at: at + 11000 });
  assert.equal(oldBoot, quiet, 'an answer from the boot that is about to end proves nothing');

  const first = reduceCardLink(quiet, { type: 'direct-ping-ok', host: HOST, readiness: envelope({ bootId: 'boot-2' }), at: at + 14000 });
  const second = reduceCardLink(first, { type: 'direct-ping-ok', host: HOST, readiness: envelope({ bootId: 'boot-2' }), at: at + 14500 });
  assert.equal(second.state, 'connected-direct');
  assert.equal(second.plannedRestartUntil, 0);

  const late = reduceCardLink(restarting, { type: 'direct-ping-missed', host: HOST, at: at + CARD_PLANNED_RESTART_MAX_MS + 1 });
  assert.equal(late.state, 'reconnecting', 'after the window, silence is reported again');
});

const PROJECT = { id: 'piece-a', revision: 7, fingerprint: 'a'.repeat(64) };
const readyReadiness = {
  cardId: 'lw-card-a', bootId: 'boot-2', runtimePhase: 'ready', commandReady: true, outputReady: true,
  playbackReady: true, knownGoodProject: true, projectId: 'piece-a', projectRevision: 7, projectFingerprint: 'a'.repeat(64),
};
const link = readiness => ({ state: 'connected-direct', card: { id: 'lw-card-a' }, expectedCard: { id: 'lw-card-a' }, readiness });

test('a card that has just booted is "Checking card", not "Needs attention" or "Update rolled back"', () => {
  const booting = { ...readyReadiness, commandReady: false, playbackReady: false, uptimeMs: 1500 };
  const fresh = deriveCardLifecycle({ link: link(booting), project: PROJECT });
  assert.equal(fresh.state, 'confirming');
  const rolledBack = deriveCardLifecycle({
    link: link({ ...booting, firmwareUpdate: { phase: 'rolled-back' } }), project: PROJECT,
  });
  assert.notEqual(rolledBack.state, 'update-rolled-back');
  assert.equal(rolledBack.state, 'confirming');

  const stuck = { ...booting, uptimeMs: CARD_STARTING_GRACE_MS + 1 };
  assert.equal(deriveCardLifecycle({ link: link(stuck), project: PROJECT }).state, 'attention-required',
    'a card still not ready long after boot is a real problem');
});

test('the lifecycle names what "verifying" is: restarting, restarted, or checking', () => {
  const base = { state: 'revalidating', card: { id: 'lw-card-a' }, expectedCard: { id: 'lw-card-a' }, readiness: null };
  assert.equal(deriveCardLifecycle({ link: { ...base, reason: 'card-restarting' } }).label, 'Restarting card');
  assert.equal(deriveCardLifecycle({ link: { ...base, reason: 'card-restarted' } }).label, 'Card restarted — verifying');
  assert.equal(deriveCardLifecycle({ link: { ...base, reason: 'checking-card' } }).label, 'Checking card');
});

const prepared = { cardId: CARD_ID };
function clock() {
  let now = 0;
  return { now: () => now, sleep: async ms => { now += ms; } };
}

test('a save that restarts the card waits through a 14 s silence and finishes on the new boot', async () => {
  const time = clock();
  const waiting = [];
  let reads = 0;
  let firstNewBootAt = 0;
  // verifyCardDeployment is exercised by its own tests; here only the waiting is under test.
  const result = await waitForCardDeploymentVerification(prepared, {
    restartWaitMs: 45000, restartFromBootId: 'boot-1', intervalMs: 800,
    now: time.now, sleep: time.sleep,
    onWaiting: event => waiting.push(event.phase),
    readEvidence: async () => {
      reads += 1;
      if (time.now() < 300) return { cardId: CARD_ID, bootId: 'boot-1' };
      if (time.now() < 14000) throw new CardPushError('readback', 'no answer');
      if (!firstNewBootAt) firstNewBootAt = time.now();
      return { cardId: CARD_ID, bootId: 'boot-2' };
    },
  }).catch(error => error);
  // The new boot answered; whatever verifyCardDeployment concluded, the wait
  // did not give up early with a restart timeout.
  assert.ok(firstNewBootAt >= 14000 && firstNewBootAt < 15000, 'it kept asking through the restart');
  // This bare evidence never verifies, so the wait runs to its limit and ends
  // as a verification failure — not as "never came back".
  assert.notEqual(result?.reason, 'restart-timeout');
  assert.ok(waiting.includes('restarting'));
  assert.ok(reads > 2);
});

test('a card that never comes back ends in one plain line after the limit', async () => {
  const time = clock();
  const error = await waitForCardDeploymentVerification(prepared, {
    restartWaitMs: 45000, restartFromBootId: 'boot-1', intervalMs: 800, now: time.now, sleep: time.sleep,
    readEvidence: async () => { throw new CardPushError('readback', 'no answer'); },
  }).catch(caught => caught);
  assert.equal(error.reason, 'restart-timeout');
  assert.match(error.message, /has not come back after restarting \(45 s\)/);
  assert.doesNotMatch(error.message, /rolled back|did not answer/);
});

test('a quiet card during an ordinary verification is waited for, not failed after 20 reads', async () => {
  const time = clock();
  let reads = 0;
  const error = await waitForCardDeploymentVerification(prepared, {
    now: time.now, sleep: time.sleep,
    readEvidence: async () => { reads += 1; throw new CardPushError('readback', 'no answer'); },
  }).catch(caught => caught);
  assert.ok(error instanceof Error);
  assert.ok(time.now() >= 44000, 'kept reading for the restart limit');
  assert.ok(reads > 20);
});

test('pre-save reads: a silent card is asked twice more, 1 s apart, 6 s each; a refusal is not retried', async () => {
  const waits = [];
  let calls = 0;
  const value = await withCardReadRetry(async () => {
    calls += 1;
    if (calls < 3) throw new CardPushError('readback', 'no answer');
    return 'answered';
  }, { sleep: async ms => { waits.push(ms); } });
  assert.equal(value, 'answered');
  assert.deepEqual(waits, [1000, 1000]);
  assert.equal(CARD_READ_RETRY.timeoutMs, 6000, 'each try gives a busy card (3.4 s measured) room to answer');

  let refused = 0;
  await assert.rejects(withCardReadRetry(async () => {
    refused += 1;
    throw new CardPushError('http', 'refused', null, 409);
  }, { sleep: async () => {} }));
  assert.equal(refused, 1);
  assert.equal(isCardSilenceError(new CardPushError('wrong-card', 'x')), false);
  assert.equal(isCardSilenceError(Object.assign(new Error('timeout'), { name: 'AbortError' })), true);
});

test('a status probe that finds no card during a planned restart is the restart, not "No card found"', () => {
  const at = 2_000_000;
  const restarting = reduceCardLink(connectedDirect(), { type: 'card-restart-planned', waitMs: 45000, at });
  const probe = reduceCardLink(restarting, { type: 'direct-status', connected: false, host: HOST, reason: 'card-unreachable', at: at + 8000 });
  assert.equal(probe, restarting);
  const wrong = reduceCardLink(restarting, { type: 'direct-status', connected: false, host: HOST, reason: 'wrong-card', at: at + 8000 });
  assert.equal(wrong.state, 'disconnected', 'a real verdict still lands');
});

test('a count change on a quiet card asks again before "the card did not take it"', async () => {
  const { applyLedCountOnCard } = await import('./applyLedCountToCard.js');
  let wiringReads = 0;
  let statusReads = 0;
  const result = await applyLedCountOnCard({
    host: 'lightweaver.local', pixels: 42, pin: 18,
    retry: { sleep: async () => {} },
    readWiring: async () => {
      wiringReads += 1;
      if (wiringReads === 1) throw new CardPushError('readback', 'no answer');
      return { state: 'known-good', hasCandidate: false, cardId: CARD_ID };
    },
    readStatus: async () => {
      statusReads += 1;
      if (statusReads === 1) throw new CardPushError('readback', 'no answer');
      throw new CardPushError('http', 'stop here', null, 409);
    },
  });
  assert.equal(wiringReads, 2, 'the quiet wiring read was asked again');
  assert.equal(statusReads, 2, 'the quiet status read was asked again');
  assert.notEqual(result.reason, 'wiring-unreachable');
});

// An unresolvable .local name is not a quiet card: asking it again only held
// back the fallback to the card's own address by about 6 s.
test('a .local name that does not resolve is asked once; a quiet card address is still asked three times', async () => {
  const { withCardReadRetry, isUnresolvedMdnsFailure, isCardSilenceError } = await import('./cardPushClient.js');
  const run = async host => {
    let reads = 0;
    await withCardReadRetry(async () => { reads += 1; throw new TypeError('Failed to fetch'); }, {
      sleep: async () => {},
      shouldRetry: error => isCardSilenceError(error) && !isUnresolvedMdnsFailure(host, error),
    }).catch(() => {});
    return reads;
  };
  assert.equal(await run('lightweaver.local'), 1);
  assert.equal(await run('http://lightweaver.local:80'), 1);
  assert.equal(await run('192.168.18.70'), 3);
  const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' });
  assert.equal(isUnresolvedMdnsFailure('lightweaver.local', timeout), false, 'a slow .local card is still asked again');
});

test('while a save checks a slow card, missed keepalives do not say "stopped responding" (F-C1)', () => {
  const at = 3_000_000;
  const held = reduceCardLink(connectedDirect(), { type: 'card-check-hold', holdMs: 22000, at });
  const missedTwice = reduceCardLink(reduceCardLink(held, { type: 'direct-ping-missed', host: HOST, at: at + 7000 }),
    { type: 'direct-ping-missed', host: HOST, at: at + 14000 });
  assert.equal(missedTwice.state, 'connected-direct');
  const released = reduceCardLink(missedTwice, { type: 'card-check-release' });
  const afterRelease = reduceCardLink(released, { type: 'direct-ping-missed', host: HOST, at: at + 15000 });
  assert.equal(afterRelease.state, 'reconnecting', 'once the save stops checking, the miss rule applies again');
});

test('a card that never restarted is never told it "has not come back after restarting" (F-D2)', async () => {
  const time = clock();
  const error = await waitForCardDeploymentVerification(prepared, {
    restartWaitMs: 45000, restartFromBootId: 'boot-1', intervalMs: 800, now: time.now, sleep: time.sleep,
    readEvidence: async () => ({ cardId: CARD_ID, bootId: 'boot-1' }),
  }).catch(caught => caught);
  assert.equal(error.reason, 'save-not-applied');
  assert.doesNotMatch(error.message, /come back|restart/i);
});

test('an old rollback record on a bench card running the restored build is history (F-D1)', () => {
  const benchReadiness = {
    ...readyReadiness, commandReady: false, playbackReady: false, provisionalSetup: true, uptimeMs: 49 * 60000,
    buildId: 'b'.repeat(40), buildNumber: 2464,
    firmwareUpdate: { phase: 'rolled-back', rollbackReason: 'new-slot-rollback-detected', restoredBuildNumber: 2464, lastError: '' },
  };
  const lifecycle = deriveCardLifecycle({ link: link(benchReadiness), project: PROJECT });
  assert.notEqual(lifecycle.state, 'update-rolled-back');
  assert.notEqual(lifecycle.label, 'Update rolled back');
  assert.equal(lifecycle.pastUpdateRolledBack, true);
  const own = deriveCardLifecycle({ link: link(benchReadiness), project: PROJECT, update: { phase: 'rolled-back' } });
  assert.equal(own.state, 'update-rolled-back', 'an update this browser ran still stops the owner');
});
