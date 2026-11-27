import { test, expect } from '@playwright/test';

const IDENTITIES = ['meteor', 'scanner', 'chase', 'plasma'];
const evidenceDir = process.env.LW_FLIP_EVIDENCE;

test('four sections keep independent effects while Draw flips only the chosen run', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#screen=layout');
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  const rows = page.locator('.la-strip-row');
  await expect(rows).toHaveCount(1);
  const count = page.getByRole('spinbutton', { name: 'Line LED count' });
  await count.fill('41');
  await count.blur();
  await page.locator('[data-testid^="divide-toggle-"]').click();
  await page.locator('[data-testid^="divide-sections-"]').fill('4');
  await page.locator('[data-testid^="divide-commit-"]').click();
  await expect(rows).toHaveCount(4);

  await page.goto('/#screen=pattern');
  const sections = page.locator('[data-testid^="section-target-"]:not([data-testid="section-target-all"])');
  await expect(sections).toHaveCount(4);
  for (const [index, pattern] of IDENTITIES.entries()) {
    await sections.nth(index).click();
    await page.locator(`.pm-cards .pmcard[data-pattern-id="${pattern}"]`).click();
  }
  await page.getByTestId('stack-new').click();
  await page.getByTestId('look-name').fill('Four directions');
  await page.getByTestId('look-save-preset').click();
  const readProject = () => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  await expect.poll(async () => (await readProject()).devices.standaloneController.looks
    .some((look: { label: string }) => look.label === 'Four directions')).toBe(true);
  const original = await readProject();
  const ids = original.layout.strips.map((strip: { id: string }) => strip.id);
  const runsNow = (saved: typeof original) => ids.map((id: string) =>
    saved.layout.wiring.runs.find((run: { source?: { stripId: string }; physicalDirection: string }) => run.source?.stripId === id));
  const directions = async () => runsNow(await readProject()).map((run: { physicalDirection: string }) => run.physicalDirection);
  const forward = ['source-forward', 'source-forward', 'source-forward', 'source-forward'];
  const reversed = ['source-reverse', 'source-reverse', 'source-reverse', 'source-reverse'];
  expect(await directions()).toEqual(forward);
  expect(original.layout.wiring.outputs).toHaveLength(1);
  expect(original.layout.strips.map((strip: { pixelCount: number }) => strip.pixelCount)).toEqual([11, 10, 10, 10]);

  const flipPart = async (index: number) => {
    await rows.nth(index).locator('.layer-name').click();
    await page.getByRole('button', { name: `Flip playback direction of Part ${index + 1}`, exact: true }).click();
  };
  await page.goto('/#screen=layout');
  await flipPart(1);
  await expect.poll(directions).toEqual(['source-forward', 'source-reverse', 'source-forward', 'source-forward']);
  if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/part-2-flipped-desktop.png` });
  await page.reload();
  await rows.nth(1).locator('.layer-name').click();
  await expect(page.getByRole('button', { name: 'Flip playback direction of Part 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  if (evidenceDir) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Flip playback direction of Part 2', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidenceDir}/part-2-flipped-phone.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  for (const index of [0, 2, 3]) await flipPart(index);
  await expect.poll(directions).toEqual(reversed);
  const allFlipped = await readProject();
  expect(allFlipped.layout.wiring.outputs).toEqual(original.layout.wiring.outputs);
  expect(allFlipped.layout.strips).toEqual(original.layout.strips);
  expect(allFlipped.devices.standaloneController.looks).toEqual(original.devices.standaloneController.looks);

  for (const index of [0, 1, 2, 3]) await flipPart(index);
  await expect.poll(directions).toEqual(forward);
  const unflipped = await readProject();
  await page.addInitScript(saved => {
    if (sessionStorage.getItem('locked-direction-fixture')) return;
    sessionStorage.setItem('locked-direction-fixture', 'true');
    saved.layout.wiring.locked = true;
    saved.layout.wiring.verified = true;
    saved.layout.wiring.runs.forEach((run: { verified: boolean }) => { run.verified = true; });
    const snapshot = JSON.stringify(saved);
    localStorage.setItem('lw_autosave_v3', snapshot);
    localStorage.setItem('lw_autosave_v3_backup', snapshot);
  }, unflipped);
  await page.reload();
  await rows.nth(1).locator('.layer-name').click();
  const lockedFlip = page.getByRole('button', { name: 'Flip playback direction of Part 2', exact: true });
  await expect(lockedFlip).toBeDisabled();
  await expect(lockedFlip).toHaveAttribute('title', 'Unlock wiring in Test & Install');
});
