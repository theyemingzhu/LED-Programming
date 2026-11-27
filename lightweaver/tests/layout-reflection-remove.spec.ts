import { test, expect } from '@playwright/test';

const savedPoints = (page: any) => page.evaluate(() => {
  const strip = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips?.[0];
  const mapping = strip?.kaleidoscope;
  if (!mapping) return Number.isInteger(strip?.reflectionPointDraft) ? [strip.reflectionPointDraft] : [];
  return mapping.offsets.map((offset: number, index: number) =>
    ((mapping.startLed + Math.round(index * strip.pixelCount / mapping.pointCount) + offset) % strip.pixelCount + strip.pixelCount) % strip.pixelCount);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`selected reflection point removal at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.route(/^http:\/\/(lightweaver\.local|192\.168\.4\.1)(:\d+)?\//, route => route.fulfill({ status: 503, body: '{}' }));
    await page.setViewportSize(viewport);
    await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
    await expect(page.locator('.la-strip-row')).toHaveCount(1);
    await page.getByLabel('More strip actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Duplicate strip', exact: true }).click();
    await expect(page.locator('.la-strip-row')).toHaveCount(2);
    await page.locator('.la-strip-row').first().click();
    await page.getByLabel('More strip actions', { exact: true }).click();
    await page.getByRole('button', { name: 'Edit Kaleidoscope reflection points', exact: true }).click();
    await page.getByRole('button', { name: 'Fine-tune LEDs', exact: true }).click();
    await page.getByRole('button', { name: 'Move reflection point 2 forward one LED', exact: true }).click();
    const values = page.getByRole('list', { name: 'Reflection points', exact: true }).getByRole('button', { name: /Fine-tune reflection point/ });
    const remove = page.getByRole('button', { name: 'Remove point', exact: true });
    await page.getByRole('button', { name: 'Fine-tune LEDs', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Selected reflection point', exact: true }).getByRole('button', { name: 'Remove point', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fine-tune LEDs', exact: true }).click();
    await expect(remove).toHaveCount(1);
    const selected = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Fine-tune reflection point 2', exact: true }) });
    await expect(selected.getByRole('button', { name: 'Remove point', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('selected-point.png') });
    await expect.poll(() => savedPoints(page)).toHaveLength(4);
    const originalPoints = await savedPoints(page);
    await remove.click();
    await expect(values).toHaveCount(3);
    let remaining = originalPoints.filter((_: number, index: number) => index !== 1);
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    await page.getByTitle(/Undo/).click();
    await expect(values).toHaveCount(4);
    await expect.poll(() => savedPoints(page)).toEqual(originalPoints);
    await page.getByTitle(/Redo/).click();
    await expect(values).toHaveCount(3);
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    const reopen = async () => {
      await page.locator('.la-strip-row').first().click();
      await page.getByLabel('More strip actions', { exact: true }).click();
      await page.getByRole('button', { name: 'Edit Kaleidoscope reflection points', exact: true }).click();
      await page.getByRole('button', { name: 'Fine-tune LEDs', exact: true }).click();
    };
    await reopen();
    await expect(values).toHaveCount(3);
    await remove.click(); // selected point 1 after reopening
    remaining = remaining.slice(1);
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    await remove.click(); // 2 → 1 keeps the untouched final point
    remaining = remaining.slice(1);
    await expect(values).toHaveCount(1);
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    await expect(page.getByText('Two points are needed for reflection. Add a point or remove the remaining point to use symmetry.', { exact: true })).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reopen();
    await expect(values).toHaveCount(1);
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    await page.screenshot({ path: testInfo.outputPath('one-point-after-reload.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // At phone fit-to-piece zoom the neighboring LED hit areas overlap. Zoom in to pick one light.
    if (viewport.width < 600) for (let step = 0; step < 8; step++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Pick starting reflection point on canvas', exact: true }).click();
    await page.getByTestId('strip-led-strip-1-22').click();
    await expect.poll(() => savedPoints(page)).toEqual([22]);
    await page.getByTitle(/Undo/).click();
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    await page.getByRole('button', { name: 'Increase reflection point count', exact: true }).click();
    await expect(values).toHaveCount(2);
    await expect.poll(async () => (await savedPoints(page))[0]).toBe(remaining[0]);
    await page.getByTitle(/Undo/).click();
    await expect(values).toHaveCount(1);
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    await remove.click();
    await expect.poll(() => savedPoints(page)).toEqual([]);
    await expect(page.getByRole('list', { name: 'Reflection points', exact: true })).toHaveCount(0);
    await page.getByTitle(/Undo/).click();
    await expect.poll(() => savedPoints(page)).toEqual(remaining);
    await expect(values).toHaveCount(1);
    await expect(page.getByTestId('kaleidoscope-marker')).toHaveCount(1);
    await page.getByTitle(/Redo/).click();
    await expect.poll(() => savedPoints(page)).toEqual([]);
    await page.getByTestId('layout-symmetry-2').click();
    await expect(page.getByTestId('layout-symmetry-2')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.symmetry?.sides?.flatMap((side: any) => side.stripIds))).toEqual(['strip-1', 'strip-2']);
  });
}
