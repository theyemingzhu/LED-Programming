import { test, expect } from './studioTest';
import type { Page } from '@playwright/test';
import { createDefaultProject, migrateProject } from '../src/lib/projectModel.js';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';
import { prepareCardStoragePayload } from '../src/lib/cardStoragePayload.js';
import { CARD_PATTERN_BANK } from '../src/lib/cardPatternBank.js';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';

function makePlaylistProject({ count = 19, oversized = false } = {}) {
  const project = createDefaultProject();
  project.id = oversized ? 'oversized-playlist-export' : 'nineteen-look-playlist-export';
  project.name = oversized ? 'Oversized playlist export' : 'Nineteen look playlist export';
  const patterns = CARD_PATTERN_BANK.slice(0, count);
  project.devices.standaloneController.playlist = patterns.map((pattern, order) => ({
    id: pattern.id,
    label: oversized ? `${pattern.label} ${'oversized-label-'.repeat(24)}` : pattern.label,
    type: 'pattern',
    patternId: pattern.id,
    enabled: true,
    order,
  }));
  project.devices.standaloneController.controls.encoder.patternCycleIds = patterns.map(pattern => pattern.id);
  return project;
}

function preparedForProject(input) {
  const project = migrateProject(input);
  const prepared = prepareCardDeployment({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 0,
    strips: project.layout.strips,
    patchBoard: project.layout.patchBoard,
    wiring: project.layout.wiring,
    standaloneController: project.devices.standaloneController,
  });
  return prepareCardStoragePayload(prepared.runtimePackage);
}

async function gotoPlaylist(page, project) {
  await page.addInitScript((savedProject) => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
  }, project);
  await page.goto('/#screen=playlist', { waitUntil: 'domcontentloaded' });
}

async function waitForUiCommit(page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

/**
 * A real card reboot (Recover lights' `restartCard: true`) genuinely changes
 * the simulator's bootId, so Studio's own connection layer treats the card as
 * having gone away and briefly reconnects — the old frozen /api/status stub
 * never modelled a reboot at all, so no test here ever had to wait one out.
 * Any test that sends live control again after a recovery-with-restart has
 * to wait for that reconnect first, same technique as journey-continuity's
 * waitConnectedUnaided.
 */
async function waitReconnected(page: Page) {
  // The link is a state machine that revalidates itself periodically even
  // once connected (a changed bootId after reboot triggers exactly that
  // revalidation), so a single "connected-*" read can be one poll tick from
  // flipping back to 'revalidating'. Require it to hold for several
  // consecutive reads before trusting it enough to send a command.
  let consecutiveConnected = 0;
  await expect.poll(async () => {
    const state = await page.evaluate(async () => {
      const { getSharedCardLink } = await import('/src/lib/cardLink.js');
      return String(getSharedCardLink().getState()?.state || '');
    });
    consecutiveConnected = /^connected-(direct|bridge)$/.test(state) ? consecutiveConnected + 1 : 0;
    return consecutiveConnected;
  }, { timeout: 15000, intervals: [300] }).toBeGreaterThanOrEqual(4);
}

// The simulator's own facts, shaped from the exact project under test — same
// project id, revision, fingerprint, wiring and patterns the card would
// report if this project had genuinely been installed on it. Every pattern in
// the bank is loaded onto the card (not just the ones in this playlist) so
// applyControl() can always resolve a requested pattern id, whatever count
// the test asked for.
function stateFromProject(project, overrides: Record<string, unknown> = {}) {
  const config = preparedForProject(project).config;
  const outputs = config.led?.outputs || [];
  const patterns = CARD_PATTERN_BANK.map(pattern => ({ id: pattern.id, label: pattern.label }));
  const currentId = config.startupPatternId;
  const currentIndex = patterns.findIndex(pattern => pattern.id === currentId);
  return {
    id: 'playlist-storage-card',
    describe: 'card holding the playlist project under test',
    projectId: config.piece.id,
    projectName: config.piece.name,
    projectRevision: config.projectRevision,
    projectFingerprint: config.projectFingerprint,
    provisionalSetup: false,
    pin: outputs[0]?.pin ?? 18,
    pixels: config.led.pixels,
    patterns,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
    currentId,
    wiringTransactionOpen: false,
    buildId: 'a'.repeat(40),
    buildNumber: 1,
    firmwareVersion: '1.0.0',
    dropFirstRequests: 0,
    ...overrides,
  };
}

/**
 * A card holding exactly the project under test, connected before the
 * Playlist screen loads. `configure` runs on the simulator after it is built
 * but before its routes are installed — the hook for "the card is not
 * showing this row yet" (`card.state.currentId = 'blackout'`) and similar
 * pre-install state changes.
 */
async function mockConnectedPlaylistCard(
  page: Page,
  project,
  cardId = 'lw-playlist-install',
  configure?: (card: CardSimulator) => void,
): Promise<CardSimulator> {
  await page.addInitScript((identity) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: identity }));
  }, cardId);
  const card = createCardSimulator(stateFromProject(project), { cardId });
  if (typeof configure === 'function') configure(card);
  await card.install(page);
  return card;
}

