import { test, expect } from '@playwright/test';

// Dividing one drawn strip into several sections is the general form of
// "Split into two" (tests/layout-strip-split.spec.ts): the LED total never
// changes, the remainder is spread evenly from the first section, and each
// new strip lands on the same output right after the one before it — so it
// compiles to its own zone (wiringCompiler.js) and its own section target on
// the Patterns screen, without any change to the wiring/card contract.
//
// Division opens on demand; sizing and the existing one-click Split stay visible.

async function gotoFreshLayout(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

// A fresh strip keeps its division controls tucked behind an explicit action.
async function createOneStrip(page: any) {
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await expect(page.locator('[data-testid^="divide-commit-"]')).toBeVisible();
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
  await select.fill('4');
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
  // A custom name keeps this persistence check independent of generated naming.
  await page.locator('.la-strip-row .layer-name').dblclick();
  await page.locator('.la-strip-row input').fill('Ribbon');
  await page.locator('.la-strip-row input').press('Enter');
  await setStripLedCount(page, 41);

  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  await expect(page.locator('[data-testid^="divide-preview-"]')).toHaveText('14, 14, 13 LEDs');
  await page.locator('[data-testid^="divide-commit-"]').click();

  expect(await rowCounts(page)).toEqual([14, 14, 13]);
  await expect(page.locator('.la-strip-row .layer-name')).toHaveText(['Ribbon 1', 'Ribbon 2', 'Ribbon 3']);

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
  await page.locator('[data-testid^="divide-sections-"]').fill('4');

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

test('the section count accepts any whole number within the strip and card limits', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);

  await setStripLedCount(page, 5);
  const sections = page.locator('[data-testid^="divide-sections-"]');
  await expect(sections).toHaveAttribute('min', '2');
  await expect(sections).toHaveAttribute('max', '5');
  await sections.fill('5');
  await expect(page.locator('[data-testid^="divide-count-"]')).toHaveCount(5);

  // A strip with far more LEDs than the card can address as zones is capped at 12.
  await setStripLedCount(page, 200);
  await expect(sections).toHaveAttribute('max', '12');
  await sections.fill('12');
  await expect(page.locator('[data-testid^="divide-count-"]')).toHaveCount(12);
});

test('an invalid section count stays visible and cannot divide', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);
  await setStripLedCount(page, 41);

  const sections = page.locator('[data-testid^="divide-sections-"]');
  const commit = page.locator('[data-testid^="divide-commit-"]');
  const error = page.locator('[data-testid^="divide-error-"]');

  for (const value of ['', '3.5', '1', '13']) {
    await sections.fill(value);
    await expect(sections).toHaveValue(value);
    await expect(sections).toHaveAttribute('aria-invalid', 'true');
    await expect(error).toBeVisible();
    await expect(commit).toBeDisabled();
  }

  await sections.fill('7');
  await expect(sections).toHaveAttribute('aria-invalid', 'false');
  await expect(error).toBeHidden();
  await expect(page.locator('[data-testid^="divide-count-"]')).toHaveCount(7);
  await expect(commit).toBeEnabled();
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

  await page.locator('[data-testid^="divide-sections-"]').fill('4');

  // The counts are the point of the preview: on a phone they must read in
  // full, never clipped to "11, 10,…".
  const preview = page.locator('[data-testid^="divide-preview-"]');
  await expect(preview).toHaveText('11, 10, 10, 10 LEDs');
  const sectionInput = page.locator('[data-testid^="divide-count-"]').first();
  expect((await sectionInput.boundingBox())!.width).toBeLessThanOrEqual(60);
  const clipped = await preview.evaluate(el => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
  await page.screenshot({ path: 'test-results/layout-divide-390.png' });
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(4);

  const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflowAfter).toBe(false);
});

// Uneven divide (sections-effortless plan, change 5): the counts are fields.
// Typing one count moves the difference to its neighbour, so the strip's LED
// total never changes and Divide is never refused for a sum that is off.
test('typing a section count rebalances its neighbour and divides to those exact counts', async ({ page }) => {
  await gotoFreshLayout(page);
  await createOneStrip(page);
  await setStripLedCount(page, 41);

  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  await expect(page.locator('[data-testid^="divide-preview-"]')).toHaveText('14, 14, 13 LEDs');

  const first = page.locator('[data-testid^="divide-count-"][data-testid$="-1"]');
  await first.fill('10');
  await expect(page.locator('[data-testid^="divide-preview-"]')).toHaveText('10, 18, 13 LEDs');
  const last = page.locator('[data-testid^="divide-count-"][data-testid$="-3"]');
  await last.fill('21');
  await expect(page.locator('[data-testid^="divide-preview-"]')).toHaveText('10, 10, 21 LEDs');

  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  expect(await rowCounts(page)).toEqual([10, 10, 21]);
  await expect(page.locator('.la-gpio-group')).toHaveCount(1);
});


test('Divide disclosure opens by keyboard and collapses after selection changes and successful divide', async ({ page }) => {
  await gotoFreshLayout(page);
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  const toggle = page.locator('[data-testid^="divide-toggle-"]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-testid^="divide-sections-"]')).toBeHidden();
  await expect(page.locator('.lw-sel-head')).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const regionId = await toggle.getAttribute('aria-controls');
  await expect(page.locator(`[id="${regionId}"]`)).toBeVisible();
  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  await page.locator('[data-testid^="divide-count-"][data-testid$="-1"]').fill('10');
  const preview = await page.locator('[data-testid^="divide-preview-"]').innerText();
  await page.locator('[data-testid^="divide-sections-"]').press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('[data-testid^="divide-preview-"]')).toHaveText(preview);
  await page.getByRole('button', { name: 'Duplicate strip', exact: true }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(2);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.locator('.la-strip-row .layer-name').first().click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(4);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-testid^="divide-sections-"]')).toBeHidden();
  await page.screenshot({ path: 'test-results/layout-divide-collapsed.png' });
});
