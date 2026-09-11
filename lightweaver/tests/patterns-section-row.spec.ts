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
  const zones = compiledZones(project).map(zone => ({ id: zone.id, label: zone.label }));
  await mockReadyCard(page, project, zones);

  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toHaveText('Fire');
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Ocean');
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

  const holds = page.getByTestId('card-holds');
  await expect(holds).toHaveText(`Card holds ${zones.map(zone => zone.label).join(', ')}`);
  await expect(page.getByTestId('divide-in-layout')).toHaveCount(0);
  // Phone width: the row must not push the page sideways. (Taps are exercised
  // at desktop width above: at 390px the sticky instrument pane covers the
  // section row, a pre-existing layout defect logged in TODO.md, not this row's.)
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toHaveText('Plasma');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
});

test('a card still holding one section says so and points at Install', async ({ page }) => {
  const project = sectionProject('section-row-single');
  await mockReadyCard(page, project, [{ id: 'all', label: 'All' }]);
  await expect(page.getByTestId('card-holds')).toHaveText('Card holds one section; Install to send yours');
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
  await mockReadyCard(page, project, zones.map(zone => ({ id: zone.id, label: zone.label })));
  await expect(page.getByTestId('card-holds')).toHaveText(`Card holds ${zones[0].label}`);
  await page.getByTestId('divide-in-layout').click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw/);
});
