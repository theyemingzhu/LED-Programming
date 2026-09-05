import { test, expect } from '@playwright/test';
import { createDefaultProject, migrateProject } from '../src/lib/projectModel.js';
import { buildCardRuntimePackageFromProject } from '../src/lib/cardRuntimeProject.js';
import { prepareCardStoragePayload } from '../src/lib/cardStoragePayload.js';
import { CARD_PATTERN_BANK } from '../src/lib/cardPatternBank.js';

function makeOversizedProject() {
  const project = createDefaultProject();
  project.id = 'oversized-card-ui-fixture';
  project.name = 'Oversized card UI fixture';
  const patterns = CARD_PATTERN_BANK.slice(0, 32);
  project.devices.standaloneController.playlist = patterns.map((pattern, order) => ({
    id: pattern.id,
    // Save-to-card promotes the active first pattern with its standard label.
    // Keep that first label standard so the independently prepared fixture is
    // byte-identical to the package built by the action under test.
    label: order === 0 ? pattern.label : `${pattern.label} ${'oversized-label-'.repeat(24)}`,
    type: 'pattern',
    patternId: pattern.id,
    enabled: true,
    order,
  }));
  project.devices.standaloneController.controls.encoder.patternCycleIds = patterns.map(pattern => pattern.id);
  return project;
}

function capacityErrorForProject(project) {
  project = migrateProject(project);
  const runtimePackage = buildCardRuntimePackageFromProject({
    projectId: project.id,
    projectName: project.name,
    strips: project.layout.strips,
    patchBoard: project.layout.patchBoard,
    standaloneController: project.devices.standaloneController,
  });
  try {
    prepareCardStoragePayload(runtimePackage);
  } catch (error) {
    return error;
  }
  throw new Error('fixture must exceed card storage');
}

async function gotoSavedProject(page, project, screen) {
  await page.addInitScript((savedProject) => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
  }, project);
  const route = screen === 'settings'
    ? '/#screen=card&section=settings'
    : `/#screen=${screen}`;
  await page.goto(route, { waitUntil: 'domcontentloaded' });
}

async function prepareCardHomeInstall(page, cardId: string) {
  await page.addInitScript(() => {
    const saved = localStorage.getItem('lw_autosave_v3');
    if (!saved) return;
    const project = JSON.parse(saved);
    if (!project.layout?.wiring) return;
    project.layout.wiring.verified = true;
    project.layout.wiring.locked = true;
    project.layout.wiring.runs?.forEach((run: { verified?: boolean }) => { run.verified = true; });
    const led = project.devices?.standaloneController?.led || {};
    led.colorOrder = led.colorOrder || 'RGB';
    led.colorOrderConfirmed = true;
    led.confirmedColorOrder = led.colorOrder;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  const bindCardToOpenProject = await pairReadyCard(page, cardId);
  await bindCardToOpenProject();
  await page.evaluate(async ({ id }) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    const fingerprint = cardProjectFingerprint(project);
    const event = {
      type: 'card-verified',
      via: 'direct',
      host: 'lightweaver.local',
      card: { id, name: 'Test card', firmwareVersion: '1.0.0', buildId: `${id}-build` },
      readiness: {
        app: 'Lightweaver',
        provisioningContractVersion: 1,
        cardId: id,
        firmwareVersion: '1.0.0',
        buildId: `${id}-build`,
        bootId: `${id}-boot`,
        runtimePhase: 'ready',
        knownGoodProject: true,
        commandReady: true,
        outputReady: true,
        playbackReady: true,
        projectId: project.id,
        projectRevision: 0,
        projectFingerprint: fingerprint,
      },
    };
    const link = getSharedCardLink();
    link.dispatch(event);
    link.dispatch(event);
  }, { id: cardId });
  await expect(page.getByTestId('commissioning-step')).toBeVisible();
  await expect(page.getByText('Ready to install on the card.')).toBeVisible();
  await expect(page.getByTestId('layout-send-to-card')).toBeEnabled();
}

test('Settings renders an oversized project and reports exact capacity on save', async ({ page }) => {
  const project = makeOversizedProject();
  capacityErrorForProject(project);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));

  await gotoSavedProject(page, project, 'settings');
  await prepareCardHomeInstall(page, 'lw-card-storage-ui-settings');

  await expect(page.getByRole('heading', { name: 'Set up your Lightweaver', level: 1 })).toBeVisible();
  const requestsBefore = requests.length;
  await page.getByTestId('layout-send-to-card').click();
  await expect(page.locator('.la-card-push-banner')).toHaveText(
    /Card configuration is \d+ bytes, exceeding the 3968-byte flash storage limit\./,
  );
  // Card Home refreshes identity when a hardware operation ends. The local
  // capacity rejection may trigger that harmless read, but must never write.
  expect(requests.slice(requestsBefore).filter(url => url.includes('/api/config'))).toHaveLength(0);
});

