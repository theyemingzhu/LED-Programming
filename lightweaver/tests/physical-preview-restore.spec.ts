import { writeFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { cardState } from './harness/cardStates';
import { createPracticeCard } from './harness/practiceTiming';
import { seedKnownCard, waitForCardProject } from './harness/falseFailureWatch';
import { choosePattern, closeControls } from './helpers/pattern-lab';

const namedLook = 'installed-evening';
const zones = [
  { id: 'outer', patternId: 'aurora' },
  { id: 'inner', patternId: 'fire' },
];

const benchZones = Array.from({ length: 5 }, (_, index) => ({ id: `zone-${index + 1}`, patternId: 'fire', brightness: 0.91 }));

type Fixture = 'named' | 'mixed' | 'bench';
async function openPreview(page: Page, path: 'Pattern Lab' | 'Layout', fixture: Fixture = 'named', native = false) {
  const initialLook = fixture === 'mixed' ? '' : fixture === 'bench' ? 'fire' : namedLook;
  const initialZones = fixture === 'bench' ? benchZones : zones;
  const { card } = createPracticeCard({
    ...cardState('playing'),
    currentId: initialLook,
    currentIndex: fixture === 'mixed' ? -1 : fixture === 'bench' ? 2 : 0,
    patterns: [{ id: namedLook, label: 'Evening' }, { id: 'aurora', label: 'Aurora' }, { id: 'fire', label: 'Fire' }],
  }, { previewPlayback: {
    syncZones: false,
    zones: initialZones,
    ...(initialLook ? { installedLook: { id: initialLook, brightness: 1 } } : {}),
  } });

  await card.install(page);
  await seedKnownCard(page);
  const status = async () => (await card.handleBridge('status', {})).response;
  const zoneState = async () => (await card.handleBridge('zones', {})).response;
  let stop: () => Promise<void>;
  let note: Locator;

  if (path === 'Pattern Lab') {
    await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
    await waitForCardProject(page);
    await choosePattern(page, native ? 'aurora' : 'gradient');
    await closeControls(page);
    await page.getByRole('button', { name: 'Live preview', exact: true }).click();
    stop = () => page.getByRole('button', { name: 'Stop preview', exact: true }).click();
    note = page.locator('.plab-live-preview [role="status"]');
  } else {
    await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
    await waitForCardProject(page);
    const closedSheet = page.locator('[data-testid="layout-sheet-handle"][aria-expanded="false"]');
    if (await closedSheet.isVisible()) await closedSheet.click();
    await page.getByTestId('placed-look-on').click({ timeout: 12_000 });
    const live = page.getByTestId('placed-look-live');
    await live.check();
    stop = () => live.uncheck();
    note = page.getByTestId('placed-look-live-note');
  }

  if (native) {
    await expect(note).toContainText('Playing on the card');
    expect(await status()).toMatchObject({ currentLookId: 'aurora', streaming: false });
  } else {
    await expect.poll(() => card.frames.length).toBeGreaterThan(0);
    expect(await status()).toMatchObject({ streaming: true, lwOutput: { sourceClass: 'external' } });
  }
  const firstStopRequest = card.requests.length;
  const commands = () => card.requests.slice(firstStopRequest)
    .filter(entry => entry.method === 'POST' && entry.path === '/api/control').map(entry => entry.body);
  return { card, commands, note, status, stop, zoneState };
}

async function attachEvidence(page: Page, info: TestInfo, preview: Awaited<ReturnType<typeof openPreview>>) {
  const evidence = {
      commands: preview.commands(),
      status: await preview.status(),
      zones: await preview.zoneState(),
      ui: await preview.note.innerText(),
  };
  const logPath = info.outputPath('practice-stop.json');
  await writeFile(logPath, JSON.stringify(evidence, null, 2));
  await info.attach('practice-stop', { path: logPath, contentType: 'application/json' });
  const screenshot = info.outputPath('stop-ui.png');
  await page.screenshot({ path: screenshot });
  await info.attach('stop-ui', { path: screenshot, contentType: 'image/png' });
}

for (const [viewport, size] of Object.entries({ desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } })) {
  test.describe(viewport, () => {
    test.use({ viewport: size, hasTouch: viewport === 'phone', isMobile: viewport === 'phone' });
    for (const path of ['Pattern Lab', 'Layout'] as const) {
      test(`${path} Stop restores a named look with different zone pattern IDs`, async ({ page }, info) => {
        const preview = await openPreview(page, path);
        await preview.stop();
        await expect(preview.note).toContainText(path === 'Pattern Lab' ? 'Previous card look restored' : "The card's own look is back.");
        await attachEvidence(page, info, preview);
        expect(await preview.status()).toMatchObject({
          currentLookId: namedLook, streaming: false, lwOutput: { sourceClass: 'local' },
        });
        expect(await preview.zoneState()).toMatchObject({ syncZones: false, zones });
        expect(preview.commands()).toContainEqual({ cancelStream: true });
      });
    }
  });
}

