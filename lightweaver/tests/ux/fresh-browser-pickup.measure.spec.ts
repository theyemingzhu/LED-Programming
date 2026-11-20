// Measure: fresh browser (no localStorage), card installed-match, owner opens #screen=pattern and plays a tile.
import { test } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState, MATRIX_PATTERNS } from '../harness/cardStates';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';

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
      const j = recordJourney(page, 'fresh-browser-pickup', vp.width);
      try {
        await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await j.land('opens led.mandalacodes.com/#screen=pattern');
        const target = MATRIX_PATTERNS.find(p => p.id !== spec.currentId) || MATRIX_PATTERNS[0];
        const tile = page.locator(`.pm-cards .pmcard[data-pattern-id="${target.id}"]`);
        // Footer chip says "Found — pair": the one prominent way to connect from Patterns.
        const chip = page.getByTestId('card-link-status');
        await j.press(chip, 'Footer chip: Lightweaver Found — pair');
        await page.waitForTimeout(2500);
        await j.land('after first press');
        const connected = async () => /^connected-/.test(await page.evaluate(async () => String((await import('/src/lib/cardLink.js')).getSharedCardLink().getState()?.state || '')));
        for (let i = 0; i < 4 && !(await connected()); i += 1) {
          const dlg = page.getByRole('dialog');
          const btn = (await dlg.count() ? dlg : page).locator('.btn.primary:visible').filter({ hasNotText: /^Save project$/ }).first();
          if (!(await btn.count())) { j.blocked('not connected and no primary'); break; }
          const label = ((await btn.textContent()) || '').replace(/\s+/g, ' ').trim();
          await j.press(btn, label);
          await page.waitForTimeout(2500);
        }
        if (await connected()) {
          await j.land('connected');
          const dlgClose = page.getByRole('dialog').getByRole('button', { name: /close|done/i }).first();
          if (await page.getByRole('dialog').count() && await dlgClose.count()) await j.press(dlgClose, 'Close dialog');
          await j.press(tile.first(), `Tap pattern tile "${target.id}"`);
          await card.waitForPlaying(target.id, 5000);
          j.note('tile played on card');
        }
        await page.waitForTimeout(500);
      } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
