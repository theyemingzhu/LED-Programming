// Replays the bad-network glitch: the card drops for 20 s, the owner taps a
// pattern during the drop, the card comes back. Studio reconnects by itself,
// so "That tap was not sent… Recover and verify it" is no longer true and must
// go away without the owner pressing anything.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('a refusal from a dropped card clears once the card is back', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  const link = () => page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
  await expect.poll(link, { timeout: 15000 }).toMatch(/^connected-/);

  card.goOffline();
  await page.waitForTimeout(8000);
  await page.getByText('Fire', { exact: true }).first().click();
  await expect(page.getByTestId('pattern-gate-notice')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(12000);
  card.goOnline();

  await expect.poll(link, { timeout: 20000 }).toMatch(/^connected-/);
  await expect(page.getByTestId('pattern-gate-notice')).toHaveCount(0, { timeout: 10000 });
});
