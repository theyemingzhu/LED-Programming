import test from 'node:test';
import assert from 'node:assert/strict';

// The store installs its hardware-operation listener at import time, so the
// window has to exist first. Everything below shares that one window.
class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const target = new EventTarget();
globalThis.window = {
  location: { protocol: 'http:', href: 'http://localhost/', hash: '' },
  localStorage: new FakeStorage(),
  sessionStorage: new FakeStorage(),
  CustomEvent,
  addEventListener: (...args) => target.addEventListener(...args),
  removeEventListener: (...args) => target.removeEventListener(...args),
  dispatchEvent: event => target.dispatchEvent(event),
};
globalThis.localStorage = globalThis.window.localStorage;

const {
  freshJourneyEvidence,
  getCardJourneyEvidence,
  hasFreshCardJourneyEvidence,
  invalidateCardJourneyEvidence,
  publishCardJourneyEvidence,
  refreshCardJourneyEvidence,
  resetCardJourneyEvidence,
  subscribeCardJourneyEvidence,
} = await import('./cardJourneyEvidence.js');
const { beginStudioHardwareOperation } = await import('./studioHardwareOperation.js');

const CARD_LINK = Object.freeze({
  state: 'connected-direct',
  host: '192.168.18.70',
  transport: 'direct',
  card: { id: 'lw-evidence-test' },
  readiness: { cardId: 'lw-evidence-test', bootId: 'boot-1' },
});

test.beforeEach(() => { resetCardJourneyEvidence(); });

test('a published snapshot is what every subscriber reads', () => {
  const seen = [];
  const unsubscribe = subscribeCardJourneyEvidence(snapshot => seen.push(snapshot));
  publishCardJourneyEvidence({
    cardLink: CARD_LINK,
    projectId: 'lotus-gate',
    status: { projectId: 'lotus-gate' },
    wiringStatus: { state: 'testing', activationId: 'a1' },
    resolutionKind: 'matches-current',
    matchesOpenProject: true,
  });
  unsubscribe();

  const snapshot = getCardJourneyEvidence();
  assert.equal(snapshot.cardId, 'lw-evidence-test');
  assert.equal(snapshot.bootId, 'boot-1');
  assert.equal(snapshot.host, '192.168.18.70');
  assert.equal(snapshot.read, true);
  assert.equal(snapshot.matchesOpenProject, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], snapshot);

  publishCardJourneyEvidence({ cardLink: CARD_LINK });
  assert.equal(seen.length, 1, 'an unsubscribed listener stops hearing');
});

test('a snapshot from another boot is not evidence about this one', () => {
  publishCardJourneyEvidence({
    cardLink: CARD_LINK,
    wiringStatus: { state: 'testing', activationId: 'a1' },
  });
  const otherBoot = { ...CARD_LINK, readiness: { cardId: 'lw-evidence-test', bootId: 'boot-2' } };
  const otherCard = { ...CARD_LINK, card: { id: 'lw-somebody-else' }, readiness: { cardId: 'lw-somebody-else', bootId: 'boot-1' } };

  assert.equal(freshJourneyEvidence(getCardJourneyEvidence(), CARD_LINK).read, true);
  assert.equal(freshJourneyEvidence(getCardJourneyEvidence(), otherBoot).read, false);
  assert.equal(freshJourneyEvidence(getCardJourneyEvidence(), otherCard).read, false);
  assert.equal(freshJourneyEvidence(getCardJourneyEvidence(), null).read, false);
  assert.equal(freshJourneyEvidence(getCardJourneyEvidence(), otherBoot).wiringStatus, null);
});

test('a finished hardware operation marks the evidence stale without discarding it', () => {
  publishCardJourneyEvidence({
    cardLink: CARD_LINK,
    wiringStatus: { state: 'testing', activationId: 'a1' },
  });
  assert.equal(hasFreshCardJourneyEvidence(CARD_LINK), true);

  const finish = beginStudioHardwareOperation('wiring-test', globalThis.window);
  assert.equal(getCardJourneyEvidence().stale, false, 'starting an operation does not invalidate');
  finish();

  const snapshot = getCardJourneyEvidence();
  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.read, true, 'the last account is kept until the re-read lands');
  assert.equal(snapshot.wiringStatus.activationId, 'a1');
  assert.equal(hasFreshCardJourneyEvidence(CARD_LINK), false);
});

