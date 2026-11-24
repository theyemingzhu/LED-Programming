import { test, expect } from '@playwright/test';

// A placed look in Layout: a frame the owner drags over the strips. Inside it
// a sweep or rings move, and each LED dot takes the colour under it. It is a
// try-out until "Save as a look" records it into the project's recordings;
// nothing goes to a card from here. Reduced motion holds the look still, which is also
// what lets these tests compare colours.

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

const frame = (page: any) => page.getByTestId('placed-look-frame');
const frameAt = async (page: any) => {
  const node = frame(page);
  return {
    x: Number(await node.getAttribute('data-x')), y: Number(await node.getAttribute('data-y')),
    halfWidth: Number(await node.getAttribute('data-half-width')), halfHeight: Number(await node.getAttribute('data-half-height')),
  };
};
// The colour each LED dot of one strip is drawn in, LED 1 first.
const ledColours = (page: any, stripId: string) => page.locator(`[data-testid^="strip-led-${stripId}-"]`)
  .evaluateAll((nodes: Element[]) => nodes.map(node => node.querySelector('circle')!.getAttribute('fill')));
const lit = (colours: string[]) => colours.filter(colour => /^rgb\(/.test(colour));
const allColours = async (page: any, ids: Record<string, string>) => (await Promise.all(Object.values(ids).map(id => ledColours(page, id)))).flat();

async function openSheet(page: any) {
  const handle = page.locator('[data-testid="layout-sheet-handle"][aria-expanded="false"]');
  if (await handle.count()) await handle.click();
}
async function turnOn(page: any) {
  await page.getByTestId('placed-look-on').scrollIntoViewIfNeeded();
  await page.getByTestId('placed-look-on').click();
  await expect(frame(page)).toBeVisible();
}
// Press on the frame's body, away from the strips and their labels.
async function dragBody(page: any, dx: number, dy: number) {
  const box = await page.getByTestId('placed-look-body').boundingBox();
  const from = { x: box!.x + box!.width * 0.5, y: box!.y + box!.height * 0.035 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 5 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 5 });
  await page.mouse.up();
}

test('turning it on puts a frame with four corners on the artwork and lights the LEDs under it', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await expect(page.getByTestId('placed-look-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(frame(page)).toHaveCount(0);
  expect(lit(await allColours(page, ids))).toHaveLength(0);

  await turnOn(page);
  await expect(page.getByTestId('placed-look-on')).toHaveAttribute('aria-pressed', 'true');
  for (const corner of [0, 1, 2, 3]) await expect(page.getByTestId(`placed-look-corner-${corner}`)).toBeVisible();
  await expect(page.getByTestId('placed-look-picture')).toHaveAttribute('data-mode', 'rings');
  // The frame starts around every LED, in the artwork's own units.
  const start = await frameAt(page);
  expect(start.x).toBeCloseTo(300, 0);
  expect(start.halfWidth).toBeGreaterThan(130);
  expect(lit(await allColours(page, ids)).length).toBeGreaterThan(20);
  // It says what it is, and adds no filled button: Save to card stays the one.
  await expect(page.getByTestId('placed-look-session-note')).toContainText('a try-out until you save it as a look');
  await expect(page.locator('[data-testid="layout-placed-look"] .primary, [data-testid="layout-placed-look"] .cta')).toHaveCount(0);
  for (const label of ['This look moves as', 'Colours', 'Width', 'Softness', 'Repeat', 'Speed', 'Turn', 'Run the other way', 'Put it on the centre of the piece']) {
    await expect(page.getByTestId('layout-placed-look').getByText(label, { exact: true })).toBeVisible();
  }
  // Without sides there is nothing to play alike.
  await expect(page.getByTestId('placed-look-alike')).toHaveCount(0);

  // Nothing about it is written into the project.
  expect(JSON.stringify(await saved(page))).not.toContain('"placed"');
  await page.getByTestId('placed-look-off').click();
  await expect(frame(page)).toHaveCount(0);
  expect(lit(await allColours(page, ids))).toHaveLength(0);
});

test('dragging the frame moves it and the LEDs change colour; a corner sizes it; arrow keys nudge it', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await turnOn(page);
  const before = await frameAt(page);
  const coloursBefore = await allColours(page, ids);

  await dragBody(page, 70, 40);
  const moved = await frameAt(page);
  expect(moved.x).toBeGreaterThan(before.x + 10);
  expect(moved.y).toBeGreaterThan(before.y + 5);
  expect(moved.halfWidth).toBeCloseTo(before.halfWidth, 1);
  const coloursMoved = await allColours(page, ids);
  expect(coloursMoved).not.toEqual(coloursBefore);
  // LEDs the frame no longer covers are dark again.
  expect(lit(coloursMoved).length).toBeLessThan(lit(coloursBefore).length);

  const corner = await page.getByTestId('placed-look-corner-2').boundingBox();
  const grab = { x: corner!.x + corner!.width / 2, y: corner!.y + corner!.height / 2 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x - 30, grab.y - 20, { steps: 6 });
  await page.mouse.move(grab.x - 60, grab.y - 40, { steps: 6 });
  await page.mouse.up();
  const sized = await frameAt(page);
  expect(sized.halfWidth).toBeLessThan(moved.halfWidth - 5);
  expect(sized.halfHeight).toBeLessThan(moved.halfHeight - 5);
  expect(sized.x).toBeCloseTo(moved.x, 1);

  await frame(page).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  const nudged = await frameAt(page);
  expect(nudged.x).toBeLessThan(sized.x);
  expect(nudged.y).toBeLessThan(sized.y);
  // The strips themselves did not move.
  expect((await saved(page)).layout.strips.every((strip: any) => strip.x === 0 && strip.y === 0)).toBe(true);

  await page.getByTestId('placed-look-centre').click();
  const centred = await frameAt(page);
  expect(centred.x).toBeCloseTo(300, 0);
  expect(centred.y).toBeCloseTo(before.y, 0);
});

