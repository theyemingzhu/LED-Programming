import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { createDefaultCircleLayout } from '../src/lib/defaultCircleLayout.js';
import { createDefaultPatchBoard } from '../src/lib/patchBoard.js';
import { makeDefaultWiring } from '../src/lib/wiringModel.js';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';
import { createCardSimulator } from './harness/cardSimulator';

const CARD_ID = 'lw-three-gpio-combo-playlist';
const BUILD_ID = 'three-gpio-playlist-build';
const SECTION_PATTERNS = [
  { id: 'patch-default-outer-circle', patternId: 'fire' },
  { id: 'patch-default-inner-circle', patternId: 'ocean' },
  { id: 'patch-default-ring-3', patternId: 'plasma' },
];

function makeThreeOutputProject() {
  const project = createDefaultProject();
  project.id = 'three-gpio-combo-playlist-project';
  project.name = 'Three GPIO combo acceptance';
  project.layout.starterPending = false;
  project.layout.strips = createDefaultCircleLayout({ sectionPixelCounts: [7, 11, 19] });
  project.layout.patchBoard = createDefaultPatchBoard(project.layout.strips);
  project.layout.wiring = makeDefaultWiring(project.layout.strips);
  project.layout.wiring.outputs = project.layout.wiring.runs.map((run, index) => ({
    id: `out${index + 1}`,
    name: `GPIO ${16 + index}`,
    pin: 16 + index,
    runIds: [run.id],
  }));
  project.layout.patchBoard.dataWireCount = 3;
  return project;
}

