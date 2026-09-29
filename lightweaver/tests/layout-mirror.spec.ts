import { test, expect } from '@playwright/test';

// Mirror sets from the Layout inspector: select a strip, More actions,
// "Mirror with…", tick the strips that should play as its mirror image.
// Ticking applies at once (the canvas preview follows); Done only closes.
// The piece here is drawn around a centre, so the geometry can say which
// strip is the reflection ("Likely match") and whether it runs the wrong way
// ("Flip to match").

type StripDef = { name: string; d: string; kaleidoscope?: boolean };

const saved = (page: any) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null'));
const savedSets = async (page: any) => (await saved(page))?.layout?.mirrorSets || [];

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

async function selectStrip(page: any, id: string) {
  await row(page, id).locator('.la-strip-row .layer-name').click();
  await expect(row(page, id)).toHaveClass(/is-editing/);
}

async function openMirrorWith(page: any, id: string) {
  await selectStrip(page, id);
  await row(page, id).locator('.la-strip-menu > summary').click();
  await page.getByTestId(`mirror-with-${id}`).click();
  await expect(page.getByTestId('mirror-checklist')).toBeVisible();
}

// Centre of the piece is (300, 200). Wings are drawn from the centre outward.
const LEFT = 'M 285 200 L 165 120';
const RIGHT = 'M 315 200 L 435 120';
const RIGHT_BACKWARDS = 'M 435 120 L 315 200';
const LOWER_LEFT = 'M 285 215 L 165 295';
const LOWER_RIGHT = 'M 315 215 L 435 295';
const STRAY = 'M 140 340 L 190 360';

