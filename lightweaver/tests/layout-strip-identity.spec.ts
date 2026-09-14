import { test, expect } from '@playwright/test';

async function revealDivideControls(page: any) {
  const toggle = page.locator('[data-testid^="divide-toggle-"]').first();
  if (await toggle.count()) await toggle.click();
}

test('41 LEDs divide into four individually colored, numbered strips with compact labels', async ({ page }) => {
  await page.goto('/#screen=layout');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Create line', exact: true }).click();
  const count = page.locator('.la-strip-detail input[type="number"]').first();
  await count.fill('41');
  await count.blur();
  await revealDivideControls(page);
  await page.locator('[data-testid^="divide-sections-"]').selectOption('4');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row .layer-name')).toHaveText(['Strip 1', 'Strip 2', 'Strip 3', 'Strip 4']);
  await expect(page.locator('.la-batch')).toHaveCount(0);
  await expect(page.locator('.la-strip-row.sel')).toHaveCount(1);
  await expect(page.locator('.la-strip-row').first()).toHaveClass(/\bsel\b/);
  await expect(page.locator('.la-strip-detail input[type="number"]').first()).toBeEditable();
  const rails = page.locator('[data-strip-identity]');
  await expect(rails).toHaveCount(4);
  expect(new Set(await rails.evaluateAll(nodes => nodes.map(n => n.getAttribute('stroke')))).size).toBe(4);
  await expect(page.locator('[data-testid="selected-strip-badge"]')).toHaveCount(0);
  await expect(page.locator('.lw-strip-callout line')).toHaveCount(0);
  for (const zoomedOut of [false, true]) {
    if (zoomedOut) for (let i = 0; i < 8; i++) await page.getByRole('button', { name: /zoom out/i }).first().click();
    const boxes = await page.locator('.lw-strip-callout rect').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    expect(boxes).toHaveLength(4);
    for (const [i, a] of boxes.entries()) {
      expect(a.width).toBeLessThanOrEqual(152);
      expect(a.height).toBeLessThanOrEqual(34);
      for (const b of boxes.slice(i + 1)) expect(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1).toBe(true);
    }
  }
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips?.map((s: any) => s.pixelCount))).toEqual([11, 10, 10, 10]);
  await page.screenshot({ path: '/tmp/lightweaver-strip-identity.png' });
});

for (const sourceName of ['Untitled Project', 'North arch']) {
  test(`dividing saved ${sourceName} preserves identifiers, count and custom naming`, async ({ page }) => {
    await page.goto('/#screen=layout');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Create line', exact: true }).click();
    const row = page.locator('.la-strip-row').first();
    await row.locator('.layer-name').dblclick();
    await row.locator('input').first().fill(sourceName);
    await row.locator('input').first().press('Enter');
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips || []);
    await expect.poll(async () => (await saved())[0]?.name).toBe(sourceName);
    const original = (await saved())[0];
    // Card reconstruction uses a shorter numeric spelling of palette amber.
    await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
      project.layout.strips[0].color = 'oklch(80% 0.13 72)';
      localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    });
    await page.reload();
    await page.locator('.la-strip-row').first().click();
    await revealDivideControls(page);
    await page.locator('[data-testid^="divide-sections-"]').selectOption('4');
    await page.locator('[data-testid^="divide-commit-"]').click();
    const expected = Array.from({ length: 4 }, (_, i) => `${sourceName === 'Untitled Project' ? 'Strip' : sourceName} ${i + 1}`);
    await expect(page.locator('.la-strip-row .layer-name')).toHaveText(expected);
    await expect.poll(async () => (await saved()).length).toBe(4);
    const divided = await saved();
    expect(divided[0].id).toBe(original.id);
    expect(new Set(divided.map((s: any) => s.id)).size).toBe(4);
    expect(divided.reduce((n: number, s: any) => n + s.pixelCount, 0)).toBe(original.pixelCount);
    expect(Math.hypot(divided[0].pixels[0].x - original.pixels[0].x, divided[0].pixels[0].y - original.pixels[0].y)).toBeLessThan(0.01);
    const renderedColors = await page.locator('[data-strip-identity]').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).stroke));
    expect(new Set(renderedColors).size).toBe(4);
    await page.getByTitle(/^Undo /).click();
    await expect(page.locator('.la-strip-row .layer-name')).toHaveText([sourceName]);
    await expect.poll(async () => (await saved()).length).toBe(1);
    expect((await saved())[0].id).toBe(original.id);
  });
}
