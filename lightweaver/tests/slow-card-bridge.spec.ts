// The hosted Studio (https, through the card page bridge) against a card as
// slow as the real one. Follow-ups F-B1 and F-B2 in todo/plans/false-failures.md:
//  - a save whose bridge reply times out is never sent a second time (the
//    second save restarted the card a second time), and still ends Saved;
//  - Recover lights restarts the card on purpose and waits for it to return,
//    instead of "did not reconnect in time" after 15 s.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_FIRMWARE_VERSION, MATRIX_BUILD_ID, MATRIX_HOST } from './harness/cardStates';
import { installHttpsStudio, installFakeCardBridge, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';
import { startFalseFailureWatch, falseFailures, seedKnownCard, waitForCardProject } from './harness/falseFailureWatch';

test.describe.configure({ timeout: 150000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[false-failures] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 700)}`);
});

const CONNECTED = /^connected-(direct|bridge)$/;

async function linkState(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const state = getSharedCardLink().getState() || {};
    return `${state.state || ''}/${state.transport || ''}`;
  });
}

async function bootOverBridge(page: Page, hash: string) {
  const card = createCardSimulator({
    ...cardState('playing'),
    firmwareUpdateOverride: { phase: 'rolled-back', rollbackReason: 'health-check-failed' },
  });
  await installHttpsStudio(page, testBaseURL);
  await installFakeCardBridge(page, card);
  await page.addInitScript(({ id, firmwareVersion, buildId, host }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', host);
    localStorage.setItem('lw_chip_card_host', host);
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: MATRIX_HOST });
  await page.goto(`${STUDIO_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  const settled = await expect.poll(() => linkState(page), { timeout: 15000, intervals: [250] })
    .toMatch(/^connected-bridge\/bridge$/).then(() => true, () => false);
  if (!settled) {
    const setupConnect = page.getByTestId('setup-connect-card');
    const target = (await setupConnect.count()) ? setupConnect : page.getByTestId('card-link-status');
    await target.first().click();
    const center = page.getByRole('dialog', { name: 'Connect Lightweaver', exact: true });
    await expect(center).toBeVisible();
    await center.locator('summary').click();
    await center.getByRole('button', { name: 'Connect through the card’s own page (fallback)' }).click();
    await expect.poll(() => linkState(page), { timeout: 15000, intervals: [250] }).toMatch(/^connected-bridge\/bridge$/);
  }
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
  }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
  await page.evaluate(h => { window.location.hash = h; }, hash);
  return card;
}

test('bridge: a save whose reply times out is sent once, and ends Saved after the restart', async ({ page }) => {
  const card = await bootOverBridge(page, '#screen=pattern');
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 20000 });
  await page.waitForTimeout(1500);
  card.setRestartSilence(6000);
  // The card stores the save 8 s after it is sent, longer than Studio's 6 s
  // bridge timeout, then restarts.
  card.answerAfter('/api/config', 8000, 1);
  await startFalseFailureWatch(page);
  await button.click();
  await expect(button).toHaveText(/Saved/, { timeout: 70000 });
  expect(await falseFailures(page)).toEqual([]);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/config'), 'the save is never sent twice').toHaveLength(1);
});

test('Patterns: Recover lights through an 18 s restart ends asking about warm white, never "did not reconnect"', async ({ page }) => {
  // Recover lights restarts the card on purpose. 18 s = the measured 14 s
  // restart plus a slow Wi-Fi rejoin; the old 15 s limit failed it.
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForCardProject(page);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  const recover = page.getByTestId('recover-lights');
  await expect(recover).toBeEnabled({ timeout: 20000 });
  card.setRestartSilence(18000);
  await startFalseFailureWatch(page, ['did not reconnect in time', 'did not answer', 'not connected', 'card stopped responding', 'update rolled back', 'could not reach']);
  await recover.click();
  await expect(page.getByText('Do you see warm white', { exact: false }).first()).toBeVisible({ timeout: 70000 });
  expect(await falseFailures(page)).toEqual([]);
  expect(card.requests.filter(r => r.path === '/api/reboot')).toHaveLength(1);
});
