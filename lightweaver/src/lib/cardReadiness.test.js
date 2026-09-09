import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCardReadiness,
  normalizeCardReadiness,
  isDifferentCardMismatch,
  isStaleFirmwareMismatch,
} from './cardReadiness.js';

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

test('normalizes readiness evidence without inventing boolean or identity values', () => {
  const normalized = normalizeCardReadiness({
    app: 'Lightweaver',
    provisioningContractVersion: 1,
    cardId: `  ${CARD_ID}  `,
    firmwareVersion: ' 1.0.0 ',
    buildId: ` ${'a'.repeat(40)} `,
    bootId: ' boot-1 ',
    runtimePhase: ' ready ',
    knownGoodProject: 'true',
    commandReady: 1,
    firmwareUpdateReady: true,
    outputReady: false,
  });

  assert.equal(normalized.cardId, CARD_ID);
  assert.equal(normalized.bootId, 'boot-1');
  assert.equal(normalized.runtimePhase, 'ready');
  assert.equal(normalized.knownGoodProject, null);
  assert.equal(normalized.commandReady, null);
  assert.equal(normalized.firmwareUpdateReady, true);
  assert.equal(normalized.outputReady, false);
  assert.equal(normalized.identityValid, true);
  assert.equal(Object.isFrozen(normalized), true);
});

test('missing readiness evidence and old payloads fail closed as checking', () => {
  const requiredFields = [
    'knownGoodProject',
    'commandReady',
    'outputReady',
    'bootId',
    'provisioningContractVersion',
  ];

  for (const field of requiredFields) {
    const payload = readyEnvelope();
    delete payload[field];
    const result = classifyCardReadiness(payload, { expectedCardId: CARD_ID });
    assert.equal(result.state, 'checking', field);
    assert.equal(result.connected, false, field);
    assert.equal(result.blank, null, field);
  }

  const oldPayload = {
    app: 'Lightweaver',
    cardId: CARD_ID,
    firmwareVersion: '1.0.0',
    buildId: 'old-build',
    mode: 'run',
  };
  const oldResult = classifyCardReadiness(oldPayload, { expectedCardId: CARD_ID });
  assert.equal(oldResult.state, 'checking');
  assert.equal(oldResult.blank, null);
});

test('invalid Lightweaver identity and unsupported contracts remain checking', () => {
  const invalidIdentities = [
    { app: 'OtherProduct' },
    { cardId: '' },
    { cardId: `lw-${'a'.repeat(62)}` },
    { firmwareVersion: '' },
    { firmwareVersion: 'v'.repeat(49) },
    { buildId: '' },
    { buildId: 'b'.repeat(97) },
  ];
  for (const override of invalidIdentities) {
    const result = classifyCardReadiness(readyEnvelope(override), { expectedCardId: CARD_ID });
    assert.equal(result.state, 'checking', JSON.stringify(override));
    assert.equal(result.connected, false, JSON.stringify(override));
  }

  const unsupported = classifyCardReadiness(readyEnvelope({ provisioningContractVersion: 2 }), {
    expectedCardId: CARD_ID,
  });
  assert.equal(unsupported.state, 'checking');
  assert.equal(unsupported.connected, false);
});

test('only corroborated factory evidence is blank', () => {
  const result = classifyCardReadiness(readyEnvelope({
    runtimePhase: 'factory',
    knownGoodProject: false,
    commandReady: false,
    outputReady: false,
    mode: 'factory-flash',
    source: 'defaults',
  }), { expectedCardId: CARD_ID });

  assert.equal(result.state, 'blank');
  assert.equal(result.blank, true);
  assert.equal(result.connected, false);
});

