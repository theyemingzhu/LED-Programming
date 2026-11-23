// Measure: build a playlist of 3 looks, reorder it, get it onto the card.
// A drag is counted as ONE press: it is recorded with j.land("DRAG ...") for the
// screenshot and then record.presses is bumped by hand (journeyRecorder has no drag).
import { test, expect } from '@playwright/test';
import { recordJourney, WIDTHS } from './journeyRecorder';
import { bootSetUp } from './journeySeed';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    test(`playlist of 3, reorder, install @${vp.width}`, async ({ page }) => {
      test.setTimeout(240_000);
      const card = await bootSetUp(page);
      const j = recordJourney(page, 'playlist', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        await j.land('opens led.mandalacodes.com (remembered card, set up, empty playlist)');
        await j.press(page.getByRole('link', { name: /^playlist$/i }).or(page.getByRole('button', { name: /^playlist$/i })).first(), 'Playlist tab');
        await page.waitForTimeout(1500);
        for (const name of ['Ocean', 'Ripple', 'Lava Lamp']) {
          await j.press(page.getByRole('button', { name: `Add ${name}`, exact: true }).first(), `Add ${name}`);
        }
        const handle = (n: string) => page.getByRole('button', { name: `Reorder ${n}`, exact: true });
        await expect(handle('Lava Lamp')).toBeVisible();
        await handle('Lava Lamp').scrollIntoViewIfNeeded();
        await j.land('DRAG Lava Lamp above Ocean (counted as one press)');
        try {
          await handle('Lava Lamp').dragTo(handle('Ocean'));
          j.record.presses += 1;
          j.note('drag counted as 1 press via manual increment');
        } catch (e) {
          j.note(`pointer drag failed: ${String(e).split('\n')[0]}; trying keyboard`);
          await handle('Lava Lamp').focus();
          await page.keyboard.press('ArrowUp');
          j.record.presses += 1;
        }
        const order = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController.playlist.map((e: any) => e.patternId || e.lookId));
        j.note(`playlist order in project after drag: ${order.join(' > ')}`);
        await j.press(page.getByRole('button', { name: 'Install playlist on card', exact: true }), 'Install playlist on card');
        await page.waitForTimeout(2500);
        j.note(`after install URL: ${page.url()}`);
        const start = page.getByTestId('wiring-test-start');
        if (await start.isVisible().catch(() => false)) {
          await j.press(start, 'Start light test');
          await j.press(page.getByTestId('wiring-test-confirm'), 'Lights look right');
          await page.waitForTimeout(2000);
        }
        j.note(`card POSTs: ${[...new Set(card.requests.filter(r => r.method === 'POST').map(r => r.path))].join(', ')}`);
      } catch (error) {
        j.blocked(String(error).split('\n')[0].slice(0, 200));
      }
      await j.finish();
    });
  });
}
