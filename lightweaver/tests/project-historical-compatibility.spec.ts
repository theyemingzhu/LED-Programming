import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FileChooser, Page, TestInfo } from '@playwright/test';
import { expect, stubSaveFilePicker, test } from './studioTest';

const fixture = (path: string) => fileURLToPath(new URL(`./fixtures/${path}`, import.meta.url));
const legacy = (version: 1 | 2) => fixture(`project-compatibility/v${version}-7d77a2c3.json`);
const archived = fixture('real-card-bench-2026-11-21/nov19-restore.lw.json');

async function importFile(page: Page, file: Parameters<FileChooser['setFiles']>[0]) {
  await page.getByTestId('topbar-projects').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import from computer' }).click();
  await (await chooser).setFiles(file);
}

async function download(page: Page, testInfo: TestInfo, name: string) {
  const requested = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  const output = await requested;
  expect(output.suggestedFilename()).toMatch(/\.lw\.json$/);
  const path = testInfo.outputPath(name);
  await output.saveAs(path);
  return { document: JSON.parse(await readFile(path, 'utf8')), path };
}

async function rename(page: Page, name: string) {
  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill(name);
  await page.getByTestId('project-name-input').press('Enter');
  await expect(page.getByTestId('project-name-edit')).toHaveText(name);
}

for (const [path, version] of [[legacy(1), 1], [legacy(2), 2], [archived, 3]] as const) {
  test(`opens, saves, downloads and reopens historical project v${version}`, async ({ page, browser }, info) => {
    const source = JSON.parse(await readFile(path, 'utf8'));
    await page.goto('/#screen=layout');
    await importFile(page, path);
    await expect(page.getByTestId('workspace-notice')).toContainText('from file');
    await expect(page.locator('.la-strip-row')).toHaveCount(version === 3 ? 5 : 1);
    await rename(page, `Historical project v${version}`);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByRole('button', { name: 'Save in browser' }).click();
    await expect(page.getByTestId('workspace-notice')).toContainText('saved in browser library');
    const saved = await download(page, info, 'historical.lw.json');
    expect(saved.document.version).toBe(3);
    if (version === 3) {
      expect(saved.document.id).toBe('lightweaver-bench-discovery-v1');
      expect(saved.document.layout.wiring.outputs).toEqual(source.layout.wiring.outputs);
      expect(saved.document.devices.standaloneController.playlist.map(item => item.id)).toEqual(
        source.devices.standaloneController.playlist.map(item => item.id),
      );
    } else {
      expect(saved.document.id).toMatch(/^lwproj-/);
      expect(saved.document.layout.svgText).toBe(source.svgText);
      expect(saved.document.layout.strips[0]).toMatchObject({ sourceLayerId: 'wedge-0', pixelCount: 9, reversed: true });
    }
    // A more recent, unsaved draft wins over the explicit browser copy.
    const autosavedName = `Recent edits v${version}`;
    await rename(page, autosavedName);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').name)).toBe(autosavedName);
    await page.reload();
    await expect(page.getByTestId('project-name-edit')).toHaveText(autosavedName);
    await page.getByTestId('topbar-projects').click();
    await page.getByRole('button', { name: `Open Historical project v${version}` }).click();
    await page.getByRole('button', { name: 'Replace project' }).click();
    await expect(page.getByTestId('project-name-edit')).toHaveText(`Historical project v${version}`);

    const fresh = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const reopened = await fresh.newPage();
      await stubSaveFilePicker(reopened);
      await reopened.goto(page.url());
      await importFile(reopened, saved.path);
      await expect(reopened.getByTestId('workspace-notice')).toContainText('from file');
      const again = await download(reopened, info, 'reopened.lw.json');
      expect(again.document.id).toBe(saved.document.id);
      expect(again.document.layout).toEqual(saved.document.layout);
      expect(again.document.devices).toEqual(saved.document.devices);
    } finally {
      await fresh.close();
    }
  });
}

test('recovers the archived v1 browser autosave and keeps its raw copy', async ({ page }) => {
  const raw = await readFile(fixture('project-compatibility/v1-autosave-7d77a2c3.json'), 'utf8');
  await page.addInitScript(value => {
    if (!localStorage.getItem('lw_autosave_v1')) localStorage.setItem('lw_autosave_v1', value);
    // A bad secondary legacy copy must not prevent the real draft from opening.
    if (!localStorage.getItem('lw-layout-autosave')) {
      localStorage.setItem('lw-layout-autosave', '{"version":2,"strips":[],"layers":[null]}');
    }
  }, raw);
  await page.goto('/#screen=layout');
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  const recovered = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v1') || '{}'));
  expect(recovered.strips[0]).toMatchObject({ id: 'wedge-0', reversed: true, pixelCount: 9 });
  await rename(page, 'Recovered historical draft');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').name)).toBe('Recovered historical draft');
  await page.reload();
  await expect(page.getByTestId('project-name-edit')).toHaveText('Recovered historical draft');
  expect(await page.evaluate(() => localStorage.getItem('lw_autosave_v1'))).toBe(raw);
});

test('rejects corrupt and future files without touching the current draft or its saved record', async ({ page }) => {
  await page.goto('/#screen=layout');
  await rename(page, 'Saved compatibility project');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.getByRole('button', { name: 'Save in browser' }).click();
  await expect(page.getByTestId('workspace-notice')).toContainText('saved in browser library');
  await rename(page, 'Unsaved work to protect');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').name)).toBe('Unsaved work to protect');

  const keys = [
    'lw_autosave_v3', 'lw_autosave_v3_backup', 'lw_project_library_v1', 'lw_project_library_v1_backup',
    'lw_project_active_record_v1', 'lw_project_active_record_ownership_v1', 'lw_cloud_active_project_v1',
  ];
  const snapshot = () => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);
  const before = await snapshot();
  expect(before.lw_project_active_record_v1).toBeTruthy();
  await page.getByTestId('topbar-projects').click();
  const open = page.getByRole('button', { name: 'Import from computer' });
  for (const [name, raw, message] of [
    ['future.lw.json', '{"version":99,"layout":{"strips":[]}}', 'newer Lightweaver Studio'],
    ['future-envelope.lw.json', '{"envelopeVersion":7,"project":{"version":3,"layout":{"strips":[]}}}', 'newer Lightweaver Studio'],
    ['bad-shape.lw.json', '{"version":3,"layout":{"strips":{}}}', 'compatible Lightweaver project backup'],
    ['broken.lw.json', '{', 'valid Lightweaver project backup'],
  ]) {
    const chooser = page.waitForEvent('filechooser');
    await open.click();
    await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(raw) });
    await expect(page.getByTestId('workspace-notice')).toContainText(message);
    await expect(page.getByRole('dialog', { name: 'Replace current project?' })).toHaveCount(0);
    await expect(page.getByTestId('project-name-edit')).toHaveText('Unsaved work to protect');
    expect(await snapshot()).toEqual(before);
  }
});
