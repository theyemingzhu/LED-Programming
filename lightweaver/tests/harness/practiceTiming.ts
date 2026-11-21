// The practice card's two timing profiles: Fast and Real-timing.
//
// `cardSimulator.ts` is the practice card's BEHAVIOUR (what it answers). This
// file is its TIMING (when it answers, and when it does not answer at all).
// They are kept apart on purpose: the simulator answers instantly, which is
// right for logic and bulk runs and wrong for every question about time. A
// real card restarts for ~14 s after a save, sometimes goes silent to a page
// for 4–12 s, and answers status in ~0.07 s. A green Fast run says nothing
// about any of that. See docs/practice-card.md.
//
// One switch per simulator instance:
//
//   const { card } = createPracticeCard(cardState('installed-playing'), { timing: 'real' });
//   await card.install(page);
//
// Two instances with different profiles run side by side in one test, two
// tests, or two tabs. `LW_PRACTICE_TIMING=real` sets the default for every
// `createPracticeCard` call in a run that does not choose for itself.
//
// Every number in REAL_PROFILE names the trace it came from. The traces are
// copied into tests/harness/traces/ so the citations stay readable after the
// scratchpad that recorded them is cleared. They were recorded on the physical
// test card lw-b0fe81f61b44 (firmware 1.2.x, bench Wi-Fi) on 2026-11-20 by
// driving the real Studio save flow and polling /api/status once a second.
import type { Page, Route } from '@playwright/test';
import type { CardStateSpec } from './cardStates.js';
import { CARD_HOSTS, createCardSimulator } from './cardSimulator.js';
import type { CardSimulator } from './cardSimulator.js';

export type TimingProfileName = 'fast' | 'real';

export type TimingProfile = {
  name: TimingProfileName;
  /** Shown on the practice-card page. */
  label: string;
  /** Passed straight to createCardSimulator's own fixed latency. */
  simulatorLatencyMs: { read: number; write: number };
  /** Extra reply time per `METHOD /path`, on top of the simulator's own. */
  replyMs: Record<string, number>;
  /** Used when a path is not in `replyMs`. */
  defaultReplyMs: { read: number; write: number };
  /** Each reply varies by up to ± this fraction of its time. */
  replyJitter: number;
  /** A deliberate restart (reboot, wiring activate/rollback): off the air this long. */
  restartSilenceMs: number;
  /** Requests that make the real card restart once they are answered. */
  restartPaths: string[];
  /** Off Wi-Fi with no restart (router blip, the card re-associating). */
  wifiReconnectGapMs: number;
  /** Unprompted silences to a page. null = never. */
  spontaneousSilence: null | { meanIntervalMs: number; minMs: number; maxMs: number };
  /** After a restart the card answers, but some replies take seconds. null = never. */
  unsettledAfterRestart: null | { durationMs: number; probability: number; minMs: number; maxMs: number };
  /** Where each number came from. Key = field name. */
  sources: Record<string, string>;
};

export const FAST_PROFILE: TimingProfile = {
  name: 'fast',
  label: 'Fast',
  // Exactly today's behaviour: CARD_LATENCY_MS in cardSimulator.ts.
  simulatorLatencyMs: { read: 40, write: 120 },
  replyMs: {},
  defaultReplyMs: { read: 0, write: 0 },
  replyJitter: 0,
  restartSilenceMs: 0,
  restartPaths: [],
  wifiReconnectGapMs: 0,
  spontaneousSilence: null,
  unsettledAfterRestart: null,
  sources: { all: 'cardSimulator.ts CARD_LATENCY_MS — the behaviour every spec was written against' },
};

const TRACE = 'tests/harness/traces/';

