import { test, expect, type Route, type Locator } from '@playwright/test';
import { choosePattern, openControls } from './helpers/pattern-lab.ts';

async function expectRecordedChoice(container: Locator, changed = false) {
  const status = container.getByTestId('recorded-sequence-choice');
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute('data-choice-state', changed ? 'changed' : 'matches');
  await expect(status).toContainText('Baked: Mirrored');
  if (changed) await expect(status).toContainText('Source: Own');
  else await expect(status).not.toContainText('Source:');
  await expect(status).toHaveAttribute('aria-label', changed
    ? 'Recorded: Mirrored · source: Own. Record again to update.' : 'Recorded: Mirrored.');
}


const AUTOSAVE_KEY = 'lw_autosave_v3';
let cardMutationRequests: string[];

test.beforeEach(async ({ page }) => {
  cardMutationRequests = [];
  const blockCard = async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'GET') cardMutationRequests.push(`${request.method()} ${request.url()}`);
    await route.abort();
  };
  await page.route('http://lightweaver.local/**', blockCard);
  await page.route('http://192.168.4.1/**', blockCard);
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
});

test('reviews, cancels, and confirms a native look without touching the Pattern Lab draft', async ({ page }) => {
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY)).not.toBeNull();
  const projectBefore = await page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY);
  const parsedBefore = JSON.parse(projectBefore!);

  await choosePattern(page, 'aurora');
  const tools = page.getByTestId('pattern-lab-runtime-tools');
  const draftId = await tools.getAttribute('data-draft-recipe-id');
  const sourceId = await tools.getAttribute('data-source-recipe-id');
  await tools.locator(':scope > summary').click();

  const handoff = page.getByTestId('pattern-lab-project-handoff');
  await handoff.getByRole('button', { name: 'Review Use in Project' }).click();
  await expect(handoff).toContainText('A new saved look named “Aurora” will be added and selected. Existing looks stay unchanged.');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY)).toBe(projectBefore);

  await handoff.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(handoff.getByRole('button', { name: 'Review Use in Project' })).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY)).toBe(projectBefore);

  await handoff.getByRole('button', { name: 'Review Use in Project' }).click();
  await handoff.getByRole('button', { name: 'Add to project' }).click();
  await expect(page.getByTestId('pattern-lab-handoff-status')).toContainText('Added and selected Aurora');
  await expect.poll(async () => {
    const raw = await page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY);
    const project = JSON.parse(raw || '{}');
    return project.devices?.standaloneController?.looks?.some((look: { label?: string }) => look.label === 'Aurora');
  }).toBe(true);

  const projectAfter = JSON.parse((await page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY))!);
  const previousLooks = parsedBefore.devices?.standaloneController?.looks || [];
  for (const look of previousLooks) {
    expect(projectAfter.devices.standaloneController.looks).toContainEqual(look);
  }
  await expect(tools).toHaveAttribute('data-draft-recipe-id', draftId || '');
  await expect(tools).toHaveAttribute('data-source-recipe-id', sourceId || '');
  expect(cardMutationRequests).toEqual([]);
});

test('explains that an evolving recipe must be baked before project handoff', async ({ page }) => {
  await choosePattern(page, 'aurora');
  await page.getByRole('checkbox', { name: /Long Evolution/ }).check();
  const tools = page.getByTestId('pattern-lab-runtime-tools');
  await tools.locator(':scope > summary').click();

  const handoff = page.getByTestId('pattern-lab-project-handoff');
  await handoff.getByRole('button', { name: 'Review Use in Project' }).click();
  await expect(handoff).toContainText('Bake this exact recipe first.');
  await expect(handoff.getByRole('button', { name: 'Add to project' })).toBeDisabled();
  expect(cardMutationRequests).toEqual([]);
});

