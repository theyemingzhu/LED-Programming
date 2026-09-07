import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_IDENTITY_STORAGE_KEY,
  classifyPairedCardReadiness,
  compareCardIdentity,
  adoptExpectedCardIdentity,
  forgetExpectedCardIdentity,
  normalizeCardIdentity,
  normalizeCardProjectEvidence,
  cardBuildLabel,
  persistCardIdentity,
  readPersistedCardIdentity,
  refreshExpectedCardFirmware,
  GENERIC_SETUP_NETWORK_LABEL,
  setupNetworkLabelForCardId,
  setupNetworkSsidForCardId,
} from './cardIdentity.js';

const firmwareInfo = {
  app: 'Lightweaver',
  cardId: 'lw-001122aabbcc',
  piece: { id: 'front-mandala', name: 'Front Mandala' },
  firmwareVersion: '1.4.0',
  buildId: 'abc123',
  buildNumber: 411,
  bridgeVersion: 1,
  outputs: [
    { id: 'left', gpio: 16, count: 44 },
    { id: 'right', pin: 17, pixels: 12 },
  ],
  limits: { pixels: 1024, outputs: 4, looks: 32 },
  wifi: { hostname: 'lightweaver-aabbcc', ip: '192.168.18.70' },
  projectRevision: 7,
  projectFingerprint: 'a'.repeat(16),
  productionJobId: 'job-42',
  productionJobDigest: 'b'.repeat(64),
};

test('normalizes firmware info into stable card identity and output summary', () => {
  assert.deepEqual(normalizeCardIdentity(firmwareInfo, '192.168.18.70'), {
    id: 'lw-001122aabbcc',
    name: 'Front Mandala',
    firmwareVersion: '1.4.0',
    buildId: 'abc123',
    buildNumber: 411,
    bridgeVersion: 1,
    host: '192.168.18.70',
    hostname: 'lightweaver-aabbcc',
    address: '192.168.18.70',
    outputs: [
      { id: 'left', gpio: 16, count: 44 },
      { id: 'right', gpio: 17, count: 12 },
    ],
    outputCount: 2,
    pixelCount: 56,
    gpioSummary: 'GPIO 16 · 44, GPIO 17 · 12',
    limits: { pixels: 1024, outputs: 4, looks: 32 },
    projectId: 'front-mandala',
    projectRevision: 7,
    projectFingerprint: 'a'.repeat(16),
    productionJobId: 'job-42',
    productionJobDigest: 'b'.repeat(64),
  });
});

test('preserves the exact installed piece id as card project evidence', () => {
  const evidence = normalizeCardProjectEvidence(firmwareInfo);
  assert.equal(evidence.projectId, 'front-mandala');
  assert.equal(normalizeCardIdentity(firmwareInfo).projectId, 'front-mandala');
});

test('normalizes status payloads and rejects missing or wrong identities', () => {
  const status = normalizeCardIdentity({
    cardId: 'lw-aabbccddeeff',
    piece: { name: 'Gallery piece', hostname: 'lightweaver-ddeeff' },
    led: { pixels: 90 },
    outputs: [{ gpio: 21, count: 90 }],
    firmwareVersion: '2.0.0',
  }, 'http://lightweaver-ddeeff.local/');
  assert.equal(status.id, 'lw-aabbccddeeff');
  assert.equal(status.host, 'lightweaver-ddeeff.local');
  assert.equal(status.pixelCount, 90);
  assert.deepEqual(compareCardIdentity({ id: status.id }, status), { ok: true, reason: '' });
  assert.deepEqual(compareCardIdentity({ id: status.id }, {}), { ok: false, reason: 'missing-identity' });
  assert.deepEqual(compareCardIdentity({ id: status.id }, { id: 'lw-other' }), { ok: false, reason: 'wrong-card' });
});

test('accepts only the canonical blank project identity pair from factory firmware', () => {
  const blank = {
    app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
    firmwareVersion: '0.9.0', buildId: 'a'.repeat(40),
    projectRevision: 0, projectFingerprint: '', productionJobId: '', productionJobDigest: '',
  };
  assert.deepEqual(normalizeCardProjectEvidence(blank), {
    app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
    firmwareVersion: '0.9.0', buildId: 'a'.repeat(40),
    projectRevision: 0,
  });
  assert.throws(() => normalizeCardProjectEvidence({
    ...blank, projectRevision: 1,
  }), /invalid project fingerprint/i);
  assert.throws(() => normalizeCardProjectEvidence({
    ...blank, projectRevision: '0',
  }), /invalid project revision/i);
  assert.throws(() => normalizeCardProjectEvidence({
    ...blank, projectRevision: undefined, projectFingerprint: 'b'.repeat(16),
  }), /invalid project revision/i);
});

