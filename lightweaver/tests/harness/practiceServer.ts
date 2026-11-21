// The practice card as a real local HTTP card, for Studio and for people.
//
// Playwright specs use the simulator through page.route. This file runs the
// SAME simulator (cardSimulator.ts, unchanged) and the same timing profiles
// (practiceTiming.ts) behind a plain HTTP server, so:
//
//   - Studio on localhost can connect to http://127.0.0.1:<port> exactly as it
//     connects to a card (`?cardHost=127.0.0.1:<port>`);
//   - the practice-card page at /practice/ shows its lights and state, and has
//     the controls (Fast / Real-timing, off Wi-Fi, restart, blank, any state);
//   - two practice cards in different modes run at once on different ports,
//     each with its own card id.
//
// Started by scripts/practice-card.mjs (`npm run practice`, `lw practice`).
// Local only: it binds 127.0.0.1 and is never deployed.
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CARD_STATES, REAL_CARD_STATE, cardState } from './cardStates.js';
import type { CardStateSpec } from './cardStates.js';
import { createCardSimulator } from './cardSimulator.js';
import type { CardSimulator } from './cardSimulator.js';
import { TimingController, timingProfile, REAL_PROFILE, FAST_PROFILE } from './practiceTiming.js';
import type { TimingProfileName } from './practiceTiming.js';

export type PracticeServerOptions = {
  port: number;
  mode: TimingProfileName;
  /** Timing overrides, e.g. the contract check turns spontaneous silences off. */
  overrides?: import('./practiceTiming.js').TimingOverrides;
  stateId: string;
  seed?: number;
  pagePath: string;
  studioUrl: string;
  /** scripts/practice-studio.mjs, for the page's "Open Studio" button. */
  studioScript?: string;
};

export { REAL_CARD_STATE };

type LogEntry = { at: number; method: string; path: string; status: number | string; ms: number; note: string };

const ALL_STATES: CardStateSpec[] = [...CARD_STATES, REAL_CARD_STATE];

function specFor(id: string): CardStateSpec {
  if (id === REAL_CARD_STATE.id) return REAL_CARD_STATE;
  return cardState(id);
}

type Handler = (route: unknown) => Promise<unknown>;

