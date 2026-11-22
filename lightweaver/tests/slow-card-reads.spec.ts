// Real-card finding on Studio build 2559: with the card answering status in
// about 3.4 s, Save to card said "Checking card…", then after 6.8 s "Not saved
// to the card: it did not answer" and the footer "Card stopped responding",
// before any write was attempted. Every read Studio made gave the card 3 s or
// less. The pre-save check must keep "Checking card…" for up to about 20 s and
// succeed on the first answer. Real-timing practice card: reply delay 3.5 s,
// and separately a 10 s silence. Plan: todo/plans/false-failures.md (F-C1).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_FIRMWARE_VERSION, MATRIX_BUILD_ID, MATRIX_HOST } from './harness/cardStates';
import { installHttpsStudio, installFakeCardBridge, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';
import { seedKnownCard, waitForCardProject, startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';

test.describe.configure({ timeout: 150000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[false-failures] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 600)}`);
});

const realCard = () => createCardSimulator({
  ...cardState('playing'),
  firmwareUpdateOverride: { phase: 'rolled-back', rollbackReason: 'health-check-failed' },
});

async function linkState(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const state = getSharedCardLink().getState() || {};
    return `${state.state || ''}/${state.transport || ''}`;
  });
}

async function bootDirect(page: Page) {
  const card = realCard();
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  return card;
}

async function bootBridge(page: Page) {
  const card = realCard();
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
  return card;
}

async function saveFromPatterns(page: Page, card: CardSimulator, slow: (card: CardSimulator) => void) {
  await waitForCardProject(page);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await startFalseFailureWatch(page);
  slow(card);
  await button.click();
  // The press shows work at once. Through the bridge a 3.5 s card can pass
  // its pre-save check on the first try, so the button may go straight to
  // "Sending…" — that is still work shown, not a silent wait. (CI on
  // 71296a1c saw Sending… → Saved, 3 of 3.)
  await expect(button).toHaveText(/Checking card|Sending/, { timeout: 2000 });
  await expect(button).toHaveText(/Saved/, { timeout: 90000 });
  card.setReplyDelay(0);
  expect(await falseFailures(page)).toEqual([]);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/config')).toHaveLength(1);
}

for (const [transport, boot] of [['direct', bootDirect], ['bridge', bootBridge]] as const) {
  test(`${transport}: Save to card on a card answering in 3.5 s ends Saved, never "did not answer"`, async ({ page }) => {
    const card = await boot(page);
    await saveFromPatterns(page, card, c => c.setReplyDelay(3500));
  });

  test(`${transport}: Save to card pressed into a 10 s silence keeps checking, then saves`, async ({ page }) => {
    const card = await boot(page);
    await saveFromPatterns(page, card, c => c.silenceFor(10000));
  });
}
