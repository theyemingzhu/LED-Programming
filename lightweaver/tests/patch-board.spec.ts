import { test, expect } from './studioTest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Wire panel presentation: ordering, direction, and GPIO assignment all live
// in Draw's GPIO-grouped strip list now; Wire is a single-flow page (one LED
// check CTA → auto-locked install) with specialist tools demoted to the
// single Advanced installation tools disclosure. These tests pin that structure
// against the canonical wiring model (runs/outputs) via exported project JSON.

function writeFixture(tmp: string) {
  const fixture = path.join(tmp, 'patch-board-line.svg');
  fs.writeFileSync(fixture, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 40"><g id="line-layer" data-name="Line"><path d="M 10 20 H 610" fill="none" stroke="#fff"/></g></svg>`);
  return fixture;
}

async function importLine(page: any) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightweaver-wire-'));
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.setInputFiles('input[accept=".svg"]', writeFixture(tmp));
  await page.getByRole('button', { name: /\+ All \(1\)/ }).click();
  return tmp;
}

async function enterWire(page: any) {
  await expect(page.getByTestId('layout-wire-tools')).toBeVisible();
}

async function gotoDefaultWire(page: any) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('layout-wire-tools')).toBeVisible();
}

// Seeds the two default circles through the legacy-autosave path so the Draw
// strip list renders immediately (the built-in default keeps the starter
// picker up until the first physical edit).
async function seedDefaultCircles(page: any) {
  await page.goto('/#screen=layout&mode=draw', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const circle = (id: string, name: string, radius: number, pixelCount: number) => ({
      id,
      name,
      pathData: `M ${320 - radius} 200 A ${radius} ${radius} 0 1 0 ${320 + radius} 200 A ${radius} ${radius} 0 1 0 ${320 - radius} 200 Z`,
      closed: true,
      pixelCount,
      generatedLayout: 'default-circle-v1',
      x: 0, y: 0, emit: 'omni', angle: 0, reversed: false,
      speed: 1, brightness: 1, hueShift: 0, patternId: null,
    });
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3,
      id: 'seeded-circles',
      name: 'Seeded circle project',
      layout: {
        strips: [
          circle('default-outer-circle', 'Outer circle', 144, 27),
          circle('default-inner-circle', 'Inner circle', 64, 17),
        ],
        viewBox: '0 0 640 400',
        svgText: null,
        layers: [],
        density: 60,
        pxPerMm: 3.7795,
        patchBoard: null,
        wiring: null,
      },
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(2);
}

async function exportProject(page: any, tmp: string, name = 'saved.json') {
  const pending = page.waitForEvent('download');
  await page.getByTitle('Export a portable project file (.lw.json)').click();
  const download = await pending;
  const file = path.join(tmp, name);
  await download.saveAs(file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Wire tools is a panel now rather than a disclosure — everything in it
// changes the design, so it no longer waits behind a summary. All this has to
// do is make sure the panel is on screen.
async function openAdvanced(page: any) {
  if (await page.getByTestId('advanced-installation-tools').count() === 0) {
    await page.evaluate(() => { window.location.hash = '#screen=layout&mode=draw'; });
    await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  }
  await expect(page.getByTestId('advanced-installation-tools')).toBeVisible();
}

async function loadVerifiedWiring(page: any, tmp: string) {
  const project = await exportProject(page, tmp, 'verification-source.json');
  project.layout.starterPending = false;
  project.layout.wiring.verified = true;
  project.layout.wiring.locked = false;
  project.layout.wiring.runs.forEach((run: any) => { run.verified = true; });
  const led = project.devices.standaloneController.led;
  led.colorOrder = led.colorOrder || 'RGB';
  led.colorOrderConfirmed = true;
  led.confirmedColorOrder = led.colorOrder;
  const json = JSON.stringify(project);
  await page.addInitScript(value => {
    localStorage.setItem('lw_autosave_v3', value);
    localStorage.setItem('lw_autosave_v3_backup', value);
  }, json);
  await page.evaluate(value => {
    localStorage.setItem('lw_autosave_v3', value);
    localStorage.setItem('lw_autosave_v3_backup', value);
  }, json);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { window.location.hash = '#screen=card&section=setup&task=install-project'; });
  await expect(page.getByTestId('commissioning-step')).toBeVisible();
}

async function clickStripPathAt(page: any, fraction: number) {
  const target = await page.locator('path[data-strip-path]').first().evaluate((node: SVGPathElement, at: number) => {
    const point = node.getPointAtLength(node.getTotalLength() * at);
    const ctm = node.getScreenCTM()!;
    return { x: point.x * ctm.a + point.y * ctm.c + ctm.e, y: point.x * ctm.b + point.y * ctm.d + ctm.f };
  }, fraction);
  await page.mouse.click(target.x, target.y);
}

test('Draw lists strips grouped by GPIO in data-wire order and drag reorder writes the canonical output', async ({ page }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightweaver-order-'));
  await seedDefaultCircles(page);

  const group = page.getByTestId('gpio-group-16');
  await expect(group).toContainText('GPIO 16');
  const rows = group.locator('.la-strip-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.la-wire-n')).toContainText('01');
  await expect(rows.nth(0)).toContainText('Outer circle');
  await expect(rows.nth(0)).toContainText('27 LEDs');
  await expect(rows.nth(1).locator('.la-wire-n')).toContainText('02');
  await expect(rows.nth(1)).toContainText('Inner circle');

  await rows.nth(1).dragTo(rows.nth(0));
  await expect(rows.nth(0)).toContainText('Inner circle');
  await expect(rows.nth(0).locator('.la-wire-n')).toContainText('01');

  const project = await exportProject(page, tmp);
  expect(project.layout.wiring.outputs).toHaveLength(1);
  const runStripOrder = project.layout.wiring.outputs[0].runIds.map((runId: string) =>
    project.layout.wiring.runs.find((run: any) => run.id === runId)?.source?.stripId);
  expect(runStripOrder).toEqual(['default-inner-circle', 'default-outer-circle']);
});

test('Custom mapping stays folded and Split still cuts a run', async ({ page }) => {
  const tmp = await importLine(page);
  await enterWire(page);

  // The Wire tools panel itself is open — it is the one thing in this column
  // you operate. The specialist cutting tools inside it are still folded, and
  // that is what this guards: Split and Add a cable jump do not greet you.
  const advanced = page.getByTestId('advanced-installation-tools');
  await expect(advanced).toBeVisible();
  await expect(page.getByRole('button', { name: 'Split a strip mid-wire' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a cable jump' })).toHaveCount(0);

  await openAdvanced(page);
  const custom = advanced.locator('.lww-custom-mapping');
  await expect(custom).toHaveJSProperty('open', false);
  await custom.locator('summary').click();
  await expect(page.getByRole('button', { name: 'Split a strip mid-wire' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a cable jump' })).toBeVisible();
  // The wire count and the shortest-route suggestion moved to Draw entirely —
  // neither has a home anywhere in the Wire panel.
  await expect(page.getByRole('group', { name: 'LED data wire count' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'How many wires leave the card?' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Suggest shortest order' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark card position on drawing' })).toHaveCount(0);

  expect((await exportProject(page, tmp, 'before-split.json')).layout.wiring.runs.filter((run: any) => run.type === 'strip')).toHaveLength(1);
  await page.getByRole('button', { name: 'Split a strip mid-wire' }).click();
  await clickStripPathAt(page, 0.45);
  await expect(page.getByText('Selected split')).toBeVisible();
  expect((await exportProject(page, tmp, 'after-split.json')).layout.wiring.runs.filter((run: any) => run.type === 'strip')).toHaveLength(2);
  await expect(page.locator('.lww-plan-head .meta')).toContainText('1 strip ·');
  const runSelector = page.getByLabel('Physical run');
  await expect(runSelector.locator('option')).toHaveCount(2);
  await runSelector.selectOption({ index: 1 });
  await page.getByLabel('Physical DATA IN').selectOption('source-reverse');
  const editedRuns = (await exportProject(page, tmp, 'after-second-run-edit.json')).layout.wiring.runs
    .filter((run: any) => run.type === 'strip')
    .sort((a: any, b: any) => a.source.from - b.source.from);
  expect(editedRuns.map((run: any) => run.physicalDirection)).toEqual(['source-forward', 'source-reverse']);
  await page.getByRole('button', { name: 'Move split later' }).click();
  await page.getByRole('button', { name: 'Merge split runs' }).click();

  const saved = await exportProject(page, tmp);
  expect(saved.layout.wiring.runs.filter((run: any) => run.type === 'strip')).toHaveLength(1);
});

test('auto-locked verified wiring blocks physical mutations until Unlock to edit reopens it', async ({ page }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightweaver-locked-wire-'));
  await gotoDefaultWire(page);
  await loadVerifiedWiring(page, tmp);

  // Fully verified wiring auto-locks — no manual lock button exists. The
  // primary flow area settles on the install control.
  await expect(page.getByTestId('commissioning-step')).toContainText('Ready to install on the card.');
  await expect(page.getByRole('button', { name: 'Lock wiring' })).toHaveCount(0);
  await expect(page.getByTestId('layout-send-to-card')).toBeEnabled();

  await openAdvanced(page);
  const custom = page.locator('.lww-custom-mapping');
  await custom.locator('summary').click();
  await expect(page.getByRole('button', { name: 'Add skipped LEDs' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Split a strip mid-wire' })).toBeDisabled();

  const project = await exportProject(page, tmp);
  expect(project.layout.wiring.locked).toBe(true);
  expect(project.layout.wiring.runs.every((run: any) => run.verified)).toBe(true);

  // Unlocking clears physical verification without discarding usable wiring.
  // The Card page now owns a staged install and its subsequent real-light
  // confirmation; it no longer requires the removed preliminary LED check.
  await page.getByTestId('unlock-wiring').click();
  await expect(page.getByRole('button', { name: 'Add skipped LEDs' })).toBeEnabled();

  // Export while still on Layout — that is where the Export control lives.
  const reopened = await exportProject(page, tmp, 'reopened.json');
  expect(reopened.layout.wiring.locked).toBe(false);
  expect(reopened.layout.wiring.verified).toBe(false);
  expect(reopened.layout.wiring.runs.every((run: any) => run.verified === false)).toBe(true);

  // Usable edited wiring can enter the staged transaction, while the export
  // above proves that merely returning to Card has not retained verification.
  await page.evaluate(() => { window.location.hash = '#screen=card&section=setup&task=install-project'; });
  await expect(page.getByTestId('commissioning-step')).toContainText('Ready to install on the card.');
  await expect(page.getByTestId('layout-send-to-card')).toBeEnabled();
  await expect(page.getByTestId('start-led-check')).toHaveCount(0);
});

test('numeric strip count replaces the full value with an exact accessible selector', async ({ page }) => {
  await importLine(page);
  await page.locator('.la-strip-row').first().click();
  const count = page.getByRole('spinbutton', { name: 'Strip LED count', exact: true });
  await count.fill('12');
  await count.blur();
  await count.click();
  await page.keyboard.press('3');
  await expect(count).toHaveValue('3');
});
