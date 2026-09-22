import { test, expect, type Page, type Route } from '@playwright/test';
import { createDefaultProject } from '../src/lib/projectModel.js';

let cardMutations: string[];

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

test.beforeEach(async ({ page }) => {
  cardMutations = [];
  const blockCard = async (route: Route) => {
    if (route.request().method() !== 'GET') cardMutations.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort();
  };
  await page.route('http://lightweaver.local/**', blockCard);
  await page.route('http://192.168.4.1/**', blockCard);
});

test.afterEach(() => expect(cardMutations).toEqual([]));

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
  await page.getByRole('button', { name: 'Back to Lab' }).click();
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
