// Measure: first setup from a blank card (connect, count lights, pick output, save).
// Press path is the one tests/journey-j01.spec.ts proves; this file only counts it.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState } from '../harness/cardStates';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const direct of [false, true]) for (const vp of WIDTHS) {
  test.describe(`${direct ? 'direct' : 'via-layout'} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    test(`first setup from a blank card ${direct ? 'direct' : 'via layout'} @${vp.width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await guardRealCard(page);
      const card = createCardSimulator(cardState('factory-blank'));
      await card.install(page);
      const j = recordJourney(page, direct ? 'first-setup' : 'first-setup-via-layout', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.locator('main h1').first().waitFor({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await j.land('opens led.mandalacodes.com');
        // A first-time client lands on the bare URL. Get to Card Home the way they would.
        const pair = page.getByRole('button', { name: 'Pair this card', exact: true });
        if (!(await pair.isVisible().catch(() => false))) {
          j.note('bare URL does not show Pair this card; owner navigates to Card');
          await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
        }
        await j.press(pair, 'Pair this card');
        await j.press(page.getByTestId('setup-lights-action'), 'Find my lights');
        await j.press(page.getByTestId('discovery-probe-18'), 'Pick output 18 (the one that lit)');
        await j.press(page.getByTestId('discovery-start'), 'Start counting');
        await expect(page.getByTestId('discovery-color-proof')).toBeVisible({ timeout: 20_000 });
        await j.press(page.getByTestId('discovery-color-red'), 'Colour check: red');
        await j.press(page.getByTestId('discovery-color-green'), 'Colour check: green');
        await j.type(page.getByTestId('discovery-count-18'), '41', 'Type the LED count');
        await j.press(page.getByTestId('discovery-counts-done'), 'Counts done');
        await j.press(page.getByTestId('discovery-end-yes'), 'Last light is lit: yes');
        await j.press(page.getByTestId('discovery-record-save'), 'Save what we found');
        if (direct) {
          await j.press(page.getByRole('button', { name: 'Install and open Patterns' }).first(), 'Install and open Patterns');
        } else {
          await j.press(page.getByTestId('discovery-continue-layout'), 'Continue to Layout');
          await page.waitForTimeout(1200);
          await j.land('Layout (nothing required here)');
          j.note('owner returns to Card Home by tapping the Card tab');
          const cardTab = page.getByRole('link', { name: /^card$/i }).or(page.getByRole('button', { name: /^card$/i })).first();
          if (await cardTab.isVisible().catch(() => false)) await j.press(cardTab, 'Back to Card');
          else await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
          await j.press(page.getByTestId('setup-verify-action'), 'Save to card');
        }
        await j.press(page.getByTestId('replace-card-project'), 'Replace the temporary setup');
        await j.press(page.getByTestId('wiring-test-start'), 'Start light test');
        await j.press(page.getByTestId('wiring-test-confirm'), 'Lights look right');
        await expect(page).toHaveURL(/#screen=pattern$/, { timeout: 20_000 });
        await page.waitForTimeout(1500);
      } catch (error) {
        j.blocked(String(error).split('\n')[0].slice(0, 200));
      }
      await j.finish();
    });
  });
}
