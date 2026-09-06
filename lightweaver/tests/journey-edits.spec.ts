// Journey continuity — A3 (docs/plans/2026-09-06-unified-card-journey-execution.md).
//
// [J06] a Studio-side install whose HTTP reply is lost after the card genuinely
// applied it, and an edit made while that install is still settling.
// [J07] the shared setup journey tracking an active wiring (light) test, the
// card's own probation clock ending it unconfirmed, and the real confirm path.
//
// Same conventions as tests/journey-continuity.spec.ts (copied, not imported —
// that file's helpers are local to it): assert card facts on `card.state` /
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
  MATRIX_PATTERNS,
  type CardStateSpec,
} from './harness/cardStates';

// ---------------------------------------------------------------------------
// Shared boot/read helpers — same conventions as journey-continuity.spec.ts.
// ---------------------------------------------------------------------------

/** A browser that has met this card before but holds no project of its own. */
async function seedKnownCard(page: Page, cardId = MATRIX_CARD_ID) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

/**
 * boot(), plus pinning the connection to exactly one host.
 *
 * card.install(page) answers every host in CARD_HOSTS identically (one
 * simulator, several addresses) — a harness convenience, not a real card,
 * which is never simultaneously live at its mDNS name AND its factory AP. For
 * most journeys that is harmless: every request is a GET, racing two hosts for
 * a read changes nothing observable. [J06] deliberately drops one `/api/config`
 * reply and then counts POSTs to it — if the card's own failure-recovery
 * discovery races the same two hosts and picks the "wrong" one, it retries the
 * write for real on that second host, and the count goes from a deterministic
 * 1 to a coin flip. Pinning every other host to an immediate refusal is what a
 * real installed card actually looks like (its setup hotspot is not answering
 * once it has joined the gallery network), and it is what keeps the count
 * honest instead of flaky.
 */
async function boot(page: Page, spec: CardStateSpec, hash: string, seed: (page: Page) => Promise<void>, card?: CardSimulator, host = 'lightweaver.local') {
  const sim = card || createCardSimulator(spec);
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

function patternTile(page: Page, patternId: string) {
  return page.locator(`.pm-cards .pmcard[data-pattern-id="${patternId}"]`);
}

function journeyLocator(page: Page) {
  return page.getByTestId('setup-journey');
}

function readProject(page: Page) {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'); }
    catch { return {}; }
  });
}

