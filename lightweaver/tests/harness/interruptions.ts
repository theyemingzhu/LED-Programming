// Interruptions on the Real-timing practice card: the card stops answering,
// restarts by itself, comes back holding the old project, or has no room —
// at the worst moment of an owner's action. Each interruption spec asserts
// three things:
//
//   1. what Studio says (its exact words are logged in every run),
//   2. what the practice card actually holds afterwards,
//   3. that no wait goes more than 3 s with nothing on screen saying why.
//
// Real-timing only: replies, restart silence and Wi-Fi gaps come from the
// physical card's traces (practiceTiming.ts). Spontaneous silences are off so
// each run interrupts at the moment the spec chooses, and the seed is fixed.
// The network guard stays on (playwright.config.ts); nothing here reaches a
// physical card.
//
// Plan: todo/plans/practice-card-interruptions.md.
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { CARD_HOSTS } from './cardSimulator';
import type { CardSimulator } from './cardSimulator';
import type { CardStateSpec } from './cardStates';
import { createPracticeCard, REAL_PROFILE } from './practiceTiming';
import type { PracticeCard } from './practiceTiming';

/** The real card's restart after a save (traces/save-trace-*.json). */
export const REAL_RESTART_MS = 14_000;
/** The longest a wait may go with nothing on screen saying why. */
export const QUIET_LIMIT_MS = 3_000;

/** Any of these on screen counts as "Studio is telling the owner what is happening". */
export const WORKING = 'Restarting (the )?card|Checking( the)? card|Verifying|Sending|Saving|Loading|Setting|Connecting|Reconnecting|Waiting|Looking for|Clearing|Reading';
export const BUSY = '.la-card-push-banner.is-pending, [aria-busy="true"], .lw-notice-spinner';

/** Wording that says the card did NOT take a change. A lie when it did. */
export const SAYS_NOT_TAKEN = [
  'not saved to the card',
  'did not take',
  'did not accept',
  'did not answer',
  'update rolled back',
  'nothing changed on the card',
  'push failed',
  'save failed',
];

/** Wording that says the card DID take it. A lie when it did not. */
export const SAYS_TAKEN = /Saved to the card\.|Installed (revision \d+ )?on card|^Saved$/m;

export type InterruptionCard = PracticeCard & { card: CardSimulator };

/** A Real-timing practice card with the real card's save-restart rule. */
export function realPracticeCard(spec: CardStateSpec, options: Parameters<typeof createPracticeCard>[1] = {}): InterruptionCard {
  return createPracticeCard(spec, {
    timing: 'real',
    seed: 11,
    overrides: { spontaneousSilence: null },
    restartAfterSaveMs: REAL_RESTART_MS,
    ...options,
  }) as InterruptionCard;
}

export async function linkState(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

/** Seed the card's identity, open Studio, wait until it is connected and holds the card's project. */
export async function bootConnected(page: Page, practice: InterruptionCard, options: { hash?: string; projectId?: string; context?: BrowserContext } = {}) {
  const { card } = practice;
  // On the browser context the card outlives a closed tab (spec 2's "reopen").
  const target = (options.context || page) as Page;
  await card.install(target);
  for (const other of CARD_HOSTS) {
    if (other === 'lightweaver.local') continue;
    await target.route(`http://${other}/**`, route => route.abort('connectionrefused'));
  }
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    if (window !== window.top) return;
    if (localStorage.getItem('lw_card_identity_v1')) return;
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkState(page), { timeout: 30_000 }).toMatch(/^connected-/);
  const projectId = options.projectId ?? card.state.projectId;
  if (projectId) {
    const open = page.getByTestId('installed-project-open');
    await open.waitFor({ timeout: 8_000 }).then(() => open.click()).catch(() => {});
    await expect.poll(() => page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.id || ''; } catch { return ''; }
    }), { timeout: 30_000 }).toBe(projectId);
  }
  if (options.hash) await page.evaluate(h => { window.location.hash = h; }, options.hash);
  return card;
}

// ── What the card holds ─────────────────────────────────────────────────────

