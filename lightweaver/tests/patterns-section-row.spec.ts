import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { buildCardRuntimePackageFromProject } from '../src/lib/cardRuntimeProject.js';
import { compileWiring } from '../src/lib/wiringCompiler.js';
import { cardProjectFingerprint } from '../src/lib/cardProjectResolver.js';
import { makeDefaultWiring } from '../src/lib/wiringModel.js';

// The section row on Patterns (sections-effortless plan, change 2): each chip
// carries its section's pattern name, one status line says what the card
// holds (read from the card's own /api/zones, never guessed), and a piece with
// one section gets a word link to Layout instead of an empty row.

function sectionProject(id: string) {
  const project = createDefaultProject();
  project.id = id;
  project.name = 'Section row fixture';
  project.layout.patchBoard.patches[0].playback.patternId = 'fire';
  project.layout.patchBoard.patches[1].playback.patternId = 'ocean';
  return project;
}

function compiledZones(project) {
  return compileWiring({
    wiring: project.layout.wiring,
    strips: project.layout.strips,
    groups: project.layout.layerGroups,
  }).zones;
}

const controlPosts: Record<string, unknown>[] = [];

async function mockReadyCard(page, project, cardZones, cardId = 'lw-section-row') {
  controlPosts.length = 0;
  const projectFingerprint = cardProjectFingerprint(project);
  const installedConfig = buildCardRuntimePackageFromProject({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 0,
    projectFingerprint,
    strips: project.layout.strips,
    patchBoard: project.layout.patchBoard,
    compiledWiring: compileWiring({ wiring: project.layout.wiring, strips: project.layout.strips, groups: project.layout.layerGroups }),
    standaloneController: project.devices.standaloneController,
  }).config;
  await page.route('**/api/zones', route => route.fulfill({ json: { zones: cardZones } }));
  await page.route('**/api/firmware-info', route => route.fulfill({ json: {
    app: 'Lightweaver', cardId, firmwareVersion: '1.0.0', buildId: 'section-row-build',
    projectId: project.id, projectRevision: 0, projectFingerprint,
    outputs: installedConfig.led.outputs,
  } }));
  await page.route('**/api/status', route => route.fulfill({ json: {
    app: 'Lightweaver', ok: true, provisioningContractVersion: 1,
    cardId, firmwareVersion: '1.0.0', buildId: 'section-row-build',
    bootId: `${cardId}-boot`, runtimePhase: 'ready', knownGoodProject: true,
    commandReady: true, outputReady: true, playbackReady: true,
    projectId: project.id, piece: { id: project.id }, projectRevision: 0, projectFingerprint,
    led: { pixels: installedConfig.led.pixels },
  } }));
  await page.route('**/api/config', route => route.fulfill({ json: installedConfig }));
  await page.route('**/api/control', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    controlPosts.push(body);
    await route.fulfill({ json: { ok: true, cardId, patternId: body.patternId, revision: body.revision } });
  });
  await page.addInitScript(({ id, savedProject }) => {
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion: '1.0.0', buildId: 'section-row-build' }));
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
  }, { id: cardId, savedProject: project });
  await page.goto('/#screen=patterns', { waitUntil: 'domcontentloaded' });
  const issued = await page.evaluate(async authorization => {
    const { issueCardEditAuthorization } = await import('/src/lib/cardEditAuthorization.js');
    return issueCardEditAuthorization(authorization);
  }, {
    intent: '', cardId, firmwareVersion: '1.0.0', buildId: 'section-row-build', bootId: `${cardId}-boot`,
    installedProjectId: project.id, installedProjectFingerprint: projectFingerprint,
    studioProjectId: project.id, studioProjectFingerprint: projectFingerprint, projectGeneration: 0,
  });
  expect(issued).toBe(true);
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  await expect(page).toHaveURL(/#screen=layout/);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await expect(page.locator('.pm')).toBeVisible();
}


