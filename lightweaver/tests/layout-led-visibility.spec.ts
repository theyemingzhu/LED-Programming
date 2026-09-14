import { test, expect } from '@playwright/test';

async function screenRadius(locator: any) {
  return locator.evaluate((node: SVGCircleElement) => {
    const ctm = node.getScreenCTM()!;
    return Number(node.getAttribute('r')) * Math.hypot(ctm.a, ctm.b);
  });
}

test('resting divided strips keep legible LEDs and a subdued selection ribbon at Fit all', async ({ page }) => {
  await page.goto('/#screen=layout');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Create line', exact: true }).click();

  const count = page.locator('.la-strip-detail input[type="number"]').first();
  await count.fill('41');
  await count.blur();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('4');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await page.getByRole('button', { name: 'Fit all', exact: true }).click();

  const rails = page.locator('[data-strip-identity]');
  await expect(rails).toHaveCount(4);
  expect(new Set(await rails.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).stroke))).size).toBe(4);

  const stripIds = await rails.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-strip-identity')));
  const selectedDot = page.getByTestId(`strip-led-${stripIds[0]}-0`).locator('circle').first();
  const restingDot = page.getByTestId(`strip-led-${stripIds[1]}-0`).locator('circle').first();
  const expectLegibleDots = async () => {
    expect(await screenRadius(selectedDot)).toBeCloseTo(4.6, 1);
    expect(await screenRadius(restingDot)).toBeCloseTo(3.5, 1);
  };
  await expectLegibleDots();
  await expect(selectedDot).not.toHaveAttribute('stroke', 'none');
  await expect(restingDot).not.toHaveAttribute('stroke', 'none');
  expect(await selectedDot.evaluate(node => getComputedStyle(node.parentElement!).filter)).toBe('none');

  const zoom = page.getByTestId('layout-zoom-percentage');
  for (let index = 0; index < 20 && Number((await zoom.textContent())?.replace('%', '')) > 17; index += 1) {
    await page.getByTitle('Zoom out (-)').click();
  }
  expect(Number((await zoom.textContent())?.replace('%', ''))).toBeLessThanOrEqual(17);
  await expectLegibleDots();

  const halo = page.getByTestId('selected-strip-halo');
  await expect(halo).toHaveAttribute('stroke', 'oklch(64% 0.025 235)');
  await expect(halo).not.toHaveAttribute('stroke', await rails.first().getAttribute('stroke') || '');
});
