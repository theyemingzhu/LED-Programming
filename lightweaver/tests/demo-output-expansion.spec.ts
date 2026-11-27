import { test, expect, type Page } from '@playwright/test';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { createDefaultCircleLayout } from '../src/lib/defaultCircleLayout.js';
import { createDefaultPatchBoard } from '../src/lib/patchBoard.js';
import { makeDefaultWiring } from '../src/lib/wiringModel.js';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';
import { DEFAULT_CARD_CONTROLS } from '../src/lib/cardRuntimeContract.js';
import {
  CARD_HOSTS, createCardSimulator, DEMO_FIVE_OUTPUTS, DEMO_OUTPUT_TOPOLOGY,
  type CardSimulator, type SimulatedOutput,
} from './harness/cardSimulator';
import { cardState } from './harness/cardStates';

const HOST = 'lightweaver.local';
const CARD_ID = 'lw-d30850000001';
const LAYOUT_ROUTE = '/#screen=layout';
const expectedOutputs = DEMO_FIVE_OUTPUTS.map(({ pin, pixels }) => [pin, pixels]);
const totalPixels = DEMO_FIVE_OUTPUTS.reduce((sum, output) => sum + output.pixels, 0);

function makeDemoProject() {
  const project = createDefaultProject();
  const strips = createDefaultCircleLayout({
    sectionPixelCounts: DEMO_FIVE_OUTPUTS.map(output => output.pixels),
  });
  project.id = 'demo-five-output-install';
  project.name = 'Demo five-output installation';
  project.layout.starterPending = false;
  project.layout.strips = strips;
  project.layout.patchBoard = createDefaultPatchBoard(strips);
  project.layout.patchBoard.dataWireCount = 4;
  const wiring = makeDefaultWiring(strips);
  wiring.outputs = DEMO_FIVE_OUTPUTS.slice(0, 4).map(({ id, pin }, index) => ({
    id, pin, name: `Output ${index + 1}`,
    runIds: index === 3 ? wiring.runs.slice(index).map(run => run.id) : [wiring.runs[index].id],
  }));
  project.layout.wiring = wiring;
  Object.assign(project.devices.standaloneController.led, {
    type: 'WS2812B', colorOrder: 'GRB', maxMilliamps: 2000,
    colorOrderConfirmed: true, confirmedColorOrder: 'GRB',
  });
  return project;
}

async function connectDemoCard(page: Page, card: CardSimulator) {
  await card.install(page);
  for (const other of CARD_HOSTS.filter(host => host !== HOST)) {
    await page.route(`http://${other}/**`, route => route.abort('connectionrefused'));
    await page.route(`https://${other}/**`, route => route.abort('connectionrefused'));
  }
}

function readCard(page: Page, path = '/api/status') {
  return page.evaluate(async url => (await fetch(url)).json(), `http://${HOST}${path}`);
}

function toTopology(outputs: SimulatedOutput[]) {
  return outputs.map(({ id, pin, pixels, segments }) => ({ id, pin, pixels, segments }));
}

function cardOutputs(card: CardSimulator) {
  if (!card.state.explicitOutputs) throw new Error('The demo card must preserve its complete topology.');
  return toTopology(card.state.explicitOutputs);
}

async function assignGpio(page: Page, name: string, pin: number) {
  const strip = page.locator('[data-strip-id]').filter({
    has: page.locator('.la-strip-row').filter({ hasText: name }),
  });
  if (!await strip.locator('.la-strip-detail').isVisible()) await strip.locator('.la-strip-row').click();
  await strip.getByLabel('GPIO output', { exact: true }).selectOption(String(pin));
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return (saved.layout?.wiring?.outputs || []).map(output => output.pin);
  })).toContain(pin);
}

async function startLightTest(page: Page) {
  await page.getByTestId('layout-check-and-install').click();
  await expect(page.getByTestId('wiring-test-confirm')).toBeVisible();
}

