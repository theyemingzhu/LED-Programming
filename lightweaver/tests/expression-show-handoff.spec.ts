import { test, expect, type Page, type Route } from '@playwright/test';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { createProjectEnvelope } from '../src/lib/projectRepository.js';

let cardMutations: string[];
let requireNoCardMutations: boolean;
const CARD_ID = 'lw-show-rehearsal';
const BUILD_ID = 'e'.repeat(40);

function projectFixture(expressionScenes: any) {
  const project = createDefaultProject();
  project.id = `show-shared-scenes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  project.name = 'Show shared scenes';
  project.layout.starterPending = false;
  project.expressionScenes = expressionScenes;
  return project;
}

async function boot(page: Page, expressionScenes: any = null, screen = 'show') {
  const project = expressionScenes ? projectFixture(expressionScenes) : null;
  await page.addInitScript((seed) => {
    localStorage.clear();
    if (seed) localStorage.setItem('lw_autosave_v3', JSON.stringify(seed));
    (window as any).__stoppedShowTracks = 0;
    const track = { stop() { (window as any).__stoppedShowTracks += 1; } };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [track] }) },
    });
    class FakeAudioContext {
      sampleRate = 48000;
      state = 'running';
      destination = {};
      createAnalyser() {
        return {
          context: this, fftSize: 2048, smoothingTimeConstant: 0,
          connect() {}, disconnect() {},
          get frequencyBinCount() { return this.fftSize / 2; },
          getByteFrequencyData(values: Uint8Array) { values.fill(64); },
        };
      }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createMediaElementSource() { return { connect() {}, disconnect() {} }; }
      resume() { return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
    }
    (window as any).AudioContext = FakeAudioContext;
  }, project);
  await page.goto(`/#screen=${screen}`, { waitUntil: 'domcontentloaded' });
}

function rehearsalProjectFixture() {
  const project = projectFixture({
    version: 1,
    activeSceneId: 'scene-show-rehearsal',
    playbackSceneId: null,
    scenes: [{
      format: 'lightweaver-expression-scene', version: 1,
      id: 'scene-show-rehearsal', name: 'Show rehearsal',
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
    }],
  });
  project.id = 'project-show-rehearsal';
  project.name = 'Show rehearsal fixture';
  project.layout.wiring.locked = true;
  project.layout.wiring.verified = true;
  project.layout.wiring.runs.forEach((run: any) => { run.verified = true; });
  project.devices.standaloneController.led.colorOrderConfirmed = true;
  project.devices.standaloneController.led.confirmedColorOrder = 'RGB';
  return project;
}

