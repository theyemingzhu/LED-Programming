import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { installHttpsStudio, installPracticeCardPopup, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { CARD_HOSTS } from './harness/cardSimulator';
import { cardState, MATRIX_BUILD_ID, MATRIX_CARD_ID, MATRIX_FIRMWARE_VERSION, MATRIX_HOST } from './harness/cardStates';
import { createPracticeCard } from './harness/practiceTiming';
import { isLoopbackHost, isPrivateHost } from './harness/networkGuard';

test.use({ viewport: { width: 1440, height: 1000 } });

const setup = `${STUDIO_ORIGIN}/#screen=card&section=setup`;
const connected = /^connected-(direct|bridge)$/;

async function blockUnmodelledLan(page: Page) {
  // The repo's launch proxy is the final guard. Intercept unmodelled LAN in
  // this context as well, including a popup's first request (page.route alone
  // never sees it). The simulator's narrower routes are added afterwards.
  await page.context().route(url => isPrivateHost(url.hostname) && !isLoopbackHost(url.hostname), route => route.abort('connectionrefused'));
}

function realCard(state: 'playing' | 'factory-blank', cardId = MATRIX_CARD_ID) {
  return createPracticeCard(cardState(state), {
    timing: 'real', cardId,
    overrides: { spontaneousSilence: null, unsettledAfterRestart: null },
  });
}

async function startStudio(page: Page, baseURL: string, paired: boolean, address = '') {
  await installHttpsStudio(page, baseURL);
  await page.addInitScript(({ paired, id, firmwareVersion, buildId, host, address }) => {
    if (paired) {
      localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId, hostname: host, address }));
      localStorage.setItem('lw_chip_card_host', host);
    }
    const clicks: { at: number; name: string }[] = [];
    Object.defineProperty(window, '__firstConnectClicks', { value: clicks });
    document.addEventListener('click', event => {
      const control = (event.target as Element)?.closest('button, a, [role=button]');
      if (event.isTrusted && control) {
        clicks.push({ at: Date.now(), name: (control.getAttribute('aria-label') || control.textContent || '').trim() });
      }
    }, true);
  }, { paired, id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: MATRIX_HOST, address });
  await page.goto(setup, { waitUntil: 'domcontentloaded' });
}

function evidence(page: Page) {
  return page.evaluate(() => ({
    clicks: (window as Window & { __firstConnectClicks?: { at: number; name: string }[] }).__firstConnectClicks || [],
    journal: JSON.parse(localStorage.getItem('lw_card_link_journal_v1') || '[]') as { at: string; state?: string; transport?: string; reason?: string }[],
    identity: JSON.parse(localStorage.getItem('lw_card_identity_v1') || 'null') as { id: string; acknowledgedAt?: string } | null,
  }));
}

function connectionEvidence(snapshot: Awaited<ReturnType<typeof evidence>>, action = 0) {
  return snapshot.journal.find(entry => connected.test(entry.state || '') && Date.parse(entry.at) >= (snapshot.clicks[action]?.at || Infinity));
}

test('keyboard focus follows Find and Pair and Escape returns to the current setup action', async ({ page, baseURL }) => {
  await blockUnmodelledLan(page);
  const { card } = realCard('playing');
  await card.install(page);
  let wifiAvailable = false;
  for (const host of CARD_HOSTS) {
    await page.route(`http://${host}/api/status`, route => wifiAvailable ? route.fallback() : route.abort('connectionrefused'));
  }
  await startStudio(page, baseURL!, false);
  const opener = page.getByTestId('setup-connect-card');
  await opener.focus();
  const originalOpener = await opener.elementHandle();
  await page.keyboard.press('Enter');
  const dialog = connectPanel(page);
  await expect(dialog).toBeFocused();
  await expect(dialog).toHaveAttribute('aria-modal', 'false');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const outside = await page.evaluateHandle(() => document.activeElement);
  expect(await outside.evaluate(element => element !== document.body && !element?.closest('#card-connection-center'))).toBe(true);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await outside.evaluate(element => element === document.activeElement)).toBe(true);
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeFocused();
  const find = dialog.getByRole('button', { name: 'Find card already on Wi-Fi', exact: true });
  for (let index = 0; index < 4; index += 1) await page.keyboard.press('Tab');
  await expect(find).toBeFocused();
  wifiAvailable = true;
  await page.keyboard.press('Enter');
  const pair = dialog.getByRole('button', { name: 'Connect this card', exact: true });
  await expect(pair).toBeFocused();
  await page.keyboard.press('Enter');
  const next = dialog.getByRole('button', { name: /^(Done|Continue in Setup)$/ });
  await expect(next).toBeFocused();
  expect(await originalOpener.evaluate(element => element.isConnected)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('installed-control-open')).toBeFocused();
});