async function openDemoInstallation(page: Page, project: ReturnType<typeof makeDemoProject>) {
  const { config } = prepareCardDeployment({
    projectId: project.id, projectName: project.name, projectRevision: 0,
    strips: project.layout.strips, patchBoard: project.layout.patchBoard, wiring: project.layout.wiring,
    standaloneController: project.devices.standaloneController,
  });
  const patterns = config.looks.map(({ id, label }) => ({ id, label }));
  const card = createCardSimulator({
    ...cardState('installed-match'),
    projectId: project.id, projectName: project.name,
    projectRevision: config.projectRevision, projectFingerprint: config.projectFingerprint,
    pin: config.led.outputs[0].pin, pixels: config.led.pixels,
    patterns, currentId: config.startupPatternId,
    currentIndex: patterns.findIndex(pattern => pattern.id === config.startupPatternId),
  }, {
    cardId: CARD_ID, outputTopology: DEMO_OUTPUT_TOPOLOGY, initialOutputs: config.led.outputs,
    initialWiring: { revision: config.wiringRevision, digest: config.wiringDigest },
  });
  Object.assign(card.state, { firmwareControls: {
    ...DEFAULT_CARD_CONTROLS,
    encoder: { ...DEFAULT_CARD_CONTROLS.encoder, effectiveAlternatePress: DEFAULT_CARD_CONTROLS.encoder.alternatePress },
    brightnessAnalog: DEFAULT_CARD_CONTROLS.brightness,
  } });

  await connectDemoCard(page, card);
  await page.addInitScript(({ identity, savedProject, host }) => {
    if (window !== window.top) return;
    localStorage.setItem('lw_card_identity_v1', JSON.stringify(identity));
    localStorage.setItem('lw_chip_card_host', host);
    localStorage.setItem('lw_card_host', host);
    if (!localStorage.getItem('lw_autosave_v3')) {
      localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
    }
  }, { identity: { version: 1, id: CARD_ID, buildId: card.state.buildId, firmwareVersion: card.state.firmwareVersion },
    savedProject: project, host: HOST });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-link-status')).toContainText('Connected');
  return card;
}

