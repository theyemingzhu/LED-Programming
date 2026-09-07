import { test, expect } from '@playwright/test';

// The install screen used to state only the firmware it was about to write. This
// covers the sentence that answers the question an owner is actually asking:
// what is on this card now, and which way does installing move it.
const CARD_ID = 'lw-plan-test';

async function openInstall(page: any, identity: object | null) {
  await page.addInitScript((card) => {
    localStorage.clear();
    if (card) localStorage.setItem('lw_card_identity_v1', JSON.stringify(card));
  }, identity);
  await page.goto('/#screen=flash&mode=install', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Install Lightweaver' })).toBeVisible({ timeout: 15_000 });
}

function remembered(buildNumber: number, buildId = 'b'.repeat(40)) {
  return {
    version: 1,
    id: CARD_ID,
    name: 'Plan test card',
    hostname: '',
    address: '',
    firmwareVersion: '1.0.0',
    buildId,
    buildNumber,
    acknowledgedAt: '2026-08-07T00:00:00.000Z',
  };
}

// The manifest the site serves is the target; the number in it is whatever the
// last signed release published, so the test reads it rather than hard-coding.
// Read OUT of the page: addInitScript re-runs on every navigation and clears
// storage, so the seeded identity has to be right before the first load.
async function availableRelease(request: any) {
  const manifest = await (await request.get('/firmware/release-manifest.json')).json();
  return {
    buildNumber: manifest.buildNumber as number,
    firmwareVersion: manifest.firmwareVersion as string,
  };
}

test('an older card is told which build it is on and which build it is getting', async ({ page, request }) => {
  const target = await availableRelease(request);
  await openInstall(page, remembered(1));
  const plan = page.getByTestId('install-update-plan');
  await expect(plan).toBeVisible();
  await expect(plan).toContainText('This card is on Build 1.');
  await expect(plan).toContainText(`This updates it to Build ${target.buildNumber}.`);
  await expect(plan).toContainText('erases the card');
});

// The case that matters most: reinstalling the build already on the card still
// wipes it, and must never read as an upgrade.
test('reinstalling the same build says so instead of implying an upgrade', async ({ page, request }) => {
  const target = await availableRelease(request);
  await openInstall(page, remembered(target.buildNumber));

  const plan = page.getByTestId('install-update-plan');
  await expect(plan).toContainText('already on the official firmware');
  await expect(plan).not.toContainText('updates it to');
  await expect(plan).toContainText('erases the card');
});

test('every setup step is clickable so an already-installed card can skip ahead or go back', async ({ page, request }) => {
  const target = await availableRelease(request);
  await openInstall(page, remembered(target.buildNumber));
  await expect(page.getByRole('heading', { name: 'Install Lightweaver' })).toBeVisible();

  for (const label of ['Connect card', 'Install safely', 'Set up card', 'Check lights']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
  }

  await page.getByRole('button', { name: 'Set up card', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set up card' })).toBeVisible();

  await page.getByRole('button', { name: 'Check lights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check lights' })).toBeVisible();

  await page.getByRole('button', { name: 'Install safely', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Install Lightweaver' })).toBeVisible();

  await page.getByRole('button', { name: 'Connect card', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect card', exact: true })).toHaveAttribute('aria-current', 'step');
});

test('a card running newer firmware is warned it is going backwards', async ({ page }) => {
  await openInstall(page, remembered(999999));
  const plan = page.getByTestId('install-update-plan');
  await expect(plan).toContainText('which is NEWER');
  await expect(plan).toContainText('backwards');
  await expect(plan).toHaveClass(/is-downgrade/);
});

// Never let the target read as the answer to "what is on it".
test('a card this browser has never met is reported as unknown', async ({ page, request }) => {
  const target = await availableRelease(request);
  await openInstall(page, null);
  const plan = page.getByTestId('install-update-plan');
  await expect(plan).toContainText('does not know what firmware is on this card yet');
  await expect(plan).toContainText(`This installs Build ${target.buildNumber}.`);
});

// The live screen printed official 1.1.30, "already on 1.1.30", and then
// "Installed firmware v1.1.15" for the same build. One status, no second version.
test('USB discovery names the card and does not print a second firmware version', async ({ page, request }) => {
  const target = await availableRelease(request);
  await page.addInitScript(({ card }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify(card));
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {} });
    (window as any).__LW_FIND_INSTALL_CARD_FOR_TEST__ = async () => ({
      connection: {
        loader: {},
        transport: { disconnect: async () => true },
      },
      hardware: {
        cardId: card.id,
        chipName: 'ESP32-S3',
        chipDescription: 'ESP32-S3',
        flashSize: '16MB',
        flashBytes: 16 * 1024 * 1024,
      },
    });
  }, { card: { ...remembered(target.buildNumber), firmwareVersion: '9.9.9' } });
  await page.goto('/#screen=flash&mode=install', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Install Lightweaver' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Find connected card' }).click();

  const identity = page.getByTestId('install-card-identity');
  await expect(identity).toContainText(CARD_ID);
  await expect(identity).toContainText('ESP32-S3 · 16 MB');
  await expect(identity).not.toContainText('Installed firmware');
  await expect(identity).not.toContainText('Current firmware');
  await expect(page.locator('body')).not.toContainText('9.9.9');
  await expect(page.getByTestId('install-update-plan')).toContainText('already on the official firmware');
});

// Find Connected Card already named the bench firmware. The footer used to keep
// saying "Card firmware unknown" because it only trusted a live Wi-Fi link and
// treated buildId "dev" as malformed.
test('after Find Connected Card the footer names the same bench firmware the panel just showed', async ({ page, request }) => {
  const manifest = await (await request.get('/firmware/release-manifest.json')).json();
  await page.addInitScript(({ card }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify(card));
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {} });
    (window as any).__LW_FIND_INSTALL_CARD_FOR_TEST__ = async () => ({
      connection: {
        loader: {},
        transport: { disconnect: async () => true },
      },
      hardware: {
        cardId: card.id,
        chipName: 'ESP32-S3',
        chipDescription: 'ESP32-S3',
        flashSize: '16MB',
        flashBytes: 16 * 1024 * 1024,
      },
    });
  }, { card: remembered(0, 'dev') });
  await page.goto('/#screen=flash&mode=install', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Install Lightweaver' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Find connected card' }).click();

  await expect(page.getByTestId('footer-firmware-status')).toHaveText(`Card firmware dev → ${manifest.buildNumber}`);
  await expect(page.getByTestId('footer-firmware-status')).not.toContainText('unknown');
});

