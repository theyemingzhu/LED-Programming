import { test, expect, type Page } from '@playwright/test';

const IDENTITIES = ['scanner', 'plasma', 'chase', 'meteor'];
const evidenceDir = process.env.LW_FLIP_EVIDENCE;

async function expectDataDirection(page: Page, stripId: string, first: number, second: number) {
  const marker = page.getByTestId('first-led-marker');
  const arrow = marker.getByTestId('strip-data-arrow');
  const point = (index: number) => page.getByTestId(`strip-led-${stripId}-${index}`).locator('circle').first()
    .evaluate(dot => [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]);
  await expect(marker).toBeVisible();
  await expect(marker).toContainText('LED 1');
  await expect(arrow).toBeVisible();
  const [x, y] = await point(first);
  const [nextX, nextY] = await point(second);
  await expect(marker).toHaveAttribute('transform', `translate(${x} ${y})`);
  const direction = await arrow.evaluate(node => {
    const matrix = (node as unknown as SVGGElement).transform.baseVal.consolidate()!.matrix;
    return [matrix.a, matrix.b];
  });
  const distance = Math.hypot(nextX - x, nextY - y);
  expect(direction[0]).toBeCloseTo((nextX - x) / distance);
  expect(direction[1]).toBeCloseTo((nextY - y) / distance);
}

