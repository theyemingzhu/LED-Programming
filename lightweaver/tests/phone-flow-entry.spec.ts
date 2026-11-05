import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });
for (const width of [375, 390, 768, 1280]) test(`Lab scene entry and area controls remain reachable at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const mutations: string[] = [];
  await page.route(/^http:\/\/(lightweaver\.local|192\.168\.4\.1)\//, async route => {
    if (route.request().method() !== 'GET') mutations.push(route.request().method());
    await route.abort();
  });
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  const entry = page.getByTestId('pattern-lab-build-scene');
  await expect(entry).toBeVisible({ timeout: 2000 });
  const toolbar = page.getByTestId('pattern-lab-toolbar');
  const bounds = await entry.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  expect(await toolbar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.getByTestId('pattern-lab-screen').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  if (width > 1000) await expect(page.getByTestId('pattern-lab-back')).toBeVisible();
  else await expect(page.getByTestId('pattern-lab-back')).toBeHidden();
  if (width <= 1000) {
    for (const button of await toolbar.getByRole('button').all()) {
      const target = (await button.boundingBox())!;
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }
  }
  const designName = page.getByTestId('pattern-lab-draft-name');
  const beforeName = await designName.count() ? await designName.inputValue() : null;
  await page.screenshot({ path: testInfo.outputPath(`lab-entry-${width}.png`), fullPage: false });
  if (width === 375) {
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press('Enter');
  } else {
    await entry.tap();
  }
  await expect(page.getByTestId('scene-expression-editor')).toBeVisible();
  await page.getByRole('button', { name: '+ Area' }).click();
  await page.getByLabel('Scene pattern').selectOption('chase');
  await page.getByLabel('Pattern domain').selectOption('continuous');
  await expect(page.getByRole('region', { name: 'Scene preview' })).not.toContainText('Preview unavailable');
  await expect(page.locator('.sexp-flow-row')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath(`scene-controls-${width}.png`), fullPage: false });
  await page.getByRole('button', { name: 'Back to Lab', exact: true }).click();
  await expect(entry).toBeVisible();
  if (beforeName !== null) await expect(designName).toHaveValue(beforeName);
  else await expect(designName).toHaveCount(0);
  expect(mutations).toEqual([]);
});
