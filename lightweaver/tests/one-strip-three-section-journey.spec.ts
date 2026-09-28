import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { projectSkeletonFromCardStatus } from '../src/lib/discoveryCommit.js';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';

// A known count is seeded as project data: this test does not pretend that a
// person saw the final LED or answered discovery's physical light check.
function knownFortyOnePixelProject() {
  const project = createDefaultProject();
  const measured = projectSkeletonFromCardStatus({
    projectId: project.id,
    provisionalSetup: false,
    outputs: [{ id: 'out1', pin: 18, pixels: 41 }],
  });
  project.name = 'Forty-one light piece';
  project.portRoles = measured.portRoles;
  project.layout = {
    ...project.layout,
    starterPending: false,
    strips: measured.strips,
    patchBoard: measured.patchBoard,
    wiring: measured.wiring,
  };
  project.devices.standaloneController = {
    ...project.devices.standaloneController,
    outputs: measured.outputs,
    led: { ...project.devices.standaloneController.led, outputs: measured.outputs, pixels: 41 },
  };
  return project;
}

test('GPIO 18: divide 41 lights into three sections and retain three editable arrangements', async ({ page }) => {
  // The simulator owns every local card address; no request reaches hardware.
  const card = createCardSimulator(cardState('factory-blank'));
  await card.install(page);
  const project = knownFortyOnePixelProject();
  await page.addInitScript(seed => {
    if (!localStorage.getItem('one-strip-three-section-seeded')) {
      localStorage.setItem('lw_autosave_v3', JSON.stringify(seed));
      localStorage.setItem('one-strip-three-section-seeded', 'yes');
    }
  }, project);

  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  await expect(page.getByTestId('gpio-group-18')).toContainText('41 LEDs');
  await page.locator('.la-strip-row').click();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('3');
  await expect.poll(() => page.locator('[data-testid^="divide-count-"]')
    .evaluateAll((inputs: HTMLInputElement[]) => inputs.map(input => Number(input.value))))
    .toEqual([14, 14, 13]);
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(page.locator('.la-strip-row')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.layout?.strips?.map((strip: { pixelCount: number }) => strip.pixelCount);
  })).toEqual([14, 14, 13]);

  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  const sections = page.locator('[data-testid^="section-target-"]:not([data-testid="section-target-all"])');
  await expect(sections).toHaveCount(3);
  const ids = await sections.evaluateAll((rows: HTMLElement[]) => rows.map(row => row.dataset.testid!.replace('section-target-', '')));
  const patterns = ['fire', 'ocean', 'plasma'];

  async function choose(sectionIndex: number, patternId: string) {
    await page.getByTestId(`section-target-${ids[sectionIndex]}`).click();
    await page.locator(`.pm-cards .pmcard[data-pattern-id="${patternId}"]`).click();
    await expect(page.getByTestId(`section-pattern-${ids[sectionIndex]}`))
      .toHaveText(patternId.charAt(0).toUpperCase() + patternId.slice(1));
  }

  async function keep(name: string) {
    await page.getByTestId('look-name').fill(name);
    await page.getByTestId('look-save-preset').click();
    await expect.poll(() => page.evaluate(label => {
      const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
      return saved.devices?.standaloneController?.looks?.some((look: { label: string }) => look.label === label);
    }, name)).toBe(true);
  }

  for (let index = 0; index < 3; index += 1) await choose(index, patterns[index]);
  await keep('Three colors');
  await choose(0, 'aurora');
  await keep('Aurora opening');
  await choose(1, 'fire');
  await keep('Warm middle');

  const before = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return {
      strips: saved.layout?.strips?.map((strip: { pixelCount: number }) => strip.pixelCount),
      outputs: saved.layout?.wiring?.outputs?.map((output: { pin: number }) => output.pin),
      looks: saved.devices?.standaloneController?.looks?.map((look: { id: string; label: string; sectionLooks: unknown }) => ({
        id: look.id, label: look.label, sectionLooks: look.sectionLooks,
      })),
    };
  });
  expect(before.strips).toEqual([14, 14, 13]);
  expect(before.outputs).toEqual([18]);
  expect(before.looks.map((look: { label: string }) => look.label)).toEqual(expect.arrayContaining([
    'Three colors', 'Aurora opening', 'Warm middle',
  ]));
  expect(new Set(before.looks.map((look: { id: string }) => look.id)).size).toBe(before.looks.length);
  for (const look of before.looks) expect(Object.keys(look.sectionLooks)).toHaveLength(3);
  const patternsByName = Object.fromEntries(before.looks.map((look: {
    label: string; sectionLooks: Record<string, { patternId: string }>;
  }) => [look.label, ids.map(id => look.sectionLooks[id]?.patternId)]));
  expect(patternsByName).toMatchObject({
    'Three colors': ['fire', 'ocean', 'plasma'],
    'Aurora opening': ['aurora', 'ocean', 'plasma'],
    'Warm middle': ['aurora', 'fire', 'plasma'],
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(sections).toHaveCount(3);
  const after = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return {
      strips: saved.layout?.strips?.map((strip: { pixelCount: number }) => strip.pixelCount),
      outputs: saved.layout?.wiring?.outputs?.map((output: { pin: number }) => output.pin),
      looks: saved.devices?.standaloneController?.looks?.map((look: { id: string; label: string; sectionLooks: unknown }) => ({
        id: look.id, label: look.label, sectionLooks: look.sectionLooks,
      })),
    };
  });
  expect(after).toEqual(before);
  for (const look of after.looks) {
    await page.locator(`.pm-cards .pmcard[data-pattern-id="${look.id}"]`).click();
    await expect(page.getByTestId('look-name')).toHaveValue(look.label);
  }
  expect(card.unhandled).toEqual([]);
});
