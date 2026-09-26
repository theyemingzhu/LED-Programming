import { test, expect } from './studioTest';
import { choosePattern, openControls, openStep } from './helpers/pattern-lab';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { applySavedLookToPatchBoard } from '../src/lib/sectionLookModel.js';

test('Lab adds, orders, mutes, targets and undoes overlay layers', async ({ page }) => {
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await choosePattern(page, 'aurora');
  await openControls(page);
  const stack = page.getByTestId('pattern-lab-layers');
  await expect(stack.getByRole('button', { name: /Layers Base/ })).toHaveAttribute('aria-expanded', 'false');
  await stack.getByRole('button', { name: 'Add layer', exact: true }).click();
  await expect(stack.locator('.plab-layer-entry')).toHaveCount(1);
  await stack.getByRole('combobox', { name: 'Layer pattern' }).selectOption('fire');
  await stack.getByRole('combobox', { name: 'Layer blend' }).selectOption('add');
  await stack.getByRole('slider', { name: 'Layer opacity' }).fill('30');
  await expect(stack.locator('.plab-layer-select').first()).toContainText('Fire');
  await stack.getByRole('button', { name: 'Add layer', exact: true }).click();
  await stack.getByRole('combobox', { name: 'Layer pattern' }).selectOption('ocean');
  await expect(stack.locator('.plab-layer-entry')).toHaveCount(2);
  await expect(stack.locator('.plab-layer-select').first()).toContainText('Ocean');
  await stack.getByRole('button', { name: 'Move below' }).click();
  await expect(stack.locator('.plab-layer-select').first()).toContainText('Fire');
  await page.getByTestId('pattern-lab-undo').click();
  await expect(stack.locator('.plab-layer-select').first()).toContainText('Ocean');
  await stack.locator('.plab-layer-enabled input').first().uncheck();
  await expect(stack.locator('.plab-layer-enabled input').first()).not.toBeChecked();
  const targets = stack.getByRole('combobox', { name: 'Layer target' });
  if (await stack.locator('.plab-layer-select').first().getAttribute('aria-expanded') !== 'true') {
    await stack.locator('.plab-layer-select').first().click();
  }
  const options = await targets.locator('option:not([disabled])').evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value));
  expect(options.length).toBeGreaterThan(1);
  await targets.selectOption(options.find(value => value !== 'all')!);
  await expect(stack.locator('.plab-layer-entry').first()).not.toHaveAttribute('data-invalid', 'true');
});

test('layers fit the full phone inspector at 320 and 390 pixels', async ({ page }, testInfo) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
    await choosePattern(page, 'aurora');
    await openControls(page);
    const stack = page.getByTestId('pattern-lab-layers');
    await stack.getByRole('button', { name: 'Add layer', exact: true }).click();
    await expect(stack.getByRole('combobox', { name: 'Layer blend' })).toBeVisible();
    expect(await stack.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await stack.getByRole('combobox', { name: 'Layer blend' }).selectOption('screen');
    await stack.getByRole('button', { name: 'Delete layer' }).click();
    await expect(stack.locator('.plab-layer-entry')).toHaveCount(0);
    await page.getByTestId('pattern-lab-undo').click();
    await expect(stack.locator('.plab-layer-entry')).toHaveCount(1);
    await stack.locator('.plab-layer-select').click();
    await expect(stack.getByRole('combobox', { name: 'Layer blend' })).toHaveValue('screen');
    await stack.locator('.plab-layer-actions').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`lab-layers-${width}.png`), fullPage: true });
  }
});

test('an existing section mix opens as the base beneath a new layer and survives project reopen', async ({ page }, testInfo) => {
  const project = createDefaultProject();
  project.id = 'mixed-base-browser';
  project.layout.starterPending = false;
  const defaultLook = { patternId: 'aurora', brightness: 0.35, speed: 0.7, customHue: 32, customSaturation: 230 };
  const outerLook = { patternId: 'fire', brightness: 0.9, speed: 1.8, customHue: 174, customSaturation: 188 };
  project.devices.standaloneController.looks = [{
    id: 'mixed-sections', label: 'Mixed sections', defaultLook,
    sectionLooks: { 'patch-default-outer-circle': outerLook }, updatedAt: 0,
  }];
  project.devices.standaloneController.activeLookId = 'mixed-sections';
  project.devices.standaloneController.defaultLook = defaultLook;
  project.layout.patchBoard = applySavedLookToPatchBoard({
    patchBoard: project.layout.patchBoard,
    strips: project.layout.strips,
    savedLook: project.devices.standaloneController.looks[0],
  });
  await page.addInitScript(seed => {
    if (localStorage.getItem('mixed-base-browser-seeded')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(seed));
    localStorage.setItem('mixed-base-browser-seeded', 'true');
  }, project);
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-name')).toHaveValue('Mixed sections');
  await page.getByTestId('open-pattern-lab').click();
  await openControls(page);
  await openStep(page, 'sculpt');
  const stack = page.getByTestId('pattern-lab-layers');
  await stack.getByRole('button', { name: 'Edit whole look to add layer' }).click();
  await expect(stack.locator('.plab-layer-entry')).toHaveCount(1);
  await expect(stack.locator('.plab-layer-base')).toContainText('Section mix');
  await expect(stack).toContainText('Each section keeps its pattern, color, speed, and brightness');
  await expect(page.getByTestId('pattern-lab-preparing')).toHaveCount(0);
  await stack.locator('.plab-layer-base').screenshot({ path: testInfo.outputPath('mixed-section-base-row.png') });
  await page.screenshot({ path: testInfo.outputPath('mixed-section-base.png'), fullPage: true });
  await page.getByTestId('pattern-lab-undo').click();
  await expect(stack.locator('.plab-layer-entry')).toHaveCount(0);
  await stack.getByRole('button', { name: 'Edit whole look to add layer' }).click();
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: 'Update in Patterns', exact: true }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  const look = saved.devices.standaloneController.looks.find((entry: any) => entry.id === 'mixed-sections');
  expect(look.patternLabRecipe.base.sectionMix.version).toBe(1);
  expect(look.patternLabRecipe.base.sectionMix.sections[0].stripIds).toEqual(['default-outer-circle']);
  expect(look.patternLabRecipe.base.sectionMix.sections[0].look).toMatchObject(outerLook);
  expect(look.patternLabRecipe.base.sectionMix.defaultLook).toMatchObject(defaultLook);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('open-pattern-lab').click();
  await openControls(page);
  await openStep(page, 'sculpt');
  const reopenedStack = page.getByTestId('pattern-lab-layers');
  await reopenedStack.getByRole('button', { name: /Layers Base/ }).click();
  await expect(reopenedStack.locator('.plab-layer-base')).toContainText('Section mix');
});
