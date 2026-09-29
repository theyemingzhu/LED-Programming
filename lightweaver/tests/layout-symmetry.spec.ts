import { test, expect } from '@playwright/test';

// Symmetry sides in Layout: the piece is divided into 2 or 4 sides, each an
// ordered group of strips the pattern flows through; strips in no side play
// on their own. Set from the offer card on the artwork (when the piece looks
// symmetrical) or from "Symmetry" at the top of the strip list. The sidebar
// shows each side with its strips in flow order; the artwork tints each side
// and numbers its strips. Every change is one Undo step.

type StripDef = { name: string; d: string; kaleidoscope?: boolean };

const saved = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null'));
const savedSymmetry = async (page: any) => (await saved(page))?.layout?.symmetry ?? null;
const savedSides = async (page: any) => ((await savedSymmetry(page))?.sides || []).map((side: any) => side.stripIds);

// Build the piece through the real UI (so wiring and patch board are genuine),
// then redraw each strip's path in the saved project and reload.
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
      return {
        ...rest,
        name: def.name,
        pathData: def.d,
        x: 0,
        y: 0,
        reversed: false,
        sourceLayerId: null,
        sourcePathId: null,
        ...(def.kaleidoscope ? { kaleidoscope: { enabled: true, pointCount: 2, startLed: 0, offsets: [0, 0] } } : {}),
      };
    });
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  }, defs);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(defs.length);
  const ids = await page.evaluate(() => (JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips || [])
    .map((strip: any) => strip.id));
  return Object.fromEntries(defs.map((def, index) => [def.name, ids[index]]));
}

const row = (page: any, id: string) => page.locator(`.la-strip-item[data-strip-id="${id}"]`);
const sideGroup = (page: any, key: string) => page.getByTestId(`side-group-${key}`);
const undo = (page: any) => page.getByTitle(/Undo/).first().click();
const flowOnCanvas = (page: any, id: string) => page.getByTestId(`flow-mark-${id}`);

async function selectStrip(page: any, id: string) {
  await row(page, id).locator('.la-strip-row .layer-name').click();
  await expect(row(page, id)).toHaveClass(/is-editing/);
}

// Centre of the piece is (300, 200). Wings are drawn from the centre outward;
// the ring sits on the centre, so it belongs to no side.
const UPPER_LEFT = 'M 285 190 L 165 110';
const UPPER_RIGHT = 'M 315 190 L 435 110';
const LOWER_LEFT = 'M 285 210 L 165 290';
const LOWER_RIGHT = 'M 315 210 L 435 290';
const RING = 'M 288 200 A 12 12 0 1 1 312 200 A 12 12 0 1 1 288 200';
const WINGED: StripDef[] = [
  { name: 'Left top', d: UPPER_LEFT },
  { name: 'Right top', d: UPPER_RIGHT },
  { name: 'Left bottom', d: LOWER_LEFT },
  { name: 'Right bottom', d: LOWER_RIGHT },
  { name: 'Centre ring', d: RING },
];

