// Owner-journey drivers shared by the measurement specs (tests/ux/*.measure.spec.ts)
// and the press-count gate (tests/simpler-journeys.spec.ts).
//
// Each driver takes the SHORTEST path the screen offers a first-time client:
// the visible primary, and a step only when the screen actually shows it. That
// is what lets one driver measure both the old and the new flow — a press the
// product no longer asks for is simply never shown, so never pressed.
import { expect, type Locator, type Page } from '@playwright/test';
import type { recordJourney } from './journeyRecorder';

type Journey = ReturnType<typeof recordJourney>;

async function shown(locator: Locator, timeout = 0) {
  if (!timeout) return locator.isVisible().catch(() => false);
  return locator.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
}

/**
 * Press whichever of `steps` the screen shows, each at most once, until
 * `done()` holds. A step never shown is never pressed or counted.
 */
async function pressAsShown(page: Page, j: Journey, steps: { locator: Locator; label: string }[], done: () => Promise<boolean>, timeoutMs = 45_000) {
  const pressed = new Set<string>();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return;
    let acted = false;
    for (const step of steps) {
      if (pressed.has(step.label)) continue;
      if (await shown(step.locator)) {
        await j.press(step.locator, step.label);
        pressed.add(step.label);
        acted = true;
        break;
      }
    }
    if (!acted) await page.waitForTimeout(250);
  }
  throw new Error(`journey did not finish at ${page.url()}; pressed ${[...pressed].join(', ') || 'nothing'}`);
}

