import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advance,
  createStripDiscoverySession,
} from './stripDiscovery.js';
import {
  countedStripLengthPx,
  discoveryProjectParts,
  projectSkeletonFromCardStatus,
  starterLedCountFromProject,
} from './discoveryCommit.js';

const benchLayout = [
  { pin: 16, start: 0, count: 600 },
  { pin: 17, start: 600, count: 600 },
];
const portRoles = [
  { pin: 16, role: 'strip', pixelCount: 0, controlKind: '' },
  { pin: 17, role: 'strip', pixelCount: 0, controlKind: '' },
  { pin: 18, role: 'control', pixelCount: 0, controlKind: 'knob' },
  { pin: 21, role: 'unused', pixelCount: 0, controlKind: '' },
];

function runDiscovery(events) {
  let state = createStripDiscoverySession({ portRoles, benchLayout });
  for (const event of events) state = advance(state, event);
  return state;
}

// Two strip ports confirmed through the whole bench walk (the happy path whose
// steps are proven out in stripDiscovery.test.js).
function discoveredSession() {
  return runDiscovery([
    { type: 'bench-installed' },
    { type: 'probe-enough' },
    { type: 'probe-enough' },
    { type: 'set-count', pin: 16, count: 354 },
    { type: 'set-count', pin: 17, count: 120 },
    { type: 'counts-entered' },
    { type: 'end-marker-yes' },
    { type: 'end-marker-yes' },
  ]);
}

test('discoveryProjectParts commits a multi-port walk into outputs, port roles and colour order', () => {
  const parts = discoveryProjectParts(discoveredSession(), {
    channelMap: { red: 1, green: 0, blue: 2 },
  });
  assert.deepEqual(parts.outputs, [
    { id: 'strip-16', pin: 16, pixels: 354 },
    { id: 'strip-17', pin: 17, pixels: 120 },
  ]);
  assert.equal(parts.colorOrder, 'RGB', 'the measured map resolves to the strip’s true order');
  assert.equal(parts.portRoles.find(entry => entry.pin === 16).role, 'strip');
  assert.equal(parts.portRoles.find(entry => entry.pin === 16).pixelCount, 354);
  // discoveryPortRoleUpdates only reports non-control ports, so the knob port
  // falls back to 'unused' under normalization and never becomes an output.
  assert.equal(parts.portRoles.find(entry => entry.pin === 18).role, 'unused');
});

test('discoveryProjectParts creates proportional provisional layout strips and wiring', () => {
  const parts = discoveryProjectParts(discoveredSession(), {
    channelMap: { red: 1, green: 0, blue: 2 },
  });

  assert.equal(parts.strips.length, 2);
  assert.deepEqual(parts.strips.map(strip => [strip.id, strip.pixelCount]), [
    ['strip-16', 354],
    ['strip-17', 120],
  ]);
  assert.equal(parts.strips[0].svgLength > parts.strips[1].svgLength, true);
  assert.equal(
    Math.round((parts.strips[0].svgLength / parts.strips[1].svgLength) * 100),
    Math.round((354 / 120) * 100),
    'provisional line lengths preserve the relative measured counts',
  );
  assert.notEqual(parts.strips[0].pixels[0].y, parts.strips[1].pixels[0].y);
  assert.deepEqual(parts.wiring.outputs, [
    { id: 'out1', name: 'GPIO 16', pin: 16, runIds: ['run-strip-16'] },
    { id: 'out2', name: 'GPIO 17', pin: 17, runIds: ['run-strip-17'] },
  ]);
  assert.deepEqual(parts.wiring.runs.map(run => [run.id, run.source.stripId, run.source.to]), [
    ['run-strip-16', 'strip-16', 353],
    ['run-strip-17', 'strip-17', 119],
  ]);
  assert.equal(parts.wiring.locked, false);
  assert.equal(parts.wiring.verified, false);
  assert.equal(parts.patchBoard.physicalLocked, false);
});

