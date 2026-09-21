import { test, expect } from './studioTest';
import { openControls } from './helpers/pattern-lab';

// These browser journeys are deliberately offline. Native card capability and
// interrupted transaction behavior are exercised by the focused transport tests.
test.beforeEach(async ({ page }, testInfo) => {
  const count = Number(testInfo.title.match(/^(1024|4096|7813) pixels/)?.[1] || 16);
  const curved = testInfo.title.includes('curved');
  const mixed = testInfo.title.includes('mixed');
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.addInitScript(({ count, curved, mixed }) => {
    if (localStorage.getItem('lw_autosave_v3')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3, id: 'native-journey-browser', name: 'Journey software fixture',
      layout: {
        starterPending: false, svgText: '', viewBox: '0 0 240 200',
        strips: [{
          id: 'art', name: 'Artwork',
          pathData: mixed
            ? 'M 10 170 C 20 20 100 20 120 110 L 180 170 C 210 190 230 120 220 20'
            : curved
            ? 'M 20 180 C 20 20 220 20 220 180'
            : count > 256
              ? 'M 20 20 L 200 20'
              : 'M 20 20 L 200 60 L 100 180',
          pixelCount: count, color: '#d99865', x: 0, y: 0,
        }],
        wiring: {
          version: 1, locked: true, verified: true,
          outputs: [{ id: 'out', name: 'Out', pin: 18, runIds: ['art-run'] }],
          runs: [{ id: 'art-run', type: 'strip', verified: true, source: { stripId: 'art', from: 0, to: count - 1 }, physicalDirection: 'source-reverse' }],
        },
      },
    }));
  }, { count, curved, mixed });
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await openControls(page);
  await page.getByRole('button', { name: 'Slow color drift', exact: true }).click();
});

test('a journey exposes a truthful standalone handoff while keeping browser save available', async ({ page }) => {
  await expect(page.getByTestId('color-journey-ribbon')).toBeVisible();
  const handoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  await expect(handoff).toBeVisible();
  await expect(handoff).toContainText(/card|project/i);
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
  await expect(page.getByTestId('color-journey-save-state')).toContainText(/saved/i);
});

test('4096 pixels desktop and phone standalone handoff is readable without overflow', async ({ page }) => {
  await expect(page.getByTestId('pattern-lab-verdict')).toHaveAttribute('data-classification', 'live-on-card');
  const desktopHandoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  const desktopBox = await desktopHandoff.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.y + desktopBox!.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: '/tmp/lightweaver-journey-4096-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await openControls(page);
  const handoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  await expect(handoff).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const box = await handoff.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: '/tmp/lightweaver-journey-4096-phone.png', fullPage: true });
});

test('timing controls preserve one-shot and interpolation choices after reload', async ({ page }) => {
  await page.getByText('Journey timing', { exact: true }).click();
  await page.getByLabel('Interpolation', { exact: true }).selectOption('linear');
  await page.getByLabel('Loop journey', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click();
  await expect(page.getByTestId('color-journey-save-state')).toContainText(/saved/i);
  await page.reload();
  await openControls(page);
  await page.getByText('Journey timing', { exact: true }).click();
  await expect(page.getByLabel('Interpolation', { exact: true })).toHaveValue('linear');
  await expect(page.getByLabel('Loop journey', { exact: true })).not.toBeChecked();
  await expect(page.locator('.plab-journey-details')).toContainText(/first color/i);
});


test('a supported mapped journey enters the project with its authored timing intact', async ({ page }) => {
  const handoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  await expect(page.getByTestId('pattern-lab-verdict')).toHaveAttribute('data-classification', 'live-on-card');
  await handoff.getByRole('button', { name: 'Add to Patterns', exact: true }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect(page.getByTestId('look-name')).toHaveValue('Amber violet drift');
  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices?.standaloneController?.looks?.some((look: any) =>
      look.patternLabRecipe?.base?.kind === 'color-journey'
        && look.patternLabRecipe.journey.stops.length === 3);
  })).toBe(true);
  const savedJourney = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices.standaloneController.looks.find((look: any) => look.patternLabRecipe?.base?.kind === 'color-journey');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-name')).toHaveValue('Amber violet drift');
  await page.locator(`button[data-pattern-id="${savedJourney.id}"]`).click();
  await expect(page.getByTestId('look-save-preset')).toHaveText('Open Color Journey in Lab');
  await page.getByTestId('look-save-as-new').click();
  await expect(page).toHaveURL(/screen=pattern-lab/);
  await openControls(page);
  await expect(page.getByTestId('color-journey-ribbon')).toBeVisible();
  await expect(page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: 'Update in Patterns', exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices.standaloneController.looks.length;
  })).toBe(1);
});


