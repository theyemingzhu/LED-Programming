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
import { driveCardUpdate, driveChangeCount, driveFirstSetup, driveFreshBrowserPickup, driveRename } from './ux/drivers';
import { seedFirmwareUpdate } from './ux/updateSeed';
import { seedCompleteProject, seedKnownCard } from './ux/_seed';
import { MATRIX_PATTERNS } from './harness/cardStates';
import { bootSetUp } from './ux/journeySeed';

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1280, height: 800, isMobile: false, hasTouch: false };

/** Presses each journey takes today, per width. Lower a number only with the cut that earns it. */
export const PRESSES = {
  'first-setup': { 390: 10, 1280: 10 },
  'change-count': { 390: 2, 1280: 2 },
  'fresh-browser-pickup': { 390: 2, 1280: 2 },
  'card-update': { 390: 2, 1280: 2 },
  rename: { 390: 3, 1280: 3 },
};

/**
 * C9: a notice never sits on top of the step's own button. The recorder
 * counts closing such a notice as a press ("Close notice covering …"); on a
 * phone the counting step used to cost one. Fixed upstream in 58a29e0c (the
 * colour question and power note live in the page); every measured journey
 * now holds it at both widths.
 */
function expectNoCoveredButton(steps: { label: string }[]) {
  expect(steps.filter(step => /^Close notice covering/.test(step.label)).map(step => step.label), 'C9: no notice covers a button').toEqual([]);
}