test('a sweep and rings are different pictures, and the dials change them', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await turnOn(page);
  await expect(page.getByTestId('placed-look-rings')).toHaveAttribute('aria-pressed', 'true');
  const rings = await allColours(page, ids);
  // Rings grow from the frame's centre: petals opposite each other match.
  expect(await ledColours(page, ids['Petal 1'])).toEqual(await ledColours(page, ids['Petal 4']));

  await page.getByTestId('placed-look-sweep').click();
  await expect(page.getByTestId('placed-look-sweep')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('placed-look-picture')).toHaveAttribute('data-mode', 'sweep');
  const sweep = await allColours(page, ids);
  expect(sweep).not.toEqual(rings);
  expect(lit(sweep).length).toBeGreaterThan(10);

  await page.getByTestId('placed-look-repeat').fill('5');
  const repeated = await allColours(page, ids);
  expect(repeated).not.toEqual(sweep);
  await page.getByTestId('placed-look-colours-tide').click();
  await expect(page.getByTestId('placed-look-colours-tide')).toHaveAttribute('aria-pressed', 'true');
  expect(await allColours(page, ids)).not.toEqual(repeated);
  const turnedBefore = await allColours(page, ids);
  await page.getByTestId('placed-look-turn').fill('90');
  expect(await allColours(page, ids)).not.toEqual(turnedBefore);
});

test('alike on all sides: side 2 shows exactly what side 1 shows', async ({ page }) => {
  const ids = await seedPiece(page, LOTUS);
  await page.getByTestId('layout-symmetry-6').click();
  await expect(page.getByTestId('symmetry-focus-verdict')).toContainText('6 sides line up.');
  await page.getByTestId('symmetry-focus-done').click();
  await expect.poll(async () => (await saved(page))?.layout?.symmetry?.sides?.length).toBe(6);
  const sides = (await saved(page)).layout.symmetry.sides.map((side: any) => side.stripIds[0]);
  expect(sides).toEqual([1, 2, 3, 4, 5, 6].map(n => ids[`Petal ${n}`]));

  await turnOn(page);
  // A sweep crosses the piece, so each petal sits under a different part of it.
  // One band across the frame, so side 1 (the top petal, mid-frame) is lit.
  await page.getByTestId('placed-look-sweep').click();
  await page.getByTestId('placed-look-repeat').fill('1');
  const alike = page.getByTestId('placed-look-alike');
  await expect(alike).toBeChecked();
  await expect(page.getByTestId('layout-placed-look').getByText('Play it alike on all 6 sides')).toBeVisible();
  await expect(page.getByTestId('layout-placed-look').getByText('Put it on the centre mark')).toBeVisible();
  const sideOne = await ledColours(page, sides[0]);
  expect(lit(sideOne).length).toBeGreaterThan(3);
  for (const stripId of sides.slice(1)) expect(await ledColours(page, stripId)).toEqual(sideOne);

  // Off: every light takes the colour directly under it again.
  await alike.uncheck();
  expect(await ledColours(page, sides[0])).toEqual(sideOne);
  expect(await ledColours(page, sides[1])).not.toEqual(sideOne);
  expect(await ledColours(page, sides[3])).not.toEqual(sideOne);
});

