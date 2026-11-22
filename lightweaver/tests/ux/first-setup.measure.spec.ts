// Measure: first setup from a blank card (connect, count lights, pick output, save).
// The press path lives in drivers.ts, shared with tests/simpler-journeys.spec.ts.
import { test } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState } from '../harness/cardStates';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';
import { driveFirstSetup } from './drivers';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    test(`first setup from a blank card @${vp.width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await guardRealCard(page);
      const card = createCardSimulator(cardState('factory-blank'));
      await card.install(page);
      const j = recordJourney(page, 'first-setup-after', vp.width);
      try { await driveFirstSetup(page, j); } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
