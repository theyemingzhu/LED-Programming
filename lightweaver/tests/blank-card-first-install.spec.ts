// Real card lw-b0fe81f61b44, live Studio 2623 (durability run, night of
// 2026-11-22): there was no way from a blank card to the owner's project.
//   blank card → only "Find my strips" → temporary setup on the card →
//   install = wiring change → candidate → 400 "candidate storage failed" →
//   "clear that setup, then save again" → Clear temporary setup → blank card →
//   only "Find my strips" again.
// The card applies a blank card's first wiring directly (LightweaverStorage.cpp
// "first wiring applied directly"), and pushConfigToCard already has the
// factory-blank write that batch production uses. So once the card is blank,
// Studio must offer Save to card for a project whose wiring is complete.
// Diagnosis: claude/realtiming-reds real-card-2026-11-22/DIAGNOSIS-blank-card-dead-end.md
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createBenchDiscoveryCard } from './harness/benchDiscoveryCard';
import { startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';

const PROJECT = fileURLToPath(new URL('./fixtures/real-card-bench-2026-11-21/nov19-restore.lw.json', import.meta.url));
const REFUSAL = { ok: false, state: 'known-good', error: 'candidate storage failed', rebooting: false, nextStep: 'none' };

test.describe.configure({ timeout: 240000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[blank-first-install] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 1500)}`);
});

async function linkConnected(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  });
}

test('full store on the temporary setup: Clear temporary setup, then Save to card installs the project on the blank card', async ({ page }) => {
  const card = createBenchDiscoveryCard();
  // The store has no page for a candidate copy beside the temporary setup.
  card.refuse('/api/wiring/candidate', { status: 400, body: REFUSAL, times: 20 });
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkConnected(page), { timeout: 25000 }).toBe(true);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await page.getByTestId('project-file-input').setInputFiles(PROJECT, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.layout?.strips?.length || 0; } catch { return 0; }
  }), { timeout: 20000 }).toBeGreaterThan(1);

  // 1. The install over the temporary setup is refused for room, as on the real card.
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  const install = page.getByTestId('layout-check-and-install').first();
  await expect(install).toBeEnabled({ timeout: 20000 });
  await install.click();
  await expect(page.getByText(/no room/i).first()).toBeVisible({ timeout: 60000 });

  // 2. Studio's own advice: clear that setup, then save again.
  await page.getByTestId('card-install-clear-temporary').click();
  await expect.poll(() => card.requests.some(r => r.method === 'POST' && r.path === '/api/clear-project'), { timeout: 30000 }).toBe(true);
  await expect.poll(() => card.state.pixels, { timeout: 30000 }).toBe(0);

  // 3. The blank card must offer Save to card for the complete draft — not only Find my strips.
  await startFalseFailureWatch(page, ['read-back-mismatch', 'could not verify this install', 'did not answer', 'no room']);
  const save = page.getByTestId('blank-card-save');
  await expect(save, 'a blank card offers Save to card for a project whose wiring is complete').toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('wire-find-strips'), 'Find my strips stays available').toBeVisible();
  await save.click();

  // 4. One whole-project write, applied directly by the blank card; no candidate.
  await expect.poll(() => card.requests.filter(r => r.method === 'POST' && r.path === '/api/config').length, { timeout: 60000 }).toBe(1);
  await expect.poll(() => card.state.pixels, { timeout: 60000 }).toBe(41);
  expect(card.state.projectId).not.toBe('');
  const candidatesAfterClear = card.requests
    .slice(card.requests.findIndex(r => r.path === '/api/clear-project'))
    .filter(r => r.method === 'POST' && r.path === '/api/wiring/candidate');
  expect(candidatesAfterClear, 'the first install is not staged as a candidate').toHaveLength(0);
  expect(await falseFailures(page)).toEqual([]);
});
