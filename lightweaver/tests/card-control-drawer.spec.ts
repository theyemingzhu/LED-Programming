import { expect, test, type Page } from '@playwright/test';

const CARD_ID = 'lw-drawer-card';
const PROJECT_ID = 'drawer-gallery-project';

async function verifyCard(page: Page, projectFingerprint: string, bootId = 'drawer-boot', projectRevision = 0) {
  await page.evaluate(async ({ projectFingerprint, bootId, projectRevision }) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const event = {
      type: 'card-verified', via: 'direct', host: 'lightweaver.local',
      card: { id: 'lw-drawer-card', name: 'Gallery Lightweaver', firmwareVersion: '1.1.1', buildId: 'a'.repeat(40) },
      expectedCard: { id: 'lw-drawer-card', firmwareVersion: '1.1.1', buildId: 'a'.repeat(40) },
      readiness: {
        app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-drawer-card',
        firmwareVersion: '1.1.1', buildId: 'a'.repeat(40), bootId,
        runtimePhase: 'ready', knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
        projectId: 'drawer-gallery-project', projectRevision, projectFingerprint,
      },
    };
    const link = getSharedCardLink();
    link.dispatch(event);
    link.dispatch(event);
  }, { projectFingerprint, bootId, projectRevision });
}

test('same-card readiness changes discard delayed drawer reads and reload the current card state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let projectFingerprint = '';
  let bootId = 'drawer-boot';
  let projectRevision = 0;
  let readVersion: 'old' | 'boot-current' | 'project-current' = 'old';
  let releaseOldReads: (() => void) | null = null;
  let releaseReadback: (() => void) | null = null;
  let announceReadback: (() => void) | null = null;
  const readbackStarted = new Promise<void>(resolve => { announceReadback = resolve; });
  const readbackGate = new Promise<void>(resolve => { releaseReadback = resolve; });
  let holdReadback = false;
  let controlRequestCount = 0;
  const readCounts = { old: 0, 'boot-current': 0, 'project-current': 0 };
  const oldReadGate = new Promise<void>(resolve => { releaseOldReads = resolve; });
  await page.route('http://lightweaver.local/api/zones', async route => {
    if (readVersion === 'old') {
      readCounts.old += 1;
      await oldReadGate;
      return route.fulfill({ json: { zones: [{ id: 'old-zone', label: 'Old zone', patternId: 'old-pattern', brightness: 0.2 }] } });
    }
    if (holdReadback) {
      holdReadback = false;
      announceReadback?.();
      await readbackGate;
    }
    readCounts[readVersion] += 1;
    const installed = readVersion === 'project-current';
    return route.fulfill({ json: { zones: [{ id: installed ? 'installed-zone' : 'new-zone', label: installed ? 'Installed zone' : 'Current zone', patternId: installed ? 'installed-pattern' : 'new-pattern', brightness: 0.8 }] } });
  });
  await page.route('http://lightweaver.local/api/patterns', async route => {
    if (readVersion === 'old') {
      readCounts.old += 1;
      await oldReadGate;
      return route.fulfill({ json: { currentId: 'old-pattern', currentIndex: 0, patterns: [
        { id: 'old-pattern', label: 'Old pattern', mode: 'preset', zones: [], controls: {} },
      ] } });
    }
    readCounts[readVersion] += 1;
    const installed = readVersion === 'project-current';
    return route.fulfill({ json: {
      currentId: installed ? 'installed-pattern' : 'new-pattern', currentIndex: 0,
      patterns: installed
        ? [{ id: 'installed-pattern', label: 'Installed pattern', mode: 'preset', zones: [], controls: {} }]
        : [
          { id: 'new-pattern', label: 'Current pattern', mode: 'preset', zones: [], controls: {} },
          { id: 'other-pattern', label: 'Other pattern', mode: 'preset', zones: [], controls: {} },
        ],
    } });
  });
  await page.route('http://lightweaver.local/api/firmware-info', route => route.fulfill({ json: {
    app: 'Lightweaver', provisioningContractVersion: 1, cardId: CARD_ID, firmwareVersion: '1.1.1', buildId: 'a'.repeat(40),
    bootId, runtimePhase: 'ready', knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
    projectId: PROJECT_ID, projectFingerprint, projectRevision, piece: { id: PROJECT_ID, name: 'Gallery Lightweaver' },
  } }));
  await page.route('http://lightweaver.local/api/status', route => route.fulfill({ json: {
    app: 'Lightweaver', provisioningContractVersion: 1, cardId: CARD_ID, firmwareVersion: '1.1.1', buildId: 'a'.repeat(40),
    bootId, runtimePhase: 'ready', knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
    projectId: PROJECT_ID, projectFingerprint, projectRevision, piece: { id: PROJECT_ID, name: 'Gallery Lightweaver' },
  } }));
  await page.route('http://lightweaver.local/api/control', async route => {
    controlRequestCount += 1;
    holdReadback = true;
    await route.fulfill({ status: 503, json: { ok: false, error: 'busy' } });
  });
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  projectFingerprint = await page.evaluate(async (projectId) => {
    const { createDefaultProject, migrateProject } = await import('/src/lib/projectModel.js');
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const project = createDefaultProject();
    project.id = projectId;
    project.name = 'Drawer gallery project';
    project.layout.starterPending = false;
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: 'lw-drawer-card' }));
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_autosave_v3_backup', JSON.stringify(project));
    return cardProjectFingerprint(migrateProject(project));
  }, PROJECT_ID);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await verifyCard(page, projectFingerprint);
  const footer = page.getByTestId('card-link-status');
  await expect(footer).toHaveAccessibleName(/Gallery Lightweaver.*Connected/);
  await footer.click();
  const drawer = page.getByRole('dialog', { name: 'Gallery Lightweaver controls' });
  await expect.poll(() => readCounts.old).toBeGreaterThanOrEqual(2);

  // The boot changes first while the browser's saved project remains the same.
  readVersion = 'boot-current';
  bootId = 'drawer-boot-2';
  await verifyCard(page, projectFingerprint, bootId, projectRevision);
  await expect(drawer.locator('select[aria-label="Pattern"]')).toHaveValue('new-pattern');
  expect(readCounts['boot-current']).toBeGreaterThanOrEqual(2);
  releaseOldReads?.();
  await expect(drawer.locator('select[aria-label="Pattern"]')).toHaveValue('new-pattern');
  await expect(drawer.getByText('Old pattern')).toHaveCount(0);

  // A transient write refusal starts a readback before it may retry. If the
  // card session changes during that read, no retry may target the new session.
  await drawer.locator('select[aria-label="Pattern"]').selectOption('other-pattern');
  await expect.poll(() => controlRequestCount).toBe(1);
  await readbackStarted;

  // Repeated readiness for the exact same context is ordinary polling and
  // must not start another read.
  const countBeforeStableUpdate = readCounts['boot-current'];
  await verifyCard(page, projectFingerprint, bootId, projectRevision);
  await page.waitForTimeout(250);
  expect(readCounts['boot-current']).toBe(countBeforeStableUpdate);

  // A same-boot installation can still replace project contents; its new
  // fingerprint/revision must refresh the view without waiting for a reboot.
  readVersion = 'project-current';
  projectFingerprint = 'd'.repeat(64);
  projectRevision = 1;
  await verifyCard(page, projectFingerprint, bootId, projectRevision);
  await expect(drawer.locator('select[aria-label="Pattern"]')).toHaveValue('installed-pattern');
  expect(readCounts['project-current']).toBeGreaterThanOrEqual(2);
  await expect(drawer.getByRole('slider', { name: 'Brightness' })).toHaveValue('80');
  releaseReadback?.();
  await page.waitForTimeout(500);
  expect(controlRequestCount).toBe(1, 'the old-session retry must not send a second control');
  await page.screenshot({ path: '/tmp/lightweaver-extra-hour/card-controls-refresh.png' });
});