async function saveEvidence(page: Page, info: TestInfo, observed: object, searchAction = 0, label = 'end') {
  const snapshot = await evidence(page);
  const established = connectionEvidence(snapshot, searchAction);
  const pairAt = snapshot.clicks.find(click => click.name === 'Connect this card')?.at;
  const summary = {
    ...observed,
    viewport: page.viewportSize(),
    searchGestures: snapshot.clicks.filter(click => /^(find|reconnect|try again|retry)/i.test(click.name)).length,
    pairingGestures: pairAt ? 1 : 0,
    actions: snapshot.clicks.map(click => click.name),
    connectionMs: established ? Date.parse(established.at) - snapshot.clicks[searchAction].at : null,
    pairingMs: established && pairAt ? Date.parse(established.at) - pairAt : null,
    transport: established?.transport || null,
    identity: snapshot.identity?.id || null,
    journal: snapshot.journal,
  };
  const body = JSON.stringify(summary, null, 2);
  console.log(`[first-connect] ${info.title}: ${JSON.stringify({ ...summary, journal: undefined })}`);
  const path = info.outputPath(`connection-${label}.png`);
  const evidencePath = info.outputPath(`connection-${label}.json`);
  await page.screenshot({ path });
  await writeFile(evidencePath, `${body}\n`);
  await info.attach(`connection-${label}-evidence`, { path: evidencePath, contentType: 'application/json' });
  await info.attach(`connection-${label}-screen`, { path, contentType: 'image/png' });
}

test('paired card returning from Wi-Fi connects after the first failed probe with one Find action', async ({ page, baseURL }, info) => {
  test.setTimeout(65_000);
  await blockUnmodelledLan(page);
  const { card, timing } = realCard('playing');
  await card.install(page);
  const directRequests: { at: number; host: string; outcome: string }[] = [];
  let startedAt = Infinity;
  for (const host of CARD_HOSTS) {
    await page.route(`http://${host}/api/status`, async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      if (Date.now() < startedAt) return route.abort('connectionrefused');
      const verdict = timing.verdict('GET', '/api/status');
      const outcome = verdict.kind === 'drop' ? 'no reply' : 'available';
      directRequests.push({ at: Date.now() - startedAt, host, outcome });
      if (verdict.kind === 'drop') return route.abort('connectionrefused');
      return route.fallback();
    });
  }
  const bridge = await installPracticeCardPopup(page, card, { hosts: CARD_HOSTS, shouldServe: () => false });
  await startStudio(page, baseURL!, true);
  const find = page.getByTestId('setup-connect-card');
  await expect(find).toHaveAccessibleName(/Find my card|Reconnect this card/i);
  const handoffMs = timing.profile.wifiReconnectGapMs + 5_000;
  startedAt = Date.now();
  timing.wifiDrop(handoffMs);
  try {
    await find.click();
    await expect.poll(() => directRequests.some(request => request.outcome === 'no reply'), { timeout: 10_000 }).toBe(true);
    await expect(find).toBeDisabled();
    await expect(page.getByRole('button', { name: /Try again|Check again|Retry/i })).toHaveCount(0);
    await expect.poll(async () => connectionEvidence(await evidence(page))?.state, { timeout: 43_000 }).toBe('connected-direct');
    const snapshot = await evidence(page);
    const elapsed = Date.parse(connectionEvidence(snapshot)!.at) - snapshot.clicks[0].at;
    expect(elapsed).toBeGreaterThan(handoffMs - 500);
    expect(elapsed).toBeLessThan(43_000);
    expect(directRequests.some(request => request.at >= handoffMs && request.outcome === 'available')).toBe(true);
    expect(bridge.navigations.some(navigation => !navigation.served)).toBe(true);
    await expect(page.getByTestId('setup-identity-connection')).toContainText('Connected');
    expect(snapshot.clicks.map(click => click.name)).toEqual([expect.stringMatching(/Find my card|Reconnect this card/i)]);
    expect(snapshot.identity?.id).toBe(MATRIX_CARD_ID);
    expect(card.state.currentId).toBe('fire');
    expect(card.requests.filter(request => request.method !== 'GET' && request.method !== 'OPTIONS')).toEqual([]);
  } finally {
    await saveEvidence(page, info, { handoffMs, directRequests, bridgeNavigations: bridge.navigations });
  }
});

