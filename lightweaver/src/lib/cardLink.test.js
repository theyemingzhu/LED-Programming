// F26 — the bridge pop-up is a separate browsing context, and Chrome throttles
// its timers when it is backgrounded even though the card itself keeps
// answering fine. Before this fix, reduceCardLink's 'bridge-ping-missed' case
// demoted connected-bridge -> reconnecting-bridge (and cleared readiness/card
// evidence) on the FIRST missed keepalive, ignoring CARD_LINK_PING_MISS_LIMIT
// entirely. That is what flipped the footer to "Card stopped responding" and
// reverted Card Home to "PHASE 1 OF 4 / Project not installed" with no user
// action and no real loss of connection. See THINKING.md / the F26 ticket for
// the measured live-card journal.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_LINK_PING_MISS_LIMIT,
  initialCardLinkState,
  reduceCardLink,
  getSharedCardLink,
  reportDirectCardStatus,
} from './cardLink.js';
import { beginCardCommissioning, completeCardInstall, acknowledgeCommissionedCard,
  writeCardCommissioning } from './cardCommissioningFlow.js';
import { CARD_IDENTITY_FORGOT_AT_KEY, forgetExpectedCardIdentity } from './cardIdentity.js';

const HOST = 'lightweaver.local';
const CARD_ID = 'lw-aabbccddeeff';

function readyEnvelope(overrides = {}) {
  return {
    app: 'Lightweaver',
    provisioningContractVersion: 1,
    cardId: CARD_ID,
    firmwareVersion: '1.0.0',
    buildId: 'a'.repeat(40),
    bootId: 'boot-1',
    runtimePhase: 'ready',
    knownGoodProject: true,
    commandReady: true,
    outputReady: true,
    ...overrides,
  };
}

function connectedBridgeState() {
  return reduceCardLink(initialCardLinkState(HOST), {
    type: 'card-verified',
    via: 'bridge',
    host: HOST,
    card: { id: CARD_ID },
    readiness: readyEnvelope(),
  });
}

test('acknowledged active setup keeps exact direct status transiently connected without pairing', async () => {
  const priorLocal = globalThis.localStorage;
  const priorSession = globalThis.sessionStorage;
  const memory = () => {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key) };
  };
  const storage = memory();
  const sessionStorage = memory();
  globalThis.localStorage = storage;
  globalThis.sessionStorage = sessionStorage;
  try {
    const now = Date.now();
    const projectRecord = { id: 'project-direct-setup', updatedAt: now,
      project: { version: 3, id: 'test-piece', name: 'Test piece',
        layout: { strips: [{ id: 'strip', pixelCount: 2 }],
          wiring: { outputs: [{ id: 'out-a', gpio: 16 }] }, patchBoard: { chains: [{ id: 'strip' }] } },
        devices: { standaloneController: { outputs: [{ id: 'out-a', pin: 16, pixels: 2 }],
          playlist: [{ id: 'aurora', type: 'pattern', patternId: 'aurora' }] } } } };
    const installed = { operation: 'install-current-release', cardId: CARD_ID,
      firmwareVersion: '1.0.0', buildId: 'a'.repeat(40) };
    const started = beginCardCommissioning({ source: 'web-serial', operation: installed.operation,
      strategy: 'clean-recovery', projectRecord, projectRevision: 1,
      flowId: 'flow-direct-status-commissioning', now });
    const awaiting = completeCardInstall(started, installed, { now: now + 1 });
    await writeCardCommissioning(awaiting, { storage, sessionStorage, locks: null, indexedDB: null });
    const exactStatus = readyEnvelope();
    const observe = status => reportDirectCardStatus({ connected: true, host: HOST, status });
    observe(exactStatus);
    assert.equal(getSharedCardLink().getState().reason, 'found-unpaired', 'no acknowledgement grants no identity');
    const acknowledged = acknowledgeCommissionedCard(awaiting, {
      id: CARD_ID, firmwareVersion: installed.firmwareVersion, buildId: installed.buildId,
    }, { now: now + 2 }).flow;
    await writeCardCommissioning(acknowledged, { storage, sessionStorage, locks: null, indexedDB: null });
    observe(exactStatus);
    assert.equal(getSharedCardLink().getState().state, 'connected-direct');
    assert.equal(storage.getItem('lw_card_identity_v1'), null, 'temporary setup authority never persists pairing');
    const originalGet = storage.getItem;
    storage.getItem = key => {
      if (key === CARD_IDENTITY_FORGOT_AT_KEY) throw new Error('revocation storage unreadable');
      return originalGet(key);
    };
    observe(exactStatus);
    assert.equal(getSharedCardLink().getState().reason, 'found-unpaired', 'unreadable revocation fails closed');
    storage.getItem = originalGet;
    for (const mismatch of [
      { cardId: 'lw-other' }, { firmwareVersion: '9.0.0' }, { buildId: 'b'.repeat(40) },
    ]) {
      observe(readyEnvelope(mismatch));
      assert.equal(getSharedCardLink().getState().reason, 'found-unpaired');
    }
    observe(exactStatus);
    assert.equal(getSharedCardLink().getState().state, 'connected-direct');
    const realNow = Date.now;
    try {
      Date.now = () => now + 8 * 24 * 60 * 60 * 1000;
      observe(exactStatus);
      assert.equal(getSharedCardLink().getState().reason, 'found-unpaired', 'expired setup has no authority');
    } finally { Date.now = realNow; }
    observe(exactStatus);
    assert.equal(getSharedCardLink().getState().state, 'connected-direct');
    sessionStorage.removeItem('lw_card_commissioning_active_v2');
    observe(exactStatus);
    assert.equal(getSharedCardLink().getState().reason, 'found-unpaired', 'cleared setup has no authority');
    sessionStorage.setItem('lw_card_commissioning_active_v2', acknowledged.flowId);
    observe(exactStatus);
    assert.equal(getSharedCardLink().getState().state, 'connected-direct');
    assert.equal(forgetExpectedCardIdentity({ storage, now: () => now + 3 }), true);
    observe(exactStatus);
    assert.equal(getSharedCardLink().getState().reason, 'found-unpaired', 'explicit Forget revokes transient setup identity');
  } finally {
    if (priorLocal === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorLocal;
    if (priorSession === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = priorSession;
  }
});