test('a 2-way mirror takes three clicks, marks both rows, and plays live on the canvas', async ({ page }) => {
  const ids = await seedPiece(page, [
    { name: 'Left wing', d: LEFT },
    { name: 'Stray', d: STRAY },
    { name: 'Right wing', d: RIGHT },
  ]);
  // Light the preview: "Directed glow" switches the canvas out of plain dots.
  await page.getByTitle('Light glow options').click();
  await page.getByRole('menu').getByRole('button', { name: /Directed glow/ }).click();
  await page.locator('.la-light-pop-backdrop').click();
  await expect(page.locator('.la-light-wrap .tb-btn').first()).toHaveClass(/\bactive\b/);
  const ledFills = (id: string) => page.evaluate((stripId: string) => Array.from({ length: 24 }, (_, index) =>
    document.querySelector(`[data-testid="strip-led-${stripId}-${index}"] circle`)?.getAttribute('fill')), id);
  const readPair = () => page.evaluate(([a, b]: string[]) => [a, b].map(stripId => Array.from({ length: 24 }, (_, index) =>
    document.querySelector(`[data-testid="strip-led-${stripId}-${index}"] circle`)?.getAttribute('fill'))), [ids['Left wing'], ids['Right wing']]);
  await expect.poll(async () => (await ledFills(ids['Left wing'])).every(Boolean)).toBe(true);
  const [leftBefore, rightBefore] = await readPair();
  expect(rightBefore).not.toEqual(leftBefore);

  // Click 1: More actions. Click 2: Mirror with…. Click 3: the Right wing row.
  await openMirrorWith(page, ids['Left wing']);
  const options = page.locator('[data-testid^="mirror-option-"]');
  await expect(options.first()).toHaveAttribute('data-testid', `mirror-option-${ids['Right wing']}`);
  await expect(options.first()).toContainText('Likely match');
  await expect(options.first()).toContainText('24 LEDs');
  await expect(page.getByTestId(`mirror-option-${ids.Stray}`)).not.toContainText('Likely match');
  // Pointing at a row lights that strip on the canvas, so partners are picked by eye.
  await page.getByTestId(`mirror-option-${ids.Stray}`).hover();
  await expect(page.getByTestId(`mirror-echo-${ids.Stray}`)).toHaveAttribute('data-focused', 'true');
  await page.getByTestId(`mirror-option-${ids['Right wing']}`).hover();
  await expect(page.getByTestId(`mirror-echo-${ids.Stray}`)).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Mirror with Right wing' }).check();

  // Live: no apply step. The set is saved and the twin copies the lead.
  await expect.poll(() => savedSets(page)).toEqual([
    { id: 'mirror-1', name: '', members: [ids['Left wing'], ids['Right wing']] },
  ]);
  await expect.poll(async () => {
    const [left, right] = await readPair();
    return JSON.stringify(left) === JSON.stringify(right);
  }).toBe(true);
  await expect(page.getByTestId(`mirror-echo-${ids['Right wing']}`)).toHaveCount(1);
  await expect(page.getByTestId(`mirror-echo-${ids.Stray}`)).toHaveCount(0);

  await page.getByTestId('mirror-done').click();
  await expect(page.getByTestId('mirror-checklist')).toHaveCount(0);
  await expect(page.getByTestId(`mirror-line-${ids['Left wing']}`)).toHaveText('Mirrors:Right wing');
  await expect(page.getByTestId(`mirror-line-${ids['Right wing']}`)).toHaveText('Mirrors:Left wing');
  await expect(page.getByTestId(`mirror-line-${ids.Stray}`)).toHaveCount(0);

  // The line reopens the checklist from the partner's row.
  await page.getByTestId(`mirror-line-${ids['Right wing']}`).click();
  await expect(row(page, ids['Right wing'])).toHaveClass(/is-editing/);
  await expect(page.getByRole('checkbox', { name: 'Mirror with Left wing' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mirror-checklist')).toHaveCount(0);

  // Undo takes the mirror away again.
  await page.getByTitle(/Undo/).first().click();
  await expect.poll(() => savedSets(page)).toEqual([]);
  await expect(page.locator('.la-mirror-line')).toHaveCount(0);
});

test('a 4-way mirror can be renamed, and Undo walks it back', async ({ page }) => {
  const ids = await seedPiece(page, [
    { name: 'Upper left', d: LEFT },
    { name: 'Upper right', d: RIGHT },
    { name: 'Lower left', d: LOWER_LEFT },
    { name: 'Lower right', d: LOWER_RIGHT },
  ]);
  await openMirrorWith(page, ids['Upper left']);
  const likely = page.locator('[data-testid^="mirror-option-"][data-likely="true"]');
  await expect(likely).toHaveCount(3);
  for (const name of ['Upper right', 'Lower left', 'Lower right']) {
    await page.getByRole('checkbox', { name: `Mirror with ${name}` }).check();
  }
  await expect.poll(async () => (await savedSets(page))[0]?.members?.length).toBe(4);

  const nameField = page.getByTestId('mirror-set-name');
  await expect(nameField).toHaveAttribute('placeholder', 'Upper left and 3 more');
  await nameField.fill('Four arms');
  await nameField.press('Enter');
  await expect.poll(async () => (await savedSets(page))[0]?.name).toBe('Four arms');
  await page.getByTestId('mirror-done').click();
  await expect(page.getByTestId(`mirror-line-${ids['Lower right']}`)).toContainText('Upper left, Upper right, Lower left');

  await page.getByTitle(/Undo/).first().click();
  await expect.poll(async () => (await savedSets(page))[0]?.name).toBe('');
  await page.getByTitle(/Undo/).first().click();
  await expect.poll(async () => (await savedSets(page))[0]?.members?.length).toBe(3);

  // Stop mirroring dissolves the whole set in one step.
  await openMirrorWith(page, ids['Upper left']);
  await page.getByTestId('mirror-stop').click();
  await expect.poll(() => savedSets(page)).toEqual([]);
  await expect(page.getByTestId('mirror-checklist')).toHaveCount(0);
});

test('removing a member shrinks its set, and a set of one dissolves', async ({ page }) => {
  const ids = await seedPiece(page, [
    { name: 'Upper left', d: LEFT },
    { name: 'Upper right', d: RIGHT },
    { name: 'Lower left', d: LOWER_LEFT },
  ]);
  await openMirrorWith(page, ids['Upper left']);
  await page.getByRole('checkbox', { name: 'Mirror with Upper right' }).check();
  await page.getByRole('checkbox', { name: 'Mirror with Lower left' }).check();
  await page.getByTestId('mirror-done').click();
  await expect.poll(async () => (await savedSets(page))[0]?.members?.length).toBe(3);

  await selectStrip(page, ids['Lower left']);
  await row(page, ids['Lower left']).locator('.la-strip-menu > summary').click();
  await row(page, ids['Lower left']).getByRole('button', { name: 'Remove strip' }).click();
  await expect.poll(() => savedSets(page)).toEqual([
    { id: 'mirror-1', name: '', members: [ids['Upper left'], ids['Upper right']] },
  ]);
  await expect(page.getByTestId(`mirror-line-${ids['Upper left']}`)).toHaveText('Mirrors:Upper right');

  await selectStrip(page, ids['Upper right']);
  await row(page, ids['Upper right']).locator('.la-strip-menu > summary').click();
  await row(page, ids['Upper right']).getByRole('button', { name: 'Remove strip' }).click();
  await expect.poll(() => savedSets(page)).toEqual([]);
  await expect(page.locator('.la-mirror-line')).toHaveCount(0);
});

test('rows that cannot mirror are disabled and say why', async ({ page }) => {
  const ids = await seedPiece(page, [
    { name: 'Left wing', d: LEFT },
    { name: 'Right wing', d: RIGHT },
    { name: 'Halo', d: STRAY, kaleidoscope: true },
    { name: 'Tail one', d: LOWER_LEFT },
    { name: 'Tail two', d: LOWER_RIGHT },
  ]);
  // Group the two tails as one layer group.
  await selectStrip(page, ids['Tail one']);
  await row(page, ids['Tail two']).locator('.la-strip-row .layer-name').click({ modifiers: ['Shift'] });
  await page.getByTitle(/Organize selected strips as one expandable group/).click();
  await expect.poll(async () => (await saved(page))?.layout?.layerGroups?.length).toBe(1);

  await openMirrorWith(page, ids['Left wing']);
  const halo = page.getByRole('checkbox', { name: 'Mirror with Halo' });
  await expect(halo).toBeDisabled();
  await expect(page.getByTestId(`mirror-option-${ids.Halo}`)).toContainText('Uses reflection points');
  for (const name of ['Tail one', 'Tail two']) {
    await expect(page.getByRole('checkbox', { name: `Mirror with ${name}` })).toBeDisabled();
    await expect(page.getByTestId(`mirror-option-${ids[name]}`)).toContainText('Ungroup it first');
  }
  await expect(page.getByRole('checkbox', { name: 'Mirror with Right wing' })).toBeEnabled();

  // The blocked strip cannot start a mirror either.
  await page.getByTestId('mirror-done').click();
  await selectStrip(page, ids.Halo);
  await row(page, ids.Halo).locator('.la-strip-menu > summary').click();
  await expect(page.getByTestId(`mirror-with-${ids.Halo}`)).toBeDisabled();
  await expect(page.getByTestId(`mirror-with-${ids.Halo}`)).toHaveAttribute('title', 'Uses reflection points');
});

test('a partner drawn the other way offers Flip to match, which flips it', async ({ page }) => {
  const ids = await seedPiece(page, [
    { name: 'Left wing', d: LEFT },
    { name: 'Right wing', d: RIGHT_BACKWARDS },
  ]);
  await openMirrorWith(page, ids['Left wing']);
  const flip = page.getByTestId(`mirror-flip-${ids['Right wing']}`);
  await expect(flip).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Mirror with Right wing' }).check();
  await expect(flip).toBeVisible();
  await flip.click();
  await expect.poll(async () => (await saved(page))?.layout?.strips?.find((strip: any) => strip.id === ids['Right wing'])?.reversed).toBe(true);
  await expect(flip).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Mirror with Right wing' })).toBeChecked();
});

test('the checklist fits a 300px desktop inspector and a 390px phone', async ({ page }) => {
  const shoot = async (label: string) => {
    const ids = await seedPiece(page, [
      { name: 'Left wing', d: LEFT },
      { name: 'Right wing with a long descriptive name', d: RIGHT_BACKWARDS },
      { name: 'Halo', d: STRAY, kaleidoscope: true },
      { name: 'Lower left', d: LOWER_LEFT },
    ]);
    await openMirrorWith(page, ids['Left wing']);
    await page.getByTestId('mirror-checklist').screenshot({ path: `test-results/layout-mirror-checklist-open-${label}.png` });
    await page.getByRole('checkbox', { name: 'Mirror with Right wing with a long descriptive name' }).check();
    await page.getByRole('checkbox', { name: 'Mirror with Lower left' }).check();
    const panel = page.getByTestId('mirror-checklist');
    await panel.scrollIntoViewIfNeeded();
    const metrics = await page.evaluate(() => {
      const panelEl = document.querySelector('[data-testid="mirror-checklist"]') as HTMLElement;
      const inspector = panelEl.closest('.la-strip-inspector') as HTMLElement;
      const overflowing = Array.from(panelEl.querySelectorAll('*')).filter(el => {
        const box = (el as HTMLElement).getBoundingClientRect();
        const outer = panelEl.getBoundingClientRect();
        return box.width > 0 && (box.right > outer.right + 1 || box.left < outer.left - 1);
      }).map(el => el.className || el.tagName);
      return {
        inspectorWidth: Math.round(inspector.getBoundingClientRect().width),
        panelHeight: Math.round(panelEl.getBoundingClientRect().height),
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        overflowing,
      };
    });
    expect(metrics.overflowing).toEqual([]);
    expect(metrics.pageOverflow).toBe(false);
    await panel.screenshot({ path: `test-results/layout-mirror-checklist-${label}.png` });
    await page.screenshot({ path: `test-results/layout-mirror-viewport-${label}.png` });
    const echo = await page.getByTestId(`mirror-echo-${ids['Lower left']}`).boundingBox();
    if (echo) {
      await page.screenshot({ path: `test-results/layout-mirror-echo-${label}.png`,
        clip: { x: Math.max(0, echo.x - 40), y: Math.max(0, echo.y - 40), width: echo.width + 80, height: echo.height + 80 } });
    }
    return metrics;
  };
  await page.setViewportSize({ width: 1280, height: 860 });
  const desktop = await shoot('desktop');
  expect(desktop.inspectorWidth).toBeLessThanOrEqual(330);
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await shoot('phone');
  expect(phone.inspectorWidth).toBeLessThanOrEqual(390);
  console.log(JSON.stringify({ desktop, phone }));
});
