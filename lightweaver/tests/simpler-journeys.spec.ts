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
import { driveChangeCount, driveFirstSetup } from './ux/drivers';
import { bootSetUp } from './ux/journeySeed';

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1280, height: 800, isMobile: false, hasTouch: false };

/** Presses each journey takes today, per width. Lower a number only with the cut that earns it. */
export const PRESSES = {
  'first-setup': { 390: 12, 1280: 12 },
  'change-count': { 390: 2, 1280: 2 },
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
      expect(steps.some(step => step.label === 'Continue to Layout'), 'C1: Layout is a door, not a step').toBe(false);
      expect(steps.some(step => step.label === 'Start light test'), 'C2: the light test starts itself after Save').toBe(false);
      expect(presses, steps.filter(s => s.kind === 'press').map(s => s.label).join(' → ')).toBe(PRESSES['first-setup'][vp.width]);
      // The write really happened: the card holds the counted project, not the temporary setup.
      await expect.poll(() => ({ pixels: card.state.pixels, provisional: card.state.provisionalSetup }), { timeout: 15_000 })
        .toEqual({ pixels: 41, provisional: false });
    });

    test(`[C3] the LED count is changed and saved from its own row, in ${PRESSES['change-count'][vp.width]} presses`, async ({ page }) => {
      test.setTimeout(150_000);
      const card = await bootSetUp(page);
      const j = recordJourney(page, 'change-count', vp.width);
      await driveChangeCount(page, j, card);
      const { presses, steps } = await j.finish();
      expect(steps.some(step => step.label === 'Change count'), 'C3: no detour door').toBe(false);
      // Layout applies the count with its own setter on the way through; the
      // owner presses nothing there.
      expect(steps.filter(s => s.kind === 'press').some(s => s.screen.startsWith('layout')), 'C3: no press on Layout').toBe(false);
      expect(presses, steps.filter(s => s.kind === 'press').map(s => s.label).join(' → ')).toBe(PRESSES['change-count'][vp.width]);
      expect(card.state.pixels).toBe(60);
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

test('[C2] the self-started light test keeps its protection: "No" restores the working setup', async ({ page }) => {
  test.setTimeout(180_000);
  const card = await blankCard(page);
  const j = recordJourney(page, 'first-setup-restore', 1280);
  await driveFirstSetup(page, j, { stopBeforeConfirm: true });
  expect(card.state.wiringTestActive, 'the card is in its probation window').toBe(true);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/wiring/confirm')).toHaveLength(0);
  await expect(page.getByTestId('wiring-test-restore')).toBeVisible();
  await page.getByTestId('wiring-test-restore').click();
  await expect.poll(() => card.state.wiringTestActive, { timeout: 20_000 }).toBe(false);
  expect(card.state.projectId, 'the temporary setup is back, nothing was made permanent').toBe('lightweaver-bench-discovery-v1');
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/wiring/confirm')).toHaveLength(0);
});

test('[C2] the self-started light test keeps its protection: unconfirmed, the card puts its setup back', async ({ page }) => {
  test.setTimeout(180_000);
  const card = await blankCard(page);
  const j = recordJourney(page, 'first-setup-expire', 1280);
  await driveFirstSetup(page, j, { stopBeforeConfirm: true });
  card.expireWiringProbation();
  await expect.poll(() => card.state.pixels, { timeout: 20_000 }).toBe(256);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/wiring/confirm')).toHaveLength(0);
});

test('[C2] Real-timing: the light test starts itself and survives the 14 s restart into it', async ({ page }) => {
  // Practice card Real-timing (docs/practice-card.md): the card restarts into
  // the candidate and is silent for ~14 s, measured on lw-b0fe81f61b44.
  test.setTimeout(240_000);
  await guardRealCard(page);
  const card = createCardSimulator(cardState('factory-blank'), { restartAfterActivateMs: 14_000 });
  await card.install(page);
  const started = Date.now();
  const j = recordJourney(page, 'first-setup-real-timing', 390);
  await driveFirstSetup(page, j);
  const { presses, steps } = await j.finish();
  expect(steps.some(step => step.label === 'Start light test'), 'no second press after the restart either').toBe(false);
  expect(presses).toBe(PRESSES['first-setup'][390]);
  expect(Date.now() - started, 'the run really waited out the restart').toBeGreaterThan(14_000);
  await expect.poll(() => ({ testing: card.state.wiringTestActive, pixels: card.state.pixels }), { timeout: 20_000 })
    .toEqual({ testing: false, pixels: 41 });
});

test('[C3] the count is still editable in Layout, and the row writes nothing until Save to card', async ({ page }) => {
  test.setTimeout(150_000);
  const card = await bootSetUp(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  const stepper = page.getByTestId('fact-lights-stepper');
  await expect(stepper).toBeVisible({ timeout: 20_000 });
  await stepper.getByLabel('Light count').fill('60');
  expect(card.requests.filter(r => r.method === 'POST'), 'typing writes nothing').toHaveLength(0);
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Total LEDs')).toBeEditable({ timeout: 20_000 });
});
