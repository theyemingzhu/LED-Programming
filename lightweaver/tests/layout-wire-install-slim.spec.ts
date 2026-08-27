import { test, expect } from '@playwright/test';

// Wire keeps every strip tool. Test & Install is the check + install, not a
// second copy of the strip list.

const PATH = 'M 10 10 L 200 10';

function project({ designPixels, outputPin, countedPin, countedPixels }: {
  designPixels: number; outputPin: number; countedPin: number; countedPixels: number;
}) {
  const half = Math.floor(designPixels / 2);
  const strips = [
    { id: 'outer', name: 'Outer circle', pathData: PATH, pixelCount: designPixels - half, color: '#f0a', x: 0, y: 0 },
    { id: 'inner', name: 'Inner circle', pathData: PATH, pixelCount: half, color: '#0af', x: 0, y: 0 },
  ];
  return {
    version: 3,
    id: 'slim-fixture',
    name: 'Slim fixture',
    portRoles: [
      { pin: countedPin, role: 'strip', pixelCount: countedPixels, controlKind: '' },
    ],
    layout: {
      strips,
      starterPending: false,
      svgText: '',
      viewBox: '0 0 400 400',
      wiring: {
        version: 1,
        locked: false,
        verified: false,
        outputs: [{ id: 'out1', name: 'Output 1', pin: outputPin, runIds: ['run-outer', 'run-inner'] }],
        runs: [
          { id: 'run-outer', type: 'strip', source: { stripId: 'outer', from: 0, to: designPixels - half - 1 }, verified: false },
          { id: 'run-inner', type: 'strip', source: { stripId: 'inner', from: 0, to: half - 1 }, verified: false },
        ],
      },
    },
  };
}

async function openLayout(page: any, hash = '#screen=layout') {
  await page.goto(`/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function openWirePanel(page: any, fixture: object) {
  await page.goto('/#screen=layout&mode=wire', { waitUntil: 'domcontentloaded' });
  await page.evaluate((data) => {
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', JSON.stringify(data));
  }, fixture);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-mode-wire').click();
  await expect(page.getByTestId('layout-wire-panel')).toBeVisible();
}

test('Wire keeps strip tools visible and drops the always-true first-to-last label', async ({ page }) => {
  await openLayout(page);
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();

  const strip = page.locator('[data-strip-id]').first();
  if (!await strip.locator('.la-strip-detail').first().isVisible()) {
    await strip.locator('.la-strip-row').first().click();
  }
  const detail = strip.locator('.la-strip-detail').first();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Flip path direction' })).toBeVisible();
  await expect(detail.getByRole('button', { name: /Reverse data direction/ })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Set first LED' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Edit Kaleidoscope reflection points' })).toBeVisible();
  await expect(detail.getByRole('button', { name: /Split / })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Duplicate strip' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Remove strip' })).toBeVisible();
  await expect(detail.getByLabel('GPIO output')).toBeVisible();
  await expect(page.getByTestId('strip-density-control')).toBeVisible();
  await expect(page.getByTestId('layout-add-strip')).toBeVisible();

  await expect(page.getByTestId('gpio-group-16')).toBeVisible();
  await expect(page.getByTestId('gpio-group-16')).not.toContainText('first → last');
  await expect(page.locator('.panel-head', { hasText: 'LED strips' })).not.toContainText('wiring order');
});

test('Test & Install is a checklist, not a second strip editor', async ({ page }) => {
  await openWirePanel(page, project({
    designPixels: 44, outputPin: 16, countedPin: 16, countedPixels: 44,
  }));

  const panel = page.getByTestId('layout-wire-panel');
  await expect(panel.locator('.lww-plan-head .meta')).toContainText('2 strips · 44 LEDs');
  await expect(page.getByTestId('test-install-plan-summary')).toHaveCount(0);
  await expect(page.getByTestId('start-led-check')).toBeVisible();
  await expect(page.getByTestId('project-led-chipset')).toBeHidden();

  const advanced = page.getByTestId('advanced-installation-tools');
  await advanced.locator('summary').first().click();
  await expect(page.getByTestId('project-led-chipset')).toBeVisible();
});

test('a matching card does not reprint the plan; a wrong GPIO still offers the fix', async ({ page }) => {
  await openWirePanel(page, project({
    designPixels: 41, outputPin: 18, countedPin: 18, countedPixels: 41,
  }));
  await expect(page.getByTestId('wire-capacity')).toHaveCount(0);
  await expect(page.getByTestId('wire-recount')).toBeHidden();

  const advanced = page.getByTestId('advanced-installation-tools');
  await advanced.locator('summary').first().click();
  await expect(page.getByTestId('wire-recount')).toBeVisible();

  await openWirePanel(page, project({
    designPixels: 400, outputPin: 16, countedPin: 18, countedPixels: 41,
  }));
  await expect(page.getByTestId('wire-mismatch-18')).toBeVisible();
  await expect(page.getByTestId('wire-adopt-18')).toBeVisible();
});
