// Legacy cards with no project fingerprint remain controllable. Opening their
// recoverable project is explicit; reload must preserve installed context, and
// failed adoption must remain visible without replacing the current draft.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// The real signed release this Studio ships — read, not hardcoded, so the
// assertion below stays true across releases without editing this file.
const release = JSON.parse(await readFile(new URL('../public/firmware/release-manifest.json', import.meta.url), 'utf8'));

const CARD_ID = 'lw-legacy-fp-card';
const PROJECT_ID = 'lwproj-legacy-piece';

function legacyStatus(overrides = {}) {
  return {
    app: 'Lightweaver', provisioningContractVersion: 1,
    cardId: CARD_ID, firmwareVersion: '1.1.15', buildId: 'a'.repeat(40), buildNumber: 1306,
    bootId: 'boot-legacy-1', runtimePhase: 'ready', knownGoodProject: true,
    commandReady: true, outputReady: true, playbackReady: true,
    configValid: true, provisionalSetup: false, safeMode: false,
    projectId: PROJECT_ID, projectRevision: 0, projectFingerprint: '',
    piece: { id: PROJECT_ID, name: 'Legacy piece' },
    outputs: [{
      id: 'out1', pin: 18, pixels: 41, gpio: 18, count: 41,
      segments: [{ id: 'run-strip-1', count: 41, direction: 'forward' }],
    }],
    ...overrides,
  };
}

async function dispatchCardLink(page, events) {
  await page.evaluate(async (nextEvents) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const link = getSharedCardLink();
    for (const event of nextEvents) link.dispatch(event);
  }, events);
}

test.beforeEach(async ({ page }) => {
  const status = legacyStatus();
  await page.route('http://lightweaver.local/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/status' || url.pathname === '/api/firmware-info') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...status, bridgeVersion: 6 }),
      });
    }
    if (url.pathname === '/api/wiring/status') {
      // A missing fingerprint does not imply a missing wiring safety API.
      // Automatic adoption requires independent proof that no candidate exists.
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, state: 'known-good', hasCandidate: false, outputs: status.outputs }) });
    }
    // Patterns/zones readback is optional for adoption; a legacy card without
    // them must still adopt from the status skeleton alone.
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
  });
  await page.addInitScript(({ cardId, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion, buildId }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, status);
});

async function connectLegacyCard(page) {
  const status = legacyStatus();
  await dispatchCardLink(page, [{
    type: 'direct-status', connected: true, host: 'lightweaver.local',
    card: { id: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
    expectedCard: { id: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
    readiness: status,
  }]);
}

async function expectInstalledHome(page) {
  await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('installed-control-open')).toBeVisible();
  await expect(page.getByTestId('setup-todo')).toHaveCount(0);
  await expect(page.getByTestId('setup-adoption-error')).toHaveCount(0);
}

test('a fresh Studio offers the legacy installed project without implicit adoption, including after reload', async ({ page }) => {
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expectInstalledHome(page);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').id);
  expect(before).not.toBe(PROJECT_ID);
  await page.getByTestId('installed-project-open').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').id)).toBe(PROJECT_ID);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expectInstalledHome(page);
});

test('an older card revision cannot automatically replace a saved same-ID Studio layout', async ({ page }) => {
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async projectId => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const { createProjectLibraryRecord, saveProjectLibraryRecord, writeActiveProjectLibraryRecordId } =
      await import('/src/lib/projectStorage.js');
    const project = createDefaultProject();
    project.id = projectId;
    project.name = 'Saved three sections';
    project.layout.starterPending = false;
    project.layout.strips.push({ ...project.layout.strips[0], id: 'saved-third-section', name: 'Third section' });
    const record = saveProjectLibraryRecord(createProjectLibraryRecord(project, {
      id: 'saved-three-sections', now: 1000,
    }));
    writeActiveProjectLibraryRecordId(record.id);
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2, dirty: false, persistedDestination: 'browser', installation: null,
    }));
  }, PROJECT_ID);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);

  await page.waitForTimeout(1500);
  const openProject = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  expect(openProject.name).toBe('Saved three sections');
  expect(openProject.layout.strips).toHaveLength(3);
  expect(openProject.origin).toBeNull();
});

test('"Open installed project" explicitly opens the card copy when another project is open', async ({ page }) => {
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  // Open a different project with its own described wiring, so nothing
  // auto-adopts and the unresolved-project task must offer the choice.
  await page.evaluate(async () => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.id = 'my-other-piece';
    project.name = 'My other piece';
    project.layout.starterPending = false;
    project.portRoles = [{ pin: 5, role: 'strip', pixelCount: 30, controlKind: '' }];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);

  // The installed home distinguishes the draft and offers explicit adoption.
  await expect(page.getByTestId('card-draft-difference'))
    .toContainText(/different project|draft/i, { timeout: 10000 });
  await page.getByTestId('installed-project-open').click();
  await expectInstalledHome(page);
});