test('a saved layered recording reopens its complete recipe in Lab', async ({ page }, testInfo) => {
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), AUTOSAVE_KEY)).not.toBeNull();
  const assetId = await page.evaluate(async key => {
    const { createPatternLabRecipe } = await import('/src/lib/patternLabRecipe.js');
    const { bakePatternLabRecipe } = await import('/src/lib/lwseqBake.js');
    const { classifyPatternLabCompatibility } = await import('/src/lib/patternLabCompatibility.js');
    const { createPatternLabHandoff, applyPatternLabHandoff } = await import('/src/lib/patternLabHandoff.js');
    const recipe = createPatternLabRecipe({
      id: 'saved-layered-test', name: 'Saved layered test',
      evolution: { enabled: true, durationSeconds: 300 },
      layers: [{ id: 'overlay-fire', name: 'Fire overlay', enabled: true,
        opacity: 0.4, blendMode: 'screen',
        generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
        target: { kind: 'whole-piece', id: 'all' } }],
    });
    const strips = [{ id: 'one', name: 'One', pixels: [{ x: 0, y: 0 }] }];
    const wiring = { version: 1, locked: true, verified: true,
      outputs: [{ id: 'out', name: 'Out', pin: 16, runIds: ['run'] }],
      runs: [{ id: 'run', type: 'strip', verified: true,
        source: { stripId: 'one', from: 0, to: 0 }, directionPolicy: 'fixed',
        physicalDirection: 'source-forward', seamLed: null }] };
    const baked = await bakePatternLabRecipe({ recipe, strips, wiring, fps: 1 });
    const compatibility = classifyPatternLabCompatibility(recipe, { metrics: {
      pixelCount: 1, fps: 1, operationsPerFrame: 100, stateBytes: 256,
      framebufferBytes: 3, nativeConfigBytes: 256, microSdBytes: 1_000_000,
    } });
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    const controller = saved.devices.standaloneController;
    const result = await createPatternLabHandoff({ recipe, compatibility, bakeResult: baked,
      strips, wiring, controller });
    if (result.kind !== 'sequence') throw new Error(JSON.stringify(result));
    saved.devices.standaloneController = await applyPatternLabHandoff(controller, result);
    localStorage.setItem(key, JSON.stringify(saved));
    return result.asset.id;
  }, AUTOSAVE_KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await choosePattern(page, 'aurora');
  const tools = page.getByTestId('pattern-lab-runtime-tools');
  await tools.locator(':scope > summary').click();
  const recordings = page.getByTestId('pattern-lab-saved-recordings');
  await expect(recordings).toBeVisible();
  await recordings.locator('summary').click();
  await expect(recordings).toContainText('Saved layered test');
  await page.screenshot({ path: testInfo.outputPath('saved-layered-recording.png'), fullPage: true });
  await recordings.getByRole('button', { name: 'Edit in Lab' }).click();
  await expect(tools).toHaveAttribute('data-draft-recipe-id', 'saved-layered-test');
  await expect(page.getByText('Opened the complete recipe for Saved layered test.')).toBeVisible();
  expect(assetId).toBeTruthy();
  expect(cardMutationRequests).toEqual([]);
});

