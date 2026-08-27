import { test, expect } from './studioTest';

test('Speed stays on screen after scrolling the pattern grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  const speed = page.getByTestId('look-speed-slider');
  await expect(speed).toBeVisible();
  await page.locator('.pm-cards').evaluate((node) => { node.scrollIntoView({ block: 'end' }); });
  await page.mouse.wheel(0, 800);
  const box = await speed.boundingBox();
  expect(box, 'Speed slider must remain in the viewport').toBeTruthy();
  expect(box.y + box.height).toBeGreaterThan(0);
  expect(box.y).toBeLessThan(844);
});

test('desktop: Color pane stays while the grid scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await page.locator('.pm-cards').evaluate((node) => { node.scrollIntoView({ block: 'end' }); });
  await page.mouse.wheel(0, 1200);
  await expect(page.getByTestId('look-speed-slider')).toBeInViewport();
  await expect(page.getByTestId('look-brightness-slider')).toBeInViewport();
  await expect(page.getByTestId('look-hue-slider')).toBeInViewport();
});
