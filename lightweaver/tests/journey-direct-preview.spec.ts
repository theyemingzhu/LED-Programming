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
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION, MATRIX_HOST, MATRIX_PATTERNS } from './harness/cardStates';
import { installHttpsStudio, installFakeCardBridge, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';

/** A browser that already remembers this exact card — mirrors
 * card-state-matrix.spec.ts's `seedKnownCard`, duplicated here rather than
 * imported since that file exports no seeding helper. */
async function seedKnownCard(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId, host }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', host);
    localStorage.setItem('lw_chip_card_host', host);
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: MATRIX_HOST });
}

/**
 * Refuse ONLY `connectCardTransport`'s direct-transport probe
 * (cardTransport.js's `connectCardTransportOnce`), while leaving every other
 * request to the card — including the background link's own `/api/status`
 * poll (cardConnection.js's `probeCardStatusHost`, which sends no headers at
 * all) and the bridge's postMessage relay (which never goes over HTTP) —
 * working normally.
 *
 * The two `/api/status` reads are otherwise identical requests to the same
 * URL, so the only thing that tells them apart is the probe's explicit
 * `Accept: application/json` header (cardTransport.js always sends it; the
 * background poll sends no headers object, so Chromium defaults to the
 * wildcard "any type" Accept value).
 * Registered AFTER `card.install(page)` so it is tried FIRST (Playwright
 * matches routes in reverse registration order) and falls through to the
 * simulator's own handler for everything that is not the probe.
 */
async function refuseDirectTransportProbe(page: Page, host: string) {
  const maybeRefuse = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isProbe = request.method() === 'GET'
      && url.pathname === '/api/status'
      && (request.headers()['accept'] || '') === 'application/json';
    if (isProbe) return route.abort('connectionrefused');
    return route.fallback();
  };
  await page.route(`http://${host}/**`, maybeRefuse);
  await page.route(`https://${host}/**`, maybeRefuse);
}

/**
 * Delay the first `times` direct-transport probes to `host` by `delayMs`
 * before letting the simulator answer normally. Same probe signature as
 * `refuseDirectTransportProbe` above (the explicit `Accept: application/json`
 * header `cardTransport.js` always sends, which the background link's own
 * unheaded `/api/status` poll never carries).
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

/** Count `window.open` calls without breaking whatever it currently does —
 * registered AFTER `installFakeCardBridge` (when present) so it wraps that
 * fixture's own fake-tab-returning override instead of being clobbered by
 * it (both are addInitScripts; they apply in registration order). */
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

/**
 * Get to "connected" the way the background link does on its own — a
 * remembered card on a reachable direct transport settles unaided, per
 * [T1]'s "clicks: 0" (and the background poll is never the thing refused in
 * the fallback test below, only the probe is). Established BEFORE the
 * pattern tap in both tests so `cardLink.transport` reads 'direct', not
 * 'bridge', at tap time — otherwise `resolveCardBridgePreference`'s first
 * check (an established bridge transport always stays on the bridge, same
 * as CardControlDrawer) would short-circuit before ever running the probe
 * this ticket is actually about.
 */
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

test('[J17-direct-fallback] when the direct probe cannot connect, the pop-up path still opens exactly once, with no crash', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(String(error.message)));

  const card = createCardSimulator(spec);
  await card.install(page);
  // Only `connectCardTransport`'s own probe is refused — background link
  // maintenance and the bridge's postMessage relay both stay healthy, so
  // this models a card whose direct-authority path specifically cannot
  // connect (a stricter router, a Local Network Access permission never
  // granted) while everything else about it — reachability, its own page in
  // another tab — is fine.
  await refuseDirectTransportProbe(page, MATRIX_HOST);
  await installHttpsStudio(page, testBaseURL);
  await installFakeCardBridge(page, card, MATRIX_HOST);
  await countWindowOpen(page);
  await seedKnownCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=pattern`, { waitUntil: 'domcontentloaded' });
  expect(page.url().startsWith(STUDIO_ORIGIN), 'the page did not actually land on the https origin').toBe(true);

  await ensureConnectedDirect(page);

  const tile = page.locator(`.pm-cards .pmcard[data-pattern-id="${target.id}"]`);
  await expect(tile, `no pattern tile for "${target.id}"`).toHaveCount(1, { timeout: 15000 });
  await tile.click();

  // The scope here is exactly the fallback DECISION, not the bridge's own
  // send — a cold bridge acquisition racing the app's readiness catch-up
  // (patternAccessRef lagging one poll cycle behind a just-opened bridge) is
  // a separate, pre-existing behaviour of `scheduleVerifiedBridgePreview` /
  // `scheduleLivePreview` that predates this ticket and reproduces the same
  // way on old code; asserting a play-through here would couple this test
  // to that unrelated race. So: give the async probe-then-fallback sequence
  // a moment to run, then assert what F17-A actually promises — the pop-up
  // opened exactly once, and nothing crashed.
  await expect.poll(() => openCount(page), { timeout: 5000, intervals: [100] }).toBe(1);
  await page.waitForTimeout(500);

  expect(await openCount(page), 'the fallback must open the card pop-up exactly once, not zero or repeatedly').toBe(1);
  expect(crashes, 'the screen crashed').toEqual([]);
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
