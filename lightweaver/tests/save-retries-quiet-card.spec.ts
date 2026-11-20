// A real card on busy Wi-Fi can miss the 3 s pre-save read. Studio must keep
// "Checking card…" and try again before it ever says the card did not answer.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('a save survives a 4 s quiet card before the write', async ({ page }) => {
  test.setTimeout(120000);
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=pattern');
  const save = page.getByTestId('pattern-install-on-card');
  await expect(save).toBeEnabled({ timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.locator('[data-pattern-id="ocean"]').first().click();
  await page.waitForTimeout(1500);
  const fpBefore = card.state.projectFingerprint;
  // Only the firmware-info read goes quiet, as on the real card: status still answers.
  let quietUntil = 0;
  await page.route(u => new URL(u).pathname === '/api/firmware-info', async route => {
    if (Date.now() < quietUntil) { await new Promise(r => setTimeout(r, 3500)); return route.abort('timedout'); }
    return route.fallback();
  });
  quietUntil = Date.now() + 4500;
  await save.click();
  const seen = new Set<string>();
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const t = await page.locator('body').innerText().catch(() => '');
    for (const line of t.split('\n')) if (/did not answer|Not saved|Checking card/.test(line)) seen.add(line.trim());
    if (card.state.projectFingerprint !== fpBefore) break;
    await page.waitForTimeout(200);
  }
  console.log('SEEN', JSON.stringify([...seen]));
  expect([...seen].filter(l => /did not answer|Not saved/.test(l))).toEqual([]);
  expect(card.state.projectFingerprint).not.toBe(fpBefore);
});
