// Journey continuity — docs/plans/2026-09-05-unified-card-journey.md, J01–J14.
//
// The card-state-matrix suite proves three things per cell, each cell its own
// fresh card. This suite proves something the matrix cannot: that ONE
// simulated card carried across clicks, a lost reply, a reload and a wiring
// probation still agrees with itself — the shared setup journey
// (src/lib/setupJourney.js via src/hooks/useSetupJourney.js) gives the same
// verdict to Card Home's ladder (`[data-testid="setup-journey"]`) and the
// working-screen chip (`[data-testid="setup-journey-chip"]`) throughout.
//
// Every test titles itself with the J id from the plan's acceptance table so a
// failure names the scenario it blocks.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  MATRIX_PATTERNS,
  OTHER_PROJECT_ID,
  type CardStateSpec,
} from './harness/cardStates';

// ---------------------------------------------------------------------------
// Shared boot/read helpers — same conventions as card-state-matrix.spec.ts,
// kept local because that file exports only its fixtures, not its helpers.
// ---------------------------------------------------------------------------

/** A browser that has met this card before but holds no project of its own —
 * the exact fixture card-state-matrix.spec.ts calls 'remembers-card'. */
async function seedKnownCard(page: Page, cardId = MATRIX_CARD_ID) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

/**
 * A browser with real, unrelated work open — must never be silently replaced.
 *
 * card-state-matrix.spec.ts's own 'other-project-open' fixture writes this
 * same shape WITHOUT a `version` field and WITHOUT `portRoles`. Two separate
 * gaps that fixture never trips, both found running this suite:
 *
 * 1. `migrateProject` (src/lib/projectModel.js) requires `version ===
 *    PROJECT_VERSION` (or the legacy 1/2) to accept a saved project at all —
 *    a version-less payload is silently discarded and Studio boots the fresh
 *    default project instead. `version: 3` below fixes that.
 * 2. Even with a valid version, `adoptWiringFromCard` in lw-setup.jsx runs
 *    unconditionally on every card read (not gated behind the "adopt by
 *    default" effect's same-project-or-untouched check) and calls
 *    `applyCardParts`, which — whenever `replaceProject` exists and the card
 *    reports any strips — REPLACES THE WHOLE PROJECT, including its `id`,
 *    with `confirmDiscard: () => true` (unconditional). Its only guard is
 *    `alreadyDescribed`: whether `currentProject.portRoles` already names a
 *    strip. A project with real layout content but nothing yet in
 *    `portRoles` gets silently replaced — id and all — by the FIRST card it
 *    meets, matching neither this project nor asking first. See the
 *    acceptance ledger's risk entry. `portRoles` below describes the strip so
 *    this test exercises what it is actually named for (the resolution
 *    offer), not this separate silent-replace gap.
 */
async function seedOtherProjectOpen(page: Page) {
  await seedKnownCard(page);
  await page.addInitScript(() => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3,
      id: 'lwproj-open-work',
      name: 'Open work',
      portRoles: [{ pin: 21, role: 'strip', pixelCount: 60, controlKind: '' }],
      layout: { starterPending: false, strips: [{ id: 'strip-a', pixels: 60, pin: 21 }] },
    }));
  });
}

