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

test('first-run connect panel is one Connect button, not an LED quiz', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Connect Lightweaver' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Connect this card' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'My card already lights up' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Blank or not responding' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Eight lights flash twice, then pause' })).toHaveCount(0);
  await expect(dialog.locator('.card-condition-choices')).toHaveCount(0);
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
  await expect(page.getByTestId('setup-overwrite-card')).toBeVisible();
  await expect(page.getByTestId('setup-connect-card')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Matching card project' })).toHaveCount(0);
  await page.getByTestId('setup-overwrite-card').click();
  await expect(page).toHaveURL(/#screen=card&section=setup&task=install-project/);
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

test('a failed first-run connect keeps retry and one next action, not five doors', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Connect Lightweaver' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await dialog.getByRole('button', { name: 'Connect this card' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No reply from the card', { timeout: 15000 });
  await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
  const usbNext = dialog.getByRole('button', { name: 'Card is new or needs firmware' });
  const apNext = dialog.getByRole('button', { name: 'Join the setup network' });
  await expect(usbNext.or(apNext)).toBeVisible();
  expect((await usbNext.count()) + (await apNext.count())).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Open local Studio' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Open the card’s own page' })).toHaveCount(0);
  await expect(dialog.locator('.card-condition-choices')).toHaveCount(0);
  await expect(dialog.locator('.card-connection-action')).toHaveCount(0);
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

test('Setup connect does not keep a second Card connection options door beside Find my card', async ({ page }) => {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('setup-connect-card')).toBeVisible();
  await expect(page.getByTestId('setup-connect-manual')).toHaveCount(0);
});