async function refuseDirect(page: Page) {
  const requests: { at: number; host: string; method: string }[] = [];
  for (const scheme of ['http', 'https']) {
    for (const host of CARD_HOSTS) {
      await page.route(`${scheme}://${host}/api/**`, route => {
        requests.push({ at: Date.now(), host, method: route.request().method() });
        return route.abort('connectionrefused');
      });
    }
  }
  return requests;
}

const connectPanel = (page: Page) => page.getByRole('dialog', { name: 'Connect Lightweaver', exact: true });

test.describe('phone', () => {
  test.use({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36',
  });

  test('a new card uses its page after a failed direct route and waits for explicit pairing', async ({ page, baseURL }, info) => {
    test.setTimeout(80_000);
    await blockUnmodelledLan(page);
    const { card } = realCard('factory-blank');
    const direct = await refuseDirect(page);
    const openedTabs: Page[] = [];
    page.context().on('page', tab => openedTabs.push(tab));
    const bridge = await installPracticeCardPopup(page, card, {
      hosts: CARD_HOSTS,
      // The network refuses the first card page as it comes back. Navigating
      // the same tab again is automatic and preserves the owner's one gesture.
      shouldServe: ({ attempt }) => attempt > 1,
    });
    await startStudio(page, baseURL!, false);
    const setupEntry = page.getByTestId('setup-connect-card');
    await expect(setupEntry).toHaveAccessibleName('Set up this card');
    await setupEntry.tap();
    const search = connectPanel(page).getByRole('button', { name: 'Find card already on Wi-Fi', exact: true });
    await expect(search).toBeVisible();
    const start = Date.now();
    try {
      await search.tap();
      await expect.poll(() => direct.some(request => request.at >= start && request.method === 'GET'), { timeout: 10_000 }).toBe(true);
      await expect.poll(() => bridge.navigations.some(navigation => navigation.served), { timeout: 40_000 }).toBe(true);
      expect(bridge.navigations[0].served).toBe(false);
      expect(bridge.navigations.every(navigation => navigation.host === MATRIX_HOST)).toBe(true);
      expect(openedTabs).toHaveLength(1);
      await expect.poll(() => bridge.relays.some(relay => relay.type === 'status'), { timeout: 12_000 }).toBe(true);
      const pair = connectPanel(page).getByRole('button', { name: 'Connect this card', exact: true });
      await expect(pair).toBeVisible({ timeout: 12_000 });
      const pairing = connectPanel(page).locator('[data-action-id="pair-local-card"]');
      await expect(pairing.getByText(MATRIX_CARD_ID, { exact: true })).toBeVisible({ timeout: 2_000 });
      await expect(pairing).toContainText(MATRIX_HOST);
      const before = await evidence(page);
      expect(before.identity).toBeNull();
      expect(connectionEvidence(before, 1)).toBeUndefined();
      expect(before.clicks.map(click => click.name)).toEqual(['Set up this card', 'Find card already on Wi-Fi']);
      expect(card.requests.filter(request => request.method !== 'GET' && request.method !== 'OPTIONS')).toEqual([]);
      await saveEvidence(page, info, { stage: 'ready to pair', directRequests: direct.length, bridge }, 1, 'before-pair');
      await pair.tap();
      await expect.poll(async () => connectionEvidence(await evidence(page), 1)?.state, { timeout: 15_000 }).toBe('connected-bridge');
      await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-task', 'discover-lights');
      await expect(page.getByTestId('setup-lights-action')).toBeEnabled();
      const after = await evidence(page);
      expect(after.identity?.id).toBe(MATRIX_CARD_ID);
      expect(after.clicks.map(click => click.name)).toEqual(['Set up this card', 'Find card already on Wi-Fi', 'Connect this card']);
      expect(card.requests.filter(request => request.method !== 'GET' && request.method !== 'OPTIONS')).toEqual([]);
      expect(direct.filter(request => request.method !== 'GET' && request.method !== 'OPTIONS')).toEqual([]);
    } finally {
      await saveEvidence(page, info, { stage: 'end', directRequests: direct.length, bridge }, 1);
    }
  });
});

