import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState } from '../harness/cardStates';
import { guardRealCard } from './journeyRecorder';
import { bootSetUp } from './journeySeed';
test.skip(!process.env.LW_UX_OUT);
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const rows: string[] = [];
async function audit(page: Page, name: string) {
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    const out: string[] = [];
    const root = document.querySelector('.card-setup-overlay') || document.querySelector('.app > .screen');
    for (const el of root!.querySelectorAll('*')) {
      const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      if (el.closest('svg,canvas')) continue;
      const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize);
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()) || el.matches('input,select,textarea');
      const heading = /^H[1-3]$/.test(el.tagName);
      const ctl = el.matches('button,input,select,textarea,a.btn,summary');
      const why: string[] = [];
      if (own && !heading && fs > 15) why.push(`font ${fs}`);
      if (heading && fs > 17) why.push(`title ${fs}`);
      if (ctl && b.height > 48 && !el.matches('.pmcard,.pm-card,[class*=tile]')) why.push(`h ${Math.round(b.height)}`);
      if (why.length) out.push(`${why.join(',')} | ${el.tagName.toLowerCase()}.${(el.className?.toString()||'').trim().split(/\s+/).slice(0,2).join('.')} | ${(el.textContent||(el as HTMLInputElement).value||'').replace(/\s+/g,' ').trim().slice(0,40)}`);
    }
    return out;
  });
  rows.push(`== ${name}`, ...new Set(r));
}
test('scale', async ({ page }) => {
  test.setTimeout(180000);
  await bootSetUp(page);
  await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20000 });
  await audit(page, 'card-home');
  await page.locator('.app > .screen details > summary').evaluateAll(s => s.forEach(x => (x.parentElement as HTMLDetailsElement).open = true));
  await audit(page, 'card-home-open');
  for (const s of ['pattern', 'playlist', 'layout', 'show', 'pattern-lab']) { await page.evaluate(h => { location.hash = h; }, `#screen=${s}`); await audit(page, s); }
  await page.evaluate(() => { location.hash = '#screen=card&section=install&intent=update-card'; }); await audit(page, 'install');
  fs.writeFileSync(`${process.env.LW_UX_OUT}/scale-a.txt`, rows.join('\n'));
});
test('scale setup', async ({ page }) => {
  test.setTimeout(180000);
  await guardRealCard(page);
  const card = createCardSimulator(cardState('factory-blank'));
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await audit(page, 'setup-unpaired');
  await page.getByRole('button', { name: 'Pair this card', exact: true }).click({ timeout: 45000 });
  await page.waitForTimeout(1500); await audit(page, 'setup-paired');
  await page.getByTestId('setup-lights-action').click({ timeout: 20000 });
  await audit(page, 'discovery-start');
  await page.getByTestId('discovery-probe-18').click({ timeout: 20000 }); await audit(page, 'probe');
  await page.getByTestId('discovery-start').click();
  await expect(page.getByTestId('discovery-color-proof')).toBeVisible({ timeout: 20000 }); await audit(page, 'color');
  await page.getByTestId('discovery-color-red').click(); await page.getByTestId('discovery-color-green').click();
  await page.getByTestId('discovery-count-18').fill('41'); await audit(page, 'count');
  await page.getByTestId('discovery-counts-done').click(); await audit(page, 'end');
  await page.getByTestId('discovery-end-yes').click();
  await page.waitForTimeout(3000); await audit(page, 'done');
  fs.writeFileSync(`${process.env.LW_UX_OUT}/scale-b.txt`, rows.join('\n'));
});
