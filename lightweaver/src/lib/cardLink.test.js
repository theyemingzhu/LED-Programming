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
} from './cardLink.js';

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
