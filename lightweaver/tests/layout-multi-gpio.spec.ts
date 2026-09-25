import { test, expect } from '@playwright/test';

test('three divided sections can be assigned to three GPIO outputs without changing selection', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  await page.locator('[data-testid^="divide-commit-"]').click();

  const editor = page.getByTestId('connected-section-editor');
  await expect(editor.getByLabel(/Section \d GPIO override/)).toHaveCount(3);
  await editor.getByLabel('Section 2 GPIO override').selectOption('17');
  await editor.getByLabel('Section 3 GPIO override').selectOption('18');
  await expect(page.getByTestId('gpio-group-16').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-17').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-18').locator('.la-strip-row')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/layout-multi-gpio.png', fullPage: true });

  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[16, 1], [17, 1], [18, 1]]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-gpio-group')).toHaveCount(3);
});

test('moving the parent GPIO frees its previous port before assigning more sections', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  await page.locator('[data-testid^="divide-commit-"]').click();

  const editor = page.getByTestId('connected-section-editor');
  await editor.getByLabel('Parent GPIO').selectOption('17');
  await expect(page.getByTestId('gpio-group-16')).toHaveCount(0);
  await editor.getByLabel('Section 2 GPIO override').selectOption('18');
  await editor.getByLabel('Section 3 GPIO override').selectOption('21');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[17, 1], [18, 1], [21, 1]]);
});

test('a physical cut run can be routed to another GPIO in Advanced mapping', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await page.getByTestId('layout-specs-trigger').click();
  const advanced = page.getByTestId('advanced-installation-tools');
  await advanced.locator(':scope > summary').click();
  await advanced.locator('.lww-custom-mapping > summary').click();
  await page.getByRole('button', { name: 'Split a strip mid-wire' }).click();

  const position = await page.locator('path[data-strip-path]').first().evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.45);
    const matrix = path.getScreenCTM()!;
    return { x: point.x * matrix.a + point.y * matrix.c + matrix.e,
      y: point.x * matrix.b + point.y * matrix.d + matrix.f };
  });
  await page.mouse.click(position.x, position.y);
  const run = page.getByLabel('Physical run');
  await expect(run.locator('option')).toHaveCount(2);
  await run.selectOption({ index: 1 });
  await page.getByLabel('GPIO for selected run').selectOption('17');
  await expect(page.getByLabel('GPIO for selected run')).toHaveValue('17');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[16, 1], [17, 1]]);
  await page.getByLabel('GPIO for selected run').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/lw-sprint-gpio.png', fullPage: true });
});