test('a connected footer opens customer card controls without a popup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let controlBody: Record<string, unknown> | null = null;
  let controlRequestCount = 0;
  let rejectBrightnessOnce = true;
  let releasePendingControl: (() => void) | null = null;
  let projectFingerprint = '';
  await page.route('http://lightweaver.local/api/zones', route => route.fulfill({ json: {
    zones: [{ id: 'all', label: 'Whole piece', patternId: 'bench-warm', brightness: 0.7, speed: 1, hueShift: 0, customHue: 32, customSaturation: 230, customBreathe: false, customDrift: false, driftHueMin: 17, driftHueMax: 203, blackout: false }],
  } }));
  await page.route('http://lightweaver.local/api/patterns', route => route.fulfill({ json: {
    currentId: 'bench-warm', currentIndex: 0,
    patterns: [
      { id: 'bench-warm', label: 'Warm bench', mode: 'preset', runtimePatternId: 'warm-white', zones: [], controls: { customColor: true, breathe: false, drift: true } },
      { id: 'combo-moon-look', label: 'Moon look', mode: 'combo', runtimePatternId: 'ocean', zones: [], controls: { customColor: false, breathe: false, drift: false } },
    ],
  } }));
  const cardRuntime = () => ({
    app: 'Lightweaver', provisioningContractVersion: 1, cardId: CARD_ID, firmwareVersion: '1.1.1', buildId: 'a'.repeat(40),
    bootId: 'drawer-boot', runtimePhase: 'ready', knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
    projectId: PROJECT_ID, projectFingerprint, projectRevision: 0, piece: { id: PROJECT_ID, name: 'Gallery Lightweaver' },
  });
  await page.route('http://lightweaver.local/api/firmware-info', route => route.fulfill({ json: cardRuntime() }));
  await page.route('http://lightweaver.local/api/status', route => route.fulfill({ json: cardRuntime() }));
  await page.route('http://lightweaver.local/api/control', async route => {
    controlRequestCount += 1;
    controlBody = JSON.parse(route.request().postData() || '{}');
    if (controlBody.brightness === 0.4 && rejectBrightnessOnce) {
      rejectBrightnessOnce = false;
      await route.fulfill({ status: 503, json: { ok: false, error: 'busy' } });
      return;
    }
    if (controlBody.speed === 1.5 && !releasePendingControl) {
      await new Promise<void>(resolve => { releasePendingControl = resolve; });
    }
    await route.fulfill({ json: { ok: true, cardId: CARD_ID, ...controlBody, appliedPatternId: controlBody.patternId } });
  });
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  projectFingerprint = await page.evaluate(async (projectId) => {
    const { createDefaultProject, migrateProject } = await import('/src/lib/projectModel.js');
    const { normalizeSavedLooks } = await import('/src/lib/sectionLookModel.js');
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const project = createDefaultProject();
    project.id = projectId;
    project.name = 'Drawer gallery project';
    project.layout.starterPending = false;
    project.devices.standaloneController.looks = normalizeSavedLooks([{
      id: 'moon-look', label: 'Moon look', defaultLook: { patternId: 'ocean', brightness: 0.7 }, sectionLooks: {},
    }]);
    project.devices.standaloneController.activeLookId = '';
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: 'lw-drawer-card' }));
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_autosave_v3_backup', JSON.stringify(project));
    return cardProjectFingerprint(migrateProject(project));
  }, PROJECT_ID);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await verifyCard(page, projectFingerprint);

  const footer = page.getByTestId('card-link-status');
  await expect(footer).toHaveAccessibleName(/Gallery Lightweaver.*Connected/);
  await footer.click();
  const drawer = page.getByRole('dialog', { name: 'Gallery Lightweaver controls' });
  await expect(drawer).toBeVisible();
  const phonePlayer = drawer.getByRole('link', { name: 'Open phone player' });
  await expect(phonePlayer).toBeVisible();
  const pairedUrl = new URL((await phonePlayer.getAttribute('href'))!);
  expect(pairedUrl.origin).toBe('https://light.mandalacodes.com');
  expect(pairedUrl.search).toBe('');
  expect(new URLSearchParams(pairedUrl.hash.slice(1)).get('cardId')).toBe(CARD_ID);
  expect(new URLSearchParams(pairedUrl.hash.slice(1)).get('host')).toBe('lightweaver.local');


  const matchingProjectFingerprint = projectFingerprint;
  projectFingerprint = 'c'.repeat(64);
  await verifyCard(page, projectFingerprint);
  const blockedRequests = controlRequestCount;
  await expect(drawer.getByRole('slider', { name: 'Brightness' })).toBeDisabled();
  await expect(drawer).toContainText('exact card and installed project are verified');
  expect(controlRequestCount).toBe(blockedRequests);
  projectFingerprint = matchingProjectFingerprint;
  await verifyCard(page, projectFingerprint);
  await expect(drawer.getByRole('slider', { name: 'Brightness' })).toBeEnabled();

  await expect(drawer).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('button', { name: 'Blackout' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const phoneBox = await drawer.boundingBox();
  expect(phoneBox).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopBox = await drawer.boundingBox();
  expect(desktopBox?.width).toBeLessThanOrEqual(430);
  expect(desktopBox?.height).toBe(800);
  expect(Math.round((desktopBox?.x || 0) + (desktopBox?.width || 0))).toBe(1280);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer.locator('select[aria-label="Pattern"]')).toHaveValue('bench-warm');
  const blackout = drawer.getByRole('button', { name: 'Blackout' });
  await expect(blackout).toHaveAttribute('aria-pressed', 'false');
  await drawer.getByRole('button', { name: 'Close card controls' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(blackout).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(footer).toBeFocused();
  await footer.click();
  await expect(drawer).toBeVisible();

  const speed = drawer.getByRole('slider', { name: 'Speed' });
  await speed.focus();
  await speed.fill('1.5');
  await expect.poll(() => Boolean(releasePendingControl)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('button', { name: 'Close card controls' })).toBeFocused();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('button', { name: 'Close card controls' })).toBeFocused();
  releasePendingControl?.();
  await expect(speed).toBeEnabled();

  await page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    getSharedCardLink().dispatch({ type: 'operation-failed' });
  });
  await expect(footer).toHaveAccessibleName(/Needs attention/);
  await expect(drawer.getByRole('slider', { name: 'Brightness' })).toBeDisabled();
  await drawer.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver' })).toBeVisible();
  await page.getByRole('button', { name: 'Close connection center' }).click();
  await footer.click();
  await expect(page).toHaveURL(/#screen=card&section=setup/);
  await expect(page.getByTestId('card-workspace-heading')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver' })).toHaveCount(0);
  await page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    getSharedCardLink().dispatch({ type: 'operation-confirmed' });
  });
  await footer.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Warm palette' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Cool palette' })).toBeVisible();
  await expect(drawer.getByRole('checkbox', { name: 'Breathe' })).toHaveCount(0);
  const brightness = drawer.getByRole('slider', { name: 'Brightness' });
  await brightness.fill('40');
  // The card answers 503 once and then takes it. That is a moment, not a
  // decision, so Studio waits it out: the change lands, the slider stays where
  // the owner put it, and no Retry button appears. It used to revert the
  // slider to 70 and hand back a button — an interruption about something that
  // had already passed.
  await expect(brightness).toHaveValue('40');
  await expect(drawer.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Rainbow palette' }).click();
  await expect.poll(() => controlBody?.drift).toBe(true);
  expect(controlBody).toMatchObject({ driftMin: 0, driftMax: 255 });
  await expect(drawer.getByText(/GPIO|Wiring|Wi-?Fi|Firmware|Install|Reboot|Factory reset/i)).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Next pattern' }).click();
  await expect.poll(() => controlBody?.patternId).toBe('combo-moon-look');
  expect(controlBody?.syncZones).toBe(true);
  await expect(drawer.locator('select[aria-label="Pattern"]')).toHaveValue('combo-moon-look');
  await drawer.getByRole('button', { name: 'Advanced editing' }).click();
  await expect(page).toHaveURL(/#screen=pattern$/, { timeout: 20_000 });
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await expect(page.getByTestId('project-stack-card').getByRole('button', { name: 'Select Moon look' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => new URL(page.url()).searchParams.has('editLook')).toBe(false);
});