/** First setup from a blank card: pair, count the lights, save to card, confirm the light test. */
export async function driveFirstSetup(page: Page, j: Journey, { stopBeforeConfirm = false } = {}) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('main h1').first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await j.land('opens led.mandalacodes.com');
  const pair = page.getByRole('button', { name: 'Pair this card', exact: true });
  if (!(await shown(pair, 8000))) await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await j.press(pair, 'Pair this card');
  await j.press(page.getByTestId('setup-lights-action'), 'Find and count the lights');
  await j.press(page.getByTestId('discovery-probe-18'), 'GPIO 18 (the one that lit)');
  await j.press(page.getByTestId('discovery-start'), 'Yes, count this strip');
  await expect(page.getByTestId('discovery-color-proof')).toBeVisible({ timeout: 20_000 });
  await j.press(page.getByTestId('discovery-color-red'), 'Colour check: red');
  await j.press(page.getByTestId('discovery-color-green'), 'Colour check: green');
  await j.type(page.getByTestId('discovery-count-18'), '41', 'Type the LED count');
  await j.press(page.getByTestId('discovery-counts-done'), 'Check the last LED');
  await j.press(page.getByTestId('discovery-end-yes'), 'Yes, that is the last one');
  const record = page.getByTestId('discovery-record-save');
  const done = page.getByTestId('discovery-done');
  await expect(record.or(done).first()).toBeVisible({ timeout: 20_000 });
  if (await shown(record)) await j.press(record, 'Save what we found');
  await expect(done).toBeVisible({ timeout: 20_000 });
  const save = page.getByTestId('discovery-save-to-card');
  if (await shown(save)) {
    await j.press(save, 'Save to card');
  } else {
    await j.press(page.getByTestId('discovery-continue-layout'), 'Continue to Layout');
    await page.waitForTimeout(1000);
    await j.land('Layout (nothing required here)');
    await j.press(page.getByRole('button', { name: /^card$/i }).first(), 'Back to Card');
    await j.press(page.getByTestId('setup-verify-action'), 'Save and open Patterns');
  }
  await finishCardSave(page, j, { stopBeforeConfirm, done: async () => /#screen=pattern$/.test(page.url()) });
}

/** After an owner's Save to card: whatever the screens still ask for, up to the confirmed light test. */
export async function finishCardSave(page: Page, j: Journey, { stopBeforeConfirm = false, done, timeoutMs = 60_000 }: { stopBeforeConfirm?: boolean; done: () => Promise<boolean>; timeoutMs?: number }) {
  const confirm = page.getByTestId('wiring-test-confirm');
  await pressAsShown(page, j, [
    { locator: page.getByTestId('replace-card-project'), label: 'Replace the temporary setup' },
    { locator: page.getByTestId('wiring-test-start'), label: 'Start light test' },
    ...(stopBeforeConfirm ? [] : [{ locator: confirm, label: 'The lights look correct' }]),
  ], stopBeforeConfirm ? () => shown(confirm) : done, timeoutMs);
  await page.waitForTimeout(stopBeforeConfirm ? 0 : 1000);
}

/** Change the LED count on an installed card (to `pixels`) and get it onto the card. */
export async function driveChangeCount(page: Page, j: Journey, card: { state: { pixels: number; wiringTestActive: boolean } }, pixels = 60) {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  await j.land('Card Home, connected');
  const row = page.getByTestId('fact-lights');
  const stepper = row.getByTestId('fact-lights-stepper');
  if (await shown(stepper)) {
    await j.type(stepper.getByLabel('Light count'), String(pixels), `Type ${pixels} in the Lights row`);
    await j.press(stepper.getByTestId('fact-lights-set'), 'Save to card');
  } else {
    await j.press(row.getByRole('button', { name: 'Change count' }), 'Change count');
    await j.type(page.getByLabel('Total LEDs'), String(pixels), `Type ${pixels} in Project LEDs (Layout)`);
    await j.press(page.getByRole('button', { name: 'Install on card', exact: true }).first(), 'Install on card');
  }
  await finishCardSave(page, j, { done: async () => card.state.pixels === pixels && !card.state.wiringTestActive });
}

/** A fresh browser opens Patterns, connects the card it finds, and plays a tile. */
export async function driveFreshBrowserPickup(page: Page, j: Journey, card: { waitForPlaying(id: string, ms?: number): Promise<void> }, patternId: string) {
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await j.land('opens led.mandalacodes.com/#screen=pattern');
  const linkState = async () => page.evaluate(async () => String((await import('/src/lib/cardLink.js')).getSharedCardLink().getState()?.state || ''));
  const connected = async () => /^connected-/.test(await linkState());
  await j.press(page.getByTestId('card-link-status'), 'Footer chip: Found — pair');
  // Whatever the screens still ask for to finish connecting: the dialog's own primary.
  const deadline = Date.now() + 20_000;
  while (!(await connected()) && Date.now() < deadline) {
    const dialog = page.getByRole('dialog');
    const primary = dialog.locator('.btn.primary:visible').filter({ hasNotText: /^Save project$/ }).first();
    if (await shown(primary)) {
      await j.press(primary, ((await primary.textContent()) || '').replace(/\s+/g, ' ').trim());
    }
    await page.waitForTimeout(400);
  }
  if (!(await connected())) throw new Error(`not connected: ${await linkState()}`);
  await j.land('connected');
  await j.press(page.locator(`.pm-cards .pmcard[data-pattern-id="${patternId}"]`).first(), `Tap pattern tile "${patternId}"`);
  await card.waitForPlaying(patternId, 8000);
}

/** Update the card's firmware over Wi-Fi from Card Home. */
export async function driveCardUpdate(page: Page, j: Journey) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await j.land('opens Studio; card connected, firmware older than release');
  await j.press(page.getByRole('button', { name: /^\s*\d+\s*→\s*\d+/ }).first(), 'Card Home: release update link');
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const reveal = panel.getByRole('button', { name: 'Update over Wi-Fi' });
  const start = panel.getByRole('button', { name: 'Start secure Wi-Fi update' });
  await expect(reveal.or(start).first()).toBeVisible({ timeout: 15_000 });
  if (await shown(reveal) && !(await shown(start))) await j.press(reveal, 'Update over Wi-Fi');
  await j.press(start, 'Start secure Wi-Fi update');
  await expect(panel).toContainText(/Restarting card|restart/i, { timeout: 20_000 });
}

/** Rename the project from Card Home and save the name to the card. */
export async function driveRename(page: Page, j: Journey, card: { state: { projectName: string } }, name = 'Gallery north wall') {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  await j.land('Card Home, connected');
  const edit = page.getByTestId('setup-project-name-edit');
  if (!(await shown(edit))) await j.press(page.getByRole('button', { name: 'Review checks', exact: true }), 'Review checks');
  await j.press(edit, 'Tap the project name');
  const input = page.getByTestId('setup-project-name-input');
  await j.type(input, name, 'Type the new name');
  await input.press('Enter');
  j.record.presses += 1;
  j.note('Enter counted as one press');
  await page.waitForTimeout(800);
  await j.press(page.getByRole('button', { name: 'Save to card', exact: true }).first(), 'Save to card');
  await finishCardSave(page, j, { done: async () => card.state.projectName === name });
}
