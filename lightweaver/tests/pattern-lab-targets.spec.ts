import { test, expect } from './studioTest';
import type { Page } from '@playwright/test';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { applySavedLookToPatchBoard, normalizeSavedLooks, normalizeSectionVisualLook } from '../src/lib/sectionLookModel.js';
import { choosePattern, openControls, openStep } from './helpers/pattern-lab';

const PETALS = 'patch-default-outer-circle';
const CENTRE = 'patch-default-inner-circle';

function artworkFixture() {
  const project = createDefaultProject();
  project.id = 'artwork-lab-targets';
  project.name = 'Petals and Centre';
  project.layout.starterPending = false;
  project.layout.strips.forEach((strip, index) => { strip.name = index ? 'Centre' : 'Petals'; });
  project.layout.patchBoard.patches.forEach((patch, index) => { patch.name = index ? 'Centre' : 'Petals'; });
  const defaultLook = normalizeSectionVisualLook({ patternId: 'aurora', brightness: 0.7, speed: 1 });
  const sectionLooks = {
    [PETALS]: normalizeSectionVisualLook({ ...defaultLook, customHue: 20, customSaturation: 180, brightness: 0.4 }),
    [CENTRE]: normalizeSectionVisualLook({ ...defaultLook, customHue: 150, customSaturation: 160, brightness: 0.8 }),
  };
  const savedLook = normalizeSavedLooks([{
    id: 'sculpture-look', label: 'Evening sculpture', defaultLook, sectionLooks, updatedAt: 1,
  }])[0];
  project.layout.patchBoard = applySavedLookToPatchBoard({ patchBoard: project.layout.patchBoard, strips: project.layout.strips, savedLook });
  project.devices.standaloneController = { ...project.devices.standaloneController, defaultLook, activeLookId: savedLook.id, looks: [savedLook] };
  return { project, savedLook };
}

async function openSectionInLab(page: Page, selected = CENTRE) {
  const fixture = artworkFixture();
  await page.addInitScript(project => {
    if (localStorage.getItem('artwork-lab-seeded')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('artwork-lab-seeded', 'yes');
  }, fixture.project);
  // A browser-only editing test must never contact physical lights.
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-name')).toHaveValue(fixture.savedLook.label);
  await page.getByTestId(`section-target-${selected}`).click();
  await page.getByTestId('open-pattern-lab').click();
  await expect(page).toHaveURL(/screen=pattern-lab/);
  const dismissNotice = page.getByRole('button', { name: 'Dismiss notice', exact: true });
  if (await dismissNotice.isVisible()) await dismissNotice.click();
  return fixture;
}

async function savedLook(page: Page) {
  return page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices?.standaloneController?.looks?.find(look => look.id === 'sculpture-look');
  });
}

test('Lab opens on the selected named artwork section and retains it after reload', async ({ page }) => {
  await openSectionInLab(page);
  const area = page.getByRole('combobox', { name: 'Edit area', exact: true });
  await expect(area).toHaveValue(CENTRE);
  await expect(area.locator('option')).toHaveText(['Whole piece', 'Petals', 'Centre']);
  await area.selectOption(PETALS);
  await expect(area).toHaveValue(PETALS);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(area).toHaveValue(PETALS);
});

test('editing Centre keeps Petals and the default look intact through project handoff', async ({ page }) => {
  const fixture = await openSectionInLab(page);
  const area = page.getByRole('combobox', { name: 'Edit area', exact: true });
  await expect(area).toHaveValue(CENTRE);
  await openControls(page);
  await openStep(page, 'sculpt');
  await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('55');
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: /Add to Patterns|Update in Patterns/i }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect.poll(async () => (await savedLook(page))?.sectionLooks?.[CENTRE]?.brightness).toBe(0.55);
  const result = await savedLook(page);
  expect(result.sectionLooks[PETALS]).toEqual(fixture.savedLook.sectionLooks[PETALS]);
  expect(result.defaultLook).toEqual(fixture.savedLook.defaultLook);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect((await savedLook(page)).sectionLooks).toEqual(result.sectionLooks);
});

test('switching artwork sections keeps each draft and its own controls', async ({ page }) => {
  await openSectionInLab(page);
  const area = page.getByRole('combobox', { name: 'Edit area', exact: true });
  await expect(area).toHaveValue(CENTRE);
  await openControls(page);
  await openStep(page, 'sculpt');
  const brightness = page.getByRole('slider', { name: 'Brightness', exact: true });
  await expect(brightness).toHaveValue('80');
  await brightness.fill('55');
  await page.getByRole('slider', { name: 'Color', exact: true }).fill('68');
  await area.selectOption(PETALS);
  await expect(brightness).toHaveValue('40');
  await brightness.fill('25');
  await area.selectOption(CENTRE);
  await expect(brightness).toHaveValue('55');
  await expect(page.getByRole('slider', { name: 'Color', exact: true })).toHaveValue('68');
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: /Add to Patterns|Update in Patterns/i }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect.poll(async () => {
    const look = await savedLook(page);
    return [look?.sectionLooks?.[CENTRE]?.brightness, look?.sectionLooks?.[PETALS]?.brightness];
  }).toEqual([0.55, 0.25]);
});