for (const width of [320, 390, 1280]) test(`the installer chooses, corrects, tests and prints a wiring setup at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
  const card = await openDemoInstallation(page, makeDemoProject());
  const startStatus = await readCard(page);
  expect(startStatus.limits.outputs).toBe(8);
  expect(startStatus.capabilities.outputTopology).toEqual({
    version: 1, outputPins: [...DEMO_OUTPUT_TOPOLOGY.outputPins], sequenceVersion: 2, experimental: true,
  });
  expect(startStatus.outputs).toHaveLength(4);

  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await page.getByRole('button', { name: 'Set up this card', exact: true }).click();
  const boardSetup = page.getByTestId('connect-board-setup');
  await boardSetup.getByRole('button', { name: 'ESP32-S3-DevKitC-1 N16R8 v1.0', exact: true }).click();
  await boardSetup.getByRole('button', { name: 'Use this board' }).click();
  await expect(boardSetup.getByText('Free for LED data')).toBeVisible();
  await boardSetup.getByRole('button', { name: 'My board looks different' }).click();
  await page.getByLabel('Board name').fill('Demo board correction');
  await page.getByLabel('Printed revision (if shown)').fill('v1.0');
  await page.getByRole('button', { name: 'Save and use this board' }).click();
  await expect(boardSetup.getByRole('heading', { name: /Demo board correction/ })).toBeVisible();
  await boardSetup.getByRole('button', { name: 'Connect strips' }).click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw&installer=1$/);
  const progress = page.locator('[data-testid="installer-setup-progress"]:visible');
  await expect(progress.locator('[aria-current="step"]')).toContainText('Connect strips');
  await expect(progress).toContainText('Step 3 of 4');
  const save = page.getByTestId('layout-check-and-install');
  const specs = page.getByTestId('layout-specs-trigger');
  const [progressBox, specsBox, saveBox] = await Promise.all([progress.boundingBox(), specs.boundingBox(), save.boundingBox()]);
  if (!progressBox || !specsBox || !saveBox) throw new Error('The installer toolbar and its two controls must be visible.');
  expect(progressBox.x + progressBox.width).toBeLessThanOrEqual(specsBox.x);
  expect(specsBox.x + specsBox.width).toBeLessThanOrEqual(saveBox.x);
  expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(width);
  expect(saveBox.y).toBe(specsBox.y);
  if (width < 600) {
    expect(Math.min(specsBox.height, saveBox.height)).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Hide strip list' }).click();
    await expect(save).toBeHidden();
    await page.getByRole('button', { name: 'Show strip list' }).click();
    await expect(save).toBeInViewport({ ratio: 1 });
  }
  const outerRow = page.locator('.la-strip-row').filter({ hasText: 'Outer circle' }).first();
  await expect(outerRow).toContainText('GPIO 15 · 600 LEDs');
  await expect(outerRow.getByRole('button', { name: 'Change pin for Outer circle' })).toBeVisible();
  await expect(outerRow.getByRole('link', { name: 'Count LEDs' })).toHaveAttribute('href', '#screen=discovery&installer=1&pin=15');

  await specs.click();
  const tools = page.getByTestId('advanced-installation-tools');
  if (!await tools.evaluate((element: HTMLDetailsElement) => element.open)) {
    await tools.locator(':scope > summary').click();
  }
  const map = page.getByTestId('wire-pin-map');
  await expect(map).toContainText('Demo board correction');
  await expect(map.locator('[data-pin="48"]')).toContainText('Onboard RGB');
  await expect(map.locator('[data-pin="38"]')).not.toContainText('Onboard RGB');
  await expect(map.locator('[data-pin="12"]')).toContainText('microSD SCK');
  await page.getByRole('button', { name: 'Back to inspector' }).click();

  await page.getByRole('button', { name: 'Change pin for Ring 5' }).click();
  await expect(page.getByLabel('GPIO output', { exact: true })).toBeVisible();
  await assignGpio(page, 'Ring 5', 21);
  if (width === 1280) {
    const footer = page.getByTestId('card-link-status');
    await expect(footer).toHaveAccessibleName('Save to card');
    await footer.click();
    await expect(page.getByTestId('wiring-test-confirm')).toBeVisible();
  } else await startLightTest(page);
  const lightTest = page.getByRole('region', { name: 'Wiring safety check' });
  await expect(lightTest.getByText('Are all the lights steady?')).toBeVisible();
  await expect(lightTest.getByRole('list', { name: 'Strips to check' })).toContainText('Ring 5');
  await expect(lightTest.getByRole('button', { name: 'Restore previous setup' })).toBeInViewport({ ratio: 1 });
  await expect(lightTest.getByRole('button', { name: 'Keep this setup' })).toBeInViewport({ ratio: 1 });
  expect(card.state.bootId).not.toBe(startStatus.bootId);
  expect(card.state.wiringTestActive).toBe(true);
  expect(cardOutputs(card).map(output => [output.pin, output.pixels])).toEqual(expectedOutputs);
  expect(card.state.pixels).toBe(totalPixels);
  await lightTest.getByRole('button', { name: 'Keep this setup' }).click();
  const sheet = page.getByRole('dialog', { name: 'Wiring sheet' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Demo board correction v1.0');
  await expect(sheet).toContainText('J1 pin 8');
  await expect(sheet.getByText('Checked in person', { exact: true })).toHaveCount(5);
  await page.evaluate(() => { window.print = () => { document.body.dataset.printRequested = 'true'; }; });
  await sheet.getByRole('button', { name: 'Print or save as PDF' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-print-requested', 'true');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'Open patterns' }).click();
  await expect(page).toHaveURL(/#screen=pattern$/);
  const confirmed = await readCard(page);
  const confirmedTopology = cardOutputs(card);
  expect(toTopology(confirmed.outputs)).toEqual(confirmedTopology);
  expect(confirmed.wiringProbation.active).toBe(false);
  expect(confirmed.projectFingerprint).not.toBe(startStatus.projectFingerprint);
  expect(card.requests.filter(({ path, method }) => method === 'POST' && path === '/api/wiring/confirm')).toHaveLength(1);

  const startupLook = card.state.installedStartupPatternId;
  expect(startupLook).toBeTruthy();
  const requestsBeforeReboot = card.requests.length;
  card.goOffline();
  card.reboot();
  expect(card.playingId()).toBe(startupLook);
  expect(card.requests).toHaveLength(requestsBeforeReboot);
  card.goOnline();
  const restarted = await readCard(page);
  expect(restarted.bootId).not.toBe(confirmed.bootId);
  expect(restarted.wiringDigest).toBe(confirmed.wiringDigest);
  expect(toTopology(restarted.outputs)).toEqual(confirmedTopology);

  await page.goto(`${LAYOUT_ROUTE}&installer=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-link-status')).toContainText('Connected');
  await assignGpio(page, 'Outer circle', 38);
  await startLightTest(page);
  expect(card.state.wiringTestActive).toBe(true);
  expect(cardOutputs(card)).toEqual(confirmedTopology.map(output => output.pin === 15 ? { ...output, pin: 38 } : output));
  await page.getByTestId('wiring-test-restore').click();
  await expect(page.getByText(/Restored the last working setup/)).toBeVisible();
  const restored = await readCard(page);
  expect(restored.bootId).not.toBe(restarted.bootId);
  expect(restored.wiringProbation.active).toBe(false);
  expect(restored.projectFingerprint).toBe(confirmed.projectFingerprint);
  expect(restored.wiringDigest).toBe(confirmed.wiringDigest);
  expect(toTopology(restored.outputs)).toEqual(confirmedTopology);
  expect(card.requests.filter(({ path, method }) => method === 'POST' && path === '/api/wiring/rollback')).toHaveLength(1);
  await page.getByRole('link', { name: 'Back to strips' }).click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw&installer=1$/);
});