export const REAL_PROFILE: TimingProfile = {
  name: 'real',
  label: 'Real-timing',
  simulatorLatencyMs: { read: 0, write: 0 },
  replyMs: {
    'GET /api/status': 70,
    'GET /api/firmware-info': 83,
    'GET /api/wiring/status': 105,
    'GET /api/zones': 110,
    'POST /api/config': 200,
    'POST /api/reboot': 32,
  },
  defaultReplyMs: { read: 80, write: 120 },
  replyJitter: 0.15,
  restartSilenceMs: 14_200,
  restartPaths: ['POST /api/reboot', 'POST /api/wiring/activate', 'POST /api/wiring/rollback'],
  wifiReconnectGapMs: 13_400,
  spontaneousSilence: { meanIntervalMs: 60_000, minMs: 4_000, maxMs: 12_800 },
  unsettledAfterRestart: { durationMs: 45_000, probability: 0.5, minMs: 1_100, maxMs: 9_700 },
  sources: {
    'replyMs GET /api/status': `${TRACE}save-trace-A.json + save-trace-D.json: 29 healthy replies 60–85 ms, median 70`,
    'replyMs GET /api/firmware-info': `${TRACE}save-trace-D.json + save-trace-NOSAVE.json: 51–89 ms, median 83`,
    'replyMs GET /api/wiring/status': `${TRACE}save-trace-D.json (111) + save-trace-NOSAVE.json (107, 82)`,
    'replyMs GET /api/zones': `${TRACE}save-trace-NOSAVE.json: 103 and 121 ms on a settled card`,
    'replyMs POST /api/config': `${TRACE}save-trace-D.json 202 ms, save-trace-NOSAVE.json 197 ms (3.5 kB project)`,
    'replyMs POST /api/reboot': `${TRACE}save-trace-D.json: 32 ms, then the card goes off the air`,
    defaultReplyMs: 'not measured; set between the measured reads (70–110) and writes (120–200)',
    restartSilenceMs: `${TRACE}save-trace-D.json: POST /api/reboot at t=780 ms, polls time out until t=14986 ms, when the card answers with uptimeMs 14360 (so 14.2 s off the air)`,
    wifiReconnectGapMs: `${TRACE}save-trace-D.json uptimeMs 14360 at first answer minus ${TRACE}save-trace-serial.log first boot line at 973 ms: ~13.4 s from boot to Wi-Fi association`,
    spontaneousSilence: `${TRACE}save-trace-A.json (≈4.5 s gap around t=6.5 s, uptime continuous) and save-trace-B.json (12.8 s silent from t=0, uptime continuous, no restart); about one per minute across four one-minute traces`,
    unsettledAfterRestart: `${TRACE}save-trace-NOSAVE.json: for ~45 s after the restart, status replies took 1.1–9.7 s about half the time (save-trace-D.json, same flow, did not); interleaved timeouts`,
  },
};

export const TIMING_PROFILES: Record<TimingProfileName, TimingProfile> = { fast: FAST_PROFILE, real: REAL_PROFILE };

export function timingProfile(name: string | undefined): TimingProfile {
  return name === 'real' ? REAL_PROFILE : FAST_PROFILE;
}

/** The run-wide default: LW_PRACTICE_TIMING=real, else Fast. */
export function defaultTimingName(): TimingProfileName {
  return (typeof process !== 'undefined' && process.env?.LW_PRACTICE_TIMING === 'real') ? 'real' : 'fast';
}

/** Small seeded PRNG so a Real-timing run is repeatable for one seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SilenceReason = 'restart' | 'wifi' | 'spontaneous' | 'manual';

export type TimingVerdict =
  /** Answer, after waiting `delayMs`. */
  | { kind: 'answer'; delayMs: number }
  /** The card is off the air: never answer this request. */
  | { kind: 'drop'; reason: SilenceReason; untilMs: number };

export type TimingOverrides = Partial<Pick<TimingProfile,
  'spontaneousSilence' | 'unsettledAfterRestart' | 'restartSilenceMs' | 'wifiReconnectGapMs' | 'replyJitter'>>;

/**
 * Transport-agnostic timing. The Playwright layer and the HTTP practice-card
 * server both ask it the same two questions: "what happens to this request?"
 * and "this request was answered — does the card now restart?".
 */