test('two sides in one click from the offer, drawn and listed by side, and Undo takes them away', async ({ page }) => {
  const ids = await seedPiece(page, WINGED);
  // Light the preview so the mirrored colours can be read off the LEDs.
  await page.getByTitle('Light glow options').click();
  await page.getByRole('menu').getByRole('button', { name: /Directed glow/ }).click();
  await page.locator('.la-light-pop-backdrop').click();
  const fills = (id: string) => page.evaluate((stripId: string) => Array.from({ length: 24 }, (_, index) =>
    document.querySelector(`[data-testid="strip-led-${stripId}-${index}"] circle`)?.getAttribute('fill')), id);
  // Both strips read in one go: the preview animates between reads.
  const readPair = () => page.evaluate((stripIds: string[]) => stripIds.map(stripId => Array.from({ length: 24 }, (_, index) =>
    document.querySelector(`[data-testid="strip-led-${stripId}-${index}"] circle`)?.getAttribute('fill'))), [ids['Left top'], ids['Right top']]);
  await expect.poll(async () => (await fills(ids['Left top'])).every(Boolean)).toBe(true);
  const [leftBefore, rightBefore] = await readPair();
  expect(rightBefore).not.toEqual(leftBefore);

  const offer = page.getByTestId('symmetry-offer');
  await expect(offer).toBeVisible();
  await expect(offer).toContainText('This piece has two matching sides.');
  await expect(offer).toContainText('the right side plays whatever the left side plays');
  await expect(offer).toContainText('Centre ring keeps its own pattern.');
  // One filled primary.
  await expect(offer.locator('.btn.primary')).toHaveCount(1);
  await expect(offer.locator('.btn.primary')).toHaveText('Mirror the two sides');

  await page.getByTestId('symmetry-offer-mirror').click();
  await expect(offer).toHaveCount(0);
  await expect.poll(() => savedSides(page)).toEqual([
    [ids['Left top'], ids['Left bottom']],
    [ids['Right top'], ids['Right bottom']],
  ]);
  const symmetry = await savedSymmetry(page);
  expect(symmetry.sides.map((side: any) => side.label)).toEqual(['Left side', 'Right side']);
  // Both sides are drawn from the centre outward, so side 2 plays the same way round.
  expect(symmetry.orientation).toBe('same');

  // Sidebar: the control, the sides in flow order, then the ring on its own.
  await expect(page.getByTestId('layout-symmetry-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(sideGroup(page, 'side-1').locator('.la-side-name')).toHaveText('Left side');
  await expect(sideGroup(page, 'side-1').locator('.la-strip-item')).toHaveCount(2);
  await expect(page.getByTestId(`flow-n-${ids['Left top']}`)).toHaveText('1');
  await expect(page.getByTestId(`flow-n-${ids['Left bottom']}`)).toHaveText('2');
  await expect(sideGroup(page, 'side-1').locator('.la-side-foot')).toHaveText('The pattern flows through Left top, then Left bottom.');
  await expect(sideGroup(page, 'on-its-own').locator(`.la-strip-item[data-strip-id="${ids['Centre ring']}"]`)).toHaveCount(1);
  // Each row still names its data wire.
  await expect(page.getByTestId(`strip-wire-${ids['Left top']}`)).toContainText('GPIO');
  await expect(page.getByTestId('layout-mapping-details').locator('summary')).toHaveText('5 strips on 1 data wire');

  // Artwork: side tints, flow numbers, the mirror line with its sides named.
  await expect(page.locator('[data-testid^="side-band-"]')).toHaveCount(4);
  await expect(page.getByTestId(`side-band-${ids['Right top']}`)).toHaveAttribute('data-side-id', 'side-2');
  await expect(page.getByTestId(`side-band-${ids['Centre ring']}`)).toHaveCount(0);
  await expect(flowOnCanvas(page, ids['Right bottom'])).toHaveAttribute('data-flow-position', '2');
  await expect(page.getByTestId('symmetry-axis')).toHaveCount(1);
  await expect(page.getByTestId('symmetry-side-label-side-1')).toHaveText('Left side');
  await expect(page.getByTestId('symmetry-side-label-side-2')).toHaveText('Right side');

  // The right side now plays the left side's colours.
  await expect.poll(async () => {
    const [left, right] = await readPair();
    return left.every(Boolean) && JSON.stringify(left) === JSON.stringify(right);
  }).toBe(true);

  // Tapping a strip's number on the artwork selects its row.
  await flowOnCanvas(page, ids['Right bottom']).click();
  await expect(row(page, ids['Right bottom'])).toHaveClass(/is-editing/);

  // One Undo takes the sides away and the offer comes back.
  await undo(page);
  await expect.poll(() => savedSymmetry(page)).toBe(null);
  await expect(page.locator('[data-testid^="side-group-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="gpio-group-"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="side-band-"]')).toHaveCount(0);
  await expect(offer).toBeVisible();
});

test('Keep as drawn hides the offer, and it stays hidden after a reload', async ({ page }) => {
  await seedPiece(page, WINGED);
  await expect(page.getByTestId('symmetry-offer')).toBeVisible();
  await page.getByTestId('symmetry-offer-keep').click();
  await expect(page.getByTestId('symmetry-offer')).toHaveCount(0);
  await expect.poll(async () => (await saved(page))?.layout?.symmetryOfferDismissed).toBe(true);
  await expect.poll(() => savedSymmetry(page)).toBe(null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(5);
  await expect(page.getByTestId('symmetry-offer')).toHaveCount(0);
  // Still available from the strip list.
  await expect(page.getByTestId('layout-symmetry-0')).toHaveAttribute('aria-pressed', 'true');
});

test('Choose sides myself applies the sides and brings them into view', async ({ page }) => {
  const ids = await seedPiece(page, WINGED);
  await page.getByTestId('symmetry-offer-choose').click();
  await expect.poll(() => savedSides(page)).toEqual([
    [ids['Left top'], ids['Left bottom']],
    [ids['Right top'], ids['Right bottom']],
  ]);
  await expect(page.getByTestId('layout-symmetry-2')).toBeFocused();
});

test('four sides from the Symmetry line, and which way each side runs', async ({ page }) => {
  const ids = await seedPiece(page, [
    { name: 'Left arm', d: 'M 290 200 L 170 200' },
    { name: 'Top arm', d: 'M 300 190 L 300 70' },
    { name: 'Bottom arm', d: 'M 300 210 L 300 330' },
    { name: 'Right arm', d: 'M 310 200 L 430 200' },
    { name: 'Centre ring', d: RING },
  ]);
  await page.getByTestId('layout-symmetry-4').click();
  await expect.poll(() => savedSides(page)).toEqual([
    [ids['Top arm']], [ids['Right arm']], [ids['Bottom arm']], [ids['Left arm']],
  ]);
  expect((await savedSymmetry(page)).sides.map((side: any) => side.label)).toEqual(['Side 1', 'Side 2', 'Side 3', 'Side 4']);
  await expect(page.locator('[data-testid^="side-group-side-"]')).toHaveCount(4);
  await expect(sideGroup(page, 'on-its-own')).toContainText('Centre ring');
  await expect(page.getByTestId('symmetry-axis')).toHaveCount(0);
  await expect(page.locator('[data-testid^="side-band-"]')).toHaveCount(4);

  // Arms drawn from the centre outward all run the same way round. Sides 2
  // and 4 say so on their headers and carry the one Flip; sides 1 and 3 do not.
  await expect(page.getByTestId('side-runs-side-2')).toHaveText('Same direction');
  await expect(page.getByTestId('side-runs-side-4')).toHaveText('Same direction');
  await expect(page.getByTestId('side-flip-side-1')).toHaveCount(0);
  await expect(page.getByTestId('side-flip-side-3')).toHaveCount(0);
  await expect(page.getByTestId('side-runs-side-3')).toHaveCount(0);
  await expect(page.getByTestId('side-flip-side-4')).toHaveAttribute('aria-label', 'Flip Side 2 and Side 4');
  await page.getByTestId('side-flip-side-4').click();
  await expect.poll(async () => (await savedSymmetry(page))?.orientation).toBe('mirror');
  await expect(page.getByTestId('side-runs-side-2')).toHaveText('Mirror image');
  await expect(page.getByTestId('side-runs-side-4')).toHaveText('Mirror image');
  await undo(page);
  await expect.poll(async () => (await savedSymmetry(page))?.orientation).toBe('same');
  await expect(page.getByTestId('side-runs-side-4')).toHaveText('Same direction');

  // None goes back to the data-wire list in one step, and Undo restores the sides.
  await page.getByTestId('layout-symmetry-0').click();
  await expect.poll(() => savedSymmetry(page)).toBe(null);
  await expect(page.locator('[data-testid^="gpio-group-"]')).toHaveCount(1);
  await undo(page);
  await expect.poll(async () => (await savedSides(page)).length).toBe(4);
});

test('strips move between sides by drag or by keyboard, and the artwork renumbers', async ({ page }) => {
  const ids = await seedPiece(page, WINGED);
  await page.getByTestId('symmetry-offer-mirror').click();
  await expect.poll(async () => (await savedSides(page)).length).toBe(2);

  // Drag Left bottom above Left top: the flow order inside the side changes.
  const leftTopRow = row(page, ids['Left top']).locator('.la-strip-row');
  const leftBottomRow = row(page, ids['Left bottom']).locator('.la-strip-row');
  const target = await leftTopRow.boundingBox();
  await leftBottomRow.dragTo(leftTopRow, { targetPosition: { x: 20, y: 4 } });
  await expect.poll(async () => (await savedSides(page))[0]).toEqual([ids['Left bottom'], ids['Left top']]);
  expect(target).not.toBeNull();
  await expect(page.getByTestId(`flow-n-${ids['Left bottom']}`)).toHaveText('1');
  await expect(flowOnCanvas(page, ids['Left bottom'])).toHaveAttribute('data-flow-position', '1');
  await expect(flowOnCanvas(page, ids['Left top'])).toHaveAttribute('data-flow-position', '2');

  // Drag Right top into the left side's group.
  await row(page, ids['Right top']).locator('.la-strip-row').dragTo(sideGroup(page, 'side-1').locator('.la-side-head'));
  await expect.poll(async () => (await savedSides(page))).toEqual([
    [ids['Left bottom'], ids['Left top'], ids['Right top']],
    [ids['Right bottom']],
  ]);
  await expect(flowOnCanvas(page, ids['Right top'])).toHaveAttribute('data-flow-position', '3');
  await expect(page.getByTestId(`side-band-${ids['Right top']}`)).toHaveAttribute('data-side-id', 'side-1');

  // Keyboard: the selected strip's settings say where it plays.
  await selectStrip(page, ids['Right top']);
  const choice = page.getByTestId(`side-choice-${ids['Right top']}`);
  await expect(choice).toContainText('Right top plays');
  await expect(page.getByTestId(`side-choice-${ids['Right top']}-side-1`)).toHaveAttribute('aria-pressed', 'true');
  await choice.getByRole('button', { name: `Move Right top up in Left side` }).click();
  await expect.poll(async () => (await savedSides(page))[0]).toEqual([ids['Left bottom'], ids['Right top'], ids['Left top']]);
  await expect(flowOnCanvas(page, ids['Right top'])).toHaveAttribute('data-flow-position', '2');
  await page.getByTestId(`side-choice-${ids['Right top']}-side-2`).click();
  await expect.poll(async () => (await savedSides(page))[1]).toEqual([ids['Right bottom'], ids['Right top']]);
  await expect(page.getByTestId(`side-choice-${ids['Right top']}-side-2`)).toBeFocused();

  // On its own: it leaves every side and loses its band and number.
  await page.getByTestId(`side-choice-${ids['Right top']}-own`).click();
  await expect.poll(async () => (await savedSides(page))[1]).toEqual([ids['Right bottom']]);
  await expect(sideGroup(page, 'on-its-own').locator(`.la-strip-item[data-strip-id="${ids['Right top']}"]`)).toHaveCount(1);
  await expect(page.getByTestId(`side-band-${ids['Right top']}`)).toHaveCount(0);
  await expect(flowOnCanvas(page, ids['Right top'])).toHaveCount(0);

  // Each move was one Undo step.
  await undo(page);
  await expect.poll(async () => (await savedSides(page))[1]).toEqual([ids['Right bottom'], ids['Right top']]);
  await undo(page);
  await undo(page);
  await undo(page);
  await expect.poll(() => savedSides(page)).toEqual([
    [ids['Left bottom'], ids['Left top']],
    [ids['Right top'], ids['Right bottom']],
  ]);
});

test('a strip with reflection points cannot join a side and says why', async ({ page }) => {
  const ids = await seedPiece(page, [
    ...WINGED.slice(0, 4),
    { name: 'Halo', d: 'M 140 340 L 190 360', kaleidoscope: true },
  ]);
  await page.getByTestId('layout-symmetry-2').click();
  await expect.poll(async () => (await savedSides(page)).flat()).not.toContain(ids.Halo);
  await selectStrip(page, ids.Halo);
  const leftSide = page.getByTestId(`side-choice-${ids.Halo}-side-1`);
  await expect(leftSide).toBeDisabled();
  await expect(leftSide).toHaveAttribute('title', 'Turn off reflection points first');
});

test('the sides fit a 300px desktop inspector and a 390px phone', async ({ page }) => {
  const shoot = async (label: string) => {
    const ids = await seedPiece(page, [
      ...WINGED,
      { name: 'Right bottom outer wing with a long name', d: 'M 330 230 L 450 320' },
      { name: 'Left bottom outer wing', d: 'M 270 230 L 150 320' },
    ]);
    await page.screenshot({ path: `test-results/layout-symmetry-offer-${label}.png` });
    await page.getByTestId('symmetry-offer-mirror').click();
    await selectStrip(page, ids['Left top']);
    const list = page.locator('.la-side-group').first();
    await list.scrollIntoViewIfNeeded();
    const metrics = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll('.la-side-group, .la-symmetry')) as HTMLElement[];
      const overflowing = groups.flatMap(groupEl => Array.from(groupEl.querySelectorAll('*')).filter(el => {
        const box = (el as HTMLElement).getBoundingClientRect();
        const outer = groupEl.getBoundingClientRect();
        return box.width > 0 && (box.right > outer.right + 1 || box.left < outer.left - 1);
      }).map(el => (el as HTMLElement).className || el.tagName));
      const inspector = document.querySelector('.la-symmetry')?.closest('aside') as HTMLElement;
      const rows = Array.from(document.querySelectorAll('.la-side-group .la-strip-row')) as HTMLElement[];
      return {
        inspectorWidth: Math.round(inspector.getBoundingClientRect().width),
        rowHeights: rows.map(el => Math.round(el.getBoundingClientRect().height)),
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        overflowing,
      };
    });
    expect(metrics.overflowing).toEqual([]);
    expect(metrics.pageOverflow).toBe(false);
    await page.locator('.la-symmetry').screenshot({ path: `test-results/layout-symmetry-control-${label}.png` });
    await page.screenshot({ path: `test-results/layout-symmetry-viewport-${label}.png` });
    await page.locator('aside.side').screenshot({ path: `test-results/layout-symmetry-inspector-${label}.png` });
    await page.getByTestId(`side-choice-${ids['Left top']}`).evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `test-results/layout-symmetry-editor-${label}.png` });
    await page.getByTestId('side-group-side-2').evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `test-results/layout-symmetry-side-2-${label}.png` });
    return metrics;
  };
  await page.setViewportSize({ width: 1280, height: 860 });
  const desktop = await shoot('desktop');
  expect(desktop.inspectorWidth).toBeLessThanOrEqual(340);
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await shoot('phone');
  expect(phone.inspectorWidth).toBeLessThanOrEqual(390);
  console.log(JSON.stringify({ desktop, phone }));
});