test('reachable factory defaults remain blank during an abandoned WiFi handoff', () => {
  const result = classifyCardReadiness(readyEnvelope({
    runtimePhase: 'recovering',
    knownGoodProject: false,
    commandReady: false,
    outputReady: false,
    mode: 'factory-flash',
    source: 'defaults',
    projectId: '',
    projectFingerprint: '',
    wifi: {
      transition: 'handoff-abandoned',
      transitionPending: true,
      handoffGeneration: 1,
      apActive: false,
      stationIp: '192.168.18.70',
    },
  }), { expectedCardId: CARD_ID });

  assert.equal(result.state, 'blank');
  assert.equal(result.blank, true);
  assert.equal(result.patternAccess, 'blank');
  assert.equal(result.connected, false);
});

test('either authoritative factory marker is blank only without installed project identity', () => {
  for (const override of [
    { mode: 'factory-flash', source: '', commandReady: true },
    { mode: 'run', source: 'defaults', commandReady: false },
  ]) {
    const result = classifyCardReadiness(readyEnvelope({
      runtimePhase: 'recovering',
      knownGoodProject: false,
      outputReady: false,
      projectId: '',
      projectFingerprint: '',
      ...override,
    }), { expectedCardId: CARD_ID });
    assert.equal(result.state, 'blank', JSON.stringify(override));
    assert.equal(result.blank, true, JSON.stringify(override));
    assert.equal(result.patternAccess, 'blank', JSON.stringify(override));
  }
});

test('factory markers with conflicting installed project identity remain recovery', () => {
  for (const override of [
    { projectId: 'configured-piece', projectFingerprint: '' },
    { projectId: '', projectFingerprint: 'b'.repeat(16) },
  ]) {
    const result = classifyCardReadiness(readyEnvelope({
      runtimePhase: 'recovering',
      knownGoodProject: false,
      commandReady: false,
      outputReady: false,
      mode: 'factory-flash',
      source: 'defaults',
      ...override,
    }), { expectedCardId: CARD_ID });
    assert.equal(result.state, 'not-ready', JSON.stringify(override));
    assert.equal(result.blank, false, JSON.stringify(override));
    assert.equal(result.patternAccess, 'recovery', JSON.stringify(override));
  }
});

test('factory recovery classification still fails closed for configured, wrong, and incomplete cards', () => {
  const recoveringConfigured = classifyCardReadiness(readyEnvelope({
    runtimePhase: 'recovering',
    knownGoodProject: true,
    commandReady: false,
    outputReady: false,
    mode: 'run',
    source: 'internal-flash',
    projectId: 'configured-piece',
    projectFingerprint: 'b'.repeat(16),
  }), { expectedCardId: CARD_ID });
  assert.equal(recoveringConfigured.state, 'not-ready');
  assert.equal(recoveringConfigured.blank, false);

  const wrongCard = classifyCardReadiness(readyEnvelope({
    cardId: 'lw-112233445566',
    runtimePhase: 'recovering',
    knownGoodProject: false,
    commandReady: false,
    outputReady: false,
    mode: 'factory-flash',
    source: 'defaults',
  }), { expectedCardId: CARD_ID });
  assert.equal(wrongCard.state, 'identity-mismatch');
  assert.equal(wrongCard.blank, null);

  const incomplete = readyEnvelope({
    runtimePhase: 'recovering',
    knownGoodProject: false,
    commandReady: false,
    outputReady: false,
    mode: 'factory-flash',
    source: 'defaults',
  });
  delete incomplete.provisioningContractVersion;
  const incompleteResult = classifyCardReadiness(incomplete, { expectedCardId: CARD_ID });
  assert.equal(incompleteResult.state, 'checking');
  assert.equal(incompleteResult.blank, null);
});

test('non-factory evidence stays in recovery', () => {
  for (const override of [
    { runtimePhase: 'recovering', knownGoodProject: true, commandReady: false },
    { runtimePhase: 'recovering', knownGoodProject: false, commandReady: false },
  ]) {
    const result = classifyCardReadiness(readyEnvelope(override), { expectedCardId: CARD_ID });
    assert.equal(result.state, 'not-ready', JSON.stringify(override));
    assert.equal(result.patternAccess, 'recovery', JSON.stringify(override));
    assert.equal(result.blank, false, JSON.stringify(override));
  }
});

