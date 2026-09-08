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

async function openChecksPanel(page) {
  const panel = page.getByTestId('card-checks-recovery');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const isOpen = await panel.evaluate(el => (el as HTMLDetailsElement).open);
  if (!isOpen) await panel.locator('summary').click();
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
    const note = panel.locator('[role="status"], [role="alert"]');
    await expect(note).toContainText(/hardware readback verified|readback failed/i, { timeout: 10_000 });
  });

  test(`[W16-color-order] Color-order test navigates to the color-order tool (${stateId})`, async ({ page }) => {
    await connectRealCard(page, stateId);
    await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
    const panel = await openChecksPanel(page);

    await panel.getByRole('button', { name: 'Color-order test' }).click();

    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 10_000 })
      .toBe('#screen=card&section=settings&tool=color-order');
    // Does it stick, or does a later reconciliation revert it?
    await page.waitForTimeout(4000);
    expect(await page.evaluate(() => window.location.hash)).toBe('#screen=card&section=settings&tool=color-order');
  });
}