// ── Play preview and Flip ────────────────────────────────────────────────────
// Play is the Light preview's clock: it lights the canvas LEDs with the look's
// real patterns and sets them moving; Pause holds the frame. Mirrored sides
// copy side 1 while playing, and Flip on side 2 turns the copy over at once.

const LEDS_PER_STRIP = 24;
const playButton = (page: any) => page.getByTestId('layout-preview-play');
// Every LED fill of each strip, read in ONE evaluate so a playing preview
// cannot move between strips.
const readStrips = (page: any, stripIds: string[]): Promise<(string | null)[][]> => page.evaluate(
  ({ stripIds, count }: { stripIds: string[]; count: number }) => stripIds.map(stripId => Array.from({ length: count }, (_, index) =>
    document.querySelector(`[data-testid="strip-led-${stripId}-${index}"] circle`)?.getAttribute('fill') || null)),
  { stripIds, count: LEDS_PER_STRIP });
const lit = (fills: (string | null)[][]) => fills.every(strip => strip.every(Boolean));

test('Play sets the pattern moving on a piece without symmetry, and Pause holds the frame', async ({ page }) => {
  const ids = await seedPiece(page, WINGED);
  expect(await savedSymmetry(page)).toBe(null);
  const strip = [ids['Left top']];
  await expect(playButton(page)).toHaveText('Play');
  await expect(playButton(page)).toHaveAttribute('aria-pressed', 'false');
  // At rest the dots wear the strip's identity colour: one colour, all along.
  const rest = (await readStrips(page, strip))[0];
  expect(new Set(rest).size).toBe(1);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect(playButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const [fills] = await readStrips(page, strip);
    return lit([fills]) && new Set(fills).size > 1;
  }).toBe(true);
  const first = (await readStrips(page, strip))[0];
  await expect.poll(async () => JSON.stringify((await readStrips(page, strip))[0])).not.toBe(JSON.stringify(first));

  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await page.waitForTimeout(150);
  const held = (await readStrips(page, strip))[0];
  await page.waitForTimeout(600);
  expect((await readStrips(page, strip))[0]).toEqual(held);
  // Paused is still lit: the held frame is the pattern, not the resting colour.
  expect(new Set(held).size).toBeGreaterThan(1);

  // Play again picks up and moves on.
  await playButton(page).click();
  await expect.poll(async () => JSON.stringify((await readStrips(page, strip))[0])).not.toBe(JSON.stringify(held));
});

