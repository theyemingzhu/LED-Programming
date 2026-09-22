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

function addThirdReversedSection(project: any) {
  const source = structuredClone(project.layout.strips[1]);
  source.id = 'third-section';
  source.name = 'Third section';
  source.pixelCount = 5;
  source.pixels = source.pixels.slice(0, 5).map((pixel: any, index: number) => ({ ...pixel, index, x: pixel.x + 150 }));
  project.layout.strips.push(source);
  project.layout.patchBoard.patches.push({
    id: 'patch-third-section', name: source.name, groupId: null,
    source: { type: 'strip', stripId: source.id, startLed: 0, endLed: 4, autoRange: true },
    output: { mode: 'normal' }, playback: { patternId: null, speed: 1, brightness: 1, hueShift: 0, enabled: null },
  });
  project.layout.patchBoard.chains[0].rowIds.push('patch-third-section');
  project.layout.wiring.runs.push({
    id: 'run-third-section', type: 'strip', source: { stripId: source.id, from: 0, to: 4 },
    directionPolicy: 'flexible', physicalDirection: 'source-reverse', seamLed: null, verified: true,
  });
  project.layout.wiring.outputs[0].runIds = [
    'run-third-section', 'run-default-inner-circle', 'run-default-outer-circle',
  ];
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
  if (options.emptyScenes) {
    project.expressionScenes = { version: 1, activeSceneId: null, playbackSceneId: null, scenes: [] };
  }
  if (options.unsupportedScene) {
    project.expressionScenes.scenes[0].steps[0].transitionFromPrevious = { mode: 'dip-swap-rise', durationMs: 1000 };
  }
  if (options.threeSections) addThirdReversedSection(project);
  const initialConfig = currentConfig(project);
  if (options.layoutMismatch === 'pixel-count') {
    const strip = project.layout.strips.find((item: any) => item.id === 'third-section');
    const last = strip.pixels.at(-1);
    strip.pixels.push({ ...last, index: 5, x: last.x + 12 });
    strip.pixelCount = 6;
    project.layout.wiring.runs.find((run: any) => run.id === 'run-third-section').source.to = 5;
    project.layout.patchBoard.patches.find((patch: any) => patch.id === 'patch-third-section').source.endLed = 5;
  }
  if (options.layoutMismatch === 'output-route') project.layout.wiring.outputs[0].pin = 17;
  if (options.layoutMismatch === 'reversal') {
    project.layout.wiring.runs.find((run: any) => run.id === 'run-third-section').physicalDirection = 'source-forward';
  }
  const state = {
    operations: [] as string[],
    chunks: [] as string[],
    envelope: null as any,
    runtime: null as any,
    configWrites: 0,
    offline: false,
    frames: [] as any[],
    controls: [] as any[],
    forbiddenMutations: [] as string[],
    streaming: false,
    playlist: { configured: true, playing: false, entryIndex: 1, entryCount: 3, patternId: 'ocean', remainingSeconds: 18 },
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
      streaming: state.streaming,
      ...(!options.missingPlaylistSnapshot ? { playlist: { ...state.playlist } } : {}),
    };
  };
  await page.route('http://lightweaver.local/**', async (route: any) => {
    if (state.offline) return route.abort();
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
      if (options.trackPreviewOnly) state.forbiddenMutations.push(pathname);
      state.operations.push('source-preflight');
      if (options.pairingRequired) return route.fulfill({ json: { ok: false, reason: 'pairing-required' } });
      return route.fulfill({ json: { ok: true, chunkSize: 1000000 } });
    }
    if (pathname === '/api/projects/begin') {
      if (options.trackPreviewOnly) state.forbiddenMutations.push(pathname);
      state.operations.push('source-begin'); state.chunks = [];
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/projects/chunk') {
      if (options.trackPreviewOnly) state.forbiddenMutations.push(pathname);
      state.operations.push('source-chunk');
      state.chunks.push(JSON.parse(request.postData() || '{}').data);
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/projects/commit') {
      if (options.trackPreviewOnly) state.forbiddenMutations.push(pathname);
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
      if (options.trackPreviewOnly) state.forbiddenMutations.push(pathname);
      state.operations.push('runtime-config'); state.configWrites += 1;
      if (options.delayRuntimeMs) await new Promise(resolve => setTimeout(resolve, options.delayRuntimeMs));
      state.runtime = { config: JSON.parse(request.postData() || '{}') };
      return route.fulfill({ json: { ok: true, delivered: true, cardId: CARD_ID, requiresReboot: false } });
    }
    if (pathname === '/api/patterns') return route.fulfill({ json: {
      patterns: (state.runtime?.config?.looks || []).map((look: any) => ({ id: look.id })),
    } });
    if (pathname === '/api/zones') return route.fulfill({ json: {
      syncZones: true,
      zones: state.runtime?.config?.zones?.length
        ? state.runtime.config.zones.map((zone: any) => ({ id: zone.id, patternId: zone.patternId }))
        : [{ id: 'all', patternId: state.playlist.patternId, brightness: 0.7 }],
    } });
    if (pathname === '/api/stream/lease') {
      state.streaming = true;
      return route.fulfill({ json: { ok: true, leaseId: 'scene-preview-lease', expiresInMs: 30000, nextSequence: 0 } });
    }
    if (pathname === '/api/stream/frame') {
      const body = JSON.parse(request.postData() || '{}');
      state.frames.push(body);
      return route.fulfill({ json: { ok: true, nextSequence: Number(body.sequence) + 1 } });
    }
    if (pathname === '/api/stream/stop') {
      state.streaming = false;
      state.controls.push({ stopStream: true });
      if (options.advancePlaylistOnStop) state.playlist = { ...state.playlist, playing: true, entryIndex: 2, patternId: 'fire' };
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/control') {
      const body = JSON.parse(request.postData() || '{}');
      state.controls.push(body);
      if (body.cancelStream) {
        state.streaming = false;
        if (options.advancePlaylistOnStop) state.playlist = { ...state.playlist, playing: true, entryIndex: 2, patternId: 'fire' };
      }
      if (body.patternId) state.playlist = { ...state.playlist, playing: false, entryIndex: body.patternId === 'ocean' ? 1 : state.playlist.entryIndex, patternId: body.patternId };
      if (body.playlist === 'play') state.playlist = { ...state.playlist, playing: true };
      if (body.playlist === 'pause') state.playlist = { ...state.playlist, playing: false };
      return route.fulfill({ json: { ok: true, cardId: CARD_ID, appliedPatternId: body.patternId || state.playlist.patternId } });
    }
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  await page.addInitScript(({ cardId, buildId, seededProject }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion: '1.2.3', buildId }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(seededProject));
    (window as any).__sceneExpressionFrames = [];
    class FakeWebSocket {
      readyState = 0;
      bufferedAmount = 0;
      onopen: null | (() => void) = null;
      onerror: null | (() => void) = null;
      onclose: null | (() => void) = null;
      constructor(_url: string) { setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
      send(payload: string) { (window as any).__sceneExpressionFrames.push(payload); }
      close() { this.readyState = 3; this.onclose?.(); }
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: FakeWebSocket });
  }, { cardId: CARD_ID, buildId: BUILD_ID, seededProject: project });
  return state;
}

