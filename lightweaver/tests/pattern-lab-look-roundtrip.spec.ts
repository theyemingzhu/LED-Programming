import { test, expect } from './studioTest';
import type { Page } from '@playwright/test';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { applySavedLookToPatchBoard, normalizeSavedLooks, normalizeSectionVisualLook } from '../src/lib/sectionLookModel.js';
import { recipeFromLook } from '../src/lib/patternLabFromLook.js';
import { normalizePatternLabRecipe } from '../src/lib/patternLabRecipe.js';
import { openControls } from './helpers/pattern-lab';
import { choosePattern } from './helpers/pattern-lab';

function nativeFixture() {
  const project = createDefaultProject();
  project.id = 'native-look-roundtrip-fixture';
  project.name = 'Native look continuity';
  project.layout.starterPending = false;
  const defaultLook = normalizeSectionVisualLook({
    patternId: 'aurora', brightness: 0.42, speed: 0.75,
    customHue: 32, customSaturation: 0, hueShift: 80,
    customBreathe: true, breatheLowerPct: 24, breatheUpperPct: 93,
    breatheCycleSeconds: 17, customDrift: true,
  });
  const sectionLooks = Object.fromEntries(project.layout.patchBoard.patches.map((patch, index) => [
    patch.id,
    normalizeSectionVisualLook({ ...defaultLook, brightness: 0.3 + index * 0.1, customHue: 90 + index, customSaturation: 120 + index, customDrift: false }),
  ]));
  const source = normalizeSavedLooks([{ id: 'owned-native-look', label: 'My silver aurora', defaultLook, sectionLooks, updatedAt: 1 }])[0];
  const recipe = normalizePatternLabRecipe({
    ...recipeFromLook(source),
    id: 'editable-silver-aurora',
    seed: 73,
    evolution: { enabled: false },
    provenance: [{ kind: 'owner', note: 'Preserve this editable source' }],
  });
  const savedLook = normalizeSavedLooks([{ ...source, patternLabRecipe: recipe }])[0];
  project.layout.patchBoard = applySavedLookToPatchBoard({ patchBoard: project.layout.patchBoard, strips: project.layout.strips, savedLook });
  project.devices.standaloneController = {
    ...project.devices.standaloneController,
    defaultLook,
    activeLookId: savedLook.id,
    looks: [savedLook],
    playlist: [
      { id: 'evening-first', type: 'combo', lookId: savedLook.id, label: savedLook.label, dwellSeconds: 120, enabled: true, createdAt: 1 },
      { id: 'evening-return', type: 'combo', lookId: savedLook.id, label: savedLook.label, dwellSeconds: 37, enabled: false, createdAt: 2 },
    ],
  };
  return { project, savedLook, recipe };
}

async function persistedController(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices?.standaloneController);
}

async function passThroughLab(page: Page, name: string) {
  await page.getByTestId('open-pattern-lab').click();
  await expect(page).toHaveURL(/screen=pattern-lab/);
  await openControls(page);
  await expect(page.getByTestId('pattern-lab-draft-name')).toHaveValue(name);
  await expect(page.getByTestId('pattern-lab-compat-badge')).toHaveAttribute('data-classification', 'live-on-card');
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: 'Update in Patterns', exact: true }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect(page.getByTestId('look-name')).toHaveValue(name);
}

test('Patterns to Lab and back preserves a linked native look, exact settings and playlist identity across reload', async ({ page }) => {
  const { project, savedLook, recipe } = nativeFixture();
  await page.addInitScript(value => {
    if (localStorage.getItem('native-roundtrip-initialized')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(value));
    localStorage.setItem('native-roundtrip-initialized', 'yes');
  }, project);
  // This test exercises browser persistence, never physical card output.
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-name')).toHaveValue(savedLook.label);
  // Patterns remembers its preview section; this roundtrip explicitly edits the whole look.
  await page.getByTestId('section-target-all').click();
  await expect(page.getByTestId('look-saturation-slider')).toHaveValue('0');
  await expect(page.getByTestId('look-hue-slider')).toHaveValue('32');
  await passThroughLab(page, savedLook.label);

  const assertPreserved = async () => {
    await expect.poll(async () => {
      const controller = await persistedController(page);
      const look = controller?.looks?.[0];
      return {
        count: controller?.looks?.length,
        activeLookId: controller?.activeLookId,
        id: look?.id,
        label: look?.label,
        defaultLook: look?.defaultLook,
        sectionLooks: look?.sectionLooks,
        playlist: controller?.playlist,
        recipeId: look?.patternLabRecipe?.id,
        seed: look?.patternLabRecipe?.seed,
        palette: look?.patternLabRecipe?.palette,
        provenance: look?.patternLabRecipe?.provenance,
      };
    }).toEqual({
      count: 1,
      activeLookId: savedLook.id,
      id: savedLook.id,
      label: savedLook.label,
      defaultLook: savedLook.defaultLook,
      sectionLooks: savedLook.sectionLooks,
      playlist: project.devices.standaloneController.playlist,
      recipeId: recipe.id,
      seed: recipe.seed,
      palette: recipe.palette,
      provenance: recipe.provenance,
    });
  };
  await assertPreserved();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-name')).toHaveValue(savedLook.label);
  // Patterns remembers its preview section; this roundtrip explicitly edits the whole look.
  await page.getByTestId('section-target-all').click();
  await expect(page.getByTestId('look-saturation-slider')).toHaveValue('0');
  await passThroughLab(page, savedLook.label);
  await assertPreserved();
});