test('a different card at the remembered address cannot replace the paired card', async ({ page, baseURL }, info) => {
  await blockUnmodelledLan(page);
  const wrongId = 'lw-000000000099';
  const { card } = realCard('playing', wrongId);
  card.goOffline();
  await card.install(page);
  const bridge = await installPracticeCardPopup(page, card, { hosts: CARD_HOSTS });
  await startStudio(page, baseURL!, true);
  const find = page.getByTestId('setup-connect-card');
  await expect(find).toHaveAccessibleName(/Find my card|Reconnect this card/i);
  await page.clock.install();
  try {
    await find.click();
    card.goOnline();
    const wrong = page.getByTestId('setup-pair-failure').filter({ hasText: /Wrong card: expected .*but found/i });
    await expect.poll(() => card.requests.some(request => request.method === 'GET')).toBe(true);
    for (let tick = 0; tick < 17 && !(await wrong.isVisible()); tick++) {
      await advanceSearchClock(page, 15_000);
    }
    await expect(wrong).toContainText(wrongId);
    await expect(wrong).toContainText(MATRIX_CARD_ID);
    const snapshot = await evidence(page);
    expect(snapshot.identity?.id).toBe(MATRIX_CARD_ID);
    expect(connectionEvidence(snapshot)).toBeUndefined();
    expect(snapshot.clicks).toHaveLength(1);
    expect(card.requests.filter(request => request.method !== 'GET' && request.method !== 'OPTIONS')).toEqual([]);
  } finally {
    await saveEvidence(page, info, { clock: 'controlled', wrongId, bridge, cardReads: card.requests.filter(request => request.method === 'GET').length });
  }
});

test('unreachable card stops looking and offers recovery after one search', async ({ page, baseURL }, info) => {
  await blockUnmodelledLan(page);
  const { card } = realCard('factory-blank');
  const direct = await refuseDirect(page);
  const bridge = await installPracticeCardPopup(page, card, { hosts: CARD_HOSTS, shouldServe: () => false });
  await startStudio(page, baseURL!, false);
  await page.getByTestId('setup-connect-card').click();
  const search = connectPanel(page).getByRole('button', { name: 'Find card already on Wi-Fi', exact: true });
  await expect(search).toBeVisible();
  await page.clock.install();
  const start = Date.now();
  let elapsedMs = 0;
  try {
    await search.click();
    const recovery = connectPanel(page).getByRole('button', { name: /Try again|Check again|Retry/i }).filter({ visible: true }).first();
    await expect.poll(() => direct.some(request => request.at >= start && request.method === 'GET'), { timeout: 8_000 }).toBe(true);
    for (let tick = 0; tick < 12 && !(await recovery.isVisible()); tick++) {
      await advanceSearchClock(page, 5_000);
    }
    await expect(recovery).toBeEnabled({ timeout: 5_000 });
    await expect(connectPanel(page).getByText(/check.*(Wi-Fi|power)|card not found|no reply|couldn.t reach/i).filter({ visible: true }).first()).toBeVisible();
    const snapshot = await evidence(page);
    elapsedMs = await page.evaluate(() => Date.now()) - snapshot.clicks[1].at;
    expect(elapsedMs).toBeGreaterThan(15_000);
    expect(elapsedMs).toBeLessThan(65_000);
    expect(snapshot.clicks.map(click => click.name)).toEqual(['Set up this card', 'Find card already on Wi-Fi']);
    expect(snapshot.identity).toBeNull();
    expect(connectionEvidence(snapshot, 1)).toBeUndefined();
    await page.clock.fastForward(15_000);
    const count = direct.length + bridge.navigations.length;
    await page.clock.fastForward(30_000);
    expect(direct.length + bridge.navigations.length, 'finished search has no active retry loop').toBe(count);
  } finally {
    await saveEvidence(page, info, { clock: 'controlled', elapsedMs, directRequests: direct.length, bridge }, 1);
  }
});

