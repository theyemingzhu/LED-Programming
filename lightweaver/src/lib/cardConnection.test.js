import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cardConnection from './cardConnection.js';

// ── F36: every card-reaching call must forward the link's transport ────────
//
// W1-6 (b6a9bfa9) / F33 (97f71964) / F33b (0598fe44) each fixed ONE site that
// built its own `{ host }` and let the callee guess "bridge" from the page
// protocol (`isMixedContentBlocked()`, always true on https) instead of
// consulting the link it actually held — so a directly connected card read as
// unreachable. Each fix was scoped to the one screen that reported the bug.
// This is the sweep that makes a fourth recurrence a source-level failure
// instead of another ticket: it greps every call in src/v3/*.jsx,
// src/components/**/*.jsx and src/hooks/*.js to the helpers that consult
// `transport` (directly, via `recoveryUsesBridge`, via `selectedTransport`, or
// via `preferBridge` on the live-preview family) and fails when a call's
// options literal reaches by host but never mentions transport.
const LIGHTWEAVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const GUARDED_CALLS = [
  'recoverCardLightsVerified',
  'readCardStatusEnvelope',
  'readCardZonesFromCard',
  'readCardPatternsFromCard',
  'pushLivePreviewToCard',
  'connectCardTransport',
  'readCardProjectEvidence',
  'requestCardReboot',
  'pushConfigToCard',
  'pushLiveHardwareToCard',
  'postPlaylistControlToCard',
  'identifyCardLights',
  'stopCardLights',
  'pushSectionPreviewToCard',
  'resetLiveOutputOnCard',
  'repairMirroredLedOutputOnCard',
  'readBackLivePreview',
  'recoverCardLights',
];

// lw-flash.jsx is a different agent's concurrent worktree for this same
// ticket family (F36 brief) — this contract does not police it. Every other
// deliberate exception (a probe that IS how a transport gets discovered, not
// a call that already knows one) is silenced call-by-call with the
// `// transport: n/a (reason)` comment instead, so a different bare call in
// the same file still fails loudly.
const EXCLUDED_FILES = new Set(['src/v3/lw-flash.jsx']);

function listFilesRecursive(dir, pattern) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full, pattern));
    else if (pattern.test(entry.name)) out.push(full);
  }
  return out;
}

function guardedSourceFiles(root = LIGHTWEAVER_ROOT) {
  const files = [
    ...fs.readdirSync(path.join(root, 'src/v3'))
      .filter(name => name.endsWith('.jsx'))
      .map(name => path.join('src/v3', name)),
    ...listFilesRecursive(path.join(root, 'src/components'), /\.jsx$/)
      .map(full => path.relative(root, full)),
    ...(fs.existsSync(path.join(root, 'src/hooks'))
      ? fs.readdirSync(path.join(root, 'src/hooks'))
        .filter(name => name.endsWith('.js') && !name.endsWith('.test.js'))
        .map(name => path.join('src/hooks', name))
      : []),
  ];
  return files
    .map(file => file.split(path.sep).join('/'))
    .filter(file => !EXCLUDED_FILES.has(file));
}

// The text of one call, from its opening paren through the BALANCED closing
// paren — skipping string/template contents and comments so a stray paren in
// a message (or the word "host" in a comment) never desyncs the scan.
function callSpan(text, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openParenIndex, i + 1);
    } else if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i += 1;
        i += 1;
      }
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1;
    }
  }
  return text.slice(openParenIndex);
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function allowListedNearby(lines, lineIndex) {
  for (const n of [lineIndex, lineIndex - 1]) {
    const line = lines[n - 1];
    if (line && /\/\/\s*transport:\s*n\/a\s*\(.+\)/.test(line)) return true;
  }
  return false;
}

const CALL_NAME_RE = new RegExp(`(?<![A-Za-z0-9_.])(${GUARDED_CALLS.join('|')})\\s*\\(`, 'g');

function findTransportForwardingViolations(root = LIGHTWEAVER_ROOT) {
  const violations = [];
  for (const relFile of guardedSourceFiles(root)) {
    const full = path.join(root, relFile);
    const text = fs.readFileSync(full, 'utf8');
    const lines = text.split('\n');
    CALL_NAME_RE.lastIndex = 0;
    let match;
    while ((match = CALL_NAME_RE.exec(text))) {
      const openParenIndex = match.index + match[0].length - 1;
      const span = callSpan(text, openParenIndex);
      if (!/\bhost\b/.test(span)) continue;
      const compliant = /\bcardConnectionOptionsFor\b/.test(span) || /\btransport\b/.test(span);
      if (compliant) continue;
      const lineIndex = lineNumberAt(text, match.index);
      if (allowListedNearby(lines, lineIndex)) continue;
      violations.push(`${relFile}:${lineIndex} ${match[1]}(...) -> ${span.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }
  return violations;
}

test('every card-reaching call in Studio forwards the link transport (F36)', () => {
  const files = guardedSourceFiles();
  assert.ok(files.length > 20, `expected the sweep to see a substantial file set, saw ${files.length}`);
  const violations = findTransportForwardingViolations();
  assert.deepEqual(
    violations,
    [],
    `card-reaching call(s) build { host } without transport, so a directly-connected card on https will be guessed at instead of reached (W1-6/F33/F33b/F36). Fix by spreading cardConnectionOptionsFor(cardLink, host), or add "// transport: n/a (reason)" on the call's line (or the line above) when the omission is deliberate:\n${violations.join('\n')}`,
  );
});

function fakeBrowser(search, storedHost = cardConnection.DEFAULT_CARD_HOST) {
  const values = new Map([[cardConnection.CARD_HOST_STORAGE_KEY, storedHost]]);
  const events = [];
  return {
    events,
    window: {
      location: { search },
      localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
      },
      dispatchEvent: event => events.push(event),
    },
  };
}

