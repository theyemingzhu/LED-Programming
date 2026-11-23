// Real card lw-b0fe81f61b44, live Studio 2594 (durability run, 2026-11-22):
// running the temporary bench setup, Layout → Check and install → the card
// refused the staged wiring: HTTP 400 {"ok":false,"state":"known-good",
// "error":"candidate storage failed"} — no room for a candidate copy beside
// the current project (LightweaverStorage.cpp). Studio showed "Studio could
// not verify this install (read-back-mismatch)", and never named the way out.
// It must name the full store plainly and offer Clear temporary setup.
// Plan: todo/plans/false-failures.md (F-F1).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createBenchDiscoveryCard } from './harness/benchDiscoveryCard';
import { startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';

const PROJECT = fileURLToPath(new URL('./fixtures/real-card-bench-2026-11-21/nov19-restore.lw.json', import.meta.url));
const REFUSAL = { ok: false, state: 'known-good', error: 'candidate storage failed', rebooting: false, nextStep: 'none' };

test.describe.configure({ timeout: 180000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[storage] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 1200)}`);
});

async function linkConnected(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  });
}

test('bench card with no room for staged wiring: the full store is named and Clear temporary setup is offered', async ({ page }) => {
  const card = createBenchDiscoveryCard();
  card.refuse('/api/wiring/candidate', { status: 400, body: REFUSAL, times: 5 });
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
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  const install = page.getByTestId('layout-check-and-install').first();
  await expect(install).toBeEnabled({ timeout: 20000 });
  await startFalseFailureWatch(page, ['read-back-mismatch', 'could not verify this install', 'did not answer', 'not connected']);
  await install.click();
  await expect(page.getByText(/no room/i).first(), 'the full store is named').toBeVisible({ timeout: 60000 });
  const clear = page.getByTestId('card-install-clear-temporary');
  await expect(clear, 'the way out is offered where the save failed').toBeVisible();
  expect(await falseFailures(page)).toEqual([]);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/config')).toHaveLength(0);
  await clear.click();
  await expect.poll(() => card.requests.some(r => r.method === 'POST' && r.path === '/api/clear-project'), { timeout: 30000 }).toBe(true);
});
