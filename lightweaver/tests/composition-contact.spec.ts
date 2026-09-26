import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { createPatternLabRecipe } from '../src/lib/patternLabRecipe.js';
import { openControls } from './helpers/pattern-lab';

function wiringAuthority(wiring: any) {
  const { migrationWarnings, ...physical } = wiring;
  return physical;
}

test('a complete layer stack survives Patterns, Lab, reload and update without changing wiring or playlist identity', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'composition-contact';
  project.layout.starterPending = false;
  const recipe = createPatternLabRecipe({
    id: 'composition-contact-recipe', name: 'Crest and branches',
    evolution: { enabled: false },
    layers: [
      { id: 'warm-underlay', name: 'Warm underlay', enabled: true,
        generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
        target: { kind: 'whole-piece', id: 'all' }, opacity: 0.35, blendMode: 'screen' },
      { id: 'quiet-top', name: 'Quiet top', enabled: false,
        generator: { kind: 'lightweaver-pattern', patternId: 'aurora', params: {} },
        target: { kind: 'whole-piece', id: 'all' }, opacity: 0.8, blendMode: 'multiply' },
    ],
  });
  await page.addInitScript(seed => {
    if (localStorage.getItem('composition-contact-seeded')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(seed));
    localStorage.setItem('composition-contact-seeded', 'true');
  }, project);
  const cardMutations: string[] = [];
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => {
    if (route.request().method() !== 'GET') cardMutations.push(route.request().url());
    return route.abort();
  });
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await openControls(page);
  const initialWiring = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout.wiring);
  await page.getByLabel('Import recipe').setInputFiles({
    name: 'composition.lwrecipe.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(recipe)),
  });
  const promoted = page.getByTestId('pattern-lab-use-in-project-promoted');
  await promoted.getByRole('button', { name: 'Add to Patterns', exact: true }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect(page.getByTestId('look-name')).toHaveValue(recipe.name);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  const controller = saved.devices.standaloneController;
  const look = controller.looks.find((item: any) => item.id === controller.activeLookId);
  expect(look.patternLabRecipe.layers).toEqual(recipe.layers);
  expect(look.projectOnly).toBe(true);
  expect(wiringAuthority(saved.layout.wiring)).toEqual(wiringAuthority(initialWiring));

  // A saved source may be referenced by several future Show entries. Editing
  // that source must preserve reference IDs, timing and enabled state even
  // when its current hardware route remains recording-only.
  const playlist = [
    { id: 'opening', type: 'combo', lookId: look.id, label: look.label, dwellSeconds: 31, enabled: true, createdAt: 1 },
    { id: 'return', type: 'combo', lookId: look.id, label: look.label, dwellSeconds: 47, enabled: false, createdAt: 2 },
  ];
  await page.evaluate(entries => {
    const value = JSON.parse(localStorage.getItem('lw_autosave_v3')!);
    value.devices.standaloneController.playlist = entries;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(value));
  }, playlist);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-name')).toHaveValue(recipe.name);
  await page.getByTestId('open-pattern-lab').click();
  await openControls(page);
  await expect(page.getByTestId('pattern-lab-draft-name')).toHaveValue(recipe.name);
  await page.getByTestId('pattern-lab-draft-name').fill('Crest after dusk');
  await promoted.getByRole('button', { name: 'Update in Patterns', exact: true }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect.poll(async () => {
    const value = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
    const next = value.devices?.standaloneController;
    const edited = next?.looks?.find((item: any) => item.id === look.id);
    return { layers: edited?.patternLabRecipe?.layers, name: edited?.label,
      count: next?.looks?.filter((item: any) => item.id === look.id).length,
      playlist: next?.playlist, wiring: wiringAuthority(value.layout?.wiring) };
  }).toEqual({ layers: recipe.layers, name: 'Crest after dusk', count: 1,
    playlist: playlist.map(entry => ({ ...entry, label: 'Crest after dusk' })),
    wiring: wiringAuthority(initialWiring) });
  expect(cardMutations).toEqual([]);
});
