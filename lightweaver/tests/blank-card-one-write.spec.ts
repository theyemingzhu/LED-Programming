// Real card lw-b0fe81f61b44, live Studio 2653 (night of 2026-11-23): one press
// of the blank-card Save to card wrote the project twice. POST /api/config 200
// at 16:37:24, the card restarting, then the ordinary install control showed
// "Checking card…" and sent the same project again at 16:37:36 — a second
// restart. One press must be one write, whichever install control is on
// screen while the card restarts. The practice card runs in Real-timing mode
// here (14 s restart), which is what opens the window; on the instant
// simulator the second install never mounted (blank-card-first-install.spec.ts).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createBenchDiscoveryPracticeCard } from './harness/benchDiscoveryCard';

const PROJECT = fileURLToPath(new URL('./fixtures/real-card-bench-2026-11-21/nov19-restore.lw.json', import.meta.url));

test.describe.configure({ timeout: 300000 });

async function linkConnected(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  });
}

test('one press of the blank-card Save to card writes the project once', async ({ page }) => {
  const { card } = createBenchDiscoveryPracticeCard({
    timing: 'real',
    // The real card restarts itself after a saved project (POST /api/config).
    restartAfterSaveMs: 14200,
    seed: 7,
    overrides: {
      spontaneousSilence: { meanIntervalMs: 1e9, minMs: 0, maxMs: 0 },
      unsettledAfterRestart: { durationMs: 0, probability: 0, minMs: 0, maxMs: 0 },
    },
  });
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkConnected(page), { timeout: 40000 }).toBe(true);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await page.getByTestId('project-file-input').setInputFiles(PROJECT, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.layout?.strips?.length || 0; } catch { return 0; }
  }), { timeout: 20000 }).toBeGreaterThan(1);
  // The card has no room beside the temporary setup (as on the real card),
  // so Studio offers Clear temporary setup, which leaves it blank.
  card.refuse('/api/wiring/candidate', { status: 400, body: { ok: false, state: 'known-good', error: 'candidate storage failed', rebooting: false, nextStep: 'none' }, times: 20 });
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  await page.getByTestId('layout-check-and-install').first().click({ timeout: 30000 });
  await expect(page.getByText(/no room/i).first()).toBeVisible({ timeout: 90000 });
  await page.getByTestId('card-install-clear-temporary').click();
  await expect.poll(() => card.state.pixels, { timeout: 60000 }).toBe(0);
  const save = page.getByTestId('blank-card-save');
  await expect(save).toBeVisible({ timeout: 90000 });
  const before = card.requests.filter(r => r.method === 'POST' && r.path === '/api/config').length;
  const route = await page.evaluate(() => window.location.hash);
  await save.click();
  // While the card restarts, Card Home rebuilds its steps and the install
  // panel with them (real card: "STEP 1 OF 3 / Connect to your card" at
  // 16:37:25). Leaving the screen and coming back rebuilds it the same way.
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  await page.waitForTimeout(1500);
  await page.evaluate(r => { window.location.hash = r; }, route);
  await expect.poll(() => card.state.pixels, { timeout: 90000 }).toBe(41);
  // Watch the whole restart and the settle after it.
  await page.waitForTimeout(45000);
  const writes = card.requests.filter(r => r.method === 'POST' && r.path === '/api/config').length - before;
  expect(writes, 'one press, one write').toBe(1);
  const clearAt = card.requests.findIndex(r => r.path === '/api/clear-project');
  expect(card.requests.slice(clearAt).filter(r => r.method === 'POST' && r.path === '/api/wiring/candidate')).toHaveLength(0);
});

test('a landed first install whose read-back fails stops offering the blank-card save once the card answers', async ({ page }) => {
  // Shipper review of 11c97356: a failed first install kept phase 'failed'
  // for good, so after a landed write the panel kept "This card is blank" and
  // a Save to card that pushes factory-blank at a card that no longer is.
  const { card } = createBenchDiscoveryPracticeCard({
    timing: 'real',
    seed: 7,
    restartAfterSaveMs: 14200,
    overrides: {
      spontaneousSilence: { meanIntervalMs: 1e9, minMs: 0, maxMs: 0 },
      unsettledAfterRestart: { durationMs: 0, probability: 0, minMs: 0, maxMs: 0 },
    },
  });
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkConnected(page), { timeout: 40000 }).toBe(true);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await page.getByTestId('project-file-input').setInputFiles(PROJECT, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.layout?.strips?.length || 0; } catch { return 0; }
  }), { timeout: 20000 }).toBeGreaterThan(1);
  card.refuse('/api/wiring/candidate', { status: 400, body: { ok: false, state: 'known-good', error: 'candidate storage failed', rebooting: false, nextStep: 'none' }, times: 20 });
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  await page.getByTestId('layout-check-and-install').first().click({ timeout: 30000 });
  await expect(page.getByText(/no room/i).first()).toBeVisible({ timeout: 90000 });
  await page.getByTestId('card-install-clear-temporary').click();
  await expect.poll(() => card.state.pixels, { timeout: 60000 }).toBe(0);
  const save = page.getByTestId('blank-card-save');
  await expect(save).toBeVisible({ timeout: 90000 });
  const before = card.requests.filter(r => r.method === 'POST' && r.path === '/api/config').length;
  await save.click();
  // The write lands; then the card stays off the air past the read-back's
  // restart allowance (45 s), so the read-back fails.
  await expect.poll(() => card.requests.filter(r => r.method === 'POST' && r.path === '/api/config').length - before, { timeout: 30000 }).toBe(1);
  card.silenceFor(70000);
  await expect(page.getByTestId('blank-card-save')).toHaveText(/Try saving again/, { timeout: 120000 });
  // The card comes back holding the project: the blank panel must go.
  await expect(page.getByText('This card is blank')).toHaveCount(0, { timeout: 90000 });
  await expect(page.getByTestId('blank-card-save')).toHaveCount(0);
  expect(card.state.pixels).toBe(41);
  // And nothing wrote again on its own.
  await page.waitForTimeout(20000);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/config').length - before, 'one press, one write').toBe(1);
  const clearAt = card.requests.findIndex(r => r.path === '/api/clear-project');
  expect(card.requests.slice(clearAt).filter(r => r.method === 'POST' && r.path === '/api/wiring/candidate')).toHaveLength(0);
});