test('Layout Stop preserves the bench-shaped unsynced Fire look at its live 0.91 brightness', async ({ page }, info) => {
  const preview = await openPreview(page, 'Layout', 'bench');
  await preview.stop();
  await expect(preview.note).toContainText("The card's own look is back.");
  await attachEvidence(page, info, preview);
  expect(preview.commands()).toEqual([{ cancelStream: true }]);
  expect(await preview.status()).toMatchObject({ currentLookId: 'fire', streaming: false, lwOutput: { sourceClass: 'local' } });
  expect(await preview.zoneState()).toMatchObject({ syncZones: false, zones: benchZones });
});

test('Pattern Lab native Stop reselects Fire and puts all five live brightness values back', async ({ page }, info) => {
  const preview = await openPreview(page, 'Pattern Lab', 'bench', true);
  await preview.stop();
  await expect(preview.note).toContainText('Previous card look restored');
  await attachEvidence(page, info, preview);
  expect(preview.commands()).toContainEqual({ syncZones: false, patternId: 'fire' });
  expect(preview.commands()).toEqual(expect.arrayContaining(benchZones.map(zone =>
    expect.objectContaining({ zone: zone.id, brightness: zone.brightness, syncZones: false }))));
  expect(await preview.status()).toMatchObject({ currentLookId: 'fire', streaming: false, lwOutput: { sourceClass: 'local' } });
  expect(await preview.zoneState()).toMatchObject({ syncZones: false, zones: benchZones });
});

test('Pattern Lab switching native to streamed restores the look from before Live preview', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const preview = await openPreview(page, 'Pattern Lab', 'bench', true);
  await choosePattern(page, 'gradient');
  await closeControls(page);
  await expect.poll(() => preview.card.frames.length).toBeGreaterThan(0);
  await preview.stop();
  await expect(preview.note).toContainText('Previous card look restored');
  await attachEvidence(page, info, preview);
  expect(preview.commands()).toContainEqual({ patternId: 'fire', syncZones: false });
  expect(preview.commands().at(-1)).toEqual({ cancelStream: true });
  expect(await preview.status()).toMatchObject({ currentLookId: 'fire', streaming: false, lwOutput: { sourceClass: 'local' } });
  expect(await preview.zoneState()).toMatchObject({ syncZones: false, zones: benchZones });
});

test('Pattern Lab native Stop replays genuine mixed playback by zone', async ({ page }, info) => {
  const preview = await openPreview(page, 'Pattern Lab', 'mixed', true);
  await preview.stop();
  await expect(preview.note).toContainText('Previous card look restored');
  await attachEvidence(page, info, preview);
  expect(preview.commands()).toEqual(zones.map(zone =>
    expect.objectContaining({ zone: zone.id, patternId: zone.patternId, syncZones: false })));
  expect(await preview.status()).toMatchObject({ currentLookId: '', streaming: false, lwOutput: { sourceClass: 'local' } });
  expect(await preview.zoneState()).toMatchObject({ syncZones: false, zones });
});

