import { test, expect } from './studioTest';

test('Wire keeps a full-width chipset choice and power review available when the plan is folded', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.layout.starterPending = false;
    project.layout.strips = [{
      id: 'test-strip', name: 'Long gallery strip',
      pathData: 'M 20 100 H 620', pixelCount: 120,
      x: 0, y: 0, emit: 'omni', angle: 0, reversed: false,
      speed: 1, brightness: 1, hueShift: 0, patternId: null,
    }];
    project.layout.wiring = null;
    project.devices.standaloneController.led = {
      ...project.devices.standaloneController.led,
      type: 'WS2815', psuAmps: 1, milliampsPerPixel: 30,
    };
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  const selector = page.getByTestId('project-led-chipset').getByTestId('led-chipset-select');
  await expect(selector).toBeVisible();
  await expect(selector.locator('option')).toHaveCount(2);
  await expect(selector.locator('option:checked')).toHaveText('WS2815 · 12V');
  await expect(page.getByTestId('project-led-chipset').getByTestId('led-chipset-hint')).toContainText('backup data line');
  const selectorWidth = await selector.evaluate(element => element.getBoundingClientRect().width);
  console.log(`Wire chipset control width at 1280×720: ${Math.round(selectorWidth)}px`);
  expect(selectorWidth).toBeGreaterThanOrEqual(240);
  await selector.selectOption('WS2812B');
  await expect(page.getByTestId('project-led-chipset').getByTestId('led-chipset-hint')).toContainText('NeoPixel');
  await selector.selectOption('WS2815');

  const plan = page.getByTestId('wire-plan');
  await plan.locator('summary').click();
  await expect(plan).toHaveJSProperty('open', false);
  await expect(page.getByTestId('wire-power-warning')).toBeVisible();
  await expect(page.getByTestId('wire-power-warning')).toContainText('full white');
  await expect(page.getByTestId('wire-power-warning')).toContainText('your supply is 1 A');
  await page.screenshot({ path: '../.claude/ux-screens/interface-clarity/layout-after.png' });

  const review = page.getByRole('button', { name: 'Review power settings' });
  await review.click();
  await expect(page.getByTestId('wire-power-section')).toHaveJSProperty('open', true);
  await expect(page.getByLabel('Power supply amps')).toBeFocused();
  await expect(page.getByLabel('Power supply amps')).toHaveValue('1');
});

test('a new Layout keeps the starting chipset guidance beneath its compact choice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });

  const starter = page.getByTestId('layout-primitive-picker');
  await expect(starter).toBeVisible();
  const selector = starter.getByTestId('led-chipset-select');
  await expect(selector.locator('option')).toHaveCount(2);
  await expect(starter.getByTestId('led-chipset-hint')).toBeVisible();
  await selector.selectOption('WS2812B');
  await expect(starter.getByTestId('led-chipset-hint')).toContainText('5V strip');
  await page.screenshot({ path: '../.claude/ux-screens/interface-clarity/phone-starter-after.png' });
});
