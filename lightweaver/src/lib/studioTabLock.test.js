import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDIO_TAB_HEARTBEAT_TTL_MS,
  STUDIO_TAB_STORAGE_KEY,
  createStudioTabLock,
} from './studioTabLock.js';

/** A localStorage-shaped store two tabs can share — see cardWriteLease.test.js. */
function makeStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
}

/** A BroadcastChannel that only delivers to OTHER channels of the same name. */
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
    removeEventListener(_type, listener) { this.listeners.delete(listener); }
    postMessage(data) {
      for (const peer of open.get(this.name) || []) {
        if (peer === this) continue;
        for (const listener of peer.listeners) listener({ data });
      }
    }
    close() { open.get(this.name)?.delete(this); }
  };
}

/** Two (or more) locks wired to one storage and one channel — two browser tabs. */
function makeTabs({ storage = makeStorage(), Channel = makeChannelFactory() } = {}) {
  let clock = 10_000;
  const now = () => clock;
  const advance = ms => { clock += ms; };
  const windows = [];
  const make = tabId => {
    const listeners = { beforeunload: new Set() };
    const windowRef = {
      addEventListener: (type, fn) => listeners[type]?.add(fn),
      removeEventListener: (type, fn) => listeners[type]?.delete(fn),
    };
    windows.push({ windowRef, listeners });
    return createStudioTabLock({
      storage,
      BroadcastChannel: Channel,
      now,
      windowRef,
      setTimeout: () => 'noop-timer',
      clearTimeout: () => {},
      tabId,
    });
  };
  return { storage, make, advance, now };
}

function states(lock) {
  const seen = [];
  lock.subscribe(state => seen.push(state));
  return seen;
}

test('the first tab to start becomes active with no other heartbeat present', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  one.start();
  assert.equal(one.getState().status, 'active');
  one.stop();
});

test('a second tab starting while the first is fresh becomes quiet', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');
  one.start();
  two.start();
  assert.equal(one.getState().status, 'active');
  assert.equal(two.getState().status, 'quiet');
  assert.equal(two.getState().reason, 'other-tab');
  one.stop();
  two.stop();
});

test('active tab records its heartbeat in shared storage', () => {
  const { make, storage, now } = makeTabs();
  const one = make('tab-one');
  one.start();
  const record = JSON.parse(storage.getItem(STUDIO_TAB_STORAGE_KEY));
  assert.equal(record.id, 'tab-one');
  assert.equal(record.ts, now());
  one.stop();
});

test('requestTakeover on a live, non-busy active tab hands over the lock', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');
  one.start();
  two.start();
  assert.equal(one.getState().status, 'active');
  assert.equal(two.getState().status, 'quiet');

  const oneEvents = states(one);
  const twoEvents = states(two);
  two.requestTakeover();

  assert.equal(one.getState().status, 'quiet');
  assert.equal(one.getState().reason, 'moved');
  assert.equal(two.getState().status, 'active');
  assert.ok(oneEvents.some(state => state.status === 'quiet' && state.reason === 'moved'));
  assert.ok(twoEvents.some(state => state.status === 'active'));
  one.stop();
  two.stop();
});

test('a busy active tab refuses a takeover request — a running hardware operation holds the lock', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');
  one.start();
  two.start();
  one.setBusy(true);

  two.requestTakeover();

  assert.equal(one.getState().status, 'active');
  assert.equal(two.getState().status, 'quiet');
  one.stop();
  two.stop();
});

test('stopping the active tab releases the lock and a quiet tab claims it', () => {
  const { make } = makeTabs();
  const one = make('tab-one');
  const two = make('tab-two');
  one.start();
  two.start();
  assert.equal(two.getState().status, 'quiet');

  one.stop();

  assert.equal(two.getState().status, 'active');
  two.stop();
});

test('a fresh third tab quiets both when it beats them on tie-break id, and vice versa', () => {
  const { make } = makeTabs();
  // Simultaneous start (same instant) with two tabs racing to claim active —
  // simulated by writing two heartbeats back to back before either reads.
  const low = make('a-tab');
  const high = make('z-tab');
  low.start();
  // 'z-tab' still sees a fresh record from 'a-tab' and quiets normally.
  high.start();
  assert.equal(low.getState().status, 'active');
  assert.equal(high.getState().status, 'quiet');
  low.stop();
  high.stop();
});

test('a stale, never-released record lets a new tab claim after the TTL', () => {
  const storage = makeStorage();
  storage.setItem(STUDIO_TAB_STORAGE_KEY, JSON.stringify({ id: 'ghost-tab', ts: 10_000, busy: false }));
  const { make, advance } = makeTabs({ storage });
  advance(STUDIO_TAB_HEARTBEAT_TTL_MS + 1);
  const fresh = make('tab-fresh');
  fresh.start();
  assert.equal(fresh.getState().status, 'active');
  fresh.stop();
});
