import { test, expect } from '@playwright/test';

const ARBITRARY_ARTWORK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300">
  <g id="branch" data-name="Branch"><path d="M 100 120 C 180 18 210 220 350 105" fill="none" stroke="white"/></g>
</svg>`;

test('Layout shows actual section shape, output inventory, and exact pattern action', async ({ page }, testInfo) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.setInputFiles('input[accept=".svg"]', {
    name: 'branch.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(ARBITRARY_ARTWORK),
  });
  await page.getByTestId('artwork-create-all-strips').click();

  const group = page.getByTestId('gpio-group-16');
  await expect(group.getByTestId('layout-output-inventory')).toContainText('1 section');
  const section = group.locator('.la-strip-row');
  await expect(section.locator('svg.la-section-miniature path')).toHaveAttribute('d', /C 180 18/);
  await expect(section).toContainText('LEDs');
  const changePattern = section.getByRole('button', { name: /Change pattern for/ });
  await expect(changePattern).toHaveAttribute('data-target-id', /.+/);
  await expect(page.getByTestId('layout-mapping-details')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await section.evaluate(element => element.scrollIntoView({ block: 'start' }));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('layout-section-overview.png') });
  const patchId = await changePattern.getAttribute('data-target-id');
  await changePattern.click();
  await expect(page.getByTestId(`section-target-${patchId}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('pattern-project-preview')).toBeVisible();
  await page.getByTestId('return-to-layout-section').click();
  await expect(changePattern).toBeFocused();

  const stripId = await section.locator('..').getAttribute('data-strip-id');
  await page.goto(`/#screen=pattern&target=${encodeURIComponent(patchId || '')}&project=stale-project&generation=0&returnStrip=${encodeURIComponent(stripId || '')}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('alert').filter({ hasText: 'That section changed in Layout' })).toBeVisible();
  await expect(page.getByTestId('return-to-layout-section')).toHaveCount(0);
});

test('spanning strip inventory and mapping include inactive address gaps', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips?.length)).toBe(1);
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    const run = project.layout.wiring.runs.find((item: any) => item.type === 'strip');
    const middle = Math.floor((run.source.from + run.source.to) / 2);
    const quarter = Math.floor((run.source.from + middle) / 2);
    const firstA = { ...run, id: `${run.id}-first-a`, source: { ...run.source, to: quarter } };
    const firstB = { ...run, id: `${run.id}-first-b`, source: { ...run.source, from: quarter + 1, to: middle } };
    const second = { ...run, id: `${run.id}-second`, source: { ...run.source, from: middle + 1 } };
    const gap = { id: 'inactive-gap', type: 'inactive', count: 3, verified: false };
    project.layout.wiring.runs = [gap, firstA, firstB, second];
    project.layout.wiring.outputs = [
      { id: 'out1', name: 'Output 1', pin: 16, runIds: [gap.id, firstA.id, firstB.id] },
      { id: 'out2', name: 'Output 2', pin: 17, runIds: [second.id] },
    ];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  const firstOutput = page.getByTestId('gpio-group-16');
  const secondOutput = page.getByTestId('gpio-group-17');
  await expect(firstOutput.getByTestId('layout-output-inventory')).toContainText('1 section');
  await expect(secondOutput.getByTestId('layout-output-inventory')).toContainText('1 section');
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  await expect(page.locator('.la-strip-routes')).toContainText('GPIO 16 + 17');
  const firstCount = Number((await firstOutput.getByTestId('layout-output-inventory').textContent())?.match(/(\d+) LEDs/)?.[1]);
  const secondCount = Number((await secondOutput.getByTestId('layout-output-inventory').textContent())?.match(/(\d+) LEDs/)?.[1]);
  expect(firstCount + secondCount).toBeGreaterThan(3);
  await page.getByTestId('layout-mapping-details').locator('summary').click();
  const spans = (await page.locator('.la-mapping-list > div').allTextContents()).map(text => {
    const [, pin, start, end] = text.match(/GPIO (\d+) · LEDs (\d+)–(\d+)/) || [];
    return [Number(pin), Number(start), Number(end)];
  });
  expect(spans).toHaveLength(3);
  expect(spans[0]).toEqual([16, 4, spans[0][2]]);
  expect(spans[1]).toEqual([16, spans[0][2] + 1, firstCount + 3]);
  expect(spans[2]).toEqual([17, 1, secondCount]);
});

test('grouped geometry members open one canonical section target', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  const createLine = page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' });
  await createLine.click();
  await page.getByTestId('layout-add-strip').click();
  await page.getByTestId('layout-add-strip-chooser').getByRole('button', { name: 'Line', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips?.length)).toBe(2);
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    const ids = project.layout.strips.map((strip: any) => strip.id);
    project.layout.layerGroups = [{ groupId: 'shared-shape', type: 'strip', name: 'Shared shape', members: ids.map((stripId: string) => ({ stripId })) }];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const actions = page.getByTestId('layout-section-pattern-action');
  await expect(page.getByTestId('gpio-group-16').getByTestId('layout-output-inventory')).toContainText('1 section');
  await expect(actions).toHaveCount(2);
  const targetIds = await actions.evaluateAll((buttons: HTMLElement[]) => buttons.map(button => button.dataset.targetId));
  expect(targetIds[0]).toBeTruthy();
  expect(targetIds[1]).toBe(targetIds[0]);
  await expect(page.getByText('Pattern target unavailable')).toHaveCount(0);
  await expect(actions.nth(1)).toContainText('shared section');
});