async function browserFrames(page: any) {
  return page.evaluate(() => (window as any).__sceneExpressionFrames.map((payload: string) => JSON.parse(payload)));
}

async function openSceneEditor(page: any, expectedTitle = 'Gallery tide') {
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByLabel('Scene title')).toHaveValue(expectedTitle);
}

test('installs exact scene source and runtime only after verified readbacks', async ({ page }) => {
  const card = await mockCard(page);
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await expect(page.getByText('1 scene step will replace the card playlist.')).toBeVisible();
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Scene source and playback were verified on the card.')).toBeVisible();
  await expect(page.getByTestId('card-link-status')).toHaveAttribute('data-lifecycle-state', 'ready');
  await expect(page.getByTestId('card-link-status')).toContainText('Connected');

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

test('a pristine new scene is committed to project source before direct install', async ({ page }) => {
  const card = await mockCard(page, { emptyScenes: true });
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page, 'New scene');
  const sceneId = await page.getByLabel('Scene', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toBeVisible();
  expect(card.envelope.project.expressionScenes.activeSceneId).toBe(sceneId);
  expect(card.envelope.project.expressionScenes.playbackSceneId).toBe(sceneId);
  expect(card.envelope.project.expressionScenes.scenes).toHaveLength(1);
  expect(card.envelope.project.expressionScenes.scenes[0].name).toBe('New scene');
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
  await page.setViewportSize({ width: 390, height: 844 });
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
  await expect(page.getByText('An earlier snapshot is verified on the card. This project has newer edits or a different card is connected.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Scene title')).toHaveValue('Newer local draft');
  expect(card.envelope.project.expressionScenes.scenes[0].name).toBe('Gallery tide');
  expect(card.runtime.config.projectFingerprint).toBe(card.envelope.contentHash);
});

test('a non-scene edit during install keeps the newer project and does not claim current On card', async ({ page }) => {
  const card = await mockCard(page, { delayRuntimeMs: 700 });
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect.poll(() => card.operations.includes('runtime-config')).toBe(true);
  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill('Newer project name');
  await page.getByTestId('project-name-input').press('Enter');
  await expect(page.getByText('An earlier snapshot is verified on the card. This project has newer edits or a different card is connected.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Put scene on card', exact: true })).toBeEnabled();
  expect(card.envelope.project.name).toBe('Expression install fixture');
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

test('a later project edit and disconnected target both invalidate current On card', async ({ page }) => {
  const card = await mockCard(page);
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toBeVisible();

  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill('Edited after install');
  await page.getByTestId('project-name-input').press('Enter');
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Put scene on card', exact: true })).toBeEnabled();

  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill('Expression install fixture');
  await page.getByTestId('project-name-input').press('Enter');
  await page.getByRole('button', { name: 'Put scene on card', exact: true }).click();
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toBeVisible();
  card.offline = true;
  await page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    getSharedCardLink().dispatch({ type: 'direct-ping-missed', host: 'lightweaver.local', reason: 'card-stopped-answering' });
  });
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Put scene on card', exact: true })).toBeEnabled();
});

test('scene rehearsal sends an exact three-section physical frame only after explicit start and restores paused playback', async ({ page }) => {
  const card = await mockCard(page, { threeSections: true, trackPreviewOnly: true, advancePlaylistOnStop: true });
  await openSceneEditor(page);
  const preview = page.getByTestId('scene-physical-preview');
  await expect(preview).toBeEnabled();
  expect(await browserFrames(page)).toEqual([]);

  await page.getByLabel('Color', { exact: true }).fill('80');
  await expect(preview).toBeEnabled();

  await preview.click();
  await expect(preview).toHaveText('Stop preview');
  await expect.poll(async () => (await browserFrames(page)).length).toBeGreaterThan(0);
  const firstFrame = (await browserFrames(page))[0].seg[0].i;
  expect(firstFrame).toHaveLength(49);
  expect(firstFrame.every((pixel: unknown) => typeof pixel === 'string' && /^[0-9A-F]{6}$/.test(pixel as string))).toBe(true);

  await preview.click();
  await expect(preview).toHaveText('Try on lights');
  expect(card.controls[0]).toMatchObject({ cancelStream: true });
  expect(card.controls[1]).toMatchObject({ patternId: 'ocean' });
  expect(card.controls[2]).toMatchObject({ playlist: 'pause' });
  expect(card.playlist).toMatchObject({ configured: true, playing: false, entryIndex: 1, patternId: 'ocean' });
  expect(card.forbiddenMutations).toEqual([]);
});

for (const mismatch of ['pixel-count', 'output-route', 'reversal']) {
  test(`same-project ${mismatch} Layout drift refuses rehearsal before any physical write`, async ({ page }) => {
    const card = await mockCard(page, { threeSections: true, trackPreviewOnly: true, layoutMismatch: mismatch });
    await openSceneEditor(page);
    await page.getByTestId('scene-physical-preview').click();
    await expect(page.getByTestId('scene-physical-preview')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('.sexp-preview-bar')).toContainText('Install the Layout changes first');
    expect(await browserFrames(page)).toEqual([]);
    expect(card.controls).toEqual([]);
    expect(card.configWrites).toBe(0);
    expect(card.forbiddenMutations).toEqual([]);
  });
}

test('navigation cancels rehearsal and restores a playing playlist without project mutations', async ({ page }) => {
  const card = await mockCard(page, { threeSections: true, trackPreviewOnly: true, advancePlaylistOnStop: true });
  card.playlist.playing = true;
  await openSceneEditor(page);
  await page.getByTestId('scene-physical-preview').click();
  await expect.poll(async () => (await browserFrames(page)).length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await expect(page.getByTestId('scene-expression-editor')).toHaveCount(0);
  await expect.poll(() => card.controls.some((body: any) => (body.stopStream || body.cancelStream))).toBe(true);
  await expect.poll(() => card.controls.some((body: any) => body.playlist === 'play')).toBe(true);
  expect(card.forbiddenMutations).toEqual([]);
});

test('a source change fences further rehearsal writes and keeps saved playback untouched', async ({ page }) => {
  const card = await mockCard(page, { threeSections: true, trackPreviewOnly: true, advancePlaylistOnStop: true });
  await openSceneEditor(page);
  await page.getByTestId('scene-physical-preview').click();
  await expect.poll(async () => (await browserFrames(page)).length).toBeGreaterThan(0);

  await page.getByLabel('Scene title').fill('Changed while rehearsing');
  await expect(page.getByTestId('scene-physical-preview')).toHaveAttribute('data-state', 'error');
  const settledFrames = (await browserFrames(page)).length;
  await page.waitForTimeout(1000);
  expect(await browserFrames(page)).toHaveLength(settledFrames);
  expect(card.controls.filter((body: any) => body.patternId || body.playlist)).toEqual([]);
  expect(card.configWrites).toBe(0);
  expect(card.forbiddenMutations).toEqual([]);
  expect(projectFixture().expressionScenes.playbackSceneId).toBeNull();
});

test('identity disconnect fences the stream and sends no restore into a missing card', async ({ page }) => {
  const card = await mockCard(page, { threeSections: true, trackPreviewOnly: true });
  await openSceneEditor(page);
  await page.getByTestId('scene-physical-preview').click();
  await expect.poll(async () => (await browserFrames(page)).length).toBeGreaterThan(0);

  card.offline = true;
  await page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    getSharedCardLink().dispatch({ type: 'direct-ping-missed', host: 'lightweaver.local', reason: 'card-stopped-answering' });
  });
  await expect(page.getByTestId('scene-physical-preview')).toHaveAttribute('data-state', 'error');
  const settledFrames = (await browserFrames(page)).length;
  await page.waitForTimeout(1000);
  expect(await browserFrames(page)).toHaveLength(settledFrames);
  expect(card.controls.filter((body: any) => body.patternId || body.playlist)).toEqual([]);
  expect(card.forbiddenMutations).toEqual([]);
});

