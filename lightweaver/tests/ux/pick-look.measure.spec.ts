// Measure: make a different pattern play on the card, from a connected, set-up card.
// Variant A (pick-look): the shortest path the UI offers — the Card home primary
//   "Control installed project" opens the card drawer, where Next/select plays on the card.
// Variant B (pick-look-patterns-screen): the Patterns screen — tile (plays on the card at once; Install only makes it survive).
import { test, expect } from '@playwright/test';
import { recordJourney, WIDTHS } from './journeyRecorder';
import { bootSetUp } from './journeySeed';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    test(`pick a look via the card drawer @${vp.width}`, async ({ page }) => {
      test.setTimeout(180_000);
      const card = await bootSetUp(page);
      const j = recordJourney(page, 'pick-look', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        await j.land('opens led.mandalacodes.com (remembered card, set up)');
        const before = card.playingId();
        await j.press(page.getByRole('button', { name: 'Control installed project', exact: true }), 'Control installed project (primary)');
        await j.press(page.getByRole('dialog').getByRole('button', { name: 'Next pattern', exact: true }), 'Drawer: Next pattern');
        await expect.poll(() => card.playingId(), { timeout: 8000 }).not.toBe(before);
        j.note(`card went ${before} -> ${card.playingId()}`);
        await page.waitForTimeout(800);
      } catch (error) {
        j.blocked(String(error).split('\n')[0].slice(0, 200));
      }
      await j.finish();
    });

    test(`pick a look on the Patterns screen @${vp.width}`, async ({ page }) => {
      test.setTimeout(180_000);
      const card = await bootSetUp(page);
      const j = recordJourney(page, 'pick-look-patterns-screen', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        await j.land('opens led.mandalacodes.com (remembered card, set up)');
        await j.press(page.getByRole('link', { name: /^patterns$/i }).or(page.getByRole('button', { name: /^patterns$/i })).first(), 'Patterns tab');
        await page.waitForTimeout(1500);
        await j.press(page.locator('.pm-cards .pmcard[data-pattern-id="fire"]'), 'Pick Fire tile');
        await card.waitForPlaying('fire', 8000);
        j.note('the tile press alone plays Fire on the card (POST /api/control within 300 ms); Install on card is NOT needed to play it');
        await page.waitForTimeout(800);
      } catch (error) {
        j.blocked(String(error).split('\n')[0].slice(0, 200));
      }
      await j.finish();
    });
  });
}