// ---------------------------------------------------------------------------
// [J06] — a lost /api/config reply after a real write, and an edit made while
// the install is still settling.
//
// src/v3/lw-pattern.jsx's "Install on card" control carries no data-testid —
// title="Install the current look on the card" is the only stable locator,
// and every existing spec that drives it (tests/patterns-v3.spec.ts,
// tests/studio-hardening.spec.ts) already locates it the same way.
// ---------------------------------------------------------------------------
test('[J06] a lost /api/config reply after a real install write is not duplicated, and an edit made before it settles is not lost', async ({ page }) => {
  const spec = cardState('installed-match');
  // Boot at '/' first, exactly as J02 does: the adoption that turns "a known
  // card holding a matching project" into a verified, install-authorized
  // Studio project runs inside Card Home / Setup's own mount effect. Booting
  // straight to '#screen=pattern' skips that mount entirely, so no
  // adoption ever runs and Install stays disabled forever — found empirically
  // (the fixture behaves exactly like J02-negative until Setup has mounted at
  // least once).
  const card = await boot(page, spec, '/', seedKnownCard);
  await waitConnectedUnaided(page, 'J06 connect');
  await expect(
    journeyLocator(page),
    'a card holding exactly the project Studio has open must read as setup-complete on first sight',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });

  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J06 patterns entry');

  const install = page.getByTitle('Install the current look on the card');
  // The adopted installed-match project already matches what the card
  // reports, so an install must be available with no extra clicks — the same
  // "recognized without re-onboarding" contract J02 proves for viewing.
  await expect(install, 'a card holding exactly the open project must authorize an install unaided').toBeEnabled({ timeout: CONNECT_BUDGET_MS });

  const first = MATRIX_PATTERNS.find(pattern => pattern.id !== spec.currentId) || MATRIX_PATTERNS[0];
  await patternTile(page, first.id).click();
  await card.waitForPlaying(first.id, 8000);

  card.respondThenDrop('/api/config', { times: 1 });
  await install.click();
  await expect(install, 'Install must show its pending state the instant it is clicked').toHaveText(/Sending…/, { timeout: 3000 });

  // The second edit, made while the first install is still in flight (its
  // reply has not arrived yet — it is on the wire, about to be dropped).
  const second = MATRIX_PATTERNS.find(pattern => pattern.id !== first.id && pattern.id !== spec.currentId) || MATRIX_PATTERNS[2];
  await patternTile(page, second.id).click();
  await expect(page.getByTestId('pattern-preview-meta'), 'selecting a second look mid-install must update the live preview immediately').toContainText(second.label);

  // Let the failed push, any failure-recovery discovery, and the settle all
  // finish before counting anything.
  await expect(install, 'a lost reply must settle (to Retry, not hang forever)').not.toHaveText(/Sending…/, { timeout: 8000 });
  await page.waitForTimeout(500);

  const configPosts = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/config');
  expect(
    configPosts.length,
    `a lost /api/config reply after a real write must not duplicate the send — Studio sent it ${configPosts.length} times. `
    + `Timeline: ${JSON.stringify(card.requests.map(entry => [entry.at - card.requests[0].at, entry.method, entry.path]))}`,
  ).toBe(1);

  // The card DID apply the config even though the reply never arrived — that
  // is the whole point of "lost reply", as opposed to "refused write". Prove
  // it holds the exact revision Studio actually sent, not a fixture guess.
  const postedRevision = (configPosts[0].body as Record<string, unknown> | null)?.projectRevision;
  expect(typeof postedRevision === 'number' || typeof postedRevision === 'string', 'fixture sanity: the config post must carry a projectRevision').toBe(true);
  expect(card.state.projectRevision, 'the card must hold exactly the revision Studio sent, once, even though its reply was lost').toBe(postedRevision);

  // The second edit must still be the live draft once everything has settled
  // — the failed first install's own settle handling (arriving AFTER the
  // second edit was made) must not stomp the preview back to the first look.
  await expect(page.getByTestId('pattern-preview-meta'), 'the edit made while the first install was settling must still be the draft once everything lands').toContainText(second.label);
});

