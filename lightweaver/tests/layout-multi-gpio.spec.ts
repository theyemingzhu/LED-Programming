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
      <path d="M 40 50 H 210 m 65 60 h 170" fill="none" stroke="red"/>
      <path d="M 470 170 H 665" fill="none" stroke="red"/>
    </g>
    <g id="back" data-name="Back">
      <path d="M 65 260 H 610" fill="none" stroke="blue"/>
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

test('Wire tracer follows reordered joins and a flipped closed path, then stops at the end', async ({ page }, testInfo) => {
  await mapSvg(page, `<svg xmlns="http://www.w3.org/2000/svg" width="800mm" viewBox="0 0 800 420">
    <g id="front" data-name="Front" stroke="red" fill="none">
      <path d="M 50 65 H 150"/><path d="M 80 135 H 190"/>
      <path d="M 320 130 H 420 V 200 H 320 Z"/>
    </g>
    <g id="back" data-name="Back" stroke="blue" fill="none">
      <path d="M 120 300 H 340"/>
    </g>
  </svg>`);
  const names = ['Front · Path 1', 'Front · Path 2', 'Front · Path 3', 'Back'];
  const [lead, end, loop, back] = await Promise.all(names.map(name => stripId(page, name)));
  await clickPath(page, names[0]);
  await page.getByRole('button', { name: `${names[0]} OUT`, exact: true }).click();
  await page.getByRole('button', { name: `${names[2]} IN`, exact: true }).click();
  await expect.poll(() => wirePairs(page)).toEqual([[lead, loop], [loop, end]]);
  await page.getByRole('button', { name: `Flip ${names[2]} direction`, exact: true }).click();
  const [leadDots, endDots, loopDots, backDots] = await Promise.all([lead, end, loop, back].map(id => dots(page, id)));
  const expected = [
    ...leadDots.map(point => ({ id: lead, point })),
    ...loopDots.slice().reverse().map(point => ({ id: loop, point })),
    ...endDots.map(point => ({ id: end, point })),
    ...backDots.map(point => ({ id: back, point })),
  ];
  expect(loopDots.length).toBeGreaterThan(2);

  await page.evaluate(() => {
    const log = [];
    (window as any).__wireTraceLog = log;
    const observer = new MutationObserver(() => {
      const head = document.querySelector<SVGCircleElement>('[data-testid="wire-tracer-head"]');
      if (!head) return;
      const index = Number(head.dataset.address);
      if (log.at(-1)?.index === index) return;
      log.push({ index, id: head.dataset.stripId, point: [head.cx.baseVal.value, head.cy.baseVal.value] });
    });
    observer.observe(document.querySelector('.lw-viewport svg')!, { attributes: true, childList: true, subtree: true });
  });
  const traceLog = () => page.evaluate(() => (window as any).__wireTraceLog as Array<{
    index: number, id: string, point: [number, number],
  }>);
  const tracer = page.getByTestId('wire-tracer-head');
  const traceWire = page.getByRole('button', { name: 'Trace wire', exact: true });
  await traceWire.click();
  await expect(tracer).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop tracer', exact: true })).toBeVisible();
  await expect(traceWire).toBeVisible();
  await expect(tracer).toHaveCount(0);

  const visited = await traceLog();
  expect(visited[0]?.index).toBe(0);
  expect(visited.at(-1)?.index).toBe(expected.length - 1);
  expect([...new Set(visited.map(sample => sample.id))]).toEqual([lead, loop, end, back]);
  for (const [position, sample] of visited.entries()) {
    if (position > 0) expect(sample.index).toBeGreaterThan(visited[position - 1].index);
    const { id, point } = expected[sample.index];
    expect(sample.id).toBe(id);
    expect(sample.point[0]).toBeCloseTo(point[0], 3);
    expect(sample.point[1]).toBeCloseTo(point[1], 3);
  }
  expect(await dots(page, loop)).toEqual(loopDots);
  await expect.poll(() => wirePairs(page)).toEqual([[lead, loop], [loop, end]]);

  await clickPath(page, names[2]);
  const traceSelected = page.getByRole('button', { name: 'Trace from selection', exact: true });
  await page.evaluate(() => { (window as any).__wireTraceLog.length = 0; });
  await traceSelected.click();
  await expect(tracer).toBeVisible();
  await expect(traceSelected).toBeVisible();
  const selected = await traceLog();
  expect(selected[0]).toMatchObject({ id: loop, index: leadDots.length });
  expect(selected.at(-1)).toMatchObject({ id: end, index: leadDots.length + loopDots.length + endDots.length - 1 });
  expect([...new Set(selected.map(sample => sample.id))]).toEqual([loop, end]);

  // Keep the selected run in view while capturing it and exercising Stop.
  // The two traces above already prove the real-time movement and completion.
  const time = Date.now();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1000);
  await traceSelected.click();
  await page.clock.runFor(300);
  await expect(tracer).toBeVisible();
  await expect(tracer).toHaveAttribute('data-strip-id', loop);
  await page.screenshot({ path: testInfo.outputPath('wire-tracer.png') });
  await page.getByRole('button', { name: 'Stop tracer', exact: true }).click();
  await expect(tracer).toHaveCount(0);
  await expect(traceWire).toBeVisible();
});

