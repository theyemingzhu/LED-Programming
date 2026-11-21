// No test reaches the physical card, or any other address off this Mac,
// unless a person asked for real-card work in so many words.
//
// Why this exists (2026-11-21): a run of `playwright test` whose file list
// came up empty ran the WHOLE suite, which includes the live-hardware specs
// (tests/live-*.spec.ts). Those opened Studio against the physical test card
// at 192.168.18.70, reset it to the bench discovery project and restarted it,
// wiping the owner's looks and sections. Nothing stopped them because a spec
// that installs no simulator simply talks to the real network.
//
// Three layers, all off only when LW_ALLOW_PHYSICAL_CARD=1 (no CI job and no
// default run sets it):
//
//  1. `guardTestIgnore` — the live-hardware specs are not collected at all.
//  2. `guardLaunchOptions` — every browser sends every non-loopback request
//     (http, https, ws, any host, IP literal or .local name) to a tripwire
//     proxy on this Mac that refuses it with 451 and writes it down. Requests
//     a spec answers itself through page.route never reach the network, so
//     the practice card and every route stub keep working. Loopback
//     (localhost, 127.0.0.1, [::1], *.localhost) is bypassed: the Vite server
//     and the practice cards live there.
//  3. Node-side fetch / http.request in the test processes refuse the same
//     addresses, so a spec's own "is the card reachable?" probe cannot get out.
//
// Every such request is refused, so none reaches a card. `guardGlobalTeardown`
// then fails the whole run loudly, naming every refused WRITE (any method but
// GET/HEAD/OPTIONS) to a private-network address — the card's kind of address:
// a spec that writes there unanswered is driving a real card. Refused reads
// are listed as a warning, not a failure: Studio probes lightweaver.local,
// 192.168.4.1 and the remembered card on load in many specs that install no
// simulator (measured 2026-11-21: 29 GETs across screen-smoke, workflow and
// card-workspace), and failing on those would turn every pull request red.
// Before this guard those reads reached the physical card in local runs.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHYSICAL_CARD_FLAG = 'LW_ALLOW_PHYSICAL_CARD';
export const physicalCardAllowed = process.env[PHYSICAL_CARD_FLAG] === '1';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.resolve(here, '..', '..', 'test-results', 'network-guard.log');

/** A path a guard self-test uses: refused like any other, but not counted as a fault. */
export const GUARD_PROBE_PATH = '/__lw_network_guard_probe';

/** Specs that drive real hardware on purpose. */
export const guardTestIgnore: string[] = physicalCardAllowed ? [] : ['**/live-*.spec.ts', '**/real-card-*.spec.ts'];

// One port per checkout, next to the test port band, so every process of a run
// (runner and workers) points its browsers at the same tripwire.
function guardPortFor(dir: string) {
  let h = 0;
  for (const ch of dir) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return 18_000 + (h % 1_000);
}
export const GUARD_PORT = Number(process.env.LW_NETWORK_GUARD_PORT || guardPortFor(here));

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|[a-z0-9-]+\.localhost)$/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)|\.local$/i;

export function isLoopbackHost(host: string) { return LOOPBACK.test(host.replace(/:\d+$/, '')); }
export function isPrivateHost(host: string) { return PRIVATE.test(host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')); }

function record(target: string, how: string) {
  let host = target;
  try { host = new URL(target.includes('://') ? target : `http://${target}`).host; } catch { /* keep raw */ }
  if (target.includes(GUARD_PROBE_PATH)) return;
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `${new Date().toISOString()}\t${isPrivateHost(host) ? 'PRIVATE' : 'public'}\t${how}\t${target}\n`);
}

// ── Layer 2: the tripwire proxy ───────────────────────────────────────────
const probes: string[] = [];
function startTripwire() {
  const server = http.createServer((req, res) => {
    if (req.url === '/__lw_network_guard/probes') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(probes));
      return;
    }
    if (req.url?.includes(GUARD_PROBE_PATH)) probes.push(req.url);
    record(req.url || '', `browser ${req.method}`);
    res.writeHead(451, { 'Content-Type': 'text/plain' });
    res.end(`Refused by tests/harness/networkGuard.ts: tests may not reach ${req.url}. Set ${PHYSICAL_CARD_FLAG}=1 only for deliberate real-card work.`);
  });
  // https and wss arrive as CONNECT: refuse the tunnel.
  server.on('connect', (req, socket) => {
    if (req.url?.includes(GUARD_PROBE_PATH)) probes.push(req.url);
    record(`https://${req.url}`, 'browser CONNECT');
    socket.end('HTTP/1.1 451 Unavailable For Legal Reasons\r\n\r\n');
  });
  // Another process of this run already holds it; that one records for all.
  server.on('error', () => {});
  server.listen(GUARD_PORT, '127.0.0.1');
  server.unref();
}

