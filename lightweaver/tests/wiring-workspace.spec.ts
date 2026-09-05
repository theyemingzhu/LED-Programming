import { test, expect } from './studioTest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_CARD_ID = 'lw-wiring-tests';

async function installStableCardIdentity(page: any) {
  await page.addInitScript(cardId => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId }));
  }, TEST_CARD_ID);
  await page.route('**/api/firmware-info', route => route.fulfill({ json: {
    app: 'Lightweaver', cardId: TEST_CARD_ID, firmwareVersion: '1.0.0', buildId: 'b'.repeat(40),
  } }));
  await page.route('**/api/status', route => route.fulfill({ json: {
    app: 'Lightweaver', provisioningContractVersion: 1, ok: true,
    cardId: TEST_CARD_ID, firmwareVersion: '1.0.0', buildId: 'b'.repeat(40),
    bootId: 'boot-wiring-tests', runtimePhase: 'ready', knownGoodProject: true,
    commandReady: true, outputReady: true, playbackReady: true,
  } }));
}

// ── Single-flow helpers ──────────────────────────────────────────────────────
// LED check + install live on Card. Wire drawing and specialist plan tools
// live on Layout. Old `#screen=layout&mode=wire` opens Card install.
const CARD_INSTALL_HASH = '#screen=card&section=setup&task=install-project';
const LAYOUT_HASH = '#screen=layout&mode=draw';
const planMeta = (page: any) => page.locator('.lww-plan-head .meta');

async function gpioGroupsOnWire(page: any) {
  await switchMode(page, 'draw');
  return page.locator('.la-gpio-group').count();
}

async function gotoWire(page: any) {
  await page.goto(`/${CARD_INSTALL_HASH}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { await document.fonts?.ready; });
  await expect(page.getByTestId('commissioning-step')).toBeVisible();
}

async function gotoLayoutTools(page: any) {
  await page.evaluate(hash => { window.location.hash = hash; }, LAYOUT_HASH);
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
}

// The lane/port editors, board pins, and expert mapping all live behind the
// single top-level Advanced wiring disclosure (its inner details cards start
// open).
async function openAdvanced(page: any) {
  if (await page.getByTestId('advanced-installation-tools').count() === 0) {
    await gotoLayoutTools(page);
  }
  await expect(page.getByTestId('advanced-installation-tools')).toBeVisible();
}

async function openCustomMapping(page: any) {
  await openAdvanced(page);
  const details = page.locator('.lww-custom-mapping');
  if (!await details.evaluate((element: HTMLDetailsElement) => element.open)) {
    await details.locator('summary').click();
  }
}

async function saveProject(page: any) {
  await page.waitForTimeout(600);
  const fromStorage = await page.evaluate(() => localStorage.getItem('lw_autosave_v3'));
  if (fromStorage) return JSON.parse(fromStorage);
  const pending = page.waitForEvent('download');
  await page.locator('.la .toolbar').getByRole('button', { name: 'Export', exact: true }).click();
  const download = await pending;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lw-wire-save-')), 'project.json');
  await download.saveAs(file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function persistAutosave(page: any, project: object) {
  const json = JSON.stringify(project);
  await page.addInitScript(value => {
    localStorage.setItem('lw_autosave_v3', value);
    localStorage.setItem('lw_autosave_v3_backup', value);
  }, json);
  await page.evaluate(value => {
    localStorage.setItem('lw_autosave_v3', value);
    localStorage.setItem('lw_autosave_v3_backup', value);
  }, json);
}

// Seeds the two default circles through the legacy-autosave path so the Draw
// strip list renders immediately (the built-in default keeps the starter
// picker up until the first physical edit). Wiring is bootstrapped by the
// loader: one output on GPIO 16 with run-<stripId> runs.
async function seedDefaultCircles(page: any, { needsReview = false, mode = 'draw' } = {}) {
  await page.goto(`/#screen=layout&mode=${mode}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((flag: boolean) => {
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
        starterPending: false,
        // A patch board without an explicit dataWireCount is the legacy shape
        // that flags dataWireCountNeedsReview on load. A null board is also
        // treated as ambiguous, so the ordinary seed must declare the count.
        patchBoard: flag
          ? { physicalLocked: false, chains: [{ id: 'main', name: 'Main', rowIds: [] }], patches: [], groups: [] }
          : { physicalLocked: false, dataWireCount: 1, dataWireCountNeedsReview: false, chains: [{ id: 'main', name: 'Main', rowIds: [] }], patches: [], groups: [] },
        wiring: null,
      },
    }));
  }, needsReview);
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (mode === 'draw') await expect(page.locator('.la-strip-row')).toHaveCount(2);
  else await expect(page.getByTestId('commissioning-step')).toBeVisible();
}

