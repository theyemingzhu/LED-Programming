import { test, expect } from '@playwright/test';

// Order and outputs in words (sections-effortless plan, change 3): every
// section row on Layout can be moved up or down the wire with a word button,
// so wire order is editable with a thumb, and the pin picker lists the four
// connector pins first with the other legal pins folded under "More pins".

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

test('Move up and Move down reorder sections on the wire without a drag', async ({ page }) => {
  await gotoFreshLayout(page);
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  const count = page.locator('.la-strip-detail input[type="number"]').first();
  await count.fill('30');
  await count.blur();
  await page.locator('[data-testid^="divide-sections-"]').selectOption('3');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  const before = await rowNames(page);
  expect(before).toHaveLength(3);

  // Select the last section; only Move up is available there.
  await page.locator('.la-strip-row').nth(2).click();
  const order = page.locator('[data-testid^="wire-order-"]');
  await expect(order).toHaveCount(1);
  await expect(order.getByRole('button', { name: /down the wire/ })).toBeDisabled();
  await order.getByRole('button', { name: /up the wire/ }).click();
  await expect.poll(() => rowNames(page)).toEqual([before[0], before[2], before[1]]);

  // Once more takes it to the top, where Move up disables.
  await order.getByRole('button', { name: /up the wire/ }).click();
  await expect.poll(() => rowNames(page)).toEqual([before[2], before[0], before[1]]);
  await expect(order.getByRole('button', { name: /up the wire/ })).toBeDisabled();
  // Still one output: word moves never re-pin a strip.
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
