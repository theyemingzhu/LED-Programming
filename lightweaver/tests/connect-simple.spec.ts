import { test, expect } from '@playwright/test';

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

async function dispatchCardLink(page, events: Record<string, unknown>[]) {
  await page.evaluate(async (nextEvents) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const link = getSharedCardLink();
    for (const event of nextEvents) {
      const priorBootId = link.getState().validatedBootId;
      link.dispatch(event);
      if (event.type === 'card-verified' && event.readiness?.bootId
        && (!priorBootId || priorBootId === event.readiness.bootId)) link.dispatch(event);
    }
  }, events);
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
  await expect(page.getByRole('button', { name: 'Set up the card' })).toBeVisible();
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

test('a connected card with a different project offers pull and overwrite, not another Find my card', async ({ page }) => {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.id = 'studio-open-work';
    project.name = 'Studio open work';
    project.layout.starterPending = false;
    project.portRoles = [{ pin: 5, role: 'strip', pixelCount: 30, controlKind: '' }];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: 'lw-mismatch', firmwareVersion: '1.4.0', buildId: 'a'.repeat(40),
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  const status = readyStatus('lw-mismatch', {
    projectId: 'card-held-piece',
    projectRevision: 2,
    projectFingerprint: 'b'.repeat(64),
  });
  await page.route('http://lightweaver.local/api/status', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(status),
  }));
  await page.route('http://lightweaver.local/api/firmware-info', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(status),
  }));

  await dispatchCardLink(page, [{
    type: 'card-verified',
    via: 'direct',
    host: 'lightweaver.local',
    card: { id: 'lw-mismatch', firmwareVersion: '1.4.0', buildId: 'a'.repeat(40) },
    expectedCard: { id: 'lw-mismatch', firmwareVersion: '1.4.0', buildId: 'a'.repeat(40) },
    readiness: status,
  }]);

  await expect(page.getByTestId('setup-card-project-note'))
    .toContainText(/different project|has not matched/, { timeout: 10000 });
  await expect(page.getByTestId('setup-start-from-card')).toBeVisible();
  await expect(page.getByTestId('setup-connect-card')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Matching card project' })).toHaveCount(0);
  await expect(page.getByTestId('setup-project-alternatives')).toHaveCount(0);
});

test('an already-set-up card hides the four-phase ladder and keeps Patterns as the way forward', async ({ page }) => {
  const CARD_ID = 'lw-ready-home';
  const PROJECT_ID = 'ready-piece';
  const fingerprint = 'c'.repeat(64);
  const status = readyStatus(CARD_ID, {
    projectId: PROJECT_ID,
    projectRevision: 1,
    projectFingerprint: fingerprint,
    outputs: [{
      id: 'out1', pin: 18, pixels: 41, gpio: 18, count: 41,
      segments: [{ id: 'run-strip-1', count: 41, direction: 'forward' }],
    }],
  });
  await page.addInitScript(({ cardId, firmwareVersion, buildId, projectId, fingerprint }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion, buildId }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      id: projectId,
      name: 'Ready piece',
      layout: {
        starterPending: false,
        strips: [{ id: 'strip-1', pixels: 41, pin: 18 }],
        wiring: {
          verified: true,
          runs: [{ id: 'strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward' }],
        },
      },
      portRoles: [{ port: 'out1', role: 'strip', pin: 18, pixelCount: 41 }],
      devices: {
        standaloneController: {
          led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' },
        },
      },
    }));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      generation: 1,
      editedRevision: 1,
      installedRevision: 1,
      dirty: false,
      installation: {
        cardId,
        projectRevision: 1,
        projectFingerprint: fingerprint,
        studioFingerprint: fingerprint,
        verified: true,
      },
    }));
  }, { cardId: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: status.buildId, projectId: PROJECT_ID, fingerprint });
  await page.unroute('http://lightweaver.local/**');
  await page.route('http://lightweaver.local/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/status' || url.pathname === '/api/firmware-info') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...status, bridgeVersion: 6 }),
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
  });
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await dispatchCardLink(page, [{
    type: 'card-verified',
    via: 'direct',
    host: 'lightweaver.local',
    card: { id: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
    expectedCard: { id: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
    readiness: status,
  }]);

  await expect(page.getByTestId('setup-open-patterns')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete');
  await expect(page.locator('[data-testid^="setup-phase-"]')).toHaveCount(0);
  await page.getByTestId('setup-open-patterns').click();
  await expect(page).toHaveURL(/#screen=pattern/);
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
  await dialog.getByRole('button', { name: 'Find card already on Wi-Fi' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No reply from the card', { timeout: 15000 });
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
      return { closed: false, focus() {}, close() {}, postMessage() {} } as any;
    }) as any;
  });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('setup-connect-card').click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await dialog.getByRole('button', { name: 'Use Lightweaver setup Wi-Fi' }).click();
  await expect(dialog).toContainText('Join the card’s own Wi-Fi network (its name starts with “Lightweaver-”)');
  await expect.poll(() => page.evaluate(() => (window as any).__openedUrls)).toEqual([]);
  await dialog.getByRole('button', { name: 'Continue after joining' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__openedUrls[0] || '')).toContain('http://192.168.4.1');
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

  await page.getByRole('button', { name: 'Connect Lightweaver' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog).toContainText('Pair this Lightweaver card');
  await expect(dialog.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Connect this card' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Use this card instead' })).toHaveCount(0);
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
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog).toContainText('Pair this Lightweaver card');
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
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
