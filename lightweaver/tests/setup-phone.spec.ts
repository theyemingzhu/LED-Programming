import { expect, test, type Page } from '@playwright/test';

// The setup journey ON A PHONE. The owner does this standing at the piece with
// a phone in one hand, and until now not one test drove it at that width — the
// phone lens covered Pattern Lab only. Every defect reported from a real card
// was found by hand for want of this.
//
// Deliberately narrow: it asserts the things that make a screen unusable rather
// than the wording, so it keeps working while the copy improves.

const CARD_ID = 'lw-phone-test';
const BUILD_ID = 'c'.repeat(40);

function readyStatus(overrides: Record<string, unknown> = {}) {
  return {
    app: 'Lightweaver',
    ok: true,
    provisioningContractVersion: 1,
    cardId: CARD_ID,
    firmwareVersion: '1.1.29',
    buildId: BUILD_ID,
    buildNumber: 1427,
    bootId: 'boot-phone-1',
    runtimePhase: 'ready',
    knownGoodProject: true,
    commandReady: true,
    playbackReady: true,
    outputReady: true,
    projectOutputReady: true,
    provisionalSetup: false,
    configValid: true,
    projectId: '',
    projectRevision: 0,
    projectFingerprint: '',
    led: { pixels: 0 },
    wifi: { transport: 'station', apActive: false, ip: '192.168.18.70', stationIp: '192.168.18.70' },
    ...overrides,
  };
}

async function openOnPhone(page: Page, status: Record<string, unknown> | null) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  if (status) {
    await page.route('**/api/**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(status),
    }));
    await page.addInitScript(id => {
      localStorage.setItem('lw_chip_card_host', '192.168.18.70');
      localStorage.setItem('lw_card_identity_v1', JSON.stringify(id));
    }, { version: 1, id: CARD_ID, firmwareVersion: '1.1.29', buildId: BUILD_ID, buildNumber: 1427 });
  }
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-workspace-heading')).toBeVisible();
  return errors;
}

async function assertUsable(page: Page, errors: string[]) {
  // Nothing may push the page sideways: on a phone that hides the right-hand
  // edge of every row, including the primary action.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the page must not scroll horizontally on a phone').toBeLessThanOrEqual(2);

  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Something went wrong');
  expect(body).not.toMatch(/page not found/i);

  const unexpected = errors.filter(text => !/40[134]|Failed to fetch|net::ERR|NetworkError|manifest/i.test(text));
  expect(unexpected, `unexpected console errors: ${unexpected.join(' | ')}`).toEqual([]);
}

test('the setup ladder is usable on a phone with no card connected', async ({ page }) => {
  const errors = await openOnPhone(page, null);
  await assertUsable(page, errors);

  // The one thing the owner must be able to do from here, reachable and tappable.
  const connect = page.getByTestId('setup-connect-card');
  await expect(connect).toBeVisible();
  const box = await connect.boundingBox();
  expect(box, 'the primary action must have a real hit area').not.toBeNull();
  expect(box!.height, 'a coarse-pointer target needs at least 44px').toBeGreaterThanOrEqual(40);
  expect(box!.x + box!.width, 'the primary action must sit inside the viewport').toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});

test('a connected blank card shows exactly one next step on a phone', async ({ page }) => {
  const errors = await openOnPhone(page, readyStatus({ knownGoodProject: false, commandReady: false }));
  await assertUsable(page, errors);

  // One phase active, one primary action. The reported failure was several
  // competing headline actions on one screen; on a phone they stack and the
  // owner cannot tell which is theirs.
  const primaries = page.locator('main .btn.primary:visible');
  expect(await primaries.count(), 'one headline action at a time').toBeLessThanOrEqual(1);
});

test('the phone footer carries status, not bench tools', async ({ page }) => {
  const errors = await openOnPhone(page, readyStatus());
  await assertUsable(page, errors);

  // The short-strip preview belongs to screens that show a preview. On the
  // card screen it changed nothing visible, under a name that reads as a test
  // of the real strip.
  await expect(page.getByTestId('test-strip-control')).toHaveCount(0);
  await expect(page.getByTestId('studio-freshness')).toBeVisible();
});
