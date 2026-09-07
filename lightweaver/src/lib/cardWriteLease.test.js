import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_WRITE_LEASE_STORAGE_KEY,
  CARD_WRITE_LEASE_TTL_MS,
  cardWriteLeaseKey,
  createCardWriteLeaseRegistry,
  describeCardWriteConflict,
} from './cardWriteLease.js';

const CARD = 'lw-b0fe81f61b44';

/** A localStorage-shaped store two registries can share, the way two tabs of
 * one origin share the real one — including the case where one of them wipes
 * it underneath the other. */
function makeStorage() {
  const map = new Map();
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    clear: () => map.clear(),
  };
}

/** A BroadcastChannel that only delivers to OTHER channels of the same name,
 * exactly like the browser's. */
function makeChannelFactory() {
  const open = new Map();
  return class TestChannel {
    constructor(name) {
      this.name = name;
      this.listeners = new Set();
      if (!open.has(name)) open.set(name, new Set());
      open.get(name).add(this);
    }
    addEventListener(_type, listener) { this.listeners.add(listener); }
    postMessage(data) {
      for (const peer of open.get(this.name) || []) {
        if (peer === this) continue;
        for (const listener of peer.listeners) listener({ data });
      }
    }
    close() { open.get(this.name)?.delete(this); }
  };
}

/** Two registries wired to one storage and one channel — two tabs. */
function makeTabs({ storage = makeStorage(), Channel = makeChannelFactory() } = {}) {
  let clock = 1_000;
  const now = () => clock;
  const advance = ms => { clock += ms; };
  const make = tabId => createCardWriteLeaseRegistry({
    storage,
    BroadcastChannel: Channel,
    now,
    // Renewal is driven by hand in these tests; nothing schedules itself.
    setInterval: () => null,
    clearInterval: () => {},
    tabId,
  });
  return { storage, make, advance, now };
}

test('normalises a card key from an id, an identity object or a host', () => {
  assert.equal(cardWriteLeaseKey('  LW-AABB  '), 'lw-aabb');
  assert.equal(cardWriteLeaseKey({ cardId: 'LW-AABB' }), 'lw-aabb');
  assert.equal(cardWriteLeaseKey({ id: 'LW-AABB' }), 'lw-aabb');
  assert.equal(cardWriteLeaseKey({ host: 'Lightweaver.local' }), 'lightweaver.local');
  assert.equal(cardWriteLeaseKey(''), '');
});

test('acquires a lease and records the exact owner in shared storage', () => {
  const { storage, make, now } = makeTabs();
  const one = make('tab-one');

  const taken = one.acquire({ cardId: CARD, operation: 'install-project' });

  assert.equal(taken.ok, true);
  assert.deepEqual(taken.lease, {
    cardId: CARD,
    operation: 'install-project',
    tabId: 'tab-one',
    startedAt: now(),
    expiresAt: now() + CARD_WRITE_LEASE_TTL_MS,
  });
  assert.deepEqual(JSON.parse(storage.getItem(CARD_WRITE_LEASE_STORAGE_KEY)), taken.lease);
});

test('a second tab is refused while the first holds, and is told which operation', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'install-project' });
  const blocked = two.acquire({ cardId: CARD, operation: 'install-project' });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.conflict.tabId, 'tab-one');
  assert.equal(blocked.conflict.operation, 'install-project');
  assert.equal(
    blocked.message,
    'Another Studio tab is installing a project on this card. Try again when the other tab finishes.',
  );
  assert.equal(two.holds(CARD), false);
});

test('a refused tab is told the operation it is actually waiting on, not a generic one', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'firmware-update' });
  const blocked = two.acquire({ cardId: CARD, operation: 'install-project' });

  assert.match(blocked.message, /updating this card’s firmware/);
  assert.match(describeCardWriteConflict({ operation: 'not-a-known-operation' }), /writing to this card/);
});

test('release hands ownership on, so the waiting tab can resume', () => {
  const { make, storage } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  const taken = one.acquire({ cardId: CARD, operation: 'install-project' });
  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, false);

  taken.release();

  assert.equal(storage.getItem(CARD_WRITE_LEASE_STORAGE_KEY), null);
  assert.equal(one.holds(CARD), false);
  const resumed = two.acquire({ cardId: CARD, operation: 'install-project' });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.lease.tabId, 'tab-two');
});