export function configWrites(card: CardSimulator) {
  return card.requests.filter(r => r.method === 'POST' && r.path === '/api/config');
}

/** The project identity of the most recent save Studio sent. */
export function lastSent(card: CardSimulator) {
  const body = (configWrites(card).at(-1)?.body || {}) as Record<string, any>;
  return {
    projectId: String(body.piece?.id || body.projectId || ''),
    projectRevision: Number(body.projectRevision ?? NaN),
    projectFingerprint: String(body.projectFingerprint ?? ''),
    pixels: Number(body.led?.pixels ?? NaN),
  };
}

export function holds(card: CardSimulator) {
  const s = card.state;
  return { projectId: s.projectId, projectRevision: s.projectRevision, projectFingerprint: s.projectFingerprint, pixels: s.pixels };
}

/** Resolves the moment the card has a new write to `path` (default: a project save). */
export async function nextWrite(card: CardSimulator, path = '/api/config', timeoutMs = 60_000) {
  const seen = card.requests.filter(r => r.method === 'POST' && r.path === path).length;
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (card.requests.filter(r => r.method === 'POST' && r.path === path).length > seen) return Date.now();
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`no POST ${path} within ${timeoutMs} ms`);
}

// ── Interruptions the practice card did not have ───────────────────────────

/**
 * Off the air for `ms` from now: every request hangs, as a card whose Wi-Fi
 * dropped. `Infinity` never comes back (also goes offline in the simulator).
 */
export function dropOffAir(practice: InterruptionCard, ms: number) {
  if (!Number.isFinite(ms)) {
    practice.timing.silence(24 * 3600_000, 'wifi');
    practice.card.goOffline();
    return;
  }
  practice.timing.silence(ms, 'wifi');
}

/**
 * The card takes the next save, restarts, and comes back holding the project
 * it had BEFORE (a rolled-back write: power cut mid-commit, or firmware
 * refusing the new project at boot). Its reply to the save itself is a normal
 * "saved"; only what it holds after the restart is old.
 */
export function rollBackNextSave(card: CardSimulator) {
  const s = card.state as CardSimulator['state'] & Record<string, any>;
  const keys = ['projectId', 'projectName', 'projectRevision', 'projectFingerprint', 'provisionalSetup', 'pixels', 'pin',
    'explicitOutputs', 'patterns', 'installedLooks', 'installedZones', 'installedStartupPatternId', 'zoneIds',
    'currentId', 'currentIndex'];
  const before = structuredClone(Object.fromEntries(keys.map(k => [k, s[k]])));
  const bootBefore = s.bootId;
  const done = (async () => {
    await nextWrite(card);
    const until = Date.now() + 30_000;
    while (s.bootId === bootBefore && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5));
    Object.assign(s, structuredClone(before));
  })();
  return { before, done };
}

/** The card restarts by itself: new boot id, ~14 s off the air, same project, back playing its look. */
export function restartByItself(practice: InterruptionCard) {
  const { card, timing } = practice;
  const { currentId, currentIndex } = card.state;
  card.reboot();
  card.state.currentId = currentId;
  card.state.currentIndex = currentIndex;
  timing.restart();
}

// ── What Studio says, and whether it is ever silent ─────────────────────────

/**
 * Start logging every distinct line on screen that talks about the card, with
 * the time it first appeared. This is "the exact words Studio showed".
 */
export async function startWordsLog(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __lwWords?: { t: number; text: string }[]; __lwWordsStop?: () => void };
    w.__lwWordsStop?.();
    const words: { t: number; text: string }[] = [];
    w.__lwWords = words;
    const t0 = performance.now();
    const re = /restart|checking|saved|installed|not saved|did not|could not|room|try|fail|rolled|connect|verif|sending|waiting|count|card|answer|setup|clear/i;
    const seen = new Set<string>();
    const sample = () => {
      const lines = (document.body?.innerText || '').split('\n').map(l => l.trim()).filter(l => l && l.length < 300 && re.test(l));
      for (const line of lines) if (!seen.has(line)) { seen.add(line); words.push({ t: Math.round(performance.now() - t0), text: line }); }
    };
    const timer = setInterval(sample, 150);
    sample();
    w.__lwWordsStop = () => clearInterval(timer);
  });
}