async function advanceSearchClock(page: Page, ms: number) {
  await page.clock.fastForward(ms);
  // Browser timers next run after intercepted network callbacks can settle.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
}

test('a remembered address stays in the same search through a late Wi-Fi handoff', async ({ page, baseURL }, info) => {
  await blockUnmodelledLan(page);
  const { card } = realCard('playing');
  const wrongId = 'lw-000000000099';
  const { card: stale } = realCard('playing', wrongId);
  // A stale hostname already answers as a different card. Only the remembered
  // station IP becomes reachable for the exact card, past the ordinary window.
  const address = '192.168.18.70';
  const bridge = await installPracticeCardPopup(page, card, { hosts: CARD_HOSTS, shouldServe: () => false });
  await card.install(page);
  const wrongReplies: number[] = [];
  await page.route(`http://${MATRIX_HOST}/api/status`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const relay = await stale.relayBridge('status', {});
    wrongReplies.push(Date.now());
    return route.fulfill({ json: relay.response, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.route('http://192.168.4.1/api/status', route => route.abort('connectionrefused'));
  card.goOffline();
  await startStudio(page, baseURL!, true, address);
  const find = page.getByTestId('setup-connect-card');
  await expect(find).toHaveAccessibleName(/Find my card|Reconnect this card/i);
  await page.clock.install();
  const lateHandoffMs = 55_000;
  let cardAvailableAt = 0;
  const start = Date.now();
  try {
    await find.click();
    await expect.poll(() => wrongReplies.some(at => at >= start)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    for (let elapsed = 0; elapsed < lateHandoffMs; elapsed += 5_000) {
      await advanceSearchClock(page, 5_000);
    }
    const waiting = await evidence(page);
    expect(connectionEvidence(waiting)).toBeUndefined();
    expect(waiting.identity?.id).toBe(MATRIX_CARD_ID);
    await expect(find).toBeDisabled();
    await expect(page.getByRole('button', { name: /Try again|Check again|Retry/i })).toHaveCount(0);
    cardAvailableAt = await page.evaluate(() => Date.now());
    card.goOnline();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => connectionEvidence(await evidence(page))?.state, { timeout: 8_000 }).toBe('connected-direct');
    const after = await evidence(page);
    expect(Date.parse(connectionEvidence(after)!.at)).toBeGreaterThanOrEqual(cardAvailableAt);
    expect(after.clicks).toHaveLength(1);
    expect(after.identity?.id).toBe(MATRIX_CARD_ID);
    expect(card.requests.filter(request => request.method !== 'GET' && request.method !== 'OPTIONS')).toEqual([]);
  } finally {
    await saveEvidence(page, info, { clock: 'controlled', lateHandoffMs, bridgeNavigations: bridge.navigations, cardAvailableAt, wrongId, wrongReplies: wrongReplies.length });
  }
});

async function installFindCardHarness(page: Page) {
  await page.addInitScript(() => {
    const state = {
      opens: [] as Array<{ url: string; name: string; features: string }>,
      captureSweep: false,
      sweepStarted: false,
    };
    Object.defineProperty(window, '__findCardHarness', { value: state, configurable: true });
    window.open = ((url?: string | URL, name?: string, features?: string) => {
      state.opens.push({
        url: String(url || ''),
        name: String(name || ''),
        features: String(features || ''),
      });
      return null;
    }) as typeof window.open;

    const realFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!/^http:\/\/192\.168\.77\.\d+\/api\/status$/.test(url)) return realFetch(input, init);
      if (!state.captureSweep) {
        return Promise.resolve(new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
      }
      if (!url.includes('192.168.77.1/api/status')) state.sweepStarted = true;
      return Promise.resolve(new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }) as typeof window.fetch;
  });

  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: 'lw-find-card', firmwareVersion: '1.4.0', buildId: 'a'.repeat(40),
      address: '192.168.77.1',
    }));
    localStorage.setItem('lw_chip_card_host', '192.168.77.1');
    localStorage.setItem('lw_chip_card_host_history', JSON.stringify(['192.168.77.1']));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { (window as any).__findCardHarness.captureSweep = true; });
}