async function boot(page: Page, spec: CardStateSpec, hash: string, seed: (page: Page) => Promise<void>, card?: CardSimulator) {
  const sim = card || createCardSimulator(spec);
  await sim.install(page);
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

/** A — settle on 'connected-*' with zero clicks, the return-visit contract. */
async function waitConnectedUnaided(page: Page, note: string) {
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(CONNECTED, { message: note } as never);
}

function patternTile(page: Page, patternId: string) {
  return page.locator(`.pm-cards .pmcard[data-pattern-id="${patternId}"]`);
}

async function visibleAlerts(page: Page): Promise<string[]> {
  const alerts = await page.getByRole('alert').all();
  const raised: string[] = [];
  for (const alert of alerts) {
    if (await alert.isVisible()) raised.push(((await alert.textContent()) || '').trim().slice(0, 120));
  }
  return raised;
}

function journeyLocator(page: Page) {
  return page.getByTestId('setup-journey');
}

function chipLocator(page: Page) {
  return page.getByTestId('setup-journey-chip');
}

// ---------------------------------------------------------------------------
// J02 — existing configured card, return visit.
//
// A browser that already knows this card (card identity only — no project of
// its own, exactly the 'remembers-card' fixture) meets a card holding a real,
// matching project. Recognize the installation, keep it recognized across a
// reload, and never show the working-screen reminder again.
// ---------------------------------------------------------------------------
test('[J02] a returning browser recognizes the installed project without re-onboarding', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = await boot(page, spec, '/', seedKnownCard);
  await waitConnectedUnaided(page, 'J02 initial connect');

  await expect(
    journeyLocator(page),
    'a card holding exactly the project it already reports installed must read as setup-complete on first sight',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });

  // F7: seedKnownCard leaves no project of its own open, so this journey just
  // completed through adoptWiringFromCard's skeleton-only shortcut in
  // lw-setup.jsx (the untouched-starter case documented above at
  // seedOtherProjectOpen) — not the slower "adopt by default" effect that
  // reconstructs through reconstructInstalledCardState. That shortcut hands
  // its skeleton straight to applyCardParts with no button press, so without
  // a `card-partial` origin stamped on the skeleton itself
  // (projectSkeletonFromCardStatus, discoveryCommit.js) the adopted project
  // carried no record of where it came from, and Projects silently read "Not
  // saved yet" instead of naming this as a partial card reconstruction.
  await page.getByTestId('topbar-projects').click();
  await expect(page.getByTestId('projects-panel')).toBeVisible();
  await expect(page.getByTestId('projects-association')).toHaveText('Card copy (partial — no artwork)');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J02 after reload');
  await expect(
    journeyLocator(page),
    'a reload of a completed installation must not restart onboarding',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });

  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J02 patterns entry');
  await expect(
    chipLocator(page),
    'the working-screen chip must not appear once setup is complete',
  ).toHaveCount(0);

  const target = MATRIX_PATTERNS.find(pattern => pattern.id !== spec.currentId) || MATRIX_PATTERNS[0];
  await patternTile(page, target.id).click();
  await card.waitForPlaying(target.id, 5000);
});

// ---------------------------------------------------------------------------
// J02 (negative) — a different card project must never silently replace real
// open work. The offer to resolve it must be visible, and the open project
// must still be exactly what it was.
// ---------------------------------------------------------------------------
test('[J02] a card holding a different project never silently replaces open work', async ({ page }) => {
  const spec = cardState('installed-different');
  await boot(page, spec, '/', seedOtherProjectOpen);
  await waitConnectedUnaided(page, 'J02 negative connect');

  const readOpenId = () => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; }
    catch { return ''; }
  });
  expect(await readOpenId(), 'Studio replaced the owner’s open work without being asked').toBe('lwproj-open-work');

  const offer = page.locator(
    '[data-testid="setup-keep-open-project"], [data-testid="setup-load-matched"], [data-testid="setup-start-from-card"]',
  );
  await expect(
    offer.first(),
    'a card holding a project Studio has never seen must offer a real choice, not silence',
  ).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  // Re-read after the card has had time to settle and any auto-adopt pass has
  // run its course — the open work must still be exactly what it was, not
  // merely unchanged in the first instant after connect.
  expect(await readOpenId(), 'Studio replaced the owner’s open work without being asked').toBe('lwproj-open-work');

  expect(spec.projectId, 'fixture sanity: installed-different must actually differ').toBe(OTHER_PROJECT_ID);
});

