import assert from 'node:assert/strict';
import test from 'node:test';

import { postPlaylistControlToCard, recoverCardLights, zoneConfirmsLivePreviewIntent } from './cardLiveControl.js';

// zoneConfirmsLivePreviewIntent is the pure comparison readBackLivePreview
// leans on to decide whether a card's own `/api/zones` report already shows a
// live-preview write that lost its acknowledgement. It is exercised here
// without a network or a simulated card so the field-by-field contract (wire
// name in, control name out, numeric tolerance, exact booleans) is provable
// on its own.

test('zoneConfirmsLivePreviewIntent: true when every present field matches within tolerance', () => {
  const controlPayload = { brightness: 0.42, speed: 1.3, hue: 88, saturation: 210 };
  const zone = {
    id: 'zone-all', patternId: 'aurora',
    brightness: 0.42, speed: 1.3, customHue: 88, customSaturation: 210,
    hueShift: 0, customBreathe: false,
  };
  assert.equal(zoneConfirmsLivePreviewIntent(controlPayload, zone), true);
});

test('zoneConfirmsLivePreviewIntent: only checks fields actually present in the payload', () => {
  const controlPayload = { brightness: 0.5 };
  const zone = { brightness: 0.5, speed: 999, customHue: 1, customSaturation: 1 };
  assert.equal(zoneConfirmsLivePreviewIntent(controlPayload, zone), true);
});

test('zoneConfirmsLivePreviewIntent: numeric fields tolerate a small amount of drift, not a large one', () => {
  const zone = { brightness: 0.50 };
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.505 }, zone), true, 'well within 0.01 is still a match');
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.55 }, zone), false, 'well beyond 0.01 is not a match');
});

test('zoneConfirmsLivePreviewIntent: boolean fields must match exactly, not by truthiness', () => {
  const zone = { customBreathe: false };
  assert.equal(zoneConfirmsLivePreviewIntent({ breathe: true }, zone), false);
  assert.equal(zoneConfirmsLivePreviewIntent({ breathe: false }, zone), true);
});

// ── postPlaylistControlToCard: the timed-playlist transport verb ─────────
// Reuses the same /api/control endpoint and transport-authority gate every
// other live control already goes through — this only proves the verb it
// posts and that it refuses anything outside the four the card understands.

test('postPlaylistControlToCard posts { playlist: <verb> } to /api/control through the active transport authority', async () => {
  const calls = [];
  const authority = {
    async request(path, opts) {
      calls.push({ path, opts });
      return { ok: true, playlist: { configured: true, playing: true, entryIndex: 0, entryCount: 2, patternId: 'plasma', remainingSeconds: 20 } };
    },
  };
  for (const verb of ['play', 'pause', 'next', 'previous']) {
    calls.length = 0;
    const response = await postPlaylistControlToCard(verb, { authority });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/api/control');
    assert.equal(calls[0].opts.method, 'POST');
    assert.deepEqual(calls[0].opts.body, { playlist: verb });
    assert.equal(response.ok, true);
  }
});

test('postPlaylistControlToCard refuses a verb the card contract does not define', async () => {
  await assert.rejects(
    () => postPlaylistControlToCard('rewind', { authority: { request: async () => ({ ok: true }) } }),
    error => error?.reason === 'invalid-playlist-verb',
  );
});

test('zoneConfirmsLivePreviewIntent: false when a targeted field is missing or non-numeric on the zone', () => {
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.5 }, { brightness: undefined }), false);
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.5 }, { brightness: 'bright' }), false);
});

test('zoneConfirmsLivePreviewIntent: patternId compares by the same wire/control name (the runtime id)', () => {
  assert.equal(zoneConfirmsLivePreviewIntent({ patternId: 'fire-2' }, { patternId: 'fire-2' }), true);
  assert.equal(zoneConfirmsLivePreviewIntent({ patternId: 'fire-2' }, { patternId: 'aurora' }), false);
});

test('zoneConfirmsLivePreviewIntent: false without a usable payload or zone', () => {
  assert.equal(zoneConfirmsLivePreviewIntent(null, { brightness: 0.5 }), false);
  assert.equal(zoneConfirmsLivePreviewIntent({ brightness: 0.5 }, null), false);
});

test('zoneConfirmsLivePreviewIntent: an empty payload confirms trivially (nothing was asked)', () => {
  assert.equal(zoneConfirmsLivePreviewIntent({}, { brightness: 0.1 }), true);
});

