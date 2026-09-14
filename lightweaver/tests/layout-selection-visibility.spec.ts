import { test, expect } from '@playwright/test';

async function createTwoLineStrips(page: any) {
  await page.goto('/#screen=layout');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await page.getByTestId('layout-add-strip').click();
  await page.getByTestId('layout-add-strip-chooser').getByRole('button', { name: 'Line', exact: true }).click();
  await page.locator('.la-strip-row').first().click();
}

async function screenSize(locator: any, property: string) {
  return locator.evaluate((node: SVGGraphicsElement, property: string) => {
    const ctm = node.getScreenCTM()!;
    return parseFloat(getComputedStyle(node).getPropertyValue(property)) * Math.hypot(ctm.a, ctm.b);
  }, property);
}

test('selected identity stays compact and non-blocking at fit and zoomed out', async ({ page }) => {
  await createTwoLineStrips(page);
  const hit = page.locator('[data-strip-path]').first();
  const id = await hit.getAttribute('data-strip-path');
  const halo = page.getByTestId('selected-strip-halo');
  const core = page.getByTestId('selected-strip-core');
  const label = page.getByTestId(`strip-callout-${id}`);
  await expect(label).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('selected-strip-badge')).toHaveCount(0);
  await expect(halo).toHaveAttribute('d', (await hit.getAttribute('d'))!);
  await expect(halo).toHaveAttribute('stroke', (await page.locator(`[data-strip-identity="${id}"]`).getAttribute('stroke'))!);
  for (const overlay of [halo, core, label]) await expect(overlay).toHaveCSS('pointer-events', 'none');
  await expect(hit).toHaveCSS('cursor', 'grab');
  for (const zoomedOut of [false, true]) {
    if (zoomedOut) for (let i = 0; i < 8; i++) await page.getByTitle('Zoom out (-)').click();
    expect(await screenSize(halo, 'stroke-width')).toBeCloseTo(4.5, 1);
    expect(await screenSize(core, 'stroke-width')).toBeCloseTo(2.25, 1);
    expect(await screenSize(label.locator('text').first(), 'font-size')).toBeCloseTo(11, 1);
  }
  await page.getByRole('button', { name: 'Fit all', exact: true }).click();
  const box = await hit.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect(hit).toHaveCSS('cursor', 'grabbing');
  await expect(label).toHaveCount(0);
  await page.mouse.up();
  await expect(label).toBeVisible();
});

test('a long custom strip name has one bounded label with its full accessible identity', async ({ page }) => {
  await createTwoLineStrips(page);
  const firstRow = page.locator('.la-strip-row').first();
  const id = await page.locator('[data-strip-path]').first().getAttribute('data-strip-path');
  const name = 'Atrium north wall illuminated contour installation segment alpha';
  await firstRow.locator('.layer-name').dblclick();
  await firstRow.locator('input').first().fill(name);
  await firstRow.locator('input').first().press('Enter');
  const label = page.getByTestId(`strip-callout-${id}`);
  await expect(label).toHaveAttribute('aria-label', new RegExp(name));
  await expect(label.locator('text').first()).toContainText('…');
  const box = await label.locator('rect').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(150);
  await expect(page.locator('.lw-strip-callout line')).toHaveCount(0);
});

async function zoomToTerminal(page: any, controlTitle: string) {
  const svg = page.locator('.lw-viewport svg');
  const zoomControl = page.getByTitle(controlTitle);
  for (let index = 0; index < 80; index += 1) {
    const previousViewBox = await svg.getAttribute('viewBox');
    await zoomControl.click();
    try {
      await expect.poll(() => svg.getAttribute('viewBox'), {
        timeout: 1000,
        intervals: [50, 100, 200],
      }).not.toBe(previousViewBox);
    } catch {
      // A clamp is terminal only after the post-click value is confirmed
      // unchanged, rather than treating a render race as the minimum zoom.
      await expect.poll(() => svg.getAttribute('viewBox'), {
        timeout: 500,
        intervals: [50, 100, 200],
      }).toBe(previousViewBox);
      return previousViewBox;
    }
  }
  const lastViewBox = await svg.getAttribute('viewBox');
  const zoomPercentage = await page.getByTestId('layout-zoom-percentage').textContent();
  throw new Error(`${controlTitle} did not reach its terminal clamp within 80 clicks (zoom ${zoomPercentage}, viewBox ${lastViewBox}).`);
}

async function fitSelectionView(page: any) {
  const svg = page.locator('.lw-viewport svg');
  const fitAll = page.getByRole('button', { name: 'Fit all' });
  for (let index = 0; index < 10; index += 1) {
    const previousViewBox = await svg.getAttribute('viewBox');
    await fitAll.click();
    try {
      await expect.poll(() => svg.getAttribute('viewBox'), {
        timeout: 1000,
        intervals: [50, 100, 200],
      }).not.toBe(previousViewBox);
    } catch {
      await expect.poll(() => svg.getAttribute('viewBox')).toBe(previousViewBox);
      return previousViewBox;
    }
  }
  return svg.getAttribute('viewBox');
}


test('selected annotation and selection strokes remain screen-sized at both numerical zoom limits', async ({ page }) => {
  test.setTimeout(60_000);
  await createTwoLineStrips(page);
  const label = page.locator('.lw-strip-callout[data-selected="true"]');
  const halo = page.getByTestId('selected-strip-halo');
  const core = page.getByTestId('selected-strip-core');
  const minimum = await zoomToTerminal(page, 'Zoom out (-)');
  expect(Number(minimum?.split(/\s+/)[2])).toBeGreaterThanOrEqual(640 / 1e-6);
  for (const control of [null, 'Zoom in (+)']) {
    if (control) {
      await fitSelectionView(page);
      const maximum = await zoomToTerminal(page, control);
      expect(Number(maximum?.split(/\s+/)[2])).toBeLessThanOrEqual(640 / 1e6 * 1.001);
    }
    await expect(label).toBeVisible();
    expect(await screenSize(halo, 'stroke-width')).toBeCloseTo(4.5, 1);
    expect(await screenSize(core, 'stroke-width')).toBeCloseTo(2.25, 1);
    expect(await screenSize(label.locator('text').first(), 'font-size')).toBeCloseTo(11, 1);
    const box = await label.locator('rect').boundingBox();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.width).toBeLessThanOrEqual(152);
    for (const overlay of [halo, core, label]) await expect(overlay).toHaveCSS('pointer-events', 'none');
  }
});
