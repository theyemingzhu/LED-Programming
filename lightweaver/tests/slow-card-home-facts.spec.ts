// Card Home facts row against a card whose replies take 3 s (the real card
// answers in up to 4 s while busy). Trying a colour order must end on the
// strip, not "the card did not answer". Plan: todo/plans/false-failures.md (S4).
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';
import { seedKnownCard, waitForCardProject, startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';

test.describe.configure({ timeout: 90000 });

test('Card Home: a colour-order try on a card answering in 3 s ends on the strip', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForCardProject(page);
  await page.evaluate(() => { window.location.hash = '#screen=card'; });
  const keys = page.getByTestId('fact-color-keys');
  await expect(keys).toBeVisible({ timeout: 20000 });
  const current = await keys.locator('[aria-pressed="true"]').innerText().catch(() => 'GRB');
  const next = current.trim() === 'RGB' ? 'BRG' : 'RGB';
  await startFalseFailureWatch(page);
  card.setReplyDelay(3000);
  await keys.getByRole('button', { name: next, exact: true }).click();
  await expect(page.getByTestId('fact-color-status')).toContainText(`${next} is on the strip`, { timeout: 30000 });
  card.setReplyDelay(0);
  expect(await falseFailures(page)).toEqual([]);
});
