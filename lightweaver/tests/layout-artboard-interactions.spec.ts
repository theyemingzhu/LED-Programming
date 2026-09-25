import { test, expect } from '@playwright/test';

async function freshLayout(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('Layout hover help paints in front of the artboard without sidebar clipping', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await freshLayout(page);
  await page.getByTestId('layout-check-and-install').hover();

  const tip = page.getByRole('tooltip');
  await expect(tip).toHaveText('Check the lights and install this project on the connected card.');
  const tipBox = await tip.boundingBox();
  const artboardBox = await page.locator('.la .body').boundingBox();
  if (!tipBox || !artboardBox) throw new Error('Layout hover help or artboard has no visible bounds');
  expect(tipBox.x).toBeLessThan(artboardBox.x + artboardBox.width);
  expect(tipBox.x + tipBox.width).toBeGreaterThan(artboardBox.x + artboardBox.width);
});

test('dragging the center of a selected closed shape moves the strip', async ({ page }) => {
  await freshLayout(page);
  const picker = page.getByTestId('layout-primitive-picker');
  await picker.getByRole('button', { name: 'Circle', exact: true }).click();
  await picker.getByRole('button', { name: 'Create circle' }).click();

  const path = page.locator('path[data-strip-path]').first();
  const center = await path.evaluate((element: SVGPathElement) => {
    const box = element.getBBox();
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error('Circle has no screen transform');
    const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 50, center.y + 30, { steps: 6 });
  await page.mouse.up();

  await expect(path.locator('xpath=..')).not.toHaveAttribute('transform', 'translate(0 0)');
});

test('dragging an on-artboard strip label moves its strip', async ({ page }) => {
  await freshLayout(page);
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();

  const path = page.locator('path[data-strip-path]').first();
  const label = page.locator('.lw-strip-callout').first();
  const box = await label.boundingBox();
  if (!box) throw new Error('Strip label has no visible bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();

  await expect(path.locator('xpath=..')).not.toHaveAttribute('transform', 'translate(0 0)');
});

test('returning a dragged strip to its starting point restores its geometry', async ({ page }) => {
  await freshLayout(page);
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();

  const path = page.locator('path[data-strip-path]').first();
  const center = await path.evaluate((element: SVGPathElement) => {
    const box = element.getBBox();
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error('Line has no screen transform');
    const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 60, center.y + 30, { steps: 6 });
  await expect(path.locator('xpath=..')).not.toHaveAttribute('transform', 'translate(0 0)');
  await page.mouse.move(center.x, center.y, { steps: 6 });
  await page.mouse.up();

  await expect(path.locator('xpath=..')).toHaveAttribute('transform', 'translate(0 0)');
});
