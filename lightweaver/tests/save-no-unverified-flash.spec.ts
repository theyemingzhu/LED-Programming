// After a successful Save to card the header must never read like a failure.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('no "Not verified on this card" right after a save', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=pattern');
  const save = page.getByTestId('pattern-install-on-card');
  await expect(save).toBeEnabled({ timeout: 25000 });
  await page.locator('[data-pattern-id="ocean"]').first().click();
  await page.waitForTimeout(1500);
  card.setReplyDelay(800);
  const seen = new Set<string>();
  const label = page.getByTestId('project-lifecycle-label');
  await save.click();
  const end = Date.now() + 12000;
  while (Date.now() < end) { seen.add((await label.textContent().catch(() => '')) || ''); await page.waitForTimeout(100); }
  await test.info().attach('labels', { body: [...seen].join('\n') });
  expect([...seen]).not.toContain('Not verified on this card');
  await expect(label).toHaveText('Installed on card', { timeout: 15000 });
});