// Once a signed preserving update ticket is published for the current release,
// a USB-identified card is offered that update instead of the destructive
// install plan — so the proven-semver recommendation is read off the preserving
// panel here. `describeFirmwareUpdate`'s usb-flash semver branch keeps its own
// coverage in src/lib/firmwareUpdatePlan.test.js.
test('USB flash identity outranks remembered firmware and clearly recommends a proven semver update', async ({ page, request }) => {
  const manifest = await (await request.get('/firmware/release-manifest.json')).json();
  await page.addInitScript(({ card }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify(card));
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {} });
    (window as any).__LW_FIND_INSTALL_CARD_FOR_TEST__ = async () => ({
      connection: { loader: {}, transport: { disconnect: async () => true } },
      hardware: {
        cardId: card.id, chipName: 'ESP32-S3', chipDescription: 'ESP32-S3',
        flashSize: '16MB', flashBytes: 16 * 1024 * 1024,
        firmwareVersion: '1.1.1', buildId: '1366faf23a29a815044bae2e50405ff14b424e42',
        source: 'usb-flash',
      },
    });
  }, { card: remembered(1198, 'a'.repeat(40)) });
  await page.goto('/#screen=flash&mode=install', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Find connected card' }).click();

  const identity = page.getByTestId('install-card-identity');
  await expect(identity).toContainText(CARD_ID);
  await expect(identity).not.toContainText('v1.0.0');
  await expect(identity).not.toContainText('Installed firmware');

  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel.getByRole('heading', { name: 'One-time USB update for this card' })).toBeVisible();
  await expect(panel).toContainText('1.1.1 · Build 1366faf23a29');
  await expect(panel).toContainText(`${manifest.firmwareVersion} · Build ${manifest.buildNumber}`);
  await expect(panel).not.toContainText('replaces it with');
  // The destructive plan must not also be on screen offering the erasing path.
  await expect(page.getByTestId('install-update-plan')).toHaveCount(0);
});

