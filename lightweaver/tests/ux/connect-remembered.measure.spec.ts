// Measure: browser remembers the card; owner opens / and reaches a connected Card Home.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState } from '../harness/cardStates';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';
import { seedKnownCard, seedCompleteProject } from './_seed';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    test(`connect remembered card @${vp.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await guardRealCard(page);
      const spec = cardState('installed-match');
      const card = createCardSimulator(spec);
      await seedCompleteProject(page, spec);
      await seedKnownCard(page, spec);
      await card.install(page);
      const j = recordJourney(page, 'connect-remembered', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await j.land('opens led.mandalacodes.com');
        await page.waitForTimeout(500);
        await j.land('0.5s after open');
        await page.waitForTimeout(3000);
        await j.land('3.5s after open');
        const state = await page.evaluate(async () => {
          const { getSharedCardLink } = await import('/src/lib/cardLink.js');
          return String(getSharedCardLink().getState()?.state || '');
        });
        j.note(`link state after 3.5s with zero presses: ${state}; url=${page.url()}`);
        if (!/^connected-(direct|bridge)$/.test(state)) {
          const find = page.getByTestId('setup-connect-card');
          if (await find.count()) await j.press(find, 'Find my card');
          await expect.poll(async () => page.evaluate(async () => String((await import('/src/lib/cardLink.js')).getSharedCardLink().getState()?.state || '')), { timeout: 15000 }).toMatch(/^connected-/);
        }
        await page.waitForTimeout(800);
      } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