test('missing playback snapshot refuses rehearsal without changing saved or installed state', async ({ page }) => {
  const card = await mockCard(page, { threeSections: true, trackPreviewOnly: true, missingPlaylistSnapshot: true });
  await openSceneEditor(page);
  const before = await page.evaluate(() => localStorage.getItem('lw_autosave_v3'));
  await page.getByTestId('scene-physical-preview').click();
  await expect(page.getByTestId('scene-physical-preview')).toHaveAttribute('data-state', 'error');
  expect(await browserFrames(page)).toEqual([]);
  expect(card.configWrites).toBe(0);
  expect(card.forbiddenMutations).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('lw_autosave_v3'))).toBe(before);
});

test('install waits for active rehearsal restoration before any source or runtime write', async ({ page }) => {
  const card = await mockCard(page, { threeSections: true, advancePlaylistOnStop: true });
  page.on('dialog', dialog => dialog.accept());
  await openSceneEditor(page);
  await page.getByTestId('scene-physical-preview').click();
  await expect.poll(async () => (await browserFrames(page)).length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Put scene on card' }).click();
  await expect(page.getByRole('button', { name: 'On card', exact: true })).toBeVisible({ timeout: 15000 });
  expect(card.controls.some((body: any) => (body.stopStream || body.cancelStream))).toBe(true);
  expect(card.controls.some((body: any) => body.playlist === 'pause')).toBe(true);
  expect(card.operations).toContain('source-preflight');
  expect(card.configWrites).toBe(1);
});

test('scene rehearsal control is usable at desktop and phone sizes', async ({ page }, testInfo) => {
  await mockCard(page, { threeSections: true, trackPreviewOnly: true });
  await openSceneEditor(page);
  await expect(page.getByTestId('scene-physical-preview')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('scene-rehearsal-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('scene-physical-preview')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('scene-rehearsal-phone.png'), fullPage: true });
});
