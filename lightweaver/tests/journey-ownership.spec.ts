// Journey ownership — docs/plans/2026-09-06-unified-card-journey-execution.md,
// ticket A4 (J08 two tabs and card swap).
//
// journey-continuity.spec.ts already proves ONE tab's double click reaches the
// card once. This file proves the harder version of that same question: TWO
// independent Studio tabs (or a card swapped out under one tab) driving the
// SAME simulated card must still agree on who is allowed to write to it, and
// neither may silently lose or duplicate a command. Card facts are asserted on
// `card.state` / `card.requests`; screen facts are asserted on `data-testid`
// only, never on prose — same discipline as journey-continuity.spec.ts.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  MATRIX_PROJECT_ID,
} from './harness/cardStates';

// ---------------------------------------------------------------------------
// Shared helpers — copied from journey-continuity.spec.ts's own conventions
// (that file exports nothing; per ticket A4 rule 1 it is read-only), plus the
// install-screen recipe from tests/layout-send-to-card.spec.ts's own
// `gotoWire(verified: true)`: Studio's own generated default project is the
// only project shape worth trusting, so both helpers boot it for real and
// only then mark it verified/locked, rather than hand-authoring the schema.
// ---------------------------------------------------------------------------

const CONNECT_BUDGET_MS = 15000;
const INSTALL_ROUTE = '/#screen=card&section=setup&task=install-project';

/** A browser that has met this card before but holds no project of its own —
 * the exact fixture journey-continuity.spec.ts and card-state-matrix.spec.ts
 * call 'remembers-card'. */
async function seedKnownCard(page: Page, cardId = MATRIX_CARD_ID) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

const CONNECTED = /^connected-(direct|bridge)$/;

/** A — settle on 'connected-*' with zero clicks, the return-visit contract. */
async function waitConnectedUnaided(page: Page, note: string) {
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(CONNECTED, { message: note } as never);
}

function journeyLocator(page: Page) {
  return page.getByTestId('setup-journey');
}

async function readAutosaveId(page: Page): Promise<string> {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; }
    catch { return ''; }
  });
}

/**
 * Fresh identity for a page that has never met any card — separate from
 * `seedKnownCard` above (which only ever writes the identity key) because the
 * two-tab test also needs a clean project slate per tab, and `localStorage`
 * is shared within one browsing context: clearing it here is what stops tab
 * two's setup stepping on tab one's already-loaded project.
 */
async function seedFreshCardIdentity(page: Page, cardId = MATRIX_CARD_ID) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

/**
 * Boots Studio's own default project directly on the install screen, then
 * marks it verified/locked/color-confirmed exactly the way
 * tests/layout-send-to-card.spec.ts's `gotoWire(verified: true)` does, and
 * reloads so the mutated copy is what the app actually runs on. `edit` lets a
 * caller force a real divergence (a different owner's in-progress work), not
 * a cosmetic one.
 */
async function readyInstallProject(page: Page, edit?: (project: Record<string, any>) => void) {
  await page.goto(INSTALL_ROUTE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('lw_autosave_v3'))), {
    timeout: CONNECT_BUDGET_MS,
  }).toBe(true);
  await page.waitForTimeout(600);
  const project = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  project.layout.wiring.verified = true;
  project.layout.wiring.locked = true;
  project.layout.wiring.runs.forEach((run: Record<string, any>) => { run.verified = true; });
  const led = project.devices.standaloneController.led;
  led.colorOrder = led.colorOrder || 'GRB';
  led.colorOrderConfirmed = true;
  led.confirmedColorOrder = led.colorOrder;
  edit?.(project);
  await page.addInitScript(value => localStorage.setItem('lw_autosave_v3', value), JSON.stringify(project));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('commissioning-step')).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(page.getByText('Ready to install on the card.')).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(page.getByTestId('layout-send-to-card')).toBeEnabled({ timeout: CONNECT_BUDGET_MS });
  return project;
}

