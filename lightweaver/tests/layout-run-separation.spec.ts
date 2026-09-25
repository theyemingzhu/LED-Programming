import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';

test('Layout separates a spanning GPIO strip and Undo restores its route', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'run-separation-browser';
  project.layout.layers = [{ id: 'art-only-layer', name: 'Artwork only', visible: true }];
  const outer = project.layout.wiring.runs.find((run: any) => run.source?.stripId === 'default-outer-circle');
  const inner = project.layout.wiring.runs.find((run: any) => run.source?.stripId === 'default-inner-circle');
  expect(outer).toBeTruthy();
  expect(inner).toBeTruthy();
  project.layout.wiring.runs = [
    { ...outer, id: 'outer-first', source: { ...outer.source, from: 0, to: 12 } },
    { ...outer, id: 'outer-second', source: { ...outer.source, from: 13, to: 26 }, physicalDirection: 'source-reverse' },
    inner,
  ];
  project.layout.wiring.outputs = [
    { id: 'out1', name: 'First output', pin: 16, runIds: ['outer-first'] },
    { id: 'out2', name: 'Second output', pin: 17, runIds: ['outer-second', inner.id] },
  ];
  project.layout.patchBoard.patches[0].playback.patternId = 'fire';
  await page.addInitScript(saved => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(saved));
  }, project);
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  const outerRows = page.locator('.la-strip-row').filter({ hasText: 'Outer circle' });
  await expect(outerRows).toHaveCount(2);
  await outerRows.first().click();
  await expect(page.getByText('Separate at existing run boundaries').first()).toBeVisible();
  await expect(page.getByText('GPIO 16 · 13 LEDs').first()).toBeVisible();
  await expect(page.getByText('GPIO 17 · 14 LEDs').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.getByTestId('separate-runs-default-outer-circle').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/layout-run-separation-before.png' });
  await page.getByTestId('separate-runs-default-outer-circle').first().click();
  await expect(page.locator('.la-strip-row .layer-name')).toContainText(['Outer circle 1', 'Outer circle 2', 'Inner circle']);
  await expect.poll(() => page.evaluate(() => {
    const layout = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout;
    return layout?.wiring?.runs?.filter((run: any) => run.id.startsWith('outer-')).map((run: any) => [run.source.stripId, run.source.from, run.source.to, run.physicalDirection]);
  })).toEqual([
    ['default-outer-circle', 0, 12, outer.physicalDirection],
    [expect.any(String), 0, 13, 'source-reverse'],
  ]);
  await page.locator('.la-strip-row .layer-name').filter({ hasText: 'Outer circle 2' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/layout-run-separation-after.png' });
  await page.getByTitle(/Undo/).first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips?.length)).toBe(2);
  await expect(page.locator('.la-strip-row').filter({ hasText: 'Outer circle' })).toHaveCount(2);
  await page.getByTitle(/Redo/).first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips?.length)).toBe(3);
  const restoredPage = await page.context().newPage();
  await restoredPage.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await expect(restoredPage.locator('.la-strip-row .layer-name')).toContainText(['Outer circle 1', 'Outer circle 2', 'Inner circle']);
  const reloaded = await restoredPage.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout.strips);
  const outerPieces = reloaded.filter((strip: any) => strip.name.startsWith('Outer circle'));
  expect(outerPieces.map((strip: any) => strip.pixels.length)).toEqual([13, 14]);
  expect(outerPieces[1].pixels[0].x).toBe(project.layout.strips[0].pixels[13].x);
  expect(outerPieces[1].pixels[0].y).toBe(project.layout.strips[0].pixels[13].y);
  expect(outerPieces[0].svgLength).toBeLessThan(project.layout.strips[0].svgLength);
  expect(outerPieces[1].svgLength).toBeLessThan(project.layout.strips[0].svgLength);
  await restoredPage.close();
});
