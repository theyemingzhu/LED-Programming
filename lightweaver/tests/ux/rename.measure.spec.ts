// Measure: rename the project from Card Home and save the name to the card.
import { test } from '@playwright/test';
import { recordJourney, WIDTHS } from './journeyRecorder';
import { bootSetUp } from './journeySeed';
import { driveRename } from './drivers';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    test(`rename @${vp.width}`, async ({ page }) => {
      test.setTimeout(150_000);
      const card = await bootSetUp(page); // guardRealCard first
      const j = recordJourney(page, 'rename-after', vp.width);
      try { await driveRename(page, j, card); } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
