import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { derivePlaylistLookIds } from '../src/lib/cardPlaylist.js';
import { normalizeSavedLooks } from '../src/lib/sectionLookModel.js';

async function openProject(page, { full = false, repeated = false } = {}) {
  const project = createDefaultProject();
  project.id = 'editing-continuity-fixture';
  project.devices.standaloneController.looks = normalizeSavedLooks(Array.from({ length: full ? 12 : 1 }, (_, i) => ({
    id: `owned-look-${i}`, label: `Owned look ${i + 1}`,
    defaultLook: { patternId: 'aurora', brightness: 0.42, speed: 0.75, customHue: 32, customSaturation: 0, hueShift: 80 },
    sectionLooks: {}, updatedAt: i,
  })));
  project.devices.standaloneController.activeLookId = 'owned-look-0';
  project.devices.standaloneController.defaultLook = project.devices.standaloneController.looks[0].defaultLook;
  project.devices.standaloneController.playlist = [{ id: 'evening-cue', type: 'combo', lookId: 'owned-look-0', label: 'Owned look 1', dwellSeconds: 120, enabled: true, createdAt: 1 }];
  if (repeated) {
    const controller = project.devices.standaloneController;
    controller.playlist.push(
      { id: 'between-cues', type: 'pattern', patternId: 'fire', label: 'Fire', dwellSeconds: 30, enabled: true, createdAt: 2 },
      { ...controller.playlist[0], id: 'return-cue', dwellSeconds: 75, enabled: false, createdAt: 3 },
    );
    controller.controls.encoder.patternCycleIds = derivePlaylistLookIds(controller.playlist);
    controller.controls.playlist = { enabled: true, fadeMs: 2200 };
  }
  await page.addInitScript(value => {
    if (!localStorage.getItem('editing-fixture-initialized')) {
      localStorage.setItem('lw_autosave_v3', JSON.stringify(value));
      localStorage.setItem('editing-fixture-initialized', 'yes');
    }
  }, project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pm')).toBeVisible();
}

async function openStackEditor(page) {
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await page.getByTestId('project-stack-card').first().getByRole('button', { name: /^Edit / }).click();
  await expect(page.getByTestId('stack-save-bar')).toBeVisible();
}

const savedLooks = page => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices?.standaloneController?.looks || []);

test('renaming and updating a look keep its identity instead of making duplicates', async ({ page }) => {
  await openProject(page);
  await openStackEditor(page);
  await page.getByTestId('look-name').fill('Violet evening');
  await page.getByTestId('look-rename').click();
  await expect.poll(async () => (await savedLooks(page)).find(look => look.id === 'owned-look-0')?.label).toBe('Violet evening');
  expect(await savedLooks(page)).toHaveLength(1);
  const cues = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController.playlist);
  expect(cues).toEqual([expect.objectContaining({ id: 'evening-cue', lookId: 'owned-look-0', label: 'Violet evening', dwellSeconds: 120 })]);
  await page.reload();
  await openStackEditor(page);
  await expect(page.getByTestId('look-name')).toHaveValue('Violet evening');
});

test('delete and Undo restore the look and its playlist cue', async ({ page }) => {
  await openProject(page);
  await openStackEditor(page);
  await page.getByTestId('look-delete').click();
  await expect.poll(async () => (await savedLooks(page)).length).toBe(0);
  await page.getByTestId('look-delete-undo').click();
  await expect.poll(async () => (await savedLooks(page)).map(look => look.id)).toEqual(['owned-look-0']);
  const cues = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController.playlist);
  expect(cues).toEqual([expect.objectContaining({ id: 'evening-cue', lookId: 'owned-look-0', dwellSeconds: 120 })]);
});

test('undo restores repeated cue identities, order and timing beside a standalone pattern', async ({ page }, testInfo) => {
  await openProject(page, { repeated: true });
  await openStackEditor(page);
  const readState = () => page.evaluate(() => {
    const controller = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController;
    return { looks: controller.looks, playlist: controller.playlist, controls: controller.controls };
  });
  const before = await readState();
  await expect(page.getByTestId('look-delete')).toHaveAccessibleName(/delete.*2 entries from playlist/i);
  await page.getByTestId('look-delete').click();
  await expect.poll(async () => (await readState()).playlist.map(entry => entry.id)).toEqual(['between-cues']);
  await page.getByTestId('look-delete-undo').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Restored in');
  await expect.poll(readState).toEqual(before);
  await page.reload();
  await page.evaluate(() => { window.location.hash = '#screen=playlist'; });
  const rows = page.locator('[data-playlist-index]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('data-testid', 'playlist-row-evening-cue');
  await expect(rows.nth(1)).toHaveAttribute('data-testid', 'playlist-row-between-cues');
  await expect(rows.nth(2)).toHaveAttribute('data-testid', 'playlist-row-return-cue');
  await expect(page.getByTestId('playlist-dwell-evening-cue')).toHaveValue('2');
  await expect(page.getByTestId('playlist-dwell-return-cue')).toHaveValue('1.25');
  await expect(page.getByTestId('playlist-fade-seconds')).toHaveValue('2.2');
  await expect(page.getByTestId('playlist-enabled-toggle')).toHaveAttribute('aria-pressed', 'true');
  await rows.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('restored-playlist-cues.png') });
});

test('undo does not overwrite a newer edit to another look', async ({ page }) => {
  await openProject(page, { full: true, repeated: true });
  await openStackEditor(page);
  await page.getByTestId('look-delete').click();
  await expect.poll(async () => (await savedLooks(page)).length).toBe(11);
  await openStackEditor(page);
  await page.getByTestId('look-name').fill('Newer look name');
  await page.getByTestId('look-rename').click();
  await expect.poll(async () => (await savedLooks(page))[0]?.label).toBe('Newer look name');
  await page.getByTestId('look-delete-undo').click();
  await expect(page.getByTestId('look-save-status')).toContainText('changed after deletion');
  const current = await savedLooks(page);
  expect(current.some(look => look.id === 'owned-look-0')).toBe(false);
  expect(current[0].label).toBe('Newer look name');
});

test('saving a new look at capacity leaves all twelve existing looks intact', async ({ page }) => {
  await openProject(page, { full: true });
  await openStackEditor(page);
  await expect.poll(async () => (await savedLooks(page)).length).toBe(12);
  const before = await savedLooks(page);
  await page.getByTestId('look-save-as-new').click();
  await expect(page.getByTestId('look-save-status')).toContainText(/12|full|maximum|capacity/i);
  expect(await savedLooks(page)).toEqual(before);
});
