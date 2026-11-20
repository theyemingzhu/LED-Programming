// Bad-network stress: after the network misbehaves and is restored, Studio must
// reconnect on its own and must not keep showing a message that is false now.
// Each cell writes a verbatim record (link state, alarms, busy labels) to the
// report; it records, it does not assert, so every cell runs to completion.
import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

const ALARM = /\b(fail(ed|ure)?|error|could ?n[o']t|cannot|can't|not sent|lost|refused|returned \d{3}|differs|different project|rolled back|roll(ed)?-?back|update available|not connected|disconnected|try again|offline|unreachable|json|http|timed? ?out|unexpected|reconnect|not reach|stuck|retry)\b/i;

async function seedRemembered(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}
async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}
async function waitConnected(page: Page, ms: number): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (/^connected-/.test(await linkState(page))) return Date.now() - t0;
    await page.waitForTimeout(250);
  }
  return null;
}
async function alarms(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const alarm = new RegExp(source, 'i');
    const seen = new Set<string>();
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const st = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    for (const el of Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"]'))) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && visible(el)) seen.add(`alert: ${t.slice(0, 200)}`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!t || t.length > 200 || !el || !visible(el)) continue;
      if (el.closest('details:not([open])')) continue;
      if (alarm.test(t)) seen.add(`text: ${t}`);
    }
    return Array.from(seen);
  }, ALARM.source);
}
async function busy(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!t || t.length > 120 || !el || !/(…|\.\.\.)$/.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && !el.closest('details:not([open])')) out.add(t);
    }
    return Array.from(out);
  });
}

async function act(page: Page, entry: string) {
  if (entry === 'pattern') {
    await page.getByRole('button', { name: /^Fire\d/ }).first().click({ timeout: 5000 }).catch(() => {});
    await page.getByTestId('look-brightness-slider').fill('0.5', { timeout: 3000 }).catch(() => {});
  } else {
    const fader = page.getByLabel('Brightness limit');
    if (await fader.count()) await fader.first().fill('200').catch(() => {});
    else await page.getByRole('button', { name: 'Recover lights' }).first().click({ timeout: 3000 }).catch(() => {});
  }
}

type Disturbance = {
  id: string;
  apply(card: CardSimulator): void;
  /** Milliseconds the disturbance lasts before the network is restored. */
  holdMs: number;
  restore(card: CardSimulator): void;
};
const noop = () => {};
const DISTURBANCES: Disturbance[] = [
  { id: 'offline-5s', apply: c => c.goOffline(), holdMs: 5000, restore: c => c.goOnline() },
  { id: 'offline-20s', apply: c => c.goOffline(), holdMs: 20000, restore: c => c.goOnline() },
  { id: 'offline-60s', apply: c => c.goOffline(), holdMs: 60000, restore: c => c.goOnline() },
  { id: 'delay-4s-for-30s', apply: c => c.setReplyDelay(4000), holdMs: 30000, restore: c => c.setReplyDelay(0) },
  { id: 'one-http-500', apply: c => c.refuse('/api/control', { status: 500, body: { error: 'internal error' }, times: 1 }), holdMs: 3000, restore: noop },
  { id: 'truncated-status-json', apply: c => c.truncateNext('/api/status', 1), holdMs: 3000, restore: noop },
  { id: 'reply-then-connection-cut', apply: c => c.cutAfterNextReply(), holdMs: 3000, restore: noop },
];

for (const entry of ['card', 'pattern']) {
  for (const d of DISTURBANCES) {
    test(`${entry} · ${d.id}`, async ({ page }, info) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 1440, height: 900 });
      const card = createCardSimulator(cardState('playing'));
      await card.install(page);
      await seedRemembered(page);
      await page.goto(`/#screen=${entry}`, { waitUntil: 'domcontentloaded' });
      const first = await waitConnected(page, 20000);
      await page.waitForTimeout(2500);
      const baseline = await alarms(page);

      d.apply(card);
      await page.waitForTimeout(500);
      await act(page, entry);
      await page.waitForTimeout(d.holdMs);
      const during = { link: await linkState(page), alarms: await alarms(page), busy: await busy(page) };
      d.restore(card);
      const t0 = Date.now();
      const reconnectedMs = await waitConnected(page, 20000);
      // Give the screen the rest of the 20 s to clear itself.
      const left = 20000 - (Date.now() - t0);
      if (left > 0) await page.waitForTimeout(left);
      const after = { link: await linkState(page), alarms: await alarms(page), busy: await busy(page) };
      await page.screenshot({ path: info.outputPath('screen.png') });
      const record = { cell: `${entry} · ${d.id}`, firstConnectMs: first, baseline, during, reconnectedMs, after,
        unhandled: card.unhandled, screenshot: info.outputPath('screen.png') };
      await info.attach('cell', { contentType: 'application/json', body: JSON.stringify(record, null, 1) });
      console.log('CELL ' + JSON.stringify(record));
    });
  }
}
