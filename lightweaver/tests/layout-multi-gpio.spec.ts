import { test, expect, type Page } from '@playwright/test';

async function threeSections(page: any) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  const total = Number(await page.getByTestId('layout-total-led-count').inputValue());
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  const counts = await page.locator('[data-testid^="divide-count-"]')
    .evaluateAll((inputs: HTMLInputElement[]) => inputs.map(input => Number(input.value)));
  expect(counts.reduce((sum: number, count: number) => sum + count, 0)).toBe(total);
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  const ids = await page.locator('.la-strip-item').evaluateAll((items: HTMLElement[]) => items.map(item => item.dataset.stripId!));
  return { total, counts, ids };
}

async function expectSelectedPart(page: any, id: string) {
  const editor = page.getByTestId('connected-section-editor');
  await expect(editor).toHaveCount(1);
  await expect(editor.getByTestId('connected-child')).toHaveAttribute('data-section-id', id);
  await expect(editor.getByRole('combobox', { name: / GPIO override$/ })).toHaveCount(1);
  await expect(page.getByTestId(`strip-callout-${id}`)).toHaveAttribute('data-selected', 'true');
  return editor;
}

async function selectPart(page: any, id: string) {
  // GPIO groups reorder the list. Follow the persistent section ID, not an
  // index that may now identify another section after an output assignment.
  await page.locator(`.la-strip-item[data-strip-id="${id}"] .layer-name`).click();
  return expectSelectedPart(page, id);
}

async function assignPart(page: any, id: string, pin: number, count: number) {
  const editor = await selectPart(page, id);
  await editor.getByRole('combobox', { name: / GPIO override$/ }).selectOption(String(pin));
  await expectSelectedPart(page, id);
  await expect(editor.getByRole('combobox', { name: / GPIO override$/ })).toHaveValue(String(pin));
  await expect(editor.getByRole('spinbutton', { name: / LED count$/ })).toHaveValue(String(count));
}

async function expectAssignments(page: any, sections: any, pins: number[]) {
  await expect(page.getByTestId('layout-total-led-count')).toHaveValue(String(sections.total));
  for (const [index, pin] of pins.entries()) {
    const id = sections.ids[index];
    await expect(page.getByTestId(`gpio-group-${pin}`).locator(`.la-strip-item[data-strip-id="${id}"] .la-strip-row`)).toHaveCount(1);
    const editor = await selectPart(page, id);
    await expect(editor.getByRole('combobox', { name: / GPIO override$/ })).toHaveValue(String(pin));
    await expect(editor.getByRole('spinbutton', { name: / LED count$/ })).toHaveValue(String(sections.counts[index]));
  }
}

test('three divided sections retain selection and counts when assigned to three GPIO outputs', async ({ page }, testInfo) => {
  const sections = await threeSections(page);
  await assignPart(page, sections.ids[1], 17, sections.counts[1]);
  await assignPart(page, sections.ids[2], 18, sections.counts[2]);
  await expect(page.getByTestId('gpio-group-16').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-17').locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-18').locator('.la-strip-row')).toHaveCount(1);
  await expectAssignments(page, sections, [16, 17, 18]);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const gpio = page.getByTestId('connected-section-editor').getByRole('combobox', { name: / GPIO override$/ });
    await gpio.scrollIntoViewIfNeeded();
    await expect(gpio).toBeVisible();
    await expect(gpio).toHaveValue('18');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`multi-gpio-${width}.png`), fullPage: true });
  }

  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[16, 1], [17, 1], [18, 1]]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-gpio-group')).toHaveCount(3);
  await expectAssignments(page, sections, [16, 17, 18]);
});

test('moving the parent GPIO frees its previous port before assigning more sections', async ({ page }) => {
  const sections = await threeSections(page);
  const selectedId = await page.getByTestId('connected-child').getAttribute('data-section-id');
  await page.getByRole('combobox', { name: / shared GPIO output$/ }).selectOption('17');
  await expectSelectedPart(page, selectedId!);
  await expect(page.getByTestId('gpio-group-16')).toHaveCount(0);
  await assignPart(page, sections.ids[1], 18, sections.counts[1]);
  await assignPart(page, sections.ids[2], 21, sections.counts[2]);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[17, 1], [18, 1], [21, 1]]);
  await expectAssignments(page, sections, [17, 18, 21]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('gpio-group-16')).toHaveCount(0);
  await expectAssignments(page, sections, [17, 18, 21]);
});

