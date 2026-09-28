import { test, expect } from '@playwright/test';

const artwork = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 100"><g id="ribbon" data-name="Ribbon"><path d="M 30 50 L 550 50" stroke="white" fill="none"/></g></svg>';

async function fourSections(page: any) {
  await page.goto('/#screen=layout');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles('input[accept=".svg"]', { name: 'ribbon.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(artwork) });
  await page.getByTestId('artwork-create-all-strips').click();
  await page.locator('.la-strip-row').click({ position: { x: 8, y: 8 } });
  await page.getByRole('spinbutton', { name: 'Ribbon LED count' }).fill('41');
  await page.getByRole('spinbutton', { name: 'Ribbon LED count' }).blur();
  await expect(page.getByRole('spinbutton', { name: 'Ribbon LED count' })).toHaveValue('41');
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('4');
  await expect.poll(() => page.locator('[data-testid^="divide-count-"]').evaluateAll((items: HTMLInputElement[]) => items.map(item => item.value)))
    .toEqual(['11', '10', '10', '10']);
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(4);
}

test('one selected editor, direct counts, and no numbered or repeated section navigation', async ({ page }) => {
  await fourSections(page);
  await page.locator('.la-strip-row').nth(1).click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('connected-section-editor')).toHaveCount(1);
  await expect(page.getByTestId('connected-child')).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.locator('.la-inspector-main').evaluate((element: HTMLElement) => { element.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/lightweaver-selected-editor-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.la-inspector-main').evaluate((element: HTMLElement) => { element.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/lightweaver-selected-editor-phone.png', fullPage: true });
  await page.locator('.la-strip-row').first().evaluate((element: HTMLElement) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: '/tmp/lightweaver-selected-editor-phone-strips.png', fullPage: true });
  await expect(page.locator('.lw-connected-bar')).toHaveCount(0);
  await expect(page.locator('.la-wire-n')).toHaveCount(4);
  for (const grip of await page.locator('.la-wire-n').all()) await expect(grip).not.toContainText(/\d/);
  await expect(page.getByRole('spinbutton', { name: 'Ribbon 2 LED count' })).toHaveValue('10');
  await expect(page.getByTestId('connected-boundary')).toHaveCount(0);
  await page.getByRole('spinbutton', { name: 'Ribbon 2 LED count' }).fill('73');
  await page.getByRole('spinbutton', { name: 'Ribbon 2 LED count' }).press('Escape');
  await expect(page.getByRole('spinbutton', { name: 'Ribbon 2 LED count' })).toHaveValue('10');
  await expect(page.getByTestId('layout-total-led-count')).toHaveValue('41');
  await page.getByRole('button', { name: 'One more LED in Ribbon 2' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Ribbon 2 LED count' })).toHaveValue('11');
  await expect(page.getByTestId('layout-total-led-count')).toHaveValue('42');
  await page.getByTitle(/Undo/).first().click();
  await expect(page.getByRole('spinbutton', { name: 'Ribbon 2 LED count' })).toHaveValue('10');
  await page.getByRole('combobox', { name: 'Ribbon shared reel density' }).selectOption('96');
  await expect(page.getByRole('spinbutton', { name: 'Ribbon 2 LED count' })).toHaveValue('10');
  await expect(page.getByRole('combobox', { name: 'Ribbon shared reel density' })).toHaveValue('96');
  await page.getByTitle(/Undo/).first().click();
  await expect(page.getByRole('combobox', { name: 'Ribbon shared reel density' })).toHaveValue('60');
  await page.getByRole('spinbutton', { name: 'Ribbon 2 section length in metres' }).fill('0.2');
  await page.getByRole('spinbutton', { name: 'Ribbon 2 section length in metres' }).blur();
  await expect(page.getByRole('spinbutton', { name: 'Ribbon 2 LED count' })).toHaveValue('12');
  await page.getByTitle(/Undo/).first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips?.length)).toBe(4);
  await page.reload();
  await expect(page.locator('.la-strip-row')).toHaveCount(4);
  await expect(page.getByTestId('layout-total-led-count')).toHaveValue('41');
});

test('Layout pattern gallery previews and applies only the selected section, then returns focus', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/(control|config|project)(?:[/?]|$)/.test(request.url())) writes.push(request.url());
  });
  await fourSections(page);
  const row = page.locator('.la-strip-row').nth(1);
  const trigger = row.getByTestId('layout-section-pattern-action');
  const targetId = await trigger.getAttribute('data-target-id');
  expect(targetId).toBeTruthy();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips?.length)).toBe(4);
  await page.goto('/#screen=pattern');
  await expect(page.getByTestId(`section-target-${targetId}`)).toBeVisible();
  await page.getByTestId('look-name').fill('Before Layout edit');
  await page.getByTestId('look-save-preset').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices?.standaloneController?.looks?.some((look: any) => look.label === 'Before Layout edit'))).toBe(true);
  await page.goto('/#screen=layout');
  const firstPatternBefore = await page.locator('.la-strip-row').first().getByTestId('layout-section-pattern-action').innerText();
  const thirdPatternBefore = await page.locator('.la-strip-row').nth(2).getByTestId('layout-section-pattern-action').innerText();
  await trigger.click();
  await expect(page).toHaveURL(/screen=layout/);
  const gallery = page.getByRole('dialog', { name: 'Choose pattern for Ribbon 2' });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Plasma', exact: true })).toBeVisible();
  await expect(gallery.locator('.la-pattern-preview').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gallery).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await gallery.getByRole('button', { name: 'Plasma', exact: true }).click();
  await expect(gallery).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(row).toContainText('Plasma');
  await expect(page.locator('.la-strip-row').first().getByTestId('layout-section-pattern-action')).toHaveText(firstPatternBefore);
  await expect(page.locator('.la-strip-row').nth(2).getByTestId('layout-section-pattern-action')).toHaveText(thirdPatternBefore);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.patchBoard?.patches?.map((p: any) => p.playback?.patternId))).toContain('plasma');
  await page.reload();
  await expect(page.locator('.la-strip-row').nth(1)).toContainText('Plasma');
  await page.goto('/#screen=pattern');
  await expect(page.getByTestId(`section-pattern-${targetId}`)).toHaveText('Plasma');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices?.standaloneController?.looks?.some((look: any) => look.label === 'Before Layout edit'))).toBe(true);
  expect(writes).toEqual([]);
});