test('invalidating an empty store changes nothing', () => {
  const before = getCardJourneyEvidence();
  invalidateCardJourneyEvidence();
  assert.equal(getCardJourneyEvidence(), before);
});

test('concurrent refreshes for one card and boot share a single flight', async () => {
  let calls = 0;
  const release = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    calls += 1;
    return new Promise(resolve => release.push(() => resolve({ ok: false, status: 503, json: async () => ({}) })));
  };
  try {
    const first = refreshCardJourneyEvidence({ cardLink: CARD_LINK, reason: 'mount' });
    const second = refreshCardJourneyEvidence({ cardLink: CARD_LINK, reason: 'mount' });
    assert.equal(first, second, 'a second caller joins the flight in progress');
    // Three reads per flight: the status envelope, the wiring status, and the
    // zones envelope (F16 — the blackout fact lives only in /api/zones).
    assert.equal(calls, 3);
    for (const resolve of release) resolve();
    await first;
    // Both card reads failed, so the snapshot records the attempt and nothing
    // more. It must never throw — a screen asking for evidence is not an
    // operation the owner can be shown an error about.
    const snapshot = getCardJourneyEvidence();
    assert.equal(snapshot.read, true);
    assert.equal(snapshot.status, null);
    assert.equal(snapshot.wiringStatus, null);
    assert.equal(snapshot.blackout, false, 'a failed zones read must not assert a blackout that was never seen');

    const third = refreshCardJourneyEvidence({ cardLink: CARD_LINK });
    assert.notEqual(third, first, 'a finished flight does not block the next read');
    for (const resolve of release.splice(0)) resolve();
    await third;
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// F16: Card lw-b0fe81f61b44 held the open project, reported "Connected"/
// "Card firmware 1548 ✓", yet /api/zones held blackout:true and the strip was
// dark. Studio never surfaced it because nothing read /api/zones into the
// shared journey evidence — this is the read, plus the preserve-on-publish
// contract SetupScreen's own richer publish (which knows nothing about
// zones) depends on to not clobber it every poll.
test('a successful zones read publishes blackout, and a plain publish for the same card preserves it', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const href = String(url);
    if (href.includes('/api/zones')) {
      return { ok: true, json: async () => ({ zones: [{ id: 'zone-all', blackout: true }] }) };
    }
    if (href.includes('/api/status')) {
      return { ok: true, json: async () => ({ cardId: 'lw-evidence-test', bootId: 'boot-1' }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    await refreshCardJourneyEvidence({ cardLink: CARD_LINK, reason: 'mount' });
    assert.equal(getCardJourneyEvidence().blackout, true, 'a zones read reporting blackout must be recorded');

    // SetupScreen's own richer read (lw-setup.jsx) re-publishes evidence
    // directly on every card poll and passes no blackout field at all — it
    // must not silently clear a real blackout a moment after the zones read
    // learned it.
    publishCardJourneyEvidence({ cardLink: CARD_LINK, projectId: 'lotus-gate' });
    assert.equal(
      getCardJourneyEvidence().blackout,
      true,
      'a plain publish for the same card and boot must preserve the last known blackout fact',
    );

    // A snapshot for a DIFFERENT boot must never inherit a fact it never read.
    const otherBoot = { ...CARD_LINK, readiness: { cardId: 'lw-evidence-test', bootId: 'boot-2' } };
    publishCardJourneyEvidence({ cardLink: otherBoot });
    assert.equal(
      getCardJourneyEvidence().blackout,
      false,
      'a snapshot for a different boot must not inherit a blackout fact it never read',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a link with no card id is never read from', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; return Promise.reject(new Error('no')); };
  try {
    await refreshCardJourneyEvidence({ cardLink: { state: 'disconnected' } });
    assert.equal(calls, 0);
    assert.equal(getCardJourneyEvidence().read, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
