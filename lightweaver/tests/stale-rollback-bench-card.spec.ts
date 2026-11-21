// The physical card, 2026-11-21 (firmware 1.2.4, live Studio 2559): holding
// the temporary Find-my-strips (bench) setup, 256 lights, wiring known-good,
// no candidate. Its /api/status still repeats an old update's outcome:
// firmwareUpdate { phase: 'rolled-back', rollbackReason:
// 'new-slot-rollback-detected', restored 1.2.4 }. Every fresh browser showed
// "The last card operation failed…" and "Update rolled back", and Card Home's
// Light count Set never sent a write ("Count saved here. The card did not take
// it yet."). A past rollback this browser did not start must never block or
// relabel anything. Plan: todo/plans/false-failures.md (F-D1).
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_FIRMWARE_VERSION, MATRIX_BUILD_ID } from './harness/cardStates';
import { seedKnownCard, startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';

test.describe.configure({ timeout: 120000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[false-failures] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 900)}`);
});

const STALE_ROLLBACK = {
  phase: 'rolled-back', rollbackReason: 'new-slot-rollback-detected', lastError: '',
  restoredFirmwareVersion: MATRIX_FIRMWARE_VERSION, restoredBuildId: MATRIX_BUILD_ID,
};

test('a bench card with an old rollback record shows no failure wording and no Update rolled back', async ({ page }) => {
  const base = cardState('provisional');
  const card = createCardSimulator({
    ...base,
    pixels: 256,
    firmwareUpdateOverride: { ...STALE_ROLLBACK, restoredBuildNumber: base.buildNumber },
  });
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await startFalseFailureWatch(page, ['the last card operation failed', 'update rolled back', 'needs attention']);
  const input = page.getByLabel('Light count');
  await expect(input).toBeEnabled({ timeout: 25000 });
  await page.waitForTimeout(2000);
  // The count write itself needs a faithful bench fixture (asked of the
  // practice-card session); here the screen must not block or relabel.
  await expect(page.getByText('Lightweaver is connected', { exact: false }).first()).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);
  expect(await falseFailures(page)).toEqual([]);
});

test('Patterns: a card that answers with a different build is named, never "did not answer" (F-D3)', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
  }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 20000 });
  await page.waitForTimeout(1500);
  // The card answers at once, but as a different firmware build than the one
  // Studio adopted (another browser flashed it, say).
  card.state.buildId = 'f'.repeat(40);
  await startFalseFailureWatch(page, ['did not answer']);
  await button.click();
  await expect(page.getByTestId('pattern-card-status').or(page.getByRole('alert')).first()).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(3000);
  expect(await falseFailures(page)).toEqual([]);
  expect(card.requests.some(r => r.method === 'POST' && r.path === '/api/config')).toBe(false);
});