test('preserves bounded Kaleidoscope capability and exact applied mapping evidence', () => {
  const mapping = {
    id: 'outer', zoneId: 'outer', pixelCount: 8,
    pointCount: 4, startLed: 0, offsets: [0, 0, 0, 0],
    spans: [{ start: 0, count: 8, sourceStart: 0, sourceStep: 1 }],
  };
  const evidence = normalizeCardProjectEvidence({
    app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
    firmwareVersion: '2.0.0', buildId: 'build-kaleidoscope',
    outputs: [{ id: 'out1', pin: 16, pixels: 8 }],
    capabilities: { kaleidoscopeReflectionPoints: 1, futureCapability: 999 },
    kaleidoscopeMappings: [mapping],
  });

  assert.deepEqual(evidence.capabilities, { kaleidoscopeReflectionPoints: 1 });
  assert.deepEqual(evidence.kaleidoscopeMappings, [mapping]);
  assert.throws(() => normalizeCardProjectEvidence({
    app: 'Lightweaver', cardId: 'lw-aabbccddeeff',
    firmwareVersion: '2.0.0', buildId: 'build-kaleidoscope',
    outputs: [{ pin: 16, pixels: 8 }],
    capabilities: { kaleidoscopeReflectionPoints: 1 },
    kaleidoscopeMappings: Array.from({ length: 33 }, (_, index) => ({ ...mapping, id: `outer-${index}` })),
  }), /at most 32/i);
});

test('persists only stable nonsecret identity and connection hints under a versioned key', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const acknowledgedAt = '2026-07-14T12:00:00.000Z';
  persistCardIdentity({
    ...normalizeCardIdentity(firmwareInfo, '192.168.18.70'),
    password: 'never-store-me',
    wifi: { ssid: 'private', password: 'secret' },
    rawNvs: 'secret bytes',
  }, { storage, acknowledgedAt });

  assert.ok(values.has(CARD_IDENTITY_STORAGE_KEY));
  const serialized = values.get(CARD_IDENTITY_STORAGE_KEY);
  assert.doesNotMatch(serialized, /never-store-me|private|secret bytes|password|ssid|rawNvs/i);
  assert.deepEqual(readPersistedCardIdentity({ storage }), {
    version: 1,
    id: 'lw-001122aabbcc',
    name: 'Front Mandala',
    hostname: 'lightweaver-aabbcc',
    address: '192.168.18.70',
    firmwareVersion: '1.4.0',
    buildId: 'abc123',
    buildNumber: 411,
    acknowledgedAt,
  });
});

test('card build label prefers the comparable number and falls back to the revision', () => {
  assert.equal(cardBuildLabel({ buildNumber: 411, buildId: 'a'.repeat(40) }), 'Build 411');
  assert.equal(cardBuildLabel({ buildNumber: 0, buildId: 'a'.repeat(40) }), `Build ${'a'.repeat(12)}`);
  assert.equal(cardBuildLabel({ buildNumber: -3, buildId: 'abc123' }), 'Build abc123');
  assert.equal(cardBuildLabel({}), '');
});

test('storage helpers are safe without a browser', () => {
  assert.equal(readPersistedCardIdentity({ storage: null }), null);
  assert.equal(persistCardIdentity({ id: 'lw-a' }, { storage: null }), false);
});

test('explicit adoption and forgetting re-pairs without silent replacement', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  assert.equal(adoptExpectedCardIdentity({ id: 'lw-first', name: 'First' }, { storage }), true);
  assert.equal(readPersistedCardIdentity({ storage }).id, 'lw-first');
  assert.equal(forgetExpectedCardIdentity({ storage }), true);
  assert.equal(readPersistedCardIdentity({ storage }), null);
  assert.equal(adoptExpectedCardIdentity({ id: 'lw-second', name: 'Second' }, { storage }), true);
  assert.equal(readPersistedCardIdentity({ storage }).id, 'lw-second');
});

test('the setup hotspot SSID is derived from the firmware card id, not invented', () => {
  // Firmware: apSsid() = "Lightweaver-" + %04X of (mac & 0xffff);
  // runtimeCardId() = "lw-" + %012llx of (mac & 0xffffffffffff). The low 16
  // bits are the last four hex characters of the card id.
  assert.equal(setupNetworkSsidForCardId('lw-aabbccddeeff'), 'Lightweaver-EEFF');
  assert.equal(setupNetworkSsidForCardId('lw-001122aabbcc'), 'Lightweaver-BBCC');
  assert.equal(setupNetworkSsidForCardId('lw-00000000000f'), 'Lightweaver-000F');
  // Uppercase input still yields the firmware's uppercase suffix.
  assert.equal(setupNetworkSsidForCardId('LW-AABBCCDDEEFF'), 'Lightweaver-EEFF');
  // Object form, as held on link.card / flow.expectedCard.
  assert.equal(setupNetworkSsidForCardId({ id: 'lw-aabbccddeeff' }), 'Lightweaver-EEFF');
});

