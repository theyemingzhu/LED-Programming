// "When it is slow… there can be a spinning wheel." On a slow card, Install on
// card used to sit unchanged while three card reads ran before the write. The
// press must show at once that it is working, and it must always end.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('Save to card shows it is working at once on a slow card, and ends', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // The fresh browser picks up the card's project on Card Home, then Patterns.
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
  }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 20000 });

  card.setReplyDelay(1500);
  await button.click();
  await expect(button).toHaveAttribute('aria-busy', 'true', { timeout: 300 });
  await expect(button).toBeDisabled({ timeout: 300 });
  // It always ends: busy clears within a stated limit.
  await expect(button).not.toHaveAttribute('aria-busy', 'true', { timeout: 45000 });
  card.setReplyDelay(0);
});
