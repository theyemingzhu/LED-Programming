// Measure: change the LED count on an installed card (41 -> 60) and get it onto the card.
// Variant A (change-count): the row's own 'Change count' door, as a first-time client presses it.
import { test, expect } from '@playwright/test';
import { recordJourney, WIDTHS } from './journeyRecorder';
import { bootSetUp } from './journeySeed';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    test(`change count via Change count door @${vp.width}`, async ({ page }) => {
      test.setTimeout(150_000);
      const card = await bootSetUp(page); // guardRealCard first
      const j = recordJourney(page, 'change-count', vp.width);
      try {
        await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20000 });
        await page.waitForTimeout(2500);
        await j.land('Card Home, connected (installed-home)');
        const door = page.getByTestId('fact-lights').getByRole('button', { name: 'Change count' });
        if (!(await door.count())) j.note('no Change count door visible on installed-home view');
        await j.press(door, 'Change count');
        await page.waitForTimeout(1500);
        await j.land('arrived');
        j.note(`url after Change count: ${page.url()}`);
        const buttons = await page.locator('button:visible, input:visible').evaluateAll(els => els.map(e => ((e as HTMLElement).getAttribute('aria-label') || (e as HTMLElement).textContent || (e as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 80));
        j.note(`controls: ${buttons.join(' | ')}`);
        const total = page.getByLabel('Total LEDs');
        await j.type(total, '60', 'Type 60 in Project LEDs (Layout)');
        j.note('no Enter/commit press: DrawModePanel.jsx:1391 commits on every onChange');
        await page.waitForTimeout(1200);
        await j.land('after typing 60');
        const stored = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'); return (p.layout?.strips || []).map((s: any) => s.pixelCount ?? s.pixels); });
        j.note(`stored strip counts after typing: ${JSON.stringify(stored)}`);
        await j.press(page.getByRole('button', { name: 'Install on card', exact: true }).first(), 'Install on card');
        await page.waitForTimeout(2500);
        await j.land('after Install on card');
        j.note(`url: ${page.url()}`);
        const after = await page.locator('button:visible').allTextContents();
        j.note(`visible buttons: ${after.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 500)}`);
        j.note(`POSTs: ${JSON.stringify(card.requests.filter((r: any) => r.method === 'POST').map((r: any) => r.path))}`);
        await j.press(page.getByTestId('wiring-test-start'), 'Start light test');
        await page.waitForTimeout(1500);
        await j.press(page.getByTestId('wiring-test-confirm'), 'Lights look right');
        await page.waitForTimeout(3500);
        await j.land('after confirm');
        j.note(`final url: ${page.url()}`);
        j.note(`final POSTs: ${JSON.stringify(card.requests.filter((r: any) => r.method === 'POST').map((r: any) => r.path))}`);
        j.note(`card pixels now: ${JSON.stringify(await page.evaluate(async () => { try { const r = await fetch('http://lightweaver.local/api/status'); const s = await r.json(); return s.led?.pixels ?? s.requestedPixels; } catch (e) { return String(e); } }))}`);
      } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