async function withFakeBrowser(browser, run) {
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.window = browser.window;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  try {
    await run();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
}

test('ordinary recovery leaves a stale literal address for the paired stable hostname', () => {
  assert.equal(typeof cardConnection.ordinaryCardRecoveryHost, 'function');
  assert.equal(cardConnection.ordinaryCardRecoveryHost('192.168.18.70', {
    id: 'lw-gallery',
    hostname: 'gallery-card.local',
    address: '192.168.18.70',
  }), 'gallery-card.local');
  assert.equal(cardConnection.ordinaryCardRecoveryHost('gallery-card.local', {
    id: 'lw-gallery',
    hostname: 'gallery-card.local',
    address: '192.168.18.70',
  }), 'gallery-card.local');
  assert.equal(cardConnection.ordinaryCardRecoveryHost('192.168.18.70', {
    id: 'lw-gallery',
    hostname: 'card.example.com',
    address: '192.168.18.70',
  }), 'lightweaver.local');
});

test('URL bootstrap adopts a private card IP before mDNS and dispatches one host change', async () => {
  const browser = fakeBrowser('?cardBridge=1&cardHost=192.168.18.70');
  await withFakeBrowser(browser, () => {
    assert.equal(cardConnection.bootstrapCardHostFromLocation(), '192.168.18.70');
    assert.equal(cardConnection.readStoredCardHost(), '192.168.18.70');
    assert.deepEqual(cardConnection.readStoredCardHostHistory(), ['192.168.18.70']);
    assert.deepEqual(browser.events.map(event => ({ type: event.type, detail: event.detail })), [{
      type: cardConnection.CARD_HOST_CHANGED_EVENT,
      detail: { host: '192.168.18.70' },
    }]);
    assert.deepEqual(cardConnection.candidateCardHosts('', {
      id: 'lw-gallery',
      hostname: 'lightweaver.local',
      address: '192.168.4.1',
    }).slice(0, 3), [
      '192.168.18.70',
      'lightweaver.local',
      '192.168.4.1',
    ]);
    assert.equal(cardConnection.bootstrapCardHostFromLocation(), '192.168.18.70');
    assert.equal(browser.events.length, 1);
  });
});

test('a stalled URL card hint gets only a bounded head start before mDNS fallback', async () => {
  const browser = fakeBrowser('?cardHost=192.168.18.70');
  await withFakeBrowser(browser, async () => {
    cardConnection.bootstrapCardHostFromLocation();
    const startedAt = Date.now();
    const requested = [];
    const found = await cardConnection.discoverCardStatus({
      expectedCard: { id: 'lw-gallery', hostname: 'lightweaver.local' },
      timeoutMs: 5_000,
      persist: false,
      fetchImpl: (url, { signal } = {}) => {
        const host = new URL(url).hostname;
        requested.push(host);
        if (host === '192.168.18.70') {
          return new Promise((resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ cardId: 'lw-gallery' }),
        });
      },
    });
    assert.equal(requested[0], '192.168.18.70');
    assert.equal(found.host, 'lightweaver.local');
    assert.ok(Date.now() - startedAt < 1_000, 'fallback should start after the bounded head start, not the fetch timeout');
  });
});

test('discovery uses a remembered station IP when mDNS stalls', async () => {
  const browser = fakeBrowser('', 'lightweaver.local');
  await withFakeBrowser(browser, async () => {
    cardConnection.rememberCardHost('192.168.18.70');
    const requested = [];
    const found = await cardConnection.discoverCardStatus({
      preferredHost: 'lightweaver.local',
      timeoutMs: 200,
      persist: false,
      fetchImpl: (url, { signal } = {}) => {
        const host = new URL(url).hostname;
        requested.push(host);
        if (host === 'lightweaver.local' || host === '192.168.4.1') {
          return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        }
        if (host === '192.168.18.70') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ app: 'Lightweaver', cardId: 'lw-b0fe81f61b44' }),
          });
        }
        return Promise.reject(new Error(`unexpected ${host}`));
      },
    });
    assert.equal(found.connected, true);
    assert.equal(found.host, '192.168.18.70');
    assert.ok(requested.includes('192.168.18.70'));
  });
});

test('URL bootstrap rejects a public card host and preserves the stored local host', async () => {
  const browser = fakeBrowser('?cardHost=card.attacker.example');
  await withFakeBrowser(browser, () => {
    assert.equal(cardConnection.bootstrapCardHostFromLocation(), cardConnection.DEFAULT_CARD_HOST);
    assert.equal(cardConnection.readStoredCardHost(), cardConnection.DEFAULT_CARD_HOST);
    assert.deepEqual(cardConnection.readStoredCardHostHistory(), []);
    assert.equal(browser.events.length, 0);
  });
});
