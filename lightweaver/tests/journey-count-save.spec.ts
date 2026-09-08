// F14 — a LED-count save must be bulletproof (Phase G,
// docs/plans/2026-09-06-unified-card-journey-execution.md).
//
// Real firmware rule (firmware/lightweaver-controller/src/LightweaverStorage.cpp,
// runtimeConfigJsonChangesWiring): a changed pixel count on the SAME outputs is
// NOT a rewire — the card saves it and restarts at once, answering
// `{ok:true, requiresReboot:true}` before the reboot, and the HTTP reply that
// would tell Studio that is exactly what a real card loses mid-restart. This
// spec drives that exact shape through the real UI: edit the LED count on
// Layout, install through the card flow, and prove Studio recovers from the
// lost reply by reading the card back — never by resending the write, and
// never by reporting "Push failed".
//
// Same conventions as journey-edits.spec.ts (copied, not imported — that
// file's helpers are local to it): assert card facts on `card.state` /
// `card.requests`, screen facts on `data-testid` only, one simulated card per
// test.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, CARD_HOSTS, type CardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  type CardStateSpec,
} from './harness/cardStates';

// ---------------------------------------------------------------------------
// Shared boot/read helpers — copied from journey-edits.spec.ts.
// ---------------------------------------------------------------------------

async function seedKnownCard(page: Page, cardId = MATRIX_CARD_ID) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

async function boot(page: Page, spec: CardStateSpec, hash: string, seed: (page: Page) => Promise<void>, host = 'lightweaver.local') {
  const sim = createCardSimulator(spec);
  await sim.install(page);
  for (const other of CARD_HOSTS) {
    if (other === host) continue;
    await page.route(`http://${other}/**`, route => route.abort('connectionrefused'));
    await page.route(`https://${other}/**`, route => route.abort('connectionrefused'));
  }
  await seed(page);
  await page.goto(hash, { waitUntil: 'domcontentloaded' });
  return sim;
}

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

const CONNECTED = /^connected-(direct|bridge)$/;
const CONNECT_BUDGET_MS = 15000;

async function waitConnectedUnaided(page: Page, note: string) {
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(CONNECTED, { message: note } as never);
}

function journeyLocator(page: Page) {
  return page.getByTestId('setup-journey');
}

// ---------------------------------------------------------------------------
// [F14] — a length-only save on an already-installed card.
// ---------------------------------------------------------------------------
test('[F14] a length-only Layout save survives the card losing its own reboot reply, with no resend and no Push failed', async ({ page }) => {
  const spec = cardState('installed-match'); // pin 18, 41 pixels — matches the project Studio adopts on first sight.
  const card = await boot(page, spec, '/', seedKnownCard);
  await waitConnectedUnaided(page, 'F14 connect');
  await expect(
    journeyLocator(page),
    'a card holding exactly the project Studio has open must read as setup-complete on first sight',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });

  const STARTING_PIXELS = spec.pixels; // 41
  const NEXT_PIXELS = STARTING_PIXELS + 1; // change the LED count by one

  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'F14 layout entry');

  const strip = page.locator('[data-strip-id]').first();
  if (!await strip.locator('.la-strip-detail').isVisible()) await strip.locator('.la-strip-row').click();
  const countInput = page.getByLabel('Strip LED count', { exact: true });
  await expect(countInput).toHaveValue(String(STARTING_PIXELS));
  await countInput.fill(String(NEXT_PIXELS));
  await countInput.blur();

  // Let the edit settle into the autosaved project before touching the card
  // — same discipline tests/layout-led-count-save.spec.ts uses.
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.strips?.[0]?.pixelCount ?? null;
  }), { message: 'the typed LED count must land in the autosaved project before install' }).toBe(NEXT_PIXELS);

  // This edit only changes the pixel count on the SAME pin (18) — F14's rule
  // says the card applies and reboots at once, no wiring candidate — so the
  // copy line beside the install button must read the length-only sentence.
  await expect(page.getByTestId('layout-change-kind')).toContainText('length-only change');

  await page.getByTestId('layout-check-and-install').click();
  await expect(page).toHaveURL(/#screen=card&section=setup&task=install-project/);

  const install = page.getByTestId('layout-send-to-card');
  await expect(install, 'a card already holding this exact (pre-edit) project must authorize an install unaided').toBeEnabled({ timeout: CONNECT_BUDGET_MS });
  await install.click();

  // The card is restarting: Studio must show that, not silence and not a
  // failure. `card-install-restarting` is the one stable test id for it.
  await expect(
    page.getByTestId('card-install-restarting'),
    'Studio must show the card is restarting, not go quiet or report a failure, while the reply is lost',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  // No alert, and never the generic failure copy — a lost reply after a real
  // write is verification pending, never automatically "write failed".
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Push failed', { exact: false })).toHaveCount(0);

  // Once the card answers again, Studio must land on the ordinary success
  // banner — never a "Retry" state — reading back the exact new revision.
  const banner = page.locator('.la-card-push-banner');
  await expect(banner, 'the install must settle to the ordinary success banner once the card answers again')
    .toContainText(/Installed revision \d+ on card/, { timeout: CONNECT_BUDGET_MS });
  await expect(page.getByTestId('card-install-restarting')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await expect(page.getByText('Push failed', { exact: false })).toHaveCount(0);

  // The card genuinely holds the new count now — not a UI guess.
  expect(card.state.pixels, 'the card must hold the exact new LED count').toBe(NEXT_PIXELS);
  expect(card.state.wiringTestActive, 'a length-only change must never open a wiring candidate').toBe(false);

  // Exactly one /api/config POST, start to finish — the lost reply must
  // settle by reading the card back, never by resending the write.
  const configPosts = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/config');
  expect(
    configPosts.length,
    `a lost /api/config reply after a real write must not duplicate the send — Studio sent it ${configPosts.length} times. `
    + `Timeline: ${JSON.stringify(card.requests.map(entry => [entry.at - card.requests[0].at, entry.method, entry.path]))}`,
  ).toBe(1);
  expect(
    card.requests.some(entry => entry.method === 'POST' && entry.path === '/api/wiring/candidate'),
    'a length-only change must never stage a wiring candidate',
  ).toBe(false);
});
