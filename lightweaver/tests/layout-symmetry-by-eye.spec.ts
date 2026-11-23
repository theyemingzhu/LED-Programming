import { test, expect } from '@playwright/test';

// Symmetry by eye in Layout: the Symmetry control offers 2, 3, 4, 5, 6 or 8
// sides. Choosing one places the strips and draws side 1 again on every other
// side in amber. The right number puts each copy on a real strip ("6 sides
// line up."); a wrong number or a moved centre leaves doubled lines. A mark
// under one number is Studio's own guess. No artwork is loaded in these
// tests: the strips alone supply the centre.

type StripDef = { name: string; d: string };

const saved = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null'));
const savedSymmetry = async (page: any) => (await saved(page))?.layout?.symmetry ?? null;
const savedSides = async (page: any) => ((await savedSymmetry(page))?.sides || []).map((side: any) => side.stripIds);

// Same seeding as layout-symmetry.spec.ts: build through the real UI so the
// wiring and patch board are genuine, then redraw each strip's path.
async function seedPiece(page: any, defs: StripDef[]) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  const count = page.locator('.la-strip-detail .la-row-count input').first();
  await count.fill('24');
  await count.blur();
  for (let index = 1; index < defs.length; index += 1) {
    await page.locator('.la-strip-item.is-editing .la-strip-menu > summary').click();
    await page.locator('.la-strip-item.is-editing .la-strip-menu-popover').getByRole('button', { name: 'Duplicate strip' }).click();
    await expect(page.locator('.la-strip-row')).toHaveCount(index + 1);
  }
  await expect.poll(async () => (await saved(page))?.layout?.strips?.length).toBe(defs.length);
  await expect.poll(async () => (await saved(page))?.layout?.wiring?.runs?.length).toBe(defs.length);
  await page.evaluate((stripDefs: StripDef[]) => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    project.layout.strips = project.layout.strips.map((strip: any, index: number) => {
      const def = stripDefs[index];
      const { pixels, ...rest } = strip;
      return { ...rest, name: def.name, pathData: def.d, x: 0, y: 0, reversed: false, sourceLayerId: null, sourcePathId: null };
    });
    // The two-sides offer is another test's subject; here it would cover the card under test.
    project.layout.symmetryOfferDismissed = true;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  }, defs);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(defs.length);
  const ids = await page.evaluate(() => (JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips || [])
    .map((strip: any) => strip.id));
  return Object.fromEntries(defs.map((def, index) => [def.name, ids[index]]));
}

// Six petals about (300, 200), each one curved strip drawn from the centre
// outward, plus a ring on the centre that belongs to no side.
const C = { x: 300, y: 200 };
const at = (radius: number, degrees: number) => {
  const x = C.x + radius * Math.cos(degrees * Math.PI / 180);
  const y = C.y + radius * Math.sin(degrees * Math.PI / 180);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
};
const PETALS: StripDef[] = Array.from({ length: 6 }, (_, k) => {
  const th = -90 + 60 * k;
  return { name: `Petal ${k + 1}`, d: `M ${at(45, th - 8)} Q ${at(105, th - 22)} ${at(150, th)}` };
});
const LOTUS: StripDef[] = [...PETALS, { name: 'Centre ring', d: 'M 288 200 A 12 12 0 1 1 312 200 A 12 12 0 1 1 288 200' }];

const verdict = (page: any) => page.getByTestId('symmetry-focus-verdict');
const copies = (page: any) => page.getByTestId('symmetry-copies');

test('six sides: Studio marks its guess, one petal lands in each side and the copies line up', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await expect(page.getByTestId('layout-symmetry-6')).toHaveAttribute('data-guess', 'true');
  await expect(page.getByTestId('layout-symmetry-guess')).toContainText("Studio's guess from where the strips sit: 6 sides.");
  for (const fold of [2, 3, 4, 5, 6, 8]) await expect(page.getByTestId(`layout-symmetry-${fold}`)).toHaveText(`${fold} sides`);

  await page.getByTestId('layout-symmetry-6').click();
  await expect(page.getByTestId('layout-symmetry-6')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await savedSides(page)).length).toBe(6);
  const sides = await savedSides(page);
  expect(sides.every((side: string[]) => side.length === 1)).toBe(true);
  expect(sides.flat()).not.toContain(ids['Centre ring']);
  expect((await savedSymmetry(page)).orientation).toBe('same');

  await expect(verdict(page)).toHaveAttribute('data-fits', 'true');
  await expect(verdict(page)).toContainText('6 sides line up.');
  await expect(copies(page)).toHaveAttribute('data-count', '5');
  // Save to card stays the one filled action on Layout.
  await expect(page.getByTestId('symmetry-focus-done')).not.toHaveClass(/primary/);

  await page.getByTestId('symmetry-focus-done').click();
  await expect(page.getByTestId('symmetry-focus')).toHaveCount(0);
  await expect(copies(page)).toHaveCount(0);
  // Choosing the same number again brings the copies back to check by eye.
  await page.getByTestId('layout-symmetry-6').click();
  await expect(verdict(page)).toContainText('6 sides line up.');
});

