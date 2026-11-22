// Measure: the phone shell (rail, top bar, footer, notices) on six owner screens.
// Screenshots + geometry of what covers what, at 390x844 (and 1280 for the desktop check).
// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md, Mobile UI/UX).
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState } from '../harness/cardStates';
import { guardRealCard } from './journeyRecorder';
import { bootSetUp } from './journeySeed';
import { seedKnownCard, seedCompleteProject } from './_seed';
import { seedFirmwareUpdate } from './updateSeed';

test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure the phone shell');
const OUT = path.join(process.env.LW_UX_OUT || '.', 'phone-shell', process.env.LW_UX_TAG || 'before');
const W = Number(process.env.LW_UX_WIDTH || 390);
const H = W < 700 ? 844 : 800;

async function measure(page: Page, name: string) {
  await page.waitForTimeout(1500);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${W}-${name}.png`) });
  const geo = await page.evaluate(() => {
    const box = (sel: string) => [...document.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 ? { sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) } : null;
    }).filter(Boolean);
    const shell = ['.rail', '.topbar', '.status-bar', '.lw-notice', '.card-setup-backdrop', '.card-setup-overlay', '[role=dialog]'].flatMap(box);
    // Every visible control whose centre is covered by something else.
    const covered: any[] = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, [role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
      const cx = Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2));
      const cy = Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2));
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) {
        const owner = top.closest('.lw-notice, .status-bar, .topbar, .rail, .card-setup-overlay, [role=dialog]');
        covered.push({ control: (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50), by: owner ? owner.className.toString().slice(0, 50) : top.className.toString().slice(0, 50) });
      }
    }
    const main = document.querySelector('main, .screen');
    const mr = main?.getBoundingClientRect();
    return { hash: location.hash, vw: innerWidth, vh: innerHeight, shell, covered, screen: mr ? { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) } : null,
      primaries: [...document.querySelectorAll('.btn.primary')].filter(e => (e as HTMLElement).offsetParent).map(e => (e.textContent || '').trim().slice(0, 40)) };
  });
  fs.writeFileSync(path.join(OUT, `${W}-${name}.json`), JSON.stringify(geo, null, 2));
}

test.describe(`${W}px`, () => {
  test.use({ viewport: { width: W, height: H }, isMobile: W < 700, hasTouch: W < 700 });

  test('card home, patterns, playlist, layout', async ({ page }) => {
    test.setTimeout(120_000);
    await bootSetUp(page);
    await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20_000 });
    await measure(page, 'card-home');
    for (const s of ['pattern', 'playlist', 'layout']) {
      await page.evaluate(h => { location.hash = h; }, `#screen=${s}`);
      await measure(page, s);
    }
  });

  test('light check (counting)', async ({ page }) => {
    test.setTimeout(120_000);
    await guardRealCard(page);
    const card = createCardSimulator(cardState('factory-blank'));
    await card.install(page);
    await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Pair this card', exact: true }).click({ timeout: 20_000 });
    await page.getByTestId('setup-lights-action').click({ timeout: 20_000 });
    await page.getByTestId('discovery-probe-18').click({ timeout: 20_000 });
    await measure(page, 'light-check-probe');
    await page.getByTestId('discovery-start').click();
    await expect(page.getByTestId('discovery-color-proof')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('discovery-color-red').click();
    await page.getByTestId('discovery-color-green').click();
    await page.getByTestId('discovery-count-18').fill('41');
    await measure(page, 'light-check-count');
  });

  test('update screen', async ({ page }) => {
    test.setTimeout(120_000);
    await guardRealCard(page);
    const spec = cardState('stale-firmware');
    const card = createCardSimulator(spec);
    await seedCompleteProject(page, cardState('installed-match'));
    await seedKnownCard(page, spec);
    await seedFirmwareUpdate(page);
    await card.install(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Update card', exact: true }).or(page.getByRole('button', { name: /^\s*\d+\s*→\s*\d+/ })).first().click({ timeout: 20_000 });
    await expect(page.getByTestId('preserving-update-panel')).toBeVisible({ timeout: 15_000 });
    await measure(page, 'update');
  });
});