// The button says "Find my card", so pressing it must LOOK for the card. It
// used to open the connect panel without trying anything, and that panel's
// first move was to ask the owner what colour the LEDs were — on a screen
// already displaying the card's address. Reported as the button doing nothing.
//
// What must NOT come back: launching a card-page window uninvited while a
// direct route is still available. That stays asserted below.
test('Find my card searches the remembered subnet before showing connection options', async ({ page }) => {
  await installFindCardHarness(page);
  await page.clock.install();
  const find = page.getByTestId('setup-connect-card');
  await find.click();
  const dialog = connectPanel(page);
  await expect(find).toBeDisabled();
  await expect(dialog).toBeHidden();
  await advanceSearchClock(page, 7_000);

  // A real search ran — including across the addresses this card has answered
  // on before, which is the recovery for a card the router has moved.
  await expect
    .poll(() => page.evaluate(() => (window as any).__findCardHarness.sweepStarted), { timeout: 20000 })
    .toBe(true);

  // Nothing answered, so the recovery control becomes available in Setup.
  await advanceSearchClock(page, 240_000);
  await expect(page.getByTestId('setup-pair-failure')).toContainText('No reply from the card');
  await expect(page.getByTestId('setup-connect-manual')).toBeVisible();
  await expect(dialog).toBeHidden();
  // The blocked reservation must not cause a second unprompted popup attempt.
  expect(await page.evaluate(() => (window as any).__findCardHarness.opens.map(open => open.url))).toEqual(['']);
});

test('public Find my card keeps USB recovery if the browser blocks the card page', async ({ page, baseURL }) => {
  await page.route('https://led.mandalacodes.com/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: 'lw-find-card', firmwareVersion: '1.4.0', buildId: 'a'.repeat(40),
      hostname: 'lightweaver.local',
    }));
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {} });
    (window as any).__cardPopups = [];
    window.open = ((url?: string | URL) => {
      (window as any).__cardPopups.push(String(url || ''));
      return null;
    }) as typeof window.open;
  });
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
  await page.goto('https://led.mandalacodes.com/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.clock.install();
  const find = page.getByTestId('setup-connect-card');
  await find.click();
  const dialog = connectPanel(page);
  await expect(find).toBeDisabled();
  await expect(dialog).toBeHidden();
  await advanceSearchClock(page, 245_000);
  await expect(page.getByTestId('setup-pair-failure')).toContainText('No reply from the card');
  await page.getByTestId('setup-connect-manual').click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => (window as any).__cardPopups)).toEqual(['']);
  await expect(dialog.getByRole('button', { name: 'Inspect card over USB', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Inspect card over USB', exact: true }).click();
  await expect(page).toHaveURL(/screen=flash&mode=install/);
  await expect(dialog).not.toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('closing connection options cancels the attempt while its card page is still unverified', async ({ page, baseURL }) => {
  await blockUnmodelledLan(page);
  const { card } = realCard('playing');
  const direct = await refuseDirect(page);
  const bridge = await installPracticeCardPopup(page, card, { hosts: CARD_HOSTS, shouldServe: () => false });
  await startStudio(page, baseURL!, true);
  await page.getByTestId('card-link-status').click();
  const dialog = connectPanel(page);
  await dialog.locator('summary').click();
  await page.clock.install();
  const opened = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Connect through the card’s own page (fallback)' }).click();
  const popup = await opened;
  await expect.poll(() => bridge.navigations.length).toBe(1);
  await dialog.getByRole('button', { name: 'Close connection center' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await advanceSearchClock(page, 15_000);
  const reads = direct.length;
  await advanceSearchClock(page, 15_000);
  expect(direct).toHaveLength(reads);
  expect(bridge.navigations).toHaveLength(1);
  const after = await evidence(page);
  expect(after.identity?.id).toBe(MATRIX_CARD_ID);
  expect(connectionEvidence(after)).toBeUndefined();
  expect(card.requests).toEqual([]);
});