test('LAN connection explains and releases an active USB inspection before any status probe', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    (window as any).__usbInspectionDisconnects = 0;
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {} });
    (window as any).__LW_FIND_INSTALL_CARD_FOR_TEST__ = async () => ({
      connection: {
        loader: {},
        transport: {
          disconnect: async () => {
            (window as any).__usbInspectionDisconnects += 1;
            return true;
          },
        },
      },
      hardware: {
        cardId: 'lw-b0fe81f61b44', chipName: 'ESP32-S3', chipDescription: 'ESP32-S3',
        flashSize: '16MB', flashBytes: 16 * 1024 * 1024,
      },
    });
  });
  let statusProbes = 0;
  await page.route('http://lightweaver.local/api/status', route => {
    statusProbes += 1;
    return route.abort();
  });
  await page.goto('/#screen=flash&mode=install', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Find connected card' }).click();
  await expect(page.getByTestId('install-card-identity')).toContainText('lw-b0fe81f61b44');
  statusProbes = 0;

  await page.getByRole('button', { name: 'Connect Lightweaver' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog.getByRole('heading', { name: 'Card is in USB install mode' })).toBeVisible();
  await expect(dialog).toContainText('Its Wi-Fi is temporarily off.');
  await expect(dialog).toContainText('This does not mean its firmware is out of date.');
  await expect(dialog.getByRole('button', { name: 'Continue firmware update' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Restart card for Wi-Fi connection' })).toBeVisible();
  await expect(dialog.locator('.card-condition-choices')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Blank or not responding' })).toHaveCount(0);
  await expect(dialog).not.toContainText('Studio could not reach the card directly');
  expect(statusProbes).toBe(0);

  await dialog.getByRole('button', { name: 'Restart card for Wi-Fi connection' }).click();
  await expect(dialog).toContainText('Card restarted. Its Wi-Fi may take a moment.');
  await expect.poll(() => page.evaluate(() => (window as any).__usbInspectionDisconnects)).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Connect this card' })).toBeVisible();
  await expect(page.getByTestId('install-card-identity')).toHaveCount(0);
  expect(statusProbes).toBe(0);
});

// F11 — a browser that remembers a configured card (identity AND the host it
// last reached, as the card-state-matrix spec's seedKnownCard does) must not
// headline the destructive factory installer while the card link is still
// settling a few seconds after e.g. a power cycle. Real bug: Adrian opened
// #screen=card&section=install while the card was still reconnecting and saw
// "Install Lightweaver … erases the card's Wi-Fi, its piece and its
// settings" with "Find connected card" as primary, when the card was in fact
// about to answer as update-capable.
const SETTLING_CARD_ID = 'lw-f11-settling';

async function seedRememberedCardWithHost(page: any) {
  await page.addInitScript(({ id }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id, name: 'F11 card', hostname: '', address: '',
      firmwareVersion: '1.0.0', buildId: 'c'.repeat(40), buildNumber: 1,
      acknowledgedAt: '2026-08-07T00:00:00.000Z',
    }));
    // The real storage key `readStoredCardHost` reads is `lw_chip_card_host`
    // (see src/lib/cardConnection.js CARD_HOST_STORAGE_KEY); `lw_card_host`
    // is set alongside it to match the matrix spec's seedKnownCard exactly.
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: SETTLING_CARD_ID });
}

function settlingCardStatus() {
  return {
    app: 'Lightweaver', provisioningContractVersion: 1,
    cardId: SETTLING_CARD_ID, bootId: 'boot-f11', projectHead: 'a'.repeat(64), projectFingerprint: 'b'.repeat(64),
    projectId: 'lwproj-f11', projectRevision: 1,
    firmwareVersion: '1.0.0', buildId: 'c'.repeat(40), buildNumber: 1,
    runtimePhase: 'ready', knownGoodProject: true, commandReady: true,
    outputReady: true, playbackReady: true,
    capabilities: { firmwareUpdate: { version: 1, network: true, softwareGrant: true } },
  };
}

test('a remembered card headlines Checking card while the link settles, then the preserving update once it answers', async ({ page }) => {
  await seedRememberedCardWithHost(page);
  const start = Date.now();
  await page.route(/lightweaver\.local|192\.168\.4\.1/, route => {
    if (Date.now() - start < 3000) return route.abort();
    if (route.request().url().includes('/api/status')) return route.fulfill({ json: settlingCardStatus() });
    return route.abort();
  });

  await page.goto('/#screen=card&section=install', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('install-checking-card')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Install Lightweaver' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find connected card' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText("erases the card's Wi-Fi");

  await expect(page.getByTestId('preserving-update-panel')).toBeVisible({ timeout: 20_000 });
});

test('a remembered card offers Try again once the link genuinely cannot reach it', async ({ page }) => {
  await seedRememberedCardWithHost(page);
  await page.route(/lightweaver\.local|192\.168\.4\.1/, route => route.abort());

  await page.goto('/#screen=card&section=install', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('install-checking-card')).toBeVisible();

  const notice = page.getByTestId('install-remembered-card-unreachable');
  await expect(notice).toBeVisible({ timeout: 18_000 });
  await expect(notice).toContainText(SETTLING_CARD_ID);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  // Factory install stays reachable — it is not the headline of the
  // settling window, but it is not stranded either.
  await expect(page.getByRole('heading', { name: 'Install Lightweaver' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find connected card' })).toBeVisible();
});