test('a physical cut run can be routed to another GPIO in Advanced mapping', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await page.getByTestId('layout-specs-trigger').click();
  const advanced = page.getByTestId('advanced-installation-tools');
  await advanced.locator(':scope > summary').click();
  await advanced.locator('.lww-custom-mapping > summary').click();
  await page.getByRole('button', { name: 'Split a strip mid-wire' }).click();

  const position = await page.locator('path[data-strip-path]').first().evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() * 0.45);
    const matrix = path.getScreenCTM()!;
    return { x: point.x * matrix.a + point.y * matrix.c + matrix.e,
      y: point.x * matrix.b + point.y * matrix.d + matrix.f };
  });
  await page.mouse.click(position.x, position.y);
  const run = page.getByLabel('Physical run');
  await expect(run.locator('option')).toHaveCount(2);
  await run.selectOption({ index: 1 });
  await page.getByLabel('GPIO for selected run').selectOption('17');
  await expect(page.getByLabel('GPIO for selected run')).toHaveValue('17');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.wiring?.outputs?.map((output: any) => [output.pin, output.runIds.length]);
  })).toEqual([[16, 1], [17, 1]]);
  await page.getByLabel('GPIO for selected run').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/lw-sprint-gpio.png', fullPage: true });
});

const artwork = `
  <svg xmlns="http://www.w3.org/2000/svg" width="720mm" viewBox="0 0 720 340">
    <g id="front" data-name="Front">
      <path d="M 40 50 H 210 m 65 60 h 170" fill="none" stroke="white"/>
      <path d="M 470 170 H 665" fill="none" stroke="white"/>
    </g>
    <g id="back" data-name="Back">
      <path d="M 65 260 H 610" fill="none" stroke="white"/>
    </g>
  </svg>`;