test('section chips carry their pattern names and the card-holds line is read from the card', async ({ page }) => {
  const project = sectionProject('section-row-full');
  project.layout.wiring.outputs = [
    { id: 'out1', name: 'Outer output', pin: 16, runIds: ['run-default-outer-circle'] },
    { id: 'out2', name: 'Inner output', pin: 17, runIds: ['run-default-inner-circle'] },
  ];
  const zones = compiledZones(project).map(zone => ({ id: zone.id, label: zone.label, ranges: zone.ranges }));
  await mockReadyCard(page, project, zones);

  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toHaveText('Fire');
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Ocean');
  await expect(page.getByTestId('section-gpio-patch-default-outer-circle')).toHaveText('GPIO 16');
  await expect(page.getByTestId('section-gpio-patch-default-inner-circle')).toHaveText('GPIO 17');
  await expect(page.getByTestId('pattern-bank-scope')).toBeVisible();
  await expect(page.getByTestId('section-target-all')).toContainText('Mixed');
  // Picking a pattern for a section updates its chip at once.
  await page.getByTestId('section-target-patch-default-inner-circle').click();
  // Tapping the chip flashes that section on the piece: the OTHER zone dims
  // to a fifth of its reported brightness, then returns to that value. The
  // tapped zone is never written by the flash.
  const outerZone = zones.find(zone => zone.id !== 'default-inner-circle')!.id;
  await expect.poll(() => controlPosts
    .filter(post => post.zone === outerZone && post.syncZones === false && typeof post.brightness === 'number')
    .map(post => post.brightness)).toEqual([0.2, 1]);
  await page.locator('.pm-cards .pmcard[data-pattern-id="plasma"]').click();
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Plasma');
  // One tap makes every section share the selected section's look.
  await page.getByTestId('use-on-every-section').click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toHaveText('Plasma');
  await expect(page.getByTestId('section-pattern-all')).toHaveText('Plasma');

  const holds = page.getByTestId('card-holds');
  await expect(holds).toHaveText(`Card holds ${zones.map(zone => zone.label).join(', ')}`);
  await expect(page.getByTestId('divide-in-layout')).toHaveCount(0);
  // The compact artwork preview and section rows remain tappable at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Plasma');
  await expect(page.getByTestId('pattern-piece-preview')).toBeVisible();
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await expect(page.getByTestId('section-target-patch-default-outer-circle')).toHaveClass(/\bon\b/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
});

test('a card still holding one section says so and points at Install', async ({ page }) => {
  const project = sectionProject('section-row-single');
  await mockReadyCard(page, project, [{ id: 'all', label: 'All' }]);
  await expect(page.getByTestId('card-holds')).toHaveText('Card holds one section; Install to send yours');
});

test('unequal GPIO sections keep their layout preview and same or separate patterns across screens', async ({ page }, testInfo) => {
  const project = sectionProject('two-gpio-screen-journey');
  project.layout.starterPending = false;
  project.layout.wiring.outputs = [
    { id: 'out1', name: 'Outer output', pin: 16, runIds: ['run-default-outer-circle'] },
    { id: 'out2', name: 'Inner output', pin: 17, runIds: ['run-default-inner-circle'] },
  ];
  const zones = compiledZones(project).map(zone => ({ id: zone.id, label: zone.label, ranges: zone.ranges }));
  await mockReadyCard(page, project, zones);
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  await expect(page.getByTestId('gpio-group-16')).toContainText('27 LEDs');
  await expect(page.getByTestId('gpio-group-17')).toContainText('17 LEDs');
  await expect(page.getByTestId('layout-section-pattern-action')).toHaveCount(2);
  await page.getByTestId('gpio-group-16').screenshot({ path: testInfo.outputPath('two-gpio-layout-row.png') });
  await page.getByTestId('layout-section-pattern-action').filter({ hasText: 'Fire' }).click();
  const gallery = page.getByRole('dialog', { name: 'Choose pattern for Outer circle' });
  await expect(gallery.getByTestId('layout-pattern-audition-canvas')).toBeVisible();
  await gallery.getByRole('button', { name: 'Fire', exact: true }).click();
  await expect(gallery).toBeVisible();
  await expect(page).toHaveURL(/#screen=layout/);
  await gallery.getByRole('button', { name: 'Close pattern gallery' }).click();
  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await expect(page).toHaveURL(/#screen=pattern/);
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await expect(page.getByTestId('section-target-patch-default-outer-circle')).toHaveClass(/\bon\b/);
  await page.getByTestId('use-on-every-section').click();
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Fire');
  await page.getByTestId('section-target-patch-default-inner-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="ocean"]').click();
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Ocean');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('pattern-piece-preview')).toBeVisible();
  await page.getByTestId('pattern-piece-preview').screenshot({ path: testInfo.outputPath('two-gpio-patterns-phone.png') });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')
    .layout?.patchBoard?.patches?.map((patch: any) => patch.playback?.patternId))).toEqual(['fire', 'ocean']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('section-gpio-patch-default-outer-circle')).toHaveText('GPIO 16');
  await expect(page.getByTestId('section-gpio-patch-default-inner-circle')).toHaveText('GPIO 17');
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toHaveText('Fire');
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Ocean');
});

test('All uses the common section look when the saved default differs', async ({ page }) => {
  const project = sectionProject('uniform-section-look');
  project.layout.patchBoard.patches[0].playback.patternId = 'ocean';
  project.devices.standaloneController.defaultLook.patternId = 'fire';
  await mockReadyCard(page, project, compiledZones(project).map(zone => ({ id: zone.id, label: zone.label, ranges: zone.ranges })));
  await expect(page.getByTestId('section-pattern-all')).toHaveText('Ocean');
  await page.getByTestId('section-target-all').click();
  await expect(page.getByTestId('pattern-preview-meta')).toContainText('Ocean');
  await expect.poll(() => controlPosts.some(post => post.patternId === 'ocean')).toBe(true);
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toHaveText('Ocean');
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Ocean');
});

test('a one-section piece offers Divide in Layout instead of an empty row', async ({ page }) => {
  const project = sectionProject('section-row-one');
  // Keep only the outer strip so the project compiles to one zone.
  project.layout.strips = project.layout.strips.slice(0, 1);
  project.layout.patchBoard.patches = project.layout.patchBoard.patches.slice(0, 1);
  project.layout.patchBoard.chains = (project.layout.patchBoard.chains || []).map(chain => ({ ...chain, rowIds: chain.rowIds.slice(0, 1) }));
  project.layout.wiring = makeDefaultWiring(project.layout.strips);
  project.layout.layerGroups = [];
  const zones = compiledZones(project);
  await mockReadyCard(page, project, zones.map(zone => ({ id: zone.id, label: zone.label, ranges: zone.ranges })));
  await expect(page.getByTestId('card-holds')).toHaveText(`Card holds ${zones[0].label}`);
  await page.getByTestId('divide-in-layout').click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw/);
});