async function switchMode(page: any, mode: 'draw' | 'wire') {
  if (mode === 'wire') {
    await page.evaluate(hash => { window.location.hash = hash; }, CARD_INSTALL_HASH);
    await expect(page.getByTestId('commissioning-step')).toBeVisible();
  } else {
    await gotoLayoutTools(page);
  }
}

// Expand a Draw strip row's detail (click toggles selection + expansion).
// Split strips list one row per run, so scope to the first matching row.
async function expandDrawStrip(page: any, name: string) {
  const strip = page.locator('[data-strip-id]').filter({ hasText: name }).first();
  if (!await strip.locator('.la-strip-detail').first().isVisible()) await strip.locator('.la-strip-row').first().click();
  await expect(strip.locator('.la-strip-detail').first()).toBeVisible();
  return strip;
}

async function seedFourRunClosedFixture(page: any) {
  const project = await saveProject(page);
  project.layout.starterPending = false;
  project.layout.strips.forEach((strip: any) => { strip.closed = true; });
  const runs: any[] = [];
  const runIds: string[] = [];
  for (const run of project.layout.wiring.runs.filter((item: any) => item.type === 'strip')) {
    const middle = Math.floor((run.source.from + run.source.to) / 2);
    const left = { ...run, id: `${run.id}-left`, source: { ...run.source, to: middle }, seamLed: middle, verified: false };
    const right = { ...run, id: `${run.id}-right`, source: { ...run.source, from: middle + 1 }, seamLed: run.source.to, verified: false };
    runs.push(left, right);
    runIds.push(left.id, right.id);
  }
  project.layout.wiring.runs = runs;
  project.layout.wiring.outputs = [{ id: 'out1', name: 'Output A', pin: 16, runIds }];
  project.layout.wiring.controllerAnchor = { x: 320, y: 200 };
  project.layout.wiring.verified = false;
  project.layout.wiring.locked = false;
  await page.addInitScript(value => localStorage.setItem('lw_autosave_v3', value), JSON.stringify(project));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('commissioning-step')).toBeVisible();
}

async function installFrameCard(page: any) {
  const controls: any[] = [];
  await page.addInitScript(cardId => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId }));
    (window as any).__wiringFrames = [];
    class FrameSocket {
      readyState = 0;
      bufferedAmount = 0;
      onopen: any;
      onclose: any;
      onerror: any;
      constructor() { setTimeout(() => { if ((window as any).__wiringFail) this.onclose?.(); else { this.readyState = 1; this.onopen?.(); } }, 5); }
      send(payload: string) { (window as any).__wiringFrames.push(JSON.parse(payload).seg[0].i); }
      close() { this.readyState = 3; }
    }
    (window as any).WebSocket = FrameSocket;
  }, TEST_CARD_ID);
  await page.route('http://lightweaver.local/**', route => {
    const body = route.request().postData();
    if (body) controls.push(JSON.parse(body));
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/firmware-info' || pathname === '/api/status') {
      return route.fulfill({ json: { app: 'Lightweaver', ok: true, cardId: TEST_CARD_ID, firmwareVersion: '1.0.0', buildId: 'b'.repeat(40) } });
    }
    const recovery = route.request().url().includes('/api/recover-lights');
    return route.fulfill({ json: recovery
      ? { ok: true, accepted: true, diagnostics: { rendered: true, frameSubmitted: true, nonBlackPixels: 1, brightnessByte: 255 } }
      : { ok: true } });
  });
  return controls;
}

