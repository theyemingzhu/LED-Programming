import { expect, test } from '@playwright/test';

test('card reconstruction preserves installed playlist and startup look', async ({ page }) => {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });

  const reconstructed = await page.evaluate(async () => {
    const setup = await import('/src/v3/lw-setup.jsx');
    return setup.reconstructInstalledCardState({
      skeleton: {
        outputs: [{ id: 'out1', name: 'Output 1', pin: 18, pixels: 41 }],
        led: { type: 'WS2815', colorOrder: 'RGB' },
        strips: [{ id: 'strip-1', name: 'Output 1', pixelCount: 41 }],
        portRoles: [{ portId: '18', role: 'strip', pixelCount: 41 }],
      },
      patterns: {
        currentId: 'fire',
        currentIndex: 1,
        patterns: [
          { id: 'aurora', label: 'Aurora', mode: 'procedural', zones: [{ id: 'strip-1', label: 'Output 1', patternId: 'aurora' }] },
          { id: 'fire', label: 'Fire', mode: 'procedural', zones: [{ id: 'strip-1', label: 'Output 1', patternId: 'fire' }] },
          { id: 'ocean', label: 'Ocean', mode: 'procedural', zones: [{ id: 'strip-1', label: 'Output 1', patternId: 'ocean' }] },
        ],
      },
      zones: {
        startupPatternId: 'aurora',
        zones: [{
          id: 'strip-1', label: 'Output 1', patternId: 'aurora',
          brightness: 0.72, speed: 1.15, hueShift: 12,
          customHue: 34, customSaturation: 210,
          customBreathe: true, breatheLowerPct: 30,
          breatheUpperPct: 90, breatheCycleSeconds: 6,
          customDrift: false,
        }],
      },
      cardId: 'lw-recon-fixture',
    });
  });

  expect(reconstructed.devices.standaloneController.looks).toHaveLength(3);
  expect(reconstructed.devices.standaloneController.looks).toEqual([
    expect.objectContaining({ id: 'aurora', label: 'Aurora', defaultLook: expect.objectContaining({ patternId: 'aurora' }) }),
    expect.objectContaining({ id: 'fire', label: 'Fire', defaultLook: expect.objectContaining({ patternId: 'fire' }) }),
    expect.objectContaining({ id: 'ocean', label: 'Ocean', defaultLook: expect.objectContaining({ patternId: 'ocean' }) }),
  ]);
  expect(reconstructed.devices.standaloneController.playlist).toEqual([
    expect.objectContaining({ id: 'aurora', type: 'combo', lookId: 'aurora', label: 'Aurora', enabled: true }),
    expect.objectContaining({ id: 'fire', type: 'combo', lookId: 'fire', label: 'Fire', enabled: true }),
    expect.objectContaining({ id: 'ocean', type: 'combo', lookId: 'ocean', label: 'Ocean', enabled: true }),
  ]);
  expect(reconstructed.devices.standaloneController.defaultLook).toEqual(expect.objectContaining({
    patternId: 'aurora', brightness: 0.72, speed: 1.15, hueShift: 12,
    customHue: 34, customSaturation: 210, customBreathe: true,
    breatheLowerPct: 30, breatheUpperPct: 90, breatheCycleSeconds: 6,
    customDrift: false,
  }));
  expect(reconstructed.devices.standaloneController.activeLookId).toBe('fire');

  // Defect C1b: the reconstruction marks itself so it is never described as
  // a complete editable backup — see projectCopyLabel.js's projectCopyKind,
  // the one place `origin` is read back into a display label.
  expect(reconstructed.origin.kind).toBe('card-partial');
  expect(reconstructed.origin.cardId).toBe('lw-recon-fixture');
  expect(typeof reconstructed.origin.at).toBe('number');
});

// ── the label a reconstruction gets in Projects (defect C1c) ───────────────
//
// C1b wired `origin` into `reconstructInstalledCardState`, `migrateProject`,
// and `projectCopyKind`/`ProjectsPanel.describeAssociation`. It could not yet
// reach the screen: `ProjectContext.jsx`'s `applyProject` reads a migrated
// project into a large set of individually-tracked React state variables — an
// explicit allow-list with no slot for `origin` — and `serializeProject`
// (what ProjectsPanel reads to build the association label) reconstructs the
// live project from those same state variables, so `origin` was dropped the
// instant it passed through `applyProject`, from ANY source. And
// `lw-setup.jsx`'s `applyCardParts` built its replacement project from its
// own explicit allow-list off `parts` — strips, portRoles, patchBoard,
// wiring, devices.standaloneController — without threading `parts.origin`
// through either. C1c threads both.