test('Save as a look records it into the project, and Save changes updates the same recording', async ({ page }) => {
  await seedPiece(page, LOTUS);
  await turnOn(page);
  const note = page.getByTestId('placed-look-record-note');
  await expect(note).toHaveAttribute('data-state', 'idle');
  await expect(note).toContainText('Nothing is sent to the card');
  const record = page.getByTestId('placed-look-record');
  await expect(record).not.toHaveClass(/primary|cta/);
  await expect(record).toHaveText('Save as a look');

  await record.click();
  await expect(note).toHaveAttribute('data-state', 'saved');
  // 7 strips x 24 lights, 24 pictures a second, 6 whole passes in 20 seconds:
  // 64 + 168 x 3 x 480 bytes.
  await expect(note).toHaveAttribute('data-bytes', String(64 + 168 * 3 * 480));
  await expect(note).toContainText('Saved as “Placed look 1” in this project\'s recordings: a 20 second loop for these 168 lights, 0.23 MB.');
  await expect(note).toContainText('add it to the Playlist');
  const recordings = async () => (await saved(page))?.devices?.standaloneController?.sequenceAssets || [];
  await expect.poll(async () => (await recordings()).map((asset: { label: string; source: { kind: string } }) => [asset.label, asset.source?.kind]))
    .toEqual([['Placed look 1', 'placed-look']]);
  const firstId = (await recordings())[0].id;

  await page.getByTestId('placed-look-width').fill('60');
  await expect(note).toHaveAttribute('data-state', 'stale');
  await expect(note).toContainText('Changed since you saved “Placed look 1”.');
  await expect(record).toHaveText('Save changes');
  // A look that does not move is one picture, saved over the same recording.
  await page.getByTestId('placed-look-speed').fill('0');
  await record.click();
  await expect(note).toHaveAttribute('data-bytes', String(64 + 168 * 3));
  await expect(note).toContainText('Updated “Placed look 1”');
  await expect(note).toContainText('does not move');
  await expect.poll(async () => (await recordings()).map((asset: { id: string; byteLength: number }) => [asset.id, asset.byteLength]))
    .toEqual([[firstId, 64 + 168 * 3]]);

  // It is one of the project's recordings: the Playlist offers it and adds it
  // as recorded playback, the path every recording takes to the card.
  await page.goto('/#screen=playlist', { waitUntil: 'domcontentloaded' });
  const library = page.getByTestId('playlist-recordings');
  await expect(library).toContainText('Placed look 1');
  await library.getByRole('button', { name: /Placed look 1/ }).click();
  await expect.poll(async () => ((await saved(page))?.devices?.standaloneController?.playlist || [])
    .find((item: { type: string }) => item.type === 'sequence'))
    .toMatchObject({ type: 'sequence', sequenceAssetId: firstId, label: 'Placed look 1' });
});

test('on a phone the frame, the dials and the record line stay inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ids = await seedPiece(page, LOTUS);
  await openSheet(page);
  await page.getByTestId('layout-symmetry-6').scrollIntoViewIfNeeded();
  await page.getByTestId('layout-symmetry-6').click();
  await page.getByTestId('symmetry-focus-done').click();
  await openSheet(page);
  await turnOn(page);
  await page.getByTestId('placed-look-record').scrollIntoViewIfNeeded();
  await page.getByTestId('placed-look-record').click();
  await expect(page.getByTestId('placed-look-record-note')).toHaveAttribute('data-state', 'saved');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const id of ['placed-look-off', 'placed-look-on', 'placed-look-sweep', 'placed-look-rings', 'placed-look-colours-moss',
    'placed-look-width', 'placed-look-turn', 'placed-look-alike', 'placed-look-centre', 'placed-look-record', 'placed-look-record-note']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.x, id).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, id).toBeLessThanOrEqual(390);
  }
  expect(lit(await allColours(page, ids)).length).toBeGreaterThan(20);
});