test('pattern access permits card effects only for exact ready evidence', () => {
  const ready = classifyCardReadiness(readyEnvelope(), { expectedCardId: CARD_ID });
  const incomplete = classifyCardReadiness(readyEnvelope({ outputReady: false }), {
    expectedCardId: CARD_ID,
  });

  assert.equal(ready.patternAccess, 'ready');
  assert.equal(incomplete.patternAccess, 'recovery');
});

test('an unexpected exact card ID is an identity mismatch', () => {
  const result = classifyCardReadiness(readyEnvelope({ cardId: 'lw-112233445566' }), {
    expectedCardId: CARD_ID,
  });
  assert.equal(result.state, 'identity-mismatch');
  assert.equal(result.cardId, 'lw-112233445566');
  assert.equal(result.connected, false);
});

test('a changed boot ID revalidates before becoming connected', () => {
  const result = classifyCardReadiness(readyEnvelope({ bootId: 'boot-2' }), {
    expectedCardId: CARD_ID,
    previousBootId: 'boot-1',
  });
  assert.equal(result.state, 'revalidating');
  assert.equal(result.bootId, 'boot-2');
  assert.equal(result.connected, false);
});

test('incomplete runtime readiness is not ready', () => {
  for (const override of [
    { runtimePhase: 'recovering' },
    { knownGoodProject: false },
    { commandReady: false },
    { outputReady: false },
  ]) {
    const result = classifyCardReadiness(readyEnvelope(override), { expectedCardId: CARD_ID });
    assert.equal(result.state, 'not-ready', JSON.stringify(override));
    assert.equal(result.connected, false, JSON.stringify(override));
  }
});

test('only complete fresh readiness evidence for the expected card is connected', () => {
  const result = classifyCardReadiness(readyEnvelope(), { expectedCardId: CARD_ID });
  assert.equal(result.state, 'connected');
  assert.equal(result.connected, true);
  assert.equal(result.blank, false);
  assert.equal(result.cardId, CARD_ID);
  assert.equal(result.bootId, 'boot-1');
  assert.equal(result.runtimePhase, 'ready');
  assert.equal(typeof result.reason, 'string');
  assert.equal(Object.isFrozen(result), true);
});

test('exact expected firmware and build are part of live readiness', () => {
  const status = readyEnvelope();
  assert.equal(classifyCardReadiness(status, {
    expectedCard: {
      id: status.cardId,
      firmwareVersion: status.firmwareVersion,
      buildId: status.buildId,
    },
  }).connected, true);
  assert.equal(classifyCardReadiness(status, {
    expectedCard: { id: status.cardId, firmwareVersion: '0.9.0', buildId: status.buildId },
  }).reason, 'unexpected-firmware-version');
  assert.equal(classifyCardReadiness(status, {
    expectedCard: { id: status.cardId, firmwareVersion: status.firmwareVersion, buildId: 'old-build' },
  }).reason, 'unexpected-firmware-build');
});