export class TimingController {
  profile: TimingProfile;
  private random: () => number;
  private silentUntil = 0;
  private silenceReason: SilenceReason | null = null;
  private unsettledUntil = 0;
  private nextSpontaneousAt = Infinity;
  /** Called whenever a silence starts or ends, for the practice-card page. */
  onChange: (() => void) | null = null;

  constructor(profile: TimingProfile | TimingProfileName = 'fast', options: { seed?: number; overrides?: TimingOverrides; now?: () => number } = {}) {
    this.now = options.now || (() => Date.now());
    this.random = mulberry32(options.seed ?? 1);
    this.profile = { ...(typeof profile === 'string' ? timingProfile(profile) : profile) };
    this.setProfile(this.profile, options.overrides);
  }

  now: () => number;

  /** Switch Fast ⇄ Real-timing on a running card. Any silence in progress ends. */
  setProfile(profile: TimingProfile | TimingProfileName, overrides: TimingOverrides = {}) {
    this.profile = { ...(typeof profile === 'string' ? timingProfile(profile) : profile), ...overrides };
    this.silentUntil = 0;
    this.silenceReason = null;
    this.unsettledUntil = 0;
    this.scheduleSpontaneous();
    this.onChange?.();
  }

  private scheduleSpontaneous() {
    const s = this.profile.spontaneousSilence;
    // Exponential gaps around the mean, so silences are irregular like a real room.
    this.nextSpontaneousAt = s ? this.now() + Math.max(5_000, -Math.log(1 - this.random()) * s.meanIntervalMs) : Infinity;
  }

  private between(min: number, max: number) { return min + this.random() * (max - min); }

  /** The card is off the air until `ms` from now. */
  silence(ms: number, reason: SilenceReason = 'manual') {
    const until = this.now() + Math.max(0, ms);
    if (until > this.silentUntil) { this.silentUntil = until; this.silenceReason = reason; }
    this.onChange?.();
    setTimeout(() => this.onChange?.(), Math.max(0, ms) + 5);
  }

  /** A deliberate restart: the reboot window, then an unsettled spell. */
  restart() {
    this.silence(this.profile.restartSilenceMs, 'restart');
    const u = this.profile.unsettledAfterRestart;
    this.unsettledUntil = u ? this.silentUntil + u.durationMs : 0;
  }

  /** Off Wi-Fi (no restart). `ms` defaults to the profile's reconnect gap; Fast uses 0 unless given. */
  wifiDrop(ms?: number) { this.silence(ms ?? this.profile.wifiReconnectGapMs, 'wifi'); }

  /** Back on the air now. */
  endSilence() { this.silentUntil = 0; this.silenceReason = null; this.onChange?.(); }

  state() {
    const now = this.now();
    const silent = now < this.silentUntil;
    return {
      profile: this.profile.name,
      label: this.profile.label,
      silent,
      silenceReason: silent ? this.silenceReason : null,
      silentForMs: silent ? this.silentUntil - now : 0,
      unsettled: !silent && now < this.unsettledUntil,
      nextSpontaneousInMs: Number.isFinite(this.nextSpontaneousAt) ? Math.max(0, this.nextSpontaneousAt - now) : null,
    };
  }

  /** What happens to this request. */
  verdict(method: string, path: string): TimingVerdict {
    const now = this.now();
    const s = this.profile.spontaneousSilence;
    if (s && now >= this.nextSpontaneousAt) {
      this.silence(this.between(s.minMs, s.maxMs), 'spontaneous');
      this.scheduleSpontaneous();
    }
    if (now < this.silentUntil) {
      return { kind: 'drop', reason: this.silenceReason || 'manual', untilMs: this.silentUntil };
    }
    const isRead = method === 'GET' || method === 'HEAD';
    let delay = this.profile.replyMs[`${method} ${path}`]
      ?? (isRead ? this.profile.defaultReplyMs.read : this.profile.defaultReplyMs.write);
    const j = this.profile.replyJitter;
    if (j > 0) delay *= 1 + (this.random() * 2 - 1) * j;
    const u = this.profile.unsettledAfterRestart;
    if (u && now < this.unsettledUntil && this.random() < u.probability) delay = this.between(u.minMs, u.maxMs);
    return { kind: 'answer', delayMs: Math.max(0, Math.round(delay)) };
  }