export async function wordsSeen(page: Page) {
  return page.evaluate(() => (window as unknown as { __lwWords?: { t: number; text: string }[] }).__lwWords || []).catch(() => []);
}

/**
 * Watch a wait. Every 100 ms: if neither a busy control nor WORKING wording is
 * on screen, the clock runs; the longest such stretch is kept. Once `ended`
 * (a regexp over "<hash> <screen text>") matches, the wait is over.
 */
export async function startQuietWatch(page: Page, ended: string, working = WORKING, busy = BUSY) {
  await page.evaluate(({ ended, working, busy }) => {
    const w = window as unknown as { __lwQuiet?: { gapMs: number; gapText: string; endedAtMs: number | null }; __lwQuietStop?: () => void };
    w.__lwQuietStop?.();
    const endRe = new RegExp(ended, 'im');
    const workRe = new RegExp(working, 'i');
    const t0 = performance.now();
    const quiet = { gapMs: 0, gapText: '', endedAtMs: null as number | null };
    w.__lwQuiet = quiet;
    let since = 0;
    let sinceText = '';
    const timer = setInterval(() => {
      if (quiet.endedAtMs !== null) return;
      const text = document.body?.innerText || '';
      if (endRe.test(`${location.hash} ${text}`)) { quiet.endedAtMs = Math.round(performance.now() - t0); return; }
      if (document.querySelector(busy) || workRe.test(text)) { since = 0; return; }
      if (!since) { since = performance.now(); sinceText = `${location.hash} | ${text.replace(/\s+/g, ' ').slice(0, 300)}`; }
      const gap = performance.now() - since;
      if (gap > quiet.gapMs) { quiet.gapMs = Math.round(gap); quiet.gapText = sinceText; }
    }, 100);
    w.__lwQuietStop = () => clearInterval(timer);
  }, { ended, working, busy });
}

export async function stopQuietWatch(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __lwQuiet?: { gapMs: number; gapText: string; endedAtMs: number | null }; __lwQuietStop?: () => void };
    w.__lwQuietStop?.();
    return w.__lwQuiet || { gapMs: 0, gapText: '', endedAtMs: null };
  });
}

/** Start recording any moment the screen says the card did not take a change. */
export async function startNotTakenWatch(page: Page, wording = SAYS_NOT_TAKEN) {
  const { startFalseFailureWatch } = await import('./falseFailureWatch');
  await startFalseFailureWatch(page, wording);
}

export { falseFailures as notTakenSeen } from './falseFailureWatch';

/** Every run, red or green: what Studio showed and what the card held. */
export async function reportWords(page: Page, practice: InterruptionCard | null, info: { title: string; status?: string; expectedStatus: string }) {
  const words = await wordsSeen(page);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log([
    `[interruptions] ${info.status === info.expectedStatus ? 'GREEN' : 'RED'} ${info.title}`,
    `  Studio said: ${JSON.stringify(words.map(w => `${(w.t / 1000).toFixed(1)}s ${w.text}`))}`,
    practice ? `  card holds: ${JSON.stringify(holds(practice.card))}; last sent: ${JSON.stringify(lastSent(practice.card))}; config writes: ${configWrites(practice.card).length}` : '',
    `  screen at end: ${text.replace(/\s+/g, ' ').slice(0, 700)}`,
  ].join('\n'));
}

export { REAL_PROFILE };

/**
 * A red interruption test that names a known Studio defect
 * (todo/plans/practice-card-interruptions.md). Playwright then expects it to
 * fail, so the run is green today; the fix for that defect deletes this line,
 * and the test must pass.
 */
export function knownDefect(id: string, what: string) {
  test.info().annotations.push({ type: 'known-defect', description: `${id}: ${what}` });
  test.fail(true, `known Studio defect ${id}: ${what}`);
}