// A card whose firmware advanced since Studio last connected (a Studio-driven
// update, or a bench reflash) reports the SAME card id with a DIFFERENT
// firmwareVersion/buildId than the persisted `expectedCard` record — i.e. the
// card is ahead of what this Studio instance remembers. C2 asked whether the
// classifier conflates that with either "a different card answered" or
// "firmware too old"/"pair again from scratch". It does not: `isDifferentCardMismatch`
// stays false (a stranger's card is the only thing that flag guards — see the
// 2026-08-19 THINKING.md entry), `isStaleFirmwareMismatch` is exactly the
// caller-facing signal for this case (benchInstall.js already relearns the
// identity and keeps going on it rather than erroring), and the reason is
// always one of the two explained `unexpected-firmware-*` strings — never
// `firmware-too-old` or `identity-missing`, the two reasons that push a card
// into cardLifecycle's `update-required` state. Writes still fail closed
// (`patternAccess: 'recovery'`, matching `playbackReady never widens access
// past an identity or contract failure` below) — this only proves the drift is
// distinguishable and explained, not that it unlocks control.
test('firmware that advanced past what Studio remembers is distinguished from a different card, never firmware-too-old', () => {
  const status = readyEnvelope({ playbackReady: true });

  const aheadFirmware = classifyCardReadiness(status, {
    expectedCard: { id: status.cardId, firmwareVersion: '0.9.0', buildId: status.buildId },
  });
  assert.equal(aheadFirmware.state, 'identity-mismatch');
  assert.equal(aheadFirmware.reason, 'unexpected-firmware-version');
  assert.notEqual(aheadFirmware.reason, 'firmware-too-old');
  assert.equal(isDifferentCardMismatch(aheadFirmware), false);
  assert.equal(isStaleFirmwareMismatch(aheadFirmware), true);
  assert.equal(aheadFirmware.patternAccess, 'recovery');

  const aheadBuild = classifyCardReadiness(status, {
    expectedCard: { id: status.cardId, firmwareVersion: status.firmwareVersion, buildId: 'c'.repeat(40) },
  });
  assert.equal(aheadBuild.reason, 'unexpected-firmware-build');
  assert.equal(isDifferentCardMismatch(aheadBuild), false);
  assert.equal(isStaleFirmwareMismatch(aheadBuild), true);

  // A genuinely different card must not read as mere firmware drift.
  const wrongCard = classifyCardReadiness(status, {
    expectedCard: { id: 'lw-112233445566', firmwareVersion: status.firmwareVersion, buildId: status.buildId },
  });
  assert.equal(isDifferentCardMismatch(wrongCard), true);
  assert.equal(isStaleFirmwareMismatch(wrongCard), false);
});

// ── playbackReady (firmware reports playback admission separately) ───────────
// main.cpp folds the WiFi transition into commandReady AND runtimePhase, but
// not into playbackReady, because patterns/brightness/scenes run entirely
// on-card. Studio has to honour that split or the firmware fix is invisible.

function wifiTransitionEnvelope(overrides = {}) {
  return readyEnvelope({
    // Exactly what a healthy, lit card reports while its radio reassociates.
    runtimePhase: 'recovering',
    commandReady: false,
    playbackReady: true,
    ...overrides,
  });
}

test('playback stays admitted while a WiFi transition holds the command gate shut', () => {
  const result = classifyCardReadiness(wifiTransitionEnvelope(), { expectedCardId: CARD_ID });

  assert.equal(result.playbackAccess, 'ready');
  // The command gate is untouched: no config, wiring, or credential write.
  assert.equal(result.patternAccess, 'recovery');
  assert.equal(result.connected, false);
  assert.equal(result.state, 'not-ready');
});

test('firmware without playbackReady falls back to the command gate exactly as before', () => {
  const legacy = readyEnvelope({ runtimePhase: 'recovering', commandReady: false });
  assert.equal(Object.hasOwn(legacy, 'playbackReady'), false);

  const result = classifyCardReadiness(legacy, { expectedCardId: CARD_ID });
  assert.equal(normalizeCardReadiness(legacy).playbackReady, null);
  assert.equal(result.playbackAccess, result.patternAccess);
  assert.equal(result.playbackAccess, 'recovery');

  const legacyReady = classifyCardReadiness(readyEnvelope(), { expectedCardId: CARD_ID });
  assert.equal(legacyReady.playbackAccess, 'ready');
  assert.equal(legacyReady.patternAccess, 'ready');
});

test('playbackReady never widens access past an identity or contract failure', () => {
  const cases = [
    ['unsupported contract', { provisioningContractVersion: 2 }, {}],
    ['invalid identity', { app: 'NotLightweaver' }, {}],
    ['incomplete evidence', { knownGoodProject: undefined }, {}],
    ['wrong card', {}, { expectedCardId: 'lw-ffffffffffff' }],
    ['wrong firmware', {}, { expectedCard: { id: CARD_ID, firmwareVersion: '9.9.9' } }],
    ['restarted card', {}, { expectedCardId: CARD_ID, previousBootId: 'boot-0' }],
  ];

  for (const [label, override, options] of cases) {
    const result = classifyCardReadiness(wifiTransitionEnvelope(override), options);
    assert.notEqual(result.playbackAccess, 'ready', label);
  }
});

