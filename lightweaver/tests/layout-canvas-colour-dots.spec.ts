import { test, expect } from '@playwright/test';

// On the Layout canvas each strip has one small numbered dot at its first light
// and, with sides, wears its side's colour. Names show as one chip, only for the
// selected and the hovered strip.
type StripDef = { name: string; d: string };

const saved = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null'));

// Same seeding as layout-symmetry-by-eye.spec.ts: build through the real UI so
// the wiring is genuine, then redraw each strip's path.
async function seedPiece(page: any, defs: StripDef[]) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
    project.layout.symmetryOfferDismissed = true;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  }, defs);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(defs.length);
  const ids = await page.evaluate(() => (JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips || [])
    .map((strip: any) => strip.id));
  return Object.fromEntries(defs.map((def, index) => [def.name, ids[index]])) as Record<string, string>;
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


const dot = (page: any, id: string) => page.locator(`[data-testid="flow-mark-${id}"], [data-testid="strip-dot-${id}"]`);
// A point on the strip itself (the middle of its path), in screen pixels.
const onStrip = (page: any, id: string) => page.locator(`[data-strip-path="${id}"]`).evaluate((node: SVGPathElement) => {
  const point = node.getPointAtLength(node.getTotalLength() / 2);
  const matrix = node.getScreenCTM()!;
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
});

test('no sides: a numbered dot per strip in list order, no name boxes, a chip for the selected strip only', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await expect(page.locator('.lw-strip-dot')).toHaveCount(LOTUS.length);
  for (const [index, def] of LOTUS.entries()) await expect(dot(page, ids[def.name]).locator('text')).toHaveText(String(index + 1));
  await expect(page.locator('.lw-strip-chip')).toHaveCount(0);
  await page.locator('.la-strip-row', { hasText: 'Petal 2' }).first().click();
  await expect(page.locator('.lw-strip-chip')).toHaveCount(1);
  await expect(page.getByTestId(`strip-chip-${ids['Petal 2']}`)).toContainText('Petal 2');
  // The dot is small and the strip's own name stays in the accessible name.
  const box = await page.locator('.lw-strip-dot circle').first().boundingBox();
  expect(box!.width).toBeLessThanOrEqual(20);
  await expect(page.getByTestId(`strip-callout-${ids['Petal 3']}`)).toHaveAttribute('aria-label', /^Petal 3/);
});

test('hovering a strip shows its name chip, and leaving takes it away', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await expect(page.locator('.lw-strip-chip')).toHaveCount(0);
  const at = await onStrip(page, ids['Petal 4']);
  await page.mouse.move(at.x - 3, at.y - 3);
  await page.mouse.move(at.x, at.y);
  await expect(page.getByTestId(`strip-chip-${ids['Petal 4']}`)).toBeVisible();
  await page.mouse.move(2, 2);
  await expect(page.locator('.lw-strip-chip')).toHaveCount(0);
});

test('with six sides each strip wears its side colour and its dot numbers it within its side', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await page.getByTestId('layout-symmetry-6').click();
  await page.getByTestId('symmetry-focus-done').click();
  for (let k = 1; k <= 6; k += 1) {
    const mark = page.getByTestId(`flow-mark-${ids[`Petal ${k}`]}`);
    await expect(mark).toHaveAttribute('data-flow-position', '1');
    // The dot's outline, the strip's rail and the side band agree on one colour.
    const dotColour = await mark.locator('circle').getAttribute('stroke');
    const band = page.getByTestId(`side-band-${ids[`Petal ${k}`]}`);
    expect(await band.getAttribute('stroke')).toBe(dotColour);
    expect(await page.locator(`[data-strip-identity="${ids[`Petal ${k}`]}"]`).getAttribute('stroke')).toBe(dotColour);
  }
  // The centre ring is on its own: no flow number, its own colour.
  await expect(page.getByTestId(`flow-mark-${ids['Centre ring']}`)).toHaveCount(0);
  await expect(page.getByTestId(`strip-dot-${ids['Centre ring']}`)).toHaveCount(1);
  await expect(page.locator('.lw-strip-chip')).toHaveCount(0);
});

test('the dot does not block selecting a strip by clicking along it', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  const at = await onStrip(page, ids['Petal 5']);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId(`strip-callout-${ids['Petal 5']}`)).toHaveAttribute('data-selected', 'true');
});
