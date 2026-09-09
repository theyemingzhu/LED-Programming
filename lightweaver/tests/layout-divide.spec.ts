import { test, expect } from '@playwright/test';

// Dividing one drawn strip into several sections is the general form of
// "Split into two" (tests/layout-strip-split.spec.ts): the LED total never
// changes, the remainder is spread evenly from the first section, and each
// new strip lands on the same output right after the one before it — so it
// compiles to its own zone (wiringCompiler.js) and its own section target on
// the Patterns screen, without any change to the wiring/card contract.
//
// The control lives as a field in the Selected-strip physical grid (next to
// LED count, Size, Chipset · data pin) rather than as a button in the
// actions row — that row's total width is a locked budget asserted by
// tests/layout-strip-caption.spec.ts, and the grid is the one place a new
// field wraps to its own row instead of forcing the panel wider.

async function gotoFreshLayout(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

// A freshly created strip is selected, so its "Divide into" field is already
// visible — same setup layout-strip-split.spec.ts uses for Split.
async function createOneStrip(page: any) {
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  await expect(page.locator('[data-testid^="divide-commit-"]')).toHaveCount(1);
}

async function setStripLedCount(page: any, count: number) {
  const input = page.locator('.la-strip-detail input[type="number"]').first();
  await input.fill(String(count));
  await input.blur();
}

function rowCounts(page: any) {
  return page.locator('.la-strip-row .layer-len').allTextContents()
    .then((texts: string[]) => texts.map(text => Number.parseInt(text, 10)));
}

test('dividing a 41-LED strip into 4 makes four strips of 11, 10, 10, 10', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);
  await setStripLedCount(page, 41);

  const select = page.locator('[data-testid^="divide-sections-"]');
  await select.selectOption('4');
  await expect(page.locator('[data-testid^="divide-preview-"]')).toHaveText('11, 10, 10, 10 LEDs');

  const commit = page.locator('[data-testid^="divide-commit-"]');
  await expect(commit).toBeEnabled();
  await commit.click();

  await expect(page.locator('.la-strip-row')).toHaveCount(4);
  expect(await rowCounts(page)).toEqual([11, 10, 10, 10]);
  // All four pieces stay on one output, in the order the data travels.
  await expect(page.locator('.la-gpio-group')).toHaveCount(1);
});

test('dividing into 3 spreads the remainder from the first section, and survives a reload', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);
  await setStripLedCount(page, 41);

  await page.locator('[data-testid^="divide-sections-"]').selectOption('3');
  await expect(page.locator('[data-testid^="divide-preview-"]')).toHaveText('14, 14, 13 LEDs');
  await page.locator('[data-testid^="divide-commit-"]').click();

  expect(await rowCounts(page)).toEqual([14, 14, 13]);
  await expect(page.locator('.la-strip-row .layer-name')).toHaveText(['Line 1', 'Line 2', 'Line 3']);

  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')
    ?.layout?.strips || []).map((strip: any) => strip.pixelCount))).toEqual([14, 14, 13]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  await expect.poll(() => rowCounts(page)).toEqual([14, 14, 13]);
  await expect(page.locator('.la-gpio-group')).toHaveCount(1);
});

test('the Patterns screen lists one section target per divided piece', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);
  await setStripLedCount(page, 41);
  await page.locator('[data-testid^="divide-sections-"]').selectOption('4');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(4);

  // Autosave is debounced — wait for the divided project to actually land
  // before switching screens.
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')
    ?.layout?.strips || []).length)).toBe(4);

  await page.goto('/#screen=patterns', { waitUntil: 'domcontentloaded' });
  const sectionTargets = page.locator('[data-testid^="section-target-"]:not([data-testid="section-target-all"])');
  await expect(sectionTargets).toHaveCount(4);
});

test('a strip with fewer than 2 LEDs cannot be divided', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);
  await setStripLedCount(page, 1);

  const commit = page.locator('[data-testid^="divide-commit-"]').first();
  await expect(commit).toBeDisabled();
  await expect(commit).toHaveAttribute('title', /at least 2 LEDs/);
  await expect(page.locator('[data-testid^="divide-sections-"]').first()).toBeDisabled();
});

test('dividing never offers more sections than there are LEDs, and caps at 12', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);

  // 5 LEDs: at most 5 sections should be offered, never more.
  await setStripLedCount(page, 5);
  const fiveOptions = page.locator('[data-testid^="divide-sections-"] option');
  await expect(fiveOptions).toHaveCount(4); // 2, 3, 4, 5
  await expect(fiveOptions.last()).toHaveText('5 sections');

  // A strip with far more LEDs than the card can address as zones stops at 12.
  await setStripLedCount(page, 200);
  const manyOptions = page.locator('[data-testid^="divide-sections-"] option');
  await expect(manyOptions).toHaveCount(11); // 2..12
  await expect(manyOptions.last()).toHaveText('12 sections');
});

test('Split into two keeps working unchanged alongside the new Divide control', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);

  const firstName = await page.locator('.la-strip-row .layer-name').first().innerText();
  await page.locator('[data-testid^="split-strip-"]').first().click();
  await expect(page.locator('.la-strip-row .layer-name')).toHaveText([firstName, `${firstName} 2`]);
  await expect(page.locator('.la-gpio-group')).toHaveCount(1);
});

test('the Divide control fits at 390px wide with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoFreshLayout(page);
  await createOneStrip(page);
  await setStripLedCount(page, 41);

  await expect(page.locator('[data-testid^="divide-preview-"]')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);

  await page.locator('[data-testid^="divide-sections-"]').selectOption('4');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(4);

  const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflowAfter).toBe(false);
});