for (const targetCount of [1024, 4096]) test(`${targetCount} pixels save, capability-gated install, and readback retain exact physical phase`, async ({ page }) => {
  await expect(page.getByTestId('pattern-lab-verdict')).toHaveAttribute('data-classification', 'live-on-card');
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: 'Add to Patterns', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')
    .devices?.standaloneController?.looks?.some((look: any) => look.patternLabRecipe?.base?.kind === 'color-journey'))).toBe(true);
  const result = await page.evaluate(async (targetCount) => {
    const { buildCardRuntimePackageFromProject } = await import('/src/lib/cardRuntimeProject.js');
    const { prepareCardStoragePayload } = await import('/src/lib/cardStoragePayload.js');
    const { pushConfigToCard } = await import('/src/lib/cardPushClient.js');
    const { reconstructInstalledCardState } = await import('/src/lib/cardProjectAdoption.js');
    const { sampleNativeColorJourneyPixel } = await import('/src/lib/colorJourneyNative.js');
    const { samplePath } = await import('/src/lib/mapper.js');
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', saved.layout.strips[0].pathData);
    svg.appendChild(path);
    document.body.appendChild(svg);
    const pixels = samplePath(path, targetCount);
    svg.remove();
    const strips = [{ id: saved.layout.strips[0].id, name: 'Artwork', pixels }];
    const wiring = saved.layout.wiring;
    const runtime = buildCardRuntimePackageFromProject({ projectId: saved.id, projectName: saved.name, strips, wiring,
      standaloneController: { ...saved.devices.standaloneController, playlist: [{ id: 'journey-entry', type: 'combo', lookId: saved.devices.standaloneController.activeLookId, enabled: true }] } });
    let written: any = null;
    const options = { host: 'lightweaver.local', transport: 'bridge', initialConfigAuthorityImpl: () => true,
      bridgeRequestImpl: async (type: string, payload: any) => { if (type === 'config') written = structuredClone(payload); return { ok: true }; } };
    let oldCardReason = '';
    try {
      await pushConfigToCard(runtime, { ...options, cardEvidence: { recipeCapabilities: {
        colorJourney: { version: 1, maxPixels: 256, phaseEncoding: 'q0.16-hex', restart: 'restart' },
      } } });
    } catch (error: any) { oldCardReason = error.reason; }
    const wroteToOldCard = written !== null;
    await pushConfigToCard(runtime, { ...options, cardEvidence: { recipeCapabilities: {
      colorJourneyV2: { version: 2, maxPixels: 65535, maxPhaseSpans: 64, phaseEncoding: 'q0.16-affine', restart: 'restart' },
    } } });
    const look = written.looks.find((look: any) => look.nativeRecipe?.kind === 'color-journey');
    if (!look) throw new Error('Missing native installed look: ' + JSON.stringify({ written, controller: saved.devices.standaloneController }));
    const readback = reconstructInstalledCardState({ skeleton: { strips, wiring },
      patterns: { currentId: look.id, patterns: [{ id: look.id, label: look.label, nativeRecipe: look.nativeRecipe }] } });
    const restored = buildCardRuntimePackageFromProject({ projectId: saved.id, projectName: saved.name, strips, wiring,
      standaloneController: readback.devices.standaloneController });
    const restoredNative = restored.config.looks[0].nativeRecipe;
    const native = runtime.config.looks[0].nativeRecipe;
    return { oldCardReason, wroteToOldCard, bytes: prepareCardStoragePayload(runtime).bytes,
      version: look.nativeRecipe.journey.version,
      exactReadback: JSON.stringify(restoredNative.journey) === JSON.stringify(native.journey),
      framesMatch: [0, 999, 12000, 0xffffffff + 1000].every(time => [0, 255, 256, 512, targetCount - 1].every(pixel =>
        JSON.stringify(sampleNativeColorJourneyPixel(native, pixel, time)) === JSON.stringify(sampleNativeColorJourneyPixel(restoredNative, pixel, time)))) };
  }, targetCount);
  expect(result.oldCardReason).toBe('color-journey-unsupported');
  expect(result.wroteToOldCard).toBe(false);
  expect(result.version).toBe(2);
  expect(result.bytes).toBeLessThanOrEqual(3968);
  expect(result.exactReadback).toBe(true);
  expect(result.framesMatch).toBe(true);
});

