import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { compileWiring } from '../src/lib/wiringCompiler.js';
import { createDefaultKaleidoscope } from '../src/lib/kaleidoscope.js';
import type { Page } from '@playwright/test';

function physicalMap(layout: any) {
  const compiled = compileWiring({ wiring: layout.wiring, strips: layout.strips });
  expect(compiled.ok).toBe(true);
  return compiled.outputs.map(output => ({
    pin: output.pin,
    leds: compiled.pixels.slice(output.start, output.start + output.count)
      .map(pixel => [pixel.runId, pixel.x, pixel.y]),
  }));
}

async function openLayout(page: Page, baseURL: string, project: ReturnType<typeof createDefaultProject>) {
  const origin = new URL(baseURL).origin;
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin && !url.pathname.startsWith('/api/')
      ? route.continue() : route.abort();
  });
  await page.addInitScript(saved => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(saved));
  }, project);
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
}

function splitFixture(sameOutput = false) {
  const project = createDefaultProject();
  project.id = 'run-separation-browser';
  project.layout.layers = [{ id: 'art-only-layer', name: 'Artwork only', visible: true }];
  const outer = project.layout.wiring.runs.find((run: any) => run.source?.stripId === 'default-outer-circle');
  const inner = project.layout.wiring.runs.find((run: any) => run.source?.stripId === 'default-inner-circle');
  expect(outer).toBeTruthy();
  expect(inner).toBeTruthy();
  project.layout.wiring.runs = [
    { ...outer, id: 'outer-first', source: { ...outer.source, from: 0, to: 12 } },
    { ...outer, id: 'outer-second', source: { ...outer.source, from: 13, to: 26 }, physicalDirection: sameOutput ? outer.physicalDirection : 'source-reverse' },
    inner,
  ];
  project.layout.wiring.outputs = sameOutput ? [
    { id: 'out1', name: 'First output', pin: 16, runIds: ['outer-first', 'outer-second', inner.id] },
  ] : [
    { id: 'out1', name: 'First output', pin: 16, runIds: ['outer-first'] },
    { id: 'out2', name: 'Second output', pin: 17, runIds: ['outer-second', inner.id] },
  ];
  return { project, outer };
}

test('Layout separates a spanning GPIO strip and Undo restores its route', async ({ page, baseURL }, testInfo) => {
  const { project, outer } = splitFixture();
  const [outerPatch, innerPatch] = project.layout.patchBoard.patches;
  const outerLook = { patternId: 'fire', speed: 0.75, brightness: 0.35 };
  outerPatch.playback.patternId = 'fire';
  project.devices.standaloneController.looks = [{
    id: 'evening',
    label: 'Evening',
    sectionSnapshotVersion: 1,
    defaultLook: { patternId: 'aurora' },
    sectionLooks: { [outerPatch.id]: outerLook, [innerPatch.id]: { patternId: 'ocean' } },
  }];
  const readProject = () => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  const before = physicalMap(project.layout);
  await openLayout(page, baseURL!, project);
  const outerRows = page.locator('.la-strip-row').filter({ hasText: 'Outer circle' });
  // A spanning strip has one editable row; the second output links to it.
  await expect(outerRows).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-17')).toContainText('Continues Outer circle');
  await outerRows.first().click();
  await expect(page.getByText('Separate at existing run boundaries').first()).toBeVisible();
  await expect(page.getByText('GPIO 16 · 13 LEDs').first()).toBeVisible();
  await expect(page.getByText('GPIO 17 · 14 LEDs').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  const split = page.getByTestId('separate-runs-default-outer-circle');
  await expect(split).toHaveText('Separate into 2 sections');
  await split.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('layout-run-separation-before.png') });
  await split.click();
  await expect(page.locator('.la-strip-row .layer-name')).toContainText(['Outer circle 1', 'Outer circle 2', 'Inner circle']);
  await expect.poll(() => page.evaluate(() => {
    const layout = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout;
    return layout?.wiring?.runs?.filter((run: any) => run.id.startsWith('outer-')).map((run: any) => [run.source.stripId, run.source.from, run.source.to, run.physicalDirection]);
  })).toEqual([
    ['default-outer-circle', 0, 12, outer.physicalDirection],
    [expect.any(String), 0, 13, 'source-reverse'],
  ]);
  await page.locator('.la-strip-row .layer-name').filter({ hasText: 'Outer circle 2' }).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await readProject()).layout?.strips?.length).toBe(3);
  const separated = await readProject();
  expect(physicalMap(separated.layout)).toEqual(before);
  const newPatchId = separated.layout.patchBoard.patches.find((patch: any) =>
    patch.source.stripId === separated.layout.strips.find((strip: any) => strip.name === 'Outer circle 2').id).id;
  const separatedLook = separated.devices.standaloneController.looks.find((look: any) => look.id === 'evening');
  expect(separatedLook.sectionLooks[outerPatch.id]).toMatchObject(outerLook);
  expect(separatedLook.sectionLooks[newPatchId]).toEqual(separatedLook.sectionLooks[outerPatch.id]);
  expect(separatedLook.sectionLooks[innerPatch.id]).toMatchObject({ patternId: 'ocean' });
  await page.screenshot({ path: testInfo.outputPath('layout-run-separation-after.png') });
  await page.getByTitle(/Undo/).first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips?.length)).toBe(2);
  await expect(page.locator('.la-strip-row').filter({ hasText: 'Outer circle' })).toHaveCount(1);
  const undone = await readProject();
  expect(physicalMap(undone.layout)).toEqual(before);
  const undoneLook = undone.devices.standaloneController.looks.find((look: any) => look.id === 'evening');
  expect(undoneLook.sectionLooks[outerPatch.id]).toMatchObject(outerLook);
  expect(undoneLook.sectionLooks[newPatchId]).toBeUndefined();
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


