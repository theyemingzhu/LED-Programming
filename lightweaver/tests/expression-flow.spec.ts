import { test, expect } from '@playwright/test';
import { openControls } from './helpers/pattern-lab';

test('Flow route reorders and reverses stable sections without changing the installed wire order', async ({ page }, testInfo) => {
  const cardMutations: string[] = [];
  await page.route(/^http:\/\/(lightweaver\.local|192\.168\.4\.1)\//, async route => {
    if (route.request().method() !== 'GET') cardMutations.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort();
  });
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await page.getByLabel('Scene title').fill('Flow route fixture');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lw_autosave_v3'))).not.toBeNull();
  await page.addInitScript(() => {
    const staged = sessionStorage.getItem('lw_test_flow_project');
    if (!staged) return;
    localStorage.setItem('lw_autosave_v3', staged);
    sessionStorage.removeItem('lw_test_flow_project');
  });
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    const base = project.layout.strips[0];
    const ids = ['open-a', 'island-b', 'fork-c'];
    const counts = [4, 7, 2];
    const paths = ['M 35 80 L 185 110', 'M 350 55 L 490 145', 'M 320 300 L 550 260'];
    project.layout.strips = ids.map((id, index) => ({ ...base, id, name: ['Open A', 'Island B', 'Fork C'][index], pathData: paths[index], pixelCount: counts[index], pixels: [] }));
    project.layout.sectionFamilies = [];
    project.layout.layerGroups = [];
    project.layout.patchBoard = null;
    project.layout.wiring = {
      version: 1, locked: true, verified: true,
      outputs: [{ id: 'out1', pin: 16, runIds: ids.map(id => `run-${id}`) }],
      runs: ids.map((id, index) => ({ id: `run-${id}`, type: 'strip', source: { stripId: id, from: 0, to: counts[index] - 1 }, directionPolicy: 'flexible', physicalDirection: 'source-forward', seamLed: null, verified: true })),
    };
    project.expressionScenes = { version: 1, activeSceneId: null, scenes: [] };
    sessionStorage.setItem('lw_test_flow_project', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await page.getByRole('button', { name: '+ Area' }).click();
  await page.getByLabel('Scene pattern').selectOption('chase');
  await page.getByLabel('Pattern domain').selectOption('continuous');
  const where = page.getByRole('group', { name: 'Where' });
  await where.getByRole('checkbox', { name: 'Island B' }).check();
  await where.getByRole('checkbox', { name: 'Fork C' }).check();
  await expect(page.getByRole('region', { name: 'Scene preview' })).not.toContainText('Preview unavailable');
  await expect(page.locator('.sexp-flow-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Move strip:fork-c earlier in Flow' }).click();
  await page.getByRole('button', { name: 'Reverse Flow direction for strip:island-b' }).click();
  await expect(page.locator('.sexp-flow-row').nth(1)).toContainText('Fork C');
  await expect(page.getByRole('button', { name: 'Reverse Flow direction for strip:island-b' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.expressionScenes?.scenes?.[0]?.steps?.[0]?.assignments?.[0]?.selection;
  })).toEqual({
    areaIds: ['strip:open-a', 'strip:fork-c', 'strip:island-b'], domain: 'continuous',
    flow: { version: 1, directions: { 'strip:island-b': 'reverse' } },
  });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3')!).layout.wiring.outputs[0].runIds)).toEqual([
    'run-open-a', 'run-island-b', 'run-fork-c',
  ]);
  await page.screenshot({ path: testInfo.outputPath('expression-flow.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save scene' }).click();
  await expect(page.getByText('Project saved')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('pattern-lab-build-scene').click();
  await expect(page.locator('.sexp-flow-row')).toHaveCount(3);
  await expect(page.locator('.sexp-flow-row').nth(1)).toContainText('Fork C');
  await expect(page.locator('.sexp-status')).toContainText('Flow ready to record');
  await expect(page.locator('.sexp-status')).toContainText('microSD card');
  await expect(page.getByTestId('scene-record-status')).toContainText(/\d+ KB/);
  await expect(page.getByRole('button', { name: 'Put scene on card' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Record Flow', exact: true }).click();
  await expect(page.getByTestId('scene-record-status')).toContainText(/Recorded .+ in the project/, { timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'Open Playlist' })).toHaveAttribute('href', '#screen=playlist');
  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices?.standaloneController?.sequenceAssets?.length;
  })).toBe(1);
  const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3')!).devices.standaloneController.sequenceAssets[0]);
  expect(recorded.source.kind).toBe('expression-scene');
  expect(recorded.source.payload.steps[0].assignments[0].selection).toMatchObject({
    areaIds: ['strip:open-a', 'strip:fork-c', 'strip:island-b'], domain: 'continuous',
    flow: { version: 1, directions: { 'strip:island-b': 'reverse' } },
  });
  expect(recorded.manifest.lwseqSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(recorded.media?.data).toBeUndefined();
  await page.reload({ waitUntil: 'domcontentloaded' });
  const persisted = await page.evaluate(async () => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    const asset = project.devices.standaloneController.sequenceAssets[0];
    const { verifyStoredSequenceAsset } = await import('/src/lib/recordedSequenceAsset.js');
    const bytes = await verifyStoredSequenceAsset(asset);
    return { length: bytes.length, expected: asset.byteLength, hash: asset.manifest.lwseqSha256 };
  });
  expect(persisted).toEqual({ length: recorded.byteLength, expected: recorded.byteLength, hash: recorded.manifest.lwseqSha256 });
  await page.getByTestId('pattern-lab-build-scene').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('expression-flow-recording-phone.png'), fullPage: true });
  await page.goto('/#screen=playlist', { waitUntil: 'domcontentloaded' });
  const recordings = page.getByTestId('playlist-recordings');
  await expect(recordings).toContainText(recorded.label);
  await recordings.getByRole('button', { name: new RegExp(recorded.label) }).click();
  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices?.standaloneController?.playlist?.find((item: any) => item.type === 'sequence');
  })).toMatchObject({ type: 'sequence', sequenceAssetId: recorded.id, label: recorded.label });
  await expect(page.locator('.pl-copy').filter({ hasText: recorded.label })).toContainText('recorded playback');
  await page.screenshot({ path: testInfo.outputPath('recorded-flow-playlist-phone.png'), fullPage: true });
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await openControls(page);
  await page.getByTestId('pattern-lab-runtime-tools').locator(':scope > summary').click();
  const savedRecordings = page.getByTestId('pattern-lab-saved-recordings');
  await savedRecordings.locator(':scope > summary').click();
  await savedRecordings.getByRole('button', { name: 'Edit scene', exact: true }).click();
  await expect(page.getByTestId('scene-expression-editor')).toBeVisible();
  await expect(page.getByLabel('Scene', { exact: true })).toHaveValue(recorded.source.payload.id);
  expect(cardMutations).toEqual([]);
});