test('four sections keep independent effects while Draw flips only the chosen run', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#screen=layout');
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  const rows = page.locator('.la-strip-row');
  await expect(rows).toHaveCount(1);
  const count = page.getByRole('spinbutton', { name: 'Line LED count' });
  await count.fill('41');
  await count.blur();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('4');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(rows).toHaveCount(4);

  await page.goto('/#screen=pattern');
  const sections = page.locator('[data-testid^="section-target-"]:not([data-testid="section-target-all"])');
  await expect(sections).toHaveCount(4);
  for (const [index, pattern] of IDENTITIES.entries()) {
    await sections.nth(index).click();
    await page.locator(`.pm-cards .pmcard[data-pattern-id="${pattern}"]`).click();
  }
  await page.getByTestId('stack-new').click();
  await page.getByTestId('look-name').fill('Four directions');
  await page.getByTestId('look-save-preset').click();
  const readProject = () => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  await expect.poll(async () => (await readProject()).devices.standaloneController.looks
    .some((look: { label: string }) => look.label === 'Four directions')).toBe(true);
  const original = await readProject();
  const ids = original.layout.strips.map((strip: { id: string }) => strip.id);
  const runsNow = (saved: typeof original) => ids.map((id: string) =>
    saved.layout.wiring.runs.find((run: { source?: { stripId: string }; physicalDirection: string }) => run.source?.stripId === id));
  const directions = async () => runsNow(await readProject()).map((run: { physicalDirection: string }) => run.physicalDirection);
  const forward = ['source-forward', 'source-forward', 'source-forward', 'source-forward'];
  const reversed = ['source-reverse', 'source-reverse', 'source-reverse', 'source-reverse'];
  expect(await directions()).toEqual(forward);
  expect(original.layout.wiring.outputs).toHaveLength(1);
  expect(original.layout.strips.map((strip: { pixelCount: number }) => strip.pixelCount)).toEqual([11, 10, 10, 10]);

  const flipPart = async (index: number) => {
    await rows.nth(index).locator('.layer-name').click();
    await page.getByRole('button', { name: `Flip playback direction of Part ${index + 1}`, exact: true }).click();
  };
  await page.goto('/#screen=layout');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  const ledColors = (id: string) => page.locator(`[data-testid^="strip-led-${id}-"] > circle:first-child`)
    .evaluateAll(dots => dots.map(dot => dot.getAttribute('fill')));
  await expect.poll(async () => new Set(await ledColors(ids[1])).size).toBeGreaterThan(1);
  const beforeColors = await Promise.all(ids.map(ledColors));
  expect(beforeColors[1]).not.toEqual([...beforeColors[1]].reverse());
  const play = page.getByTestId('layout-preview-play');
  await expect(play).toHaveText('Play');
  await rows.nth(1).locator('.layer-name').click();
  await expectDataDirection(page, ids[1], 0, 1);
  if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/part-2-forward-desktop.png` });
  const flip = page.getByRole('button', { name: 'Flip playback direction of Part 2', exact: true });
  await flip.click();
  await expect(play).toHaveText('Play');
  await expectDataDirection(page, ids[1], 9, 8);
  await expect.poll(() => ledColors(ids[1])).toEqual([...beforeColors[1]].reverse());
  for (const index of [0, 2, 3]) expect(await ledColors(ids[index])).toEqual(beforeColors[index]);
  await expect.poll(directions).toEqual(['source-forward', 'source-reverse', 'source-forward', 'source-forward']);
  if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/part-2-flipped-desktop.png` });
  await flip.click();
  await expectDataDirection(page, ids[1], 0, 1);
  await expect.poll(() => ledColors(ids[1])).toEqual(beforeColors[1]);
  await flip.click();
  await expectDataDirection(page, ids[1], 9, 8);
  await expect.poll(directions).toEqual(['source-forward', 'source-reverse', 'source-forward', 'source-forward']);
  await play.click();
  await expect(play).toHaveText('Pause');
  await expect.poll(() => ledColors(ids[1])).not.toEqual([...beforeColors[1]].reverse());
  await page.reload();
  await rows.nth(1).locator('.layer-name').click();
  await expect(flip).toHaveAttribute('aria-pressed', 'true');
  await expectDataDirection(page, ids[1], 9, 8);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(flip).toBeVisible();
  await expectDataDirection(page, ids[1], 9, 8);
  const label = await page.getByTestId('first-led-marker').locator('rect').boundingBox();
  expect(label).not.toBeNull();
  expect(label!.x).toBeGreaterThanOrEqual(0);
  expect(label!.x + label!.width).toBeLessThanOrEqual(390);
  await flip.scrollIntoViewIfNeeded();
  if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/part-2-flipped-phone.png` });
  await flip.click();
  await expectDataDirection(page, ids[1], 0, 1);
  if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/part-2-forward-phone.png` });
  await flip.click();
  await expectDataDirection(page, ids[1], 9, 8);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const index of [0, 2, 3]) await flipPart(index);
  await expect.poll(directions).toEqual(reversed);
  const allFlipped = await readProject();
  expect(allFlipped.layout.wiring.outputs).toEqual(original.layout.wiring.outputs);
  expect(allFlipped.layout.strips).toEqual(original.layout.strips);
  expect(allFlipped.devices.standaloneController.looks).toEqual(original.devices.standaloneController.looks);

  for (const index of [0, 1, 2, 3]) await flipPart(index);
  await expect.poll(directions).toEqual(forward);
  const unflipped = await readProject();
  await page.addInitScript(saved => {
    if (sessionStorage.getItem('locked-direction-fixture')) return;
    sessionStorage.setItem('locked-direction-fixture', 'true');
    saved.layout.wiring.locked = true;
    saved.layout.wiring.verified = true;
    saved.layout.wiring.runs.forEach((run: { verified: boolean }) => { run.verified = true; });
    const snapshot = JSON.stringify(saved);
    localStorage.setItem('lw_autosave_v3', snapshot);
    localStorage.setItem('lw_autosave_v3_backup', snapshot);
  }, unflipped);
  await page.reload();
  await rows.nth(1).locator('.layer-name').click();
  const lockedFlip = page.getByRole('button', { name: 'Flip playback direction of Part 2', exact: true });
  await expect(lockedFlip).toBeDisabled();
  await expect(lockedFlip).toHaveAttribute('title', 'Unlock wiring in Test & Install');
});


