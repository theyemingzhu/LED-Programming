// Measure: a remembered card fell off Wi-Fi (not answering) and comes back; owner reconnects.
// Model: card offline when Studio opens; owner fixes the card (we goOnline); then whatever Studio needs.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState } from '../harness/cardStates';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';
import { seedKnownCard, seedCompleteProject } from './_seed';
import { linkState } from './_explore';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    test(`wifi recovery @${vp.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await guardRealCard(page);
      const spec = cardState('installed-match');
      const card = createCardSimulator(spec);
      await seedCompleteProject(page, spec);
      await seedKnownCard(page, spec);
      await card.install(page);
      card.goOffline();
      const j = recordJourney(page, 'wifi-recovery', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        await j.land('opens Studio while the card is off Wi-Fi');
        card.goOnline();
        j.note('card back on Wi-Fi (simulated) — waiting 8s to see whether Studio reconnects without a press');
        await page.waitForTimeout(8000);
        j.note(`link state after 8s unaided: ${await linkState(page)}`);
        await j.land('8s after card returned, no press');
        if (!/^connected-/.test(await linkState(page))) {
          const find = page.getByTestId('setup-connect-card').or(page.getByRole('button', { name: 'Find my card' })).first();
          await j.press(find, 'Find my card');
          await expect.poll(() => linkState(page), { timeout: 20000 }).toMatch(/^connected-/);
          await page.waitForTimeout(800);
        }
      } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