test('an explicit playback refusal still stops playback with the command gate open', () => {
  const result = classifyCardReadiness(readyEnvelope({ playbackReady: false }), {
    expectedCardId: CARD_ID,
  });

  assert.equal(result.connected, true);
  assert.equal(result.patternAccess, 'ready');
  assert.equal(result.playbackAccess, 'recovery');
});

// ── limits.pixels (the ceiling the CARD reports, not the one Studio assumes) ──

test('the card-reported pixel ceiling is normalized from the firmware limits block', () => {
  // Exactly where the firmware puts it: doc["limits"]["pixels"] = LW_MAX_PIXELS
  // in runtimeStatusJson (LightweaverStorage.cpp) and runtimeFirmwareInfo
  // (main.cpp). A pre-upgrade card in the field still answers 1024.
  assert.equal(normalizeCardReadiness(readyEnvelope({ limits: { pixels: 1024 } })).maxPixels, 1024);

  // Never invented, and never widened by a nonsense claim: null means "the card
  // did not say", which is a different fact from any number.
  for (const limits of [undefined, null, {}, 'lots', { pixels: 0 }, { pixels: -5 }, { pixels: '1024' }]) {
    const normalized = normalizeCardReadiness(readyEnvelope({ limits }));
    assert.equal(normalized.maxPixels, null, JSON.stringify(limits));
  }
});

test('truthful capacity separates schema, requested, allocated, and driver readiness', () => {
  const normalized = normalizeCardReadiness(readyEnvelope({
    limits: { pixels: 65535 },
    pixelCapacity: {
      schemaLimit: 65535,
      allocatedBoot: 512,
    },
    led: { pixels: 41 },
    outputDriverReady: true,
    projectOutputReady: false,
    outputInitialization: { ok: true, code: 'ready', message: 'factory beacon output driver initialized' },
  }));
  assert.equal(normalized.schemaMaxPixels, 65535);
  assert.equal(normalized.requestedPixels, 41);
  assert.equal(normalized.allocatedPixels, 512);
  assert.equal(normalized.driverReady, true);
  assert.equal(normalized.projectOutputReady, false);
  assert.deepEqual(normalized.outputInitialization, {
    ok: true,
    code: 'ready',
    message: 'factory beacon output driver initialized',
  });
});

test('legacy capacity diagnostics remain normalized for existing cards', () => {
  const normalized = normalizeCardReadiness(readyEnvelope({
    capacity: {
      schemaMaxPixels: 1024,
      requestedPixels: 41,
      allocatedPixels: 512,
      driverReady: true,
      projectOutputReady: false,
    },
  }));
  assert.equal(normalized.schemaMaxPixels, 1024);
  assert.equal(normalized.requestedPixels, 41);
  assert.equal(normalized.allocatedPixels, 512);
  assert.equal(normalized.driverReady, true);
  assert.equal(normalized.projectOutputReady, false);
});

// ── safeMode (a damaged card must never be mistaken for an erased one) ───────
// The firmware boots safe defaults when it cannot READ a project it still
// holds. That card publishes the same absence a freshly flashed one does, and
// 'blank' is what unlocks strip discovery's one-shot config write.

test('a card that booted safe defaults is kept out of the blank classification', () => {
  const erased = {
    runtimePhase: 'factory',
    knownGoodProject: false,
    commandReady: false,
    outputReady: false,
    mode: 'factory-flash',
    source: 'defaults',
  };

  // Same envelope, one flag apart.
  const blank = classifyCardReadiness(readyEnvelope(erased), { expectedCardId: CARD_ID });
  assert.equal(blank.state, 'blank');
  assert.equal(blank.blank, true);

  const damaged = classifyCardReadiness(readyEnvelope({ ...erased, safeMode: true }), {
    expectedCardId: CARD_ID,
  });
  assert.equal(damaged.state, 'not-ready');
  assert.equal(damaged.blank, false, 'safe mode must never read as "nothing to overwrite"');
  assert.equal(damaged.reason, 'safe-mode');
  assert.equal(damaged.patternAccess, 'recovery');
  assert.equal(damaged.connected, false);
});