test('imports SVG layers onto GPIOs and reorders or flips the runs', async ({ page }) => {
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

  const row = (id: string) => page.locator(`.la-strip-item[data-strip-id="${id}"] .la-strip-row`);
  await row(b).dragTo(row(a), { targetPosition: { x: 20, y: 2 } });
  await expect.poll(() => savedWires(page)).toEqual([
    { pin: 16, strips: [b, a, c] },
    { pin: 17, strips: [d] },
  ]);
});

test('keeps authored layers separate and matches colors on loose SVG lines', async ({ page }) => {
  await mapSvg(page, `
    <svg xmlns="http://www.w3.org/2000/svg" width="600mm" viewBox="0 0 600 300">
      <line x1="40" y1="35" x2="540" y2="35" stroke="#00f"/>
      <g id="front" data-name="Front">
        <path d="M 40 90 H 540" stroke="red" fill="none"/>
        <path d="M 40 145 H 540" stroke="green" fill="none"/>
      </g>
      <g id="back" data-name="Back">
        <path d="M 40 200 H 540" style="stroke: rgb(255, 0, 0); fill: none"/>
      </g>
      <path d="M 40 255 H 540" style="stroke: blue; fill: none"/>
    </svg>`);
  await expect(page.locator('path[data-strip-path]')).toHaveCount(5);
  const stripsByY = await page.locator('path[data-strip-path]').evaluateAll((paths: SVGPathElement[]) =>
    Object.fromEntries(paths.map(path => [path.getBBox().y, path.dataset.stripPath])));
  const routes = [
    { pin: 16, strips: [stripsByY[35], stripsByY[255]] },
    { pin: 17, strips: [stripsByY[90], stripsByY[145]] },
    { pin: 18, strips: [stripsByY[200]] },
  ];
  await expect.poll(() => savedWires(page)).toEqual(routes);
  for (const { pin, strips } of routes) {
    const rows = page.getByTestId(`gpio-group-${pin}`).locator('.la-strip-item');
    await expect(rows).toHaveCount(strips.length);
    expect(await rows.evaluateAll(items => items.map(item => item.getAttribute('data-strip-id')))).toEqual(strips);
  }
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

const effectArtwork = `<svg xmlns="http://www.w3.org/2000/svg" width="600mm" viewBox="0 0 600 360">
  <g id="front" data-name="Front" stroke="red" fill="none">
    <path d="M 40 40 H 540"/><path d="M 40 100 H 540"/><path d="M 40 160 H 540"/>
  </g>
  <g id="back" data-name="Back" stroke="blue" fill="none">
    <path d="M 40 220 H 540"/><path d="M 40 280 H 540"/>
  </g>
</svg>`;

test('one group pattern follows its own order across GPIOs while the wire order stays fixed', async ({ page }, testInfo) => {
  await mapSvg(page, effectArtwork);
  await expect(page.getByRole('tab', { name: 'Wire' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('gpio-group-16').locator('.la-strip-row')).toHaveCount(3);
  await expect(page.getByTestId('gpio-group-17').locator('.la-strip-row')).toHaveCount(2);
  await expect(page.locator('[data-svg-wire-port]').first()).toBeVisible();
  await expect(page.locator('[data-svg-jumper]').first()).toBeVisible();
  await expect(page.getByTestId('symmetry-offer-keep')).toBeVisible();

  const savedWiring = () => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.wiring);
  await expect.poll(async () => (await savedWiring())?.outputs?.length).toBe(2);
  const wiringBefore = await savedWiring();
  await page.getByRole('tab', { name: 'Group' }).click();
  await expect(page.locator('[data-svg-wire-port], [data-svg-jumper]')).toHaveCount(0);
  await expect(page.getByTestId('symmetry-offer-keep')).toHaveCount(0);
  const lines = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const group = (name: string) => page.getByRole('region', { name, exact: true });
  const members = (name: string) => group(name).getByTestId('layout-effect-member');
  const petalNames = members('Petals').locator('.la-effect-member');
  const selectOnly = async (names: string[]) => {
    for (const name of ['Front · Path 1', 'Front · Path 2', 'Front · Path 3', 'Back · Path 1', 'Back · Path 2']) {
      await lines(name).setChecked(names.includes(name));
    }
  };
  const create = async (name: string, stripNames: string[]) => {
    await selectOnly(stripNames);
    await page.getByRole('textbox', { name: 'Effect group name' }).fill(name);
    await page.getByRole('button', { name: 'Create group' }).click();
    await expect(members(name)).toHaveCount(stripNames.length);
  };
  const changePattern = async (groupName: string, patternName: string) => {
    await group(groupName).getByRole('button', { name: `Change pattern for group ${groupName}` }).click();
    const gallery = page.getByRole('dialog', { name: `Choose pattern for ${groupName}` });
    await gallery.getByRole('button', { name: patternName, exact: true }).click();
    await expect(gallery.getByRole('button', { name: patternName, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await gallery.getByRole('button', { name: 'Close pattern gallery' }).click();
  };

  await create('Petals', ['Front · Path 1', 'Back · Path 1']);
  await changePattern('Petals', 'Fire');
  await create('Orbit', ['Front · Path 2', 'Back · Path 2']);
  await changePattern('Orbit', 'Ocean');
  await selectOnly(['Front · Path 3']);
  await group('Petals').getByRole('button', { name: 'Add selected lines to Petals' }).click();
  await expect(petalNames).toHaveText(['Front · Path 1', 'Back · Path 1', 'Front · Path 3']);
  await group('Petals').getByRole('button', { name: 'Reorder Back · Path 1' })
    .dragTo(members('Petals').first(), { targetPosition: { x: 12, y: 2 } });
  await expect(petalNames).toHaveText(['Back · Path 1', 'Front · Path 1', 'Front · Path 3']);
  await group('Petals').getByRole('button', { name: 'Reorder Front · Path 3' }).press('Home');
  await expect(petalNames).toHaveText(['Front · Path 3', 'Back · Path 1', 'Front · Path 1']);
  await expect(page.getByTestId('first-led-marker')).toHaveCount(0);

  const petalId = await group('Petals').getAttribute('data-group-id');
  const petalTarget = group('Petals').getByRole('button', { name: 'Change pattern for group Petals' });
  await expect(petalTarget).toHaveAttribute('data-target-id', petalId!);
  await expect(petalTarget).toContainText('Fire');
  const readRuntime = () => page.evaluate(async () => {
    const moduleUrl = '/src/lib/cardRuntimeProject.js';
    const compilerUrl = '/src/lib/wiringCompiler.js';
    const { buildCardRuntimePackageFromProject } = await import(moduleUrl);
    const { compileWiring } = await import(compilerUrl);
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    const runtime = buildCardRuntimePackageFromProject(project.layout);
    const compiled = compileWiring({ ...project.layout, groups: project.layout.layerGroups });
    const physicalNames = new Map(project.layout.strips.map(strip => [strip.id, strip.name]));
    return runtime.config.zones.map(zone => ({
      id: zone.id,
      label: zone.label,
      continuous: zone.continuous,
      pattern: zone.patternId,
      order: zone.ranges.map(range => physicalNames.get(compiled.pixels[range.start].stripId)),
    }));
  });
  await expect.poll(readRuntime).toEqual(expect.arrayContaining([
    { id: petalId, label: 'Petals', continuous: true, pattern: 'fire', order: ['Front · Path 3', 'Back · Path 1', 'Front · Path 1'] },
    expect.objectContaining({ label: 'Orbit', continuous: true, pattern: 'ocean', order: ['Front · Path 2', 'Back · Path 2'] }),
  ]));
  expect(await savedWiring()).toEqual(wiringBefore);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(group('Petals')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await group('Petals').scrollIntoViewIfNeeded();
    await expect(group('Petals')).toBeInViewport();
    const petals = group('Petals');
    const lineEyes = petals.getByRole('button', { name: 'Hide Front · Path 3 in Petals' });
    const groupEye = petals.getByRole('button', { name: 'Hide group Petals' });
    expect((await lineEyes.boundingBox())?.x).toBeCloseTo((await groupEye.boundingBox())!.x);
    const selectedId = await stripId(page, 'Front · Path 3');
    const otherId = await stripId(page, 'Back · Path 1');
    const ledDots = (id: string) => page.locator(`[data-testid^="strip-led-${id}-"]`);
    await expect(ledDots(selectedId).first()).toBeVisible();
    await lineEyes.click();
    await expect(ledDots(selectedId)).toHaveCount(0);
    await expect(ledDots(otherId).first()).toBeVisible();
    await petals.getByRole('button', { name: 'Show Front · Path 3 in Petals' }).click();
    await expect(ledDots(selectedId).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`effect-groups-${width}.png`) });
  }
  const moveDown = group('Petals').getByRole('button', { name: 'Move Front · Path 3 down in Petals' });
  const moveUp = group('Petals').getByRole('button', { name: 'Move Front · Path 3 up in Petals' });
  expect((await moveDown.boundingBox())?.height).toBeGreaterThanOrEqual(36);
  await moveDown.click();
  await expect(petalNames).toHaveText(['Back · Path 1', 'Front · Path 3', 'Front · Path 1']);
  await moveUp.click();
  await expect(petalNames).toHaveText(['Front · Path 3', 'Back · Path 1', 'Front · Path 1']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Wire' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Group' }).click();
  await expect(petalTarget).toContainText('Fire');
  await expect(petalNames).toHaveText(['Front · Path 3', 'Back · Path 1', 'Front · Path 1']);
});