const CARD_ID = 'lw-recon-legacy-card';
const PROJECT_ID = 'lwproj-recon-legacy-piece';

function legacyReconstructStatus(overrides = {}) {
  return {
    app: 'Lightweaver', provisioningContractVersion: 1,
    cardId: CARD_ID, firmwareVersion: '1.1.15', buildId: 'a'.repeat(40), buildNumber: 1306,
    bootId: 'boot-recon-1', runtimePhase: 'ready', knownGoodProject: true,
    commandReady: true, outputReady: true, playbackReady: true,
    configValid: true, provisionalSetup: false, safeMode: false,
    projectId: PROJECT_ID, projectRevision: 0, projectFingerprint: '',
    piece: { id: PROJECT_ID, name: 'Reconstructed piece' },
    outputs: [{
      id: 'out1', pin: 18, pixels: 41, gpio: 18, count: 41,
      segments: [{ id: 'run-strip-1', count: 41, direction: 'forward' }],
    }],
    ...overrides,
  };
}

async function dispatchCardLink(page, events) {
  await page.evaluate(async (nextEvents) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const link = getSharedCardLink();
    for (const event of nextEvents) link.dispatch(event);
  }, events);
}

test('a card project reconstructed via "Use this card\'s project" shows the partial-copy label in Projects', async ({ page }) => {
  const status = legacyReconstructStatus();
  await page.route('http://lightweaver.local/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/status' || url.pathname === '/api/firmware-info') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...status, bridgeVersion: 6 }),
      });
    }
    if (url.pathname === '/api/wiring/status') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, state: 'known-good', hasCandidate: false, outputs: status.outputs }) });
    }
    // Patterns/zones readback 404s — a reconstruction must still happen from
    // the status skeleton alone, exactly as reconstructInstalledCardState's
    // `patterns`/`zones` null-tolerant path assumes.
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
  });
  await page.addInitScript(({ cardId, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion, buildId }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, status);

  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  // Open a DIFFERENT, non-starter project first so neither auto-adoption path
  // fires on its own (lw-setup.jsx's "adopt wiring from card" skeleton-only
  // shortcut and the "adopt by default" effect both require the open project
  // to be the card's own project or an untouched starter — see their shared
  // `openIsSameProject`/`openIsUntouched` guards). That forces the owner-driven
  // "Use this card's project" button, which alone runs the real 'reconstruct'
  // strategy (lib/cardProjectAdoption.js's runReconstructStrategy) through
  // `reconstructInstalledCardState` — the skeleton-only shortcut never sets
  // `origin` and is out of this ticket's scope.
  await page.evaluate(async () => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.id = 'my-other-piece';
    project.name = 'My other piece';
    project.layout.starterPending = false;
    project.portRoles = [{ pin: 5, role: 'strip', pixelCount: 30, controlKind: '' }];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dispatchCardLink(page, [{
    type: 'direct-status', connected: true, host: 'lightweaver.local',
    card: { id: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
    expectedCard: { id: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
    readiness: status,
  }]);

  await expect(page.getByTestId('setup-start-from-card')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('setup-start-from-card').click();
  await expect(page.getByTestId('setup-card-ready')).toBeVisible({ timeout: 10000 });

  await page.getByTestId('topbar-projects').click();
  await expect(page.getByTestId('projects-panel')).toBeVisible();
  await expect(page.getByTestId('projects-association')).toHaveText('Card copy (partial — no artwork)');
});

test('an autosaved project carrying a card-partial origin still shows the partial label after reload', async ({ page }) => {
  const seeded = JSON.stringify({
    version: 3,
    id: 'lwproj-seeded-partial',
    name: 'Seeded partial copy',
    origin: { kind: 'card-partial', cardId: 'x', at: 1 },
  });
  await page.addInitScript((project) => {
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', project);
  }, seeded);

  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.crumb .proj')).toHaveText('Seeded partial copy');

  await page.getByTestId('topbar-projects').click();
  await expect(page.getByTestId('projects-panel')).toBeVisible();
  await expect(page.getByTestId('projects-association')).toHaveText('Card copy (partial — no artwork)');
});
