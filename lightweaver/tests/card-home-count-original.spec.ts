// Found on the real card (live build 2670): Card Home's light count row kept
// "Save to card" disabled at 41 — the count first recorded by Find my strips —
// after the project and the card had moved to 42 through Layout. 40 and 43
// were enabled. The row compared the typed number with the stale discovery
// record, so an owner could not go back to the original count from Card Home.
// Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md (D10).
import { test, expect } from '@playwright/test';
import { cardState } from './harness/cardStates';
import { realPracticeCard, bootConnected, nextWrite, reportWords, startWordsLog } from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

test.describe.configure({ timeout: 180_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

test('Card Home light count: after Layout saved 42, typing the original 41 can be saved', async ({ page }) => {
  practice = realPracticeCard(cardState('installed-match'));
  const original = practice.card.state.pixels;
  await bootConnected(page, practice);
  await startWordsLog(page);

  // Layout: one more light, saved to the card (the route the owner took live).
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('[data-strip-id]').first();
  await expect(strip).toBeVisible({ timeout: 30_000 });
  if (!await strip.locator('.la-strip-detail').isVisible()) await strip.locator('.la-strip-row').click();
  const layoutCount = strip.getByRole('spinbutton', { name: /LED count$/ });
  await layoutCount.fill(String(original + 1));
  await layoutCount.blur();
  const write = nextWrite(practice.card);
  await page.getByTestId('layout-check-and-install').click();
  await write;
  await expect.poll(() => practice!.card.state.pixels, { timeout: 60_000 }).toBe(original + 1);
  // Let the save's restart and read-back settle.
  await page.waitForTimeout(20_000);

  // Card Home: back to the original count.
  await page.evaluate(() => { window.location.hash = '#screen=card'; });
  const input = page.getByLabel('Light count');
  await expect(input).toBeEnabled({ timeout: 30_000 });
  await expect(input, 'the row shows what the project and the card hold').toHaveValue(String(original + 1));
  await input.fill(String(original));
  await expect(page.getByTestId('fact-lights-set'), 'the original count can be saved').toBeEnabled();
  // Neighbours were always enabled; the original is the one that was not.
  await input.fill(String(original + 2));
  await expect(page.getByTestId('fact-lights-set')).toBeEnabled();
  await input.fill(String(original + 1));
  await expect(page.getByTestId('fact-lights-set'), 'the count it already holds needs no save').toBeDisabled();
});