export function startPracticeServer(options: PracticeServerOptions) {
  const cardId = `lw-practice-${options.port}`;
  const timing = new TimingController(options.mode, { seed: options.seed, overrides: options.overrides });
  const log: LogEntry[] = [];
  const startedAt = Date.now();
  let stateId = options.stateId;
  let card: CardSimulator;
  let handler: Handler | null = null;
  let restartedAt = 0;

  function build(id: string) {
    stateId = id;
    const profile = timingProfile(timing.profile.name);
    card = createCardSimulator(specFor(id), { cardId, latencyMs: profile.simulatorLatencyMs });
    // The simulator registers one handler per card host through page.route;
    // a stand-in page captures it. Every host gets the same handler.
    const fakePage = {
      route: async (_pattern: string, h: Handler) => { handler = h; },
      routeWebSocket: async () => {},
    };
    void card.install(fakePage as never);
  }
  build(stateId);

  function record(entry: LogEntry) {
    log.push(entry);
    if (log.length > 200) log.splice(0, log.length - 200);
  }

  /** Hand one HTTP request to the simulator as if Playwright had routed it. */
  function toSimulator(req: IncomingMessage, body: string, res: ServerResponse): Promise<number | string> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (value: number | string) => { if (!settled) { settled = true; resolve(value); } };
      const route = {
        request: () => ({
          url: () => `http://lightweaver.local${req.url}`,
          method: () => req.method || 'GET',
          postData: () => body,
          headers: () => req.headers,
        }),
        fulfill: async (r: { status?: number; headers?: Record<string, string>; contentType?: string; body?: string }) => {
          const headers: Record<string, string> = {
            ...(r.headers || {}),
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Private-Network': 'true',
            'Cache-Control': 'no-store',
          };
          if (r.contentType) headers['Content-Type'] = r.contentType;
          if (!res.headersSent) res.writeHead(r.status ?? 200, headers);
          res.end(r.body ?? '');
          finish(r.status ?? 200);
        },
        // A refused or cut connection: drop the socket, as a card that is not there.
        abort: async (code?: string) => { res.socket?.destroy(); finish(`aborted:${code || 'failed'}`); },
        fallback: async () => { res.writeHead(404); res.end(); finish(404); },
        continue: async () => { res.writeHead(404); res.end(); finish(404); },
      };
      if (!handler) { res.writeHead(503); res.end(); finish(503); return; }
      handler(route).catch(() => { if (!res.writableEnded) { res.writeHead(500); res.end(); } finish(500); });
    });
  }

  async function cardRequest(req: IncomingMessage, res: ServerResponse, body: string) {
    const method = req.method || 'GET';
    const path = new URL(req.url || '/', 'http://x').pathname;
    const t0 = Date.now();
    if (method !== 'OPTIONS') {
      let verdict = timing.verdict(method, path);
      let note = '';
      while (verdict.kind === 'drop') {
        // Off the air: the socket just waits, like a real card that is gone.
        note = `silent (${verdict.reason})`;
        await new Promise(r => setTimeout(r, Math.max(20, verdict.kind === 'drop' ? verdict.untilMs - Date.now() : 0)));
        if (req.socket.destroyed) { record({ at: t0, method, path, status: 'no answer', ms: Date.now() - t0, note }); return; }
        verdict = timing.verdict(method, path);
      }
      if (verdict.delayMs) await new Promise(r => setTimeout(r, verdict.kind === 'answer' ? verdict.delayMs : 0));
      if (req.socket.destroyed) { record({ at: t0, method, path, status: 'no answer', ms: Date.now() - t0, note }); return; }
      const status = await toSimulator(req, body, res);
      record({ at: t0, method, path, status, ms: Date.now() - t0, note });
      timing.answered(method, path);
      if (timing.profile.restartPaths.includes(`${method} ${path}`) || (method === 'POST' && path === '/api/reboot')) restartedAt = Date.now();
      return;
    }
    await toSimulator(req, body, res);
  }

  function zoneBrightness(): number {
    const controls = card.state.zoneControls;
    const first = controls && controls.size ? [...controls.values()][0] : null;
    return first ? Number(first.brightness) : 0.65;
  }

  function snapshot() {
    const t = timing.state();
    const s = card.state;
    const blank = !s.projectId;
    const rebooting = restartedAt > 0 && Date.now() - restartedAt < 1_000;
    const lit = !blank && s.currentId !== 'blackout' && !rebooting;
    return {
      cardId, port: options.port, stateId, startedAt,
      states: ALL_STATES.map(spec => ({ id: spec.id, describe: spec.describe })),
      timing: t,
      profiles: { fast: FAST_PROFILE.label, real: REAL_PROFILE.label },
      realNumbers: {
        restartSilenceMs: REAL_PROFILE.restartSilenceMs,
        wifiReconnectGapMs: REAL_PROFILE.wifiReconnectGapMs,
        statusReplyMs: REAL_PROFILE.replyMs['GET /api/status'],
        silence: REAL_PROFILE.spontaneousSilence,
      },
      offWifi: offWifiManual,
      card: {
        projectId: s.projectId, projectName: s.projectName, projectRevision: s.projectRevision,
        pixels: s.pixels, pin: s.pin, currentId: s.currentId,
        patterns: s.patterns, bootId: s.bootId, firmwareVersion: s.firmwareVersion,
        buildNumber: s.buildNumber, wiringTestActive: s.wiringTestActive,
      },
      lights: { lit, brightness: zoneBrightness(), patternId: s.currentId, count: s.pixels, rebooting },
      studioUrl: `${options.studioUrl}/?cardHost=practice-${options.port}.local`,
      log: log.slice(-14).reverse(),
      requests: card.requests.length,
    };
  }

  let offWifiManual = false;
  function action(body: Record<string, unknown>) {
    switch (body.action) {
      case 'mode':
        timing.setProfile(body.value === 'real' ? 'real' : 'fast');
        // The simulator's own fixed latency belongs to the profile too.
        build(stateId);
        offWifiManual = false;
        return;
      case 'off-wifi': offWifiManual = true; card.goOffline(); return;
      case 'on-wifi': offWifiManual = false; card.goOnline(); timing.endSilence(); return;
      case 'wifi-blip': timing.wifiDrop(timing.profile.name === 'fast' ? 5_000 : undefined); return;
      case 'restart': {
        // A real card comes back playing its start-up look
        // (traces/save-trace-serial.log: "Starting look: Fire" after boot);
        // the simulator's reboot() models a power cut to dark, so put it back.
        const { currentId, currentIndex } = card.state;
        card.reboot();
        card.state.currentId = currentId;
        card.state.currentIndex = currentIndex;
        timing.restart(); restartedAt = Date.now();
        return;
      }
      case 'blank': build('factory-blank'); return;
      case 'open-studio': {
        if (!options.studioScript) throw new Error('no Studio window script');
        const child = spawn(process.execPath, [options.studioScript, '--port', String(options.port), '--studio', options.studioUrl],
          { stdio: 'inherit', detached: false });
        child.unref();
        return;
      }
      case 'state': build(String(body.value || 'installed-match')); offWifiManual = false; return;
      default: throw new Error(`unknown action ${String(body.action)}`);
    }
  }

  const server = http.createServer(async (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    await new Promise(r => req.on('end', r));
    const path = new URL(req.url || '/', 'http://x').pathname;
    try {
      if (path === '/' && req.method === 'GET') {
        res.writeHead(302, { Location: '/practice/' }); res.end(); return;
      }
      if (path === '/practice/' || path === '/practice') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(options.pagePath, 'utf8'));
        return;
      }
      if (path === '/practice/api/state') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(snapshot()));
        return;
      }
      if (path === '/practice/api/action' && req.method === 'POST') {
        action(JSON.parse(body || '{}'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(snapshot()));
        return;
      }
      if (!path.startsWith('/api/')) {
        // The real card serves its own page here; the practice card has none.
        res.writeHead(404); res.end(); return;
      }
      await cardRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String((error as Error).message || error) }));
    }
  });
  server.listen(options.port, '127.0.0.1');
  return { server, timing, get card() { return card; }, cardId, action, snapshot };
}
