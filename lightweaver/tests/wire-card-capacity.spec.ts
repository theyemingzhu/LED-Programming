import { test, expect } from '@playwright/test';

// Wire compares the saved count with the design independently of what the
// card may report now. A bench count never reshapes a finished drawing.
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
    id: 'capacity-fixture',
    name: 'Capacity fixture',
    // The last saved strip count.
    portRoles: [
      { pin: 16, role: 'unused', pixelCount: 0, controlKind: '' },
      { pin: 17, role: 'unused', pixelCount: 0, controlKind: '' },
      { pin: countedPin, role: 'strip', pixelCount: countedPixels, controlKind: '' },
      { pin: 21, role: 'unused', pixelCount: 0, controlKind: '' },
    ].filter((entry, index, all) => all.findIndex(item => item.pin === entry.pin) === index),
    layout: {
      strips,
      // The owner has drawn this. Nothing may reshape it on their behalf.
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

async function openWire(page: any, fixture: object) {
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await page.evaluate((data) => {
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', JSON.stringify(data));
  }, fixture);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-specs-trigger').click();
  await expect(page.getByTestId('layout-wire-tools')).toBeVisible();
}

test('a small card against a large design is stated as a fact, and the design is untouched', async ({ page }) => {
  await openWire(page, project({ designPixels: 400, outputPin: 18, countedPin: 18, countedPixels: 41 }));

  await expect(page.getByTestId('wire-capacity'))
    .toHaveText('Design: 400 LEDs · Last counted: 41 LEDs');
  // Compare counts only because the saved observation names this exact GPIO.
  await expect(page.getByTestId('pin-mismatch-out1')).toContainText('Design: 400 LEDs · Last counted: 41 LEDs');
  // The design still says 400. Counting a bench strip must never shrink it.
  await expect(page.getByTestId('sheet-total')).toContainText('400 LEDs');
  const total = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')
    .layout.strips.reduce((sum: number, strip: any) => sum + strip.pixelCount, 0));
  expect(total).toBe(400);
});

test('a card matching the design stays quiet on the Wire plan', async ({ page }) => {
  await openWire(page, project({ designPixels: 41, outputPin: 18, countedPin: 18, countedPixels: 41 }));
  await expect(page.getByTestId('wire-capacity')).toHaveCount(0);
});

test('mismatched GPIO evidence offers a re-test and leaves the pin editor unchanged', async ({ page }) => {
  await openWire(page, project({ designPixels: 400, outputPin: 16, countedPin: 18, countedPixels: 41 }));
  await expect(page.getByTestId('pin-mismatch-out1')).toContainText('Output 1 · GPIO 16');
  await expect(page.getByTestId('last-counted-pins')).toHaveText('GPIO 18');
  await expect(page.getByRole('combobox', { name: 'Pin for LED output' })).toHaveValue('16');
  await expect(page.getByRole('link', { name: 'Scan pins' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Replace GPIO 18' })).toHaveCount(0);
});

test('retesting the count lives with the Wire tools', async ({ page }) => {
  await openWire(page, project({ designPixels: 400, outputPin: 18, countedPin: 18, countedPixels: 41 }));
  await expect(page.getByTestId('wire-recount')).toHaveAccessibleName('Scan pins');
  await expect(page.getByTestId('wire-recount')).toBeVisible();
});