/**
 * Delay a genuine transport failure (never a card refusal — the card never
 * answers at all) until the test releases it. route.abort() carries none of
 * the simulator's own write latency, so the few tests that race an edit
 * against a lost reply need this explicit gate to stay deterministic.
 */
async function gateThenAbort(page: Page, path: string, errorCode = 'timedout') {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${path}`, async route => {
    await gate;
    await route.abort(errorCode);
  });
  return () => release();
}

/** The physical commands a card actually received, in order, card-owned. */
function physicalCommandsFrom(card: CardSimulator): string[] {
  let recoveryCount = 0;
  return card.requests
    .filter(entry => entry.path === '/api/control' || entry.path === '/api/recover-lights' || entry.path === '/api/reboot')
    .map(entry => {
      if (entry.path === '/api/reboot') return 'reboot';
      if (entry.path === '/api/recover-lights') {
        recoveryCount += 1;
        return `recover:${recoveryCount}`;
      }
      const body = (entry.body || {}) as Record<string, unknown>;
      return `control:${body.patternId ?? ''}`;
    });
}

function controlRequestCount(card: CardSimulator): number {
  return card.requests.filter(entry => entry.path === '/api/control').length;
}

test('Playlist rows expose only compact item-specific controls', async ({ page }) => {
  await gotoPlaylist(page, makePlaylistProject({ count: 3 }));

  const auroraRow = page.getByTestId('playlist-row-aurora');
  await expect(auroraRow.getByRole('button')).toHaveCount(4);
  const reorderAurora = auroraRow.getByRole('button', { name: 'Reorder Aurora', exact: true });
  await expect(reorderAurora).toBeVisible();
  await expect(reorderAurora).toHaveAttribute('aria-describedby', 'playlist-reorder-instructions');
  await expect(page.locator('#playlist-reorder-instructions')).toContainText('Arrow Up or Arrow Down');
  await expect(page.locator('#playlist-reorder-instructions')).toContainText('Home or End');
  await expect(page.locator('#playlist-reorder-instructions')).toContainText('pointer or touch');
  const reorderBox = await reorderAurora.boundingBox();
  expect(reorderBox?.width).toBeGreaterThanOrEqual(36);
  expect(reorderBox?.height).toBeGreaterThanOrEqual(36);
  await expect(auroraRow.getByRole('button', { name: 'Live', exact: true })).toBeVisible();
  await expect(auroraRow.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();

  const removeAurora = auroraRow.getByRole('button', { name: 'Remove Aurora', exact: true });
  await expect(removeAurora).toHaveText('×');
  await expect(removeAurora).toHaveAttribute('title', 'Remove Aurora');
  const removeBox = await removeAurora.boundingBox();
  expect(removeBox?.width).toBeGreaterThanOrEqual(36);
  expect(removeBox?.height).toBeGreaterThanOrEqual(36);

  for (const name of ['Up', 'Down', 'Make first', 'Remove']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
});

test('Playlist touch handle reorders on a coarse pointer', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    // U2-build item 2 moved the playlist itself higher up this short
    // fixture's page (no longer floated below Saved looks / Pattern pool on
    // a phone, which is the change this ticket wants), so `.pm-main` no
    // longer starts as far down the inner scroll container as it used to.
    // At a 800px-tall viewport that shifted where `scrollIntoViewIfNeeded`
    // settles closely enough that Aurora's row and Plasma's row could not
    // both land on screen at once. A taller viewport (comfortably above one
    // three-item playlist's rendered height) keeps both rows on screen
    // without depending on exactly where the surrounding chrome happens to
    // put the fold.
    viewport: { width: 320, height: 1400 },
  });
  const page = await context.newPage();
  try {
    await gotoPlaylist(page, makePlaylistProject({ count: 3 }));
    // The ambient "Restored from recovery copy" workspace notice (unrelated
    // to anything under test here; it fires whenever no lifecycle record is
    // persisted) docks bottom-left and can still land on interactive content
    // at some viewport heights. Dismiss it before the drag so this test
    // measures the drag, not an incidental notice landing on top of it.
    const workspaceNotice = page.getByTestId('workspace-notice');
    if (await workspaceNotice.isVisible().catch(() => false)
      || await workspaceNotice.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await workspaceNotice.getByRole('button', { name: 'Dismiss notice' }).click();
    }

    const reorderAurora = page.getByRole('button', { name: 'Reorder Aurora', exact: true });
    await reorderAurora.scrollIntoViewIfNeeded();
    const handleBox = await reorderAurora.boundingBox();
    const plasmaBox = await page.getByTestId('playlist-row-plasma').boundingBox();
    expect(handleBox).not.toBeNull();
    expect(plasmaBox).not.toBeNull();
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{
        id: 0,
        x: handleBox!.x + handleBox!.width / 2,
        y: handleBox!.y + handleBox!.height / 2,
      }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        id: 0,
        x: plasmaBox!.x + plasmaBox!.width / 2,
        y: plasmaBox!.y + plasmaBox!.height / 2,
      }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(page.locator('.pl-row .pl-copy > strong')).toHaveText(['Plasma', 'Aurora', 'Fire']);
  } finally {
    await context.close();
  }
});

test('Playlist coarse-pointer reorder and remove targets are at least 44px', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 800 },
  });
  const page = await context.newPage();
  try {
    await gotoPlaylist(page, makePlaylistProject({ count: 3 }));
    for (const control of [
      page.getByRole('button', { name: 'Reorder Aurora', exact: true }),
      page.getByRole('button', { name: 'Remove Aurora', exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await context.close();
  }
});

test('Playlist reorder handles support keyboard bounds, announce moves, and retain focus', async ({ page }) => {
  await gotoPlaylist(page, makePlaylistProject({ count: 3 }));

  const auroraHandle = page.getByRole('button', { name: 'Reorder Aurora', exact: true });
  await auroraHandle.focus();
  await auroraHandle.press('ArrowDown');
  await expect(page.locator('.pl-row .pl-copy > strong')).toHaveText(['Plasma', 'Aurora', 'Fire']);
  await expect(page.getByTestId('playlist-reorder-status')).toHaveText('Aurora moved to position 2 of 3');
  await expect(page.getByRole('button', { name: 'Reorder Aurora', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Reorder Aurora', exact: true }).press('Home');
  await expect(page.locator('.pl-row .pl-copy > strong')).toHaveText(['Aurora', 'Plasma', 'Fire']);
  await expect(page.getByTestId('playlist-reorder-status')).toHaveText('Aurora moved to position 1 of 3');
  await expect(page.getByRole('button', { name: 'Reorder Aurora', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Reorder Aurora', exact: true }).press('End');
  await expect(page.locator('.pl-row .pl-copy > strong')).toHaveText(['Plasma', 'Fire', 'Aurora']);
  await expect(page.getByTestId('playlist-reorder-status')).toHaveText('Aurora moved to position 3 of 3');
  await expect(page.getByRole('button', { name: 'Reorder Aurora', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Reorder Aurora', exact: true }).press('End');
  await expect(page.locator('.pl-row .pl-copy > strong')).toHaveText(['Plasma', 'Fire', 'Aurora']);
});

test('Playlist remove and pointer reorder target the named compact controls', async ({ page }) => {
  await gotoPlaylist(page, makePlaylistProject({ count: 3 }));

  const auroraRow = page.getByTestId('playlist-row-aurora');
  const reorderAurora = page.getByRole('button', { name: 'Reorder Aurora', exact: true });
  await expect(auroraRow).not.toHaveAttribute('draggable', 'true');
  await expect(reorderAurora).toHaveAttribute('draggable', 'true');
  await expect(reorderAurora).toHaveAttribute('title', 'Reorder Aurora');

  await expect(async () => {
    await reorderAurora.dragTo(page.getByTestId('playlist-row-fire'));
    await expect(page.locator('.pl-row .pl-copy > strong')).toHaveText(['Plasma', 'Fire', 'Aurora']);
  }).toPass({ timeout: 15_000 });
  await expect(page.locator('.pl-row .pl-copy > strong')).toHaveText(['Plasma', 'Fire', 'Aurora']);

  await page.getByRole('button', { name: 'Remove Plasma', exact: true }).click();
  await expect(page.getByTestId('playlist-row-plasma')).toHaveCount(0);
  await expect(page.getByTestId('playlist-row-fire')).toHaveCount(1);
  await expect(page.getByTestId('playlist-row-aurora')).toHaveCount(1);
});

test('Playlist resolves a duplicate encoder press without pausing card setup', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  project.devices.standaloneController.controls.encoder.press = 6;
  await gotoPlaylist(page, project);

  await expect(page.locator('.pm')).toBeVisible();
  await expect(page.getByTestId('screen-error-fallback')).toHaveCount(0);
  await expect(page.getByTestId('playlist-hardware-warning')).toHaveCount(0);

  await expect(page.locator('.pl-row')).toHaveCount(2);
  await page.locator('.pl-row').first().getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.locator('.pl-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Install playlist on card' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Copy chip config/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
});

test('Playlist copy and download equal the canonical compact 19-look payload', async ({ page }) => {
  const project = makePlaylistProject();
  const expected = preparedForProject(project);
  expect(expected.bytes).toBeLessThanOrEqual(3968);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => { (window as any).__copiedPlaylistConfig = text; },
      },
    });
  });
  await gotoPlaylist(page, project);

  await page.getByRole('button', { name: /Copy chip config/ }).click();
  const copied = await page.evaluate(() => (window as any).__copiedPlaylistConfig || '');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const downloaded = Buffer.concat(chunks).toString('utf8');

  expect(copied).toBe(expected.json);
  expect(downloaded).toBe(expected.json);
  expect(copied).not.toContain('\n');
});

test('Playlist overflow blocks clipboard, blob, and download side effects with exact feedback', async ({ page }) => {
  const project = makePlaylistProject({ count: 32, oversized: true });
  let capacityError: any = null;
  try {
    preparedForProject(project);
  } catch (error) {
    capacityError = error;
  }
  expect(capacityError?.reason).toBe('config-too-large');
  await page.addInitScript(() => {
    (window as any).__playlistExportEffects = { clipboard: 0, objectUrl: 0, anchorClick: 0 };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => { (window as any).__playlistExportEffects.clipboard += 1; },
      },
    });
    URL.createObjectURL = () => {
      (window as any).__playlistExportEffects.objectUrl += 1;
      return 'blob:unexpected';
    };
    HTMLAnchorElement.prototype.click = function click() {
      (window as any).__playlistExportEffects.anchorClick += 1;
    };
  });
  await gotoPlaylist(page, project);

  await page.getByRole('button', { name: /Copy chip config/ }).click();
  await expect(page.getByTestId('playlist-card-status')).toBeVisible();
  expect(await page.getByTestId('playlist-card-status').evaluate(node => node.childNodes[0]?.textContent)).toBe(capacityError.message);
  expect(await page.evaluate(() => (window as any).__playlistExportEffects)).toEqual({
    clipboard: 0,
    objectUrl: 0,
    anchorClick: 0,
  });

  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByTestId('playlist-card-status')).toBeVisible();
  expect(await page.getByTestId('playlist-card-status').evaluate(node => node.childNodes[0]?.textContent)).toBe(capacityError.message);
  expect(await page.evaluate(() => (window as any).__playlistExportEffects)).toEqual({
    clipboard: 0,
    objectUrl: 0,
    anchorClick: 0,
  });
});

test('Playlist install stays pending, fails with Retry, then remains confirmed until the next edit', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  const card = await mockConnectedPlaylistCard(page, project);
  card.refuse('/api/config', { status: 503, body: 'not ready' });
  await gotoPlaylist(page, project);

  const install = page.getByRole('button', { name: 'Install playlist on card' });
  await expect(install).toBeEnabled();
  await install.click();
  await expect(page.getByTestId('playlist-card-status')).toContainText('Installing playlist on card…');

  const failure = page.getByTestId('playlist-card-status');
  await expect(failure).toHaveAttribute('role', 'alert');
  await expect(failure.getByRole('button', { name: 'Retry' })).toBeVisible();
  await failure.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('playlist-card-status')).toContainText('Playlist installed on card.');
  await expect(page.getByTestId('playlist-card-status')).toBeVisible();

  await page.locator('.pl-row').first().getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
});

test('Playlist ignores a stale install success after the playlist is edited', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await mockConnectedPlaylistCard(page, project, 'lw-playlist-stale-install-success');
  await gotoPlaylist(page, project);

  const configRequest = page.waitForRequest(request => request.url().endsWith('/api/config'));
  await page.getByRole('button', { name: 'Install playlist on card' }).click();
  await configRequest;
  // Registered now, before the edit that follows — the simulator answers
  // this refused/successful request in well under a second, so a listener
  // set up any later than "the request just landed" risks missing the
  // response it is waiting for.
  const configResponse = page.waitForResponse(response => response.url().endsWith('/api/config'));
  await page.locator('.pl-row').first().getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);

  await configResponse;
  await waitForUiCommit(page);
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
  await expect(page.locator('.pl-row')).toHaveCount(3);
});

test('Playlist ignores a stale install failure after a newer live preview succeeds', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  const card = await mockConnectedPlaylistCard(page, project, 'lw-playlist-stale-install-failure');
  card.refuse('/api/config', { status: 503, body: 'stale install failed' });
  await gotoPlaylist(page, project);

  const configRequest = page.waitForRequest(request => request.url().endsWith('/api/config'));
  await page.getByRole('button', { name: 'Install playlist on card' }).click();
  await configRequest;
  const configResponse = page.waitForResponse(response => response.url().endsWith('/api/config'));
  const firstRow = page.locator('.pl-row').first();
  await firstRow.getByRole('button', { name: 'Live' }).click();
  await expect(firstRow).toHaveClass(/\bis-live\b/);

  await configResponse;
  await waitForUiCommit(page);
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
  await expect(firstRow).toHaveClass(/\bis-live\b/);
});

test('Playlist ignores a stale install completion after the card address changes', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await mockConnectedPlaylistCard(page, project, 'lw-playlist-stale-install-host');
  await gotoPlaylist(page, project);

  const install = page.getByRole('button', { name: 'Install playlist on card' });
  const configRequest = page.waitForRequest(request => request.url().endsWith('/api/config'));
  await install.click();
  await configRequest;
  const configResponse = page.waitForResponse(response => response.url().endsWith('/api/config'));
  await expect(page.getByTestId('playlist-card-status')).toContainText('Installing playlist on card…');

  await page.getByRole('textbox', { name: 'Card address' }).fill('new-playlist-card.local');
  await expect(page.getByRole('textbox', { name: 'Card address' })).toHaveValue('new-playlist-card.local');
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);

  await configResponse;
  await waitForUiCommit(page);
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
  await expect(install).toContainText('Install playlist on card');
});

test('Playlist Reset live failure remains visible and retries the same bounded action', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await mockConnectedPlaylistCard(page, project, 'lw-playlist-reset');
  let resetAttempts = 0;
  await page.route('**/api/recover-lights', route => {
    resetAttempts += 1;
    return route.abort('timedout');
  });
  await gotoPlaylist(page, project);

  await page.getByRole('button', { name: 'Reset live' }).click();
  const failure = page.getByTestId('playlist-card-status');
  await expect(failure).toContainText('The card did not answer in time.');
  await expect(failure.getByRole('button', { name: 'Retry' })).toBeVisible();
  await failure.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => resetAttempts).toBeGreaterThanOrEqual(2);
  await expect(failure).toBeVisible();
});

test('Playlist ignores a stale reset success after a newer live preview succeeds', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await mockConnectedPlaylistCard(page, project, 'lw-playlist-stale-reset-success');
  await gotoPlaylist(page, project);

  const rows = page.locator('.pl-row');
  await rows.first().getByRole('button', { name: 'Live' }).click();
  await expect(rows.first()).toHaveClass(/\bis-live\b/);

  const recoverRequest = page.waitForRequest(request => request.url().endsWith('/api/recover-lights'));
  await page.getByRole('button', { name: 'Reset live' }).click();
  await recoverRequest;
  const recoverResponse = page.waitForResponse(response => response.url().endsWith('/api/recover-lights'));
  await rows.nth(1).getByRole('button', { name: 'Live' }).click();
  await expect(rows.nth(1)).toHaveClass(/\bis-live\b/);

  await recoverResponse;
  await waitForUiCommit(page);
  await expect(rows.nth(1)).toHaveClass(/\bis-live\b/);
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
});

test('Playlist ignores a stale reset failure after the playlist is edited', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await mockConnectedPlaylistCard(page, project, 'lw-playlist-stale-reset-failure');
  const releaseReset = await gateThenAbort(page, '/api/recover-lights');
  await gotoPlaylist(page, project);

  await page.getByRole('button', { name: 'Reset live' }).click();
  await page.locator('.pl-row').first().getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);

  const resetFailure = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/recover-lights'));
  releaseReset();
  await resetFailure;
  await waitForUiCommit(page);
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
  await expect(page.locator('.pl-row')).toHaveCount(3);
});

test('Playlist marks a row runtime-applied only after the paired card acknowledges the latest intent', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await mockConnectedPlaylistCard(page, project, 'lw-playlist-test');
  await gotoPlaylist(page, project);

  const firstRow = page.locator('.pl-row').first();
  await firstRow.getByRole('button', { name: 'Live' }).click();
  await expect(page.getByTestId('playlist-physical-preview-status')).toHaveText('Sending to Lightweaver');
  await expect(firstRow).not.toHaveClass(/\bis-live\b/);
  await expect(page.getByTestId('playlist-physical-preview-status')).toHaveText('Applied by Lightweaver runtime');
  await expect(firstRow).toHaveClass(/\bis-live\b/);
});

test('Playlist transport timeout keeps its prior live row and offers a bounded retry', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  // A lost reply is settled by READING the card first (readBackLivePreview):
  // a card already showing the requested row makes the timeout moot, so this
  // card must be showing something else (not row one's own pattern) for the
  // timeout to be a real failure — set before install, per the harness's own
  // "card is not showing this row yet" convention.
  await mockConnectedPlaylistCard(page, project, 'lw-playlist-test', card => {
    card.state.currentId = 'blackout';
    card.state.currentIndex = -1;
  });
  await page.route('**/api/control', route => route.abort('timedout'));
  await gotoPlaylist(page, project);

  await page.locator('.pl-row').first().getByRole('button', { name: 'Live' }).click();
  const alert = page.getByTestId('playlist-card-status');
  await expect(alert).toContainText('The card did not answer in time. Reconnect if needed, then retry the preview command.');
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Reconnect' })).toHaveCount(0);
});

test('Playlist keeps missing runtime proof visible while recovery runs, then asks for human confirmation', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  const card = await mockConnectedPlaylistCard(page, project, 'lw-playlist-output-test');
  // A card that answers ok but never confirms which pattern it applied — the
  // one ack shape real firmware never sends (it always echoes appliedPatternId
  // on a successful control write), which is exactly why Studio has to defend
  // against it: an ambiguous acknowledgement is what routes to Recover lights.
  card.refuse('/api/control', { status: 200, body: { ok: true, cardId: card.state.cardId } });
  await gotoPlaylist(page, project);

  await page.locator('.pl-row').first().getByRole('button', { name: 'Live' }).click();
  const alert = page.getByTestId('playlist-card-status');
  await expect(alert).toContainText('The preview reached the card, but its runtime did not report which pattern or revision it applied.');
  const recoverButton = alert.getByRole('button', { name: 'Recover lights' });
  await recoverButton.click();

  await expect(alert).toContainText('The preview reached the card, but its runtime did not report which pattern or revision it applied.');
  await expect(recoverButton).toBeDisabled();

  await expect(page.getByTestId('playlist-card-status')).toContainText('Recovery frame sent. Confirm warm white is visible on the physical lights.');
  await expect(page.getByTestId('playlist-card-status')).toHaveAttribute('role', 'status');
});

test('Playlist serializes card mutations behind recovery so the final physical command matches the live row', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  const card = await mockConnectedPlaylistCard(page, project, 'lw-playlist-stale-recovery');
  card.refuse('/api/control', { status: 200, body: { ok: true, cardId: card.state.cardId } });
  await gotoPlaylist(page, project);

  const rows = page.locator('.pl-row');
  await rows.first().getByRole('button', { name: 'Live' }).click();
  const failure = page.getByTestId('playlist-card-status');
  await expect(failure).toContainText('The preview reached the card, but its runtime did not report which pattern or revision it applied.');
  await failure.getByRole('button', { name: 'Recover lights' }).click();

  await expect(rows.nth(1).getByRole('button', { name: 'Live' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reset live' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Install playlist on card' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Card address' })).toBeDisabled();
  await expect(page.locator('.pl-chip').first()).toBeDisabled();
  expect(controlRequestCount(card)).toBe(1);

  await expect(page.getByTestId('playlist-card-status')).toContainText('Recovery frame sent. Confirm warm white is visible on the physical lights.');
  expect(physicalCommandsFrom(card).slice(-3)).toEqual(['recover:1', 'reboot', 'recover:2']);

  // The recovery genuinely rebooted the card (a new bootId, matching what
  // /api/reboot really does) — wait for Studio's own connection layer to
  // notice it is back before sending another live command.
  await waitReconnected(page);
  await rows.nth(1).getByRole('button', { name: 'Live' }).click();
  await expect(rows.nth(1)).toHaveClass(/\bis-live\b/);
  await expect(page.getByTestId('playlist-physical-preview-status')).toHaveText('Applied by Lightweaver runtime');
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
  expect(physicalCommandsFrom(card).at(-1)).toMatch(/^control:/);
  expect(physicalCommandsFrom(card).lastIndexOf('recover:2')).toBeLessThan(physicalCommandsFrom(card).length - 1);
  // Recovering from the restart re-acquires the transport ONCE and resends the
  // same command ONCE. Two controls in the card's whole record — the first
  // row's, and this one — is what proves the recovery is bounded and never
  // becomes a second real write.
  expect(controlRequestCount(card)).toBe(2);
});

test('Playlist reports a bounded failure when dedicated light recovery is rejected', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  const card = await mockConnectedPlaylistCard(page, project, 'lw-playlist-output-test');
  card.refuse('/api/control', { status: 200, body: { ok: true, cardId: card.state.cardId } });
  card.refuse('/api/recover-lights', { status: 200, body: { ok: false, accepted: false, privateReason: '<script>unsafe</script>' } });
  await gotoPlaylist(page, project);

  await page.locator('.pl-row').first().getByRole('button', { name: 'Live' }).click();
  const alert = page.getByTestId('playlist-card-status');
  await alert.getByRole('button', { name: 'Recover lights' }).click();

  await expect(alert).toContainText('Light recovery did not complete. The preview command could not be verified. Check the card connection and try again.');
  await expect(alert).not.toContainText('unsafe');
});
