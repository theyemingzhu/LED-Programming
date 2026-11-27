import { test, expect } from '@playwright/test';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { cardState } from './harness/cardStates';
import { seedKnownCard, waitForCardProject } from './harness/falseFailureWatch';
import { createPracticeCard } from './harness/practiceTiming';

// Connect is one action: you either reach the card or you don't. The LED
// triage ("look at the lights and choose what you see") was a second connect
// surface stacked on "Connect this card". This spec pins the collapsed path
// and the pull-vs-overwrite choice when Studio and the card disagree.

test.beforeEach(async ({ page }) => {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
});

function readyStatus(cardId: string, overrides = {}) {
  return {
    app: 'Lightweaver', provisioningContractVersion: 1,
    cardId, firmwareVersion: '1.4.0', buildId: 'a'.repeat(40),
    bootId: 'boot-connect-simple', runtimePhase: 'ready', knownGoodProject: true,
    commandReady: true, outputReady: true, playbackReady: true,
    ...overrides,
  };
}

test('first-run card setup leads with USB inspection and keeps Wi-Fi paths secondary', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Connect Lightweaver' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Set up this card' })).toBeVisible();
  await expect(dialog).toContainText('Plug the card into this computer by USB');
  await expect(dialog).toContainText('Studio will inspect it');
  await expect(dialog.getByRole('button', { name: 'Inspect card over USB' })).toHaveClass(/primary/);
  await expect(dialog.getByRole('button', { name: 'Use Lightweaver setup Wi-Fi' })).not.toHaveClass(/primary/);
  await expect(dialog.getByRole('button', { name: 'Find card already on Wi-Fi' })).not.toHaveClass(/primary/);
  await expect(dialog).not.toContainText('never run Lightweaver');
  await expect(dialog.getByRole('button', { name: 'Connect this card' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'My card already lights up' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Blank or not responding' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Eight lights flash twice, then pause' })).toHaveCount(0);
  await expect(dialog.locator('.card-condition-choices')).toHaveCount(0);
});

test('a blind background probe cannot replace fresh USB setup with a connecting dead end', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Set up this card' })).toBeVisible();
  await page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const button = document.querySelector('[data-testid="setup-connect-card"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('fresh card entry missing');
    button.click();
    getSharedCardLink().dispatch({ type: 'connecting', via: 'direct', host: 'lightweaver.local' });
  });
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog.getByRole('heading', { name: 'Set up this card' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Inspect card over USB' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Connecting…' })).toHaveCount(0);
});

test('a stored setup-AP host opens join steps without asking about the lights', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lw_chip_card_host', '192.168.4.1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Connect Lightweaver' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog.getByRole('button', { name: 'My card already lights up' })).toHaveCount(0);
  await expect(dialog).toContainText('name starts with');
  await expect(dialog.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('a connected card with a different project offers recovery and a separate draft review', async ({ page }) => {
  const draft = createDefaultProject();
  draft.id = 'studio-open-work';
  draft.name = 'Studio open work';
  draft.layout.starterPending = false;
  draft.portRoles = [{ pin: 5, role: 'strip', pixelCount: 30, controlKind: '' }];
  await page.addInitScript(project => localStorage.setItem('lw_autosave_v3', JSON.stringify(project)), draft);
  const { card } = createPracticeCard(cardState('installed-different'));
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/#screen=card&section=setup');

  const installed = page.getByRole('region', { name: 'Installed project' });
  await expect(installed.getByTestId('card-draft-difference')).toContainText('Your draft differs from the installed project.');
  await expect(installed.getByTestId('card-draft-difference')).toContainText(draft.name);
  await expect(installed.getByRole('button', { name: 'Review and save draft', exact: true })).toBeEnabled();
  await expect(installed.getByRole('button', { name: 'Control installed project', exact: true })).toBeEnabled();
  await expect(page.getByTestId('setup-connect-card')).toHaveCount(0);
  await waitForCardProject(page, draft.id);

  await installed.getByRole('button', { name: 'Open installed project', exact: true }).click();
  await waitForCardProject(page, card.state.projectId);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: `Open ${draft.name}`, exact: true }).click();
  await waitForCardProject(page, draft.id);
  expect(card.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
});

test('an already-set-up card offers installed control and opens Patterns from Studio navigation', async ({ page }) => {
  const { card } = createPracticeCard(cardState('installed-match'));
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/#screen=card&section=setup');

  const installed = page.getByRole('region', { name: 'Installed project' });
  await expect(installed.getByRole('button', { name: 'Control installed project', exact: true })).toBeEnabled();
  await waitForCardProject(page, card.state.projectId);
  await expect(installed.getByTestId('card-draft-difference')).toContainText('Your draft matches the installed project.');
  await expect(installed.getByRole('button', { name: 'Open installed project', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-testid^="setup-phase-"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await expect(page).toHaveURL(/#screen=pattern/);
  await expect(page.getByRole('heading', { name: 'Patterns & Looks', exact: true })).toBeVisible();
  await waitForCardProject(page, card.state.projectId);
  expect(card.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
});

test('Studio Patterns loads with no card and does not nag a four-phase setup', async ({ page }) => {
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Patterns & Looks' })).toBeVisible();
  await expect(page.getByTestId('setup-journey-chip')).toHaveCount(0);
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect Lightweaver' })).toBeVisible();
});

test('same-Wi-Fi failure keeps retry, setup-network recovery, and known-IP entry', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Connect Lightweaver' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await page.clock.install();
  await dialog.getByRole('button', { name: 'Find card already on Wi-Fi' }).click();
  await expect(dialog).toContainText(/Looking for your card|Connecting…/);
  await expect(dialog.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await page.clock.fastForward(46_000);
  await expect(dialog.getByRole('alert')).toContainText('No reply from the card');
  await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Use Lightweaver setup Wi-Fi' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Enter a known card IP' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Inspect card over USB' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Open local Studio' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Open the card’s own page' })).toHaveCount(0);
  await expect(dialog.locator('.card-condition-choices')).toHaveCount(0);
  await expect(dialog.locator('.card-connection-action')).toHaveCount(0);
});

test('both fresh public card entry points open the same USB-first flow without opening lightweaver.local', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    (window as any).__openedUrls = [];
    window.open = ((url?: string | URL) => {
      (window as any).__openedUrls.push(String(url || ''));
      return { closed: false, focus() {}, close() {}, postMessage() {} } as any;
    }) as any;
  });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });

  await page.getByTestId('setup-connect-card').click();
  let dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog.getByRole('heading', { name: 'Set up this card' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close connection center' }).click();

  await page.getByTestId('setup-connect-card').click();
  dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog.getByRole('heading', { name: 'Set up this card' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__openedUrls)).toEqual([]);
});

test('setup-network route opens 192.168.4.1 only after the worker confirms joining the card Wi-Fi', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    (window as any).__openedUrls = [];
    window.open = ((url?: string | URL) => {
      (window as any).__openedUrls.push(String(url || ''));
      let href = String(url || 'about:blank');
      return {
        closed: false,
        focus() {},
        close() {},
        postMessage() {},
        location: {
          get href() { return href; },
          set href(next: string) { href = next; (window as any).__openedUrls.push(next); },
        },
      } as unknown as Window;
    }) as any;
  });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('setup-connect-card').click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await dialog.getByRole('button', { name: 'Use Lightweaver setup Wi-Fi' }).click();
  await expect(dialog).toContainText('Join the card’s own Wi-Fi network (its name starts with “Lightweaver-”)');
  await expect.poll(() => page.evaluate(() => (window as any).__openedUrls)).toEqual([]);
  await dialog.getByRole('button', { name: 'Continue after joining' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__openedUrls.find(Boolean) || '')).toContain('http://192.168.4.1');
});

