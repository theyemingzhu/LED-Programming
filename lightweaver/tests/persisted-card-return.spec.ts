import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';
import { normalizePatchBoard } from '../src/lib/patchBoard.js';
import { cardState } from './harness/cardStates';
import type { CardSimulator } from './harness/cardSimulator';
import { createPracticeCard } from './harness/practiceTiming';

type ReopenOptions = { clickBeforeVerification?: boolean };
const test = base.extend<{ reopen: (page: Page, card: CardSimulator, options?: ReopenOptions) => Promise<Page> }>({
  reopen: async ({ browser }, use) => {
    const returnedContexts: BrowserContext[] = [];
    await use(async (page, card, { clickBeforeVerification } = {}) => {
      const previous = page.context();
      const baseURL = new URL(page.url()).origin;
      // Carry durable browser storage across the return, with a fresh page,
      // JavaScript session, and connection state.
      const storageState = await previous.storageState({ indexedDB: true });
      await previous.close();
      const context = await browser.newContext({ baseURL, storageState, serviceWorkers: 'block' });
      returnedContexts.push(context);
      context.setDefaultTimeout(10_000);
      const returned = await context.newPage();
      await card.install(returned);
      const cardEntry = returned.getByRole('button', { name: 'Card', exact: true });
      let releaseReadback = () => {};
      if (clickBeforeVerification) {
        const readback = new Promise<void>(resolve => { releaseReadback = resolve; });
        await returned.route('**/api/{status,firmware-info}', async route => {
          await readback;
          await route.fallback();
        });
      }
      try {
        await returned.goto('/');
        if (clickBeforeVerification) {
          await expect(cardEntry).toHaveAttribute('aria-current', 'page');
          await expect(returned).toHaveURL(/#screen=card&section=setup$/);
        }
        await cardEntry.click({ timeout: 10_000 });
      } finally {
        releaseReadback();
      }
      return returned;
    });
    for (const context of returnedContexts) await context.close();
  },
});

test.use({ actionTimeout: 10_000 });

const artwork = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="ring" d="M 10 10 H 90 V 90 H 10 Z" fill="none" stroke="red"/></svg>');

const readDraft = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null'));

async function makeDraft(page: Page, name: string, save: boolean) {
  await page.goto('/#screen=layout');
  await page.setInputFiles('input[accept=".svg"]', { name: 'return.svg', mimeType: 'image/svg+xml', buffer: artwork });
  await page.getByRole('button', { name: '+ All (1)' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill(name);
  await page.getByTestId('project-name-input').press('Enter');
  if (save) {
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByRole('button', { name: 'Save in browser' }).click();
    await expect(page.getByTestId('workspace-notice')).toContainText('saved in browser library');
  } else {
    await expect(page.getByTestId('project-dirty-dot')).toBeVisible();
  }
  await expect.poll(async () => (await readDraft(page))?.name).toBe(name);
  return readDraft(page);
}

// Simulate a card already installed with this exact editable project, without
// seeding browser autosave or coupling the test to commissioning.
function cardForDraft(project: Awaited<ReturnType<typeof readDraft>>) {
  const { config } = prepareCardDeployment({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 4,
    strips: project.layout.strips,
    patchBoard: normalizePatchBoard(project.layout.patchBoard, project.layout.strips),
    wiring: project.layout.wiring,
    symmetry: project.layout.symmetry,
    sidesMirrored: project.pattern.sidesMirrored,
    standaloneController: project.devices.standaloneController,
  });
  // Start with the lights off so the control press must change actual playback.
  return createPracticeCard({
    ...cardState('installed-match'),
    projectId: project.id,
    projectName: project.name,
    projectFingerprint: config.projectFingerprint,
    pin: config.led.outputs[0].pin,
    pixels: config.led.pixels,
    patterns: config.patterns.map(({ id, label }) => ({ id, label })),
    currentId: 'blackout',
    currentIndex: -1,
  }, { initialOutputs: config.led.outputs }).card;
}

async function expectSavedWifiResponse(page: Page, card: CardSimulator) {
  const status = await page.waitForResponse(async response => {
    if (!response.ok() || new URL(response.url()).pathname !== '/api/status') return false;
    const body = await response.json().catch(() => null);
    return body?.cardId === card.state.cardId && body?.wifi?.transport === 'station';
  });
  expect((await status.json()).wifi).toMatchObject({ configured: true, phase: 'connected', apActive: false });
}

async function connectOverSavedWifi(page: Page, card: CardSimulator) {
  await page.getByTestId('card-link-status').click();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver', exact: true });
  await Promise.all([
    expectSavedWifiResponse(page, card),
    dialog.getByRole('button', { name: 'Find card already on Wi-Fi' }).click(),
  ]);
  const pair = dialog.getByRole('button', { name: 'Connect this card', exact: true });
  await expect(pair).toBeVisible();
  expect(await rememberedCardId(page)).toBeUndefined();
  await pair.click();
  await expect(dialog.getByTestId('direct-card-identity')).toContainText(card.state.cardId);
  await dialog.getByRole('button', { name: 'Close connection center', exact: true }).click();
  await expect.poll(() => rememberedCardId(page)).toBe(card.state.cardId);
}

const rememberedCardId = (page: Page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('lw_card_identity_v1') || 'null')?.id,
);

function cardWrites(card: CardSimulator) {
  return card.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))
    .map(request => request.path);
}