test('Test & Install is a compiler-derived read-only commissioning surface', async ({ page }) => {
  await gotoWire(page);
  await expect(page.getByRole('button', { name: 'Add skipped LEDs' })).toHaveCount(0);
  await expect(page.getByTestId('test-install-plan-summary')).toHaveCount(0);
  await expect(page.getByText('Compiler preflight')).toHaveCount(0);
  await expect(page.getByText('Edit LED range')).toHaveCount(0);

  // Card setup owns the single guarded install action. The removed standalone
  // LED-check wizard never mounts here.
  await expect(page.getByTestId('layout-send-to-card')).toBeVisible();
  await expect(page.getByTestId('start-led-check')).toHaveCount(0);
});

test('Test & Install shows a compact count line and one next-action CTA instead of step chrome', async ({ page }) => {
  await gotoWire(page);
  // Deleted chrome: the step rail, stat tiles, card step titles/pills.
  await expect(page.getByRole('group', { name: 'Steps' })).toHaveCount(0);
  await expect(page.locator('.lwui-tile')).toHaveCount(0);
  await expect(page.locator('[class*="lwui-rail"]')).toHaveCount(0);
  const step = page.getByTestId('commissioning-step');
  await expect(step).toHaveCount(1);
  await expect(step).toHaveAttribute('aria-label', 'Check and install on this card');
  // The retired guided check never mounts beside the consolidated action.
  await expect(page.getByTestId('wiring-bench-test')).toHaveCount(0);
  await expect(step.getByTestId('layout-send-to-card')).toContainText('Install on card');

  await gotoLayoutTools(page);
  await expect(planMeta(page)).toHaveText('2 strips · 44 LEDs in this design');
  await expect(page.locator('.lww-custom-mapping')).toHaveJSProperty('open', false);
  await expect(page.getByTestId('wire-power-section')).toHaveJSProperty('open', false);
  await expect(page.locator('.lww-power-warning')).toHaveCount(0);

  await page.getByTestId('layout-check-and-install').click();
  await expect(page.getByTestId('layout-send-to-card')).toBeVisible();
  await expect(page.getByTestId('start-led-check')).toHaveCount(0);
});

