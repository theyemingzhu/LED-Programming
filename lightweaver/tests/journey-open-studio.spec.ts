// F24 — the Studio side of "Edit in Studio" without a reload.
//
// Today the card's own page, when opened as Studio's bridge pop-up, hands an
// edit request back by assigning `opener.location.href = <studio url>` —
// firmware/lightweaver-controller/src/LightweaverWeb.cpp ~262-277 — which
// reloads the opener tab and loses every bit of its in-memory state (bench
// defect F18; the Studio side of that reload landed in #237). The next
// firmware instead posts an 'open-studio' message to `window.opener` and
// expects THIS tab to apply the intent in place: move the hash — the URL
// hash is the only store of the current screen, src/lib/studioRoute.js — and
// record the edit request the way the URL-boot path already does
// (cardEditIntent.js), all without ever assigning `location.href`. See
// src/lib/cardBridge.js's `applyOpenStudioBridgeMessage` for the handler this
// file proves.
//
// The bench card stays on firmware 1548 (bridgeVersion 6) until Adrian
// authorises a release, so nothing here needs real firmware — the fake
// bridge (installFakeCardBridge, from tests/harness/bridgeTransport.ts, the
// same one card-state-matrix.spec.ts's Tier 2 block and
// journey-direct-preview.spec.ts already use) stands in for the card's own
// popup and posts the message by hand.
//
// Card Home's own resolution effect (src/v3/lw-card.jsx, the one the F18
// entries in THINKING.md describe) keeps running in the background
// regardless of which top-level screen is on top — it reacts to
// `cardEditIntent()` the moment this handler writes it, authorizes the exact
// match, and Patterns' own pre-existing `cardReturnConsumed` effect
// (lw-pattern.jsx) claims it on its next poll-driven re-render. So a project
// that genuinely matches the card ends up in Patterns' AUTHORIZED "selected"
// branch here — the tile's `aria-pressed` really does flip true — even
// though this handler itself never touches authorization, adoption, or
// Patterns at all; it only writes the intent and moves the hash. That
// end-to-end chain (card→Studio adoption, the authorization gate itself) is
// what tests/journey-edit-intent.spec.ts and tests/card-edit-handoff.spec.ts
// already prove for both the authorized and refused outcomes. What is new
// here — and what neither of those files touches — is the BRIDGE message
// itself: that it only ever comes from the exact tracked popup at the exact
// card origin, that it moves the intent and the hash without a page reload,
// and that Patterns' existing intent consumption picks the result up
// unmodified.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  MATRIX_HOST,
} from './harness/cardStates';
import { installHttpsStudio, installFakeCardBridge, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';

const PROJECT_ID = 'lwproj-open-studio-piece';

// Mirrors card-state-matrix.spec.ts's `linkState` / `settlesConnected` and
// journey-direct-preview.spec.ts's copy of the same pair — duplicated rather
// than imported, per this suite's own convention (neither file exports
// either).
const CONNECT_BUDGET_MS = 15000;
const CONNECTED = /^connected-(direct|bridge)$/;

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

async function currentHash(page: Page): Promise<string> {
  return page.evaluate(() => window.location.hash);
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
 * card-state-matrix.spec.ts's own bridge cell (`[T2] ... connects, unaided`)
 * does not actually assert zero clicks — `bootstrapCardLink`'s auto-reconnect
 * is gated on a "bridge was active last session" flag
 * (readBridgeWasActive in src/lib/cardLink.js) that a brand-new browser
 * context has never set, so the FIRST bridge connection in a fresh context
 * always needs the one-click "Connect" affordance every screen's footer chip
 * carries (`card-link-status`). Copied from that file's `expectConnects`
 * rather than imported, per this suite's convention.
 */
async function connectOverBridge(page: Page) {
  if (await settlesConnected(page, CONNECT_BUDGET_MS)) return;
  const setupConnect = page.getByTestId('setup-connect-card');
  const footerChip = page.getByTestId('card-link-status');
  const target = (await setupConnect.count()) ? setupConnect : footerChip;
  await target.first().click();
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toMatch(CONNECTED);
}

/**
 * Registered AFTER `installFakeCardBridge` so it wraps that fixture's own
 * fake-tab-returning `window.open` instead of being clobbered by it (both
 * are addInitScripts; they apply in registration order — the same technique
 * journey-direct-preview.spec.ts's `countWindowOpen` uses). Captures the
 * exact WindowProxy cardBridge.js will track as `bridgeWindow`, so a test can
 * later impersonate that popup — or, deliberately, something else — when
 * posting the 'open-studio' message by hand. Also wraps `window.focus` so a
 * test can prove THIS tab, not the card tab, was refocused.
 */
async function installOpenStudioEmitter(page: Page, host: string) {
  await page.addInitScript(({ cardHost }) => {
    const origin = `http://${cardHost}`;
    const originalOpen = window.open?.bind(window);
    let capturedTab: WindowProxy | Record<string, unknown> | null = null;
    window.open = ((...args: Parameters<typeof window.open>) => {
      const result = originalOpen ? originalOpen(...args) : null;
      capturedTab = result as WindowProxy | Record<string, unknown> | null;
      return result;
    }) as typeof window.open;

    const originalFocus = window.focus?.bind(window);
    (window as unknown as { __lwFocusCalls: number }).__lwFocusCalls = 0;
    window.focus = ((...args: Parameters<typeof window.focus>) => {
      (window as unknown as { __lwFocusCalls: number }).__lwFocusCalls += 1;
      return originalFocus ? originalFocus(...args) : undefined;
    }) as typeof window.focus;

    // `opts.source` false impersonates a window that is NOT the tracked
    // bridge tab; `opts.origin` overrides the event's reported origin. Both
    // exist only so this one emitter can also drive the two "ignored"
    // scenarios from the browser, not just the node unit tests.
    (window as unknown as {
      __lwEmitOpenStudio: (payload?: Record<string, unknown>, opts?: { fromTrackedTab?: boolean; origin?: string }) => boolean;
    }).__lwEmitOpenStudio = (payload = {}, opts = {}) => {
      const fromTrackedTab = opts.fromTrackedTab !== false;
      if (fromTrackedTab && !capturedTab) return false;
      const source = fromTrackedTab ? capturedTab : {};
      const eventOrigin = typeof opts.origin === 'string' ? opts.origin : origin;
      const data = { app: 'LightweaverCardBridge', type: 'open-studio', version: 7, ...payload };
      const event = new Event('message');
      Object.defineProperties(event, {
        data: { value: data },
        origin: { value: eventOrigin },
        source: { value: source },
      });
      window.dispatchEvent(event);
      return true;
    };
  }, { cardHost: host });
}

async function focusCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __lwFocusCalls?: number }).__lwFocusCalls || 0);
}