async function playNextInstalledPattern(page: Page, card: CardSimulator) {
  const before = card.playingId();
  await page.getByRole('button', { name: 'Control installed project', exact: true }).click();
  const controls = page.getByRole('dialog', { name: /controls$/ });
  await expect(controls).toContainText('Connected on local network');
  await controls.getByRole('button', { name: 'Next pattern', exact: true }).click();
  await expect.poll(() => card.playingId()).not.toBe(before);
  await expect(controls.getByTestId('card-control-pattern')).toHaveValue(card.playingId());
  await controls.getByRole('button', { name: 'Close card controls', exact: true }).click();
}

test('returning over saved home Wi-Fi keeps the matching editable project and controls the card', async ({ page, reopen }) => {
  const draft = await makeDraft(page, 'Saved gallery piece', true);
  const card = cardForDraft(draft);
  const installedFingerprint = card.state.projectFingerprint;
  await card.install(page);
  await connectOverSavedWifi(page, card);

  const returned = await reopen(page, card);
  await expect(returned.getByTestId('setup-identity-connection')).toContainText(/Connected/);
  await expect(returned.getByTestId('installed-control-open')).toBeEnabled();
  await expect(returned.getByTestId('card-draft-difference')).toContainText('Your draft matches the installed project.');
  await expect(returned.getByTestId('installed-project-open')).toHaveCount(0);
  expect(await rememberedCardId(returned)).toBe(card.state.cardId);
  expect((await readDraft(returned)).layout).toEqual(draft.layout);
  expect(cardWrites(card)).toEqual([]);

  await playNextInstalledPattern(returned, card);
  expect(cardWrites(card)).toEqual(['/api/control']);
  expect(card.state.projectId).toBe(draft.id);
  expect(card.state.projectFingerprint).toBe(installedFingerprint);
});

