import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { createPatternLabRecipe } from '../src/lib/patternLabRecipe.js';
import { openControls } from './helpers/pattern-lab';

test('section layers record through the real Lab controls into an exact multi-output package', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const project = createDefaultProject();
  project.id = 'recorded-composition-ui';
  project.name = 'Recorded branches';
  project.layout.starterPending = false;
  const original = project.layout.strips[0];
  project.layout.strips = [2, 3].map((count, index) => ({ ...original,
    id: `branch-${index}`, name: `Branch ${index + 1}`, pixelCount: count,
    pathData: `M 20 ${20 + index * 40} L 120 ${25 + index * 40}`,
    pixels: Array.from({ length: count }, (_, i) => ({ x: 20 + i * 50, y: 20 + index * 40 })),
  }));
  project.layout.sectionFamilies = [];
  project.layout.layerGroups = [];
  project.layout.patchBoard = null;
  project.layout.wiring = { version: 1, locked: true, verified: true,
    outputs: [0, 1].map(index => ({ id: `out${index + 1}`, name: `Output ${index + 1}`, pin: 16 + index, runIds: [`run-${index}`] })),
    runs: [2, 3].map((count, index) => ({ id: `run-${index}`, type: 'strip', verified: true,
      source: { stripId: `branch-${index}`, from: 0, to: count - 1 },
      directionPolicy: 'fixed', physicalDirection: index ? 'source-reverse' : 'source-forward', seamLed: null })),
  };
  const recipe = createPatternLabRecipe({ id: 'recorded-branches', name: 'Recorded branches',
    evolution: { enabled: false, durationSeconds: 300 },
    layers: [{ id: 'fire-overlay', name: 'Fire overlay', enabled: true,
      generator: { kind: 'lightweaver-pattern', patternId: 'fire', params: {} },
      target: { kind: 'whole-piece', id: 'all' }, opacity: 0.4, blendMode: 'screen' }],
  });
  await page.addInitScript(seed => localStorage.setItem('lw_autosave_v3', JSON.stringify(seed)), project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await openControls(page);
  await page.getByLabel('Import recipe').setInputFiles({ name: 'recorded.lwrecipe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(recipe)) });
  const layers = page.getByTestId('pattern-lab-layers');
  await layers.getByRole('button', { name: /Layers Base/ }).click();
  await layers.getByRole('button', { name: 'Edit Fire overlay', exact: true }).click();
  const targets = layers.getByLabel('Layer target');
  const targetId = await targets.locator('option').nth(1).getAttribute('value');
  expect(targetId).toBeTruthy();
  await targets.selectOption(targetId!);
  const tools = page.getByTestId('pattern-lab-runtime-tools');
  await tools.locator(':scope > summary').click();
  await tools.getByRole('button', { name: 'Bake to card', exact: true }).click();
  await expect(page.getByTestId('pattern-lab-bake-status')).toContainText('Exported 7200 frames for 5 pixels', { timeout: 90_000 });
  const handoff = page.getByTestId('pattern-lab-project-handoff');
  await handoff.getByRole('button', { name: 'Review Use in Project' }).click();
  const packageDownload = page.waitForEvent('download', { predicate: value => value.suggestedFilename().endsWith('.lightweaver-controller.json') });
  await handoff.getByRole('button', { name: 'Add to project', exact: true }).click();
  await expect(page.getByTestId('pattern-lab-handoff-status')).toContainText('verified controller package');
  const stream = await (await packageDownload).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const profile = exported.files['/lightweaver.json'];
  expect(profile.runtimeMode).toBe('sd-sequence');
  expect(profile.outputs.map((output: any) => [output.pin, output.pixels])).toEqual([[16, 2], [17, 3]]);
  const sidecarPath = Object.keys(exported.files).find(path => path.endsWith('.lwseq.json'))!;
  const sidecar = JSON.parse(exported.files[sidecarPath]);
  expect(sidecar.recipe.layers[0].target).toMatchObject({ kind: 'section', id: targetId });
  expect(sidecar.recipe.layers[0].blendMode).toBe('screen');
  expect(sidecar.recipe.layers[0].opacity).toBe(0.4);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3')!).devices.standaloneController.sequenceAssets?.[0]?.manifest.recipe)).toEqual(sidecar.recipe);
  await page.screenshot({ path: testInfo.outputPath('recorded-composition-package.png'), fullPage: true });
});
