// F17-A — on an https Studio origin, a pattern tap must reach the card
// directly, with no pop-up. Before this, `scheduleBrowseLivePreview` and
// `scheduleLivePreview` in src/v3/lw-pattern.jsx decided the transport with a
// bare `window.location.protocol === 'https:'` check: any https origin
// forced the legacy bridge pop-up (`acquireCardBridgeFromGesture`), even
// though Chrome's Local Network Access rules mean the https origin can reach
// the card directly (measured against a real card, firmware 1548 — see the
// investigation this ticket was scoped from). The fix probes for a direct
// transport authority (`connectCardTransport`, the same entry point Connect
// uses) before ever falling back to the pop-up.
//
// This reuses the https lane from card-state-matrix.spec.ts's Tier 2 block
// (`installHttpsStudio` serves the real app at a real production origin by
// fulfilling it from the local Vite server — no certificate involved, so
// `window.location.protocol` is genuinely 'https:') and the card simulator's
// own dual http/https routing (`card.install` routes both schemes for every
// CARD_HOSTS entry), which is what lets a plain http card fetch succeed from
// an https page under Playwright the same way it did in the browser that was
// actually measured.
import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { CARD_HOSTS, createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION, MATRIX_HOST, MATRIX_PATTERNS } from './harness/cardStates';
import { installHttpsStudio, installPracticeCardPopup, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';
import { blockMainFrameServiceWorkers } from './harness/mainFrameServiceWorkerBlock';

// Studio previews patterns in a hidden opaque sandbox frame. Init scripts run
// in every frame, so anything touching storage or service workers must stay in
// the top frame, or the browser throws there and the crash check fails.
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ page }) => { await blockMainFrameServiceWorkers(page); });

/** A browser that already remembers this exact card — mirrors
 * card-state-matrix.spec.ts's `seedKnownCard`, duplicated here rather than
 * imported since that file exports no seeding helper. */
async function seedKnownCard(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId, host }) => {
    if (window !== window.top) return;
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', host);
    localStorage.setItem('lw_chip_card_host', host);
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: MATRIX_HOST });
}

// Refuse direct HTTP at the chosen addresses. The independently routed card
// popup can still reach the very same simulator via its normal bridge.
async function refuseDirectRoutes(page: Page, hosts: readonly string[]) {
  for (const host of hosts) {
    for (const scheme of ['http', 'https']) {
      await page.route(`${scheme}://${host}/**`, route => route.abort('connectionrefused'));
    }
  }
}

/**
 * Delay the first `times` direct-transport probes to `host` by `delayMs`
 * before letting the simulator answer normally. Match the explicit JSON Accept header so background status polling is unaffected.
 *
 * Exists because Playwright's mocked network answers a probe in well under a
 * millisecond — too fast for a scripted click to reliably land before it
 * resolves, the opposite of the real card this ticket was scoped from, where
 * an actual network round-trip left a genuine window for a hard-reload tap to
 * land while the link was still bootstrapping. This puts that window back.
 *
 * Registered AFTER `card.install(page)` so it intercepts first (Playwright
 * matches routes in reverse registration order).
 */
async function delayDirectTransportProbe(page: Page, host: string, delayMs: number, times = 1) {
  let remaining = times;
  const maybeDelay = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isProbe = request.method() === 'GET'
      && url.pathname === '/api/status'
      && (request.headers()['accept'] || '') === 'application/json';
    if (isProbe && remaining > 0) {
      remaining -= 1;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return route.fallback();
  };
  await page.route(`http://${host}/**`, maybeDelay);
  await page.route(`https://${host}/**`, maybeDelay);
}

/** Count open calls while preserving real browser popup behavior. */
async function countWindowOpen(page: Page) {
  await page.addInitScript(() => {
    const inner = window.open?.bind(window);
    (window as unknown as { __lwOpenCount: number }).__lwOpenCount = 0;
    window.open = ((...args: Parameters<typeof window.open>) => {
      (window as unknown as { __lwOpenCount: number }).__lwOpenCount += 1;
      return inner ? inner(...args) : null;
    }) as typeof window.open;
  });
}

async function openCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __lwOpenCount?: number }).__lwOpenCount || 0);
}

// The next two mirror card-state-matrix.spec.ts's `linkState` /
// `settlesConnected` — duplicated rather than imported since that file
// exports neither, only uses them internally.
const CONNECT_BUDGET_MS = 15000;
const CONNECTED = /^connected-(direct|bridge)$/;

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

