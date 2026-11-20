// Replays the 5 s Wi-Fi blip: the owner taps a pattern just as the card drops,
// the tap times out, the card comes back. The card is healthy again, so
// "The card did not answer in time…" must go away and the tap must land
// without the owner pressing Retry.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('a timed-out tap is resent and its message clears once the card answers', async ({ page }) => {
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
  await page.getByText('Fire', { exact: true }).first().click();
  const timedOut = page.getByText('The card did not answer in time', { exact: false });
  await expect(timedOut.first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(5000);
  card.goOnline();

  await expect.poll(link, { timeout: 20000 }).toMatch(/^connected-/);
  await expect(timedOut).toHaveCount(0, { timeout: 15000 });
});