test('while playing, the mirrored side copies side 1, and Flip turns it over in one Undo step', async ({ page }) => {
  const ids = await seedPiece(page, WINGED);
  await page.getByTestId('symmetry-offer-mirror').click();
  await expect.poll(async () => (await savedSides(page)).length).toBe(2);
  expect((await savedSymmetry(page)).orientation).toBe('same');
  const order = [ids['Left top'], ids['Left bottom'], ids['Right top'], ids['Right bottom']];
  // One run per side, in flow order.
  const sides = async () => {
    const [a, b, c, d] = await readStrips(page, order);
    return { left: [...a, ...b], right: [...c, ...d] };
  };

  // Side 2 says how it runs and carries the Flip; side 1 does not.
  await expect(page.getByTestId('side-runs-side-2')).toHaveText('Same direction');
  await expect(page.getByTestId('side-flip-side-1')).toHaveCount(0);
  await expect(page.getByTestId('side-flip-side-2')).toHaveText('Flip');
  await expect(page.getByTestId('side-flip-side-2')).toHaveAttribute('aria-label', 'Flip Right side');

  await playButton(page).click();
  await expect.poll(async () => {
    const { left, right } = await sides();
    return left.every(Boolean) && new Set(left).size > 1 && JSON.stringify(right) === JSON.stringify(left);
  }).toBe(true);
  // It is moving, and the copy holds on every frame.
  const before = (await sides()).left;
  await expect.poll(async () => JSON.stringify((await sides()).left)).not.toBe(JSON.stringify(before));

  const historyBefore = await page.getByTitle(/Undo/).first().getAttribute('title');
  await page.getByTestId('side-flip-side-2').click();
  await expect.poll(async () => (await savedSymmetry(page))?.orientation).toBe('mirror');
  await expect(page.getByTestId('side-runs-side-2')).toHaveText('Mirror image');
  // Still playing, and side 2 now plays side 1 back to front.
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(async () => {
    const { left, right } = await sides();
    return left.every(Boolean) && JSON.stringify(right) === JSON.stringify([...left].reverse())
      && JSON.stringify(right) !== JSON.stringify(left);
  }).toBe(true);

  // Paused, the flipped frame holds.
  await playButton(page).click();
  await page.waitForTimeout(150);
  const held = await sides();
  await page.waitForTimeout(500);
  expect(await sides()).toEqual(held);
  expect(held.right).toEqual([...held.left].reverse());

  // One Undo step turns it back, and the paused frame follows at once.
  await undo(page);
  await expect.poll(async () => (await savedSymmetry(page))?.orientation).toBe('same');
  expect(await page.getByTitle(/Undo/).first().getAttribute('title')).toBe(historyBefore);
  await expect(page.getByTestId('side-runs-side-2')).toHaveText('Same direction');
  await expect.poll(async () => {
    const { left, right } = await sides();
    return JSON.stringify(right) === JSON.stringify(left);
  }).toBe(true);
  expect((await savedSides(page)).length).toBe(2);
});

