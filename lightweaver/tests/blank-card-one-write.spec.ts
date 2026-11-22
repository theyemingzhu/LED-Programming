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
  // The real card reports runtimePhase 'ready' once its first project is
  // saved (lw-b0fe81f61b44, 2026-11-23 16:37); the practice card keeps the
  // 'factory' phase its clear set (reported to the practice-card session).
  const keepReady = setInterval(() => { if (card.state.pixels > 0) (card.state as any).runtimePhase = 'ready'; }, 200);
  test.info().attach('note', { body: 'practice card held at runtimePhase ready once it holds a project' }).catch(() => {});
  page.once('close', () => clearInterval(keepReady));
  // Watch the whole restart and the settle after it.
  await page.waitForTimeout(45000);
  const writes = card.requests.filter(r => r.method === 'POST' && r.path === '/api/config').length - before;
  expect(writes, 'one press, one write').toBe(1);
  const clearAt = card.requests.findIndex(r => r.path === '/api/clear-project');
  expect(card.requests.slice(clearAt).filter(r => r.method === 'POST' && r.path === '/api/wiring/candidate')).toHaveLength(0);
});