async function mockShowRehearsalCard(page: Page) {
  requireNoCardMutations = false;
  const project = rehearsalProjectFixture();
  const envelope = createProjectEnvelope(project, {
    modifiedAt: 1,
    source: { kind: 'card', cardId: CARD_ID },
  });
  const config = prepareCardDeployment({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 0,
    projectFingerprint: envelope.contentHash,
    strips: project.layout.strips,
    patchBoard: project.layout.patchBoard,
    wiring: project.layout.wiring,
    standaloneController: project.devices.standaloneController,
  }).config;
  const state = {
    controls: [] as any[],
    frames: [] as any[],
    forbiddenMutations: [] as string[],
    failRestore: false,
    streaming: false,
    playlist: { configured: true, playing: false, entryIndex: 1, entryCount: 3, patternId: 'ocean' },
  };
  const status = () => ({
    app: 'Lightweaver', provisioningContractVersion: 1, ok: true,
    cardId: CARD_ID, firmwareVersion: '1.2.3', buildId: BUILD_ID, bootId: 'boot-show-1',
    runtimePhase: 'ready', knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
    projectId: config.piece.id, projectRevision: config.projectRevision,
    projectFingerprint: config.projectFingerprint, projectHead: envelope.contentHash,
    led: config.led, outputs: config.led.outputs, limits: { maxLooks: 64 }, maxPixels: 4096,
    capabilities: { physicalFrameOrder: { version: 1 } },
    streaming: state.streaming, playlist: { ...state.playlist },
  });

  await page.route('http://lightweaver.local/**', async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && (/^\/api\/projects\//.test(pathname) || pathname === '/api/config')) {
      state.forbiddenMutations.push(pathname);
    }
    if (pathname === '/api/status') return route.fulfill({ json: status() });
    if (pathname === '/api/firmware-info') return route.fulfill({ json: { ...status(), pixels: config.led.pixels } });
    if (pathname === '/api/wiring/status') return route.fulfill({ json: {
      ok: true, state: 'known-good', hasCandidate: false,
      cardId: CARD_ID, firmwareVersion: '1.2.3', buildId: BUILD_ID,
      currentOutputs: config.led.outputs,
    } });
    if (pathname === '/api/projects/read') return route.fulfill({ json: { envelope } });
    if (pathname === '/api/zones') return route.fulfill({ json: {
      syncZones: true,
      zones: [{ id: 'all', patternId: state.playlist.patternId, brightness: 0.7 }],
    } });
    if (pathname === '/api/owner/capability') return route.fulfill({ json: {
      capability: 'owner-capability', cardId: CARD_ID, bootId: 'boot-show-1', expiresInMs: 60000,
    } });
    if (pathname === '/api/stream/lease') {
      state.streaming = true;
      return route.fulfill({ json: { ok: true, leaseId: 'show-preview-lease', expiresInMs: 30000, nextSequence: 0 } });
    }
    if (pathname === '/api/stream/frame') {
      const body = JSON.parse(request.postData() || '{}');
      state.frames.push(body);
      return route.fulfill({ json: { ok: true, nextSequence: Number(body.sequence) + 1 } });
    }
    if (pathname === '/api/stream/stop') {
      state.streaming = false;
      state.playlist = { ...state.playlist, playing: true, entryIndex: 2, patternId: 'fire' };
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/control') {
      const body = JSON.parse(request.postData() || '{}');
      state.controls.push(body);
      if (body.cancelStream) {
        state.streaming = false;
        state.playlist = { ...state.playlist, playing: true, entryIndex: 2, patternId: 'fire' };
      }
      if (body.patternId && !state.failRestore) {
        state.playlist = { ...state.playlist, playing: false, entryIndex: 1, patternId: body.patternId };
      }
      if (body.playlist === 'pause') state.playlist = { ...state.playlist, playing: false };
      if (body.playlist === 'play') state.playlist = { ...state.playlist, playing: true };
      return route.fulfill({ json: { ok: true, cardId: CARD_ID, appliedPatternId: body.patternId || state.playlist.patternId } });
    }
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  await page.addInitScript(({ cardId, buildId, seededProject }) => {
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion: '1.2.3', buildId }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(seededProject));
    (window as any).__showRehearsalFrames = [];
    class FakeWebSocket {
      readyState = 0;
      bufferedAmount = 0;
      onopen: null | (() => void) = null;
      onerror: null | (() => void) = null;
      onclose: null | (() => void) = null;
      constructor(_url: string) { setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
      send(payload: string) { (window as any).__showRehearsalFrames.push(payload); }
      close() { this.readyState = 3; this.onclose?.(); }
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: FakeWebSocket });
  }, { cardId: CARD_ID, buildId: BUILD_ID, seededProject: project });
  return state;
}

async function showRehearsalFrameCount(page: Page, card: { frames: any[] }) {
  const websocketCount = await page.evaluate(() => (window as any).__showRehearsalFrames?.length || 0);
  return card.frames.length + websocketCount;
}

test.beforeEach(async ({ page }) => {
  cardMutations = [];
  requireNoCardMutations = true;
  const blockCard = async (route: Route) => {
    if (route.request().method() !== 'GET') cardMutations.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort();
  };
  await page.route('http://lightweaver.local/**', blockCard);
  await page.route('http://192.168.4.1/**', blockCard);
});

