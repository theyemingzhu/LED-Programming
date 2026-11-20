// A fresh browser (it holds only the untouched starter) meets a card that
// already holds a project. The card is where browsers meet: Studio opens the
// card's project by itself, with no press, because the starter holds no owner
// work. Open work is never replaced this way; see the J02/T3 guards for that.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

for (const vp of [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }]) {
  test(`a fresh browser picks up the card's project with no press · ${vp.id}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const card = createCardSimulator(cardState('playing'));
    await card.install(page);
    await page.addInitScript(({ id, firmwareVersion, buildId }) => {
      localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
      localStorage.setItem('lw_card_host', 'lightweaver.local');
      localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
    }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
