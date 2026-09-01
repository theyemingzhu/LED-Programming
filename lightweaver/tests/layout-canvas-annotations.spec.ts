import { test, expect } from '@playwright/test';

// The canvas carries two kinds of mark, and they behave in opposite ways.
//
// LEDs and strips are things IN the drawing: they scale with the zoom, because
// zooming in is meant to show you the piece bigger.
//
// Callouts are things ABOUT the drawing. They must hold their size on screen,
// or they swallow the piece the moment you zoom — which is exactly what the
// first build of them did at 350%, sized off the artwork's scale rather than
// the camera's.

async function freshLayout(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function addLine(page: any) {
  const add = page.getByRole('button', { name: /add strip/i });
  if (await add.count()) {
    await add.first().click();
    await page.waitForTimeout(250);
  }
  const create = page.getByRole('button', { name: /create line/i });
  await expect(create.first()).toBeVisible();
  await create.first().click();
}

const screenFontPx = (locator: any) => locator.evaluate((node: SVGGraphicsElement) => {
  const ctm = node.getScreenCTM();
  if (!ctm) throw new Error('no screen transform');
  return parseFloat(getComputedStyle(node).fontSize) * Math.hypot(ctm.a, ctm.b);
});

test('a strip callout names the strip with its count and spacing', async ({ page }) => {
  await freshLayout(page);
  await expect(page.locator('.lw-strip-callout')).toHaveCount(0);

  await addLine(page);
  const callout = page.locator('.lw-strip-callout').first();
  await expect(callout).toBeVisible();

  // The name, then the two facts a builder needs off the drawing itself.
  await expect(callout).toContainText('Line');
  await expect(callout).toContainText(/\d+ px/);
  await expect(callout).toContainText(/mm pitch/);
  // A pitch of 0 would be a lie about a strip that has a drawn length.
  await expect(callout).not.toContainText('0.0 mm pitch');
});

test('callout labels hold their size on screen while the drawing zooms', async ({ page }) => {
  await freshLayout(page);
  await addLine(page);

  const label = page.locator('.lw-strip-callout text').first();
  await expect(label).toBeVisible();
  const atFit = await screenFontPx(label);

  const zoomIn = page.getByRole('button', { name: /zoom in/i });
  for (let i = 0; i < 6; i += 1) await zoomIn.first().click();
  await page.waitForTimeout(400);

  const zoomed = await screenFontPx(label);
  // Sized off the artwork instead of the camera this grew several times over.
  expect(Math.abs(zoomed - atFit)).toBeLessThan(1);
});
