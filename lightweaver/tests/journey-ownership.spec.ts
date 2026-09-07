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
// path this harness CAN prove today, and it used to prove a real gap: a
// same-wiring push had no ownership check of ANY kind. Two tabs are two
// independent React instances that only ever agreed by both reading the same
// card, and for this path the card had nothing to disagree with either:
// `/api/config`'s non wiring-changed branch (cardSimulator.ts) just applies
// whatever it is sent. `withStudioHardwareOperation` did not close it —
// its registry hangs off `window`, so it can only ever see its own page.
//
// Closed by src/lib/cardWriteLease.js (ticket F2): CardPushControl takes a
// cross-tab write lease on the card before any request leaves the browser and
// releases it in `finally`. The refused tab is shown the specific conflict by
// `card-write-owner-conflict`, naming the operation that owns the card, and
// nothing retries on its behalf. The two attempts below therefore OVERLAP on
// purpose — tab one's write is held open while tab two tries — because
// strictly sequential attempts could not observe a lock of any kind, and the
// rule being proved is about racing a live writer.
// ---------------------------------------------------------------------------
test('[J08] two tabs: exactly one write reaches the card when both attempt the same install', async ({ page, context }) => {
  // pin 16 / 44 pixels matches Studio's own generated default project exactly
  // (verified live), so neither tab's push changes the wiring and both take
  // the direct-apply branch — the one this harness can actually drive.
  const spec = { ...cardState('installed-match'), pin: 16, pixels: 44 };
  const card = createCardSimulator(spec);

  await card.install(page);
  await seedFreshCardIdentity(page);

  // Hold tab one's config write open, so tab two's attempt lands while a real
  // writer genuinely owns the card rather than after it has finished. This
  // handler is registered AFTER card.install so it wins (page.route is LIFO)
  // and hands the request straight back to the simulator with route.fallback()
  // the moment it is let go — the card still sees exactly the bytes Studio
  // sent, just later. Without the hold, the two attempts are strictly
  // sequential and no lock of any kind could be observed by this test.
  let releaseTabOneWrite: () => void = () => {};
  const tabOneWriteHeld = new Promise<void>(resolve => { releaseTabOneWrite = resolve; });
  let tabOneWriteInFlight = false;
  await page.route('**/api/config', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    tabOneWriteInFlight = true;
    await tabOneWriteHeld;
    return route.fallback();
  });

  await readyInstallProject(page, project => {
    // CardInstallAction's push never carries allowProjectChange, so the
    // card's OWN project id must be matched exactly or Studio refuses before
    // either tab reaches the write this test is about
    // (src/lib/cardPushClient.js projectMismatchError) — a real, separate
    // safety gate this test is not probing.
    project.id = MATRIX_PROJECT_ID;
    project.name = 'Matrix piece';
  });

  // Tab two is brought all the way to an armed Install button BEFORE tab one
  // starts writing, so the only thing left inside the held window is its
  // click. `seedFreshCardIdentity` clears this origin's storage on every one
  // of its navigations — including, in a real browser, out from under a live
  // holder — which is exactly why the lease is announced on a channel and
  // rewritten on every renewal rather than being read from storage alone.
  const two = await context.newPage();
  await card.install(two);
  await seedFreshCardIdentity(two);
  await readyInstallProject(two, project => {
    project.id = MATRIX_PROJECT_ID;
    project.name = 'Matrix piece';
  });

  await page.getByTestId('layout-send-to-card').click();
  await expect
    .poll(() => tabOneWriteInFlight, { timeout: CONNECT_BUDGET_MS, intervals: [50] })
    .toBe(true);

  await two.getByTestId('layout-send-to-card').click();
  // Tab one is let go immediately: the refusal above is already decided (the
  // lease is taken synchronously, before any request), so nothing after this
  // point is racing the card's 6-second write deadline.
  releaseTabOneWrite();

  await expect(
    two.getByTestId('card-write-owner-conflict'),
    'the second tab must be told which operation owns the card, not silently write over it',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(two.getByTestId('card-write-owner-conflict')).toContainText('Try again when the other tab finishes');

  await expect(
    page.getByText(/Installed revision .* on card/),
    'the tab that owned the write must still finish its own install',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  const configWrites = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/config');
  const timeline = JSON.stringify(card.requests.map(entry => [entry.method, entry.path]));

  expect(
    configWrites.length,
    `two tabs installing the same project must reach the card once, not ${configWrites.length} times — `
    + `the second tab has to acquire the same write authority and be told the specific conflict, never race the `
    + `writer that already holds it. Timeline: ${timeline}`,
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

// ---------------------------------------------------------------------------
// [J08] sequential identical install (ticket F5) — the question the two-tabs
// case above deliberately does NOT answer. There, tab two is refused because
// a live writer holds the card; here tab one has already FINISHED before tab
// two ever presses Install — the lease is free, so it is correctly let
// through — but nothing stopped the write itself: the card already holds
// this exact project, this exact wiring, this exact revision and
// fingerprint. A second identical write is not a race to catch; it is a
// preflight question the install never asked. `isCardAlreadyCurrent`
// (src/lib/cardDeployment.js) answers it before any request leaves the
// browser.
//
// Tab two is seeded with the BYTE-IDENTICAL project tab one installed —
// captured from tab one right before its click, not a second independently
// generated Studio default — because "the card already holds this exact
// fingerprint + revision" only means something when the two attempts are
// provably the same project, not two defaults that merely look alike.
// ---------------------------------------------------------------------------
test('[J08] sequential identical install: a second tab pressing install after the first finishes writes nothing', async ({ page, context }) => {
  // pin 16 / 44 pixels matches Studio's own generated default project exactly
  // (see the two-tabs test above), so this install takes the direct-apply
  // branch — no wiring change, no staged candidate, nothing to distract from
  // the redundant-write question this test is actually about.
  const spec = { ...cardState('installed-match'), pin: 16, pixels: 44 };
  const card = createCardSimulator(spec);

  await card.install(page);
  await seedFreshCardIdentity(page);

  const installedProject = await readyInstallProject(page, project => {
    // Same reason as the two-tabs test: the card's own project id must be
    // matched exactly or Studio refuses before either attempt reaches the
    // question this test is about.
    project.id = MATRIX_PROJECT_ID;
    project.name = 'Matrix piece';
  });

  await page.getByTestId('layout-send-to-card').click();
  await expect(
    page.getByText(/Installed revision .* on card/),
    'tab one must finish its own real install before tab two presses install',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  const two = await context.newPage();
  await card.install(two);
  await two.addInitScript(({ id, firmwareVersion, buildId, project }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    // The exact project tab one just installed, not a fresh generation — see
    // the comment above the test.
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, project: installedProject });
  await two.goto(INSTALL_ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(two.getByTestId('commissioning-step')).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(two.getByText('Ready to install on the card.')).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(two.getByTestId('layout-send-to-card')).toBeEnabled({ timeout: CONNECT_BUDGET_MS });

  await two.getByTestId('layout-send-to-card').click();
  await expect(
    two.getByTestId('card-install-already-current'),
    'a second tab installing exactly what the card already holds must read as already current — no error, no write',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(
    two.getByTestId('card-write-owner-conflict'),
    'a redundant install of the exact same project is not a write-ownership conflict',
  ).toHaveCount(0);

  const configWrites = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/config');
  const timeline = JSON.stringify(card.requests.map(entry => [entry.method, entry.path]));
  expect(
    configWrites.length,
    `a second tab installing the exact project already on the card must reach it once in total (tab one's real write), `
    + `not ${configWrites.length} — the redundant install must be gated in the preflight before any POST. Timeline: ${timeline}`,
  ).toBe(1);

  await two.close();
});

// ---------------------------------------------------------------------------
// [J08] lease-guarded wiring confirm (ticket F6) — `finishWiringTest`
// (`/api/wiring/confirm`, `/api/wiring/rollback`) used to run outside the
// cross-tab write lease that F2 gave `pushToCard` and `startWiringTest`: a
// second tab holding the lease for an unrelated reason could not stop a
// first tab from confirming (or rolling back) a light test underneath it.
// Proven the same way F2's own two-tabs case is — a live holder announced
// through `cardWriteLease.js` directly (not through the UI, since nothing
// in this app's own screens currently drives that path), refusing tab one's
// confirm until the lease is released.
// ---------------------------------------------------------------------------
test('[J08] a wiring confirm refuses while another tab holds the write lease, and succeeds once it is released', async ({ page, context }) => {
  // No pin/pixel override here, deliberately: the card's default wiring
  // (pin 18 / 41 pixels, tests/harness/cardStates.ts's `base()`) differs from
  // Studio's own generated default project (pin 16 / 44 pixels), so this push
  // takes the staged-candidate branch and reaches a real light test to
  // confirm — the exact path `finishWiringTest` guards.
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);

  await card.install(page);
  await seedFreshCardIdentity(page);
  await readyInstallProject(page, project => {
    project.id = MATRIX_PROJECT_ID;
    project.name = 'Matrix piece';
  });

  await page.getByTestId('layout-send-to-card').click();
  await expect(
    page.getByTestId('wiring-test-start'),
    'fixture sanity: a wiring-changing push must stage a candidate, not apply directly',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await page.getByTestId('wiring-test-start').click();
  await expect(page.getByTestId('wiring-test-confirm')).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  // Tab two never opens any Studio screen for this — it acquires the same
  // cross-tab write lease directly, exactly as the module's own doc comment
  // describes: "is another browser tab already writing to it?". It still
  // needs to land on the app's own origin for `localStorage` /
  // `BroadcastChannel` to be the SAME ones tab one's lease announces on —
  // but a full second mount of the Studio app on this shared-storage origin
  // would run its own autosave/adoption machinery against the exact project
  // tab one has live and mid-flow, which is a real corruption risk this test
  // has no interest in causing. Blocking the entry module (index.html's own
  // `import('/src/main.jsx')`) keeps the origin (and its storage) real while
  // never mounting a second competing app instance; `cardWriteLease.js`
  // itself has no dependency on the app having mounted.
  const two = await context.newPage();
  await two.route('**/src/main.jsx', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await two.goto('/', { waitUntil: 'domcontentloaded' });
  const acquired = await two.evaluate(async cardId => {
    const { acquireCardWriteLease } = await import('/src/lib/cardWriteLease.js');
    const claim = acquireCardWriteLease({ cardId, operation: 'install-project' });
    if (claim.ok) window.__f6TestLease = claim;
    return claim.ok;
  }, MATRIX_CARD_ID);
  expect(acquired, 'fixture sanity: tab two must actually hold the write lease before tab one is asked to confirm').toBe(true);

  await page.getByTestId('wiring-test-confirm').click();
  await expect(
    page.getByTestId('card-write-owner-conflict'),
    'confirming a light test while another tab owns the write lease must refuse, not silently proceed',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(
    page.getByTestId('wiring-test-confirm'),
    'a refused confirm must leave the light test exactly where it was, so retrying after the lease frees is possible',
  ).toBeVisible();

  const confirmPostsWhileHeld = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/wiring/confirm');
  expect(confirmPostsWhileHeld.length, 'a refused confirm must post nothing to the card').toBe(0);

  await two.evaluate(() => { window.__f6TestLease?.release(); });

  await page.getByTestId('wiring-test-confirm').click();
  // Card facts on `card.state` / `card.requests`, never prose (rule 4) —
  // confirming can navigate the screen on (exactly as
  // tests/layout-send-to-card.spec.ts's own confirm does, on to Patterns),
  // so the transient success banner is not a stable thing to assert on.
  await expect
    .poll(
      () => card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/wiring/confirm').length,
      { timeout: CONNECT_BUDGET_MS, intervals: [200] },
    )
    .toBe(1);
  expect(card.state.wiringTestActive, 'confirming once the lease is released must actually end the probation window').toBe(false);

  const confirmPosts = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/wiring/confirm');
  const timeline = JSON.stringify(card.requests.map(entry => [entry.method, entry.path]));
  expect(
    confirmPosts.length,
    `the wiring confirm must reach the card exactly once total once the lease was released, not ${confirmPosts.length}. Timeline: ${timeline}`,
  ).toBe(1);

  await two.close();
});