for (const geometry of ['curved', 'mixed']) test(`4096 pixels ${geometry} save, bounded install, readback, and timed colors`, async ({ page }) => {
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: 'Add to Patterns', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')
    .devices?.standaloneController?.looks?.some((look: any) => look.patternLabRecipe?.base?.kind === 'color-journey'))).toBe(true);
  const result = await page.evaluate(async () => {
    const { samplePath } = await import('/src/lib/mapper.js');
    const { expandColorJourneyPhases } = await import('/src/lib/colorJourneyPhases.js');
    const { buildCardRuntimePackageFromProject } = await import('/src/lib/cardRuntimeProject.js');
    const { prepareCardStoragePayload } = await import('/src/lib/cardStoragePayload.js');
    const { pushConfigToCard } = await import('/src/lib/cardPushClient.js');
    const { reconstructInstalledCardState } = await import('/src/lib/cardProjectAdoption.js');
    const { sampleColorJourney } = await import('/src/lib/colorJourney.js');
    const { sampleNativeColorJourneyPixel } = await import('/src/lib/colorJourneyNative.js');
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', saved.layout.strips[0].pathData);
    svg.appendChild(path);
    document.body.appendChild(svg);
    const pixels = samplePath(path, 4096);
    svg.remove();
    const strips = [{ id: saved.layout.strips[0].id, name: 'Artwork', pixels }];
    const wiring = saved.layout.wiring;
    const runtime = buildCardRuntimePackageFromProject({ projectId: saved.id, projectName: saved.name, strips, wiring,
      standaloneController: { ...saved.devices.standaloneController, playlist: [{ id: 'journey-entry', type: 'combo', lookId: saved.devices.standaloneController.activeLookId, enabled: true }] } });
    const native = runtime.config.looks[0].nativeRecipe;
    const xs = pixels.map((pixel: any) => Number(pixel.x) || 0);
    const ys = pixels.map((pixel: any) => Number(pixel.y) || 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const range = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 0.001);
    const sourcePhases = pixels.map((pixel: any) => Math.round(((((pixel.x - minX) / range + (pixel.y - minY) / range * 0.35) % 1) + 1) % 1 * 0x10000) & 0xffff);
    const exactPhysical = sourcePhases.reverse();
    const installedPhases = expandColorJourneyPhases(native.journey);
    const maxPhaseError = installedPhases.reduce((maximum: number, phase: number, index: number) => {
      const delta = ((phase - exactPhysical[index] + 32768) & 0xffff) - 32768;
      return Math.max(maximum, Math.abs(delta));
    }, 0);
    let written: any = null;
    const options = { host: 'lightweaver.local', transport: 'bridge', initialConfigAuthorityImpl: () => true,
      bridgeRequestImpl: async (type: string, payload: any) => { if (type === 'config') written = structuredClone(payload); return { ok: true }; } };
    let oldReason = '';
    try {
      await pushConfigToCard(runtime, { ...options, cardEvidence: { recipeCapabilities: {
        colorJourneyV2: { version: 2, maxPixels: 65535, maxPhaseSpans: 64, phaseEncoding: 'q0.16-affine', restart: 'restart' },
      } } });
    } catch (error: any) { oldReason = error.reason; }
    const wroteBeforeV3 = written !== null;
    await pushConfigToCard(runtime, { ...options, cardEvidence: { recipeCapabilities: {
      colorJourneyV3: { version: 3, maxPixels: 65535, maxPhaseSpans: 64, maxPhaseErrorTicks: 194,
        phaseEncoding: 'q0.16-affine-rgb1', restart: 'restart' },
    } } });
    const installed = written.looks.find((look: any) => look.nativeRecipe?.kind === 'color-journey').nativeRecipe;
    const readback = reconstructInstalledCardState({ skeleton: { strips, wiring },
      patterns: { currentId: installed.id, patterns: [{ id: installed.id, label: 'Journey', nativeRecipe: installed }] } });
    const restored = buildCardRuntimePackageFromProject({ projectId: saved.id, projectName: saved.name, strips, wiring,
      standaloneController: readback.devices.standaloneController });
    const restoredNative = restored.config.looks[0].nativeRecipe;
    const times = [0, 999, 12000, 45000, 0xffffffff + 1000];
    const samplePixels = [0, 255, 1024, 2048, 4095];
    let maxChannelError = 0;
    for (const time of times) {
      const base = sampleColorJourney({ version: 1, stops: native.journey.stops, easing: native.journey.easing, loop: native.journey.loop }, time).rgb;
      for (const pixel of samplePixels) {
        const phase = exactPhysical[pixel] / 65536;
        const motion = (time % native.journey.motionSpeedMs) / native.journey.motionSpeedMs;
        const movement = 1 - native.journey.depth * (0.5 + 0.5 * Math.sin((phase - motion) * Math.PI * 2));
        const expected = base.map((channel: number) => Math.round(channel * movement));
        const actual = sampleNativeColorJourneyPixel(native, pixel, time);
        ['r', 'g', 'b'].forEach((channel, index) => {
          maxChannelError = Math.max(maxChannelError, Math.abs(actual[channel] - expected[index]));
        });
      }
    }
    const retainedBeforeEdit = JSON.stringify(restoredNative.journey.phases);
    readback.devices.standaloneController.looks[0].patternLabRecipe.journey.stops[0].color = '#123456';
    readback.devices.standaloneController.looks[0].patternLabRecipe.journey.stops[0].holdMs = 12345;
    const edited = buildCardRuntimePackageFromProject({ projectId: saved.id, projectName: saved.name, strips, wiring,
      standaloneController: readback.devices.standaloneController }).config.looks[0].nativeRecipe;
    return {
      version: native.journey.version, spans: native.journey.phases.length,
      tolerance: native.journey.maxPhaseErrorTicks, maxPhaseError, maxChannelError,
      bytes: prepareCardStoragePayload(runtime).bytes, oldReason, wroteBeforeV3,
      exactReadback: JSON.stringify(restoredNative.journey) === JSON.stringify(native.journey),
      derivativeRetainedAfterEdit: JSON.stringify(edited.journey.phases) === retainedBeforeEdit,
      editedColor: edited.journey.stops[0].color, editedHoldMs: edited.journey.stops[0].holdMs,
    };
  });
  expect(result.version).toBe(3);
  expect(result.spans).toBeLessThanOrEqual(64);
  expect(result.tolerance).toBe(194);
  expect(result.maxPhaseError).toBeLessThanOrEqual(194);
  expect(result.maxChannelError).toBeLessThanOrEqual(1);
  expect(result.bytes).toBeLessThanOrEqual(3968);
  expect(result.oldReason).toBe('color-journey-unsupported');
  expect(result.wroteBeforeV3).toBe(false);
  expect(result.exactReadback).toBe(true);
  expect(result.derivativeRetainedAfterEdit).toBe(true);
  expect(result.editedColor).toBe('#123456');
  expect(result.editedHoldMs).toBe(12345);
});

test('7813 pixels retain the conservative operation-budget gate', async ({ page }) => {
  await expect(page.getByTestId('pattern-lab-verdict')).not.toHaveAttribute('data-classification', 'live-on-card');
});
