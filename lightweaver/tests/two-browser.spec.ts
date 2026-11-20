// Two browsers, one card. Findings are attached, never asserted, so every cell runs.
import { test } from '@playwright/test';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import type { CardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

const STATES = ['installed-match', 'playing', 'provisional', 'wiring-open', 'factory-blank'];
const ENTRIES = [{ id: 'home', hash: '/' }, { id: 'pattern', hash: '/#screen=pattern' }];
const VIEWPORTS = [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }];
const ALARM = /\b(fail(ed|ure)?|error|could ?n[o']t|cannot|can't|not sent|lost|refused|returned \d{3}|differs|different project|rolled back|roll(ed)?-?back|update available|not connected|disconnected|try again|another|taken|took over|other (window|tab|browser))\b/i;

async function seedRemembered(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

async function linkState(page: Page): Promise<string> {
  try {
    return await page.evaluate(async () => {
      const { getSharedCardLink } = await import('/src/lib/cardLink.js');
      return String(getSharedCardLink().getState()?.state || '');
    });
  } catch (e) { return `eval-error:${String(e).slice(0, 60)}`; }
}
async function waitConnected(page: Page, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (/^connected-/.test(await linkState(page))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}
async function alarms(page: Page): Promise<string[]> {
  try {
    return await page.evaluate((source) => {
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
        if (!t || t.length > 240 || !el || !visible(el)) continue;
        if (el.closest('details:not([open])')) continue;
        if (alarm.test(t)) seen.add(`text: ${t}`);
      }
      return Array.from(seen);
    }, ALARM.source);
  } catch (e) { return [`eval-error:${String(e).slice(0, 80)}`]; }
}
async function facts(page: Page) {
  try {
    return await page.evaluate(() => {
      const tx = (sel: string) => Array.from(document.querySelectorAll(sel)).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160));
      return {
        hash: location.hash,
        chip: tx('[data-testid="card-link-status"]'),
        activeTask: tx('[data-testid="setup-active-task"]'),
        identity: tx('[data-testid="setup-identity-row"]'),
        progress: tx('[data-testid="setup-progress"]'),
        body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
      };
    });
  } catch (e) { return { error: String(e).slice(0, 80) }; }
}

/** Connect with the click budget of any-state-quiet. Returns presses used. */
async function connect(page: Page): Promise<{ connected: boolean; clicks: number; how: string[] }> {
  const how: string[] = [];
  let connected = await waitConnected(page, 12000);
  let clicks = 0;
  if (!connected) {
    const setup = page.getByTestId('setup-connect-card');
    const chip = page.getByTestId('card-link-status');
    if (await setup.count()) { await setup.first().click().catch(() => {}); clicks++; how.push('setup-connect-card'); }
    else if (await chip.count()) { await chip.first().click().catch(() => {}); clicks++; how.push('card-link-status'); }
    connected = await waitConnected(page, 6000);
    if (!connected) {
      const btn = page.locator('#card-connection-center').getByRole('button', { name: /^Connect$/ });
      if (await btn.count()) { await btn.first().click().catch(() => {}); clicks++; how.push('panel-Connect'); connected = await waitConnected(page, 12000); }
    }
  }
  return { connected, clicks, how };
}

async function newWindow(browser: Browser, baseURL: string, card: CardSimulator, vp: { width: number; height: number }, remembered: boolean) {
  const ctx = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await card.install(page);
  if (remembered) await seedRemembered(page);
  return { ctx, page };
}

async function tap(page: Page, card: CardSimulator, id: string, label: string) {
  const byId = page.locator(`.pm-cards .pmcard[data-pattern-id="${id}"]`);
  const t0 = card.requests.length;
  let used = 'none';
  try {
    if (await byId.count()) { await byId.first().click({ timeout: 4000 }); used = 'data-pattern-id'; }
    else {
      const byText = page.getByText(label, { exact: true });
      if (await byText.count()) { await byText.first().click({ timeout: 4000 }); used = 'text'; }
    }
  } catch (e) { used = `click-error:${String(e).slice(0, 60)}`; }
  await page.waitForTimeout(2000);
  const writes = card.requests.slice(t0).filter(r => r.method !== 'GET').map(r => `${r.method} ${r.path} ${JSON.stringify(r.body).slice(0, 80)}`);
  return { used, writes };
}

async function toPatterns(page: Page) {
  await page.evaluate(() => { location.hash = '#screen=pattern'; });
  await page.waitForTimeout(1500);
}

