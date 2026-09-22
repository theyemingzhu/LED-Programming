import { test, expect, type Route } from '@playwright/test';

let cardMutations: string[];

test.beforeEach(async ({ page }) => {
  cardMutations = [];
  const blockCard = async (route: Route) => {
    if (route.request().method() !== 'GET') cardMutations.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort();
  };
  await page.route('http://lightweaver.local/**', blockCard);
  await page.route('http://192.168.4.1/**', blockCard);
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
});

test.afterEach(() => expect(cardMutations).toEqual([]));

test('edits independent fields, areas, and ordered steps without card traffic', async ({ page }) => {
  await expect(page.getByTestId('scene-expression-preview')).toBeVisible();
  const pattern = page.getByLabel('Scene pattern');
  const color = page.getByLabel('Color', { exact: true });
  await pattern.selectOption('fire');
  await color.fill('190');
  await expect(pattern).toHaveValue('fire');
  const where = page.getByRole('group', { name: 'Where' });
  await where.getByRole('checkbox').nth(1).check();
  await expect(page.getByRole('checkbox', { name: 'Whole artwork' })).not.toBeChecked();

  await page.getByRole('button', { name: '+ Add step' }).click();
  await expect(page.getByRole('region', { name: 'Scene steps' }).locator('article')).toHaveCount(2);
  const second = page.getByRole('region', { name: 'Scene steps' }).locator('article').nth(1);
  await second.getByRole('button', { name: /Move .* earlier/ }).click();
  await expect(page.getByRole('region', { name: 'Scene steps' }).locator('article').first()).toContainText('Step 2');

  await page.getByLabel('Scene title').fill('Saved tide');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save scene' }).click();
  await expect(page.getByText('Project saved')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByLabel('Scene title')).toHaveValue('Saved tide');
  await expect(page.getByRole('region', { name: 'Scene steps' }).locator('article')).toHaveCount(2);
});

test('phone keeps the ordered timeline directly below the live artwork', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const preview = page.getByRole('region', { name: 'Scene preview' });
  const timeline = page.getByRole('region', { name: 'Scene steps' });
  const inspector = page.getByRole('complementary', { name: 'Scene controls' });
  const [previewBox, timelineBox, inspectorBox] = await Promise.all([
    preview.boundingBox(), timeline.boundingBox(), inspector.boundingBox(),
  ]);
  expect(previewBox && timelineBox && inspectorBox).toBeTruthy();
  expect(timelineBox!.y).toBeGreaterThan(previewBox!.y);
  expect(inspectorBox!.y).toBeGreaterThan(timelineBox!.y);
});

test('Show links to the same Lab scene authoring entry', async ({ page }) => {
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await page.getByRole('button', { name: 'Edit a scene' }).click();
  await expect(page.getByTestId('pattern-lab-build-scene')).toBeVisible();
});

test('switching to a new legacy-empty project clears the previous scene source', async ({ page }) => {
  await page.getByLabel('Scene title').fill('Previous project scene');
  await page.getByRole('button', { name: 'New project' }).click();
  const replacement = page.getByRole('dialog', { name: 'Replace current project?' });
  if (await replacement.isVisible()) await replacement.getByRole('button', { name: 'Replace project' }).click();
  await expect(page.getByLabel('Scene title')).toHaveValue('New scene');
});

test('future scene source is preserved and shown as unsupported instead of being replaced', async ({ page }) => {
  await page.getByLabel('Scene title').fill('Create autosave');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').expressionScenes?.scenes?.length || 0)).toBe(1);
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    project.expressionScenes = { version: 99, activeSceneId: 'future', scenes: [{ future: true }] };
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByRole('heading', { name: 'This scene source needs a newer Studio' })).toBeVisible();
  await expect(page.getByText(/version 99 is not supported/i)).toBeVisible();
  const source = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3')!).expressionScenes);
  expect(source).toEqual({ version: 99, activeSceneId: 'future', scenes: [{ future: true }] });
});

