// Measure: change the LED count on an installed card (41 -> 60) and get it onto the card.
// The press path lives in drivers.ts, shared with tests/simpler-journeys.spec.ts.
import { test } from '@playwright/test';
import { recordJourney, WIDTHS } from './journeyRecorder';
import { bootSetUp } from './journeySeed';
import { driveChangeCount } from './drivers';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    test(`change count @${vp.width}`, async ({ page }) => {
      test.setTimeout(150_000);
      const card = await bootSetUp(page); // guardRealCard first
      const j = recordJourney(page, 'change-count-after', vp.width);
      try { await driveChangeCount(page, j, card); } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
