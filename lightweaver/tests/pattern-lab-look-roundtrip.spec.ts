import { test, expect } from './studioTest';
import type { Page } from '@playwright/test';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { applySavedLookToPatchBoard, normalizeSavedLooks, normalizeSectionVisualLook } from '../src/lib/sectionLookModel.js';
import { recipeFromLook } from '../src/lib/patternLabFromLook.js';
import { normalizePatternLabRecipe } from '../src/lib/patternLabRecipe.js';
import { openControls } from './helpers/pattern-lab';

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
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: /Use in Project|Update.*project/i }).click();
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
