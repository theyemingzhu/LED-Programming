// Replays slow replies (6 s each) on Card Home. Studio is re-reading or
// re-reaching a known card by itself; it is not disconnected, so the Health row must not say "Not connected".
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('a slow card reads as being checked, not as not connected', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  const link = () => page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
  await expect.poll(link, { timeout: 15000 }).toMatch(/^connected-/);

  card.setReplyDelay(6000);
  const seen: string[] = [];
  const falseAlarms: string[] = [];
  for (let i = 0; i < 50; i += 1) {
    const state = await link();
    seen.push(state);
    if (/^(revalidating|reconnecting)/.test(state) && await page.getByText('Not connected', { exact: true }).count()) falseAlarms.push(state);
    await page.waitForTimeout(500);
  }
  expect(seen.some(state => /^(revalidating|reconnecting)/.test(state))).toBe(true);
  expect(falseAlarms).toEqual([]);
  card.setReplyDelay(0);
  await expect.poll(link, { timeout: 20000 }).toMatch(/^connected-/);
});
