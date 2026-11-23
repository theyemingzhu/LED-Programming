import { test, expect } from '@playwright/test';
import { MOTIONS } from '../src/lib/lookEngine/motions.js';

// The look designer in Layout: six live variations of the owner's own piece,
// three Bend sliders, touch on the artwork (tap steps a pattern, drag sets the
// order), and a closed "Tune it yourself" drawer. A try-out: not saved with the
// project, and it plays in Studio only. Reduced motion holds a still frame,
// which is also what lets these tests compare colours.

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


const ledColours = (page: any, stripId: string) => page.locator(`[data-testid^="strip-led-${stripId}-"]`)
  .evaluateAll((nodes: Element[]) => nodes.map(node => node.querySelector('circle')!.getAttribute('fill')));
const lit = (colours: string[]) => colours.filter(colour => /^rgb\(/.test(colour));
const allColours = async (page: any, ids: Record<string, string>) => (await Promise.all(Object.values(ids).map(id => ledColours(page, id)))).flat();
const touch = (page: any) => page.getByTestId('look-designer-touch');

async function openSheet(page: any) {
  const handle = page.locator('[data-testid="layout-sheet-handle"][aria-expanded="false"]');
  if (await handle.count()) await handle.click();
}
async function turnOn(page: any) {
  await page.getByTestId('look-designer-on').scrollIntoViewIfNeeded();
  await page.getByTestId('look-designer-on').click();
  await expect(touch(page)).toHaveCount(1);
}
async function ledCentre(page: any, stripId: string, index: number) {
  const box = await page.getByTestId(`strip-led-${stripId}-${index}`).boundingBox();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
// Colours differ from the last reading: the picture changed.
async function changed(page: any, ids: Record<string, string>, before: string[], action: () => Promise<void>) {
  await action();
  await expect.poll(async () => JSON.stringify(await allColours(page, ids))).not.toBe(JSON.stringify(before));
  return allColours(page, ids);
}

test('turning it on lights the LEDs, says what it is, and adds no filled button; off puts them back', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await expect(page.getByTestId('look-designer-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(touch(page)).toHaveCount(0);
  expect(lit(await allColours(page, ids))).toHaveLength(0);

  await turnOn(page);
  await expect(page.getByTestId('look-designer-on')).toHaveAttribute('aria-pressed', 'true');
  expect(lit(await allColours(page, ids)).length).toBeGreaterThan(20);
  await expect(page.getByTestId('look-designer-session-note')).toContainText('not saved with the project yet');
  await expect(page.getByTestId('look-designer-card-note')).toContainText('only until a card update');
  await expect(page.locator('[data-testid="layout-look-designer"] .primary, [data-testid="layout-look-designer"] .cta')).toHaveCount(0);
  await expect(page.getByTestId('look-designer-tiles').locator('button')).toHaveCount(6);
  for (const label of ['Pick', 'Bend']) await expect(page.getByTestId('layout-look-designer').getByText(label, { exact: true })).toBeVisible();
  // The drawer starts closed.
  await expect(page.getByTestId('look-designer-tune')).not.toHaveAttribute('open', '');
  // Nothing about it is written into the project.
  expect(JSON.stringify(await saved(page))).not.toContain('look-designer');
  await page.getByTestId('look-designer-off').click();
  await expect(touch(page)).toHaveCount(0);
  expect(lit(await allColours(page, ids))).toHaveLength(0);
});

test('picking a thumbnail changes the LEDs; More like this and Something else offer new ones', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await turnOn(page);
  const first = await allColours(page, ids);
  const second = await changed(page, ids, first, () => page.getByTestId('look-designer-tile-1').click());
  await expect(page.getByTestId('look-designer-tile-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('look-designer-tile-0')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('look-designer-more').click();
  await expect(page.getByTestId('look-designer-say')).toContainText('Five close cousins');
  await expect(page.getByTestId('look-designer-tile-0')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('look-designer-fresh').click();
  await expect(page.getByTestId('look-designer-say')).toContainText('Six new ones');
  expect(second.length).toBe(first.length);
});

test('each Bend slider changes the LEDs; the colour journey changes them once a shape takes the look\'s colours', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await turnOn(page);
  let colours = await allColours(page, ids);
  for (const [id, value] of [['look-designer-pace', '95'], ['look-designer-spread', '0'], ['look-designer-glow', '100']]) {
    colours = await changed(page, ids, colours, () => page.getByTestId(id).fill(value));
  }
  // Every shape starts on a real pattern, so the colour row has nothing to colour and says so.
  await expect(page.getByTestId('look-designer-journey-tide')).toBeDisabled();
  await expect(page.getByTestId('look-designer-journey-note')).toContainText("The look's colours");
  // Put one shape on the look's colours: now the row is live and changes the picture.
  await page.getByTestId('look-designer-tune').locator('summary').click();
  colours = await changed(page, ids, colours, () => page.getByTestId('look-designer-pattern-none').click());
  await expect(page.getByTestId('look-designer-journey-tide')).toBeEnabled();
  colours = await changed(page, ids, colours, () => page.getByTestId('look-designer-journey-tide').click());
  await expect(page.getByTestId('look-designer-journey-tide')).toHaveAttribute('aria-pressed', 'true');
  expect(colours.length).toBeGreaterThan(20);
});

test('a tap on a shape steps its pattern; the touch layer does not exist with the designer off', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await turnOn(page);
  const before = (await touch(page).getAttribute('data-motions'))!.split(',');
  const at = await ledCentre(page, ids['Petal 1'], 6);
  await page.mouse.click(at.x, at.y);
  const after = (await touch(page).getAttribute('data-motions'))!.split(',');
  expect(after.filter((motion, index) => motion !== before[index])).toHaveLength(1);
  await expect(page.getByTestId('look-designer-say')).toContainText('Petal 1');
  // Off: a click on a strip selects it as it always did.
  await page.getByTestId('look-designer-off').click();
  await expect(touch(page)).toHaveCount(0);
});

test('a drag across shapes sets the order they begin in', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await turnOn(page);
  const from = await ledCentre(page, ids['Petal 1'], 6);
  const to = await ledCentre(page, ids['Petal 2'], 6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const order = (await touch(page).getAttribute('data-order'))!.split(',');
  expect(order.filter(value => value === '0.00')).toHaveLength(1);
  expect(order).toContain('0.16');
  await expect(page.getByTestId('look-designer-say')).toContainText('then');
});

test('Tune it yourself starts closed and lists every motion the registry has', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await turnOn(page);
  await expect(page.getByTestId('look-designer-tune')).not.toHaveAttribute('open', '');
  await page.getByTestId('look-designer-tune').locator('summary').click();
  await expect(page.getByTestId('look-designer-tune')).toHaveAttribute('open', '');
  const motions = page.getByTestId('look-designer-motions').locator('button');
  await expect(motions).toHaveCount(MOTIONS.length);
  for (const motion of MOTIONS) await expect(page.getByTestId(`look-designer-motion-${motion.id}`)).toHaveText(motion.label);
  // The plain choices are all there.
  for (const id of ['look-designer-copies-together', 'look-designer-direction-bounce', 'look-designer-speed-2', 'look-designer-begins',
    'look-designer-smoothness', 'look-designer-fade', 'look-designer-breathe', 'look-designer-takeTurns', 'look-designer-petalByPetal', 'look-designer-breath']) {
    await expect(page.getByTestId(id), id).toBeVisible();
  }
  // Choosing a different motion for a shape changes the picture.
  const before = await allColours(page, ids);
  await changed(page, ids, before, () => page.getByTestId('look-designer-chip-1').click().then(() => page.getByTestId('look-designer-direction-bounce').click())
    .then(() => page.getByTestId('look-designer-copies-after').click()));
  // With the drawer open a tap chooses a shape instead of changing it.
  const motionsBefore = await touch(page).getAttribute('data-motions');
  const at = await ledCentre(page, ids['Petal 3'], 6);
  await page.mouse.click(at.x, at.y);
  expect(await touch(page).getAttribute('data-motions')).toBe(motionsBefore);
});

test('an area can be renamed in place: Enter keeps, Escape reverts, empty restores, a pick keeps it', async ({ page }) => {
  await seedPiece(page, LOTUS);
  await turnOn(page);
  await page.getByTestId('look-designer-tune').locator('summary').click();
  const chip = page.getByTestId('look-designer-chip-2');
  await chip.click();
  const name = page.getByTestId('look-designer-name');
  await expect(name).toHaveAttribute('maxlength', '24');
  const before = await name.inputValue();
  await expect(chip).toContainText(before);
  await name.fill('Lotus edge');
  await name.press('Enter');
  await expect(chip).toContainText('Lotus edge');
  // A pick and "Something else" leave the name alone.
  await page.getByTestId('look-designer-tile-3').click();
  await page.getByTestId('look-designer-fresh').click();
  await expect(chip).toContainText('Lotus edge');
  await expect(page.getByTestId('look-designer-name')).toHaveValue('Lotus edge');
  // Escape puts the old name back; leaving the field keeps what was typed.
  await name.fill('Nope');
  await name.press('Escape');
  await expect(name).toHaveValue('Lotus edge');
  await name.fill('Kept on leaving');
  await page.getByTestId('look-designer-chip-3').click();
  await expect(chip).toContainText('Kept on leaving');
  // Empty puts the default back.
  await chip.click();
  await page.getByTestId('look-designer-name').fill('');
  await page.getByTestId('look-designer-name').press('Enter');
  await expect(chip).toContainText(before);
  await expect(chip).not.toContainText('Kept on leaving');
  // Names are session state: nothing about them is written into the project.
  expect(JSON.stringify(await saved(page))).not.toContain('Kept on leaving');
});

// The chosen option must be visible, not only marked: a pressed button looks different from an unpressed one.
test('the chosen option looks different from the others', async ({ page }) => {
  await seedPiece(page, LOTUS);
  await turnOn(page);
  await page.getByTestId('look-designer-tune').locator('summary').click();
  const look = (id: string) => page.getByTestId(id).evaluate((node: Element) => {
    const style = getComputedStyle(node);
    return `${style.borderTopColor}|${style.backgroundColor}|${style.color}`;
  });
  // The chosen option and an unchosen one must look different, read directly.
  const differs = async (on: string, off: string) => {
    expect(await look(on), `${on} should look different from ${off}`).not.toBe(await look(off));
  };
  for (const [on, off] of [['look-designer-motion-pulse', 'look-designer-motion-chase'], ['look-designer-copies-together', 'look-designer-copies-after'],
    ['look-designer-direction-forward', 'look-designer-direction-bounce'], ['look-designer-speed-1', 'look-designer-speed-2'],
    ['look-designer-chip-0', 'look-designer-chip-1']]) {
    await expect(page.getByTestId(on), on).toHaveAttribute('aria-pressed', 'true');
    await differs(on, off);
  }
  // The picked variation tile is outlined. Any edit (the click below) un-picks it by design, so read it first.
  await expect(page.getByTestId('look-designer-tile-0')).toHaveAttribute('aria-pressed', 'true');
  await differs('look-designer-tile-0', 'look-designer-tile-1');
  await page.getByTestId('look-designer-takeTurns').click();
  await differs('look-designer-takeTurns', 'look-designer-petalByPetal');
  // The colour row is greyed while every shape plays a pattern; the chosen one still shows.
  await differs('look-designer-journey-dawn', 'look-designer-journey-tide');
});

test('"Pattern" comes first in Tune it yourself as a picture grid, with mood chips and Show more; a tile sets the light', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await turnOn(page);
  await page.getByTestId('look-designer-tune').locator('summary').click();
  const grid = page.getByTestId('look-designer-grid');
  await expect(grid).toBeVisible();
  const above = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="look-designer-grid"]')!;
    const plays = [...document.querySelectorAll('.ld-tunebody .la-symmetry-k')].find(node => node.textContent === 'It shows as')!;
    return Boolean(grid.compareDocumentPosition(plays) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(above).toBe(true);
  // 12 tiles first (plus the look's own colours), then the rest on request.
  const tiles = grid.locator('.ld-ptile:not(.ld-ptile-plain)');
  await expect(tiles).toHaveCount(12);
  await page.getByTestId('look-designer-pattern-more').click();
  expect(await tiles.count()).toBeGreaterThan(40);
  // Mood chips narrow the list.
  for (const mood of ['all', 'calm', 'water', 'warm', 'spark', 'motion', 'electric']) await expect(page.getByTestId(`look-designer-mood-${mood}`)).toBeVisible();
  await page.getByTestId('look-designer-mood-warm').click();
  const warm = await tiles.count();
  expect(warm).toBeGreaterThan(0);
  await page.getByTestId('look-designer-mood-all').click();
  // A tile sets the chosen area's pattern at once, and the name shows beside the heading.
  const before = await allColours(page, ids);
  await changed(page, ids, before, () => page.getByTestId('look-designer-pattern-fire').click());
  await expect(page.getByTestId('look-designer-pattern-name')).toHaveText('Fire');
  await expect(page.getByTestId('look-designer-pattern-fire')).toHaveAttribute('aria-pressed', 'true');
  // The chosen pattern tile is outlined: it does not look like an unchosen one.
  const tileLook = (id: string) => page.getByTestId(id).evaluate((node: Element) => {
    const style = getComputedStyle(node);
    return `${style.borderTopColor}|${style.backgroundColor}|${style.color}`;
  });
  expect(await tileLook('look-designer-pattern-fire')).not.toBe(await tileLook('look-designer-pattern-aurora'));
  // "The whole pattern" is one of the choices, read from the registry; four choices sit two by two.
  await expect(page.getByTestId('look-designer-motion-whole')).toHaveText('The whole pattern');
  const rows = await page.getByTestId('look-designer-motions').locator('button').evaluateAll((nodes: Element[]) => new Set(nodes.map(node => Math.round(node.getBoundingClientRect().top))).size);
  expect(rows).toBe(2);
});

test('on a phone, a pinned strip names the chosen area and pattern once the shape buttons scroll away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPiece(page, LOTUS);
  await openSheet(page);
  await turnOn(page);
  const pin = page.getByTestId('look-designer-pin');
  await page.getByTestId('look-designer-tune').locator('summary').click();
  // Shape buttons and canvas both in view: no strip at all.
  await page.getByTestId('look-designer-chip-0').scrollIntoViewIfNeeded();
  await expect(pin).toHaveCount(0);
  // Down in the pattern grid the shape buttons are out of view: the strip shows the chosen area.
  const tile = page.locator('.ld-ptile:not(.ld-ptile-plain)').nth(11);
  await tile.scrollIntoViewIfNeeded();
  await expect(pin).toBeVisible();
  const area = (await page.getByTestId('look-designer-name').inputValue());
  await expect(page.getByTestId('look-designer-pin-area')).toContainText(area);
  const box = await pin.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(56);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  // A tapped tile is not hidden under it, and the strip's pattern name follows the tap.
  const label = (await tile.getAttribute('aria-label'))!;
  const tileTop = (await tile.boundingBox())!.y;
  expect(tileTop).toBeGreaterThanOrEqual(box!.y + box!.height - 1);
  await tile.click();
  await expect(page.getByTestId('look-designer-pin-pattern')).toHaveText(label);
  // Back at the shape buttons the strip goes again.
  await page.getByTestId('look-designer-chip-0').scrollIntoViewIfNeeded();
  await expect(pin).toHaveCount(0);
  // And tapping the strip takes you there.
  await tile.scrollIntoViewIfNeeded();
  await expect(pin).toBeVisible();
  await pin.click();
  await expect(pin).toHaveCount(0);
});

test('at 390px wide nothing overflows, with the drawer open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ids = await seedPiece(page, LOTUS);
  await openSheet(page);
  await turnOn(page);
  await page.getByTestId('look-designer-tune').locator('summary').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const id of ['look-designer-off', 'look-designer-on', 'look-designer-tile-5', 'look-designer-more', 'look-designer-fresh', 'look-designer-pace',
    'look-designer-glow', 'look-designer-journey-candle', 'look-designer-motion-chase', 'look-designer-direction-bounce', 'look-designer-breath']) {
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x, id).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, id).toBeLessThanOrEqual(390);
  }
  expect(lit(await allColours(page, ids)).length).toBeGreaterThan(20);
});