test('Flip path reverses the rendered light on the same geometry and persists through save and divide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#screen=layout');
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  await expect.poll(async () => (await read()).layout?.strips?.length).toBe(1);
  const id = (await read()).layout.strips[0].id as string;
  await page.goto('/#screen=pattern');
  await page.locator('.pm-cards .pmcard[data-pattern-id="plasma"]').click();
  await page.goto('/#screen=layout');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  const dots = page.locator(`[data-testid^="strip-led-${id}-"] > circle:first-child`);
  const colors = () => dots.evaluateAll(dots => dots.map(dot => ({
    x: Number(dot.getAttribute('cx')), color: dot.getAttribute('fill'),
  })).sort((a, b) => a.x - b.x).map(dot => dot.color));
  await expect.poll(async () => new Set(await colors()).size).toBeGreaterThan(1);
  const initial = await colors();
  const flipped = [...initial].reverse();
  expect(initial).not.toEqual(flipped);

  const toggle = async () => {
    const menu = page.getByLabel('More strip actions', { exact: true });
    if (!await page.getByRole('button', { name: 'Flip path direction', exact: true }).isVisible()) await menu.click();
    await page.getByRole('button', { name: 'Flip path direction', exact: true }).click();
  };
  if (!await page.getByLabel('More strip actions', { exact: true }).isVisible()) await page.locator('.la-strip-row .layer-name').click();
  await toggle();
  await expect(page.getByRole('button', { name: 'Flip path direction', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(colors).toEqual(flipped);
  await expect.poll(async () => (await read()).layout.strips[0].pathPlaybackFlipped).toBe(true);
  await toggle();
  await expect.poll(colors).toEqual(initial);
  await expect.poll(async () => (await read()).layout.strips[0].pathPlaybackFlipped).toBeUndefined();

  await toggle();
  await expect.poll(async () => (await read()).layout.strips[0].pathPlaybackFlipped).toBe(true);
  await page.reload();
  await expect.poll(async () => (await read()).layout.strips[0].pathPlaybackFlipped).toBe(true);
  if (!await page.locator('[data-testid^="divide-toggle-"]').isVisible()) await page.locator('.la-strip-row .layer-name').click();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('4');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect.poll(async () => (await read()).layout.strips.map((strip: { pathPlaybackFlipped?: boolean }) => strip.pathPlaybackFlipped))
    .toEqual([true, true, true, true]);
});


test('reversing data on a closed strip keeps the chosen LED 1 seam', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#screen=layout');
  const picker = page.getByTestId('layout-primitive-picker');
  await picker.getByRole('button', { name: 'Circle', exact: true }).click();
  await picker.getByRole('button', { name: 'Create circle' }).click();
  const reverse = page.getByRole('button', { name: /^Reverse data direction of / });
  if (!await reverse.isVisible()) await page.locator('.la-strip-row .layer-name').click();
  const stripId = (await page.locator('path[data-strip-path]').getAttribute('data-strip-path'))!;
  const seam = 0;
  await page.getByRole('button', { name: 'Set first LED' }).click();
  const led = page.getByTestId(`strip-led-${stripId}-${seam}`);
  await expect(led).toBeVisible();
  await led.dispatchEvent('pointerdown', { bubbles: true, button: 0 });
  await expect.poll(() => page.evaluate(id => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.layout?.wiring?.runs.find((run: { source?: { stripId: string } }) => run.source?.stripId === id)?.seamLed;
  }, stripId)).toBe(seam);
  await expect(page.getByTestId('connector-seam-handle')).toHaveAttribute('aria-valuenow', String(seam));
  await expectDataDirection(page, stripId, seam, seam + 1);
  await reverse.click();
  await expect(reverse).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('connector-seam-handle')).toHaveAttribute('aria-valuenow', String(seam));
  const dots = page.locator(`[data-testid^="strip-led-${stripId}-"] > circle:first-child`);
  const previous = await dots.evaluateAll(leds => {
    const [first] = leds;
    const offset = [...leds].reverse().findIndex(led =>
      led.getAttribute('cx') !== first.getAttribute('cx') || led.getAttribute('cy') !== first.getAttribute('cy'));
    return leds.length - 1 - offset;
  });
  await expectDataDirection(page, stripId, seam, previous);
});