test('a card id without the firmware shape never fabricates an SSID', () => {
  for (const value of ['', null, undefined, 'lw-gallery-card', 'lw-remembered-card', 'lw-aabbccddeef', 'lw-aabbccddeeffa', 'aabbccddeeff', 'Lightweaver-EEFF']) {
    assert.equal(setupNetworkSsidForCardId(value), '', `expected no SSID for ${String(value)}`);
  }
});

test('the copy label falls back to a description instead of a fake network name', () => {
  assert.equal(setupNetworkLabelForCardId('lw-aabbccddeeff'), 'Lightweaver-EEFF');
  assert.equal(setupNetworkLabelForCardId('lw-gallery-card'), GENERIC_SETUP_NETWORK_LABEL);
  assert.equal(setupNetworkLabelForCardId(''), GENERIC_SETUP_NETWORK_LABEL);
  assert.match(GENERIC_SETUP_NETWORK_LABEL, /starts with/);
  assert.doesNotMatch(GENERIC_SETUP_NETWORK_LABEL, /XXXX/);
});

// ---------------------------------------------------------------------------
// F13 — after a firmware update, the same card must reconnect without
// re-pairing. Adrian's real card, 2026-09-07: the preserving Wi-Fi update
// 1524 → 1548 left `lw_card_identity_v1` holding the OLD buildId beside a
// buildNumber that had already moved, and every firmware comparison in Studio
// then refused the card in front of him.
// ---------------------------------------------------------------------------

