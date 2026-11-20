// A slow, healthy card must never make Studio say it failed. These helpers
// record every moment the page shows failure or disconnect wording, so a spec
// can assert "at no moment" instead of sampling the end state.
//
// Plan and decisions: todo/plans/false-failures.md.
import type { Page } from '@playwright/test';
import { MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './cardStates';

/** Wording a slow but healthy card must never cause. Case-insensitive substrings. */
export const FALSE_FAILURE_WORDING = [
  'update rolled back',
  'open card and check',
  'did not answer',
  'not saved to the card',
  'not connected',
  'card stopped responding',
  'did not verify',
  'needs attention',
  'try saving again',
  'could not reach',
];

export async function seedKnownCard(page: Page, cardId = MATRIX_CARD_ID) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

/** Wait until the fresh browser has picked up the card's own project. */
export async function waitForCardProject(page: Page, projectId = 'lwproj-matrix-piece') {
  const { expect } = await import('@playwright/test');
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
  }), { timeout: 25000 }).toBe(projectId);
}

/**
 * Start recording. Every 100 ms, and on every DOM change, the visible text is
 * checked for `wording`; each hit is kept with the text around it.
 */
export async function startFalseFailureWatch(page: Page, wording = FALSE_FAILURE_WORDING) {
  await page.evaluate(list => {
    const w = window as unknown as { __lwFalseFailures?: string[]; __lwFalseFailureStop?: () => void };
    w.__lwFalseFailureStop?.();
    const hits: string[] = [];
    w.__lwFalseFailures = hits;
    const check = () => {
      const text = (document.body?.innerText || '').toLowerCase();
      for (const phrase of list) {
        const at = text.indexOf(phrase);
        if (at >= 0) {
          const context = text.slice(Math.max(0, at - 60), at + phrase.length + 60).replace(/\s+/g, ' ');
          if (!hits.includes(context)) hits.push(context);
        }
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    const timer = setInterval(check, 100);
    check();
    w.__lwFalseFailureStop = () => { observer.disconnect(); clearInterval(timer); };
  }, wording);
}

export async function falseFailures(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __lwFalseFailures?: string[] }).__lwFalseFailures || []);
}

/**
 * Record whether "working" was visible throughout: samples every 100 ms and
 * keeps the longest stretch with neither a busy control nor a progress line.
 */
export async function startWorkingWatch(page: Page, busySelector: string, workingPattern: string) {
  await page.evaluate(({ selector, pattern }) => {
    const w = window as unknown as { __lwIdleGapMs?: number; __lwWorkingStop?: () => void; __lwWorkingSeen?: string[] };
    w.__lwWorkingStop?.();
    const re = new RegExp(pattern, 'i');
    let idleSince = 0;
    w.__lwIdleGapMs = 0;
    w.__lwWorkingSeen = [];
    const timer = setInterval(() => {
      const busy = Boolean(document.querySelector(selector));
      const match = (document.body?.innerText || '').match(re);
      if (match && !w.__lwWorkingSeen!.includes(match[0])) w.__lwWorkingSeen!.push(match[0]);
      if (busy || match) { idleSince = 0; return; }
      if (!idleSince) idleSince = performance.now();
      w.__lwIdleGapMs = Math.max(w.__lwIdleGapMs || 0, performance.now() - idleSince);
    }, 100);
    w.__lwWorkingStop = () => clearInterval(timer);
  }, { selector: busySelector, pattern: workingPattern });
}

export async function stopWorkingWatch(page: Page): Promise<{ idleGapMs: number; seen: string[] }> {
  return page.evaluate(() => {
    const w = window as unknown as { __lwIdleGapMs?: number; __lwWorkingStop?: () => void; __lwWorkingSeen?: string[] };
    w.__lwWorkingStop?.();
    return { idleGapMs: w.__lwIdleGapMs || 0, seen: w.__lwWorkingSeen || [] };
  });
}
