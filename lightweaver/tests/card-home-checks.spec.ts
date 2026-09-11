import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';

// W1-6 — owner walk on the live site (build 1676): Card Home's "Checks &
// recovery" panel has three buttons. "Recover lights" works. "Verify
// hardware" and "Color-order test" did nothing on click — no card request,
// no status text, no hash change — on three clean attempts each. The same
// walk also found the lifecycle in project-mismatch (fresh browser, no
// installation record) with Connection Center saying "still verifying".

test.beforeEach(async ({ page }) => {
  await page.route('http://192.168.4.1/**', route => route.abort());
});

// Health is a row of the facts module now (always on screen, nothing to
// open); the name stays because every test below reads through it.
async function openChecksPanel(page) {
  const panel = page.getByTestId('card-checks-recovery');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  return panel;
}

async function linkState(page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

const CONNECTED = /^connected-(direct|bridge)$/;
const CONNECT_BUDGET_MS = 15000;

async function settlesConnected(page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (CONNECTED.test(await linkState(page))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

// Mirrors card-state-matrix.spec.ts's expectConnects: at most one click, on
// whichever connect affordance the screen offers, and never a second click
// on a panel that already opened itself.
async function connectRealCard(page, stateId: string) {
  const card = createCardSimulator(cardState(stateId));
  await card.install(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  if (!(await settlesConnected(page, CONNECT_BUDGET_MS))) {
    const setupConnect = page.getByTestId('setup-connect-card');
    const footerChip = page.getByTestId('card-link-status');
    const target = (await setupConnect.count()) ? setupConnect : footerChip;
    if (!(await target.count())) throw new Error('not connected, and nothing to click to connect');
    await target.first().click();
    await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toMatch(CONNECTED);
  }
  return card;
}

for (const stateId of ['installed-match', 'installed-different']) {
  test(`[W16-verify-hardware] Verify hardware sends a status request and reports back (${stateId})`, async ({ page }) => {
    const card = await connectRealCard(page, stateId);
    await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
    const panel = await openChecksPanel(page);

    const requestsBefore = card.requests.length;
    await panel.getByRole('button', { name: 'Verify hardware' }).click();

    await expect.poll(() => card.requests.length, { timeout: 10_000 }).toBeGreaterThan(requestsBefore);
    const note = panel.getByTestId('card-checks-message');
    await expect(note).toContainText(/hardware readback verified|readback failed/i, { timeout: 10_000 });
  });

  test(`[W16-color-order] Color-order test navigates to the color-order tool (${stateId})`, async ({ page }) => {
    await connectRealCard(page, stateId);
    await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
    const panel = await openChecksPanel(page);

    // The colour check is the Color order fact's own door, not a health button.
    await page.getByTestId('fact-color-order').getByRole('button', { name: 'Check colors' }).click();

    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 10_000 })
      .toBe('#screen=card&section=settings&tool=color-order');
    // Does it stick, or does a later reconciliation revert it?
    await page.waitForTimeout(4000);
    expect(await page.evaluate(() => window.location.hash)).toBe('#screen=card&section=settings&tool=color-order');
  });
}

// ---------------------------------------------------------------------------
// The https lane — the transport the owner's walk actually used.
//
// On led.mandalacodes.com the page cannot fetch the card directly, so every
// card request in this panel goes through the card-page bridge. The three
// handlers here (verifyHardware / recoverLights / clearTemporarySetup) were
// the only card-reaching call sites that did not forward the established
// `cardLink.transport`, so they routed by the page protocol alone. Serving the
// real app at the production origin makes that branch honest instead of
// stubbed; the fake card tab answers from the same simulator as the direct
// lane, so `card.requests` records what the bridge relayed.
// ---------------------------------------------------------------------------
import { installHttpsStudio, installFakeCardBridge, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';
import { MATRIX_CARD_ID, MATRIX_FIRMWARE_VERSION, MATRIX_BUILD_ID, MATRIX_HOST } from './harness/cardStates';

// The owner's browser remembers the card (card-state-matrix.spec.ts's
// "remembers-card" seed): without a remembered host there is nothing for the
// bridge to open, so the https lane could never connect and would prove nothing.
async function seedRememberedCard(page) {
  await page.addInitScript(({ id, firmwareVersion, buildId, host }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', host);
    localStorage.setItem('lw_chip_card_host', host);
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: MATRIX_HOST });
}

async function linkTransport(page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const state = getSharedCardLink().getState() || {};
    return `${state.state || ''}/${state.transport || ''}`;
  });
}

async function connectOverBridge(page, stateId: string) {
  const card = createCardSimulator(cardState(stateId));
  await installHttpsStudio(page, testBaseURL);
  await installFakeCardBridge(page, card);
  await seedRememberedCard(page);
  // Deliberately NOT installing the direct HTTP routes (card.install): on https
  // a direct fetch is mixed-content blocked, so a handler that tries one fails
  // loudly here rather than passing in a test and breaking on the live site.
  await page.goto(`${STUDIO_ORIGIN}/`, { waitUntil: 'domcontentloaded' });

  if (!(await settlesConnected(page, CONNECT_BUDGET_MS))) {
    const setupConnect = page.getByTestId('setup-connect-card');
    const footerChip = page.getByTestId('card-link-status');
    const target = (await setupConnect.count()) ? setupConnect : footerChip;
    if (!(await target.count())) throw new Error('not connected over the bridge, and nothing to click to connect');
    await target.first().click();
    await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toMatch(CONNECTED);
  }
  expect(await linkTransport(page), 'the https lane must hold a bridge link').toBe('connected-bridge/bridge');
  return card;
}

for (const stateId of ['installed-match', 'installed-different']) {
  test(`[W16-https] Verify hardware reads the card over the bridge and reports back (${stateId})`, async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', error => crashes.push(String(error.message)));
    const card = await connectOverBridge(page, stateId);
    await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=overview`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toMatch(CONNECTED);
    const panel = await openChecksPanel(page);

    const before = card.requests.length;
    await panel.getByRole('button', { name: 'Verify hardware' }).click();

    const note = panel.getByTestId('card-checks-message');
    await expect(note).toContainText(/Hardware readback verified/i, { timeout: 10_000 });
    const relayed = card.requests.slice(before).map(request => `${request.method} ${request.path}`);
    expect(relayed, 'the read must reach the card through the bridge').toContain('GET /api/status');
    expect(crashes).toEqual([]);
  });

  test(`[W16-https] Recover lights sends the recovery over the bridge and verifies the readback (${stateId})`, async ({ page }) => {
    const card = await connectOverBridge(page, stateId);
    await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=overview`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toMatch(CONNECTED);
    const panel = await openChecksPanel(page);

    const before = card.requests.length;
    await panel.getByRole('button', { name: 'Recover lights' }).click();

    const note = panel.getByTestId('card-checks-message');
    await expect(note).toContainText(/Recovery command .* acknowledged with ready-state readback/i, { timeout: 15_000 });
    const relayed = card.requests.slice(before).map(request => `${request.method} ${request.path}`);
    expect(relayed).toContain('POST /api/recover-lights');
    expect(relayed).toContain('GET /api/status');
  });
}