test('Test & Install owns neither wire count nor ordering and keeps specialist tools closed', async ({ page }) => {
  await gotoWire(page);
  // Deleted surfaces: the wire-count picker, the wire-order list, and the
  // auto-route step all moved to Draw (count is derived from GPIO
  // assignments; ordering is Draw's GPIO-grouped strip list).
  await expect(page.getByRole('group', { name: 'How many wires leave the card?' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'LED data wire count' })).toHaveCount(0);
  await expect(page.getByTestId('wire-order')).toHaveCount(0);
  await expect(page.getByTestId('wire-order-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark card position on drawing' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Suggest shortest order' })).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Split a strip mid-wire' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a cable jump' })).toHaveCount(0);
  await openAdvanced(page);
  await expect(page.getByTestId('advanced-installation-tools')).toBeVisible();
  await expect(page.locator('.lww-custom-mapping')).toHaveJSProperty('open', false);
  await openCustomMapping(page);
  await expect(page.getByRole('button', { name: 'Split a strip mid-wire' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a cable jump' })).toBeVisible();
});

test('Custom mapping inserts and removes a zero-address cable jump without changing Wire order', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'draw' });
  await page.locator('[data-strip-id="default-outer-circle"] .la-strip-row').click();
  await switchMode(page, 'wire');
  await openCustomMapping(page);

  const addJump = page.getByRole('button', { name: 'Add a cable jump' });
  await expect(addJump).toBeEnabled();
  await addJump.click();
  const jumpRow = page.getByTestId('cable-jump-row');
  await expect(jumpRow).toContainText('Outer circle → Inner circle');

  const inserted = await saveProject(page);
  const outputRunIds = inserted.layout.wiring.outputs[0].runIds;
  const runsById = new Map(inserted.layout.wiring.runs.map((run: any) => [run.id, run]));
  expect(outputRunIds.map((id: string) => (runsById.get(id) as any)?.type)).toEqual(['strip', 'cable', 'strip']);
  expect(inserted.layout.wiring.runs.map((run: any) => run.type)).toEqual(['strip', 'cable', 'strip']);
  expect(inserted.layout.wiring.runs.find((run: any) => run.type === 'cable')?.count).toBeUndefined();
  expect(outputRunIds
    .map((id: string) => runsById.get(id) as any)
    .filter((run: any) => run?.type === 'strip')
    .map((run: any) => run.source.stripId))
    .toEqual(['default-outer-circle', 'default-inner-circle']);
  await expect(planMeta(page)).toHaveText('2 strips · 44 LEDs in this design');

  await jumpRow.getByRole('button', { name: 'Remove cable jump' }).click();
  await expect(jumpRow).toHaveCount(0);
  const removed = await saveProject(page);
  expect(removed.layout.wiring.runs.some((run: any) => run.type === 'cable')).toBe(false);
  const removedRunsById = new Map(removed.layout.wiring.runs.map((run: any) => [run.id, run]));
  expect(removed.layout.wiring.outputs[0].runIds.map((id: string) => (removedRunsById.get(id) as any)?.source?.stripId))
    .toEqual(['default-outer-circle', 'default-inner-circle']);

  await switchMode(page, 'draw');
  await page.locator('[data-strip-id="default-inner-circle"] .la-strip-row').click();
  await switchMode(page, 'wire');
  await openCustomMapping(page);
  await expect(page.getByRole('button', { name: 'Add a cable jump' })).toBeDisabled();
});

test('Test & Install reports a missing run without repairing it; Wire owns reconciliation', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'draw' });
  const project = await saveProject(page);
  const missingRunId = project.layout.wiring.runs.find((run: any) => run.type === 'strip' && run.source.stripId === 'default-inner-circle').id;
  project.layout.wiring.runs = project.layout.wiring.runs.filter((run: any) => run.id !== missingRunId);
  project.layout.wiring.outputs.forEach((output: any) => {
    output.runIds = output.runIds.filter((runId: string) => runId !== missingRunId);
  });
  const missingWiring = structuredClone(project.layout.wiring);
  await page.addInitScript(value => localStorage.setItem('lw_autosave_v3', value), JSON.stringify(project));
  await page.goto('/?fixture=missing-run#screen=layout&mode=wire', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Finish the setup in Wire' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit in Wire' })).toBeVisible();

  const unchanged = await saveProject(page);
  expect(unchanged.layout.wiring).toEqual(missingWiring);

  await page.getByRole('button', { name: 'Edit in Wire' }).click();
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  await expect(page).toHaveURL(/mode=draw/);
  const repaired = await saveProject(page);
  const repairedRun = repaired.layout.wiring.runs.find((run: any) => run.type === 'strip' && run.source.stripId === 'default-inner-circle');
  expect(repairedRun).toBeTruthy();
  expect(repaired.layout.wiring.outputs[0].runIds).toContain(repairedRun.id);
});

test('Wire reattaches an orphaned strip run without duplicating it or looping back from Test & Install', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'draw' });
  const project = await saveProject(page);
  const orphanRun = project.layout.wiring.runs.find((run: any) => run.type === 'strip' && run.source.stripId === 'default-inner-circle');
  project.layout.wiring.outputs.forEach((output: any) => {
    output.runIds = output.runIds.filter((runId: string) => runId !== orphanRun.id);
  });
  if (project.layout.patchBoard) project.layout.patchBoard.dataWireCountNeedsReview = false;
  const orphanedWiring = structuredClone(project.layout.wiring);
  await page.addInitScript(value => localStorage.setItem('lw_autosave_v3', value), JSON.stringify(project));
  await page.goto('/?fixture=orphan-run#screen=layout&mode=wire', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Finish the setup in Wire' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit in Wire' })).toBeVisible();
  expect((await saveProject(page)).layout.wiring).toEqual(orphanedWiring);

  await page.getByRole('button', { name: 'Edit in Wire' }).click();
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  await expect(page).toHaveURL(/mode=draw/);
  const repaired = await saveProject(page);
  const matchingRuns = repaired.layout.wiring.runs.filter((run: any) => run.type === 'strip' && run.source.stripId === 'default-inner-circle');
  expect(matchingRuns).toHaveLength(1);
  expect(matchingRuns[0].id).toBe(orphanRun.id);
  expect(repaired.layout.wiring.outputs[0].runIds).toContain(orphanRun.id);

  await switchMode(page, 'wire');
  await expect(page.getByTestId('layout-send-to-card')).toBeVisible();
  await expect(page.getByTestId('start-led-check')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit in Wire' })).toHaveCount(0);
});

