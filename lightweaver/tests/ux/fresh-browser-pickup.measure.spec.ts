// Measure: fresh browser (no localStorage), card installed-match, owner opens #screen=pattern and plays a tile.
import { test } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState, MATRIX_PATTERNS } from '../harness/cardStates';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';
import { driveFreshBrowserPickup } from './drivers';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    test(`fresh browser pickup @${vp.width}`, async ({ page }) => {
      test.setTimeout(150_000);
      await guardRealCard(page);
      const spec = cardState('installed-match');
      const card = createCardSimulator(spec);
      await card.install(page);
      const j = recordJourney(page, 'fresh-browser-pickup-after', vp.width);
      const target = MATRIX_PATTERNS.find(p => p.id !== spec.currentId) || MATRIX_PATTERNS[0];
      try { await driveFreshBrowserPickup(page, j, card, target.id); } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