// ---------------------------------------------------------------------------
// [J08] two tabs — one simulated card, two independent Studio tabs, both
// installing the SAME project the card already holds with the SAME wiring
// (pin 16 / 44 pixels — exactly what Studio's own default project generates).
// That shape is deliberate: it is the one push CardPushControl treats as safe
// to apply immediately (`shouldDirectApplyLedCountChange` /
// `classifyCardChanges` — no wiring difference means no staged candidate),
// so it is the path with nothing else guarding it. A wiring-CHANGING install
// would instead go through `stageCardWiringCandidate` (POST
// /api/wiring/candidate) and be caught by the card's own candidate bookkeeping
// (classifyCardDeploymentResume in src/lib/cardDeployment.js — the same path
// tests/layout-send-to-card.spec.ts's "Open Patterns starts the guarded
// install and can replace an unrelated unfinished test" proves for a
// pre-existing candidate) — but this harness's simulator does not yet model
// /api/wiring/candidate (ticket A1 in this same execution plan is the one
// that teaches it to; confirmed here by reading it live at 404 under
// `not-modelled-by-simulator`). This test is therefore scoped to exactly the
// path this harness CAN prove today, and what it proves is a real gap: a
// same-wiring push has no ownership check of ANY kind.
//
// CardPushControl (src/components/layout/shared/CardPushControl.jsx) has no
// cross-tab lock of its own — confirmed by reading it end to end: no
// BroadcastChannel, no storage-event listener, nothing that one browser tab's
// install could tell another about. Two tabs are two independent React
// instances that only ever agree by both reading the same card, and for this
// path the card has nothing to disagree with either: `/api/config`'s non
// wiring-changed branch (cardSimulator.ts) just applies whatever it is sent.
// ---------------------------------------------------------------------------
test('[J08] two tabs: exactly one write reaches the card when both attempt the same install', async ({ page, context }) => {
  // pin 16 / 44 pixels matches Studio's own generated default project exactly
  // (verified live), so neither tab's push changes the wiring and both take
  // the direct-apply branch — the one this harness can actually drive.
  const spec = { ...cardState('installed-match'), pin: 16, pixels: 44 };
  const card = createCardSimulator(spec);

  await card.install(page);
  await seedFreshCardIdentity(page);
  await readyInstallProject(page, project => {
    // CardInstallAction's push never carries allowProjectChange, so the
    // card's OWN project id must be matched exactly or Studio refuses before
    // either tab reaches the write this test is about
    // (src/lib/cardPushClient.js projectMismatchError) — a real, separate
    // safety gate this test is not probing.
    project.id = MATRIX_PROJECT_ID;
    project.name = 'Matrix piece';
  });

  await page.getByTestId('layout-send-to-card').click();
  await expect(
    page.getByText(/Installed revision .* on card/),
    'tab one must finish its own install before tab two attempts the same one — otherwise this test races instead of proving anything',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  const two = await context.newPage();
  await card.install(two);
  await seedFreshCardIdentity(two);
  await readyInstallProject(two, project => {
    project.id = MATRIX_PROJECT_ID;
    project.name = 'Matrix piece';
  });

  await two.getByTestId('layout-send-to-card').click();
  await expect(
    two.getByText(/Installed revision .* on card/),
    'tab two must also be told its own attempt finished — a silent failure would hide the very collision this test is checking for',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  const configWrites = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/config');
  const timeline = JSON.stringify(card.requests.map(entry => [entry.method, entry.path]));

  // REAL DEFECT, left red rather than weakened: both tabs' pushes succeed.
  // Tab two's write silently wins with no error to either owner and no
  // "someone else just saved this" notice — confirmed live, twice
  // (card.requests carries two /api/config POSTs; both banners read
  // "Installed revision 0 on card"). Ticket A4 rule 2 says a red test proving
  // a genuine defect is the correct outcome, not a loosened assertion.
  expect(
    configWrites.length,
    `two tabs installing the same project must reach the card once, not ${configWrites.length} times — `
    + `CardPushControl has no ownership check on a same-wiring push, so the second tab's write silently wins with `
    + `no error to either owner. Timeline: ${timeline}`,
  ).toBe(1);

  await two.close();
});

// ---------------------------------------------------------------------------
// [J08] card swap — a browser that already connected to its exact card meets
// a DIFFERENT physical card answering the same addresses afterward (the
// customer swapped hardware, or a second card joined the same Wi-Fi). Studio
// must name this as the wrong card, never write to it, and never lose the
// project the owner already had open.
//
// Playwright route handlers are LIFO: registering a second `page.route` for
// the same pattern makes it answer first, without the tab ever navigating
// away — modelling exactly a card swap under one open tab. See
// src/lib/cardLifecycle.js's `wrong-card` branch (`observedId && expectedId
// && !exactCard`) and src/lib/cardLink.js's `classified.reason ===
// 'unexpected-card'`.
// ---------------------------------------------------------------------------
test('[J08] card swap: a different card answering the same address is refused, and progress is kept', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec); // cardId defaults to MATRIX_CARD_ID.

  await card.install(page);
  await seedKnownCard(page); // Studio now expects MATRIX_CARD_ID specifically.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'card swap initial connect');

  // Let the return-visit adoption pass settle before taking the "before"
  // reading, same margin journey-continuity.spec.ts's J02-negative case uses.
  await page.waitForTimeout(1500);
  const openIdBefore = await readAutosaveId(page);
  expect(openIdBefore, 'fixture sanity: a project must exist to prove it survives unchanged').toBeTruthy();

  const swapped = createCardSimulator(spec, { cardId: 'lw-other-card' });
  // The later-registered route wins, so every CARD_HOSTS address now answers
  // as a different physical card — the tab never navigates, exactly like a
  // customer swapping hardware on the same Wi-Fi.
  await swapped.install(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(
    page.getByTestId('setup-identity-row'),
    'a card that answers with a different id than the one Studio paired with must be named as the wrong card',
  ).toContainText('Wrong card', { timeout: CONNECT_BUDGET_MS });
  await expect(
    journeyLocator(page),
    'the journey must send the owner to reconnect the exact card, not resume onboarding on the wrong hardware',
  ).toHaveAttribute('data-journey-task', 'connect-card', { timeout: CONNECT_BUDGET_MS });

  const writesToSwappedCard = swapped.requests.filter(entry => entry.method === 'POST');
  expect(
    writesToSwappedCard.length,
    `a card that answers as a different id must never receive a write. Timeline: ${JSON.stringify(swapped.requests.map(entry => [entry.method, entry.path]))}`,
  ).toBe(0);

  const openIdAfter = await readAutosaveId(page);
  expect(openIdAfter, 'the open project must survive meeting a different card completely unchanged').toBe(openIdBefore);
});