test('USB inspection does not ask the worker to know the board firmware history', async ({ page }) => {
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('setup-connect-card').click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog).not.toContainText('never run Lightweaver');
  await dialog.getByRole('button', { name: 'Inspect card over USB' }).click();
  await expect(page).toHaveURL(/#screen=flash&mode=install$/);
});

test('lwCard=fresh does not auto-open the no-reply panel on Layout', async ({ page }) => {
  await page.goto('/?lwCard=fresh#screen=layout', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver' })).toHaveCount(0);
  await expect(page.getByText('No reply from the card')).toHaveCount(0);
  await expect(page.getByText('Studio received no reply')).toHaveCount(0);
});

test('a discovered unpaired card offers one-tap pair, not another Connect this card', async ({ page }) => {
  const status = readyStatus('lw-found-unpaired', {
    projectId: 'held-piece',
    projectRevision: 1,
    projectFingerprint: 'd'.repeat(64),
  });
  await page.route('http://lightweaver.local/api/status', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(status),
  }));
  await page.route('http://lightweaver.local/api/firmware-info', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(status),
  }));
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-link-status')).toHaveAccessibleName(/Found . pair/);

  // One tap: "Found — pair" pairs (simpler-journeys C5), with no dialog and
  // no second Connect this card.
  await page.getByRole('button', { name: 'Connect Lightweaver' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_card_identity_v1') || 'null')?.id)).toBe('lw-found-unpaired');
  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver' })).toHaveCount(0);
});

test('a found factory card on the setup AP can pair before opening its preserving update', async ({ page }) => {
  const cardId = 'lw-factory-ap-pair';
  const status = readyStatus(cardId, {
    runtimePhase: 'factory', mode: 'factory-flash', source: 'defaults',
    knownGoodProject: false, commandReady: false, outputReady: false,
    projectId: '', projectFingerprint: '', firmwareUpdateReady: true,
    capabilities: { firmwareUpdate: { version: 1, network: true, softwareGrant: true } },
  });
  await page.route('http://192.168.4.1/api/status', route => route.fulfill({ json: status }));
  await page.route('http://192.168.4.1/api/firmware-info', route => route.fulfill({ json: status }));
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lw_chip_card_host', '192.168.4.1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(async (envelope) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    getSharedCardLink().dispatch({
      type: 'direct-status', connected: true, host: '192.168.4.1',
      card: { id: envelope.cardId, firmwareVersion: envelope.firmwareVersion, buildId: envelope.buildId },
      readiness: envelope, allowAdopt: false,
    });
  }, status);
  await expect(page.getByTestId('card-link-status')).toHaveAccessibleName(/Found . pair/);
  await page.getByTestId('card-link-status').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_card_identity_v1') || 'null')?.id)).toBe(cardId);
  await page.goto('/#screen=card&section=install', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('preserving-update-panel')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Update Lightweaver' })).toBeVisible();
});

test('Setup connect does not keep a second Card connection options door beside Find my card', async ({ page }) => {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('setup-connect-card')).toBeVisible();
  await expect(page.getByTestId('setup-connect-manual')).toHaveCount(0);
});
