// Journey recorder — measures an owner journey the way a first-time client
// meets it. Used by tests/ux/*.measure.spec.ts (todo/plans/simpler-journeys.md).
//
// Every deliberate press goes through `press()`. Before the press it records
// what the owner is looking at: the screen, how many words are visible in the
// viewport, every visible primary button, and every visible control they could
// have pressed instead (the choices). It also saves a viewport screenshot, so
// the journey can be shown as a strip.
//
// It measures only. It never asserts a product rule; a journey that cannot be
// completed is recorded as `blocked` with the reason.
import type { Locator, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const UX_OUT = process.env.LW_UX_OUT || join(process.cwd(), '..', '.claude', 'ux-journeys');

export type StepRecord = {
  n: number;
  kind: 'press' | 'type' | 'land';
  label: string;
  screen: string;
  heading: string;
  words: number;
  primaries: string[];
  choices: string[];
  ms: number;
  shot: string;
};

export type JourneyRecord = {
  journey: string;
  width: number;
  presses: number;
  typed: number;
  screens: string[];
  wordsBeforeFirstAction: number;
  seconds: number;
  steps: StepRecord[];
  blocked?: string;
  notes: string[];
};

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
      if (el.closest('[inert], [aria-hidden="true"]')) return false;
      // Something on top (a modal, a notice) hides it from the owner.
      const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      return Boolean(top && (top === el || el.contains(top) || top.contains(el)));
    };
    const text = (el: Element) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    const hash = window.location.hash || '#';
    const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
    const screen = [params.get('screen') || 'home', params.get('section'), params.get('mode')].filter(Boolean).join(':');
    const h1 = document.querySelector('h1');
    // Words the owner can see right now: every visible text node in the viewport.
    let words = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
      const value = (node.textContent || '').trim();
      if (!value || !visible(parent)) continue;
      words += value.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;
    }
    const controls = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input:not([type="hidden"]), select, summary')]
      .filter(el => visible(el) && !(el as HTMLButtonElement).disabled);
    const primaries = [...document.querySelectorAll('.btn.primary, button.primary, [data-variant="primary"]')]
      .filter(el => visible(el)).map(text);
    return {
      screen,
      heading: h1 ? text(h1) : '',
      words,
      primaries,
      choices: controls.map(el => text(el) || el.getAttribute('placeholder') || el.tagName.toLowerCase()).slice(0, 60),
    };
  });
}

export function recordJourney(page: Page, journey: string, width: number) {
  const dir = join(UX_OUT, journey, String(width));
  mkdirSync(dir, { recursive: true });
  const started = Date.now();
  const record: JourneyRecord = {
    journey, width, presses: 0, typed: 0, screens: [], wordsBeforeFirstAction: 0, seconds: 0, steps: [], notes: [],
  };

  async function mark(kind: StepRecord['kind'], label: string) {
    const snap = await snapshot(page).catch(() => ({ screen: '?', heading: '', words: 0, primaries: [], choices: [] }));
    const n = record.steps.length + 1;
    const shot = `${String(n).padStart(2, '0')}.png`;
    await page.screenshot({ path: join(dir, shot) }).catch(() => {});
    if (!record.screens.includes(snap.screen)) record.screens.push(snap.screen);
    if (kind !== 'land' && record.presses === 0 && record.typed === 0) record.wordsBeforeFirstAction = snap.words;
    record.steps.push({ n, kind, label, ...snap, ms: Date.now() - started, shot });
  }

  return {
    record,
    /** One deliberate press by the owner. */
    async press(target: Locator, label: string) {
      await target.waitFor({ state: 'visible', timeout: 20_000 });
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await mark('press', label);
      // A notice sitting over the button is something the owner has to close
      // first. Each close is a real press, recorded under its own label.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await target.click({ timeout: 4_000, trial: true });
          break;
        } catch {
          const close = page.locator('.lw-notice-close:visible').first();
          if (!(await close.count())) break;
          const covering = ((await page.locator('.lw-notice:visible').first().textContent()) || '').replace(/\s+/g, ' ').trim();
          await mark('press', `Close notice covering "${label}": ${covering.slice(0, 80)}`);
          await close.click();
          record.presses += 1;
          record.notes.push(`notice covered "${label}" — closed: ${covering.slice(0, 120)}`);
        }
      }
      await target.click();
      record.presses += 1;
    },
    /** Typing into a field. Not a press, but it is a decision the owner makes. */
    async type(target: Locator, value: string, label: string) {
      await target.waitFor({ state: 'visible', timeout: 20_000 });
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await mark('type', label);
      await target.fill(value);
      record.typed += 1;
    },
    /** A screen the owner arrives at without pressing (start, end, auto-advance). */
    async land(label: string) {
      await mark('land', label);
    },
    note(text: string) { record.notes.push(text); },
    blocked(reason: string) { record.blocked = reason; },
    async finish() {
      await mark('land', record.blocked ? `blocked: ${record.blocked}` : 'done');
      record.seconds = Math.round((Date.now() - started) / 100) / 10;
      writeFileSync(join(dir, 'journey.json'), `${JSON.stringify(record, null, 2)}\n`);
      return record;
    },
  };
}

/**
 * Call FIRST, before the simulator installs. Aborts every request to the LAN
 * (the real card lives at 192.168.18.70). The simulator's own routes are
 * registered later, so Playwright tries them first and the hosts it models
 * still answer; anything it does not model dies here instead of reaching
 * hardware.
 */
export async function guardRealCard(page: Page) {
  await page.route(/^https?:\/\/(192\.168\.|10\.|lightweaver\.local)/, route => route.abort());
  await page.routeWebSocket(/^wss?:\/\/(192\.168\.|10\.|lightweaver\.local)/, socket => socket.close());
}

export const WIDTHS = [
  { width: 1280, height: 800, isMobile: false },
  { width: 390, height: 844, isMobile: true },
];
