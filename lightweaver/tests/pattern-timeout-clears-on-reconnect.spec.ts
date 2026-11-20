// A lost reply on the path a real owner is on (the browser holds the card's
// project). The owner taps Aurora; the card applies it, but its reply never
// comes back. Studio must not tell the owner "The card did not answer in time"
// about a tap that landed: before giving up it reads the card back, and the
// card already playing Aurora is the acknowledgement. Once the held reply is
// released nothing is resent and nothing is left on screen.
//
// (The starter path, where no read-back is authorised, still shows the
// timeout. With the fresh-browser pick-up (cbc85951) a real owner is rarely
// on it, so this spec follows the project path.)
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('a tap whose reply is lost is confirmed by reading the card, with no false timeout', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
  }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
  await expect(page.locator('[data-pattern-id="aurora"]').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(2000);
  expect(card.state.currentId).not.toBe('aurora');

  const release = card.holdNextReply('/api/control');
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await expect.poll(() => card.state.currentId, { timeout: 10000 }).toBe('aurora');
  const timedOut = page.getByText('The card did not answer in time', { exact: false });
  // Longer than the 2.2 s send timeout plus its read-back.
  await page.waitForTimeout(8000);
  await expect(timedOut).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  release();
  await page.waitForTimeout(3000);
  await expect(timedOut).toHaveCount(0);
  expect(card.state.currentId).toBe('aurora');
});
