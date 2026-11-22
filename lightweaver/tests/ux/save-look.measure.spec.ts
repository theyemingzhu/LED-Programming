// Measure: change a look (speed) on Patterns and save it onto the card so it survives.
import { test, expect } from '@playwright/test';
import { recordJourney, WIDTHS } from './journeyRecorder';
import { bootSetUp } from './journeySeed';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    test(`save a look to the card @${vp.width}`, async ({ page }) => {
      test.setTimeout(240_000);
      const card = await bootSetUp(page);
      const j = recordJourney(page, 'save-look', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        await j.land('opens led.mandalacodes.com (remembered card, set up)');
        await j.press(page.getByRole('link', { name: /^patterns$/i }).or(page.getByRole('button', { name: /^patterns$/i })).first(), 'Patterns tab');
        await page.waitForTimeout(1500);
        await j.type(page.getByTestId('look-speed-slider'), '2', 'Set Speed slider to 2x (type counted as one decision)');
        await page.waitForTimeout(600);
        await j.press(page.getByRole('button', { name: 'Install on card', exact: true }).first(), 'Install on card');
        // With the card holding the same wiring, Install posts the config straight away.
        // A wiring light test would only be offered if the layout differed.
        await expect.poll(() => card.requests.some(r => r.method === 'POST' && r.path === '/api/config'), { timeout: 20_000 }).toBe(true);
        await page.waitForTimeout(1500);
        j.note(`URL after install: ${page.url()}`);
        j.note(`wiring light test offered: ${await page.getByTestId('wiring-test-start').isVisible().catch(() => false)}`);
        await j.land('after Install on card');
        j.note(`card POSTs: ${[...new Set(card.requests.filter(r => r.method === 'POST').map(r => r.path))].join(', ')}`);
        j.note(`installedLooks on card: ${JSON.stringify(card.state.installedLooks)?.slice(0, 160)}`);
      } catch (error) {
        j.blocked(String(error).split('\n')[0].slice(0, 200));
      }
      await j.finish();
    });
  });
}
