// The physical card (live 2559, durability run 2026-11-21): bench-discovery
// project, 256 lights, old "rolled-back" update record. Card Home "Light count"
// 41 + Set went "Setting…" then "Count saved here. The card did not take it
// yet." The card only ever saw GET /api/wiring/status — no write was sent.
// Setting the count on a bench card must reach the card. Plan:
// todo/plans/false-failures.md (F-E2).
import { test, expect } from '@playwright/test';
import { createBenchDiscoveryCard } from './harness/benchDiscoveryCard';
import { startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';
import { installHttpsStudio, installFakeCardBridge, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The physical card's own controls block (its firmware-info read-back).
const REAL_FIRMWARE_INFO = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/real-card-bench-2026-11-21/firmware-info.json', import.meta.url)), 'utf8'));
function benchCard() {
  const card = createBenchDiscoveryCard();
  (card.state as { firmwareControls?: unknown }).firmwareControls = REAL_FIRMWARE_INFO.controls;
  return card;
}

test.describe.configure({ timeout: 120000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[count] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 900)}`);
});

test('bench card: Card Home Light count Set 41 writes the count to the card', async ({ page }) => {
  const card = benchCard();
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  const input = page.getByLabel('Light count');
  await expect(input).toBeEnabled({ timeout: 25000 });
  await page.waitForTimeout(2000);
  await startFalseFailureWatch(page, ['did not take it yet', 'could not take that length', 'not connected', 'did not answer', 'update rolled back']);
  await input.fill('41');
  await page.getByTestId('fact-lights-set').click();
  await expect.poll(() => card.state.pixels, { timeout: 60000 }).toBe(41);
  expect(card.requests.some(r => r.method === 'POST' && r.path === '/api/config')).toBe(true);
  await page.waitForTimeout(3000);
  expect(await falseFailures(page)).toEqual([]);
});

test('bench card on the hosted Studio (https, through the card page): Set 41 writes the count', async ({ page }) => {
  const card = benchCard();
  await installHttpsStudio(page, testBaseURL);
  await installFakeCardBridge(page, card);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto(`${STUDIO_ORIGIN}/#screen=card`, { waitUntil: 'domcontentloaded' });
  const connected = await expect.poll(() => page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  }), { timeout: 15000, intervals: [250] }).toMatch(/^connected-bridge$/).then(() => true, () => false);
  if (!connected) {
    const setupConnect = page.getByTestId('setup-connect-card');
    const target = (await setupConnect.count()) ? setupConnect : page.getByTestId('card-link-status');
    await target.first().click();
    const center = page.getByRole('dialog', { name: 'Connect Lightweaver', exact: true });
    await expect(center).toBeVisible();
    await center.locator('summary').click();
    await center.getByRole('button', { name: 'Connect through the card’s own page (fallback)' }).click();
  }
  const input = page.getByLabel('Light count');
  await expect(input).toBeEnabled({ timeout: 25000 });
  await page.waitForTimeout(2000);
  await startFalseFailureWatch(page, ['did not take it yet', 'could not take that length', 'did not answer', 'update rolled back']);
  await input.fill('41');
  await page.getByTestId('fact-lights-set').click();
  await expect.poll(() => card.state.pixels, { timeout: 60000 }).toBe(41);
  await page.waitForTimeout(3000);
  expect(await falseFailures(page)).toEqual([]);
});