test('a wrong number of sides reads as doubled lines, and the right one after it lines up', async ({ page }) => {
  await seedPiece(page, LOTUS);
  await page.getByTestId('layout-symmetry-4').click();
  await expect(verdict(page)).toHaveAttribute('data-fits', 'false');
  await expect(verdict(page)).toContainText('this piece does not have 4 matching sides');
  await page.getByTestId('layout-symmetry-5').click();
  await expect(verdict(page)).toHaveAttribute('data-fits', 'false');
  await page.getByTestId('layout-symmetry-3').click();
  await expect(verdict(page)).toHaveAttribute('data-fits', 'true');
  await expect.poll(async () => (await savedSides(page)).map((side: string[]) => side.length)).toEqual([2, 2, 2]);
  // None takes the sides and the card away.
  await page.getByTestId('layout-symmetry-0').click();
  await expect(page.getByTestId('symmetry-focus')).toHaveCount(0);
  await expect.poll(() => savedSymmetry(page)).toBeNull();
});

test('dragging the centre mark off the centre breaks the fit; putting it back restores it', async ({ page }) => {
  await seedPiece(page, LOTUS);
  await page.getByTestId('layout-symmetry-6').click();
  await expect(verdict(page)).toHaveAttribute('data-fits', 'true');
  await expect(page.getByTestId('symmetry-focus-recentre')).toHaveCount(0);

  const mark = page.getByTestId('symmetry-centre');
  const box = await mark.boundingBox();
  const from = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 10, { steps: 6 });
  await page.mouse.move(from.x + 90, from.y + 20, { steps: 6 });
  await page.mouse.up();
  await expect(verdict(page)).toHaveAttribute('data-fits', 'false');
  await expect(mark).toHaveAttribute('aria-valuetext', 'Moved');

  await page.getByTestId('symmetry-focus-recentre').click();
  await expect(verdict(page)).toHaveAttribute('data-fits', 'true');
  await expect(mark).toHaveAttribute('aria-valuetext', 'Where Studio put it');
  await expect.poll(async () => (await savedSides(page)).every((side: string[]) => side.length === 1)).toBe(true);
});

test('the pulse lights one side after another, once around', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await page.getByTestId('layout-symmetry-6').click();
  await expect(verdict(page)).toHaveAttribute('data-fits', 'true');
  await expect.poll(async () => (await savedSides(page)).length).toBe(6);
  const sides = await savedSides(page);
  // Side 1 is the petal at the top; the pulse goes clockwise from it.
  expect(sides.map((side: string[]) => side[0])).toEqual([1, 2, 3, 4, 5, 6].map(n => ids[`Petal ${n}`]));
  const seen: string[] = [];
  await page.getByTestId('symmetry-focus-pulse').click();
  await expect.poll(async () => {
    const lit = await page.locator('[data-testid^="symmetry-pulse-"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')!.replace('symmetry-pulse-', '')));
    for (const id of lit) if (seen.at(-1) !== id) seen.push(id);
    return seen.length;
  }, { intervals: [60], timeout: 6000 }).toBeGreaterThanOrEqual(6);
  expect(seen.slice(0, 6)).toEqual(sides.map((side: string[]) => side[0]));
  await expect(page.locator('[data-testid^="symmetry-pulse-"]')).toHaveCount(0);
});

test('on a phone the card and the seven choices stay inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPiece(page, LOTUS);
  const handle = page.locator('[data-testid="layout-sheet-handle"][aria-expanded="false"]');
  if (await handle.count()) await handle.click();
  await page.getByTestId('layout-symmetry-6').scrollIntoViewIfNeeded();
  await page.getByTestId('layout-symmetry-6').click();
  await expect(verdict(page)).toContainText('6 sides line up.');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const fold of [0, 2, 3, 4, 5, 6, 8]) {
    const box = await page.getByTestId(`layout-symmetry-${fold}`).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});