test('a port that ended with no count is omitted from outputs', () => {
  // Port 17 is skipped (nothing lit up), so only GPIO 16 becomes an output.
  const session = runDiscovery([
    { type: 'bench-installed' },
    { type: 'probe-enough' },
    { type: 'probe-skip' },
    { type: 'set-count', pin: 16, count: 60 },
    { type: 'counts-entered' },
    { type: 'end-marker-yes' },
  ]);
  const parts = discoveryProjectParts(session, { channelMap: { red: 0, green: 1, blue: 2 } });
  assert.deepEqual(parts.outputs, [{ id: 'strip-16', pin: 16, pixels: 60 }]);
  assert.equal(parts.portRoles.find(entry => entry.pin === 17).role, 'unused');
});

test('an absent colour proof leaves the colour order empty, not a guess', () => {
  const parts = discoveryProjectParts(discoveredSession(), null);
  assert.equal(parts.colorOrder, '');
});

// F1: StripDiscoveryPanel.jsx's own channelProof state is
// { stage, firstSeen, map, retry } — record() passes that object straight
// into discoveryProjectParts. This fixture is shaped exactly like the panel's
// real state (not the `{ channelMap }` shorthand the other fixtures in this
// file hand-construct) so a regression on the field name discoveryCommit.js
// actually reads is caught here, not just in the hand-built fixtures above.
test('discoveryProjectParts reads the colour map out of the panel\'s own channelProof shape', () => {
  const panelChannelProof = { stage: 'confirmed', firstSeen: 'green', map: { red: 1, green: 0, blue: 2 }, retry: false };
  const parts = discoveryProjectParts(discoveredSession(), panelChannelProof);
  assert.equal(parts.colorOrder, 'RGB', 'the measured map resolves to the strip’s true order from the panel\'s real shape');
  assert.equal(Boolean(parts.colorOrder), true, 'a truthy colorOrder is what record() uses to set colorOrderConfirmed: true');
});

test('discoveryProjectParts is safe for a session that has not been walked', () => {
  const fresh = createStripDiscoverySession({ portRoles, benchLayout });
  const parts = discoveryProjectParts(fresh, { channelMap: null });
  assert.deepEqual(parts.outputs, []);
  assert.equal(parts.colorOrder, '');
  assert.equal(parts.portRoles.every(entry => entry.role === 'unused'), true);
});

test('projectSkeletonFromCardStatus maps a real status blob into a project skeleton', () => {
  const skeleton = projectSkeletonFromCardStatus({
    ledType: 'WS2812B',
    outputs: [
      { id: 'bench-16', name: 'Bench GPIO 16', pin: 16, pixels: 300, direction: 'forward' },
      { id: 'bench-17', name: 'Bench GPIO 17', pin: 17, pixels: 200, direction: 'forward' },
    ],
    outputColor: { colorOrder: 'BGR' },
  });
  assert.equal(skeleton.colorOrder, 'BGR');
  assert.deepEqual(skeleton.outputs, [
    { id: 'strip-16', pin: 16, pixels: 300 },
    { id: 'strip-17', pin: 17, pixels: 200 },
  ]);
  assert.equal(skeleton.portRoles.find(entry => entry.pin === 16).role, 'strip');
  assert.equal(skeleton.portRoles.find(entry => entry.pin === 16).pixelCount, 300);
});

// F7: adoptWiringFromCard's shortcut hands this skeleton straight to
// applyCardParts with no button press. Without a `card-partial` origin on
// the skeleton itself, the automatic path never marks the project as a card
// reconstruction — projectCopyLabel.js's projectCopyKind only recognizes
// project.origin.kind, so ProjectsPanel silently claimed "Not saved yet"
// instead of "Card copy (partial — no artwork)".
test('projectSkeletonFromCardStatus marks the skeleton as a card-partial reconstruction when the status carries outputs', () => {
  const skeleton = projectSkeletonFromCardStatus({
    cardId: 'lw-b0fe81f61b44',
    outputs: [
      { id: 'bench-16', name: 'Bench GPIO 16', pin: 16, pixels: 300, direction: 'forward' },
    ],
    outputColor: { colorOrder: 'BGR' },
  });
  assert.equal(skeleton.origin?.kind, 'card-partial');
  assert.equal(skeleton.origin?.cardId, 'lw-b0fe81f61b44');
  assert.equal(typeof skeleton.origin?.at, 'number');
});

