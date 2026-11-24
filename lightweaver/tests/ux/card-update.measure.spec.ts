// Measure: a connected card on an older firmware build; owner updates it over Wi-Fi from the browser.
import { test } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState } from '../harness/cardStates';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';
import { seedKnownCard, seedCompleteProject } from './_seed';
import { seedFirmwareUpdate } from './updateSeed';
import { driveCardUpdate } from './drivers';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    test(`card update @${vp.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await guardRealCard(page);
      const spec = cardState('stale-firmware');
      const card = createCardSimulator(spec);
      await seedCompleteProject(page, cardState('installed-match'));
      await seedKnownCard(page, spec);
      await seedFirmwareUpdate(page);
      await card.install(page);
      const j = recordJourney(page, 'card-update-after', vp.width);
      try { await driveCardUpdate(page, j); } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