test('reopens a sparse inherited step and edits it without replacing inherited fields', async ({ page }) => {
  await page.getByLabel('Scene title').fill('Sparse scene');
  await page.getByLabel('Scene pattern').selectOption('fire');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').expressionScenes?.scenes?.length || 0)).toBe(1);
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    const scene = project.expressionScenes.scenes[0];
    scene.steps.push({
      id: `${scene.id}-inherited`, label: 'Inherited quiet', holdMs: 10000,
      transitionFromPrevious: { mode: 'cut', durationMs: 0 }, assignments: [],
    });
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await page.getByRole('button', { name: /02 Inherited quiet/ }).click();
  await expect(page.getByText('Inherited', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Scene pattern')).toHaveValue('fire');
  await page.getByLabel('Color', { exact: true }).fill('80');
  await expect(page.getByLabel('Scene pattern')).toHaveValue('fire');
});

test('once playback stops on its final frame and unsupported source cannot play', async ({ page }) => {
  await page.getByLabel('Scene title').fill('Playback gate fixture');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').expressionScenes?.scenes?.length || 0)).toBe(1);
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    const scene = project.expressionScenes.scenes[0];
    scene.loop.mode = 'once';
    scene.steps[0].holdMs = 25;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByRole('button', { name: 'Replay scene' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Scene preview' })).toContainText('Finished 1/1');

  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    project.expressionScenes.scenes[0].steps[0].transitionFromPrevious.durationMs = 1;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByRole('button', { name: 'Play scene' })).toBeDisabled();
  const preview = page.getByRole('region', { name: 'Scene preview' });
  await expect(preview).toContainText('Preview unavailable');
  await expect(preview).not.toContainText('Playing');
});

test('creates and switches between multiple stable scene sources', async ({ page }) => {
  const picker = page.getByLabel('Scene', { exact: true });
  const firstId = await picker.inputValue();
  await page.getByLabel('Scene title').fill('First scene');
  await page.getByRole('button', { name: 'New scene', exact: true }).click();
  const secondId = await picker.inputValue();
  expect(secondId).not.toBe(firstId);
  await page.getByLabel('Scene title').fill('Second scene');
  await picker.selectOption(firstId);
  await expect(page.getByLabel('Scene title')).toHaveValue('First scene');
  await picker.selectOption(secondId);
  await expect(page.getByLabel('Scene title')).toHaveValue('Second scene');
  await page.getByRole('button', { name: 'Save scene' }).click();
  await expect(page.getByText('Project saved')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByLabel('Scene', { exact: true })).toHaveValue(secondId);
  await expect(page.getByLabel('Scene', { exact: true }).locator('option')).toHaveCount(2);
});

test('renders real divided-strip and grouped-mandala Layout targets', async ({ page }) => {
  await page.getByLabel('Scene title').fill('Fixture seed');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lw_autosave_v3'))).not.toBeNull();
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    const base = project.layout.strips[0];
    const ids = ['ribbon-left', 'ribbon-center', 'ribbon-right'];
    const paths = ['M 70 240 C 150 120 220 120 270 200', 'M 270 200 C 320 280 370 280 420 200', 'M 420 200 C 470 120 540 120 610 240'];
    project.layout.strips = ids.map((id, index) => ({ ...base, id, name: ['Left section', 'Center section', 'Right section'][index], pathData: paths[index], pixelCount: 18, pixels: [] }));
    project.layout.sectionFamilies = [{
      id: 'ribbon', parentId: ids[0], parentName: 'Three-part ribbon', memberIds: ids,
      source: { pathData: base.pathData, svgLength: base.svgLength || 1 }, memberGeometry: {},
    }];
    project.layout.layerGroups = [];
    project.layout.patchBoard = null;
    project.layout.wiring = {
      version: 1, locked: true, verified: true,
      outputs: [{ id: 'out1', pin: 16, runIds: ids.map(id => `run-${id}`) }],
      runs: ids.map(id => ({ id: `run-${id}`, type: 'strip', source: { stripId: id, from: 0, to: 17 }, directionPolicy: 'flexible', physicalDirection: 'source-forward', seamLed: null, verified: true })),
    };
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  for (const name of ['Three-part ribbon', 'Left section', 'Center section', 'Right section']) {
    await expect(page.getByRole('checkbox', { name })).toBeVisible();
  }
  await expect(page.locator('.sexp-canvas')).toHaveAttribute('data-preview-segments', '3');
  await expect(page.getByRole('status').filter({ hasText: 'Card compatible' })).toBeVisible();
  await page.screenshot({ path: '/tmp/lightweaver-scene-expression-three-section.png', fullPage: true });

  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    const base = project.layout.strips[0];
    const ids = ['petal-a', 'petal-b', 'petal-c', 'petal-d', 'petal-e', 'center'];
    const paths = [
      'M 320 190 C 270 130 280 70 320 45 C 360 70 370 130 320 190',
      'M 330 195 C 385 145 445 160 470 205 C 430 240 375 245 330 195',
      'M 325 210 C 365 260 350 320 305 350 C 270 310 270 255 325 210',
      'M 305 210 C 255 255 195 235 170 190 C 210 155 265 160 305 210',
      'M 307 193 C 260 155 250 105 280 70 C 320 95 340 145 307 193',
      'M 285 200 A 35 35 0 1 0 355 200 A 35 35 0 1 0 285 200',
    ];
    project.layout.strips = ids.map((id, index) => ({ ...base, id, name: id === 'center' ? 'Center' : `Petal ${index + 1}`, pathData: paths[index], pixelCount: id === 'center' ? 14 : 18, pixels: [] }));
    project.layout.sectionFamilies = [];
    project.layout.layerGroups = [{ groupId: 'petals', type: 'strip', name: 'Petal ring', members: ids.slice(0, 5).map(stripId => ({ stripId })) }];
    project.layout.patchBoard = null;
    project.layout.wiring = {
      version: 1, locked: true, verified: true,
      outputs: [{ id: 'out1', pin: 16, runIds: ids.map(id => `run-${id}`) }],
      runs: ids.map(id => ({ id: `run-${id}`, type: 'strip', source: { stripId: id, from: 0, to: id === 'center' ? 13 : 17 }, directionPolicy: 'flexible', physicalDirection: 'source-forward', seamLed: null, verified: true })),
    };
    project.expressionScenes = { version: 1, activeSceneId: null, scenes: [] };
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByRole('checkbox', { name: 'Petal ring' })).toBeVisible();
  await expect(page.locator('.sexp-canvas')).toHaveAttribute('data-preview-segments', '6');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/lightweaver-scene-expression-mandala-phone.png', fullPage: true });
});
