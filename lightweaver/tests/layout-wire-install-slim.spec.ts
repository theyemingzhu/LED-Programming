import { test, expect, type Page } from '@playwright/test';

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

async function openLegacyCardInstall(page: Page, fixture: object) {
  await page.route('http://{lightweaver.local,192.168.4.1}/**', route => route.abort());
  await page.addInitScript(data => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(data));
  }, fixture);
  await page.goto('/#screen=layout&mode=wire', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/#screen=card&section=setup&task=install-project$/);
  await expect(page.getByTestId('commissioning-step')).toBeVisible();
}

async function openLayoutTools(page: any, fixture: object) {
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await page.evaluate((data) => {
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', JSON.stringify(data));
  }, fixture);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  await page.getByTestId('layout-specs-trigger').click();
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
  await page.getByLabel('More strip actions', { exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Flip path direction' })).toBeVisible();
  await expect(detail.getByRole('button', { name: /Reverse data direction/ })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Set first LED' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Edit Kaleidoscope reflection points' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duplicate strip', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove strip', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail.getByLabel('GPIO output')).toBeVisible();
  await expect(page.getByTestId('strip-density-control')).toBeVisible();
  await expect(page.getByTestId('layout-add-strip')).toBeVisible();

  await expect(page.getByTestId('gpio-group-16')).toBeVisible();
  await expect(page.getByTestId('gpio-group-16')).not.toContainText('first → last');
  await expect(page.locator('.la-led-strips-heading').filter({ hasText: 'wiring order' })).toHaveCount(0);

  const rows = page.locator('.la-strip-row');
  const ledTotal = page.getByRole('spinbutton', { name: 'Total LEDs', exact: true });
  const originalTotal = await ledTotal.inputValue();
  await detail.getByRole('button', { name: 'Divide Line into sections', exact: true }).press('Enter');
  await detail.getByRole('spinbutton', { name: 'Number of sections to divide Line into' }).fill('2');
  await detail.getByRole('button', { name: 'Divide Line into 2 sections', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('connected-parent')).toContainText(`2 parts · ${originalTotal} LEDs`);
  await rows.first().locator('.layer-name').click();
  await page.getByRole('button', { name: /^Merge .* with / }).press('Enter');
  await expect(rows).toHaveCount(1);
  await expect(ledTotal).toHaveValue(originalTotal);
});

test('old Test & Install URL is a Card checklist, not a second strip editor', async ({ page }) => {
  await openLegacyCardInstall(page, project({
    designPixels: 44, outputPin: 16, countedPin: 16, countedPixels: 44,
  }));

  await expect(page.getByTestId('test-install-plan-summary')).toHaveCount(0);
  await expect(page.getByTestId('setup-phase-connect')).toContainText('Connect to your card');
  await expect(page.getByTestId('setup-phase-connect')).toHaveAttribute('data-status', 'current');
  await expect(page.getByTestId('setup-phase-lights')).toContainText('Find and verify the lights');
  await expect(page.getByTestId('setup-connect-card')).toHaveText('Find my card');
  await expect(page.getByTestId('project-led-chipset')).toHaveCount(0);

  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  await page.getByTestId('layout-specs-trigger').click();
  await expect(page.getByTestId('wire-plan')).toHaveCount(0);
  await expect(page.getByTestId('sheet-total')).toContainText('44 LEDs');
  const advanced = page.getByTestId('advanced-installation-tools');
  await advanced.locator('summary').first().click();
  await expect(page.getByTestId('project-led-chipset')).toBeVisible();
});

test('matching GPIOs stay quiet with a visible re-test', async ({ page }) => {
  await openLayoutTools(page, project({
    designPixels: 41, outputPin: 18, countedPin: 18, countedPixels: 41,
  }));
  await expect(page.getByTestId('wire-capacity')).toHaveCount(0);
  await expect(page.getByTestId('pin-mismatch-out1')).toHaveCount(0);
  await expect(page.getByTestId('wire-recount')).toBeVisible();
});

test('different GPIO records offer a visible re-test', async ({ page }) => {
  await openLayoutTools(page, project({
    designPixels: 400, outputPin: 16, countedPin: 18, countedPixels: 41,
  }));
  await expect(page.getByTestId('pin-mismatch-out1')).toContainText('Output 1 · GPIO 16');
  await expect(page.getByRole('link', { name: 'Scan pins' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Replace GPIO 18' })).toHaveCount(0);
});
