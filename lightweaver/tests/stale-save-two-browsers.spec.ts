// The one real risk with two windows: A holds an older copy of the card's
// project, B saves a newer one, then A presses Save to card. A must not
// overwrite B's work silently.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

async function seed(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}
async function openPatterns(page: Page) {
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
  }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
  await expect(page.getByTestId('pattern-install-on-card')).toBeEnabled({ timeout: 20000 });
}
async function saveLook(page: Page, tile: string) {
  await page.locator(`[data-pattern-id="${tile}"]`).first().click();
  await page.waitForTimeout(1500);
  await page.getByTestId('pattern-install-on-card').click();
  await expect(page.getByTestId('pattern-install-on-card')).not.toHaveAttribute('aria-busy', 'true', { timeout: 30000 });
  await page.waitForTimeout(1500);
}

test('an older window does not silently overwrite a newer save', async ({ browser }) => {
  const card = createCardSimulator(cardState('playing'));
  const ctxA = await browser.newContext(); const a = await ctxA.newPage(); await card.install(a); await seed(a);
  await openPatterns(a);
  const ctxB = await browser.newContext(); const b = await ctxB.newPage(); await card.install(b); await seed(b);
  await openPatterns(b);

  await saveLook(b, 'ocean');
  const afterB = card.state.projectFingerprint;
  await a.locator('[data-pattern-id="rainbow"]').first().click();
  await a.waitForTimeout(1500);
  await a.getByTestId('pattern-install-on-card').click();
  const conflict = a.getByTestId('stale-card-conflict');
  await expect(conflict).toBeVisible({ timeout: 20000 });
  await expect(conflict).toContainText('This card was changed from another window.');
  await a.screenshot({ path: test.info().outputPath('A-conflict.png') });
  // Nothing was written: the card still holds B's save.
  expect(card.state.projectFingerprint).toBe(afterB);
  await expect(a.getByRole('alert')).toHaveCount(0);
  // The owner can still choose to save this window's version.
  await conflict.getByRole('button', { name: 'Save mine anyway' }).click();
  await expect.poll(() => card.state.projectFingerprint, { timeout: 30000 }).not.toBe(afterB);
  await ctxA.close(); await ctxB.close();
});
