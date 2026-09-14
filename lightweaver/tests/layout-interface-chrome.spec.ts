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

  const labelStyle = await page.locator('.la-strip-physical-field > .k').first().evaluate(element => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      tracking: style.letterSpacing,
      transform: style.textTransform,
    };
  });
  expect(labelStyle.family).toContain('General Sans');
  expect(labelStyle.family).not.toContain('Spline Sans Mono');
  expect(labelStyle.tracking).toBe('normal');
  expect(labelStyle.transform).toBe('none');

  const valueStyle = await page.getByTestId(/strip-first-led-/).evaluate(element => {
    const style = getComputedStyle(element);
    return { family: style.fontFamily, numerals: style.fontVariantNumeric };
  });
  expect(valueStyle.family).toContain('Spline Sans Mono');
  expect(valueStyle.numerals).toContain('tabular-nums');

  const canvasName = page.locator('.lw-strip-label-name').first();
  await expect(canvasName).toBeVisible();
  expect(await canvasName.evaluate(element => getComputedStyle(element).fontFamily)).toContain('General Sans');
  expect(await canvasName.evaluate(element => getComputedStyle(element).fontFamily)).not.toContain('Spline Sans Mono');
});