test('releasing twice releases once — a double finally cannot free another tab’s lease', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  const taken = one.acquire({ cardId: CARD, operation: 'install-project' });
  taken.release();
  const resumed = two.acquire({ cardId: CARD, operation: 'install-project' });
  assert.equal(resumed.ok, true);

  taken.release(); // the same finally running again must be inert

  assert.equal(two.holds(CARD), true);
  assert.equal(one.acquire({ cardId: CARD, operation: 'install-project' }).ok, false);
});

test('the same tab re-enters its own lease, and an inner release does not drop the outer hold', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  const outer = one.acquire({ cardId: CARD, operation: 'install-project' });
  const inner = one.acquire({ cardId: CARD, operation: 'activate-wiring' });
  assert.equal(inner.ok, true);

  inner.release();
  assert.equal(one.holds(CARD), true);
  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, false);

  outer.release();
  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, true);
});

test('a lease on one card never blocks a different card', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'install-project' });

  const other = two.acquire({ cardId: 'lw-other-card', operation: 'install-project' });
  assert.equal(other.ok, true);
  assert.equal(two.readOwner(CARD).tabId, 'tab-one');
  assert.equal(two.readOwner('lw-other-card'), null);
});

test('a card Studio cannot name yet is not leasable, and is not blocked either', () => {
  const { make } = makeTabs();
  const one = make('tab-one');

  const taken = one.acquire({ cardId: '', operation: 'install-project' });

  assert.equal(taken.ok, true);
  assert.equal(taken.lease, null);
  assert.equal(one.holds(''), false);
  assert.doesNotThrow(() => taken.release());
});

test('a stale holder that stopped renewing is taken over only after it has lapsed', () => {
  const { make, advance } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'install-project' }); // tab one now "crashes": it never renews or releases.

  advance(CARD_WRITE_LEASE_TTL_MS - 1);
  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, false, 'still inside the TTL');

  advance(2);
  const takenOver = two.acquire({ cardId: CARD, operation: 'install-project' });
  assert.equal(takenOver.ok, true, 'a lapsed holder is taken over');
  assert.equal(takenOver.lease.tabId, 'tab-two');
});

test('renewal keeps a slow write owned past the TTL', () => {
  const { make, advance } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'install-project' });

  for (let tick = 0; tick < 6; tick += 1) {
    advance(CARD_WRITE_LEASE_TTL_MS - 500);
    one.renew();
  }

  assert.equal(
    two.acquire({ cardId: CARD, operation: 'install-project' }).ok,
    false,
    'a write that outlives the TTL must still own the card while it is renewing',
  );
});

test('a live holder survives another context clearing this origin’s storage', () => {
  const { make, storage, advance } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'install-project' });
  storage.clear(); // exactly what a second tab seeding itself does.

  // The broadcast alone already keeps the holder visible…
  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, false);
  // …and the next renewal puts the durable record back.
  advance(100);
  one.renew();
  assert.equal(JSON.parse(storage.getItem(CARD_WRITE_LEASE_STORAGE_KEY)).tabId, 'tab-one');
});

test('a holder with no channel at all is still seen through storage', () => {
  const { make } = makeTabs({ Channel: null });
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'install-project' });

  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, false);
});

test('a holder with no storage at all is still seen through the channel', () => {
  const { make } = makeTabs({ storage: null });
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'install-project' });

  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, false);
  assert.equal(two.readOwner(CARD).tabId, 'tab-one');
});

test('closing a tab releases everything it held immediately', () => {
  const { make, storage } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');

  one.acquire({ cardId: CARD, operation: 'install-project' });
  one.close();

  assert.equal(storage.getItem(CARD_WRITE_LEASE_STORAGE_KEY), null);
  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, true);
});

test('a corrupt or half-written record never blocks a write', () => {
  const { make, storage } = makeTabs();
  const two = make('tab-two');

  storage.setItem(CARD_WRITE_LEASE_STORAGE_KEY, '{not json');
  assert.equal(two.acquire({ cardId: CARD, operation: 'install-project' }).ok, true);
  two.acquire({ cardId: CARD, operation: 'install-project' });

  storage.setItem(CARD_WRITE_LEASE_STORAGE_KEY, JSON.stringify({ cardId: CARD, tabId: 'tab-one' }));
  assert.equal(two.readOwner(CARD), null, 'a record with no expiry is not a lease');
});
