import { test, expect } from '@playwright/test';

// Controls retain accessible names and contextual help without a permanent prose row.

async function oneStrip(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
}

test('strip controls expose help without a permanent caption row', async ({ page }) => {
  await oneStrip(page);
  await expect(page.locator('.la-strip-caption')).toHaveCount(0);
  await page.getByLabel('More strip actions', { exact: true }).click();
  for (const name of ['Flip path direction', 'Duplicate strip', 'Remove strip']) {
    const button = page.getByRole('button', { name, exact: true }).first();
    await expect(button).toHaveAttribute('title', /.+/);
    await button.hover();
    await expect(page.locator('.la-strip-caption')).toHaveCount(0);
  }
  const duplicate = page.getByRole('button', { name: 'Duplicate strip' }).first();
  await duplicate.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  await duplicate.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
  await expect(page.locator('.la-strip-caption')).toHaveCount(0);
});

test('reverse data direction remains explicit without a prose caption', async ({ page }) => {
  await oneStrip(page);
  const reverse = page.getByRole('button', { name: /Reverse data direction/ }).first();
  await expect(reverse).toHaveAttribute('aria-pressed', 'false');
  await reverse.click();
  await expect(reverse).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.layout?.wiring?.runs?.find((run: any) => run.type === 'strip')?.physicalDirection;
  })).toBe('source-reverse');
});

test('hide sits on the strip row and does not close the open strip', async ({ page }) => {
  await oneStrip(page);
  await expect(page.locator('.la-strip-detail')).toHaveCount(1);

  const eye = page.locator('.la-strip-row .la-strip-row-eye').first();
  await expect(eye).toHaveAttribute('aria-label', 'Hide Line');
  await eye.click();

  await expect(eye).toHaveAttribute('aria-label', 'Show Line');
  await expect(page.locator('.la-strip-detail')).toHaveCount(1);
});

test('split joins duplicate and remove — the row with width to spare', async ({ page }) => {
  await oneStrip(page);
  await expect(page.getByLabel('Strip actions').locator('[data-testid^="split-strip-"]')).toHaveCount(1);
  // The count row had 10px spare and the button needs 36 — putting it there
  // pushed the size control past the panel edge.
  await expect(page.locator('.la-strip-physical-row [data-testid^="split-strip-"]')).toHaveCount(0);
});

// Every control added to this panel competes for one fixed width. This is the
// assertion that catches the next one that does not fit.
for (const width of [1280, 430]) {
  test(`the open strip panel fits its width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await oneStrip(page);
    const overflowing = await page.evaluate(() => {
      const detail = document.querySelector('.la-strip-detail');
      const row = document.querySelector('.la-strip-row');
      return [...(detail ? detail.querySelectorAll('.actions, .row') : []), row, detail]
        .filter(Boolean)
        .map(el => ({ c: (el as HTMLElement).className, over: el!.scrollWidth - el!.clientWidth }))
        .filter(entry => entry.over > 1);
    });
    expect(overflowing).toEqual([]);
  });
}