test('returning with an edit to the installed project controls the saved looks without installing the draft', async ({ page, reopen }) => {
  const saved = await makeDraft(page, 'Gallery piece with pending wiring', true);
  const card = cardForDraft(saved);
  const installedFingerprint = card.state.projectFingerprint;
  const installedPixels = card.state.pixels;
  await card.install(page);
  await connectOverSavedWifi(page, card);
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('lw_project_lifecycle_v1') || 'null')?.installation?.projectFingerprint,
  )).toBe(installedFingerprint);
  await page.getByRole('button', { name: 'One more total LED', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Total LEDs', exact: true })).toHaveValue(String(installedPixels + 1));
  await expect.poll(async () => (await readDraft(page))?.layout.strips).not.toEqual(saved.layout.strips);
  const draft = await readDraft(page);

  expect(await page.evaluate(id => localStorage.getItem(`lw_card_resume_place_v1:${id}`), card.state.cardId))
    .toBe('#screen=layout');
  const returned = await reopen(page, card, { clickBeforeVerification: true });
  const difference = returned.getByTestId('card-draft-difference');
  await expect(difference).toContainText(draft.name);
  await expect(difference).toContainText(/differs|different/i);
  await expect(returned.getByTestId('installed-control-open')).toBeEnabled();
  await expect(returned).toHaveURL(/#screen=card&section=setup$/);
  expect(cardWrites(card)).toEqual([]);
  await playNextInstalledPattern(returned, card);
  expect(cardWrites(card)).toEqual(['/api/control']);
  expect(card.state.pixels).toBe(installedPixels);
  expect(card.state.projectFingerprint).toBe(installedFingerprint);
  expect(await readDraft(returned)).toMatchObject({ id: draft.id, name: draft.name, layout: draft.layout });
});

test('returning to a different installation keeps unsaved work until explicit recovery', async ({ page, reopen }) => {
  const draft = await makeDraft(page, 'Unsaved gallery draft', false);
  const card = createPracticeCard(cardState('installed-different')).card;
  await card.install(page);
  await connectOverSavedWifi(page, card);

  const returned = await reopen(page, card);
  const difference = returned.getByTestId('card-draft-difference');
  await expect(difference).toContainText(draft.name);
  await expect(difference).toContainText(/differs|different/i);
  await expect(returned.getByTestId('installed-control-open')).toBeEnabled();
  expect(await readDraft(returned)).toMatchObject({ id: draft.id, name: draft.name, layout: draft.layout });
  expect(cardWrites(card)).toEqual([]);

  const installedId = card.state.projectId;
  const installedFingerprint = card.state.projectFingerprint;
  await playNextInstalledPattern(returned, card);
  expect(await readDraft(returned)).toMatchObject({ id: draft.id, name: draft.name, layout: draft.layout });
  expect(cardWrites(card)).toEqual(['/api/control']);

  await returned.getByRole('button', { name: 'Open installed project', exact: true }).click();
  await expect.poll(async () => (await readDraft(returned))?.id).toBe(installedId);
  const recovered = await readDraft(returned);
  await returned.getByTestId('topbar-projects').click();
  const association = await returned.getByTestId('projects-association').innerText();
  await returned.getByRole('button', { name: 'Open Unsaved gallery draft', exact: true }).click();
  await expect.poll(async () => (await readDraft(returned))?.id).toBe(draft.id);
  expect((await readDraft(returned)).layout).toEqual(draft.layout);
  expect(association).toContain('Card copy (partial');
  expect(recovered.name).toBe(card.state.projectName);
  expect(recovered.layout.svgText).toBeFalsy();
  expect(card.state.projectId).toBe(installedId);
  expect(card.state.projectFingerprint).toBe(installedFingerprint);
  expect(cardWrites(card)).toEqual(['/api/control']);
});

test('returning with an exact browser-library copy protects another draft and reopens the editable source', async ({ page, reopen }) => {
  const saved = await makeDraft(page, 'Editable installed artwork', true);
  const card = cardForDraft(saved);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const outgoing = await makeDraft(page, 'Outgoing artwork draft', false);
  expect(outgoing.id).not.toBe(saved.id);
  await card.install(page);
  await connectOverSavedWifi(page, card);

  const returned = await reopen(page, card);
  await expect(returned.getByTestId('card-draft-difference')).toContainText(outgoing.name);
  await returned.getByRole('button', { name: 'Open installed project', exact: true }).click();
  await expect.poll(async () => (await readDraft(returned))?.id).toBe(saved.id);
  expect((await readDraft(returned)).layout).toEqual(saved.layout);
  await returned.getByTestId('topbar-projects').click();
  await returned.getByRole('button', { name: 'Open Outgoing artwork draft', exact: true }).click();
  await expect.poll(async () => (await readDraft(returned))?.id).toBe(outgoing.id);
  expect((await readDraft(returned)).layout).toEqual(outgoing.layout);
  expect(cardWrites(card)).toEqual([]);
});

test('returning with only the remembered card recovers its project without writing to the card', async ({ page, reopen }) => {
  const card = createPracticeCard(cardState('installed-match')).card;
  await card.install(page);
  await Promise.all([expectSavedWifiResponse(page, card), page.goto('/#screen=layout')]);
  const connection = page.getByTestId('card-link-status');
  await expect(connection).toHaveAttribute('data-lifecycle-state', 'found-unpaired');
  await connection.click();
  await expect(connection).toContainText('Connected');
  await expect.poll(() => rememberedCardId(page)).toBe(card.state.cardId);
  await expect(page.getByTestId('project-dirty-dot')).toHaveCount(0);
  const starter = await readDraft(page);
  expect(starter?.layout.starterPending ?? true).toBe(true);
  expect(starter?.id).not.toBe(card.state.projectId);

  const returned = await reopen(page, card);
  await expect.poll(async () => (await readDraft(returned))?.id).toBe(card.state.projectId);
  await returned.getByTestId('topbar-projects').click();
  await expect(returned.getByTestId('projects-association')).toContainText('Card copy (partial');
  expect(await rememberedCardId(returned)).toBe(card.state.cardId);
  expect(cardWrites(card)).toEqual([]);
});

test('returning while the remembered card is offline retains the editable project without claiming live control', async ({ page, reopen }) => {
  const draft = await makeDraft(page, 'Offline gallery piece', true);
  const card = cardForDraft(draft);
  await card.install(page);
  await connectOverSavedWifi(page, card);
  card.goOffline();

  const returned = await reopen(page, card);
  await expect(returned.getByTestId('setup-identity-connection')).toContainText(/Disconnected|Not connected|Not reachable|Offline/i);
  await expect(returned.getByRole('button', { name: 'Control installed project', exact: true, disabled: false })).toHaveCount(0);
  expect(await rememberedCardId(returned)).toBe(card.state.cardId);
  expect(await readDraft(returned)).toMatchObject({ id: draft.id, name: draft.name, layout: draft.layout });
  expect(cardWrites(card)).toEqual([]);
});