test('a 3,500 LED run can be tested across two pins and restored to one output', async ({ page }) => {
  const project = makeDemoProject();
  const strips = createDefaultCircleLayout({ sectionPixelCounts: [1750, 1750] });
  project.layout.strips = strips;
  project.layout.patchBoard = createDefaultPatchBoard(strips);
  project.layout.patchBoard.dataWireCount = 1;
  const wiring = makeDefaultWiring(strips);
  wiring.outputs = [{ id: 'out1', pin: 15, name: 'Output 1', runIds: wiring.runs.map(run => run.id) }];
  project.layout.wiring = wiring;

  const card = await openDemoInstallation(page, project);
  const before = await readCard(page);
  expect(before.outputs.map(({ pin, pixels }) => [pin, pixels])).toEqual([[15, 3500]]);
  const refresh = page.getByTestId('layout-refresh-warning');
  await expect(refresh).toContainText('9.5 fps');

  await assignGpio(page, 'Inner circle', 21);
  await expect(refresh).toContainText('19.0 fps');
  await startLightTest(page);
  const split = await readCard(page);
  expect(split.outputs.map(({ pin, pixels }) => [pin, pixels])).toEqual([[15, 1750], [21, 1750]]);
  expect(split.bootId).not.toBe(before.bootId);
  expect(split.wiringProbation.active).toBe(true);
  expect(split.outputDriverReady).toBe(true);
  expect(split.pixelCapacity.allocatedBoot).toBeGreaterThanOrEqual(3500);

  await page.getByTestId('wiring-test-restore').click();
  await expect(page.getByText(/Restored the last working setup/)).toBeVisible();
  const restored = await readCard(page);
  expect(restored.outputs).toEqual(before.outputs);
  expect(restored.projectFingerprint).toBe(before.projectFingerprint);
  expect(restored.wiringDigest).toBe(before.wiringDigest);
  expect(restored.wiringProbation.active).toBe(false);
  expect(card.requests.filter(({ path, method }) => method === 'POST' && path === '/api/wiring/confirm')).toHaveLength(0);
});

