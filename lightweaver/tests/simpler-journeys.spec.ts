// Press-count gate for the simpler-journeys cuts — todo/plans/simpler-journeys.md.
//
// Each journey is driven by the same driver the measurement specs use
// (tests/ux/drivers.ts): the shortest path the screens offer a first-time
// owner. The press count is asserted EXACTLY at phone and desktop width, so a
// press a cut removed cannot quietly come back, and a further saving has to be
// written down here.
//
// Every cut also has a "still reachable" test: the thing the removed press
// used to lead to still opens, and whatever the press protected still holds.
//
// Practice card Fast throughout (docs/practice-card.md), except where a cut
// waits on the card: those use the measured real-card restart silence.
import { test, expect, type Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';
import { guardRealCard, recordJourney } from './ux/journeyRecorder';
import { driveFirstSetup } from './ux/drivers';

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1280, height: 800, isMobile: false, hasTouch: false };

/** Presses each journey takes today, per width. Lower a number only with the cut that earns it. */
export const PRESSES = {
  'first-setup': { 390: 13, 1280: 13 },
};

async function blankCard(page: Page) {
  await guardRealCard(page);
  const card = createCardSimulator(cardState('factory-blank'));
  await card.install(page);
  return card;
}

for (const [label, vp] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
  test.describe(`${label} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });

    test(`[C1] first setup saves to the card from the light check, in ${PRESSES['first-setup'][vp.width]} presses`, async ({ page }) => {
      test.setTimeout(180_000);
      const card = await blankCard(page);
      const j = recordJourney(page, 'first-setup', vp.width);
      await driveFirstSetup(page, j);
      const { presses, steps } = await j.finish();
      expect(steps.some(step => step.label === 'Continue to Layout'), 'Layout is a door, not a step').toBe(false);
      expect(presses, steps.filter(s => s.kind === 'press').map(s => s.label).join(' → ')).toBe(PRESSES['first-setup'][vp.width]);
      // The write really happened: the card holds the counted project, not the temporary setup.
      await expect.poll(() => ({ pixels: card.state.pixels, provisional: card.state.provisionalSetup }), { timeout: 15_000 })
        .toEqual({ pixels: 41, provisional: false });
    });
  });
}

test('[C1] Layout still opens from the light check, and nothing is written to the card', async ({ page }) => {
  test.setTimeout(150_000);
  const card = await blankCard(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Pair this card', exact: true }).click();
  await page.getByTestId('setup-lights-action').click();
  await page.getByTestId('discovery-probe-18').click();
  await page.getByTestId('discovery-start').click();
  await page.getByTestId('discovery-color-red').click();
  await page.getByTestId('discovery-color-green').click();
  await page.getByTestId('discovery-count-18').fill('41');
  await page.getByTestId('discovery-counts-done').click();
  await page.getByTestId('discovery-end-yes').click();
  const record = page.getByTestId('discovery-record-save');
  if (await record.isVisible().catch(() => false)) await record.click();
  await expect(page.getByTestId('discovery-save-to-card')).toBeVisible({ timeout: 15_000 });
  const door = page.getByTestId('discovery-continue-layout');
  await expect(door).toHaveText('Place on artwork');
  await expect(door).not.toHaveClass(/primary/);
  await door.click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw$/);
  expect(card.state.projectId, 'opening Layout must not write the project').toBe('lightweaver-bench-discovery-v1');
});