test('opening consolidated install never starts the retired frame-stream check', async ({ page }) => {
  await installFrameCard(page);
  await gotoWire(page);
  await expect(page.getByTestId('layout-send-to-card')).toBeVisible();
  await expect(page.getByTestId('wiring-bench-test')).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__wiringFrames.length)).toBe(0);
});

test('narrow inspector uses container-aware stacked controls without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await gotoWire(page);
  const panel = page.getByTestId('commissioning-step');
  await panel.evaluate(element => { (element as HTMLElement).style.width = '300px'; });
  const size = await panel.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth);
  await expect(panel.getByTestId('wiring-output-lane')).toHaveCount(0);
});

test('legacy wire-count review is confirmed in Draw and clears the Wire warning', async ({ page }) => {
  await seedDefaultCircles(page, { needsReview: true, mode: 'wire' });
  // Wire: the primary flow carries a one-line pointer to Draw.
  await expect(page.getByText('Finish the setup in Wire')).toBeVisible();
  await expect(page.getByText('This older project needs each strip’s GPIO confirmed before the physical check.')).toBeVisible();

  // Draw: the legacy banner confirms the derived GPIO assignments.
  await switchMode(page, 'draw');
  const banner = page.getByTestId('legacy-gpio-confirm');
  await expect(banner).toContainText("Older project — confirm each strip's GPIO looks right.");
  await banner.getByRole('button', { name: 'Looks right' }).click();
  await expect(banner).toHaveCount(0);

  // Back in Wire, the pointer is gone and the check is the next action.
  await switchMode(page, 'wire');
  await expect(page.getByText('Finish the setup in Wire')).toHaveCount(0);
  await expect(page.getByTestId('layout-send-to-card')).toBeVisible();
  await expect(page.getByTestId('start-led-check')).toHaveCount(0);
});