test('with reduced motion, turning the light on shows a still frame, and Play still plays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const ids = await seedPiece(page, WINGED);
  const strip = [ids['Left top']];
  await page.getByTitle(/Toggle ambient light preview/).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect.poll(async () => new Set((await readStrips(page, strip))[0]).size).toBeGreaterThan(1);
  const still = (await readStrips(page, strip))[0];
  await page.waitForTimeout(600);
  expect((await readStrips(page, strip))[0]).toEqual(still);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(async () => JSON.stringify((await readStrips(page, strip))[0])).not.toBe(JSON.stringify(still));
});

test('Play and Flip fit the desktop toolbar and a 390px phone', async ({ page }) => {
  for (const [width, height, label] of [[1280, 860, 'desktop'], [390, 844, 'phone']] as const) {
    await page.setViewportSize({ width, height });
    await seedPiece(page, WINGED);
    await page.getByTestId('symmetry-offer-mirror').click();
    await playButton(page).click();
    await expect(playButton(page)).toHaveText('Pause');
    const box = await playButton(page).boundingBox();
    const toolbar = await page.locator('.la .toolbar').boundingBox();
    expect(box).not.toBeNull();
    // Reachable without scrolling the toolbar.
    expect(box!.y + box!.height).toBeLessThanOrEqual(toolbar!.y + toolbar!.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)).toBe(false);
    await page.screenshot({ path: `test-results/layout-play-${label}.png` });
    const head = page.getByTestId('side-group-side-2').locator('.la-side-head');
    await head.evaluate((el: HTMLElement) => el.scrollIntoView({ block: 'center' }));
    const fits = await head.evaluate((el: HTMLElement) => {
      const outer = el.getBoundingClientRect();
      return Array.from(el.children).every(child => {
        const r = (child as HTMLElement).getBoundingClientRect();
        return r.right <= outer.right + 1 && r.left >= outer.left - 1;
      });
    });
    expect(fits).toBe(true);
    await head.screenshot({ path: `test-results/layout-flip-head-${label}.png` });
    await page.screenshot({ path: `test-results/layout-flip-${label}.png` });
  }
});