for (const family of ['Lab', 'Flow'] as const) {
  test(`saved ${family} recording reports its baked choice after mode changes and reload`, async ({ page }, testInfo) => {
    const saved = await page.evaluate(async ({ key, family }) => {
      const { createDefaultProject } = await import('/src/lib/projectModel.js');
      const { createPatternLabRecipe } = await import('/src/lib/patternLabRecipe.js');
      const { bakePatternLabRecipe } = await import('/src/lib/lwseqBake.js');
      const { bakeSceneExpressionFlow } = await import('/src/lib/sceneExpressionRecording.js');
      const { compileWiring } = await import('/src/lib/wiringCompiler.js');
      const { classifyPatternLabCompatibility } = await import('/src/lib/patternLabCompatibility.js');
      const { createPatternLabHandoff, applyPatternLabHandoff } = await import('/src/lib/patternLabHandoff.js');
      const { createRecordedSequenceAsset, applyRecordedSequenceAsset } = await import('/src/lib/recordedSequenceAsset.js');
      const project = createDefaultProject(); project.id = `saved-${family}-choice`; project.name = `${family} recorded sides`;
      const strips = ['left', 'right'].map((id, i) => ({ ...project.layout.strips[0], id, name: id, pixelCount: 2,
        pathData: `M ${i * 50} 0 L ${i * 50 + 10} 20`, pixels: [{ x: i * 50, y: 0 }, { x: i * 50 + 10, y: 20 }] }));
      const symmetry = { fold: 2, orientation: 'mirror', sides: strips.map((s, i) => ({ id: `side-${i + 1}`, label: s.name, stripIds: [s.id] })) };
      const wiring = { version: 1, locked: true, verified: true, outputs: [{ id: 'one', name: 'One', pin: 16, runIds: ['left', 'right'] }],
        runs: strips.map(s => ({ id: s.id, type: 'strip', verified: true, directionPolicy: 'fixed', physicalDirection: 'source-forward', seamLed: null, source: { stripId: s.id, from: 0, to: 1 } })) };
      const context = { strips, wiring, compiledWiring: compileWiring({ strips, wiring, symmetry }), symmetry, sidesMirrored: true, fps: 1 };
      let result;
      if (family === 'Lab') {
        const recipe = createPatternLabRecipe({ id: 'recorded-choice', name: 'Saved Lab choice', evolution: { enabled: true, durationSeconds: 300 } });
        const compatibility = classifyPatternLabCompatibility(recipe, { metrics: { pixelCount: 4, fps: 1, operationsPerFrame: 100, stateBytes: 256, framebufferBytes: 12, nativeConfigBytes: 256, microSdBytes: 1_000_000 } });
        result = await createPatternLabHandoff({ ...context, recipe, compatibility, bakeResult: await bakePatternLabRecipe({ ...context, recipe }) });
        if (result.kind !== 'sequence') throw new Error(JSON.stringify(result));
        project.devices.standaloneController = await applyPatternLabHandoff({}, result);
      } else {
        const scene = { format: 'lightweaver-expression-scene', version: 1, id: 'recorded-flow', name: 'Saved Flow choice',
          defaults: { pattern: { rendererId: 'chase', speed: 1 }, color: { kind: 'palette', colors: ['#ff0000', '#000000'] }, intensity: { brightness: 1 } },
          steps: [{ id: 'one', label: 'One', holdMs: 1000, transitionFromPrevious: { mode: 'cut', durationMs: 0 }, assignments: [{ selection: { domain: 'continuous', areaIds: ['strip:left', 'strip:right'], flow: { version: 1, directions: {} } } }] }], loop: { mode: 'once' } };
        result = await createRecordedSequenceAsset({ kind: 'expression-scene', bakeResult: await bakeSceneExpressionFlow({ ...context, scene }) });
        project.devices.standaloneController = await applyRecordedSequenceAsset({}, result);
      }
      Object.assign(project.layout, { strips, wiring, symmetry, starterPending: false, sectionFamilies: [], layerGroups: [], patchBoard: null });
      project.pattern.sidesMirrored = true; localStorage.setItem(key, JSON.stringify(project));
      return { asset: JSON.stringify(project.devices.standaloneController.sequenceAssets[0]), label: result.asset.label };
    }, { key: AUTOSAVE_KEY, family });
    await page.reload();
    await page.goto('/#screen=playlist');
    const library = page.getByTestId('playlist-recordings');
    await expectRecordedChoice(library);
    await library.getByRole('button', { name: new RegExp(saved.label) }).click();
    await expectRecordedChoice(page.locator('.pl-row'));
    const changeMode = async (mirrored: boolean) => {
      await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').devices?.standaloneController?.sequenceAssets?.length, AUTOSAVE_KEY)).toBe(1);
      await page.evaluate(({ key, mirrored }) => { const project = JSON.parse(localStorage.getItem(key)!); project.pattern.sidesMirrored = mirrored; localStorage.setItem(key, JSON.stringify(project)); }, { key: AUTOSAVE_KEY, mirrored });
      await page.reload();
    };
    await changeMode(false);
    await expectRecordedChoice(library, true);
    await expectRecordedChoice(page.locator('.pl-row'), true);
    await page.screenshot({ path: testInfo.outputPath(`saved-${family}-playlist-desktop.png`), fullPage: true });
    await page.goto('/#screen=pattern-lab');
    await page.getByTestId('pattern-lab-runtime-tools').locator(':scope > summary').click();
    const lab = page.getByTestId('pattern-lab-saved-recordings'); await lab.locator(':scope > summary').click();
    await expectRecordedChoice(lab, true);
    await lab.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`saved-${family}-choice-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await openControls(page); await lab.scrollIntoViewIfNeeded(); await expect(lab).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`saved-${family}-choice-phone.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('/#screen=playlist');
    await expectRecordedChoice(page.locator('.pl-row'), true);
    await page.locator('.pl-row').scrollIntoViewIfNeeded();
    expect(await page.locator('.pl-row').getByTestId('recorded-sequence-choice').evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(36);
    await page.screenshot({ path: testInfo.outputPath(`saved-${family}-playlist-phone.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Its own saved look wins over the project and an unrelated selected look.
    await page.evaluate(key => {
      const project = JSON.parse(localStorage.getItem(key)!);
      const asset = project.devices.standaloneController.sequenceAssets[0];
      project.devices.standaloneController.looks = [{ id: asset.id, label: 'Recording owner', sidesMirrored: true }, { id: 'unrelated', label: 'Unrelated selected look', sidesMirrored: false }];
      project.devices.standaloneController.activeLookId = 'unrelated';
      localStorage.setItem(key, JSON.stringify(project));
    }, AUTOSAVE_KEY);
    await page.reload(); await expectRecordedChoice(library);
    await changeMode(true); await page.goto('/#screen=playlist'); await expectRecordedChoice(library);
    const currentAsset = await page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)!).devices.standaloneController.sequenceAssets[0]), AUTOSAVE_KEY);
    expect(currentAsset).toBe(saved.asset); expect(cardMutationRequests).toEqual([]);
  });
}