// A truly older card without this API still has an explicit adoption path;
// unknown candidate state must never silently replace the open project.
test('missing wiring safety readback requires explicit adoption even in a fresh Studio', async ({ page }) => {
  await page.route('http://lightweaver.local/api/wiring/status', route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' }));
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expect(page.getByTestId('installed-project-open')).toBeVisible();
  await expect(page.getByTestId('setup-card-ready')).toHaveCount(0);
  await page.getByTestId('installed-project-open').click();
  await expectInstalledHome(page);
});

// legacyStatus() reports a real signed build (1306) that is genuinely older
// than this Studio's release, verified against the actual public manifest —
// not a mocked one. Ticket B2: that state is maintenance, not a blocker, and
// the banner must say so instead of reusing the "update before relying on
// it" sentence reserved for a card whose firmware cannot run the installed
// project (cardLifecycle state 'update-required').
test('the ready banner treats a compatible-but-older release as optional, not required', async ({ page }) => {
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expectInstalledHome(page);

  // The optional wording lives on the Card release row, said once; the ready
  // banner keeps only its doors.
  const banner = page.getByTestId('card-installed-home');
  await expect(banner).not.toContainText('A newer card release is available');
  await expect(banner).not.toContainText('This card’s software is behind');
  await expect(banner).not.toContainText('Update the card software before relying on it.');
  const releaseRow = page.getByTestId('fact-release');
  await expect(releaseRow).toContainText('A newer card release is available');
  await expect(releaseRow).toContainText(
    new RegExp(`Your lights keep working on 1306\\. Update to ${release.buildNumber} when convenient\\.`),
  );

  // Same one-primary rule as the rest of Card Home: the optional wording must
  // not demote Open Patterns to make room for a louder warning.
  await expect(page.getByTestId('installed-control-open')).toHaveClass(/\bprimary\b/);
  await expect(page.getByTestId('setup-update-card')).toBeVisible();
});

// F27 — an owner walk on the live site found "Use this card's project" a
// silent no-op 2 of 3 times on a fresh reload: zero network calls, zero
// status text. Root-caused by reading (not reproduced live 4/4 tries here):
// two of the card readback calls inside the 'reconstruct' strategy sat
// outside any try, so a throw there — or from building the project skeleton
// — escaped Promise.allSettled uncaught (it only catches promise REJECTIONS,
// not a synchronous throw while its argument array is being built) and the
// owner's click vanished. `cardProjectAdoption.test.js` proves that exact
// synchronous-throw shape directly, at the unit the defect lives in — a
// fetch-based network failure in a real browser is always an async
// rejection, so it cannot exercise that specific line. What these two specs
// prove instead, end to end in a real browser: (1) a genuine adoption
// failure the owner triggers is always visible, never silent, and (2) the
// button cannot be clicked into a rejection during a window where the
// journey still offers the task but the card link itself is not connected —
// the "likely real trigger" the investigator named.
test('a card project adoption failure the owner triggers is always visible, never silent', async ({ page }) => {
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.id = 'my-other-piece-f27a';
    project.name = 'My other piece';
    project.layout.starterPending = false;
    project.portRoles = [{ pin: 5, role: 'strip', pixelCount: 30, controlKind: '' }];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expect(page.getByTestId('card-draft-difference'))
    .toContainText(/different project|draft/i, { timeout: 10000 });

  // The click re-reads /api/status live rather than trusting the connect-time
  // snapshot. Answer that live read as if the connection dropped mid-read —
  // the card responds, but with no usable geometry — which is the one
  // adoption failure this route stub CAN produce (a network abort only ever
  // rejects a promise; it can't fake the synchronous throw the unit test
  // covers). What this proves: the failure reaches the owner as text, not as
  // nothing.
  await page.route('http://lightweaver.local/api/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...legacyStatus(), outputs: [] }),
  }));

  await page.getByTestId('installed-project-open').click();
  await expect(page.getByTestId('setup-adoption-error')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('setup-adoption-error')).toContainText('did not report any light outputs');
  // Not silent, and not stuck: the same action is still there to retry.
  await expect(page.getByTestId('installed-project-open')).toBeEnabled();
});

test('"Open installed project" cannot be activated while the card link is not connected', async ({ page }) => {
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.id = 'my-other-piece-f27b';
    project.name = 'My other piece';
    project.layout.starterPending = false;
    project.portRoles = [{ pin: 5, role: 'strip', pixelCount: 30, controlKind: '' }];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expect(page.getByTestId('installed-project-open')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('installed-project-open')).toBeEnabled();

  // `connectBlockers` in setupJourney.js deliberately lets the
  // load-matching-project task through ahead of the reconnect blocker (its
  // own comment says why: the saved-match/adopt branches need it to, or the
  // escape hatch is unreachable). That is what makes the task — and this
  // button — renderable while `cardLink.state` is not one of the two
  // connected states. 'revalidating' is the one such state this screen's own
  // `cardReachable` check treats as still worth reading (same family the
  // defect names: reconnecting-bridge / revalidating), so it is the
  // deterministic way to model that window without racing React's own
  // scheduling.
  await page.route('http://lightweaver.local/api/{status,firmware-info}', route => route.abort());
  await dispatchCardLink(page, [{ type: 'operation-boundary-lost' }]);

  await expect(page.locator('[data-testid="installed-project-open"]:enabled')).toHaveCount(0);
});