test('[J24-open-studio] a verified open-studio bridge message applies the intent on Patterns without reloading the tab', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(String(error.message)));

  // A card holding a project by the exact id Studio has open, reached over
  // the bridge — Card Home's own resolution run (background, unmodified by
  // this change — see this file's header) resolves this as an exact
  // "current project" match and authorizes it the moment the intent this
  // handler writes names a real pattern.
  const spec = {
    ...cardState('installed-match'),
    id: 'open-studio-happy',
    describe: 'a card holding a project by the same id Studio has open, reached over the bridge',
    projectId: PROJECT_ID,
    projectName: 'Open Studio piece',
  };
  const card = createCardSimulator(spec);

  await installHttpsStudio(page, testBaseURL);
  await installFakeCardBridge(page, card, MATRIX_HOST);
  await installOpenStudioEmitter(page, MATRIX_HOST);

  // Boot bare, then seed a project by the SAME id the simulated card
  // reports, plus the remembered-card identity that makes Studio dial the
  // bridge on its own — the same recipe card-edit-handoff.spec.ts's
  // seedCard() uses (via the app's own createDefaultProject, not a
  // hand-authored shape: journey-edit-intent.spec.ts's header explains why a
  // hand-authored project is silently discarded by migrateProject and
  // replaced with a fresh, randomly-id'd one, which would break the
  // project-id match this test depends on).
  await page.goto(`${STUDIO_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ id, cardId, firmwareVersion, buildId, host }) => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.id = id;
    project.name = 'Open Studio piece';
    project.layout.starterPending = false;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_autosave_v3_backup', JSON.stringify(project));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', host);
    localStorage.setItem('lw_chip_card_host', host);
  }, { id: PROJECT_ID, cardId: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: MATRIX_HOST });

  // Connect from Card Home first — Patterns' own screen carries no
  // "setup-connect-card" affordance, only the footer status chip, and that
  // chip only OPENS the connection center panel (CardStatusControl.jsx's
  // onOpen) rather than connecting by itself, so `connectOverBridge`'s
  // one-click fallback cannot settle a fresh bridge connection from there.
  // Land on Card Home, connect for real, THEN move to Patterns — a plain
  // hash assignment, the same in-app navigation any screen already does —
  // arriving at the ticket's own scenario: "verified bridge on Patterns".
  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=overview`, { waitUntil: 'domcontentloaded' });
  await connectOverBridge(page);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await expect.poll(() => currentHash(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toMatch(/^#screen=pattern/);

  // Set AFTER the connection settles (the marker must survive everything
  // that follows, not everything the initial boot itself does).
  await page.evaluate(() => { (window as unknown as { __lwNoReloadMarker: number }).__lwNoReloadMarker = 918274; });

  const dispatched = await page.evaluate(payload => (
    (window as unknown as { __lwEmitOpenStudio: (p: Record<string, unknown>) => boolean }).__lwEmitOpenStudio(payload)
  ), { editPattern: 'aurora', editLook: '' });
  expect(dispatched, 'the fake bridge tab must have been captured by window.open before dispatch').toBe(true);

  await expect.poll(() => currentHash(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toMatch(/^#screen=pattern/);
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get('editPattern')), {
    timeout: CONNECT_BUDGET_MS, intervals: [250],
  }).toBe('aurora');

  // Patterns' own existing intent consumption (cardReturnConsumed) took over
  // from here — unmodified by this change. Card Home's background
  // resolution effect (still running, unmounted from view but not from the
  // tree — see this file's header) authorizes the exact match the moment it
  // observes the intent this handler wrote, and Patterns claims it on its
  // next poll-driven re-render: the tile is selected, not merely offered.
  const tile = page.locator('.pm-cards .pmcard[data-pattern-id="aurora"]');
  await expect(tile).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(tile).toHaveAttribute('aria-pressed', 'true', { timeout: CONNECT_BUDGET_MS });
  await expect(page).toHaveURL(/#screen=pattern/);

  expect(
    await page.evaluate(() => (window as unknown as { __lwNoReloadMarker?: number }).__lwNoReloadMarker),
    'a page reload would have wiped this in-memory marker — the exact defect this handler exists to prevent',
  ).toBe(918274);
  expect(await focusCalls(page), 'this Studio tab must have been refocused').toBeGreaterThanOrEqual(1);
  expect(crashes, 'the screen crashed').toEqual([]);
});

test('[J24-open-studio-ignored] an open-studio message from a window other than the tracked bridge is ignored', async ({ page }) => {
  const spec = {
    ...cardState('installed-match'),
    id: 'open-studio-impostor',
    describe: 'a card holding a project by the same id Studio has open, reached over the bridge',
    projectId: PROJECT_ID,
    projectName: 'Open Studio piece',
  };
  const card = createCardSimulator(spec);

  await installHttpsStudio(page, testBaseURL);
  await installFakeCardBridge(page, card, MATRIX_HOST);
  await installOpenStudioEmitter(page, MATRIX_HOST);

  await page.goto(`${STUDIO_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ id, cardId, firmwareVersion, buildId, host }) => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.id = id;
    project.name = 'Open Studio piece';
    project.layout.starterPending = false;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_autosave_v3_backup', JSON.stringify(project));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', host);
    localStorage.setItem('lw_chip_card_host', host);
  }, { id: PROJECT_ID, cardId: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: MATRIX_HOST });

  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=overview`, { waitUntil: 'domcontentloaded' });
  await connectOverBridge(page);

  const beforeHash = await currentHash(page);

  await page.evaluate(payload => (
    (window as unknown as { __lwEmitOpenStudio: (p: Record<string, unknown>, o: Record<string, unknown>) => boolean }).__lwEmitOpenStudio(payload, { fromTrackedTab: false })
  ), { editPattern: 'aurora', editLook: '' });

  // No poll here on purpose: there is nothing to wait FOR. A short settle is
  // enough to prove an ignored message never eventually lands, either.
  await page.waitForTimeout(500);
  expect(await currentHash(page), 'an untracked source must not move the screen').toBe(beforeHash);
  expect(await page.evaluate(() => new URL(window.location.href).searchParams.get('editPattern'))).toBeNull();
});