test('firmware that omits the safe-mode flag classifies exactly as it did before', () => {
  // Every card in the field today. Absence is not evidence of damage, so each
  // of these has to land on the same state it landed on before the flag
  // existed — most of all the blank one, which is the whole rescue path.
  const cases = [
    ['blank', { runtimePhase: 'factory', knownGoodProject: false, commandReady: false, outputReady: false, mode: 'factory-flash', source: 'defaults' }, 'blank'],
    ['ready', {}, 'connected'],
    ['recovering', { runtimePhase: 'recovering', commandReady: false }, 'not-ready'],
  ];

  for (const [label, override, expected] of cases) {
    const envelope = readyEnvelope(override);
    assert.equal(Object.hasOwn(envelope, 'safeMode'), false, label);
    assert.equal(normalizeCardReadiness(envelope).safeMode, false, label);
    assert.equal(classifyCardReadiness(envelope, { expectedCardId: CARD_ID }).state, expected, label);
  }

  // A non-boolean claim is not a claim. Only an explicit true diverts a card.
  for (const claim of ['true', 1, {}, null]) {
    const result = classifyCardReadiness(readyEnvelope({
      runtimePhase: 'factory',
      knownGoodProject: false,
      commandReady: false,
      outputReady: false,
      mode: 'factory-flash',
      source: 'defaults',
      safeMode: claim,
    }), { expectedCardId: CARD_ID });
    assert.equal(result.state, 'blank', JSON.stringify(claim));
  }
});

test('safe mode still lets a lit card be played, it just refuses the writes', () => {
  // Warn, never block: safe defaults are running, so the strip can be driven.
  // What must not happen is a config write landing on top of an unread project.
  const result = classifyCardReadiness(readyEnvelope({
    runtimePhase: 'recovering',
    knownGoodProject: false,
    commandReady: false,
    playbackReady: true,
    outputReady: false,
    source: 'defaults',
    safeMode: true,
  }), { expectedCardId: CARD_ID });

  assert.equal(result.reason, 'safe-mode');
  assert.equal(result.blank, false);
  assert.equal(result.patternAccess, 'recovery');
  assert.equal(result.playbackAccess, 'ready');
});

test('a blank factory card is refused for playback as well as for commands', () => {
  const result = classifyCardReadiness({
    ...readyEnvelope({
      runtimePhase: 'factory',
      mode: 'factory-flash',
      knownGoodProject: false,
      commandReady: false,
      playbackReady: true,
    }),
  }, { expectedCardId: CARD_ID });

  assert.equal(result.state, 'blank');
  assert.equal(result.patternAccess, 'blank');
  assert.equal(result.playbackAccess, 'blank');
});

test('normalizes the installed project revision alongside the rest of the project identity', () => {
  const normalized = normalizeCardReadiness(readyEnvelope({
    projectId: 'lotus-gate',
    projectFingerprint: 'A'.repeat(32),
    projectRevision: 7,
  }));
  assert.equal(normalized.projectId, 'lotus-gate');
  assert.equal(normalized.projectFingerprint, 'a'.repeat(32));
  assert.equal(normalized.projectRevision, 7);

  // Zero is a real revision a card can report and must survive normalization.
  assert.equal(normalizeCardReadiness(readyEnvelope({ projectRevision: 0 })).projectRevision, 0);
  // Silence, negatives, and non-integers stay null rather than becoming 0.
  assert.equal(normalizeCardReadiness(readyEnvelope()).projectRevision, null);
  assert.equal(normalizeCardReadiness(readyEnvelope({ projectRevision: -1 })).projectRevision, null);
  assert.equal(normalizeCardReadiness(readyEnvelope({ projectRevision: '7' })).projectRevision, null);
  assert.equal(normalizeCardReadiness(readyEnvelope({ projectRevision: 1.5 })).projectRevision, null);

  // Classification carries it through untouched.
  assert.equal(
    classifyCardReadiness(readyEnvelope({ projectRevision: 4 }), { expectedCardId: CARD_ID }).projectRevision,
    4,
  );
});