test('closing wire discovery stops the persistent card test before hiding it', async ({ page }) => {
  await installStableCardIdentity(page);
  const discoveryBodies: any[] = [];
  await page.route('**/api/wiring/discover', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    discoveryBodies.push(body);
    await route.fulfill({ json: body.stop
      ? { ok: true, state: 'known-good', assignments: [], requiresReboot: true }
      : { ok: true, state: 'rebooting-for-discovery', batch: 0, assignments: [{ pin: 16, color: '#ff0000', label: 'Red' }] } });
  });
  await gotoWire(page);
  await openAdvanced(page);

  await page.getByRole('button', { name: 'Find my LED wire' }).click();
  await expect(page.getByRole('region', { name: 'Find my LED wire' }).getByRole('button', { name: /Red/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close wire finder' }).click();

  await expect.poll(() => discoveryBodies.some(body => body.stop === true)).toBe(true);
  await expect(page.getByRole('region', { name: 'Find my LED wire' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Find my LED wire' }).click();
  await expect.poll(() => discoveryBodies.filter(body => body.stop !== true).length).toBe(2);
  await page.evaluate(() => { window.location.hash = '#screen=patterns'; });
  await expect.poll(() => discoveryBodies.filter(body => body.stop === true).length).toBe(2);
});

test('Test & Install does not reprint the Wire GPIO list', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'draw' });
  await expect(page.getByTestId('gpio-group-16')).toContainText('Outer circle');
  await expect(page.getByTestId('gpio-group-16')).toContainText('27 LEDs');
  await switchMode(page, 'wire');
  await expect(page.getByTestId('test-install-plan-summary')).toHaveCount(0);
  await expect(page.getByTestId('layout-send-to-card')).toBeVisible();
  await expect(page.getByTestId('start-led-check')).toHaveCount(0);
});

test('Test & Install keeps normal wiring controls out of its reduced surface', async ({ page }) => {
  await gotoWire(page);

  await expect(page.getByTestId('layout-send-to-card')).toBeVisible();
  await expect(page.getByTestId('start-led-check')).toHaveCount(0);
  await expect(page.getByTestId('advanced-installation-tools')).toHaveCount(0);
  await expect(page.getByTestId('wiring-output-lane')).toHaveCount(0);
  await expect(page.getByText('Data wire mapping')).toHaveCount(0);
  await expect(page.getByText('Board pins', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Output A board pin')).toHaveCount(0);
  await expect(page.getByLabel('Output A GPIO')).toHaveCount(0);
});

test('incomplete Test & Install plans return to the canonical Wire editor', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'wire' });
  const project = await saveProject(page);
  project.layout.wiring.outputs[0].runIds = [];
  await page.evaluate(value => localStorage.setItem('lw_autosave_v3', value), JSON.stringify(project));
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Finish the setup in Wire')).toBeVisible();
  await page.getByRole('button', { name: 'Edit in Wire' }).click();
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  await expect(page).toHaveURL(/mode=draw/);
});

test('assigning a second GPIO in Wire updates hardware pin conflicts', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'wire' });
  expect(await gpioGroupsOnWire(page)).toBe(1);

  // The second data wire is born in Wire: assigning a strip to an unused GPIO
  // creates the output.
  await switchMode(page, 'draw');
  const inner = await expandDrawStrip(page, 'Inner circle');
  await inner.getByLabel('GPIO output').selectOption('17');
  await switchMode(page, 'wire');
  expect(await gpioGroupsOnWire(page)).toBe(2);
  await switchMode(page, 'draw');
  await expect(page.getByTestId('gpio-group-17')).toBeVisible();
  await switchMode(page, 'wire');
  await expect(page.getByLabel('Output A GPIO')).toHaveCount(0);

  await openAdvanced(page);
  const hardware = page.getByTestId('wire-power-section');
  await hardware.locator('summary').click();
  const encoderA = page.getByLabel('Encoder A pin');
  await expect(encoderA.locator('option[value="17"]')).toHaveAttribute('disabled', '');
  await encoderA.selectOption('10');
  await expect(encoderA).toHaveValue('10');
});

test('changing logical sections never changes the derived physical data-wire count', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'draw' });
  const outer = await expandDrawStrip(page, 'Outer circle');
  await outer.getByRole('spinbutton', { name: 'Strip LED count', exact: true }).fill('26');
  await outer.getByRole('spinbutton', { name: 'Strip LED count', exact: true }).blur();
  await outer.getByRole('button', { name: 'Reverse data direction of Outer circle' }).click();
  await switchMode(page, 'wire');
  expect(await gpioGroupsOnWire(page)).toBe(1);
  await expect(planMeta(page)).toContainText('43 LEDs');
  await switchMode(page, 'draw');
  const inner = await expandDrawStrip(page, 'Inner circle');
  await inner.getByLabel('GPIO output').selectOption('17');
  await switchMode(page, 'wire');
  expect(await gpioGroupsOnWire(page)).toBe(2);
});

test('Find my LED wire maps a visible discovery color to the selected GPIO', async ({ page }) => {
  await installStableCardIdentity(page);
  await page.route('**/api/wiring/discover', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, assignments: [
      { pin: 16, color: '#e35b4f', label: 'Red' },
      { pin: 17, color: '#4e78d6', label: 'Blue' },
    ] }),
  }));
  await gotoWire(page);
  await openAdvanced(page);
  await page.getByRole('button', { name: 'Find my LED wire' }).click();
  const finder = page.getByRole('region', { name: 'Find my LED wire' });
  await expect(finder.getByText('Choose the color you see on the real LEDs.')).toBeVisible();
  await finder.getByRole('button', { name: /Blue GPIO 17/ }).click();
  await expect(finder).toContainText('uses GPIO 17');
  const mapped = await saveProject(page);
  expect(mapped.layout.wiring.outputs.some((output: any) => output.pin === 17)).toBe(true);
});

