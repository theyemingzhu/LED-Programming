import { test, expect } from '@playwright/test';

// A representative imported piece rather than a synthetic drawing: three
// independent laser-cut routes, whose first halo becomes one connected family.
const HALO_ARTWORK = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 240">
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
  await page.locator('.la-strip-row').first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips?.length || 0)).toBe(3);
}

function familySnapshot(page: any) {
  return page.evaluate(() => {
    const layout = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout;
    return layout?.sectionFamilies || null;
  });
}

async function frameEditor(page: any, editor: any) {
  await editor.evaluate((element: HTMLElement) => element.scrollIntoView({ block: 'start' }));
}

async function expectSummaryClearsToolbar(page: any) {
  const geometry = await page.evaluate(() => {
    const toolbar = document.querySelector('.la-mode-nav')?.getBoundingClientRect();
    const summary = document.querySelector('.lw-connected-summary')?.getBoundingClientRect();
    return toolbar && summary ? { toolbarBottom: toolbar.bottom, summaryTop: summary.top } : null;
  });
  expect(geometry).toBeTruthy();
  expect(geometry!.toolbarBottom).toBeLessThanOrEqual(geometry!.summaryTop + 1);
}

test('connected sections preserve a parent total at a boundary, retain identities through undo and reload', async ({ page }) => {
  await importedArtwork(page);
  await page.getByLabel('Strip LED count').fill('60');
  await page.getByLabel('Strip LED count').press('Enter');

  // This was red before the connected editor existed: the selected parent has
  // one explicit action that creates a family, rather than the legacy flat
  // Strip/Divide workflow.
  await page.getByTestId('connected-add-split').click();
  const editor = page.getByTestId('connected-section-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('connected-parent')).toContainText(/LEDs/i);
  const children = editor.getByTestId('connected-child');
  await expect(children).toHaveCount(2);
  await expect.poll(() => familySnapshot(page)).toHaveLength(1);

  const before = [Number(await page.getByLabel('Section 1 actual LEDs').inputValue())];
  await children.nth(1).getByRole('button').click();
  before.push(Number(await page.getByLabel('Section 2 actual LEDs').inputValue()));
  await children.nth(0).getByRole('button').click();
  expect(before[0] + before[1]).toBeGreaterThan(1);

  // Name before the boundary adjustment, so one undo should retain this edit
  // while restoring only the conserved boundary.
  await page.getByLabel('Section 1 name').fill('Inner glow');
  await page.getByLabel('Section 1 name').press('Enter');
  const firstName = await page.getByLabel('Section 1 name').inputValue();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')
    ?.layout?.strips?.[0]?.name)).toBe('Inner glow');
  const beforeBoundaryFamily = await familySnapshot(page);
  const boundary = page.getByLabel(`Exact boundary after ${firstName}`);
  await boundary.fill('20');
  await boundary.press('Enter');

  const afterBoundary = [Number(await page.getByLabel('Section 1 actual LEDs').inputValue())];
  await children.nth(1).getByRole('button').click();
  afterBoundary.push(Number(await page.getByLabel('Section 2 actual LEDs').inputValue()));
  await children.nth(0).getByRole('button').click();
  expect(afterBoundary).toEqual([20, before[0] + before[1] - 20]);
  expect(afterBoundary[0] + afterBoundary[1]).toBe(before[0] + before[1]);
  await frameEditor(page, editor);
  await expectSummaryClearsToolbar(page);
  await page.screenshot({ path: 'test-results/connected-section-editor-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await frameEditor(page, editor);
  await expectSummaryClearsToolbar(page);
  await page.screenshot({ path: 'test-results/connected-section-editor-phone.png' });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByTitle(/Undo/).click();
  await expect(page.getByLabel('Section 1 actual LEDs')).toHaveValue(String(before[0]));
  await children.nth(1).getByRole('button').click();
  await expect(page.getByLabel('Section 2 actual LEDs')).toHaveValue(String(before[1]));
  await expect.poll(() => familySnapshot(page)).toEqual(beforeBoundaryFamily);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Selection is intentionally session state. Re-selecting a persisted child
  // opens its parent family without reconstructing a flat legacy strip list.
  const restoredChildId = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')
    ?.layout?.sectionFamilies?.[0]?.memberIds?.[0]);
  expect(restoredChildId).toBeTruthy();
  await page.locator(`[data-strip-id="${restoredChildId}"]`).locator('.la-strip-row').click();
  const reloadedEditor = page.getByTestId('connected-section-editor');
  await expect(reloadedEditor).toBeVisible();
  await expect(reloadedEditor.getByTestId('connected-child')).toHaveCount(2);
  await expect(page.getByLabel('Section 1 name')).toHaveValue('Inner glow');
  await expect(page.getByLabel('Section 1 actual LEDs')).toHaveValue(String(before[0]));
  expect(await familySnapshot(page)).toEqual(beforeBoundaryFamily);
});

test('a locked connected family refuses Add split without changing its saved family', async ({ page }) => {
  await importedArtwork(page);

  const before = await familySnapshot(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    saved.layout.wiring = { ...(saved.layout.wiring || {}), locked: true };
    saved.layout.patchBoard = { ...(saved.layout.patchBoard || {}), physicalLocked: true };
    localStorage.setItem('lw_autosave_v3', JSON.stringify(saved));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.locator('.la-strip-row').first().click();
  const addSplit = page.getByTestId('connected-add-split');
  await expect(addSplit).toBeDisabled();
  await expect(familySnapshot(page)).resolves.toEqual(before);
});

test('a selected child highlights its canvas path, carries its own look and GPIO, and only merges on a shared GPIO', async ({ page }) => {
  await importedArtwork(page);
  await page.getByTestId('connected-add-split').click();
  const editor = page.getByTestId('connected-section-editor');
  await expect(editor).toBeVisible();

  const childRows = editor.getByTestId('connected-child');
  const secondId = await childRows.nth(1).getAttribute('data-section-id');
  expect(secondId).toBeTruthy();
  const sectionButtons = editor.getByRole('button', { name: /^Select / });
  await sectionButtons.nth(1).click();
  await expect(childRows.nth(1)).toHaveClass(/selected/);
  await expect(page.getByTestId(`strip-callout-${secondId}`)).toHaveAttribute('data-selected', 'true');

  const pattern = page.getByLabel('Section 2 pattern');
  const currentPattern = await pattern.inputValue();
  const alternatePattern = await pattern.locator('option').evaluateAll((options: HTMLOptionElement[], current) =>
    options.map(option => option.value).find(value => value !== current), currentPattern);
  expect(alternatePattern).toBeTruthy();
  await pattern.selectOption(alternatePattern!);
  await expect(pattern).toHaveValue(alternatePattern!);

  await page.getByLabel('Section 2 GPIO override').selectOption('17');
  await sectionButtons.first().click();
  const merge = editor.getByTestId('connected-merge').first();
  await expect(merge).toBeDisabled();
  await page.getByLabel('Parent GPIO').selectOption('16');
  await expect(merge).toBeEnabled();
  await merge.click();
  await expect(editor).toBeHidden();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
});
