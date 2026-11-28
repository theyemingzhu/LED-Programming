import { expect, stubSaveFilePicker, test } from './studioTest';
import { readFile } from 'node:fs/promises';
import { createDefaultProject } from '../src/lib/projectModel.js';

const artwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="outer" data-name="Outer ring"><path d="M 20 20 H 180 V 180 H 20 Z" fill="none" stroke="red"/></g>
  <g id="inner" data-name="Inner trail"><path d="M 60 130 Q 100 20 140 130" fill="none" stroke="blue"/></g>
</svg>`;

test('downloads an editable project backup and opens it in a fresh browser', async ({ page, browser }, testInfo) => {
  await page.goto('/#screen=layout');
  await page.setInputFiles('input[accept=".svg"]', {
    name: 'bench-art.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(artwork),
  });
  await page.getByRole('button', { name: '+ All (2)' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(2);
  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill('Bench Mandala');
  await page.getByTestId('project-name-input').press('Enter');

  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.getByRole('button', { name: 'Save in browser' }).click();
  await expect(page.getByTestId('workspace-notice')).toContainText('Bench Mandala saved in browser library');
  await page.getByTestId('topbar-projects').click();
  const projects = page.getByRole('dialog', { name: 'Projects' });
  await expect(projects.getByRole('button', { name: 'Open Bench Mandala' })).toBeVisible();
  const backup = projects.getByRole('region', { name: 'Project file' });
  await expect(backup.getByRole('button', { name: 'Download backup' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('projects-desktop.png') });
  const downloadPromise = page.waitForEvent('download');
  await backup.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bench-mandala.lw.json');
  const savedPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(savedPath);
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  expect(saved.layout.layers.map(layer => layer.layerId)).toEqual(['outer', 'inner']);
  expect(saved.layout.strips).toHaveLength(2);
  await expect(page.getByTestId('workspace-notice')).toContainText('Backup ready: bench-mandala.lw.json');

  const fresh = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 760 } });
  try {
    const reopened = await fresh.newPage();
    await stubSaveFilePicker(reopened);
    await reopened.goto(page.url());
    await reopened.getByTestId('topbar-projects').click();
    const freshProjects = reopened.getByRole('dialog', { name: 'Projects' });
    await expect(freshProjects.getByText('No projects saved in this browser yet.')).toBeVisible();
    const openFile = freshProjects.getByRole('region', { name: 'Project file' }).getByRole('button', { name: 'Import from computer' });
    await expect(openFile).toBeInViewport();
    await reopened.screenshot({ path: testInfo.outputPath('projects-phone.png') });
    let chooserPromise = reopened.waitForEvent('filechooser');
    await openFile.click();
    await (await chooserPromise).setFiles({ name: 'broken.lw.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await expect(reopened.getByTestId('workspace-notice')).toContainText('Could not open this project file');
    await expect(freshProjects).toBeVisible();

    await reopened.setViewportSize({ width: 1180, height: 760 });
    await reopened.getByTestId('project-name-edit').click();
    await reopened.getByTestId('project-name-input').fill('Draft still in progress');
    await reopened.getByTestId('project-name-input').press('Enter');
    chooserPromise = reopened.waitForEvent('filechooser');
    await openFile.click();
    await (await chooserPromise).setFiles(savedPath);
    const replace = reopened.getByRole('dialog', { name: 'Replace current project?' });
    await expect(replace).toContainText('Draft still in progress');
    await expect(replace).toContainText('Bench Mandala');
    await replace.getByRole('button', { name: 'Keep editing' }).click();
    await expect(reopened.getByTestId('project-name-edit')).toHaveText('Draft still in progress');
    await expect(freshProjects).toBeVisible();

    chooserPromise = reopened.waitForEvent('filechooser');
    await openFile.click();
    await (await chooserPromise).setFiles(savedPath);
    await replace.getByRole('button', { name: 'Replace project' }).click();
    await expect(freshProjects).toBeHidden();
    await expect(reopened.getByTestId('workspace-notice')).toContainText('Opened Bench Mandala from file');
    await expect(reopened.getByTestId('project-name-edit')).toHaveText('Bench Mandala');
    await expect(reopened.locator('.la-strip-row')).toHaveCount(2);

    const restoredDownload = reopened.waitForEvent('download');
    await reopened.getByRole('button', { name: 'Export project', exact: true }).click();
    const restoredPath = testInfo.outputPath('restored.lw.json');
    await (await restoredDownload).saveAs(restoredPath);
    const restored = JSON.parse(await readFile(restoredPath, 'utf8'));
    expect(restored.layout).toEqual(saved.layout);
    expect(restored.devices).toEqual(saved.devices);
  } finally {
    await fresh.close();
  }
});

test('calls out a missing artwork backup when exporting a partial card copy', async ({ page }) => {
  await page.goto('/#screen=layout');
  const project = createDefaultProject();
  project.name = 'Card reconstruction';
  project.origin = { kind: 'card-partial', cardId: 'lw-bench-fixture', at: 1 };
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'card-reconstruction.lw.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByTestId('project-name-edit')).toHaveText(project.name);
  await page.getByTestId('topbar-projects').click();
  const projects = page.getByRole('dialog', { name: 'Projects' });
  await expect(projects.getByTestId('projects-association')).toHaveText('Card copy (partial — no artwork)');
  const downloadPromise = page.waitForEvent('download');
  await projects.getByRole('button', { name: 'Download card copy' }).click({ timeout: 5000 });
  expect((await downloadPromise).suggestedFilename()).toBe('card-reconstruction.lw.json');
  await expect(page.getByTestId('workspace-notice')).toContainText('Partial card copy saved');
});

test('a finished backup preserves only the revision captured before the file picker', async ({ page }) => {
  await page.goto('/#screen=layout');
  const rename = async (name: string) => {
    await page.getByTestId('project-name-edit').click();
    await page.getByTestId('project-name-input').fill(name);
    await page.getByTestId('project-name-input').press('Enter');
  };
  await rename('Before download');
  await page.evaluate(() => {
    const harness = window as any;
    harness.showSaveFilePicker = () => new Promise(resolve => {
      harness.finishProjectBackup = () => resolve({
        createWritable: async () => ({
          write: async (blob: Blob) => { harness.savedBackupName = JSON.parse(await blob.text()).name; },
          close: async () => {},
        }),
      });
    });
  });
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishProjectBackup)).toBe('function');
  await rename('Newer edit');
  await page.evaluate(() => (window as any).finishProjectBackup());
  await expect(page.getByTestId('workspace-notice')).toContainText('Backup ready: before-download.lw.json');
  expect(await page.evaluate(() => (window as any).savedBackupName)).toBe('Before download');
  await expect(page.getByTestId('project-name-edit')).toHaveText('Newer edit');
  await expect(page.getByTestId('project-dirty-dot')).toBeVisible();
});