test('Layout Stop reports a refused cancellation without claiming the look is back', async ({ page }, info) => {
  const preview = await openPreview(page, 'Layout');
  preview.card.refuse('/api/control', { status: 423 });
  await preview.stop();
  await expect(preview.note).toContainText("The card's own look could not be put back");
  await attachEvidence(page, info, preview);
  expect(preview.commands()).toEqual([{ cancelStream: true }]);
  expect(await preview.status()).toMatchObject({ currentLookId: namedLook, streaming: true, lwOutput: { sourceClass: 'external' } });
});

test('Pattern Lab Stop leaves a newer manual card selection in place', async ({ page }, info) => {
  const preview = await openPreview(page, 'Pattern Lab', 'bench');
  await preview.card.handleBridge('control', { patternId: 'aurora', cancelStream: true });
  await preview.stop();
  await expect(preview.note).toContainText('newer playback was left in place');
  await attachEvidence(page, info, preview);
  const [manual, ...studio] = preview.commands();
  expect(manual).toEqual({ patternId: 'aurora', cancelStream: true });
  // A frame already queued at the time of the manual selection can require
  // a second cancellation. Studio must never send another look selection.
  expect(studio.length).toBeLessThanOrEqual(1);
  for (const command of studio) expect(command).toEqual({ cancelStream: true });
  expect(await preview.status()).toMatchObject({ currentLookId: 'aurora', streaming: false, lwOutput: { sourceClass: 'local' } });
});

test('Layout Stop leaves a different installed card project alone', async ({ page }, info) => {
  const preview = await openPreview(page, 'Layout');
  preview.card.state.projectRevision += 1;
  await preview.stop();
  await expect(preview.note).toContainText('installed project');
  await attachEvidence(page, info, preview);
  expect(preview.commands()).toEqual([]);
});

test('Layout keeps preview running when discovery finds another address for the paired card', async ({ page }, info) => {
  const preview = await openPreview(page, 'Layout');
  const live = page.getByTestId('placed-look-live');
  const initialHost = preview.card.lastFrameHost();
  expect(initialHost).toBeTruthy();
  const alias = initialHost === '192.168.18.70' ? 'lightweaver.local' : '192.168.18.70';
  const rediscovered = page.waitForResponse(response =>
    new URL(response.url()).hostname === alias && new URL(response.url()).pathname === '/api/status' && response.ok(),
  { timeout: 10_000 });
  await page.evaluate(host => {
    const identity = JSON.parse(localStorage.getItem('lw_card_identity_v1') || '{}');
    delete identity.hostname;
    delete identity.address;
    if (host.endsWith('.local')) identity.hostname = host;
    else identity.address = host;
    localStorage.setItem('lw_card_identity_v1', JSON.stringify(identity));
    localStorage.setItem('lw_card_host', host);
    window.dispatchEvent(new CustomEvent('lightweaver-card-host-changed', { detail: { host } }));
  }, alias);
  await rediscovered;

  // Editing the look after discovery must still reach the same card.
  const frames = preview.card.frames.length;
  await page.getByTestId('placed-look-width').fill('5');
  await expect.poll(() => preview.card.frames.length).toBeGreaterThan(frames + 5);
  await expect(live).toBeChecked();
  expect(preview.commands()).toEqual([]);

  await preview.stop();
  await expect(preview.note).toContainText("The card's own look is back.");
  await attachEvidence(page, info, preview);
  expect(preview.commands()).toEqual([{ cancelStream: true }]);
  expect(await preview.status()).toMatchObject({
    currentLookId: namedLook, streaming: false, lwOutput: { sourceClass: 'local' },
  });
});
