import { test, expect } from '@playwright/test';

// Drag ordering keeps physical wire order persistent. The GPIO picker lists
// connector pins first and folds the other legal pins under "More pins".

test.use({ viewport: { width: 390, height: 844 } });

async function gotoFreshLayout(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

function rowNames(page: any) {
  return page.locator('.la-strip-row .layer-name').allTextContents()
    .then((texts: string[]) => texts.map(text => text.trim()));
}

test('section drag events reorder the wire and persist after reload', async ({ page }) => {
  await gotoFreshLayout(page);
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  const count = page.locator('.la-strip-detail input[type="number"]').first();
  await count.fill('30');
  await count.blur();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  const before = await rowNames(page);
  expect(before).toHaveLength(3);

  // The native pointer gesture is covered by layout-primitives; here the
  // phone-width order regression drives the same HTML5 drag handlers and
  // verifies their payload, wire order, and saved state.
  const rows = page.locator('.la-strip-row');
  await rows.nth(2).locator('.layer-name').click();
  await expect(page.getByRole('region', { name: 'Part 3 settings', exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as any).__sectionDragTrace = [];
    for (const type of ['dragstart', 'drop']) document.addEventListener(type, event => {
      const drag = event as DragEvent;
      (window as any).__sectionDragTrace.push({ type,
        target: (event.target as Element)?.closest('.la-strip-row')?.querySelector('.layer-name')?.textContent,
        data: drag.dataTransfer?.getData('application/x-lightweaver-strip'),
      });
    }, true);
  });
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.la-strip-row'));
    const transfer = new DataTransfer();
    rows[2].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    rows[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    rows[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: rows[0].getBoundingClientRect().top + 5 }));
    rows[2].dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  expect(await page.evaluate(() => (window as any).__sectionDragTrace)).toEqual([
    expect.objectContaining({ type: 'dragstart', target: before[2] }),
    expect.objectContaining({ type: 'drop', target: before[0], data: '["strip-3"]' }),
  ]);
  await expect.poll(() => rowNames(page)).toEqual([before[2], before[0], before[1]]);
  await expect(page.locator('.la-gpio-group')).toHaveCount(1);

  // The order survives a reload (it is the wiring, not view state). Wait for
  // the autosave to carry the new run order before reloading.
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return (saved?.layout?.wiring?.outputs?.[0]?.runIds || []).join(',');
  })).toBe('run-strip-3,run-strip-1,run-strip-2');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  expect(await rowNames(page)).toEqual([before[2], before[0], before[1]]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
});

test('the GPIO picker lists the connector pins first and folds the rest under More pins', async ({ page }) => {
  await gotoFreshLayout(page);
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  const select = page.getByLabel('GPIO output').first();
  const firstFour = await select.locator(':scope > option').evaluateAll((nodes: HTMLOptionElement[]) => nodes.map(node => node.value));
  expect(firstFour).toEqual(['16', '17', '18', '21']);
  const folded = select.locator('optgroup[label="More pins"] option');
  await expect(folded).toHaveCount(11);
  // Picking a connector pin still moves the strip to that output.
  await select.selectOption('17');
  await expect(page.getByTestId('gpio-group-17')).toBeVisible();
});

test('one divided section can move to GPIO 17 while the other sections stay on GPIO 18', async ({ page }) => {
  await gotoFreshLayout(page);
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  const count = page.locator('.la-strip-detail input[type="number"]').first();
  await count.fill('30');
  await count.blur();
  await page.getByLabel('GPIO output').selectOption('18');
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);

  await page.locator('.la-strip-row').nth(1).click();
  await page.getByLabel('Part 2 GPIO override').selectOption('17');

  await expect(page.getByTestId('gpio-group-17').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-18').locator('.la-strip-row')).toHaveCount(2);
  for (const row of await page.locator('.la-strip-row').all()) {
    await row.locator('.layer-name').click();
    await expect(page.locator('.la-strip-detail .la-row-count input')).toHaveValue('10');
  }

  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return (saved?.layout?.wiring?.outputs || []).map((output: any) => ({
      gpio: output.pin,
      runCount: output.runIds.length,
    }));
  })).toEqual([
    { gpio: 18, runCount: 2 },
    { gpio: 17, runCount: 1 },
  ]);
});