export const guardLaunchOptions = physicalCardAllowed ? {} : {
  proxy: { server: `http://127.0.0.1:${GUARD_PORT}`, bypass: 'localhost,127.0.0.1,[::1],*.localhost' },
};

// ── Layer 3: Node-side requests in test processes ─────────────────────────
function guardNode() {
  const refuse = (target: string, method = 'GET') => {
    record(target, `node ${method}`);
    return new Error(`Refused by tests/harness/networkGuard.ts: tests may not reach ${target}. Set ${PHYSICAL_CARD_FLAG}=1 only for deliberate real-card work.`);
  };
  const hostOf = (input: unknown): string => {
    try {
      if (typeof input === 'string') return new URL(input).host;
      if (input instanceof URL) return input.host;
      const req = input as { url?: string; hostname?: string; host?: string; port?: number };
      if (req?.url) return new URL(req.url).host;
      return String(req?.hostname || req?.host || 'localhost');
    } catch { return 'localhost'; }
  };
  const original = globalThis.fetch;
  if (original && !(original as { __lwGuard?: boolean }).__lwGuard) {
    const guarded = ((input: unknown, init?: unknown) => {
      const host = hostOf(input);
      const method = String((init as { method?: string })?.method || (input as { method?: string })?.method || 'GET').toUpperCase();
      if (!isLoopbackHost(host)) return Promise.reject(refuse(String((input as { url?: string })?.url || input), method));
      return original(input as never, init as never);
    }) as typeof fetch & { __lwGuard?: boolean };
    guarded.__lwGuard = true;
    globalThis.fetch = guarded;
  }
  for (const mod of [http, https] as const) {
    for (const name of ['request', 'get'] as const) {
      const fn = mod[name] as typeof http.request & { __lwGuard?: boolean };
      if (fn.__lwGuard) continue;
      const wrapped = function (this: unknown, ...args: unknown[]) {
        const host = hostOf(args[0]);
        const opts = (typeof args[1] === 'object' && args[1]) || (typeof args[0] === 'object' && args[0]) || {};
        if (!isLoopbackHost(host)) throw refuse(`${mod === https ? 'https' : 'http'}://${host}`, String((opts as { method?: string }).method || 'GET').toUpperCase());
        return (fn as (...a: unknown[]) => unknown).apply(this, args);
      } as unknown as typeof http.request & { __lwGuard?: boolean };
      wrapped.__lwGuard = true;
      (mod as unknown as Record<string, unknown>)[name] = wrapped;
    }
  }
}

if (!physicalCardAllowed) {
  startTripwire();
  guardNode();
}

/** Global teardown: fail the run if anything tried to reach a private-network address. */
export default async function guardGlobalTeardown() {
  if (physicalCardAllowed) return;
  checkGuardLog(LOG);
}

/** Throws if `logPath` records a refused private-network request. Moves the log aside. */
export function checkGuardLog(logPath: string) {
  if (!fs.existsSync(logPath)) return;
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  fs.renameSync(logPath, `${logPath}.${Date.now()}`);
  const field = (line: string, i: number) => line.split('\t')[i] || '';
  const isRead = (line: string) => /\b(GET|HEAD|OPTIONS)$/.test(field(line, 2));
  const privWrites = lines.filter(line => field(line, 1) === 'PRIVATE' && !isRead(line));
  const privReads = lines.filter(line => field(line, 1) === 'PRIVATE' && isRead(line));
  const pub = lines.filter(line => field(line, 1) === 'public');
  const hosts = (list: string[]) => [...new Set(list.map(l => field(l, 3).replace(/^(\w+:\/\/[^/]+).*$/, '$1')))].join(', ');
  if (pub.length) console.warn(`network guard: refused ${pub.length} public-internet request(s) (not a card): ${hosts(pub)}`);
  if (privReads.length) console.warn(`network guard: refused ${privReads.length} read(s) to private-network addresses (${hosts(privReads)}). None reached a card. A spec should answer these itself.`);
  if (privWrites.length) {
    throw new Error(`NETWORK GUARD: ${privWrites.length} WRITE(s) tried to reach a private-network address — the physical card's kind of address — and were refused:\n  ${privWrites.slice(0, 40).join('\n  ')}\nA spec must answer every card request itself (practice card / page.route). Real-card work needs ${PHYSICAL_CARD_FLAG}=1, set by hand.`);
  }
}
