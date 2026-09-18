import { test, expect } from '@playwright/test';

// Count-first SVG mapping acceptance:
// - the artwork stays in its authored 1:2:3 proportions,
// - a known physical total apportions exact integer LEDs by path length, and
// - pxPerMm is derived from that real count rather than silently resizing art.
const THREE_ROUTE_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 240">
    <g id="inner" data-name="Inner halo"><path d="M 40 50 H 140" fill="none" stroke="#f66"/></g>
    <g id="middle" data-name="Middle halo"><path d="M 40 120 H 240" fill="none" stroke="#6f6"/></g>
    <g id="outer" data-name="Outer halo"><path d="M 40 190 H 340" fill="none" stroke="#66f"/></g>
  </svg>`;

async function freshImportedRoutes(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.setInputFiles('input[accept=".svg"]', {
    name: 'three-halos.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(THREE_ROUTE_SVG),
  });
  await expect(page.getByText('Artwork layers')).toBeVisible();
  await page.getByTestId('artwork-create-all-strips').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
}

function savedLayout(page: any) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout);
}

function authoredGeometry(page: any) {
  return page.locator('[data-strip-path]').evaluateAll((paths: SVGPathElement[]) => paths.map(path => {
    const box = path.getBBox();
    return { id: path.dataset.stripPath, width: Math.round(box.width * 1000) / 1000, d: path.getAttribute('d') };
  }));
}

test('count-first imported layers allocate an exact total, retain geometry, and calibrate scale', async ({ page }) => {
  await freshImportedRoutes(page);

  // Each imported route is an independently selectable output assignment.
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  const stripIds = await page.locator('[data-strip-id]').evaluateAll((rows: HTMLElement[]) => rows.map(row => row.dataset.stripId));
  for (const [index, gpio] of [16, 17, 18].entries()) {
    const strip = page.locator(`[data-strip-id="${stripIds[index]}"]`);
    await strip.locator('.la-strip-row').click();
    await strip.getByLabel('GPIO output').selectOption(String(gpio));
  }
  await expect(page.getByTestId('gpio-group-16').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-17').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-18').locator('.la-strip-row')).toHaveCount(1);

  const beforeGeometry = await authoredGeometry(page);
  expect(beforeGeometry.map(item => item.width)).toEqual([100, 200, 300]);

  // The implementation exposes the group plan with one real total field,
  // rather than making a maker reverse-engineer three unrelated strip counts.
  const total = page.getByTestId('layout-total-led-count');
  await expect(total).toBeVisible();
  await expect(total).toHaveAccessibleName('Total LEDs');
  await total.fill('61');
  await total.press('Enter');

  // 61 apportioned over exactly 100:200:300 goes 10,20,31. The last LED is
  // the largest remainder, so the requested physical total is never lost.
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '31 LEDs']);
  await expect(page.getByTestId('layout-total-led-summary')).toHaveText('61 LEDs total');
  const afterGeometry = await authoredGeometry(page);
  expect(afterGeometry).toEqual(beforeGeometry);

  await expect.poll(async () => {
    const layout = await savedLayout(page);
    return {
      counts: layout?.strips?.map((strip: any) => strip.pixelCount),
      pxPerMm: layout?.pxPerMm,
      outputs: layout?.wiring?.outputs?.map((output: any) => output.pin),
    };
  }).toMatchObject({
    counts: [10, 20, 31],
    // 600 authored units / (61 LEDs / 60 LEDs-per-metre × 1000 mm/m).
    pxPerMm: 600 * 60 / (61 * 1000),
    outputs: [16, 17, 18],
  });
  await page.screenshot({ path: 'test-results/layout-svg-count-first-desktop.png', fullPage: true });
});

test('an imported layer count preserves its peers, updates total and scale, then persists through undo and reload', async ({ page }) => {
  await freshImportedRoutes(page);
  const total = page.getByTestId('layout-total-led-count');
  await total.fill('61');
  await total.press('Enter');
  const beforeGeometry = await authoredGeometry(page);

  // Per-route correction is deliberate: only this route changes; the other
  // physical observations remain intact and the piece-wide scale is recomputed.
  const outer = page.locator('.la-strip-row').nth(2);
  await outer.click();
  await page.getByLabel('Strip LED count', { exact: true }).fill('36');
  await page.getByLabel('Strip LED count', { exact: true }).press('Enter');
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '36 LEDs']);
  await expect(page.getByTestId('layout-total-led-summary')).toHaveText('66 LEDs total');
  expect(await authoredGeometry(page)).toEqual(beforeGeometry);
  await expect.poll(async () => (await savedLayout(page))?.pxPerMm).toBeCloseTo(600 * 60 / (66 * 1000), 9);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/layout-svg-count-first-phone.png', fullPage: true });

  // One imported layer can become independently addressable pattern regions.
  // The connected editor now adds one physical boundary at a time: split once,
  // place the first boundary at 12, then split the remaining 24 LEDs in half.
  await page.getByTestId('connected-add-split').click();
  const editor = page.getByTestId('connected-section-editor');
  await expect(editor.getByTestId('connected-child')).toHaveCount(2);
  const firstSectionName = await page.getByLabel('Section 1 name').inputValue();
  await page.getByLabel(`Exact boundary after ${firstSectionName}`).fill('12');
  await page.getByLabel(`Exact boundary after ${firstSectionName}`).press('Enter');
  await editor.getByTestId('connected-child').nth(1).getByRole('button').first().click();
  await editor.getByRole('button', { name: /Add split inside/ }).click();
  await expect(editor.getByTestId('connected-child')).toHaveCount(3);
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '12 LEDs', '12 LEDs', '12 LEDs']);

  // Converted artwork provenance must survive the split. Tuning a single
  // pattern region must leave the other two regions and the other imported
  // routes intact, then recalibrate the physical drawing scale from all LEDs.
  await page.getByLabel('Section 3 actual LEDs').fill('15');
  await page.getByLabel('Section 3 actual LEDs').press('Enter');
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '12 LEDs', '12 LEDs', '15 LEDs']);
  await expect(page.getByTestId('layout-total-led-summary')).toHaveText('69 LEDs total');
  await expect.poll(async () => (await savedLayout(page))?.pxPerMm).toBeCloseTo(600 * 60 / (69 * 1000), 9);

  // Undo restores the exact pre-split count plan; reload keeps that reversible
  // count-first state and keeps the non-edited imported routes untouched.
  await page.getByTitle(/Undo/).click();
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '12 LEDs', '12 LEDs', '12 LEDs']);
  await page.getByTitle(/Undo/).click();
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '12 LEDs', '24 LEDs']);
  await page.getByTitle(/Undo/).click();
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '18 LEDs', '18 LEDs']);
  await page.getByTitle(/Undo/).click();
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '36 LEDs']);
  await expect.poll(async () => (await savedLayout(page))?.strips?.map((strip: any) => strip.pixelCount))
    .toEqual([10, 20, 36]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(['10 LEDs', '20 LEDs', '36 LEDs']);
  await expect.poll(async () => (await savedLayout(page))?.pxPerMm).toBeCloseTo(600 * 60 / (66 * 1000), 9);
});

test('a total below the number of converted layers is rejected without mutating their mapped counts', async ({ page }) => {
  await freshImportedRoutes(page);
  const total = page.getByTestId('layout-total-led-count');
  const before = await page.locator('.la-strip-row .layer-len').allTextContents();

  await total.fill('2');
  await total.press('Enter');
  await expect(page.getByTestId('layout-total-led-error')).toHaveText(/at least 3 LEDs/i);
  await expect(page.locator('.la-strip-row .layer-len')).toHaveText(before);
});
