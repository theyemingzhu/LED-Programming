import { test, expect } from './studioTest';
import { choosePattern, openControls } from './helpers/pattern-lab';

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
