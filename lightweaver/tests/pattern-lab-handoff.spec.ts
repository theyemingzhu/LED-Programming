import { test, expect, type Route } from '@playwright/test';
import { choosePattern } from './helpers/pattern-lab.ts';

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
