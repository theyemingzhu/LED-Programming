import { test, expect } from '@playwright/test';

// The strip schedule and the build sheet read every figure out of the compiled
// wire order. Nothing here asserts how they look — only that the numbers on
// them are the project's real ones, because the first build of these panels
// rendered every strip as "undefined" with no pitch and still looked fine.

async function freshLayout(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function addLine(page: any) {
  const add = page.getByRole('button', { name: /add strip/i });
  if (await add.count()) {
    await add.first().click();
    await page.waitForTimeout(300);
  }
  const create = page.getByRole('button', { name: /create line/i });
  await expect(create.first()).toBeVisible();
  await create.first().click();
}

test('the schedule and sheet report the project the wire order actually describes', async ({ page }) => {
  await freshLayout(page);

  // Nothing drawn: an empty schedule would read as a design with no strips.
  await expect(page.getByTestId('strip-schedule')).toHaveCount(0);
  await expect(page.getByTestId('build-sheet')).toHaveCount(0);

  await addLine(page);
  await page.getByTestId('layout-specs-trigger').click();
  await expect(page.getByTestId('build-sheet')).toBeVisible();
  await page.getByTestId('build-sheet').locator('summary').click();
  await expect(page.getByTestId('strip-schedule')).toBeVisible();

  const rows = page.locator('[data-testid="strip-schedule"] tbody tr');
  await expect(rows).toHaveCount(1);

  // The name comes from the strip the run points at, through source.stripId.
  // Reading a flat run.stripId found nothing and printed the string
  // "undefined" into every row, which is why this is asserted at all.
  const first = rows.first();
  await expect(first).not.toContainText('undefined');
  await expect(first).toContainText('Line');

  // 44 LEDs addressed 1-44, and a pitch, because the strip has a drawn length.
  await expect(first.locator('td').nth(2)).toHaveText('44');
  await expect(first.locator('td').nth(3)).toHaveText('1–44');
  await expect(first.locator('td').nth(4)).not.toHaveText('—');

  // 44 lights at the default 12mA each is 0.53A, whatever supply is attached.
  await expect(page.getByTestId('sheet-total')).toContainText('44 LEDs');
  await expect(page.getByTestId('sheet-draw')).toContainText('0.53 A');

  // No supply has been declared, so the draw stands and the verdict does not.
  const supply = page.getByTestId('sheet-supply');
  await expect(supply).toHaveText('Add your supply rating in Wiring & hardware → Hardware & power to estimate spare capacity.');
  await expect(supply).not.toContainText(/\d[\d.]* A spare/i);
});

test('a second strip takes the addresses that follow the first', async ({ page }) => {
  await freshLayout(page);
  await addLine(page);

  const duplicate = page.getByRole('button', { name: /^(copy|duplicate)/i });
  await expect(duplicate.first()).toBeVisible();
  await duplicate.first().click();

  await page.getByTestId('layout-specs-trigger').click();
  await expect(page.getByTestId('build-sheet')).toBeVisible();
  await page.getByTestId('build-sheet').locator('summary').click();
  await expect(page.getByTestId('strip-schedule')).toBeVisible();

  const rows = page.locator('[data-testid="strip-schedule"] tbody tr');
  await expect(rows).toHaveCount(2);

  // The second strip continues the run rather than restarting at 1 — the whole
  // point of listing them in wire order.
  await expect(rows.nth(0).locator('td').nth(3)).toHaveText('1–44');
  await expect(rows.nth(1).locator('td').nth(3)).toHaveText('45–88');

  await expect(page.getByTestId('sheet-total')).toContainText('88 LEDs');
  await expect(page.getByTestId('sheet-draw')).toContainText('1.06 A');
  await expect(page.getByTestId('build-sheet')).toContainText(/continuous run/i);
});

test('the schedule fits its column on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await freshLayout(page);
  await addLine(page);
  await page.getByTestId('layout-specs-trigger').click();
  await expect(page.getByTestId('build-sheet')).toBeVisible();
  await page.getByTestId('build-sheet').locator('summary').click();
  await expect(page.getByTestId('strip-schedule')).toBeVisible();

  const overflow = await page.evaluate(() => {
    const table = document.querySelector('.lwbs-table') as HTMLElement | null;
    return {
      table: table ? table.scrollWidth - table.clientWidth : -1,
      page: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  // Five columns of nowrap mono in a ~283px column is the tight case; a table
  // that overflows here pushes the whole page sideways.
  expect(overflow.table).toBeLessThanOrEqual(0);
  expect(overflow.page).toBeLessThanOrEqual(0);
});


test('wiring and build references start collapsed while power warnings stay visible', async ({ page }) => {
  await freshLayout(page);
  await addLine(page);
  const specsButton = page.getByRole('button', { name: 'Specs' });
  await expect(specsButton).toBeVisible();
  await expect(page.getByTestId('layout-specs-panel')).toBeHidden();
  await expect(page.getByTestId('wire-plan')).toHaveCount(0);
  await specsButton.click();
  await expect(specsButton).toHaveAttribute('aria-expanded', 'true');
  await expect(specsButton).toHaveAttribute('aria-controls', 'layout-specs-panel');
  await expect(page.getByTestId('layout-specs-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to inspector' })).toBeVisible();
  const tools = page.getByTestId('advanced-installation-tools');
  const build = page.getByTestId('build-sheet');
  await expect(tools.locator(':scope > summary')).toHaveText('Wiring & hardware');
  await expect(tools).not.toHaveAttribute('open', '');
  await expect(build.locator(':scope > summary')).toContainText('Build summary');
  await expect(build).not.toHaveAttribute('open', '');
  await expect(page.getByTestId('project-led-chipset')).not.toBeVisible();
  await expect(page.getByTestId('sheet-total')).not.toBeVisible();

  await tools.locator(':scope > summary').click();
  await expect(page.getByTestId('project-led-chipset')).toBeVisible();
  await expect(tools.locator('.lww-custom-mapping')).not.toHaveAttribute('open', '');
  await expect(tools.locator('.lww-custom-mapping > summary')).toHaveText('Advanced mapping');
  const hardware = page.getByTestId('wire-power-section');
  await expect(hardware.locator('summary')).toHaveText('Hardware & power');
  await expect(hardware).not.toHaveAttribute('open', '');
  await hardware.locator('summary').click();
  await page.getByRole('spinbutton', { name: 'Power supply amps', exact: true }).fill('0.5');
  await tools.locator(':scope > summary').click();
  await expect(page.locator('.lww-power-warning')).toBeVisible();
  await expect(page.locator('.lww-power-warning')).toContainText('your supply is 0.5 A');
  await build.locator(':scope > summary').click();
  await expect(page.getByTestId('sheet-total')).toBeVisible();
  await expect(page.getByTestId('strip-schedule').locator('tbody tr')).toBeVisible();

  await page.getByRole('button', { name: 'Back to inspector' }).click();
  await expect(page.getByTestId('layout-specs-panel')).toBeHidden();
  await expect(specsButton).toBeFocused();
  await expect(page.locator('.la-strip-row').first()).toBeVisible();

  await specsButton.click();
  await page.getByRole('button', { name: 'Back to inspector' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('layout-specs-panel')).toBeHidden();
  await expect(specsButton).toBeFocused();
});