async function mapSvg(page: Page, source = artwork) {
  // Keep the browser check self-contained when Studio looks for a local card.
  await page.route(/^http:\/\/(lightweaver\.local|192\.168\.4\.1)(?::\d+)?\//, route => route.abort());
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.setInputFiles('input[accept=".svg"]', {
    name: 'disconnects.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(source),
  });
  await page.getByTestId('artwork-create-all-strips').click();
}

function stripPath(page: Page, name: string) {
  return page.getByRole('button', { name: `Select ${name} strip`, exact: true });
}

async function clickPath(page: Page, name: string) {
  const point = await stripPath(page, name).evaluate((element: SVGPathElement) => {
    const midpoint = element.getPointAtLength(element.getTotalLength() * 0.5);
    const { x, y } = new DOMPoint(midpoint.x, midpoint.y).matrixTransform(element.getScreenCTM()!);
    return { x, y };
  });
  await page.mouse.click(point.x, point.y);
  const selected = page.locator('.la-strip-row.sel');
  await expect(selected).toHaveCount(1);
  await expect(selected.locator('.layer-name')).toHaveText(name);
}

async function stripId(page: Page, name: string) {
  const id = await stripPath(page, name).getAttribute('data-strip-path');
  if (!id) throw new Error(`No strip ID for ${name}`);
  return id;
}

async function wirePairs(page: Page) {
  return page.locator('[data-svg-jumper]').evaluateAll(wires => wires.map(wire => [
    wire.getAttribute('data-from-strip-id'),
    wire.getAttribute('data-to-strip-id'),
  ]));
}

async function dots(page: Page, id: string) {
  return page.locator(`[data-testid^="strip-led-${id}-"] circle:first-child`).evaluateAll(
    (circles: SVGCircleElement[]) => circles.map(circle => [circle.cx.baseVal.value, circle.cy.baseVal.value]),
  );
}

async function savedWires(page: Page) {
  return page.evaluate(() => {
    const { wiring } = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout || {};
    return wiring?.outputs?.map((output: { pin: number, runIds: string[] }) => ({
      pin: output.pin,
      strips: output.runIds.map(id => wiring.runs.find(run => run.id === id)?.source?.stripId),
    }));
  });
}

test('maps disconnected SVG shapes to one GPIO per layer and edits their physical order on canvas', async ({ page }) => {
  await mapSvg(page);
  await expect(page.locator('path[data-strip-path]')).toHaveCount(4, { timeout: 4000 });
  const names = ['Front · Path 1', 'Front · Path 2', 'Front · Path 3', 'Back'];
  const ids = await Promise.all(names.map(name => stripId(page, name)));
  const [a, b, c, d] = ids;
  await expect.poll(() => savedWires(page)).toEqual([
    { pin: 16, strips: [a, b, c] },
    { pin: 17, strips: [d] },
  ]);
  await expect.poll(() => wirePairs(page)).toEqual([[a, b], [b, c]]);
  const jumper = page.locator('[data-svg-jumper]').first();
  await expect(jumper).toBeVisible();
  expect(await jumper.evaluate(line => {
    const style = getComputedStyle(line);
    return parseFloat(style.strokeWidth) <= 1 && parseFloat(style.strokeOpacity) * parseFloat(style.opacity) < 0.6;
  })).toBe(true);

  // The second path starts with a relative move inside a compound path. Its
  // LEDs should still land on the authored segment at 275…445, y = 110.
  const before = await Promise.all(ids.map(id => dots(page, id)));
  const bounds = [[40, 210, 50], [275, 445, 110], [470, 665, 170], [65, 610, 260]];
  for (const [index, stripDots] of before.entries()) {
    const [min, max, y] = bounds[index];
    expect(stripDots.length).toBeGreaterThan(1);
    for (const [x, dotY] of stripDots) {
      expect(x).toBeGreaterThanOrEqual(min - 0.01);
      expect(x).toBeLessThanOrEqual(max + 0.01);
      expect(dotY).toBeCloseTo(y, 2);
    }
    await clickPath(page, names[index]);
  }

  await clickPath(page, names[0]);
  await page.getByRole('button', { name: `${names[0]} OUT`, exact: true }).click();
  await page.getByRole('button', { name: `${names[2]} IN`, exact: true }).click();
  await expect.poll(() => wirePairs(page)).toEqual([[a, c], [c, b]]);
  const reordered = [{ pin: 16, strips: [a, c, b] }, { pin: 17, strips: [d] }];
  await expect.poll(() => savedWires(page)).toEqual(reordered);

  const upstream = page.locator(`[data-svg-jumper][data-from-strip-id="${a}"][data-to-strip-id="${c}"]`);
  const downstream = page.locator(`[data-svg-jumper][data-from-strip-id="${c}"][data-to-strip-id="${b}"]`);
  const ends = () => Promise.all([upstream.getAttribute('x2'), downstream.getAttribute('x1')]);
  const [firstX, lastX] = await ends();
  expect(firstX).not.toBe(lastX);
  const flip = page.getByRole('button', { name: `Flip ${names[2]} direction`, exact: true });
  await flip.click();
  await expect.poll(ends).toEqual([lastX, firstX]);
  expect(await Promise.all(ids.map(id => dots(page, id)))).toEqual(before);
  await expect.poll(() => savedWires(page)).toEqual(reordered);

  // Rebuild the same output package Studio sends to the card from autosave.
  // A jumper must consume no addresses, while Flip reverses one segment.
  const runtimeOutputs = () => page.evaluate(async () => {
    const moduleUrl = '/src/lib/cardRuntimeProject.js';
    const { buildCardRuntimePackageFromProject } = await import(moduleUrl);
    const { layout } = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return buildCardRuntimePackageFromProject(layout).config.led.outputs;
  });
  const [aCount, bCount, cCount, dCount] = before.map(stripDots => stripDots.length);
  await expect.poll(runtimeOutputs).toMatchObject([
    { pin: 16, pixels: aCount + cCount + bCount, segments: [
      { count: aCount, direction: 'forward' },
      { count: cCount, direction: 'reverse' },
      { count: bCount, direction: 'forward' },
    ] },
    { pin: 17, pixels: dCount, segments: [{ count: dCount, direction: 'forward' }] },
  ]);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(ends).toEqual([firstX, lastX]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wirePairs(page)).toEqual([[a, b], [b, c]]);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => savedWires(page)).toEqual(reordered);
  await expect.poll(runtimeOutputs).toMatchObject([{
    segments: [
      { count: aCount, direction: 'forward' },
      { count: cCount, direction: 'reverse' },
      { count: bCount, direction: 'forward' },
    ],
  }, { pin: 17 }]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => wirePairs(page)).toEqual([[a, c], [c, b]]);
  await expect.poll(ends).toEqual([lastX, firstX]);
});