type Rec = Record<string, unknown>;
async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`) }).catch(() => {});
}

for (const stateId of STATES) {
  for (const vp of VIEWPORTS) {
    for (const entry of ENTRIES) {
      const name = `${stateId} · ${vp.id} · B at ${entry.id}`;
      test(name, async ({ browser }, info) => {
        const baseURL = String(info.project.use.baseURL);
        const spec = cardState(stateId);
        const card = createCardSimulator(spec);
        const rec: Rec = { cell: name };
        const wins: BrowserContext[] = [];
        try {
          const A = await newWindow(browser, baseURL, card, vp, true); wins.push(A.ctx);
          await A.page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
          rec.A_connect = await connect(A.page);
          await A.page.waitForTimeout(2000);
          rec.A_afterConnect = { alarms: await alarms(A.page), facts: await facts(A.page) };
          await shot(A.page, info, 'A-1-connected');

          const B = await newWindow(browser, baseURL, card, vp, false); wins.push(B.ctx);
          await B.page.goto(entry.hash, { waitUntil: 'domcontentloaded' });
          rec.B_connect = await connect(B.page);
          await B.page.waitForTimeout(2500);
          rec.B_afterConnect = { alarms: await alarms(B.page), facts: await facts(B.page), projectName: spec.projectName,
            showsProjectName: spec.projectName ? JSON.stringify(await facts(B.page)).includes(spec.projectName) : null };
          await shot(B.page, info, 'B-1-connected');

          const first = spec.patterns.find(p => p.id === 'fire' && spec.currentId !== 'fire') || spec.patterns.find(p => p.id !== spec.currentId);
          const before = card.playingId();
          if (entry.id === 'home') await toPatterns(B.page);
          rec.B_tap = first ? { ...(await tap(B.page, card, first.id, first.label)), wanted: first.id, before, after: card.playingId() } : { noPatterns: true };
          rec.B_afterTap = { alarms: await alarms(B.page) };
          await shot(B.page, info, 'B-2-after-tap');

          // Back to A.
          await A.page.bringToFront().catch(() => {});
          await A.page.waitForTimeout(10000);
          rec.A_after10s = { link: await linkState(A.page), alarms: await alarms(A.page), facts: await facts(A.page) };
          await shot(A.page, info, 'A-2-after-10s');
          const reqsBefore = card.requests.length;
          const second = spec.patterns.find(p => p.id !== card.playingId() && p.id !== first?.id) || spec.patterns.find(p => p.id !== card.playingId());
          if (second) {
            await toPatterns(A.page);
            const was = card.playingId();
            const t = await tap(A.page, card, second.id, second.label);
            rec.A_tap = { ...t, wanted: second.id, before: was, after: card.playingId(), reachedCard: card.playingId() === second.id };
          } else rec.A_tap = { noPatterns: true };
          rec.A_afterTap = { link: await linkState(A.page), alarms: await alarms(A.page), allNewWrites: card.requests.slice(reqsBefore).filter(r => r.method !== 'GET').length };
          await shot(A.page, info, 'A-3-after-tap');

          await A.page.reload({ waitUntil: 'domcontentloaded' });
          rec.A_reload_connect = await connect(A.page);
          await A.page.waitForTimeout(3000);
          rec.A_afterReload = { link: await linkState(A.page), alarms: await alarms(A.page), facts: await facts(A.page) };
          await shot(A.page, info, 'A-4-reloaded');
          rec.outputDir = info.outputPath('');
        } catch (e) {
          rec.harnessError = String(e).slice(0, 300);
        } finally {
          await info.attach('cell', { contentType: 'application/json', body: JSON.stringify(rec, null, 1) });
          console.log('CELL ' + JSON.stringify(rec));
          for (const c of wins) await c.close().catch(() => {});
        }
      });
    }
  }
}

test('three contexts · playing · desktop', async ({ browser }, info) => {
  const baseURL = String(info.project.use.baseURL);
  const vp = VIEWPORTS[0];
  const spec = cardState('playing');
  const card = createCardSimulator(spec);
  const rec: Rec = { cell: 'three contexts' };
  const wins: BrowserContext[] = [];
  try {
    const names = ['A', 'B', 'C'];
    const pages: Page[] = [];
    for (let i = 0; i < 3; i++) {
      const w = await newWindow(browser, baseURL, card, vp, i === 0); wins.push(w.ctx); pages.push(w.page);
      await w.page.goto(i === 0 ? '/#screen=card' : '/#screen=pattern', { waitUntil: 'domcontentloaded' });
      rec[`${names[i]}_connect`] = await connect(w.page);
      await w.page.waitForTimeout(2500);
      await shot(w.page, info, `${names[i]}-1-connected`);
    }
    await pages[0].waitForTimeout(10000);
    for (let i = 0; i < 3; i++) {
      rec[`${names[i]}_after10s`] = { link: await linkState(pages[i]), alarms: await alarms(pages[i]), facts: await facts(pages[i]) };
      await shot(pages[i], info, `${names[i]}-2-after10s`);
    }
    const reqs = card.requests.length;
    const taps: Rec = {};
    const order = [['A', 0, 'aurora', 'Aurora'], ['B', 1, 'plasma', 'Plasma'], ['C', 2, 'aurora', 'Aurora']] as const;
    for (const [n, i, id, label] of order) {
      if (i === 0) await toPatterns(pages[0]);
      const before = card.playingId();
      taps[n] = { ...(await tap(pages[i], card, id, label)), before, after: card.playingId() };
    }
    rec.taps = taps; rec.totalWrites = card.requests.slice(reqs).filter(r => r.method !== 'GET').length;
    for (let i = 0; i < 3; i++) { rec[`${names[i]}_end`] = { link: await linkState(pages[i]), alarms: await alarms(pages[i]) }; await shot(pages[i], info, `${names[i]}-3-end`); }
    rec.outputDir = info.outputPath('');
  } catch (e) { rec.harnessError = String(e).slice(0, 300); }
  finally {
    await info.attach('cell', { contentType: 'application/json', body: JSON.stringify(rec, null, 1) });
    console.log('CELL ' + JSON.stringify(rec));
    for (const c of wins) await c.close().catch(() => {});
  }
});