test('three GPIO section patterns stay in Layout and a kept combo installs with its playlist', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const expectedSignedOutSessionErrors: string[] = [];
  const sessionProbePaths: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const url = message.location().url;
    const expectedSignedOutSession = message.text().includes('status of 401')
      && (url.endsWith('/api/account/session') || url.endsWith('/api/library/session'));
    if (expectedSignedOutSession) expectedSignedOutSessionErrors.push(message.text());
    else consoleErrors.push(message.text());
  });

  const project = makeThreeOutputProject();
  const deployment = prepareCardDeployment({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 0,
    strips: project.layout.strips,
    patchBoard: project.layout.patchBoard,
    wiring: project.layout.wiring,
    standaloneController: project.devices.standaloneController,
  });
  const installedConfig = deployment.runtimePackage.config;
  const initialOutputs = installedConfig.led.outputs.map(output => ({ ...output }));
  const currentId = installedConfig.startupPatternId;
  const patterns = installedConfig.looks.map(look => ({ id: look.id, label: look.label }));
  const card = createCardSimulator({
    id: 'three-gpio-playlist-card',
    describe: 'exact card holding the three-output project under test',
    projectId: project.id,
    projectName: project.name,
    projectRevision: installedConfig.projectRevision,
    projectFingerprint: installedConfig.projectFingerprint,
    provisionalSetup: false,
    pin: initialOutputs[0].pin,
    pixels: initialOutputs.reduce((sum, output) => sum + output.pixels, 0),
    patterns,
    currentIndex: Math.max(0, patterns.findIndex(pattern => pattern.id === currentId)),
    currentId,
    wiringTransactionOpen: false,
    buildId: BUILD_ID,
    buildNumber: 1,
    firmwareVersion: '1.0.0',
    dropFirstRequests: 0,
  }, { cardId: CARD_ID, initialOutputs });

  // Vite does not host Pages Functions. Match the app's real signed-out
  // session response so only those two expected probes return 401; unrelated
  // console and page errors remain fatal below.
  const unauthenticatedSession = async route => {
    sessionProbePaths.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 401,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ error: { code: 'unauthenticated', message: 'Sign in to continue.' } }),
    });
  };
  await page.route('**/api/account/session', unauthenticatedSession);
  await page.route('**/api/library/session', unauthenticatedSession);

  await page.addInitScript(({ id, build, savedProject }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id, firmwareVersion: '1.0.0', buildId: build,
    }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    if (!localStorage.getItem('lw_autosave_v3')) {
      localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
    }
  }, { id: CARD_ID, build: BUILD_ID, savedProject: project });
  await card.install(page);

  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(async () => {
    const state = (await import('/src/lib/cardLink.js')).getCardLinkState();
    return { state: state.state, cardId: state.card?.id };
  })).toEqual({ state: 'connected-direct', cardId: CARD_ID });
  await expect(page.getByTestId('card-link-status')).toContainText('Connected');
  await page.getByTestId('card-link-status').click();
  const cardControls = page.getByRole('dialog', { name: `${project.name} controls` });
  await expect(cardControls).toBeVisible();
  await expect(cardControls).toContainText('Connected on local network');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await cardControls.getByRole('button', { name: 'Close card controls' }).click();

  // Exercise Layout's own GPIO controls for two strips while keeping the
  // final wiring aligned with what the exact card reports.
  const expectedOutputs = [[16, 7], [17, 11], [18, 19]];
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[16, 1], [17, 1], [18, 1]]);
  for (const [stripName, interimPin, finalPin] of [['Inner circle', 16, 17], ['Ring 3', 16, 18]] as const) {
    await page.locator('.la-strip-row').filter({ hasText: stripName }).click();
    await page.getByLabel('GPIO output').selectOption(String(interimPin));
    await page.getByLabel('GPIO output').selectOption(String(finalPin));
  }
  expect(initialOutputs.map(output => [output.pin, output.pixels])).toEqual(expectedOutputs);
  for (const [pin, count] of expectedOutputs) {
    const gpioGroup = page.getByTestId(`gpio-group-${pin}`);
    await expect(gpioGroup).toBeVisible();
    await expect(gpioGroup).toContainText(`${count} LEDs`);
  }

  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await expect(page.locator('.pm')).toBeVisible();
  for (const section of SECTION_PATTERNS) {
    await page.getByTestId(`section-target-${section.id}`).click();
    await page.locator(`.pm-cards .pmcard[data-pattern-id="${section.patternId}"]`).click();
  }
  await page.getByTestId('look-name').fill('Three-output combo');
  await page.getByTestId('look-save-preset').click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.devices?.standaloneController?.looks?.some(look => look.label === 'Three-output combo');
  })).toBe(true);

  // Keep must commit the section draft to the project Layout uses. This is
  // the regression guard for a Patterns-only working copy that looks right
  // there but leaves Layout and the install payload stale.
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await expect(page).toHaveURL(/#screen=layout/);
  for (const [pin, count] of expectedOutputs) {
    const gpioGroup = page.getByTestId(`gpio-group-${pin}`);
    await expect(gpioGroup).toBeVisible();
    await expect(gpioGroup).toContainText(`${count} LEDs`);
  }
  for (const section of SECTION_PATTERNS) {
    const action = page.locator(`[data-testid="layout-section-pattern-action"][data-target-id="${section.id}"]`);
    await expect(action).toContainText(section.patternId === 'fire' ? 'Fire' : section.patternId === 'ocean' ? 'Ocean' : 'Plasma');
  }
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.layout?.patchBoard?.patches?.map((patch: any) => patch.playback?.patternId);
  })).toEqual(['fire', 'ocean', 'plasma']);
  const keptProject = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  expect(keptProject.layout.patchBoard.patches.map(patch => patch.playback.patternId)).toEqual(['fire', 'ocean', 'plasma']);

  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  const savedLook = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.devices?.standaloneController?.looks?.find(look => look.label === 'Three-output combo');
  });
  expect(savedLook).toBeTruthy();
  const comboCard = page.locator(`.pmcard[data-pattern-id="${savedLook.id}"]`);
  await expect(comboCard).toBeVisible();
  await page.getByRole('button', { name: 'Add Three-output combo to playlist' }).click();
  await expect(page.getByRole('button', { name: 'Remove Three-output combo from playlist' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByTestId('workspace-notice')).toContainText('saved in browser library');
  await expect.poll(() => page.evaluate(({ lookId }) => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.devices?.standaloneController?.playlist?.some(item => item.type === 'combo' && item.lookId === lookId) || false;
  }, { lookId: savedLook.id })).toBe(true);
  const playlistProject = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  const comboEntry = playlistProject.devices.standaloneController.playlist.find(item => item.type === 'combo' && item.lookId === savedLook.id);
  expect(comboEntry).toBeTruthy();
  expect(savedLook.sectionLooks).toMatchObject({
    'patch-default-outer-circle': { patternId: 'fire' },
    'patch-default-inner-circle': { patternId: 'ocean' },
    'patch-default-ring-3': { patternId: 'plasma' },
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pm')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Three-output combo from playlist' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await expect(page.getByTestId('playlist-row-combo-' + savedLook.id)).toBeVisible();
  await page.getByTestId('playlist-enabled-toggle').click();
  const configRequest = page.waitForRequest(request => request.url().endsWith('/api/config') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Install playlist on card' }).click();
  await configRequest;
  await expect(page.getByTestId('playlist-card-status')).toContainText('Playlist installed on card.');

  const installPayload = card.requests.filter(request => request.path === '/api/config').at(-1)?.body as any;
  expect(installPayload).toBeTruthy();
  expect(installPayload.led.outputs.map(output => [output.pin, output.pixels])).toEqual(expectedOutputs);
  expect(installPayload.zones.map(zone => [zone.id, zone.patternId])).toEqual([
    ['default-outer-circle', 'fire'],
    ['default-inner-circle', 'ocean'],
    ['default-ring-3', 'plasma'],
  ]);
  expect(installPayload.looks.find(look => look.id === comboEntry.id)).toMatchObject({
    id: comboEntry.id,
    mode: 'combo',
    zones: [
      expect.objectContaining({ id: 'default-outer-circle', patternId: 'fire' }),
      expect.objectContaining({ id: 'default-inner-circle', patternId: 'ocean' }),
      expect.objectContaining({ id: 'default-ring-3', patternId: 'plasma' }),
    ],
  });
  expect(installPayload.playlist).toMatchObject({
    enabled: true,
    entries: [expect.objectContaining({ patternId: comboEntry.id })],
  });
  const readback = await page.evaluate(async () => {
    const [firmwareResponse, statusResponse, patternsResponse, zonesResponse] = await Promise.all([
      fetch('http://lightweaver.local/api/firmware-info'),
      fetch('http://lightweaver.local/api/status'),
      fetch('http://lightweaver.local/api/patterns'),
      fetch('http://lightweaver.local/api/zones'),
    ]);
    return {
      firmware: await firmwareResponse.json(),
      status: await statusResponse.json(),
      patterns: await patternsResponse.json(),
      zones: await zonesResponse.json(),
    };
  });
  expect(readback.status.outputs.map(output => [output.pin, output.pixels])).toEqual(expectedOutputs);
  expect(readback.status.projectFingerprint).toBe(installPayload.projectFingerprint);
  expect(readback.firmware.outputs.map(output => [output.pin, output.pixels])).toEqual(expectedOutputs);
  expect(readback.patterns.patterns.find(look => look.id === comboEntry.id)).toMatchObject({
    mode: 'combo',
    zones: [
      expect.objectContaining({ id: 'default-outer-circle', patternId: 'fire' }),
      expect.objectContaining({ id: 'default-inner-circle', patternId: 'ocean' }),
      expect.objectContaining({ id: 'default-ring-3', patternId: 'plasma' }),
    ],
  });
  expect(readback.patterns.playlist).toEqual(installPayload.playlist);
  expect(readback.zones.zones.map(zone => [zone.id, zone.patternId])).toEqual([
    ['default-outer-circle', 'fire'],
    ['default-inner-circle', 'ocean'],
    ['default-ring-3', 'plasma'],
  ]);
  expect(sessionProbePaths).toContain('/api/account/session');
  await expect(page.getByRole('dialog').filter({ hasText: /sign in|account permission|owner login/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sign in required|sign in to install/i })).toHaveCount(0);
  expect(expectedSignedOutSessionErrors.every(message => message.includes('status of 401'))).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(card.unhandled).toEqual([]);
});