// ── playlist (the timed-playlist status block, F2's /api/status addition) ──

test('normalizes the playlist status block, never inventing a claim the card did not make', () => {
  const configured = normalizeCardReadiness(readyEnvelope({
    playlist: { configured: true, playing: true, entryIndex: 1, entryCount: 4, patternId: 'ocean', remainingSeconds: 18 },
  }));
  assert.deepEqual(configured.playlist, {
    configured: true,
    playing: true,
    entryIndex: 1,
    entryCount: 4,
    patternId: 'ocean',
    remainingSeconds: 18,
  });
  assert.equal(Object.isFrozen(configured.playlist), true);

  // Firmware from before F2 omits `playlist` entirely — that silence must
  // read as "not on the card yet", not as a guess.
  const legacy = normalizeCardReadiness(readyEnvelope());
  assert.deepEqual(legacy.playlist, {
    configured: false,
    playing: false,
    entryIndex: null,
    entryCount: 0,
    patternId: '',
    remainingSeconds: null,
  });

  // An entryIndex the card reports past its own entryCount is not trusted.
  const outOfRange = normalizeCardReadiness(readyEnvelope({
    playlist: { configured: true, entryIndex: 9, entryCount: 2 },
  }));
  assert.equal(outOfRange.playlist.entryIndex, null);
  assert.equal(outOfRange.playlist.entryCount, 2);

  // A non-boolean claim for configured/playing is not a claim.
  for (const claim of ['true', 1, null]) {
    const normalized = normalizeCardReadiness(readyEnvelope({
      playlist: { configured: claim, playing: claim },
    }));
    assert.equal(normalized.playlist.configured, false, JSON.stringify(claim));
    assert.equal(normalized.playlist.playing, false, JSON.stringify(claim));
  }

  // Classification carries it through untouched, same as every other field.
  assert.deepEqual(
    classifyCardReadiness(readyEnvelope({
      playlist: { configured: true, playing: false, entryIndex: 0, entryCount: 1, patternId: 'plasma', remainingSeconds: 5 },
    }), { expectedCardId: CARD_ID }).playlist,
    { configured: true, playing: false, entryIndex: 0, entryCount: 1, patternId: 'plasma', remainingSeconds: 5 },
  );
});

// F13. `firmwareVersion` and `buildId` were normalized here and `buildNumber`
// was not, so anything re-learning a card's firmware from a readiness envelope
// could carry only two of the three fields and left the third describing the
// previous build — which is precisely the half-updated record found on the real
// card on 2026-09-07.
test('normalized readiness carries the whole firmware identity, build number included', () => {
  const withNumber = normalizeCardReadiness({
    app: 'Lightweaver', provisioningContractVersion: 1,
    cardId: 'lw-aabbccddeeff', firmwareVersion: '1.1.33', buildId: 'c'.repeat(40),
    buildNumber: 1548, bootId: 'boot-9',
  });
  assert.equal(withNumber.firmwareVersion, '1.1.33');
  assert.equal(withNumber.buildId, 'c'.repeat(40));
  assert.equal(withNumber.buildNumber, 1548);

  // A bench build reports no number. 0 is the same "no comparable number" that
  // normalizeCardIdentity reports, never a stale number from another build.
  assert.equal(normalizeCardReadiness({ buildNumber: 0 }).buildNumber, 0);
  assert.equal(normalizeCardReadiness({}).buildNumber, 0);
  assert.equal(normalizeCardReadiness({ buildNumber: -4 }).buildNumber, 0);
  assert.equal(normalizeCardReadiness({ buildNumber: '1548' }).buildNumber, 1548);
});