function memoryStorage(seed = null) {
  const values = new Map();
  if (seed) values.set(CARD_IDENTITY_STORAGE_KEY, JSON.stringify(seed));
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

const PAIRED_ON_OLD_BUILD = {
  version: 1,
  id: 'lw-aabbccddeeff',
  name: 'Front Mandala',
  hostname: 'lightweaver-aabbcc',
  address: '192.168.18.70',
  firmwareVersion: '1.1.31',
  buildId: 'a'.repeat(40),
  buildNumber: 1524,
  acknowledgedAt: '2026-09-01T10:00:00.000Z',
};

const UPDATED_CARD = {
  id: 'lw-aabbccddeeff',
  firmwareVersion: '1.1.33',
  buildId: 'c'.repeat(40),
  buildNumber: 1548,
};

function updatedStatus(overrides = {}) {
  return {
    app: 'Lightweaver',
    provisioningContractVersion: 1,
    cardId: UPDATED_CARD.id,
    firmwareVersion: UPDATED_CARD.firmwareVersion,
    buildId: UPDATED_CARD.buildId,
    buildNumber: UPDATED_CARD.buildNumber,
    bootId: 'boot-after-update',
    runtimePhase: 'ready',
    knownGoodProject: true,
    commandReady: true,
    outputReady: true,
    projectId: 'lwproj-front-mandala',
    ...overrides,
  };
}

test('a same-card firmware change re-learns all three firmware fields together', () => {
  const storage = memoryStorage(PAIRED_ON_OLD_BUILD);
  const refreshed = refreshExpectedCardFirmware(UPDATED_CARD, {
    storage, acknowledgedAt: '2026-09-07T09:00:00.000Z',
  });
  assert.equal(refreshed.firmwareVersion, '1.1.33');
  assert.equal(refreshed.buildId, 'c'.repeat(40));
  assert.equal(refreshed.buildNumber, 1548);
  // Everything that is not the firmware note is preserved — this is the same
  // card, still paired, still at the same address, still named the same.
  assert.equal(refreshed.id, PAIRED_ON_OLD_BUILD.id);
  assert.equal(refreshed.name, 'Front Mandala');
  assert.equal(refreshed.address, '192.168.18.70');
  assert.equal(refreshed.acknowledgedAt, '2026-09-07T09:00:00.000Z');
});

test('a build that reports no number stores 0 rather than the previous release’s number', () => {
  const storage = memoryStorage(PAIRED_ON_OLD_BUILD);
  const refreshed = refreshExpectedCardFirmware({
    id: PAIRED_ON_OLD_BUILD.id, firmwareVersion: '1.1.34', buildId: 'dev',
  }, { storage });
  assert.equal(refreshed.buildId, 'dev');
  assert.equal(refreshed.buildNumber, 0,
    'a bench build must never leave a signed release’s number standing beside a buildId it does not belong to');
});

test('a different card is never re-learned, and an unchanged build writes nothing new', () => {
  const storage = memoryStorage(PAIRED_ON_OLD_BUILD);
  assert.equal(refreshExpectedCardFirmware({ ...UPDATED_CARD, id: 'lw-someone-else' }, { storage }), null);
  assert.deepEqual(readPersistedCardIdentity({ storage }), PAIRED_ON_OLD_BUILD);

  // Firmware that has not moved is a no-op, not a rewrite.
  const same = refreshExpectedCardFirmware({
    id: PAIRED_ON_OLD_BUILD.id,
    firmwareVersion: PAIRED_ON_OLD_BUILD.firmwareVersion,
    buildId: PAIRED_ON_OLD_BUILD.buildId,
  }, { storage });
  assert.deepEqual(same, PAIRED_ON_OLD_BUILD);

  // A card that cannot name both halves of its firmware tells us nothing worth
  // writing down; the existing note survives rather than being blanked.
  assert.equal(refreshExpectedCardFirmware({ id: PAIRED_ON_OLD_BUILD.id, buildId: '' }, { storage }), null);
  assert.deepEqual(readPersistedCardIdentity({ storage }), PAIRED_ON_OLD_BUILD);

  // And with no pairing at all there is nothing to bring current.
  assert.equal(refreshExpectedCardFirmware(UPDATED_CARD, { storage: memoryStorage() }), null);
});

test('the paired classifier accepts an updated card and refreshes its note whole', () => {
  const storage = memoryStorage(PAIRED_ON_OLD_BUILD);
  const classified = classifyPairedCardReadiness(updatedStatus(), {
    expectedCard: PAIRED_ON_OLD_BUILD,
    storage,
  });
  assert.equal(classified.state, 'connected',
    'a card answering with the paired id on a newer build is the same card, and it connects');
  assert.equal(classified.reason, '');
  assert.equal(classified.connected, true);

  const stored = readPersistedCardIdentity({ storage });
  assert.equal(stored.buildId, 'c'.repeat(40));
  assert.equal(stored.firmwareVersion, '1.1.33');
  assert.equal(stored.buildNumber, 1548);
});

test('the paired classifier still stops a different card, and writes nothing', () => {
  const storage = memoryStorage(PAIRED_ON_OLD_BUILD);
  const classified = classifyPairedCardReadiness(updatedStatus({ cardId: 'lw-someone-elses' }), {
    expectedCard: PAIRED_ON_OLD_BUILD,
    storage,
  });
  assert.equal(classified.state, 'identity-mismatch');
  assert.equal(classified.reason, 'unexpected-card');
  assert.deepEqual(readPersistedCardIdentity({ storage }), PAIRED_ON_OLD_BUILD);
});

test('the paired classifier leaves every non-identity verdict exactly where it was', () => {
  const storage = memoryStorage(PAIRED_ON_OLD_BUILD);
  // An updated card that is not yet ready is still not-ready — accepting the
  // firmware must not smuggle a card past the runtime gate.
  const notReady = classifyPairedCardReadiness(updatedStatus({ runtimePhase: 'starting' }), {
    expectedCard: PAIRED_ON_OLD_BUILD, storage,
  });
  assert.equal(notReady.state, 'not-ready');
  assert.equal(notReady.reason, 'runtime-not-ready');

  // An unsupported contract is still 'checking', and nothing is re-learned from
  // a card whose identity Studio cannot even validate.
  const unsupported = classifyPairedCardReadiness(updatedStatus({ provisioningContractVersion: 99 }), {
    expectedCard: PAIRED_ON_OLD_BUILD, storage: memoryStorage(PAIRED_ON_OLD_BUILD),
  });
  assert.equal(unsupported.state, 'checking');
  assert.equal(unsupported.reason, 'unsupported-contract');

  // A boot change is still a revalidation.
  const rebooted = classifyPairedCardReadiness(updatedStatus(), {
    expectedCard: PAIRED_ON_OLD_BUILD, storage, previousBootId: 'boot-before-update',
  });
  assert.equal(rebooted.state, 'revalidating');
  assert.equal(rebooted.reason, 'boot-changed');
});

test('the paired classifier accepts an updated card without a store, writing nothing', () => {
  // Pure Node contract paths (and the link reducer under test) run with no
  // browser identity store at all. The classification must still be right.
  const classified = classifyPairedCardReadiness(updatedStatus(), {
    expectedCard: PAIRED_ON_OLD_BUILD,
    storage: null,
  });
  assert.equal(classified.state, 'connected');
  assert.equal(classified.buildNumber, 1548);
});
