import { test, expect } from '@playwright/test';

const HALO_ARTWORK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 240">
  <g id="inner" data-name="Inner halo"><path d="M 40 50 C 88 14 132 86 180 50 S 272 14 320 50" fill="none" stroke="#f66"/></g>
  <g id="middle" data-name="Middle halo"><path d="M 40 120 C 110 56 190 184 260 120 S 390 56 460 120" fill="none" stroke="#6f6"/></g>
  <g id="outer" data-name="Outer halo"><path d="M 40 190 C 130 84 250 296 340 190 S 510 84 600 190" fill="none" stroke="#66f"/></g>
</svg>`;

async function importedArtwork(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.setInputFiles('input[accept=".svg"]', {
    name: 'connected-halos.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(HALO_ARTWORK),
  });
  await page.getByTestId('artwork-create-all-strips').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  await page.locator('.la-strip-row').first().click({ position: { x: 8, y: 8 } });
}

async function divideFirst(page: any) {
  await importedArtwork(page);
  const count = page.locator('.la-strip-row .la-row-count input').first();
  await count.fill('60');
  await count.blur();
  await expect(count).toHaveValue('60');
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('2');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(4);
}

const rowCount = (page: any, index: number) => page.locator('.la-strip-row .la-row-count input').nth(index);
const savedFamilies = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.sectionFamilies || []);

test('connected section count edits preserve family identity, Undo, and reload', async ({ page }) => {
  await divideFirst(page);
  await expect(page.getByTestId('connected-child')).toHaveCount(1);
  const before = [Number(await rowCount(page, 0).inputValue()), Number(await rowCount(page, 1).inputValue())];
  expect(before[0] + before[1]).toBe(60);
  await expect.poll(() => savedFamilies(page)).toHaveLength(1);
  const familyBefore = await savedFamilies(page);
  await rowCount(page, 0).fill('20');
  await rowCount(page, 0).blur();
  await expect(rowCount(page, 0)).toHaveValue('20');
  await expect(rowCount(page, 1)).toHaveValue(String(before[1]));
  await page.getByTitle(/Undo/).first().click();
  await expect(rowCount(page, 0)).toHaveValue(String(before[0]));
  await expect.poll(() => savedFamilies(page)).toEqual(familyBefore);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips?.length)).toBe(4);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(4);
  await page.locator('.la-strip-row').first().click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('connected-child')).toHaveCount(1);
  await expect(rowCount(page, 0)).toHaveValue(String(before[0]));
});

test('locked connected section refuses Add split without changing saved family', async ({ page }) => {
  await divideFirst(page);
  await expect.poll(() => savedFamilies(page)).toHaveLength(1);
  const before = await savedFamilies(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    saved.layout.wiring = { ...(saved.layout.wiring || {}), locked: true };
    saved.layout.patchBoard = { ...(saved.layout.patchBoard || {}), physicalLocked: true };
    localStorage.setItem('lw_autosave_v3', JSON.stringify(saved));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.la-strip-row').first().click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('connected-add-split')).toBeDisabled();
  await expect(savedFamilies(page)).resolves.toEqual(before);
});

test('selected section owns its look and GPIO; merging requires a shared GPIO', async ({ page }) => {
  await divideFirst(page);
  const secondRow = page.locator('.la-strip-row').nth(1);
  const secondId = await secondRow.locator('..').getAttribute('data-strip-id');
  await secondRow.click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId(`strip-callout-${secondId}`)).toHaveAttribute('data-selected', 'true');
  await secondRow.getByTestId('layout-section-pattern-action').click();
  await page.getByRole('dialog', { name: /Choose pattern for/ }).getByRole('button', { name: 'Plasma', exact: true }).click();
  await expect(secondRow).toContainText('Plasma');
  await expect(page.locator('.la-strip-row').first()).toContainText('Aurora');
  await page.getByRole('combobox', { name: 'Inner halo 2 GPIO override' }).selectOption('17');
  await page.locator('.la-strip-row').first().click({ position: { x: 8, y: 8 } });
  const merge = page.getByTestId('connected-merge');
  await expect(merge).toBeDisabled();
  await page.getByRole('combobox', { name: /shared GPIO output/ }).selectOption('16');
  await expect(merge).toBeEnabled();
  await merge.click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
});