// ---------------------------------------------------------------------------
// [J07] — every setup surface agrees on an active light (wiring) test; the
// card's own probation clock ending it unconfirmed leaves every surface
// agreeing again AND the project draft untouched; and the real confirm path
// promotes the candidate with exactly one confirmation POST.
//
// src/v3/lw-setup.jsx's phase-4 "verify" task, when journey.taskId is
// 'confirm-visible-lights', renders only a status line — "Confirm or restore
// it with the controls below" — and the actual Yes/No controls are the
// `installAction` prop it is handed (src/v3/lw-card.jsx -> CardCommissioningPanel,
// rendered into `[data-testid="setup-install-slot"]`). CardCommissioningPanel
// carries NO data-testid on either button; they are role="button" with the
// exact accessible names below (already how tests/card-workspace.spec.ts
// locates them). Reported here as the answer to "find its test id" — there
// isn't one.
// ---------------------------------------------------------------------------
test('[J07] Card Home tracks an active light test, agrees again once the card lets it lapse unconfirmed, and confirming promotes the candidate exactly once', async ({ page }) => {
  const spec = cardState('installed-match');
  // src/lib/cardCommissioningFlow.js's own validation (requireFlow) requires
  // expectedCard.id to match /^lw-[a-f0-9]{12}$/ — a real card's MAC-derived
  // id. MATRIX_CARD_ID ('lw-matrix-card') is not one; the part-3 confirm path
  // below needs a real commissioning-flow object, so this card uses an id
  // that satisfies both that pattern and the ordinary card-identity checks
  // parts 1-2 exercise (tests/card-workspace.spec.ts's commissioning fixtures
  // use the same id for the same reason).
  const j07CardId = 'lw-aabbccddeeff';
  const card = createCardSimulator(spec, { cardId: j07CardId });
  await boot(page, spec, '/', page => seedKnownCard(page, j07CardId), card);
  await waitConnectedUnaided(page, 'J07 connect');

  // Part 1 — the card enters a light test on its own (as it does mid-install,
  // between activate and the owner's confirmation); Card Home must show it
  // immediately.
  card.beginWiringTest({ pixels: 55, pin: 18 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J07 during test');
  await expect(
    journeyLocator(page),
    'Card Home must show the live light test the moment the card reports one',
  ).toHaveAttribute('data-journey-task', 'confirm-visible-lights', { timeout: CONNECT_BUDGET_MS });

  const projectBefore = await readProject(page);

  // Part 2 — the card's own probation clock elapses with nobody confirming or
  // rolling back, exactly what firmware does on its own. Every surface must
  // stop asking, and the open project must be untouched — a light test is a
  // hardware-side event, never a project edit.
  await card.expireWiringProbation();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J07 after expiry');
  await expect(
    journeyLocator(page),
    'Card Home must stop asking to confirm a light test the card itself already ended',
  ).not.toHaveAttribute('data-journey-task', 'confirm-visible-lights', { timeout: CONNECT_BUDGET_MS });

  const projectAfter = await readProject(page);
  expect(projectAfter.id, 'the probation clock elapsing must never touch the open project id').toBe(projectBefore.id);
  expect(projectAfter.layout, 'the probation clock elapsing must never touch the open project layout').toEqual(projectBefore.layout);

  // Part 3 — the confirm path, driven for real. Stage a genuine wiring
  // candidate (the same /api/wiring/candidate a real "send to card" wiring
  // change stages), splice a matching Studio-side commissioning flow so
  // CardCommissioningPanel renders its check-lights controls (same technique
  // tests/card-workspace.spec.ts's seedCommissioningFlow uses — the flow
  // object is spliced directly rather than earned through the full evidence
  // chain, which is guarded by a private WeakSet precisely so it cannot be
  // forged; a test is allowed to construct the object literal it produces),
  // then click the REAL buttons so activate and confirm hit this simulator
  // over genuine HTTP, not a stub.
  const cardHost = 'lightweaver.local';

  // cardCommissioningFlow's own `flow.project.fingerprint` is a 16-hex FNV
  // hash of the STUDIO project object (fingerprintCommissioningProject) — an
  // entirely different algorithm and length from the card's own
  // projectFingerprint (32+ hex chars, cardProjectFingerprint elsewhere in
  // the app; tests/harness/cardStates.ts's 'installed-match' fixture uses
  // 'f'.repeat(32)). The final confirm read-back below requires the two to be
  // EXACTLY equal (assertCommissioningFinalWiringStatus), so rather than
  // inventing a value, compute the flow's real fingerprint first and make the
  // simulated card report that same value — matching what this fixture would
  // report, not asserting a coincidence.
  const built = await page.evaluate(async ({ cardId, firmwareVersion, buildId, host }) => {
    const commissioning = await import('/src/lib/cardCommissioningFlow.js');
    const now = Date.now();
    const projectRecord = {
      id: 'j07-confirm-project',
      updatedAt: now,
      project: {
        version: 3, id: 'j07-confirm-project', name: 'J07 confirm fixture',
        layout: { strips: [], wiring: null, patchBoard: null },
        devices: { standaloneController: {} },
      },
    };
    let flow = commissioning.beginCardCommissioning({
      source: 'web-serial',
      operation: 'install-current-release',
      strategy: 'clean-recovery',
      projectRecord,
      projectRevision: 4,
      installTarget: { id: cardId, firmwareVersion, buildId },
      now,
    });
    flow = commissioning.completeCardInstall(flow, {
      operation: 'install-current-release',
      cardId, firmwareVersion, buildId,
      postFlashNetwork: { state: 'lan', stationIp: host },
    }, { now: now + 1 });
    flow = commissioning.acknowledgeCommissionedCard(flow, { id: cardId, firmwareVersion, buildId }, { now: now + 2 }).flow;
    return { flow };
  }, { cardId: j07CardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: cardHost });

  card.state.projectFingerprint = built.flow.project.fingerprint;

  const staged = await page.evaluate(async ({ host }) => {
    const { stageCardWiringCandidate, readCardWiringCandidateEvidence } = await import('/src/lib/cardWiringSafety.js');
    const status = await stageCardWiringCandidate(
      { led: { pixels: 55, outputs: [{ pin: 18 }] } },
      { host, transport: 'direct' },
    );
    // Independent read-back, exactly as the production commissioning flow
    // requires before it will trust a staged candidate.
    await readCardWiringCandidateEvidence(status.activationId, { host, transport: 'direct' });
    return { activationId: status.activationId };
  }, { host: cardHost });
  expect(staged.activationId, 'fixture sanity: staging a candidate must return a real activation id').toBeTruthy();

  await page.evaluate(async ({ activationId, flow: builtFlow }) => {
    const commissioning = await import('/src/lib/cardCommissioningFlow.js');
    const flow = {
      ...builtFlow,
      stage: 'check-lights',
      project: {
        ...builtFlow.project,
        pendingActivationId: activationId,
        pendingWiring: {
          wiringRevision: 1,
          wiringDigest: 'd'.repeat(64),
          ledType: 'WS2812B',
          colorOrder: 'GRB',
          maxMilliamps: 2000,
          outputs: [{ id: 'out1', pin: 18, pixels: 55, segments: [{ id: 'run-strip-1', count: 55, direction: 'forward' }] }],
        },
      },
    };
    await commissioning.writeCardCommissioning(flow, { locks: null });
  }, { activationId: staged.activationId, flow: built.flow });

  await page.evaluate(() => { window.location.hash = '#screen=card&section=install'; });
  await expect(page).toHaveURL(/#screen=card&section=install$/);

  await page.getByRole('button', { name: 'Start 90-second light test', exact: true }).click();
  await expect(page.getByText(/blue first pixel and red final pixel/i)).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  const activatePosts = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/wiring/activate');
  expect(activatePosts.length, 'Start 90-second light test must activate the staged candidate exactly once').toBe(1);
  expect(card.state.wiringTestActive, 'activating the candidate must put the card into its testing/probation window').toBe(true);
  expect(card.state.pixels, 'activating the candidate must apply the staged pixel count').toBe(55);

  // Activation rebooted the card (a real bootId change, exactly like the
  // firmware's own reboot into the candidate). The card link's own
  // anti-flakiness guard (acquireFreshLightCheckMutation) refuses to mutate
  // again until its background poll has re-validated that new bootId, so
  // confirming immediately reads as "card restarted, wait for two stable
  // checks" — a real product safeguard, not a bug. Wait for the link to catch
  // up, exactly as an owner's own device would over the next status poll.
  await expect.poll(() => page.evaluate(async () => {
    const { getCardLinkState } = await import('/src/lib/cardLink.js');
    return getCardLinkState().validatedBootId || '';
  }), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toBe(card.state.bootId);

  await page.getByRole('button', { name: 'Yes, every output is correct', exact: true }).click();
  await expect(page.getByText('Light check complete', { exact: true }), 'confirming must complete the light check on screen').toBeVisible({ timeout: CONNECT_BUDGET_MS });

  const confirmPosts = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/wiring/confirm');
  expect(
    confirmPosts.length,
    `confirming a light test must post exactly one confirmation — Studio sent it ${confirmPosts.length} times. `
    + `Timeline: ${JSON.stringify(card.requests.map(entry => [entry.at - card.requests[0].at, entry.method, entry.path]))}`,
  ).toBe(1);
  expect(card.state.wiringTestActive, 'confirming must end the probation window').toBe(false);
  expect(card.state.pixels, 'confirming must promote (not roll back) the candidate pixel count').toBe(55);
});
