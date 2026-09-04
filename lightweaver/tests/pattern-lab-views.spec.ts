import { test, expect } from '@playwright/test';

// Piece and Strip are two arrangements of ONE frame — same pattern, same
// palette, same renderer, different positions. The failure worth guarding is
// not that a button is missing; it is that both buttons quietly show the same
// thing, which is what a second renderer or a dropped geometry swap would do.

async function openLabWithADraft(page: any) {
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Pattern Lab' })).toBeVisible();
  await expect(page.getByTestId('pattern-lab-views')).toBeVisible();
}

// Where the lit pixels actually are, so the two views can be compared by shape
// rather than by trusting a class name.
const litBox = (page: any) => page.evaluate(() => {
  const canvas = document.querySelector('.plab-mapped-preview canvas') as HTMLCanvasElement | null;
  if (!canvas) return null;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = Infinity; let maxX = -1; let minY = Infinity; let maxY = -1; let lit = 0;
  for (let i = 0; i < data.length; i += 4) {
    // A high threshold on purpose: the stage is drawn on graph paper, and a
    // low one measures the background instead of the lights.
    if (data[i] + data[i + 1] + data[i + 2] < 150) continue;
    lit += 1;
    const index = i / 4;
    const x = index % canvas.width;
    const y = Math.floor(index / canvas.width);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return lit ? { lit, width: maxX - minX, height: maxY - minY } : null;
});

test('Strip lays the same lights on one line; Piece puts them back on the artwork', async ({ page }) => {
  await openLabWithADraft(page);

  const piece = page.getByRole('button', { name: 'Piece', exact: true });
  const strip = page.getByRole('button', { name: 'Strip', exact: true });
  await expect(piece).toHaveAttribute('aria-pressed', 'true');

  await expect.poll(async () => (await litBox(page))?.lit ?? 0, { timeout: 20000 }).toBeGreaterThan(0);
  const onPiece = await litBox(page);

  await strip.click();
  await expect(strip).toHaveAttribute('aria-pressed', 'true');
  await expect(piece).toHaveAttribute('aria-pressed', 'false');

  // The lights straighten out: much wider than tall. If both buttons rendered
  // the same geometry this assertion is the one that fails.
  await expect.poll(async () => {
    const box = await litBox(page);
    return box ? box.width / Math.max(1, box.height) : 0;
  }, { timeout: 20000 }).toBeGreaterThan((onPiece!.width / Math.max(1, onPiece!.height)) * 2);

  await piece.click();
  await expect(piece).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const box = await litBox(page);
    return box ? box.width / Math.max(1, box.height) : 0;
  }, { timeout: 20000 }).toBeLessThan((onPiece!.width / Math.max(1, onPiece!.height)) * 1.6);
});

test('the view row offers only what the app can actually show', async ({ page }) => {
  await openLabWithADraft(page);
  const views = page.getByTestId('pattern-lab-views');
  await expect(views.getByRole('button')).toHaveCount(2);
  // The board also draws Grid, Coordinates and "Why is this dark?". Nothing
  // answers those yet, and a button that does nothing is worse than its
  // absence — if they are ever built, this count is the reminder to update.
  for (const absent of ['Grid', 'Coordinates', 'Why is this dark?']) {
    await expect(views.getByRole('button', { name: absent })).toHaveCount(0);
  }
});
