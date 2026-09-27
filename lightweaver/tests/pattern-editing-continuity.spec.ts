import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { normalizeSavedLooks } from '../src/lib/sectionLookModel.js';

async function openProject(page, { full = false } = {}) {
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

const savedLooks = page => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices?.standaloneController?.looks || []);

test('renaming and updating a look keep its identity instead of making duplicates', async ({ page }) => {
  await openProject(page);
  await page.getByTestId('look-name').fill('Violet evening');
  await page.getByTestId('look-rename').click();
  await expect.poll(async () => (await savedLooks(page)).find(look => look.id === 'owned-look-0')?.label).toBe('Violet evening');
  expect(await savedLooks(page)).toHaveLength(1);
  const cues = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController.playlist);
  expect(cues).toEqual([expect.objectContaining({ id: 'evening-cue', lookId: 'owned-look-0', label: 'Violet evening', dwellSeconds: 120 })]);
  await page.reload();
  await expect(page.getByTestId('look-name')).toHaveValue('Violet evening');
});

test('delete and Undo restore the look and its playlist cue', async ({ page }) => {
  await openProject(page);
  await page.getByTestId('look-delete').click();
  await expect.poll(async () => (await savedLooks(page)).length).toBe(0);
  await page.getByTestId('look-delete-undo').click();
  await expect.poll(async () => (await savedLooks(page)).map(look => look.id)).toEqual(['owned-look-0']);
  const cues = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController.playlist);
  expect(cues).toEqual([expect.objectContaining({ id: 'evening-cue', lookId: 'owned-look-0', dwellSeconds: 120 })]);
});

test('saving a new look at capacity leaves all twelve existing looks intact', async ({ page }) => {
  await openProject(page, { full: true });
  await expect.poll(async () => (await savedLooks(page)).length).toBe(12);
  const before = await savedLooks(page);
  await page.getByTestId('look-save-as-new').click();
  await expect(page.getByTestId('look-save-status')).toContainText(/12|full|maximum|capacity/i);
  expect(await savedLooks(page)).toEqual(before);
});