// F29 — recoverCardLights({ restartCard: true }) redelivers the recovery
// command after the card reboots. That post-restart redeliver used to budget
// each attempt (both the identity guard and the fetch itself) at
// Math.min(options.timeoutMs || 3000, 1200) instead of the same 3000ms budget
// used everywhere else in the recovery path. A card that answers ok but slow
// (here: 1500ms, comfortably inside the real 3000ms budget) looked like a
// timeout under the stale 1200ms cap, so the retry loop resent a command the
// card had already accepted — a real duplicate physical write. This harness
// simulates the card over a mocked global fetch: the pre-restart send
// resolves immediately, the reboot resolves immediately, and the wiring
// -status probe is unsupported (as on real legacy firmware) so it falls
// through the try/catch untouched. Only the first post-restart recover-lights
// POST is slow; if the retry loop honours the full budget it never needs a
// second one.
function abortAwareDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
      return;
    }
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
    }, { once: true });
  });
}

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function recoverLightsOkBody() {
  return {
    ok: true,
    accepted: true,
    diagnostics: { rendered: true, frameSubmitted: true, nonBlackPixels: 5, brightnessByte: 120 },
  };
}

async function runSimulatedRestartRecovery({ slowPostRestartDelayMs = 1500 } = {}) {
  const originalFetch = globalThis.fetch;
  let totalRecoverLightsCalls = 0;
  let postRestartRecoverLightsCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith('/api/wiring/status')) {
      // Real legacy firmware has no wiring-safety API; recoverCardLights
      // catches this and continues without a rollback.
      throw new Error('simulated legacy firmware: no wiring-safety API');
    }
    if (target.endsWith('/api/reboot')) return jsonResponse({ ok: true });
    if (target.endsWith('/api/recover-lights')) {
      totalRecoverLightsCalls += 1;
      if (totalRecoverLightsCalls > 1) {
        postRestartRecoverLightsCalls += 1;
        if (postRestartRecoverLightsCalls === 1) {
          await abortAwareDelay(slowPostRestartDelayMs, init.signal);
        }
      }
      return jsonResponse(recoverLightsOkBody());
    }
    throw new Error(`unexpected fetch to ${target} in simulated restart recovery`);
  };
  try {
    const response = await recoverCardLights(
      { patternId: 'warm-white', brightness: 1 },
      {
        host: 'lightweaver.local',
        restartCard: true,
        timeoutMs: 3000,
        restartSettleMs: 5,
        restartRetryMs: 20,
        restartTimeoutMs: 5000,
        reclaimFrameStreams: async () => {},
      },
    );
    return { response, totalRecoverLightsCalls, postRestartRecoverLightsCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('F29: a post-restart recovery that answers ok but slow is not resent', async () => {
  const { response, postRestartRecoverLightsCalls } = await runSimulatedRestartRecovery({ slowPostRestartDelayMs: 1500 });
  assert.equal(response.restarted, true);
  assert.equal(
    postRestartRecoverLightsCalls,
    1,
    'the post-restart redeliver phase must send exactly one /api/recover-lights POST when the card answers ok within the 3000ms budget',
  );
});

// ---------------------------------------------------------------------------
// W1-6: Recover lights takes the transport the caller has established. On an
// https Studio page whose browser allows the plain-http card fetch, the link
// is connected-direct; routing the recovery to a card-page bridge that was
// never opened failed with "Open the card page once…" against a card that
// was answering directly. With transport 'direct' every request — the
// identity guard, the wiring-safety read, the recovery itself — goes over
// fetch, and the bridge is never consulted.
// ---------------------------------------------------------------------------

function httpsBrowserWithIdentity() {
  const values = new Map([
    ['lw_card_identity_v1', JSON.stringify({ version: 1, id: 'lw-b0fe81f61b44' })],
  ]);
  return {
    location: { protocol: 'https:' },
    localStorage: {
      getItem: name => values.get(name) ?? null,
      setItem: (name, value) => values.set(name, value),
      removeItem: name => values.delete(name),
    },
  };
}

test('recoverCardLights honours an explicit direct transport on an https page', { concurrency: false }, async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const urls = [];
  const answer = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
  const fetchImpl = async url => {
    const path = new URL(String(url)).pathname;
    urls.push(path);
    if (path === '/api/firmware-info' || path === '/api/status') {
      return answer({ app: 'Lightweaver', cardId: 'lw-b0fe81f61b44', runtimePhase: 'ready', commandReady: true });
    }
    if (path === '/api/wiring-status') return answer({ error: 'not found' }, false, 404);
    if (path === '/api/recover-lights') {
      return answer({ ok: true, accepted: true, diagnostics: { rendered: true, frameSubmitted: true, nonBlackPixels: 41, brightnessByte: 90 } });
    }
    return answer({ error: `unexpected ${path}` }, false, 404);
  };
  globalThis.window = httpsBrowserWithIdentity();
  globalThis.fetch = fetchImpl;
  try {
    const response = await recoverCardLights(
      { patternId: 'warm-white', brightness: 0.35, syncZones: true },
      {
        host: '192.168.18.70',
        transport: 'direct',
        fetchImpl,
        autoDiscover: false,
        reclaimFrameStreams: async () => {},
      },
    );
    assert.equal(response.accepted, true);
    assert.ok(urls.includes('/api/recover-lights'), `recovery must be posted directly; saw ${urls.join(', ')}`);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