test.afterEach(() => {
  if (requireNoCardMutations) expect(cardMutations).toEqual([]);
});

test('Show selects, edits, and reopens the exact shared scene source', async ({ page }, testInfo) => {
  await boot(page, null, 'pattern-lab');
  await page.getByTestId('pattern-lab-build-scene').click();
  const dawnId = await page.getByLabel('Scene', { exact: true }).inputValue();
  await page.getByLabel('Scene title').fill('Dawn room');
  await page.getByRole('button', { name: 'New scene', exact: true }).click();
  const tideId = await page.getByLabel('Scene', { exact: true }).inputValue();
  expect(tideId).not.toBe(dawnId);
  await page.getByLabel('Scene title').fill('Tide room');
  await page.getByRole('button', { name: '+ Add step' }).click();
  await page.getByRole('checkbox', { name: 'Inner circle' }).check();
  await page.getByRole('button', { name: 'Save scene' }).click();
  await expect(page.getByText('Project saved')).toBeVisible();
  const authored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').expressionScenes);
  await page.getByRole('button', { name: 'Back to Lab' }).click();
  await page.getByRole('button', { name: 'Show', exact: true }).click();

  const library = page.getByRole('region', { name: 'Saved scenes' });
  await expect(library).toContainText('Dawn room');
  await expect(library).toContainText('Tide room');
  await expect(library).toContainText('2 steps · starts with Opening');
  const dismissNotice = page.getByRole('button', { name: 'Dismiss notice' });
  if (await dismissNotice.isVisible()) await dismissNotice.click();
  await testInfo.attach('show-shared-scene-library', {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  if (process.env.SHOW_LIBRARY_SCREENSHOT) {
    await page.screenshot({ path: process.env.SHOW_LIBRARY_SCREENSHOT, fullPage: true });
  }

  await page.getByRole('button', { name: 'Select Dawn room' }).click();
  await page.getByRole('button', { name: 'Select Tide room' }).click();
  await expect.poll(() => page.evaluate(() => {
    const source = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').expressionScenes;
    return `${source?.activeSceneId}:${source?.playbackSceneId}`;
  })).toBe(`${tideId}:${String(authored.playbackSceneId)}`);

  await page.getByRole('button', { name: 'Microphone' }).click();
  await expect(page.getByText(/hearing the room/i)).toBeVisible();
  await library.locator(`[data-scene-id="${tideId}"]`).getByRole('button', { name: 'Edit scene' }).click();
  await expect(page.getByTestId('scene-expression-editor')).toBeVisible();
  await expect(page.getByText('Studio · Show · Scene')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Show' })).toBeVisible();
  await expect(page.getByLabel('Scene title')).toHaveValue('Tide room');
  await expect(page.getByRole('region', { name: 'Scene steps' }).locator('article')).toHaveCount(2);
  await page.getByRole('button', { name: /02 Step 2/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Inner circle' })).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as any).__stoppedShowTracks)).toBe(1);
  await testInfo.attach('show-hosted-scene-editor', {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  if (process.env.SHOW_EDITOR_SCREENSHOT) {
    await page.screenshot({ path: process.env.SHOW_EDITOR_SCREENSHOT, fullPage: true });
  }

  await page.getByLabel('Scene title').fill('Tide room revised');
  await page.getByLabel('Step name').fill('Revised opening');
  await page.getByRole('button', { name: 'Save scene' }).click();
  await expect(page.getByText('Project saved')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Show' }).click();
  await expect(page.getByRole('region', { name: 'Saved scenes' })).toContainText('Tide room revised');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').expressionScenes);
  expect(saved.activeSceneId).toBe(tideId);
  expect(saved.playbackSceneId).toBe(authored.playbackSceneId);
  expect(saved.scenes[1].id).toBe(tideId);
  expect(saved.scenes[1].steps.map((step: any) => step.id)).toEqual(authored.scenes[1].steps.map((step: any) => step.id));
  expect(saved.scenes[1].steps[1].assignments[0].selection.areaIds).toEqual(['strip:default-inner-circle']);

  await page.getByRole('button', { name: 'Lab', exact: true }).click();
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByLabel('Scene title')).toHaveValue('Tide room revised');
  await page.getByLabel('Scene title').fill('Tide room latest');
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Saved scenes' })).toContainText('Tide room latest');
});

test('Show closes only after active rehearsal restoration and retains the editor when restoration fails', async ({ page }) => {
  const card = await mockShowRehearsalCard(page);
  await page.goto('/#screen=show', { waitUntil: 'domcontentloaded' });
  const library = page.getByRole('region', { name: 'Saved scenes' });
  await expect(library).toContainText('Show rehearsal');

  const openEditor = async () => {
    await library.getByRole('button', { name: 'Edit scene' }).click();
    await expect(page.getByTestId('scene-expression-editor')).toBeVisible();
    await page.evaluate(async () => {
      const transportUrl = performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .find(url => new URL(url).pathname === '/src/lib/cardTransport.js');
      if (!transportUrl) throw new Error('The app card transport module was not loaded.');
      const { connectCardTransport, getActiveCardTransportAuthority } = await import(transportUrl);
      const authority = getActiveCardTransportAuthority('lightweaver.local')
        || await connectCardTransport({ host: 'lightweaver.local' });
      if (typeof authority?.issueOwnerCapability !== 'function') throw new Error(`Fixture connection failed: ${authority?.reason}`);
      await authority.issueOwnerCapability({ commissioningProof: 'show-browser-test-owner-confirmed' });
      if (!authority.ownerCapability) throw new Error('The exact app card transport authority did not retain owner capability.');
    });
  };

  await openEditor();
  const preview = page.getByTestId('scene-physical-preview');
  await expect(preview).toBeEnabled();
  await preview.click();
  await expect(preview).toHaveText('Stop preview');
  await expect.poll(() => showRehearsalFrameCount(page, card)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Back to Show' }).click();
  await expect(library).toBeVisible();
  expect(card.controls.some(body => body.cancelStream === true)).toBe(true);
  expect(card.controls.some(body => body.patternId === 'ocean')).toBe(true);
  expect(card.controls.some(body => body.playlist === 'pause')).toBe(true);
  expect(card.playlist).toMatchObject({ playing: false, entryIndex: 1, patternId: 'ocean' });

  const firstFrameCount = await showRehearsalFrameCount(page, card);
  await openEditor();
  await page.getByTestId('scene-physical-preview').click();
  await expect.poll(() => showRehearsalFrameCount(page, card)).toBeGreaterThan(firstFrameCount);
  card.failRestore = true;
  await page.getByRole('button', { name: 'Back to Show' }).click();

  await expect(page.getByTestId('scene-expression-editor')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/could not be restored|not restored exactly/i);
  await expect(library).toHaveCount(0);
  expect(card.forbiddenMutations).toEqual([]);
});

test('Show presents an empty shared collection without starting output', async ({ page }) => {
  await boot(page);
  const library = page.getByRole('region', { name: 'Saved scenes' });
  await expect(library).toContainText('No saved scenes yet');
  await expect(library.getByRole('button', { name: 'Create a scene' })).toBeVisible();
});

test('Show preserves opaque future scene source', async ({ page }) => {
  const opaque = { version: 99, activeSceneId: 'future', playbackSceneId: 'future', scenes: [{ future: true }] };
  await boot(page, opaque);
  const library = page.getByRole('region', { name: 'Saved scenes' });
  await expect(library).toContainText('Saved scenes need a newer Studio');
  await expect(library).toContainText(/version 99 is not supported/i);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').expressionScenes);
  expect(stored).toEqual(opaque);
});
