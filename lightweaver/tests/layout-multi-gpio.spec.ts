import { test, expect } from '@playwright/test';

async function threeSections(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  const total = Number(await page.getByTestId('layout-total-led-count').inputValue());
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  const counts = await page.locator('[data-testid^="divide-count-"]')
    .evaluateAll((inputs: HTMLInputElement[]) => inputs.map(input => Number(input.value)));
  expect(counts.reduce((sum: number, count: number) => sum + count, 0)).toBe(total);
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  const ids = await page.locator('.la-strip-item').evaluateAll((items: HTMLElement[]) => items.map(item => item.dataset.stripId!));
  return { total, counts, ids };
}

async function expectSelectedPart(page: any, id: string) {
  const editor = page.getByTestId('connected-section-editor');
  await expect(editor).toHaveCount(1);
  await expect(editor.getByTestId('connected-child')).toHaveAttribute('data-section-id', id);
  await expect(editor.getByRole('combobox', { name: / GPIO override$/ })).toHaveCount(1);
  await expect(page.getByTestId(`strip-callout-${id}`)).toHaveAttribute('data-selected', 'true');
  return editor;
}

async function selectPart(page: any, id: string) {
  // GPIO groups reorder the list. Follow the persistent section ID, not an
  // index that may now identify another section after an output assignment.
  await page.locator(`.la-strip-item[data-strip-id="${id}"] .layer-name`).click();
  return expectSelectedPart(page, id);
}

async function assignPart(page: any, id: string, pin: number, count: number) {
  const editor = await selectPart(page, id);
  await editor.getByRole('combobox', { name: / GPIO override$/ }).selectOption(String(pin));
  await expectSelectedPart(page, id);
  await expect(editor.getByRole('combobox', { name: / GPIO override$/ })).toHaveValue(String(pin));
  await expect(editor.getByRole('spinbutton', { name: / LED count$/ })).toHaveValue(String(count));
}

async function expectAssignments(page: any, sections: any, pins: number[]) {
  await expect(page.getByTestId('layout-total-led-count')).toHaveValue(String(sections.total));
  for (const [index, pin] of pins.entries()) {
    const id = sections.ids[index];
    await expect(page.getByTestId(`gpio-group-${pin}`).locator(`.la-strip-item[data-strip-id="${id}"] .la-strip-row`)).toHaveCount(1);
    const editor = await selectPart(page, id);
    await expect(editor.getByRole('combobox', { name: / GPIO override$/ })).toHaveValue(String(pin));
    await expect(editor.getByRole('spinbutton', { name: / LED count$/ })).toHaveValue(String(sections.counts[index]));
  }
}

test('three divided sections retain selection and counts when assigned to three GPIO outputs', async ({ page }, testInfo) => {
  const sections = await threeSections(page);
  await assignPart(page, sections.ids[1], 17, sections.counts[1]);
  await assignPart(page, sections.ids[2], 18, sections.counts[2]);
  await expect(page.getByTestId('gpio-group-16').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-17').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-18').locator('.la-strip-row')).toHaveCount(1);
  await expectAssignments(page, sections, [16, 17, 18]);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const gpio = page.getByTestId('connected-section-editor').getByRole('combobox', { name: / GPIO override$/ });
    await gpio.scrollIntoViewIfNeeded();
    await expect(gpio).toBeVisible();
    await expect(gpio).toHaveValue('18');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`multi-gpio-${width}.png`), fullPage: true });
  }

  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[16, 1], [17, 1], [18, 1]]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-gpio-group')).toHaveCount(3);
  await expectAssignments(page, sections, [16, 17, 18]);
});

test('moving the parent GPIO frees its previous port before assigning more sections', async ({ page }) => {
  const sections = await threeSections(page);
  const selectedId = await page.getByTestId('connected-child').getAttribute('data-section-id');
  await page.getByRole('combobox', { name: / shared GPIO output$/ }).selectOption('17');
  await expectSelectedPart(page, selectedId!);
  await expect(page.getByTestId('gpio-group-16')).toHaveCount(0);
  await assignPart(page, sections.ids[1], 18, sections.counts[1]);
  await assignPart(page, sections.ids[2], 21, sections.counts[2]);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[17, 1], [18, 1], [21, 1]]);
  await expectAssignments(page, sections, [17, 18, 21]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('gpio-group-16')).toHaveCount(0);
  await expectAssignments(page, sections, [17, 18, 21]);
});

test('a physical cut run can be routed to another GPIO in Advanced mapping', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await page.getByTestId('layout-specs-trigger').click();
  const advanced = page.getByTestId('advanced-installation-tools');
  await advanced.locator(':scope > summary').click();
  await advanced.locator('.lww-custom-mapping > summary').click();
  await page.getByRole('button', { name: 'Split a strip mid-wire' }).click();

  const position = await page.locator('path[data-strip-path]').first().evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.45);
    const matrix = path.getScreenCTM()!;
    return { x: point.x * matrix.a + point.y * matrix.c + matrix.e,
      y: point.x * matrix.b + point.y * matrix.d + matrix.f };
  });
  await page.mouse.click(position.x, position.y);
  const run = page.getByLabel('Physical run');
  await expect(run.locator('option')).toHaveCount(2);
  await run.selectOption({ index: 1 });
  await page.getByLabel('GPIO for selected run').selectOption('17');
  await expect(page.getByLabel('GPIO for selected run')).toHaveValue('17');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[16, 1], [17, 1]]);
  await page.getByLabel('GPIO for selected run').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/lw-sprint-gpio.png', fullPage: true });
});
