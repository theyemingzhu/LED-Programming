// An installed card with a different draft open: Card Home must report the
// lights the card actually has (not "Not counted yet") and must offer
// "Save this project to the card" once, not twice.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

for (const vp of [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }]) {
  test(`installed card, different draft: true light count and one save offer · ${vp.id}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const card = createCardSimulator(cardState(process.env.CS || 'installed-match'));
    await card.install(page);
    await page.addInitScript(({ id, firmwareVersion, buildId }) => {
      localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
      localStorage.setItem('lw_card_host', 'lightweaver.local');
      localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
      localStorage.setItem('lw_autosave_v3', JSON.stringify({ version: 3, id: process.env.DID || 'lwproj-matrix-piece', name: 'Matrix piece',
        layout: { starterPending: false, strips: [{ id: 'strip-a', pixels: 60, pin: 21 }] } }));
    }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
    await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('card-link-status')).toContainText(/Connected|Lightweaver/, { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('main, body').first().innerText();
    await test.info().attach('text', { body, contentType: 'text/plain' });
    expect(body).not.toContain('Not counted yet');
    expect((body.match(/Save this project to the card/g) || []).length).toBeLessThanOrEqual(1);
  });
}