  /** Call once a request has been answered. Starts the restart window when it should. */
  answered(method: string, path: string) {
    if (this.profile.restartPaths.includes(`${method} ${path}`)) this.restart();
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Put a timing layer in front of an installed simulator on `page`.
 *
 * Playwright runs the most recently registered route first, so this sees every
 * card request before the simulator does and hands it on with `fallback()`.
 * A silent card never answers: the request hangs until Studio's own timeout
 * gives up, which is exactly what the traces show (ERR_ABORTED after Studio's
 * 0.6–3 s deadlines), and a late request is answered once the silence ends.
 */
export async function applyPracticeTiming(page: Page, timing: TimingController) {
  const handle = async (route: Route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') return route.fallback();
    const path = new URL(request.url()).pathname;
    let verdict = timing.verdict(method, path);
    while (verdict.kind === 'drop') {
      // Hold the request until the card is back, as a real socket would.
      await sleep(Math.max(20, verdict.untilMs - timing.now()));
      verdict = timing.verdict(method, path);
    }
    if (verdict.delayMs) await sleep(verdict.delayMs);
    try {
      await route.fallback();
    } catch {
      return; // Studio already gave up on this request.
    }
    timing.answered(method, path);
  };
  for (const host of CARD_HOSTS) {
    await page.route(`http://${host}/**`, handle);
    await page.route(`https://${host}/**`, handle);
  }
}

/** Same timing for the https lane, where requests go through the card-page bridge. */
const BRIDGE_ROUTES: Record<string, [string, string]> = {
  status: ['GET', '/api/status'], 'firmware-info': ['GET', '/api/firmware-info'],
  control: ['POST', '/api/control'], reboot: ['POST', '/api/reboot'], config: ['POST', '/api/config'],
};

export type PracticeCard = {
  card: CardSimulator;
  timing: TimingController;
  profile: TimingProfileName;
};

/**
 * A practice card: the simulator plus one timing profile. `timing` defaults to
 * LW_PRACTICE_TIMING, else Fast. Everything else passes to createCardSimulator.
 */
export function createPracticeCard(
  spec: CardStateSpec,
  options: Parameters<typeof createCardSimulator>[1] & { timing?: TimingProfileName; seed?: number; overrides?: TimingOverrides } = {},
): PracticeCard {
  const { timing: name = defaultTimingName(), seed, overrides, ...simOptions } = options;
  const profile = timingProfile(name);
  const card = createCardSimulator(spec, { latencyMs: profile.simulatorLatencyMs, ...simOptions });
  const timing = new TimingController(profile, { seed, overrides });
  if (name === 'fast') return { card, timing, profile: name };

  const install = card.install.bind(card);
  card.install = async (page: Page) => {
    await install(page);
    await applyPracticeTiming(page, timing);
  };
  const handleBridge = card.handleBridge.bind(card);
  // bridgeTransport awaits the answer, so an async bridge is honoured there.
  (card as unknown as { handleBridge: (type: string, payload: unknown) => Promise<Record<string, unknown>> }).handleBridge =
    async (type: string, payload: unknown) => {
      const [method, path] = BRIDGE_ROUTES[type] || ['POST', `/bridge/${type}`];
      let verdict = timing.verdict(method, path);
      if (verdict.kind === 'drop') {
        // The card page cannot reach the card either; the bridge reports it.
        await sleep(Math.min(3_000, Math.max(0, verdict.untilMs - timing.now())));
        return { ok: false, reason: 'timeout', error: 'card did not answer' };
      }
      if (verdict.delayMs) await sleep(verdict.delayMs);
      const answer = handleBridge(type, payload);
      timing.answered(method, path);
      return answer;
    };
  return { card, timing, profile: name };
}
