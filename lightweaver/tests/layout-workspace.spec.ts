import { expect, test } from '@playwright/test';

async function openOfflineLayout(page: import('@playwright/test').Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'fonts.googleapis.com') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    return url.origin === origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
  });
  await page.goto('/#screen=layout');
  await expect(page.getByTestId('layout-primitive-picker')).toBeVisible();
}

const svg = (name: string, path: string) => ({
  name: name + '.svg',
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><g id="${name}" data-name="${name}"><path d="${path}" stroke="white" fill="none"/></g></svg>`),
});

test('keeps current artwork and assigned routes when replacement is declined', async ({ page, baseURL }) => {
  await openOfflineLayout(page, baseURL!);
  const picker = page.locator('input[accept=".svg"]');
  const current = svg('Existing', 'M30 200 H610');
  const replacement = svg('Replacement', 'M320 20 V380');
  await picker.setInputFiles(current);
  await expect(page.getByText('Reference paths', { exact: true })).toBeVisible();
  const row = page.locator('.la-strip-row');
  await expect(row).toContainText('Existing');
  await row.click({ position: { x: 8, y: 8 } });
  const route = page.getByTestId('layout-selected-data-route');
  await expect(page.getByTestId('gpio-group-16').locator('.la-gpio-group-head')).toContainText('GPIO 16');
  await expect(route).toContainText('LEDs 1–');
  await expect(route).toContainText('Forward data');
  await page.getByRole('button', { name: /Reverse data direction of/ }).click();
  await expect(route).toContainText('Reverse data');

  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('clears the existing layout and its strip connections');
    await dialog.dismiss();
  });
  await picker.setInputFiles(replacement);
  await expect(row).toContainText('Existing');
  await expect(route).toContainText('Reverse data');

  page.once('dialog', dialog => dialog.accept());
  await picker.setInputFiles(replacement);
  await expect(row).toContainText('Replacement');
  await expect(page.locator('.layer-row')).toContainText('Replacement');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(row).toContainText('Existing');
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('keeps creation and view controls visible and preview easy to reach', async ({ page, baseURL }) => {
    await openOfflineLayout(page, baseURL!);
    const toolbar = page.locator('.la-workspace-toolbar');
    const bounds = (await toolbar.boundingBox())!;
    expect(bounds.height).toBeLessThanOrEqual(106);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    for (const control of await toolbar.getByRole('button').all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBe(30);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }

    const preview = toolbar.getByRole('button', { name: 'Preview', exact: true });
    const fit = (await toolbar.getByRole('button', { name: 'Fit all' }).boundingBox())!;
    expect(fit.x + fit.width).toBeLessThan((await preview.boundingBox())!.x);
    await preview.click();
    const tools = toolbar.getByRole('group', { name: 'Preview controls' });
    await expect(tools.getByRole('button', { name: 'Play' })).toBeVisible();
    await tools.getByTitle('Light glow options').click();
    await expect(tools.getByRole('button', { name: /Directed glow/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toBeFocused();
    await expect(tools).toBeHidden();

    await toolbar.getByRole('button', { name: 'Shapes' }).click();
    await expect(page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Line', exact: true })).toBeFocused();
    await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
    await toolbar.getByRole('button', { name: 'Shapes' }).click();
    await page.getByTestId('layout-add-strip-chooser').getByRole('button', { name: 'Circle', exact: true }).click();
    await expect(page.locator('.la-strip-row')).toHaveCount(2);
  });
});