test('Test & Install never scrolls horizontally at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoWire(page);
  const panel = page.getByTestId('commissioning-step');
  await expect(panel).toBeAttached();
  const cardOverflow = await panel.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(cardOverflow.scrollWidth, 'Primary flow').toBeLessThanOrEqual(cardOverflow.clientWidth);
  await openAdvanced(page);
  const tools = page.getByTestId('layout-wire-tools');
  const advanced = page.getByTestId('advanced-installation-tools');
  const power = page.getByTestId('wire-power-section');
  await power.locator('summary').click();
  await expect(page.getByLabel('Power supply amps')).toBeVisible();
  // Let the disclosure chevron's 160ms rotation settle — mid-transition its
  // diagonal transiently widens scrollWidth by ~1px.
  await page.waitForTimeout(250);
  const overflows = [
    { selector: 'Wire tools', ...(await tools.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }))) },
    { selector: 'Power', ...(await power.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }))) },
    { selector: 'Advanced tools', ...(await advanced.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }))) },
  ];
  for (const item of overflows) expect(item.scrollWidth, item.selector).toBeLessThanOrEqual(item.clientWidth);
});

test('Wire button tooltips use one unclipped portal at phone and desktop widths', async ({ page }) => {
  async function expectPortalTooltip(trigger: any, text: string) {
    const originalTitle = await trigger.getAttribute('title');
    await trigger.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toHaveCount(1);
    await expect(tooltip).toHaveText(text);
    await expect(trigger).not.toHaveAttribute('title');
    const geometry = await tooltip.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, pointerEvents: getComputedStyle(element).pointerEvents, width: innerWidth, height: innerHeight };
    });
    expect(geometry.pointerEvents).toBe('none');
    expect(geometry.rect.left).toBeGreaterThanOrEqual(8);
    expect(geometry.rect.top).toBeGreaterThanOrEqual(8);
    expect(geometry.rect.right).toBeLessThanOrEqual(geometry.width - 8);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.height - 8);
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
    if (originalTitle === null) {
      expect(await trigger.getAttribute('title')).toBeNull();
    } else {
      await expect(trigger).toHaveAttribute('title', originalTitle);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoWire(page);
  const install = page.getByTestId('layout-send-to-card');
  await install.focus();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expectPortalTooltip(install, 'Send this verified project to the card, replacing its active project after card verification.');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoWire(page);
  await openCustomMapping(page);
  await expectPortalTooltip(page.getByRole('button', { name: 'Add a cable jump' }), 'Select a strip that has another physical run after it.');
});

test('card hardware keeps power collapsed, persists its inputs, and raises over-budget warnings', async ({ page }) => {
  await gotoWire(page);
  await openAdvanced(page);
  const power = page.getByTestId('wire-power-section');
  await power.locator('summary').click();
  // Defaults: 5 A supply × 0.8 safety = 4 A budget; 44 LEDs × 12 mA = 0.53 A.
  await expect(power.locator('.lww-power-headroom')).toHaveText('Headroom 3.5 A');
  await expect(page.locator('.lww-power-warning')).toHaveCount(0);

  await page.getByLabel('Power supply amps').fill('0.5');
  const warning = page.locator('.lww-power-warning');
  await expect(warning).toHaveText('Needs 0.5 A at full white — your supply is 0.5 A.');
  await expect(warning).toHaveAttribute('role', 'alert');
  await expect(power.locator('.lww-power-headroom')).toHaveClass(/is-over/);
  await expect(power.locator('.lww-power-headroom')).toHaveText('Over by 0.1 A');

  await page.getByLabel('Milliamps per LED').fill('60');
  await expect(warning).toHaveText('Needs 2.6 A at full white — your supply is 0.5 A.');

  // Both inputs persist through the project autosave.
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('layout-wire-tools')).toBeVisible();
  await expect(page.locator('.lww-power-warning')).toHaveText('Needs 2.6 A at full white — your supply is 0.5 A.');
  await openAdvanced(page);
  await power.locator('summary').click();
  await expect(page.getByLabel('Power supply amps')).toHaveValue('0.5');
  await expect(page.getByLabel('Milliamps per LED')).toHaveValue('60');
});

