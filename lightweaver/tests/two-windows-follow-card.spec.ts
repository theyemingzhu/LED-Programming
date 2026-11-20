// Two windows are two remotes; the last tap wins. But window A must show what
// the card is really playing soon after window B taps.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

async function open(browser, card) {
  const ctx = await browser.newContext(); const page: Page = await ctx.newPage();
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('pattern-install-on-card')).toBeEnabled({ timeout: 25000 });
  return { ctx, page };
}
const pressed = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.pmcard[aria-pressed="true"]')].map(e => e.getAttribute('data-pattern-id')));

test('window A follows the card after window B taps', async ({ browser }) => {
  const card = createCardSimulator(cardState('playing'));
  const A = await open(browser, card);
  const B = await open(browser, card);
  await B.page.locator('[data-pattern-id="aurora"]').first().click();
  await expect.poll(() => card.state.currentId, { timeout: 10000 }).toBe('aurora');
  const t0 = Date.now();
  let seen: string[] = [];
  await expect.poll(async () => { seen = await pressed(A.page); return seen; }, { timeout: 15000 }).toEqual(['aurora']);
  await test.info().attach('follow', { contentType: 'application/json', body: JSON.stringify({ ms: Date.now() - t0, seen }) });
  await A.ctx.close(); await B.ctx.close();
});