test('a single missed bridge ping keeps connected-bridge and records missed:1', () => {
  const connected = connectedBridgeState();
  assert.equal(connected.state, 'connected-bridge');
  assert.equal(connected.missedPings, 0);
  assert.ok(connected.readiness, 'sanity: fixture actually carries live readiness');

  const afterOneMiss = reduceCardLink(connected, { type: 'bridge-ping-missed', host: HOST });

  assert.equal(afterOneMiss.state, 'connected-bridge', 'one missed ping must not demote the link');
  assert.equal(afterOneMiss.missedPings, 1);
  assert.equal(afterOneMiss.reason, '', 'a tolerated miss is not "card stopped answering"');
  // Live evidence must survive — this is what stops Card Home from reverting
  // to "PHASE 1 OF 4 / Project not installed" on a background-throttled tab.
  assert.deepEqual(afterOneMiss.readiness, connected.readiness);
  assert.deepEqual(afterOneMiss.card, connected.card);
});

test('the second consecutive missed bridge ping demotes to reconnecting-bridge', () => {
  const connected = connectedBridgeState();
  const afterOneMiss = reduceCardLink(connected, { type: 'bridge-ping-missed', host: HOST });
  const afterTwoMisses = reduceCardLink(afterOneMiss, { type: 'bridge-ping-missed', host: HOST });

  assert.equal(CARD_LINK_PING_MISS_LIMIT, 2, 'sanity: this test assumes the shipped limit');
  assert.equal(afterTwoMisses.missedPings, 2);
  assert.equal(afterTwoMisses.state, 'reconnecting-bridge');
  assert.equal(afterTwoMisses.reason, 'card-stopped-answering');
  assert.equal(afterTwoMisses.readiness, null, 'a real demotion does clear live evidence');
});

test('a reply in between resets the missed-ping count', () => {
  const connected = connectedBridgeState();
  const afterOneMiss = reduceCardLink(connected, { type: 'bridge-ping-missed', host: HOST });
  assert.equal(afterOneMiss.missedPings, 1);

  const afterReply = reduceCardLink(afterOneMiss, {
    type: 'bridge-ping-ok',
    host: HOST,
    readiness: readyEnvelope(),
  });
  assert.equal(afterReply.state, 'connected-bridge');
  assert.equal(afterReply.missedPings, 0, 'a successful ping in between must reset the counter');

  // Prove the reset is real, not incidental: another single miss from here
  // must again be tolerated rather than demoting immediately, which it would
  // if the counter had not actually gone back to zero.
  const afterAnotherMiss = reduceCardLink(afterReply, { type: 'bridge-ping-missed', host: HOST });
  assert.equal(afterAnotherMiss.state, 'connected-bridge');
  assert.equal(afterAnotherMiss.missedPings, 1);
});

test('a card link with the miss limit tuned to 1 demotes on the first miss', () => {
  // Confirms reduceCardLink actually honours the missLimit parameter (used by
  // the mutation check for this fix) rather than a hardcoded constant.
  const connected = connectedBridgeState();
  const afterOneMiss = reduceCardLink(connected, { type: 'bridge-ping-missed', host: HOST }, { missLimit: 1 });
  assert.equal(afterOneMiss.state, 'reconnecting-bridge');
  assert.equal(afterOneMiss.missedPings, 1);
});
