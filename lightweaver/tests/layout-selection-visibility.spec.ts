import { test, expect, type Page } from '@playwright/test';

async function createTwoLineStrips(page: any) {
  await page.goto('/#screen=layout');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await page.getByTestId('layout-add-strip').click();
  await page.getByTestId('layout-add-strip-chooser').getByRole('button', { name: 'Line', exact: true }).click();
  await page.locator('.la-strip-row').first().click({ position: { x: 8, y: 8 } });
}

async function screenSize(locator: any, property: string) {
  return locator.evaluate((node: SVGGraphicsElement, property: string) => {
    const ctm = node.getScreenCTM()!;
    return parseFloat(getComputedStyle(node).getPropertyValue(property)) * Math.hypot(ctm.a, ctm.b);
  }, property);
}

test('selected identity stays compact and its overlays leave the strip grabbable at fit and zoomed out', async ({ page }) => {
  await createTwoLineStrips(page);
  const id = await page.locator('.la-strip-item').first().getAttribute('data-strip-id');
  const hit = page.locator(`[data-strip-path="${id}"]`);
  const halo = page.getByTestId('selected-strip-halo');
  const core = page.getByTestId('selected-strip-core');
  const label = page.getByTestId(`strip-callout-${id}`);
  await expect(label).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('selected-strip-badge')).toHaveCount(0);
  await expect(halo).toHaveAttribute('d', (await hit.getAttribute('d'))!);
  await expect(halo).toHaveAttribute('stroke', 'oklch(64% 0.025 235)');
  for (const overlay of [halo, core]) await expect(overlay).toHaveCSS('pointer-events', 'none');
  await expect(label).toHaveCSS('pointer-events', 'all');
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
  await expect(label).toBeVisible();
  await page.mouse.up();
  await expect(label).toBeVisible();
});

const longStripName = 'Atrium north wall illuminated contour installation segment alpha';

async function nameSelectedStrip(page: Page, name: string) {
  const firstRow = page.locator('.la-strip-row').first();
  await firstRow.locator('.layer-name').dblclick();
  const nameInput = firstRow.locator('input').first();
  await nameInput.fill(name);
  await nameInput.press('Enter');
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`a long custom strip name has one bounded label with its full accessible identity on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await createTwoLineStrips(page);
    const id = await page.locator('.la-strip-item').first().getAttribute('data-strip-id');
    await nameSelectedStrip(page, longStripName);
    const label = page.getByTestId(`strip-callout-${id}`);
    const chip = label.getByTestId(`strip-chip-${id}`);
    await expect(chip).toHaveCount(1);
    await expect(chip).toBeInViewport();
    await expect(label).toHaveAttribute('aria-label', `${longStripName} · 44 LEDs`);
    await expect(label.locator('title')).toHaveText(`${longStripName} · 44 LEDs`);
    await expect(chip.locator('text')).toContainText('…');
    const box = await chip.locator('rect').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(150);
    await expect(page.locator('.lw-strip-callout line')).toHaveCount(0);
    await expect(page.locator('.lw-strip-callout:not([data-selected]) .lw-strip-chip')).toHaveCount(0);
    await expect(chip).toHaveCSS('pointer-events', 'none');
    if (viewport.name === 'desktop') {
      const svg = page.locator('.lw-viewport svg');
      const viewBox = await svg.getAttribute('viewBox');
      const canvas = (await svg.boundingBox())!;
      const startX = canvas.x + 30;
      const startY = canvas.y + 50;
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(startX, startY);
      await page.keyboard.down('Space');
      await page.mouse.down();
      await page.mouse.move(startX + 100, startY, { steps: 5 });
      await page.mouse.up();
      await page.keyboard.up('Space');
      await expect(svg).not.toHaveAttribute('viewBox', viewBox!);
      await page.locator('.la-strip-row .layer-name').first().click();
      await expect(svg).not.toHaveAttribute('viewBox', viewBox!);
      await expect(label).toHaveAttribute('data-selected', 'true');
      await expect(chip).toBeInViewport();
    }
  });
}

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
  const chip = label.locator('rect');
  const originalName = (await page.locator('.la-strip-row .layer-name').first().innerText()).trim();
  const paintedWidth = async () => await screenSize(chip, 'width') + await screenSize(chip, 'stroke-width');
  const compactFitWidth = await paintedWidth();
  expect(compactFitWidth).toBeLessThan(100);
  await nameSelectedStrip(page, longStripName);
  const fitWidth = await paintedWidth();
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
    expect(await paintedWidth()).toBeCloseTo(fitWidth, 1);
    await nameSelectedStrip(page, originalName);
    expect(await paintedWidth()).toBeCloseTo(compactFitWidth, 1);
    await nameSelectedStrip(page, longStripName);
    for (const overlay of [halo, core]) await expect(overlay).toHaveCSS('pointer-events', 'none');
    await expect(label).toHaveCSS('pointer-events', 'all');
  }
});