async function settlesConnected(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (CONNECTED.test(await linkState(page))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** Wait for the remembered card to establish its direct link. */
async function ensureConnectedDirect(page: Page) {
  const settled = await settlesConnected(page, CONNECT_BUDGET_MS);
  if (!settled) throw new Error('background link never reached connected-direct — check the card simulator routes');
  const state = await linkState(page);
  if (state !== 'connected-direct') throw new Error(`expected connected-direct, background link settled on "${state}"`);
}

const spec = cardState('installed-match');
// Tap something the card is definitely NOT already playing, so a pass cannot
// be an accident of the starting state — same discipline as [T1C].
const target = MATRIX_PATTERNS.find(pattern => pattern.id !== spec.currentId) || MATRIX_PATTERNS[0];

test('[J17-direct] on an https Studio origin, clicking a pattern reaches the card directly with no pop-up', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(String(error.message)));

  const card = createCardSimulator(spec);
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  await countWindowOpen(page);
  await seedKnownCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=pattern`, { waitUntil: 'domcontentloaded' });
  expect(page.url().startsWith(STUDIO_ORIGIN), 'the page did not actually land on the https origin').toBe(true);

  await ensureConnectedDirect(page);

  const tile = page.locator(`.pm-cards .pmcard[data-pattern-id="${target.id}"]`);
  await expect(tile, `no pattern tile for "${target.id}"`).toHaveCount(1, { timeout: 15000 });
  await tile.click();

  // C — the CARD is playing what was tapped, same assertion discipline as
  // card-state-matrix.spec.ts's [T1C]: a tile lighting up while the strip
  // stays dark is a fail, and only the simulator's own recorded state proves
  // a command actually reached it.
  await card.waitForPlaying(target.id, 5000);

  expect(await openCount(page), 'a pattern tap on https opened a pop-up instead of going direct').toBe(0);
  expect(crashes, 'the screen crashed').toEqual([]);
  expect(card.unhandled, 'Studio called a card endpoint the simulator does not model').toEqual([]);
});

test('[J17-direct-alternate] another reachable address for the same card previews directly', async ({ page }) => {
  const card = createCardSimulator(spec);
  await card.install(page);
  await refuseDirectRoutes(page, [MATRIX_HOST]);
  await installHttpsStudio(page, testBaseURL);
  await countWindowOpen(page);
  await seedKnownCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=pattern`, { waitUntil: 'domcontentloaded' });
  await ensureConnectedDirect(page);
  const [control] = await Promise.all([
    page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/control', { timeout: 5000 }),
    page.locator(`.pm-cards .pmcard[data-pattern-id="${target.id}"]`).click(),
  ]);
  expect(CARD_HOSTS.filter(host => host !== MATRIX_HOST)).toContain(new URL(control.url()).hostname);
  await card.waitForPlaying(target.id, 5000);
  expect(await openCount(page)).toBe(0);
});

test('[J17-direct-fallback] when every direct address is refused, one card popup opens', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(error.message));
  const card = createCardSimulator(spec);
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  const bridge = await installPracticeCardPopup(page, card, { hosts: CARD_HOSTS });
  await countWindowOpen(page);
  await seedKnownCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=pattern`, { waitUntil: 'domcontentloaded' });
  await ensureConnectedDirect(page);
  expect(await openCount(page)).toBe(0);

  // Reload after a network change invalidates the previous page's authority.
  // The paired card is still remembered, but none of its direct routes work.
  await refuseDirectRoutes(page, CARD_HOSTS);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await openCount(page)).toBe(0);
  await page.locator(`.pm-cards .pmcard[data-pattern-id="${target.id}"]`).click();

  await expect.poll(() => bridge.relays.some(relay => relay.type === 'status')).toBe(true);
  expect(bridge.navigations.map(navigation => navigation.host)).toEqual([MATRIX_HOST]);
  expect(await openCount(page)).toBe(1);
  expect(crashes).toEqual([]);
});

// F20/F21 — the FIRST tap after a hard load, landing before `cardLink` has
// bootstrapped anything at all (readiness === null, transport === ''), used
// to hit one of two races depending on exactly what `resolveCardBridgePreference`
// saw: F21 (`cardLink.expectedCard` still null → `!expectedCardId` forced the
// legacy bridge pop-up with no probe at all) or F20 (the probe itself
// resolved `needsBridge: false`, but `currentPatternPreviewAccess()` still
// read the stale pre-probe `cardLink.readiness` snapshot and refused the tap
// as not-ready — the toast Adrian's own first tap produced live). Both are
// the same underlying fact: the gate consulted `cardLink` state instead of
// the outcome of the probe it had just run.
test('[J21-first-tap] the first tap after a hard load goes direct with no pop-up', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(String(error.message)));

  const card = createCardSimulator(spec);
  await card.install(page);
  await delayDirectTransportProbe(page, MATRIX_HOST, 1000);
  await installHttpsStudio(page, testBaseURL);
  await countWindowOpen(page);
  await seedKnownCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=pattern`, { waitUntil: 'domcontentloaded' });
  expect(page.url().startsWith(STUDIO_ORIGIN), 'the page did not actually land on the https origin').toBe(true);

  // Deliberately do NOT wait for the background link to settle
  // (no `ensureConnectedDirect` here, unlike [J17-direct] above) — the whole
  // point of this test is a tap landing before that has happened. Click the
  // first chip the instant it attaches; pattern tiles render off the local
  // pattern bank, not off card state, so they attach well before the
  // (deliberately delayed) direct-transport probe resolves.
  const tile = page.locator(`.pm-cards .pmcard[data-pattern-id="${target.id}"]`);
  await expect(tile, `no pattern tile for "${target.id}"`).toHaveCount(1, { timeout: 15000 });
  await tile.click();

  // A — the CARD is playing what was tapped: the strongest proof a command
  // actually reached it, same discipline as [J17-direct].
  await card.waitForPlaying(target.id, 5000);
  expect(
    card.requests.some(entry => entry.path === '/api/control'),
    'the first tap never produced an /api/control write',
  ).toBe(true);

  // B — no pop-up (F21).
  expect(await openCount(page), 'the first tap after a hard load opened a pop-up instead of going direct').toBe(0);

  // C — no "not ready for pattern commands" refusal (F20). The gate notice
  // publishes under this exact testid (see the `pattern-gate-notice` publish
  // effect in lw-pattern.jsx) and nothing in the screen ever clears
  // `patternCardGate` on its own once set, so its absence here means it was
  // never raised at any point during the tap, not merely that it cleared.
  await expect(
    page.locator('[data-testid="pattern-gate-notice"]'),
    'the first tap raised the "not ready for pattern commands" refusal',
  ).toHaveCount(0);

  expect(crashes, 'the screen crashed').toEqual([]);
  expect(card.unhandled, 'Studio called a card endpoint the simulator does not model').toEqual([]);
});
