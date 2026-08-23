// TIER 4 — the same three assertions, against the real card. Bench only.
//
//   npm run test:matrix:live      (card powered and on the LAN)
//
// NOT part of CI, and deliberately NON-DESTRUCTIVE: it puts the card into
// states by changing what is PLAYING, never by clearing the project or staging
// wiring. Adrian's gallery card is the only one, and a suite that wipes it to
// prove a point is worse than no suite.
//
// The simulated matrix (tests/card-state-matrix.spec.ts) is the one that runs
// on every change. This exists to catch the gap between a faithful simulator
// and the real firmware — the gap a simulator, by construction, cannot see.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const HOST = '192.168.18.70';
const CARD_ID = 'lw-b0fe81f61b44';

test.setTimeout(180000);
test.describe.configure({ mode: 'serial' });

type CardStatus = Record<string, unknown>;

async function cardGet(path: string): Promise<CardStatus> {
  const response = await fetch(`http://${HOST}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json() as Promise<CardStatus>;
}

async function cardPost(path: string, body: unknown): Promise<CardStatus> {
  const response = await fetch(`http://${HOST}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<CardStatus>;
}

/** What the card says it is playing, from its own status. */
async function playingOnCard(): Promise<string> {
  const status = await cardGet('/api/status');
  return String(status.currentPatternId || status.currentLookId || '');
}

async function firstCardPatternId(): Promise<string> {
  const payload = await cardGet('/api/patterns') as { patterns?: { id: string }[] };
  const first = (payload.patterns || [])[0];
  if (!first) throw new Error('the card reports no patterns — install a project on it first');
  return first.id;
}

async function darkenCard() {
  await cardPost('/api/control', { cancelStream: true, blackout: true, patternId: 'blackout', brightness: 0 });
}

async function seedStudio(page: Page) {
  const status = await cardGet('/api/status');
  await page.addInitScript((seed) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: seed.id, firmwareVersion: seed.firmwareVersion, buildId: seed.buildId,
    }));
    localStorage.setItem('lw_card_host', seed.host);
    localStorage.setItem('lw_chip_card_host', seed.host);
  }, {
    id: CARD_ID,
    host: HOST,
    firmwareVersion: String(status.firmwareVersion || ''),
    buildId: String(status.buildId || ''),
  });
}

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const cardLink = await import('/src/lib/cardLink.js');
    return String(cardLink.getSharedCardLink().getState()?.state || '');
  });
}

async function visibleAlerts(page: Page): Promise<string[]> {
  const raised: string[] = [];
  for (const alert of await page.getByRole('alert').all()) {
    if (await alert.isVisible()) raised.push(((await alert.textContent()) || '').trim().slice(0, 120));
  }
  return raised;
}

// The root Playwright config has no testMatch, so a bare `playwright test`
// picks this file up. Skipping when the card is not answering keeps that from
// reporting hardware failures on a machine with no hardware.
test.beforeAll(async () => {
  const reachable = await cardGet('/api/status').then(() => true, () => false);
  test.skip(!reachable, `no Lightweaver card answering at ${HOST} — bench-only suite`);
  const status = await cardGet('/api/status');
  expect(String(status.cardId), 'a different card answered on this address').toBe(CARD_ID);
  console.log('LIVE CARD', JSON.stringify({
    cardId: status.cardId, build: status.buildNumber, firmware: status.firmwareVersion,
    project: status.projectId, playing: status.currentPatternId,
  }));
});

for (const entry of [
  { id: 'bare', hash: '/' },
  { id: 'install', hash: '/#screen=card&section=install' },
  { id: 'patterns', hash: '/#screen=pattern' },
]) {
  test(`[T4] real card @ ${entry.id} — connects, unaided`, async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', error => crashes.push(String(error.message)));
    await seedStudio(page);
    await page.goto(entry.hash, { waitUntil: 'domcontentloaded' });

    await expect.poll(() => linkState(page), { timeout: 15000, intervals: [500] })
      .toMatch(/^connected-(direct|bridge)$/);
    expect(await visibleAlerts(page), 'Studio raised an alert before the owner did anything').toEqual([]);
    expect(crashes, 'the screen crashed').toEqual([]);
  });
}

test('[T4] a card with its lights off still shows its patterns', async ({ page }) => {
  await darkenCard();
  expect(await playingOnCard()).toBe('blackout');

  await seedStudio(page);
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkState(page), { timeout: 15000, intervals: [500] })
    .toMatch(/^connected-(direct|bridge)$/);

  // The fault Adrian hit: a dark card made Studio reject the whole pattern list.
  await expect(page.locator('.pm-cards .pmcard').first()).toBeVisible({ timeout: 15000 });
  expect(await visibleAlerts(page)).toEqual([]);
});

test('[T4] tapping a pattern plays it on the strip', async ({ page }) => {
  const target = await firstCardPatternId();
  await darkenCard();

  await seedStudio(page);
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkState(page), { timeout: 15000, intervals: [500] })
    .toMatch(/^connected-(direct|bridge)$/);

  const tile = page.locator(`.pm-cards .pmcard[data-pattern-id="${target}"]`);
  await expect(tile, `no tile for the card's own pattern "${target}"`).toHaveCount(1, { timeout: 15000 });
  await tile.click();

  // Asked of the CARD, not the screen. A tile that lights up while the strip
  // stays dark is a fail.
  await expect.poll(playingOnCard, { timeout: 5000, intervals: [250] }).toBe(target);
});
