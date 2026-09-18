import { test, expect } from '@playwright/test';

async function openOneStrip(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-detail')).toBeVisible();
}

test('Layout chrome uses compact UI type and keeps explanations out of the working surface', async ({ page }) => {
  await openOneStrip(page);

  await expect(page.getByTestId('layout-check-and-install')).toHaveText('Install on card');
  await expect(page.locator('.la-strip-caption')).toHaveCount(0);

  const valueStyle = await page.getByLabel('Strip LED count', { exact: true }).evaluate(element => {
    const style = getComputedStyle(element);
    return { numerals: style.fontVariantNumeric };
  });
  expect(valueStyle.numerals).toContain('tabular-nums');

  const canvasName = page.locator('.lw-strip-label-name').first();
  await expect(canvasName).toBeVisible();
  expect(await canvasName.evaluate(element => getComputedStyle(element).fontFamily)).toContain('General Sans');
  expect(await canvasName.evaluate(element => getComputedStyle(element).fontFamily)).not.toContain('Spline Sans Mono');
});

test('compact inspector keeps units inline and moves selected-strip facts to Specs', async ({ page }) => {
  await openOneStrip(page);
  const inspector = page.locator('.la-strip-inspector');
  await expect(inspector.getByText('Pitch', { exact: true })).toHaveCount(0);
  await expect(inspector.getByText('Emit', { exact: true })).toHaveCount(0);
  await expect(inspector.getByText('First light', { exact: true })).toHaveCount(0);
  await expect(inspector.getByText('Size', { exact: true })).toHaveCount(0);
  await expect(inspector.getByText('Chipset · data pin', { exact: true })).toHaveCount(0);
  await expect(inspector.getByLabel('Strip LED count', { exact: true })).toBeVisible();
  await expect(inspector.getByLabel('Strip length in metres')).toBeVisible();
  await page.getByTestId('layout-specs-trigger').click();
  const specs = page.getByTestId('layout-specs-panel');
  await expect(specs.getByTestId(/strip-pitch-/)).toBeVisible();
  await expect(specs.getByTestId(/strip-emit-/)).toBeVisible();
  await expect(specs.getByTestId(/strip-first-led-/)).toBeVisible();
  await specs.getByRole('button', { name: 'Change project chipset' }).click();
  await expect(specs.getByTestId('project-led-chipset')).toBeVisible();
});

test('section fields stay dense and keep accessible names without repeated visible labels', async ({ page }) => {
  await openOneStrip(page);
  await page.getByLabel('Strip LED count', { exact: true }).fill('41');
  const toggle = page.locator('[data-testid^="divide-toggle-"]');
  await toggle.click();
  const sections = page.locator('[data-testid^="divide-sections-"]');
  await sections.fill('4');
  const toggleBox = (await toggle.boundingBox())!;
  const sectionsBox = (await sections.boundingBox())!;
  expect(Math.abs((toggleBox.y + toggleBox.height / 2) - (sectionsBox.y + sectionsBox.height / 2))).toBeLessThan(10);
  const fields = page.locator('[data-testid^="divide-count-"]');
  await expect(fields).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect(fields.nth(i)).toHaveAttribute('aria-label', `Section ${i + 1} LEDs`);
  }
  await expect(page.locator('[data-testid^="divide-preview-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="divide-commit-"]')).toHaveText('Divide into 4 sections');
});

test('strip menu supports Escape and keeps duplicate and remove reachable', async ({ page }) => {
  await openOneStrip(page);
  const more = page.getByRole('button', { name: 'More strip actions', exact: true });
  await more.click();
  await expect(page.getByRole('button', { name: 'Duplicate strip', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove strip', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await expect(page.getByRole('button', { name: 'Remove strip', exact: true })).toBeHidden();
  await more.click();
  await page.getByRole('button', { name: 'Duplicate strip', exact: true }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'More strip actions', exact: true }).click();
  await page.getByRole('button', { name: 'Remove strip', exact: true }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
});
