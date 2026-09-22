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
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lw_autosave_v3'))).not.toBeNull();
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

test('renders real divided-strip and grouped-mandala Layout targets', async ({ page }) => {
  await page.getByLabel('Scene title').fill('Fixture seed');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lw_autosave_v3'))).not.toBeNull();
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    const base = project.layout.strips[0];
    const ids = ['ribbon-left', 'ribbon-center', 'ribbon-right'];
    project.layout.strips = ids.map((id, index) => ({ ...base, id, name: ['Left section', 'Center section', 'Right section'][index] }));
    project.layout.sectionFamilies = [{
      id: 'ribbon', parentId: ids[0], parentName: 'Three-part ribbon', memberIds: ids,
      source: { pathData: base.pathData, svgLength: base.svgLength || 1 }, memberGeometry: {},
    }];
    project.layout.layerGroups = [];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  for (const name of ['Three-part ribbon', 'Left section', 'Center section', 'Right section']) {
    await expect(page.getByRole('checkbox', { name })).toBeVisible();
  }
  await page.screenshot({ path: '/tmp/lightweaver-scene-expression-three-section.png', fullPage: true });

  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    const base = project.layout.strips[0];
    const ids = ['petal-a', 'petal-b', 'petal-c', 'petal-d', 'petal-e'];
    project.layout.strips = ids.map((id, index) => ({ ...base, id, name: `Petal ${index + 1}` }));
    project.layout.sectionFamilies = [];
    project.layout.layerGroups = [{ groupId: 'petals', type: 'strip', name: 'Petal ring', members: ids.map(stripId => ({ stripId })) }];
    project.expressionScenes = { version: 1, activeSceneId: null, scenes: [] };
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.getByRole('checkbox', { name: 'Petal ring' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/lightweaver-scene-expression-mandala-phone.png', fullPage: true });
});
