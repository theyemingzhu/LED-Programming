// A browser holding only the untouched starter must not offer to save it over
// a working card. "Review and save draft" there would replace a client's piece
// with an empty design.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('an untouched starter offers no save over an installed card', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('installed-control-open')).toBeVisible();
  await expect(page.getByTestId('installed-project-open')).toBeVisible();
  await expect(page.getByTestId('installed-draft-review')).toHaveCount(0);
});