test('same-pin growth stages and restores when the test outputs fail to initialize', async ({ page }) => {
  const project = makeDemoProject();
  const card = await openDemoInstallation(page, project);
  const before = await readCard(page);
  Object.assign(card.state, { candidateOutputFailure: true });

  const firstStrip = page.locator('[data-strip-id]').filter({
    has: page.locator('.la-strip-row').filter({ hasText: project.layout.strips[0].name }),
  }).first();
  if (!await firstStrip.locator('.la-strip-detail').isVisible()) await firstStrip.locator('.la-strip-row').click();
  const count = firstStrip.getByRole('spinbutton', { name: / LED count$/ });
  await count.fill('3500');
  await count.press('Enter');
  const footer = page.getByTestId('card-link-status');
  await expect(footer).toHaveAccessibleName('Save to card');
  await footer.click();
  await expect(page.getByTestId('wiring-test-restore')).toBeVisible();
  await expect(page.getByText(/test candidate outputs did not initialize/)).toBeVisible();
  await expect(page.getByTestId('wiring-test-confirm')).toHaveCount(0);
  expect(card.requests.filter(({ path, method }) => method === 'POST' && path === '/api/config')).toHaveLength(0);
  expect(card.requests.filter(({ path, method }) => method === 'POST' && path === '/api/wiring/candidate')).toHaveLength(1);

  await page.getByTestId('wiring-test-restore').click();
  await expect(page.getByText(/Restored the last working setup/)).toBeVisible();
  const restored = await readCard(page);
  expect(restored.outputs).toEqual(before.outputs);
  expect(restored.projectFingerprint).toBe(before.projectFingerprint);
  expect(restored.wiringProbation.active).toBe(false);
  expect(card.requests.filter(({ path, method }) => method === 'POST' && path === '/api/wiring/confirm')).toHaveLength(0);
});

test('a simulated capacity or pin violation leaves the running project untouched', async ({ page }) => {
  const card = createCardSimulator({ ...cardState('installed-match'), pin: 15, pixels: totalPixels }, {
    outputTopology: DEMO_OUTPUT_TOPOLOGY, initialOutputs: DEMO_FIVE_OUTPUTS,
  });
  await connectDemoCard(page, card);
  // Fulfill the test document in memory so no request goes to a physical card.
  await page.route('http://lightweaver.local/demo-test', route => route.fulfill({ body: '<!doctype html>' }));
  await page.goto('http://lightweaver.local/demo-test');
  const accepted = cardOutputs(card);
  for (const [outputs, message] of [
    [[...accepted, ...accepted.slice(0, 4)], 'more than 8 outputs are not supported'],
    [[{ ...accepted[0], pin: 10 }, ...accepted.slice(1)], 'unsupported output pin 10'],
    [[{ ...accepted[0], pin: 4 }, ...accepted.slice(1)], 'output pin conflicts with controls: 4'],
    [[{ ...accepted[0], pin: accepted[1].pin }, ...accepted.slice(1)], 'duplicate output pin'],
    [[{ ...accepted[0], pixels: 599 }, ...accepted.slice(1)], 'output segments must sum to output pixels'],
  ] as const) {
    const response = await page.evaluate(async ({ outputs, pixels }) => {
      const result = await fetch('/api/wiring/candidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate: { led: { outputs, pixels } } }),
      });
      return { status: result.status, error: (await result.json()).error };
    }, { outputs, pixels: totalPixels });
    expect(response.status).toBe(400);
    expect(response.error).toContain(message);
    expect(card.state.wiringTransactionOpen).toBe(false);
    expect(cardOutputs(card)).toEqual(accepted);
  }
});