test('changing a section pattern preserves every other section in the saved look', async ({ page }) => {
  const fixture = await openSectionInLab(page);
  await choosePattern(page, 'ocean');
  await expect(page.getByRole('combobox', { name: 'Edit area', exact: true })).toHaveValue(CENTRE);
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: /Add to Patterns|Update in Patterns/i }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect.poll(async () => (await savedLook(page))?.sectionLooks?.[CENTRE]?.patternId).toBe('ocean');
  const result = await savedLook(page);
  expect(result.sectionLooks[PETALS]).toEqual(fixture.savedLook.sectionLooks[PETALS]);
  expect(result.defaultLook).toEqual(fixture.savedLook.defaultLook);
});

test('a new native Lab draft can select existing artwork areas without a Patterns handoff', async ({ page }) => {
  const { project } = artworkFixture();
  await page.addInitScript(project => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  }, project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  const area = page.getByRole('combobox', { name: 'Edit area', exact: true });
  await expect(area).toHaveValue('all');
  await area.selectOption(PETALS);
  await expect(area).toHaveValue('all');
  await expect(page.getByRole('alert').filter({ hasText: /simple pattern/i })).toBeVisible();
  await choosePattern(page, 'aurora');
  await area.selectOption(PETALS);
  await expect(area).toHaveValue(PETALS);
  await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('40');
});

test('removing the selected section preserves the draft and requires an explicit new target', async ({ page }) => {
  await openSectionInLab(page);
  const area = page.getByRole('combobox', { name: 'Edit area', exact: true });
  await expect(area).toHaveValue(CENTRE);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lw_pattern_edit_v1:artwork-lab-targets:lab'))).not.toBeNull();
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    project.layout.strips = project.layout.strips.filter(strip => strip.id !== 'default-inner-circle');
    project.layout.patchBoard.patches = project.layout.patchBoard.patches.filter(patch => patch.id !== 'patch-default-inner-circle');
    for (const chain of project.layout.patchBoard.chains) chain.rowIds = chain.rowIds.filter(id => id !== 'patch-default-inner-circle');
    project.layout.wiring.runs = project.layout.wiring.runs.filter(run => run.id !== 'run-default-inner-circle');
    for (const output of project.layout.wiring.outputs) output.runIds = output.runIds.filter(id => id !== 'run-default-inner-circle');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(area).toHaveValue(CENTRE);
  await expect(page.getByRole('alert').filter({ hasText: /no longer exists/i })).toBeVisible();
  const useInProject = page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: /Add to Patterns|Update in Patterns/i });
  await expect(useInProject).toBeVisible();
  await expect(useInProject).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save private draft', exact: true })).toBeDisabled();
  await area.selectOption(PETALS);
  await expect(area).toHaveValue(PETALS);
  await expect(page.getByRole('alert').filter({ hasText: /no longer exists/i })).toHaveCount(0);
});

test('the artwork selects its section with a pointer on desktop and a phone-sized screen', async ({ page }, testInfo) => {
  const { project } = await openSectionInLab(page);
  const area = page.getByRole('combobox', { name: 'Edit area', exact: true });
  await expect(area).toHaveValue(CENTRE);
  const canvas = page.getByTestId('pattern-lab-mapped-preview').locator('canvas').first();
  await expect(canvas).toBeVisible();
  const [vx, vy, vw, vh] = project.layout.viewBox.split(/[ ,]+/).map(Number);
  const selectOnArtwork = async (index: number, expectedId: string) => {
    const point = project.layout.strips[index].pixels[0];
    const box = (await canvas.boundingBox())!;
    const scale = Math.min(box.width / vw, box.height / vh);
    await canvas.click({ position: {
      x: (box.width - vw * scale) / 2 + (point.x - vx) * scale,
      y: (box.height - vh * scale) / 2 + (point.y - vy) * scale,
    } });
    await expect(area).toHaveValue(expectedId);
  };
  await selectOnArtwork(0, PETALS);
  await openControls(page);
  await openStep(page, 'sculpt');
  await page.screenshot({ path: testInfo.outputPath('artwork-lab-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await selectOnArtwork(1, CENTRE);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  const box = (await area.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('artwork-lab-phone.png') });
});