async function staleCard(page: Page) {
  await guardRealCard(page);
  const spec = cardState('stale-firmware');
  const card = createCardSimulator(spec);
  await seedCompleteProject(page, cardState('installed-match'));
  await seedKnownCard(page, spec);
  await seedFirmwareUpdate(page);
  await card.install(page);
  return card;
}

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
      expectNoCoveredButton(steps);
      expect(steps.some(step => step.label === 'Continue to Layout'), 'C1: Layout is a door, not a step').toBe(false);
      expect(steps.some(step => step.label === 'Start light test'), 'C2: the light test starts itself after Save').toBe(false);
      expect(steps.some(step => step.label === 'Replace the temporary setup'), 'C4: the temporary setup is not a different project').toBe(false);
      expect(steps.some(step => step.label === 'Save what we found'), 'C8: the last confirm saves').toBe(false);
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
      expectNoCoveredButton(steps);
      expect(steps.some(step => step.label === 'Change count'), 'C3: no detour door').toBe(false);
      // Layout applies the count with its own setter on the way through; the
      // owner presses nothing there.
      expect(steps.filter(s => s.kind === 'press').some(s => s.screen.startsWith('layout')), 'C3: no press on Layout').toBe(false);
      expect(presses, steps.filter(s => s.kind === 'press').map(s => s.label).join(' → ')).toBe(PRESSES['change-count'][vp.width]);
      expect(card.state.pixels).toBe(60);
    });

    test(`[C5] a fresh browser pairs from the chip and plays a look, in ${PRESSES['fresh-browser-pickup'][vp.width]} presses`, async ({ page }) => {
      test.setTimeout(120_000);
      await guardRealCard(page);
      const spec = cardState('installed-match');
      const card = createCardSimulator(spec);
      await card.install(page);
      const j = recordJourney(page, 'fresh-browser-pickup', vp.width);
      const target = MATRIX_PATTERNS.find(p => p.id !== spec.currentId) || MATRIX_PATTERNS[0];
      await driveFreshBrowserPickup(page, j, card, target.id);
      const { presses, steps } = await j.finish();
      expectNoCoveredButton(steps);
      expect(steps.some(step => step.label === 'Connect'), 'C5: no second Connect press').toBe(false);
      expect(presses, steps.filter(s => s.kind === 'press').map(s => s.label).join(' → ')).toBe(PRESSES['fresh-browser-pickup'][vp.width]);
    });

    test(`[C6] a card update starts from the update screen's first button, in ${PRESSES['card-update'][vp.width]} presses`, async ({ page }) => {
      test.setTimeout(120_000);
      await staleCard(page);
      const j = recordJourney(page, 'card-update', vp.width);
      await driveCardUpdate(page, j);
      const { presses, steps } = await j.finish();
      expectNoCoveredButton(steps);
      expect(steps.some(step => step.label === 'Update over Wi-Fi'), 'C6: no reveal press').toBe(false);
      expect(presses, steps.filter(s => s.kind === 'press').map(s => s.label).join(' → ')).toBe(PRESSES['card-update'][vp.width]);
      // The update really started, bound to this card by the software grant.
      expect(await page.evaluate(() => (window as any).__LW_UPDATER_ARGUMENTS__.length)).toBe(1);
    });

    test(`[C7] the project is renamed in place on Card Home and saved, in ${PRESSES.rename[vp.width]} presses`, async ({ page }) => {
      test.setTimeout(150_000);
      const card = await bootSetUp(page);
      const j = recordJourney(page, 'rename', vp.width);
      await driveRename(page, j, card);
      const { presses, steps } = await j.finish();
      expectNoCoveredButton(steps);
      expect(steps.some(step => step.label === 'Review checks'), 'C7: no press just to reveal the name').toBe(false);
      expect(presses, steps.filter(s => s.kind === 'press').map(s => s.label).join(' → ')).toBe(PRESSES.rename[vp.width]);
      expect(card.state.projectName).toBe('Gallery north wall');
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
      expectNoCoveredButton(steps);
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

test('[C4] a card holding someone else\'s project still asks before it is replaced', async ({ page }) => {
  test.setTimeout(150_000);
  const card = await bootSetUp(page, "project.id = 'lwproj-open-work'; project.name = 'Open work';");
  await page.goto('/#screen=card&section=setup&task=install-project&next=patterns', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('replace-card-project')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect(card.requests.filter(r => r.method === 'POST'), 'nothing is written before the owner answers').toHaveLength(0);
  expect(card.state.projectId).toBe('lwproj-matrix-piece');
});

test('[C5] once paired, the chip still opens the card connection dialog', async ({ page }) => {
  test.setTimeout(120_000);
  await guardRealCard(page);
  const card = createCardSimulator(cardState('installed-match'));
  await card.install(page);
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  const chip = page.getByTestId('card-link-status');
  await expect(chip).toContainText(/Found/, { timeout: 20_000 });
  await chip.click();
  await expect.poll(() => page.evaluate(async () => String((await import('/src/lib/cardLink.js')).getSharedCardLink().getState()?.state || '')), { timeout: 15_000 })
    .toMatch(/^connected-/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await chip.click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
});

test('[C6] the update screen still explains the binding and still offers USB instead', async ({ page }) => {
  test.setTimeout(120_000);
  await staleCard(page);
  await page.goto('/#screen=card&section=install', { waitUntil: 'domcontentloaded' });
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel.getByRole('button', { name: 'Start secure Wi-Fi update' })).toBeVisible({ timeout: 20_000 });
  await expect(panel).toContainText('binds this signed update to this exact card');
  expect(await page.evaluate(() => (window as any).__LW_UPDATER_ARGUMENTS__.length), 'nothing starts by itself').toBe(0);
});

test('[C7] the top-bar rename still works and writes nothing to the card by itself', async ({ page }) => {
  test.setTimeout(150_000);
  const card = await bootSetUp(page);
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill('Renamed in Layout');
  await page.getByTestId('project-name-input').press('Enter');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').name)).toBe('Renamed in Layout');
  expect(card.requests.filter(r => r.method === 'POST'), 'a rename writes nothing to the card by itself').toHaveLength(0);
});

test('[C8] "Yes, and add another strip" keeps the first strip and opens the port picker again', async ({ page }) => {
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
  await expect(page.getByTestId('discovery-end-yes')).toBeVisible();
  await page.getByTestId('discovery-end-add-strip').click();
  await expect(page.getByTestId('discovery-probe-18')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('discovery-done')).toHaveCount(0);
  expect(card.state.projectId, 'nothing was saved to the card').toBe('lightweaver-bench-discovery-v1');
});