for (const [layerName, pin] of [['GPIO 18', 18], ['Front', 16]] as const) {
  test(`keeps the shapes of SVG layer ${layerName} together through nested groups`, async ({ page }) => {
    await mapSvg(page, `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260">
        <g id="output" data-name="${layerName}">
          <g id="first"><path d="M 60 65 H 270"/></g>
          <g id="second"><path d="M 330 125 H 540"/></g>
        </g>
      </svg>`);
    await expect(page.locator('path[data-strip-path]')).toHaveCount(2);
    const a = await stripId(page, `${layerName} · Path 1`);
    const b = await stripId(page, `${layerName} · Path 2`);
    await expect.poll(() => savedWires(page)).toEqual([{ pin, strips: [a, b] }]);
    await expect.poll(() => wirePairs(page)).toEqual([[a, b]]);

    await page.getByRole('button', { name: `Change pin for ${layerName} · Path 2`, exact: true }).click();
    await page.getByRole('combobox', { name: 'GPIO output', exact: true }).selectOption('17');
    await expect.poll(() => savedWires(page)).toEqual([{ pin: 17, strips: [a, b] }]);
    await expect.poll(() => wirePairs(page)).toEqual([[a, b]]);
  });
}

test('maps ungrouped SVG shapes to separate strips on a single GPIO', async ({ page }) => {
  await mapSvg(page, `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260">
      <path d="M 60 65 H 270"/>
      <path d="M 330 125 H 540"/>
    </svg>`);
  await expect(page.locator('path[data-strip-path]')).toHaveCount(2);
  const a = await stripId(page, 'Layer 1 · Path 1');
  const b = await stripId(page, 'Layer 1 · Path 2');
  await expect.poll(() => savedWires(page)).toEqual([{ pin: 16, strips: [a, b] }]);
  await expect.poll(() => wirePairs(page)).toEqual([[a, b]]);
});

test('keeps the physical route and canvas connections when dividing a flipped SVG strip', async ({ page }) => {
  await mapSvg(page);
  const names = ['Front · Path 1', 'Front · Path 2', 'Front · Path 3', 'Back'];
  const [first, middle, last, back] = await Promise.all(names.map(name => stripId(page, name)));
  const originalDots = await dots(page, middle);
  await page.getByRole('button', { name: 'Flip Front · Path 2 direction', exact: true }).click();
  await page.getByTestId(`divide-toggle-${middle}`).click();
  await page.getByTestId(`divide-sections-${middle}`).fill('2');
  await page.getByTestId(`divide-commit-${middle}`).click();
  await expect(page.locator('path[data-strip-path]')).toHaveCount(5);
  const ids = await page.locator('path[data-strip-path]').evaluateAll(paths => paths.map(path => path.getAttribute('data-strip-path')));
  const secondPiece = ids.find(id => id && ![first, middle, last, back].includes(id));
  if (!secondPiece) throw new Error('The second SVG section was not created');
  await expect.poll(() => savedWires(page)).toEqual([
    { pin: 16, strips: [first, middle, secondPiece, last] },
    { pin: 17, strips: [back] },
  ]);
  await expect.poll(() => wirePairs(page)).toEqual([[first, middle], [middle, secondPiece], [secondPiece, last]]);
  const enterMiddle = page.locator(`[data-svg-jumper][data-to-strip-id="${middle}"]`);
  const leaveSecond = page.locator(`[data-svg-jumper][data-from-strip-id="${secondPiece}"]`);
  await expect(enterMiddle).toHaveAttribute('x2', '445');
  await expect(leaveSecond).toHaveAttribute('x1', '275');
  const dividedDots = async () => [...await dots(page, middle), ...await dots(page, secondPiece)]
    .sort(([a], [b]) => a - b);
  expect(await dividedDots()).toEqual(originalDots);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(dividedDots).toEqual(originalDots);
  await expect.poll(() => wirePairs(page)).toEqual([[first, middle], [middle, secondPiece], [secondPiece, last]]);
  await page.setViewportSize({ width: 390, height: 844 });
  const previousOut = await page.locator(`[data-svg-wire-port="out"][data-strip-id="${middle}"] rect`).boundingBox();
  const nextIn = await page.locator(`[data-svg-wire-port="in"][data-strip-id="${secondPiece}"] rect`).boundingBox();
  if (!previousOut || !nextIn) throw new Error('Both divided-section endpoints must remain visible');
  const overlapWidth = Math.min(previousOut.x + previousOut.width, nextIn.x + nextIn.width) - Math.max(previousOut.x, nextIn.x);
  const overlapHeight = Math.min(previousOut.y + previousOut.height, nextIn.y + nextIn.height) - Math.max(previousOut.y, nextIn.y);
  expect(Math.min(overlapWidth, overlapHeight)).toBeLessThanOrEqual(0);
  await page.locator(`[data-svg-wire-port="out"][data-strip-id="${first}"] rect`).click();
  await page.locator(`[data-svg-wire-port="in"][data-strip-id="${secondPiece}"] rect`).click();
  await expect.poll(() => wirePairs(page)).toEqual([[first, secondPiece], [secondPiece, middle], [middle, last]]);
});