// ---------------------------------------------------------------------------
// J02 (F8) — bare root for a returning owner. `bootstrapFirstRunSetupRoute`
// used to force `#screen=card&section=setup` on every empty hash, even for a
// browser holding a saved project that is already complete for the exact
// card it remembers — "Existing installation verified → Open patterns; do
// not rerun setup merely because Studio reopened." The section a bare hash
// resolves to is decided from the saved project (src/lib/studioRoute.js
// `bareRouteFor`) before the card is ever probed, so this asserts the hash
// itself immediately on `domcontentloaded` — then, once the connection
// settles, that the shared journey independently agrees the install is
// complete (data-journey-complete), which is what actually collapses the
// ladder inside Card Home (see [T6] in card-state-matrix.spec.ts — Card Home
// is one page whose content follows the journey, not the URL section).
// ---------------------------------------------------------------------------
async function seedReturningOwnerWithCompleteProject(page: Page, spec: CardStateSpec) {
  await page.addInitScript(({ id, firmwareVersion, buildId, project }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3,
      id: project.projectId,
      name: 'Matrix piece',
      layout: {
        starterPending: false,
        strips: [{ id: 'strip-1', pixels: project.pixels, pin: project.pin }],
        wiring: {
          verified: true,
          runs: [{ id: 'strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward' }],
        },
      },
      portRoles: [{ port: 'out1', role: 'strip', pin: project.pin, pixelCount: project.pixels }],
      devices: {
        standaloneController: {
          led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' },
        },
      },
    }));
    // The exact record a real install writes (projectLifecycle.js
    // `lifecycleRecordFromState`): this card, this revision, this fingerprint.
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2,
      dirty: false,
      persistedDestination: null,
      installation: {
        cardId: id,
        projectRevision: project.projectRevision,
        projectFingerprint: project.projectFingerprint,
        studioFingerprint: project.projectFingerprint,
      },
    }));
  }, {
    id: MATRIX_CARD_ID,
    firmwareVersion: MATRIX_FIRMWARE_VERSION,
    buildId: MATRIX_BUILD_ID,
    project: {
      projectId: spec.projectId,
      projectRevision: spec.projectRevision,
      projectFingerprint: spec.projectFingerprint,
      pixels: spec.pixels,
      pin: spec.pin,
    },
  });
}

test('[J02] a bare URL for a returning owner with a complete saved project lands on Card Home overview', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = await boot(page, spec, '/', p => seedReturningOwnerWithCompleteProject(p, spec));

  // Decided before the card is ever probed — a saved project already
  // installed on the exact card Studio remembers must not be routed back
  // through the setup ladder just because Studio reopened.
  await expect.poll(() => page.evaluate(() => window.location.hash), {
    message: 'a returning owner with a complete saved project must land on the overview section, not be forced into setup',
  }).toBe('#screen=card&section=overview');

  await waitConnectedUnaided(page, 'F8 returning-owner connect');
  await expect(
    journeyLocator(page),
    'a saved project already installed on the card it names must read as setup-complete without a click',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });

  expect(card.unhandled, 'Studio called a card endpoint the simulator does not model').toEqual([]);
});

test('[J02] a bare URL with nothing remembered still lands on the setup ladder', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.location.hash), {
    message: 'a fresh browser must still be walked through setup on a bare hash',
  }).toBe('#screen=card&section=setup');
});