test('unverified wiring keeps the staged install path available without manual locking and reserved runs consume addresses', async ({ page }) => {
  await gotoWire(page);
  // Card setup keeps one guarded install action visible instead of swapping in
  // a separate physical-check wizard.
  await expect(page.getByTestId('layout-send-to-card')).toBeVisible();
  await expect(page.getByTestId('layout-send-to-card')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Lock wiring' })).toHaveCount(0);
  await openCustomMapping(page);
  await page.getByRole('button', { name: 'Add skipped LEDs' }).click();
  await page.getByRole('button', { name: 'Add skipped LEDs' }).click();
  await expect(planMeta(page)).toContainText('46 LEDs');
  const project = await saveProject(page);
  const ids = project.layout.wiring.runs.map((run: any) => run.id);
  expect(ids).toContain('reserved-1');
  expect(ids).toContain('reserved-2');
});

test('Wire owns physical data direction alongside the drawn path direction', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'draw' });
  const outer = await expandDrawStrip(page, 'Outer circle');
  const toggle = outer.getByRole('button', { name: 'Reverse data direction of Outer circle' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  let project = await saveProject(page);
  expect(project.layout.wiring.runs.find((run: any) => run.source?.stripId === 'default-outer-circle').physicalDirection).toBe('source-reverse');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  project = await saveProject(page);
  expect(project.layout.wiring.runs.find((run: any) => run.source?.stripId === 'default-outer-circle').physicalDirection).toBe('source-forward');

  // The wiring toggle is distinct from the drawn-path flip.
  await expect(outer.getByRole('button', { name: 'Flip path direction' })).toHaveAttribute('title', 'Flip the drawing path so pixel 0 swaps ends');
});

test('Draw keeps first-LED positioning in the canvas picker only', async ({ page }) => {
  await seedDefaultCircles(page, { mode: 'draw' });
  const outer = await expandDrawStrip(page, 'Outer circle');
  await expect(outer.getByText('First LED', { exact: true })).toHaveCount(0);
  await expect(outer.getByRole('button', { name: /Move first LED/ })).toHaveCount(0);
  await expect(outer.getByRole('button', { name: 'Set first LED' })).toBeVisible();
});

test('saved card position stays compatible without exposing card-position or auto-route UI', async ({ page }) => {
  await gotoWire(page);
  await seedFourRunClosedFixture(page);

  await expect(page.getByTestId('controller-anchor')).toHaveCount(0);
  await expect(page.getByTestId('draw-auto-route')).toHaveCount(0);
  await expect(page.getByTestId('auto-wire-preview')).toHaveCount(0);

  await switchMode(page, 'draw');
  await expect(page.getByTestId('controller-anchor')).toHaveCount(0);
  await expect(page.getByTestId('draw-auto-route')).toHaveCount(0);
  await expect(page.getByTestId('auto-wire-preview')).toHaveCount(0);

  expect((await saveProject(page)).layout.wiring.controllerAnchor).toEqual({ x: 320, y: 200 });
});

test('closed-path seam and physical DATA IN are editable independently until fixed, then refuse movement', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoWire(page);
  await seedFourRunClosedFixture(page);
  await switchMode(page, 'draw');
  await expandDrawStrip(page, 'Outer circle');
  await openCustomMapping(page);
  const policy = page.getByLabel('Direction policy');
  const dataIn = page.getByLabel('Physical DATA IN');
  const seam = page.getByLabel('Connector seam LED');
  await expect(seam).toBeEnabled();
  const originalSeam = Number(await seam.inputValue());
  await seam.fill(String(originalSeam > 0 ? originalSeam - 1 : originalSeam + 1));
  await seam.blur();
  await dataIn.selectOption('source-reverse');
  await expect(policy).toHaveValue('flexible');
  await expect(dataIn).toHaveValue('source-reverse');
  await policy.selectOption('fixed');
  await expect(dataIn).toHaveValue('source-reverse');
  await expect(dataIn).toBeDisabled();
  await expect(seam).toBeDisabled();
  await expect(page.getByTestId('connector-seam-handle')).toHaveAttribute('aria-disabled', 'true');
});
