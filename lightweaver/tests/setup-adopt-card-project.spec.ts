// Adopting the project a card already holds must visibly finish Setup — even
// for a "legacy" card flashed before fingerprint reporting, which answers with
// projectRevision 0 and an empty projectFingerprint for a project it genuinely
// holds. That exact card shape (Adrian's real gallery card, firmware build
// 1306) used to make "Use this card's project" look dead: adoption applied,
// but no fingerprint could ever match, so Setup stayed on phase 1 offering the
// same buttons forever.
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

async function expectSetupComplete(page) {
  // "Setup complete" + "Installed project matches" + the Patterns door ARE the
  // finished verdict. The ready banner used to repeat it in a heading and a
  // paragraph of its own; Card Home was compressed to one status, so this
  // asserts the banner is present and lets the row and the ladder say it once.
  await expect(page.getByTestId('setup-card-ready')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('setup-progress')).toHaveText(/^Setup complete(?: · Viewing phase [1-4])?$/);
  await expect(page.getByTestId('setup-identity-row')).toContainText('Installed project matches');
  await expect(page.getByTestId('setup-adoption-error')).toHaveCount(0);
  await expect(page.getByTestId('setup-open-patterns')).toBeVisible();
}

test('a fresh Studio adopts the legacy card project and finishes Setup by itself', async ({ page }) => {
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expectSetupComplete(page);

  // And it must survive a reload: the restored installation record re-verifies
  // against the same legacy evidence rather than demoting back to phase 1.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expect(page.getByTestId('setup-progress')).toHaveText(/^Setup complete(?: · Viewing phase [1-4])?$/, { timeout: 10000 });
  await expect(page.getByTestId('setup-identity-row')).toContainText('Installed project matches');
});

test('"Use this card’s project" visibly finishes Setup when another project is open', async ({ page }) => {
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

  // The unresolved-project task says what the situation IS and offers adoption.
  // It used to print the card's raw project id — internal slug, meaningless to
  // an owner — so it now states the relationship instead.
  await expect(page.getByTestId('setup-card-project-note'))
    .toContainText(/different project|holds the same project/, { timeout: 10000 });
  await page.getByTestId('setup-start-from-card').click();
  await expectSetupComplete(page);
});

// A truly older card without this API still has an explicit adoption path;
// unknown candidate state must never silently replace the open project.
test('missing wiring safety readback requires explicit adoption even in a fresh Studio', async ({ page }) => {
  await page.route('http://lightweaver.local/api/wiring/status', route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' }));
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await connectLegacyCard(page);
  await expect(page.getByTestId('setup-start-from-card')).toBeVisible();
  await expect(page.getByTestId('setup-card-ready')).toHaveCount(0);
  await page.getByTestId('setup-start-from-card').click();
  await expectSetupComplete(page);
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
  await expectSetupComplete(page);

  const banner = page.getByTestId('setup-card-ready');
  await expect(banner).toContainText('A newer card release is available');
  await expect(banner).toContainText(
    new RegExp(`Your lights keep working on 1306\\. Update to ${release.buildNumber} when convenient\\.`),
  );
  await expect(banner).not.toContainText('This card’s software is behind');
  await expect(banner).not.toContainText('Update the card software before relying on it.');

  // Same one-primary rule as the rest of Card Home: the optional wording must
  // not demote Open Patterns to make room for a louder warning.
  await expect(page.getByTestId('setup-open-patterns')).toHaveClass(/\bprimary\b/);
  await expect(page.getByTestId('setup-update-card')).toBeVisible();
});