test('a new Lab creation is added to Patterns, selected, and reopens as the same editable look after reload', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'new-lab-look-roundtrip';
  project.name = 'New Lab look roundtrip';
  project.layout.starterPending = false;
  await page.addInitScript(value => {
    if (localStorage.getItem('new-lab-look-initialized')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(value));
    localStorage.setItem('new-lab-look-initialized', 'yes');
  }, project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await openControls(page);
  await choosePattern(page, 'aurora');
  await page.getByTestId('pattern-lab-draft-name').fill('Gallery sunrise');

  const handoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  await expect(handoff.getByRole('button', { name: 'Add to Patterns', exact: true })).toBeVisible();
  await handoff.getByRole('button', { name: 'Add to Patterns', exact: true }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect(page.getByTestId('look-name')).toHaveValue('Gallery sunrise');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-name')).toHaveValue('Gallery sunrise');
  await page.getByTestId('open-pattern-lab').click();
  await expect(page).toHaveURL(/screen=pattern-lab/);
  await openControls(page);
  await expect(page.getByTestId('pattern-lab-draft-name')).toHaveValue('Gallery sunrise');
  await expect(page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: 'Update in Patterns', exact: true })).toBeVisible();
});

test('a Studio-only Lab creation enters Patterns and reopens without changing card-ready project state', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'studio-only-lab-roundtrip';
  project.name = 'Studio-only Lab roundtrip';
  project.layout.starterPending = false;
  const originalDefaultLook = structuredClone(project.devices.standaloneController.defaultLook);
  const originalPatchBoard = structuredClone(project.layout.patchBoard);
  await page.addInitScript(value => {
    if (localStorage.getItem('studio-only-lab-initialized')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(value));
    localStorage.setItem('studio-only-lab-initialized', 'yes');
  }, project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await openControls(page);

  const studioOnlyRecipe = normalizePatternLabRecipe({
    ...recipeFromLook(normalizeSavedLooks([{
      id: 'studio-only-source',
      label: 'Reactive gallery wash',
      defaultLook: originalDefaultLook,
      sectionLooks: {},
    }])[0]),
    id: 'reactive-gallery-wash',
    name: 'Reactive gallery wash',
    requirements: [{ capability: 'live-audio', required: true, bakeable: false }],
  });
  await page.getByLabel('Import recipe').setInputFiles({
    name: 'reactive-gallery-wash.lwrecipe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(studioOnlyRecipe)),
  });

  const handoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  await expect(page.getByTestId('pattern-lab-compat-badge')).toHaveAttribute('data-classification', 'studio-only');
  await expect(handoff.getByRole('button', { name: 'Add to Patterns', exact: true })).toBeEnabled();
  await handoff.getByRole('button', { name: 'Add to Patterns', exact: true }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect(page.getByTestId('look-name')).toHaveValue('Reactive gallery wash');
  await expect(page.getByTestId('look-save-status')).toContainText('Studio only');
  await expect(page.getByText('Choose a pattern or Lab look, tune it, then install card-ready designs when ready.', { exact: true })).toBeVisible();
  const install = page.getByRole('button', { name: 'Studio only', exact: true });
  await expect(install).toBeDisabled();
  await expect(install).toHaveAttribute('title', 'This Lab design stays in Studio and Patterns. It cannot be installed on the card yet.');

  await expect.poll(async () => {
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('lw_autosave_v3') || '{}'));
    const controller = saved.devices?.standaloneController;
    return {
      defaultLook: controller?.defaultLook,
      projectOnly: controller?.looks?.find((look: { id?: string }) => look.id === controller?.activeLookId)?.projectOnly,
      classification: controller?.looks?.find((look: { id?: string }) => look.id === controller?.activeLookId)?.patternLabClassification,
      patchBoard: saved.layout?.patchBoard,
    };
  }).toEqual({
    defaultLook: originalDefaultLook,
    projectOnly: true,
    classification: 'studio-only',
    patchBoard: originalPatchBoard,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-name')).toHaveValue('Reactive gallery wash');
  await expect(page.getByTestId('look-save-preset')).toHaveText('Open Studio-only design in Lab');
  await page.getByTestId('look-save-preset').click();
  await expect(page).toHaveURL(/screen=pattern-lab/);
  await openControls(page);
  await expect(page.getByTestId('pattern-lab-draft-name')).toHaveValue('Reactive gallery wash');
  await expect(page.getByTestId('pattern-lab-compat-badge')).toHaveAttribute('data-classification', 'studio-only');
  await expect(page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: 'Update in Patterns', exact: true })).toBeEnabled();
});