// Patterns gates its Install button on a card that classifies as ready and on
// a current edit authorization (src/lib/cardInstallGate.js). A status envelope
// of `{ ok, led }` describes no card at all, so the button stays disabled and
// the capacity guarantee below is unreachable. Publish the canonical readiness
// contract, then bind the authorization to the project the page actually holds.
async function pairReadyCard(page, cardId: string) {
  const firmwareVersion = '1.0.0';
  const buildId = `${cardId}-build`;
  const bootId = `${cardId}-boot`;
  const held: { id: string; fingerprint: string } = { id: '', fingerprint: '' };
  const envelope = () => ({
    ok: true,
    app: 'Lightweaver',
    provisioningContractVersion: 1,
    cardId,
    firmwareVersion,
    buildId,
    bootId,
    runtimePhase: 'ready',
    knownGoodProject: true,
    commandReady: true,
    outputReady: true,
    playbackReady: true,
    projectId: held.id,
    piece: { id: held.id },
    projectRevision: 0,
    projectFingerprint: held.fingerprint,
    led: { pixels: 44 },
  });
  await page.route('**/api/status', route => route.fulfill({ json: envelope() }));
  await page.route('**/api/firmware-info', route => route.fulfill({ json: envelope() }));
  await page.addInitScript(({ id, version, build }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id, firmwareVersion: version, buildId: build,
    }));
  }, { id: cardId, version: firmwareVersion, build: buildId });
  return async () => {
    const project = await page.evaluate(async () => {
      const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
      const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
      return { id: saved?.id || '', fingerprint: cardProjectFingerprint(saved) };
    });
    held.id = project.id;
    held.fingerprint = project.fingerprint;
    await page.reload({ waitUntil: 'domcontentloaded' });
    const authorized = await page.evaluate(async binding => {
      const { issueCardEditAuthorization } = await import('/src/lib/cardEditAuthorization.js');
      return issueCardEditAuthorization(binding);
    }, {
      cardId,
      firmwareVersion,
      buildId,
      bootId,
      installedProjectId: project.id,
      installedProjectFingerprint: project.fingerprint,
      studioProjectId: project.id,
      studioProjectFingerprint: project.fingerprint,
      projectGeneration: 0,
    });
    expect(authorized).toBe(true);
  };
}

test('Patterns Install on card preserves exact capacity feedback', async ({ page }) => {
  const project = makeOversizedProject();
  capacityErrorForProject(project);
  const bindCardToOpenProject = await pairReadyCard(page, 'lw-card-storage-ui');

  await gotoSavedProject(page, project, 'patterns');
  await bindCardToOpenProject();

  await page.getByRole('button', { name: 'Install on card', exact: true }).click();
  await expect(page.getByText(
    /Card configuration is \d+ bytes, exceeding the 3968-byte flash storage limit\./,
  )).toBeVisible();
});
