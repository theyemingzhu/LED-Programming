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
  throw new Error(`journey did not finish; pressed ${[...pressed].join(', ') || 'nothing'}`);
}

/** First setup from a blank card: pair, count the lights, save to card, confirm the light test. */
export async function driveFirstSetup(page: Page, j: Journey) {
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
  await pressAsShown(page, j, [
    { locator: page.getByTestId('replace-card-project'), label: 'Replace the temporary setup' },
    { locator: page.getByTestId('wiring-test-start'), label: 'Start light test' },
    { locator: page.getByTestId('wiring-test-confirm'), label: 'The lights look correct' },
  ], async () => /#screen=pattern$/.test(page.url()));
  await page.waitForTimeout(1000);
}