test('a reused section ID with stale ranges cannot change the whole installed strip', async ({ page }) => {
  const project = sectionProject('section-range-regression');
  const zones = compiledZones(project);
  const total = project.layout.strips.reduce((sum, strip) => sum + strip.pixelCount, 0);
  const cardZones = [{ ...zones[0], ranges: [{ start: 0, count: total }], brightness: 1 }];
  await mockReadyCard(page, project, cardZones);
  await expect(page.getByTestId('card-holds')).toHaveText('Card holds one section; Install to send yours');
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="plasma"]').click();
  await expect(page.getByText(/The card still has a different section layout/)).toBeVisible();
  expect(controlPosts).toEqual([]);
  await expect(page.getByRole('button', { name: 'Test & Install sections', exact: true })).toBeVisible();
  // Once normal installation supplies matching ranges, the same action targets
  // only that section. No global pattern command or configuration write occurs.
  cardZones.splice(0, cardZones.length, ...zones.map(zone => ({ ...zone, brightness: 1 })));
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await expect.poll(() => controlPosts.filter(post => post.patternId === 'fire').length).toBe(1);
  expect(controlPosts.at(-1)).toMatchObject({ zone: zones[0].id, syncZones: false });
});

test('Layout pattern picks immediately play only their mapped card section, including reselect', async ({ page }, testInfo) => {
  const project = sectionProject('layout-live-pattern-pick');
  project.layout.starterPending = false;
  project.layout.wiring.outputs = [
    { id: 'out1', name: 'Outer output', pin: 16, runIds: ['run-default-outer-circle'] },
    { id: 'out2', name: 'Inner output', pin: 17, runIds: ['run-default-inner-circle'] },
  ];
  const zones = compiledZones(project);
  await mockReadyCard(page, project, zones.map(zone => ({ ...zone, brightness: 1 })));
  await page.goto('/#screen=layout');
  const target = page.getByTestId('layout-section-pattern-action')
    .filter({ hasText: 'Ocean' });
  await target.click();
  const gallery = page.getByRole('dialog', { name: /Choose pattern for/ });
  await gallery.getByRole('button', { name: 'Plasma', exact: true }).click();
  const inner = zones.find(zone => zone.label === 'Inner circle') || zones[1];
  await expect.poll(() => controlPosts.filter(post => post.patternId === 'plasma').length).toBe(1);
  expect(controlPosts.at(-1)).toMatchObject({ zone: inner.id, syncZones: false });
  expect(controlPosts.every(post => post.zone !== zones[0].id && post.syncZones !== true)).toBe(true);
  await expect(gallery.getByRole('status')).toHaveText('Playing on card');
  await gallery.screenshot({ path: testInfo.outputPath('layout-pattern-playing-on-card.png') });
  await gallery.getByRole('button', { name: 'Plasma', exact: true }).click();
  await expect.poll(() => controlPosts.filter(post => post.patternId === 'plasma').length).toBe(2);
  expect(controlPosts.at(-1)).toMatchObject({ zone: inner.id, syncZones: false });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')
    .layout?.patchBoard?.patches?.map((patch: any) => patch.playback?.patternId))).toEqual(['fire', 'plasma']);
});

test('Layout refuses a live pattern when the installed section ranges differ', async ({ page }) => {
  const project = sectionProject('layout-stale-section');
  project.layout.starterPending = false;
  const zones = compiledZones(project);
  const staleZones = zones.map((zone, index) => index === 1
    ? { ...zone, ranges: [{ start: 0, count: 1 }] }
    : zone);
  await mockReadyCard(page, project, staleZones);
  await page.goto('/#screen=layout');
  await page.getByTestId('layout-section-pattern-action').filter({ hasText: 'Ocean' }).click();
  const gallery = page.getByRole('dialog', { name: /Choose pattern for/ });
  await gallery.getByRole('button', { name: 'Plasma', exact: true }).click();
  await expect(gallery.getByRole('status')).toContainText('different section layout');
  expect(controlPosts).toEqual([]);
});