// ---------------------------------------------------------------------------
// J13 — every setup surface agrees during an active light test, and agrees
// again once the card's own probation clock ends it without anyone confirming.
// ---------------------------------------------------------------------------
test('[J13] every setup surface agrees on an active light test, and agrees again once it ends', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);
  card.beginWiringTest();
  await boot(page, spec, '/#screen=pattern', seedKnownCard, card);
  await waitConnectedUnaided(page, 'J13 patterns entry');

  await expect(
    chipLocator(page),
    'the working-screen chip must show the live light test',
  ).toHaveAttribute('data-journey-task', 'confirm-visible-lights', { timeout: CONNECT_BUDGET_MS });
  await expect(chipLocator(page)).toHaveAttribute('data-journey-complete', 'false');

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J13 card home');
  await expect(
    journeyLocator(page),
    'Card Home must show the same live light test the chip showed',
  ).toHaveAttribute('data-journey-task', 'confirm-visible-lights', { timeout: CONNECT_BUDGET_MS });
  await expect(journeyLocator(page)).toHaveAttribute('data-journey-complete', 'false');
  // The detected-state panel below the ladder must yield to the identity
  // row's "Testing lights" line purely from the shared journey — this page
  // no longer learns the wiring test is active from a Setup prop callback
  // (blueprint H3's retired `onWiringTestActiveChange`).
  await expect(
    page.getByTestId('card-detected-state'),
    'the detected-state panel must not repeat a live light test the identity row already states',
  ).toHaveCount(0);

  // The card's own probation clock elapses with nobody confirming or rolling
  // back — exactly what firmware does on its own.
  await card.expireWiringProbation();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J13 card home after expiry');
  await expect(
    journeyLocator(page),
    'Card Home must stop asking to confirm a light test that has already ended',
  ).not.toHaveAttribute('data-journey-task', 'confirm-visible-lights', { timeout: CONNECT_BUDGET_MS });

  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J13 patterns after expiry');
  const chipCount = await chipLocator(page).count();
  if (chipCount > 0) {
    await expect(
      chipLocator(page),
      'the chip must stop asking to confirm a light test that has already ended',
    ).not.toHaveAttribute('data-journey-task', 'confirm-visible-lights');
  }
});

// ---------------------------------------------------------------------------
// C3 — blueprint H8's diagnostic trail. A changed setup-journey task leaves
// one line in the connection log (src/lib/journeyTrail.js via
// src/hooks/useSetupJourney.js, appended through the shared bounded journal
// in src/lib/cardLinkJournal.js), and that line survives a reload the same
// way the journey verdict itself does — it lives in the same localStorage the
// journey's own evidence is read from, not in memory.
// ---------------------------------------------------------------------------
test('[C3] a live light test writes a diagnostic line to the connection log, and it survives a reload', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);
  card.beginWiringTest();
  await boot(page, spec, '/#screen=card', seedKnownCard, card);
  await waitConnectedUnaided(page, 'C3 card home');
  await expect(
    journeyLocator(page),
    'the shared journey must show the live light test before the log can have recorded it',
  ).toHaveAttribute('data-journey-task', 'confirm-visible-lights', { timeout: CONNECT_BUDGET_MS });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'C3 card home after reload');
  await page.goto('/#screen=card&section=support', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Connection log', exact: true }).click();
  await expect(
    page.getByTestId('connection-log-text'),
    'the diagnostic line naming the light-test task must be in the connection log after a reload',
  ).toHaveValue(/confirm-visible-lights/, { timeout: CONNECT_BUDGET_MS });
});

// ---------------------------------------------------------------------------
// J05 — a first reconnect that has to retry, then a reply lost after the card
// genuinely applied the write. Neither may cost a click, and the lost reply
// must never turn into a duplicate command.
// ---------------------------------------------------------------------------
test('[J05] a slow reconnect settles unaided, and a lost reply after a real write is not duplicated', async ({ page }) => {
  const spec = cardState('slow-to-answer'); // installed-match + dropFirstRequests: 3
  const card = await boot(page, spec, '/#screen=pattern', seedKnownCard);
  await waitConnectedUnaided(page, 'J05 slow reconnect');
  expect(spec.dropFirstRequests, 'fixture sanity: slow-to-answer must actually drop first requests').toBeGreaterThan(0);

  const target = MATRIX_PATTERNS.find(pattern => pattern.id !== spec.currentId) || MATRIX_PATTERNS[0];
  card.respondThenDrop('/api/control', { times: 1 });

  await patternTile(page, target.id).click();
  await card.waitForPlaying(target.id, 8000);

  // Give any naive "no reply, so retry" behaviour time to actually fire before
  // counting — a fixed short wait, not a race against the assertion below.
  await page.waitForTimeout(2000);

  const controlPostsForTarget = card.requests.filter(
    entry => entry.method === 'POST' && entry.path === '/api/control'
      && (entry.body as Record<string, unknown> | null)?.patternId === target.id,
  );
  expect(
    controlPostsForTarget.length,
    `a lost reply after a real write must not duplicate the command — Studio sent it `
    + `${controlPostsForTarget.length} times. Timeline: ${JSON.stringify(card.requests.map(entry => [entry.at - card.requests[0].at, entry.method, entry.path, (entry.body as Record<string, unknown> | null)?.patternId || '']))}`,
  ).toBe(1);
});

