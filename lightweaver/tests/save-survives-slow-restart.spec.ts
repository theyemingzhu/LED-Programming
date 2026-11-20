// A real card is silent ~14 s after a save's planned restart. Studio must keep
// saying it is restarting, never a failure line, and end on Installed.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

test('a save survives a 14 s restart silence', async ({ page }) => {
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
  card.setRestartSilence(14000);
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST') posts.push(Date.now() % 100000 + ' ' + new URL(r.url()).pathname); });
  await save.click();
  const seen = new Set<string>();
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    const t = await page.locator('body').innerText().catch(() => '');
    for (const line of t.split('\n')) if (/Restarting the card|Update rolled back|Open Card and check|did not answer|Not saved/.test(line)) seen.add(line.trim());
    const label = await page.getByTestId('project-lifecycle-label').textContent().catch(() => '');
    if (label === 'Installed on card' && card.state.projectFingerprint !== fpBefore && Date.now() > end - 20000) break;
    await page.waitForTimeout(200);
  }
  await test.info().attach('lines', { body: [...seen].join('\n') });
  console.log('SEEN', JSON.stringify([...seen])); console.log('POSTS', JSON.stringify(posts));
  expect([...seen].filter(l => /Update rolled back|Open Card and check|did not answer|Not saved/.test(l))).toEqual([]);
  expect([...seen].some(l => /Restarting the card/.test(l))).toBe(true);
  await expect(page.getByTestId('project-lifecycle-label')).toHaveText('Installed on card', { timeout: 15000 });
});
