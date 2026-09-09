import { test, expect } from './studioTest';
import { openControls } from './helpers/pattern-lab';

test.beforeEach(async ({ page }) => {
  // This authoring proof must never reach a physical controller.
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await openControls(page);
});

test('a color journey can be explored and kept without opening technical controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Slow color drift', exact: true }).click();
  await expect(page.getByTestId('color-journey-ribbon')).toBeVisible();
  await page.getByRole('slider', { name: 'Pace', exact: true }).fill('25');
  await page.getByRole('button', { name: 'Try a variation', exact: true }).click();
  await expect(page.getByTestId('color-journey-variation')).toHaveCount(3);
  await page.getByTestId('color-journey-variation').first().click();
  await page.getByRole('button', { name: 'Keep this look', exact: true }).click();
  await expect(page.getByTestId('color-journey-save-state')).toContainText(/saved/i);
  const colors = await page.getByTestId('color-journey-ribbon').locator('[data-color]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color')));
  await page.reload();
  await expect(page.getByTestId('color-journey-ribbon')).toBeVisible();
  await expect.poll(() => page.getByTestId('color-journey-ribbon').locator('[data-color]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color')))).toEqual(colors);
  await expect(page.getByTestId('color-journey-save-state')).toContainText(/saved|kept/i);
});

test('the creative controls stay usable on a phone without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Slow color drift', exact: true }).click();
  await expect(page.getByTestId('color-journey-ribbon')).toBeVisible();
  await page.getByRole('button', { name: 'Move color 1 right', exact: true }).click();
  await page.getByRole('button', { name: 'Try a variation', exact: true }).click();
  await page.getByTestId('color-journey-variation').first().click();
  await page.getByRole('button', { name: 'Keep this look', exact: true }).click();
  await expect(page.getByTestId('color-journey-save-state')).toContainText(/saved/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const keepBox = await page.getByRole('button', { name: /Keep this look|Update/i }).first().boundingBox();
  expect(keepBox?.height).toBeGreaterThanOrEqual(44);
});

test('color ordering is reversible and works without precise dragging', async ({ page }) => {
  await page.getByRole('button', { name: 'Slow color drift', exact: true }).click();
  const swatches = page.getByTestId('color-journey-ribbon').locator('[data-color]');
  const original = await swatches.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color')));
  expect(original.length).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Move color 1 right', exact: true }).click();
  await expect.poll(() => swatches.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color'))))
    .toEqual([original[1], original[0], ...original.slice(2)]);
  await page.getByLabel('Shape the color journey', { exact: true }).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => swatches.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color')))).toEqual(original);
});

test('dragging a color changes the journey and locked colors survive exploration', async ({ page }) => {
  await page.getByRole('button', { name: 'Slow color drift', exact: true }).click();
  const swatches = page.getByTestId('color-journey-ribbon').locator('[data-color]');
  const colors = () => swatches.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color')));
  const original = await colors();
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    await page.getByRole('button', { name: 'Move color 1 right', exact: true }).click();
    await page.getByRole('button', { name: 'Move color 2 right', exact: true }).click();
  } else {
    await swatches.nth(0).dragTo(swatches.nth(2));
  }
  await expect.poll(colors).toEqual([original[1], original[2], original[0]]);
  await page.getByRole('button', { name: 'Lock color 1', exact: true }).click();
  await page.getByRole('button', { name: 'Try a variation', exact: true }).click();
  await page.getByTestId('color-journey-variation').first().click();
  expect((await colors())[0]).toBe(original[1]);
});

test('an unkept color edit survives reload without pretending it was saved', async ({ page }) => {
  await page.getByRole('button', { name: 'Slow color drift', exact: true }).click();
  await page.getByRole('button', { name: 'Keep this look', exact: true }).click();
  await expect(page.getByTestId('color-journey-save-state')).toContainText(/saved/i);
  await page.getByRole('button', { name: 'Move color 1 right', exact: true }).click();
  const colors = await page.getByTestId('color-journey-ribbon').locator('[data-color]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color')));
  await page.reload();
  await expect.poll(() => page.getByTestId('color-journey-ribbon').locator('[data-color]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-color')))).toEqual(colors);
  await expect(page.getByTestId('color-journey-save-state')).toContainText('Unsaved changes');
});