// ---------------------------------------------------------------------------
// J08 — two rapid clicks on the same tile are one owner intent, not two
// commands, and neither raises an alert.
// ---------------------------------------------------------------------------
test('[J08] a double click on one pattern tile reaches the card exactly once', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = await boot(page, spec, '/#screen=pattern', seedKnownCard);
  await waitConnectedUnaided(page, 'J08 double click');

  const target = MATRIX_PATTERNS.find(pattern => pattern.id !== spec.currentId) || MATRIX_PATTERNS[0];
  const tile = patternTile(page, target.id);
  await expect(tile).toHaveCount(1, { timeout: CONNECT_BUDGET_MS });

  await tile.click();
  await tile.click();
  await card.waitForPlaying(target.id, 8000);
  // Let a stray second command land if the double click was going to send one.
  await page.waitForTimeout(1000);

  const controlPostsForTarget = card.requests.filter(
    entry => entry.method === 'POST' && entry.path === '/api/control'
      && (entry.body as Record<string, unknown> | null)?.patternId === target.id,
  );
  expect(
    controlPostsForTarget.length,
    `a double click on one tile must reach the card once, not ${controlPostsForTarget.length} times. Timeline: ${JSON.stringify(card.requests.map(entry => [entry.at - card.requests[0].at, entry.method, entry.path, (entry.body as Record<string, unknown> | null)?.patternId || '', (entry.body as Record<string, unknown> | null)?.revision ?? '']))}`,
  ).toBe(1);

  expect(await visibleAlerts(page), 'a double click on the same tile must not raise an alert').toEqual([]);
});

// ---------------------------------------------------------------------------
// J08 — a card's wiring may describe the open project only where nothing can
// be lost. A real piece that has not yet written its strip into `portRoles`
// used to be replaced wholesale — id and all — by the first card Studio met,
// with no owner gate. (Found while building the J02-negative case above; its
// fixture adds `portRoles` precisely so it does not trip this.)
// ---------------------------------------------------------------------------
test('[J08] a card holding a different project never rewrites open work that has not described its strip yet', async ({ page }) => {
  const spec = cardState('installed-different');
  await seedKnownCard(page);
  await page.addInitScript(() => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3,
      id: 'lwproj-open-work',
      name: 'Open work',
      // Deliberately NO portRoles: real layout content, strip not yet described.
      layout: { starterPending: false, strips: [{ id: 'strip-a', pixels: 60, pin: 21 }] },
    }));
  });
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J08 replace guard connect');

  // Let every automatic adoption pass run before reading — the defect fired
  // on the first card read, not on a click.
  await page.waitForTimeout(2500);

  const open = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'); }
    catch { return {}; }
  });
  expect(open?.id, 'Studio rewrote the owner’s open work from a card holding a different project').toBe('lwproj-open-work');
  expect(open?.name, 'the open project’s own name must survive a card read').toBe('Open work');
  expect(spec.projectId, 'fixture sanity: installed-different must actually differ').toBe(OTHER_PROJECT_ID);
  expect(card.unhandled).toEqual([]);
});