test('a changed Scanner range offers browser preview after dividing adjacent runs', async ({ page, baseURL }, testInfo) => {
  const { project } = splitFixture(true);
  project.layout.patchBoard.patches[0].playback.patternId = 'scanner';
  const before = physicalMap(project.layout);
  const compiledBefore = compileWiring({ wiring: project.layout.wiring, strips: project.layout.strips });
  const source = compiledBefore.zones.find(zone => zone.id === 'default-outer-circle');
  expect(source?.ranges).toEqual([{ start: 0, count: 27 }]);

  await openLayout(page, baseURL!, project);
  await page.locator('.la-strip-row').filter({ hasText: 'Outer circle' }).click();
  const split = page.getByRole('button', { name: 'Separate and preview' });
  await expect(page.getByText('Patterns will render separately on the new sections.', { exact: false })).toBeVisible();
  await split.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('same-gpio-review-desktop.png') });
  await split.click();
  await expect(page.getByTestId('layout-preview-play')).toHaveText('Pause');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout?.strips?.length)).toBe(3);
  const layout = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout);
  expect(physicalMap(layout)).toEqual(before);
  const after = compileWiring({ wiring: layout.wiring, strips: layout.strips });
  const newSections = after.zones.filter(zone => zone.label.startsWith('Outer circle'));
  expect(newSections.map(zone => zone.ranges)).toEqual([[{ start: 0, count: 13 }], [{ start: 13, count: 14 }]]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByTestId('layout-preview-play')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('same-gpio-preview-phone.png') });
});

for (const mapping of ['symmetry', 'kaleidoscope'] as const) {
  test(`separation blocks without removing ${mapping} mappings`, async ({ page, baseURL }, testInfo) => {
    const { project } = splitFixture(mapping === 'symmetry');
    if (mapping === 'symmetry') {
      project.layout.symmetry = {
        fold: 2, orientation: 'mirror', sides: [
          { id: 'side-1', label: 'Side 1', stripIds: ['default-outer-circle'] },
          { id: 'side-2', label: 'Side 2', stripIds: ['default-inner-circle'] },
        ],
      };
    } else {
      project.layout.strips[0].kaleidoscope = createDefaultKaleidoscope(27);
    }
    await openLayout(page, baseURL!, project);
    await page.locator('.la-strip-row .layer-name').getByText('Outer circle', { exact: true }).click();
    const action = page.getByTestId('separate-runs-default-outer-circle');
    await expect(action).toBeDisabled();
    const message = mapping === 'symmetry' ? 'Move this strip out of its symmetry side before separating runs.'
      : 'Turn off Kaleidoscope for this strip before separating runs.';
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.locator('.la-strip-row').filter({ hasText: 'Outer circle' })).toHaveCount(1);
    await expect.poll(() => page.evaluate(kind => {
      const layout = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout;
      return kind === 'symmetry'
        ? layout.symmetry?.sides[0].stripIds.includes('default-outer-circle')
        : layout.strips[0].kaleidoscope?.enabled;
    }, mapping)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText(message, { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${mapping}-guard-phone.png`) });
  });
}
