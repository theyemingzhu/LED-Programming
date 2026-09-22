import { test, expect } from '@playwright/test';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';

const CARD_ID = 'lw-expression-install';
const BUILD_ID = 'e'.repeat(40);

function sceneFixture() {
  return {
    format: 'lightweaver-expression-scene', version: 1,
    id: 'scene-install', name: 'Gallery tide',
    defaults: {
      pattern: { rendererId: 'aurora', speed: 1 },
      color: {
        kind: 'card-controls', hueShift: 0, customHue: 32, customSaturation: 230,
        customBreathe: false, breatheLowerPct: 85, breatheUpperPct: 100,
        breatheCycleSeconds: 9, customDrift: false,
      },
      intensity: { brightness: 0.8 },
    },
    steps: [{
      id: 'opening', label: 'Opening', holdMs: 30000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 }, assignments: [],
    }],
    loop: { mode: 'repeat' },
  };
}

function projectFixture() {
  const project = createDefaultProject();
  project.id = 'project-expression-install';
  project.name = 'Expression install fixture';
  project.layout.starterPending = false;
  project.layout.wiring.locked = true;
  project.layout.wiring.verified = true;
  project.layout.wiring.runs.forEach(run => { run.verified = true; });
  project.devices.standaloneController.led.colorOrderConfirmed = true;
  project.devices.standaloneController.led.confirmedColorOrder = 'RGB';
  project.devices.standaloneController.looks = [{
    id: 'library-look', label: 'Saved library look',
    defaultLook: { patternId: 'ocean' }, sectionLooks: {}, updatedAt: 1,
  }];
  project.expressionScenes = {
    version: 1, activeSceneId: 'scene-install', playbackSceneId: null,
    scenes: [sceneFixture()],
  };
  return project;
}

function currentConfig(project: any) {
  return prepareCardDeployment({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 0,
    projectFingerprint: 'f'.repeat(64),
    strips: project.layout.strips,
    patchBoard: project.layout.patchBoard,
    wiring: project.layout.wiring,
    standaloneController: project.devices.standaloneController,
  }).config;
}

async function mockCard(page: any, options: any = {}) {
  const project = projectFixture();
  if (options.unsupportedScene) {
    project.expressionScenes.scenes[0].steps[0].transitionFromPrevious = { mode: 'dip-swap-rise', durationMs: 1000 };
  }
  const initialConfig = currentConfig(project);
  const state = {
    operations: [] as string[],
    chunks: [] as string[],
    envelope: null as any,
    runtime: null as any,
    configWrites: 0,
  };
  const status = () => {
    const config = state.runtime?.config || initialConfig;
    return {
      app: 'Lightweaver', provisioningContractVersion: 1, ok: true,
      cardId: CARD_ID, firmwareVersion: '1.2.3', buildId: BUILD_ID, bootId: 'boot-expression-1',
      runtimePhase: 'ready', knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
      projectId: config.piece.id,
      projectRevision: config.projectRevision,
      projectFingerprint: options.wrongRuntimeFingerprint && state.runtime ? '0'.repeat(64) : config.projectFingerprint,
      led: config.led,
      outputs: config.led.outputs,
      limits: { maxLooks: 64 }, maxPixels: 4096,
    };
  };
  await page.route('http://lightweaver.local/**', async (route: any) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/status') return route.fulfill({ json: status() });
    if (pathname === '/api/firmware-info') return route.fulfill({ json: {
      ...status(), pixels: status().led.pixels, outputs: status().outputs,
    } });
    if (pathname === '/api/wiring/status') return route.fulfill({ json: {
      ok: true, state: 'known-good', hasCandidate: false,
      cardId: CARD_ID, firmwareVersion: '1.2.3', buildId: BUILD_ID,
      currentOutputs: status().outputs,
    } });
    if (pathname === '/api/owner/capability') {
      state.operations.push('owner-capability');
      return route.fulfill({ json: { capability: 'owner-capability', cardId: CARD_ID, bootId: 'boot-expression-1', expiresInMs: 60000 } });
    }
    if (pathname === '/api/projects/preflight') {
      state.operations.push('source-preflight');
      if (options.pairingRequired) return route.fulfill({ json: { ok: false, reason: 'pairing-required' } });
      return route.fulfill({ json: { ok: true, chunkSize: 1000000 } });
    }
    if (pathname === '/api/projects/begin') {
      state.operations.push('source-begin'); state.chunks = [];
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/projects/chunk') {
      state.operations.push('source-chunk');
      state.chunks.push(JSON.parse(request.postData() || '{}').data);
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/projects/commit') {
      state.operations.push('source-commit');
      state.envelope = JSON.parse(Buffer.concat(state.chunks.map(chunk => Buffer.from(chunk, 'base64'))).toString('utf8'));
      if (options.forgeSourceAfterCommit) state.envelope.project.name = 'Forged readback';
      return route.fulfill({ json: { ok: true, head: state.envelope.contentHash, capabilityHeadAdvanced: true } });
    }
    if (pathname === '/api/projects/read') {
      state.operations.push('source-read');
      return route.fulfill({ json: { envelope: state.envelope } });
    }
    if (pathname === '/api/config') {
      state.operations.push('runtime-config'); state.configWrites += 1;
      if (options.delayRuntimeMs) await new Promise(resolve => setTimeout(resolve, options.delayRuntimeMs));
      state.runtime = { config: JSON.parse(request.postData() || '{}') };
      return route.fulfill({ json: { ok: true, delivered: true, cardId: CARD_ID, requiresReboot: false } });
    }
    if (pathname === '/api/patterns') return route.fulfill({ json: {
      patterns: (state.runtime?.config?.looks || []).map((look: any) => ({ id: look.id })),
    } });
    if (pathname === '/api/zones') return route.fulfill({ json: {
      zones: (state.runtime?.config?.zones || []).map((zone: any) => ({ id: zone.id })),
    } });
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  await page.addInitScript(({ cardId, buildId, seededProject }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion: '1.2.3', buildId }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(seededProject));
  }, { cardId: CARD_ID, buildId: BUILD_ID, seededProject: project });
  return state;
}