test('Find-my-strips 256 headroom is not a locked install, even when the card says it is known-good', () => {
  // Live card lw-b0fe81f61b44 on 2026-08-25: sentinel project, revision 4,
  // provisionalSetup false, GPIO 18 still holding the 256-pixel probe ceiling.
  // knownGoodProject means "this config can play", not "the owner counted the strip".
  const skeleton = projectSkeletonFromCardStatus({
    projectId: 'lightweaver-bench-discovery-v1',
    projectRevision: 4,
    provisionalSetup: false,
    knownGoodProject: true,
    outputReady: true,
    outputs: [{
      id: 'out1', pin: 18, pixels: 256,
      segments: [{ id: 'bench-18-full', count: 256, direction: 'forward' }],
    }],
  });
  assert.equal(skeleton.strips.length, 0);
  assert.deepEqual(skeleton.outputs, []);
  assert.equal(skeleton.portRoles.find(entry => entry.pin === 18).pixelCount, 0);
  assert.equal(skeleton.wiring.locked, false);
  assert.equal(skeleton.wiring.verified, false);
  assert.equal(skeleton.patchBoard.physicalLocked, false);
});

test('a counted 41-LED strip is placed at reel density, not a 480px sketch', () => {
  const skeleton = projectSkeletonFromCardStatus({
    knownGoodProject: true,
    outputReady: true,
    outputs: [{ id: 'out1', pin: 18, pixels: 41 }],
  });
  assert.equal(skeleton.strips[0].pixelCount, 41);
  assert.equal(skeleton.strips[0].svgLength, countedStripLengthPx(41));
});

test('starter count prefers a counted port over the 256 find-my-strips ceiling', () => {
  assert.equal(starterLedCountFromProject({
    strips: [{ pixelCount: 256 }],
    portRoles: [{ role: 'strip', pin: 18, pixelCount: 41 }],
  }), 41);
});

test('projectSkeletonFromCardStatus reconstructs exact installed segment geometry and wiring', () => {
  const skeleton = projectSkeletonFromCardStatus({
    knownGoodProject: true,
    outputReady: true,
    led: { colorOrder: 'RGB', type: 'WS2815', maxMilliamps: 1500 },
    outputs: [{
      id: 'out1', pin: 18, pixels: 41,
      segments: [{ id: 'run-strip-1', count: 41, direction: 'forward' }],
    }],
  });

  assert.equal(skeleton.colorOrder, 'RGB');
  assert.deepEqual(skeleton.led, { type: 'WS2815', maxMilliamps: 1500 });
  assert.deepEqual(skeleton.outputs, [{ id: 'out1', pin: 18, pixels: 41 }]);
  assert.equal(skeleton.strips.length, 1);
  assert.equal(skeleton.strips[0].id, 'strip-1');
  assert.equal(skeleton.strips[0].pixelCount, 41);
  assert.equal(skeleton.strips[0].pixels.length, 41);
  assert.deepEqual(skeleton.wiring.outputs, [{ id: 'out1', name: 'Output 1', pin: 18, runIds: ['run-strip-1'] }]);
  assert.equal(skeleton.wiring.runs[0].source.stripId, 'strip-1');
  assert.equal(skeleton.wiring.runs[0].source.to, 40);
  assert.equal(skeleton.wiring.verified, true);
  assert.equal(skeleton.patchBoard.physicalLocked, true);
});

test('a status output with no pixels does not become a strip', () => {
  const skeleton = projectSkeletonFromCardStatus({
    outputs: [{ id: 'x', pin: 16, pixels: 0 }],
    outputColor: { colorOrder: 'GRB' },
  });
  assert.deepEqual(skeleton.outputs, []);
  assert.equal(skeleton.portRoles.find(entry => entry.pin === 16).role, 'unused');
});

test('projectSkeletonFromCardStatus is empty when the card reports nothing', () => {
  const skeleton = projectSkeletonFromCardStatus({ outputs: [], outputColor: { colorOrder: '' } });
  assert.equal(skeleton.colorOrder, '');
  assert.deepEqual(skeleton.outputs, []);
  assert.equal(skeleton.portRoles.every(entry => entry.role === 'unused'), true);
});
