// A save to a card as slow as the real one ends in success, and says it is
// working the whole time. Measured on Adrian's card (firmware 1.2.4): every
// accepted /api/config restarts the card, which is silent for about 14 s and
// returns under a new boot id with the saved project. Its status still carries
// an old firmware rollback (`firmwareUpdate.phase: 'rolled-back'`).
//
// Before this spec Studio waited about 5 s, then said "Update rolled back" /
// "Not saved to the card: it did not answer" about a save that had landed.
// Plan: todo/plans/false-failures.md.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';
import {
  seedKnownCard, waitForCardProject, startFalseFailureWatch, falseFailures,
  startWorkingWatch, stopWorkingWatch,
} from './harness/falseFailureWatch';

const REAL_RESTART_MS = 14000;
const realCardState = () => ({
  ...cardState('playing'),
  // The real card repeats an old update's outcome on every status read.
  firmwareUpdateOverride: { phase: 'rolled-back', rollbackReason: 'health-check-failed' },
});

test.describe.configure({ timeout: 120000 });

// On failure, say exactly what the owner would have read.
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[false-failures] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 600)}`);
});

test('Patterns: Save to card through a 14 s restart shows progress, then Saved', async ({ page }) => {
  const card = createCardSimulator(realCardState(), { restartAfterSaveMs: REAL_RESTART_MS });
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForCardProject(page);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 20000 });
  // Change the look so the save carries something new.
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await page.waitForTimeout(1500);

  await startFalseFailureWatch(page);
  await startWorkingWatch(page, '[data-testid="pattern-install-on-card"][aria-busy="true"]', 'Restarting (the )?card|Checking card|Sending');
  const startedAt = Date.now();
  await button.click();
  await expect(page.getByText(/Restarting (the )?card/).first()).toBeVisible({ timeout: 8000 });
  await expect(button).toHaveText(/Saved/, { timeout: 50000 });
  const tookMs = Date.now() - startedAt;
  const working = await stopWorkingWatch(page);

  expect(await falseFailures(page)).toEqual([]);
  // Every wait over 0.5 s shows it is working.
  expect(working.idleGapMs).toBeLessThan(600);
  // It finishes when the card's new boot reports the project — not at the 45 s limit.
  expect(tookMs).toBeGreaterThan(REAL_RESTART_MS - 1000);
  expect(tookMs).toBeLessThan(REAL_RESTART_MS + 12000);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/config')).toHaveLength(1);
  // Settled afterwards too.
  await page.waitForTimeout(3000);
  expect(await falseFailures(page)).toEqual([]);
});

test('Patterns: a pre-save read that times out is retried, and the save succeeds', async ({ page }) => {
  const card = createCardSimulator(realCardState());
  // The name the practice card builds on (same rule as options.restartAfterSaveMs).
  card.setRestartSilence(3000);
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForCardProject(page);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 20000 });
  await page.waitForTimeout(1500);

  await startFalseFailureWatch(page);
  await startWorkingWatch(page, '[data-testid="pattern-install-on-card"][aria-busy="true"]', 'Restarting (the )?card|Checking card|Sending');
  // The card goes quiet for 5 s right as the owner presses Save (a Wi-Fi
  // reconnect on the card side), so the first pre-save read times out.
  card.silenceFor(5000);
  await button.click();
  await expect(button).toHaveText(/Checking card/, { timeout: 1000 });
  await expect(button).toHaveText(/Saved/, { timeout: 50000 });
  const working = await stopWorkingWatch(page);
  expect(await falseFailures(page)).toEqual([]);
  expect(working.idleGapMs).toBeLessThan(600);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/config')).toHaveLength(1);
});