async function openSceneEditor(page: any) {
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByLabel('Scene title')).toHaveValue('Gallery tide');
}

test('installs exact scene source and runtime only after verified readbacks', async ({ page }) => {
  const card = await mockCard(page);
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await expect(page.getByText('1 scene step will replace the card playlist.')).toBeVisible();
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Scene source and playback were verified on the card.')).toBeVisible();

  expect(card.envelope.project.expressionScenes.playbackSceneId).toBe('scene-install');
  expect(card.envelope.project.expressionScenes.scenes[0].name).toBe('Gallery tide');
  expect(card.envelope.project.devices.standaloneController.looks[0].id).toBe('library-look');
  expect(card.runtime.config.projectFingerprint).toBe(card.envelope.contentHash);
  expect(card.runtime.config.playlist.entries).toHaveLength(1);
  expect(card.operations.indexOf('source-commit')).toBeLessThan(card.operations.indexOf('runtime-config'));
  expect(card.operations.at(-1)).toBe('source-read');

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').expressionScenes?.playbackSceneId)).toBe('scene-install');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByRole('button', { name: 'Put scene on card', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toHaveCount(0);
});

test('pairing rejection stops before runtime delivery', async ({ page }) => {
  const card = await mockCard(page, { pairingRequired: true });
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.locator('.sexp-delivery')).toHaveAttribute('data-reason', 'pairing-required');
  expect(card.configWrites).toBe(0);
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toHaveCount(0);
});

test('unsupported scenes cannot start delivery', async ({ page }) => {
  const card = await mockCard(page, { unsupportedScene: true });
  await openSceneEditor(page);
  await expect(page.getByText('Studio preview only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Put scene on card' })).toBeDisabled();
  expect(card.operations).toEqual([]);
  expect(card.configWrites).toBe(0);
});

test('source hash mismatch stops before the runtime write', async ({ page }) => {
  const card = await mockCard(page, { forgeSourceAfterCommit: true });
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.getByText(/scene was not installed|editable source was saved/i)).toBeVisible({ timeout: 15000 });
  expect(card.configWrites).toBe(0);
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toHaveCount(0);
});

test('editing during install retains the newer draft and shows the installed snapshot separately', async ({ page }) => {
  const card = await mockCard(page, { delayRuntimeMs: 700 });
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect.poll(() => card.operations.includes('runtime-config')).toBe(true);
  await page.getByLabel('Scene title').fill('Newer local draft');
  await expect(page.getByText('An earlier snapshot is verified on the card. This draft has newer edits.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Scene title')).toHaveValue('Newer local draft');
  expect(card.envelope.project.expressionScenes.scenes[0].name).toBe('Gallery tide');
  expect(card.runtime.config.projectFingerprint).toBe(card.envelope.contentHash);
});

test('runtime readback mismatch never reports the scene as on card', async ({ page }) => {
  const card = await mockCard(page, { wrongRuntimeFingerprint: true });
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.locator('.sexp-delivery')).toHaveAttribute('data-reason', 'read-back-mismatch');
  expect(card.configWrites).toBe(1);
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toHaveCount(0);
});

test('global Save to card preserves scene playback after a later edit', async ({ page }) => {
  const card = await mockCard(page);
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toBeVisible();

  await page.getByLabel('Scene title').fill('Edited gallery tide');
  const cardStatus = page.getByTestId('card-link-status');
  await expect(cardStatus).toHaveAttribute('data-lifecycle-state', 'content-mismatch');
  await cardStatus.click();
  await expect.poll(() => card.configWrites).toBe(2);
  await expect.poll(() => card.envelope?.project?.expressionScenes?.scenes?.[0]?.name).toBe('Edited gallery tide');
  expect(card.envelope.project.expressionScenes.playbackSceneId).toBe('scene-install');
  expect(card.runtime.config.playlist.entries[0].patternId).toBe('combo-scene-install-opening');
  expect(card.runtime.config.looks.some((look: any) => look.id === 'combo-scene-install-opening')).toBe(true);
});
