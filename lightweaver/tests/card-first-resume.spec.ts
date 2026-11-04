import { expect, test, type Page } from '@playwright/test';

// Fixture evidence, not a reading of Adrian's physical card. The browser draft
// deliberately has the same project ID but a different fingerprint and count.
const CARD_ID = 'lw-resume-card';
const PROJECT_ID = 'lightweaver-bench-discovery-v1';
const installedStatus = () => ({
  app: 'Lightweaver', provisioningContractVersion: 1,
  cardId: CARD_ID, firmwareVersion: '1.1.15', buildId: 'a'.repeat(40), buildNumber: 2160,
  bootId: 'resume-boot', runtimePhase: 'ready', knownGoodProject: true,
  commandReady: true, outputReady: true, playbackReady: true,
  configValid: true, provisionalSetup: false, safeMode: false,
  projectId: PROJECT_ID, projectRevision: 3, projectFingerprint: 'c'.repeat(64),
  piece: { id: PROJECT_ID, name: 'Installed gallery' },
  currentPatternId: 'installed-warm',
  outputs: [{ id: 'out1', pin: 18, gpio: 18, pixels: 41, count: 41,
    segments: [{ id: 'installed-section', count: 41, direction: 'forward' }] }],
});

async function connect(page: Page) {
  await page.evaluate(async status => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const event = {
      type: 'card-verified', via: 'direct', host: 'lightweaver.local',
      card: { id: status.cardId, name: 'Installed gallery', firmwareVersion: status.firmwareVersion, buildId: status.buildId },
      expectedCard: { id: status.cardId, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
      readiness: status,
    };
    getSharedCardLink().dispatch(event);
    getSharedCardLink().dispatch(event);
  }, installedStatus());
}

async function fixture(page: Page, hash = '#screen=card&section=setup&task=load-matching-project') {
  const mutations: string[] = [];
  await page.route('http://lightweaver.local/**', async route => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.fulfill({ status: 409, json: { ok: false, error: 'Fixture rejects unexpected writes' } });
    }
    const path = new URL(request.url()).pathname;
    if (path === '/api/status' || path === '/api/firmware-info') return route.fulfill({ json: installedStatus() });
    if (path === '/api/wiring/status') return route.fulfill({ json: { ok: true, state: 'known-good', hasCandidate: false, outputs: installedStatus().outputs } });
    if (path === '/api/patterns') return route.fulfill({ json: {
      currentId: 'installed-warm', currentIndex: 0,
      patterns: [{ id: 'installed-warm', label: 'Installed warm', mode: 'preset', runtimePatternId: 'warm-white', zones: [], controls: {} }],
    } });
    if (path === '/api/zones') return route.fulfill({ json: {
      zones: [{ id: 'installed-section', label: 'Installed section', patternId: 'installed-warm', brightness: 0.7, speed: 1, blackout: false }],
    } });
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ cardId, projectId }) => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project = createDefaultProject();
    project.id = projectId;
    project.name = 'Unsaved studio draft';
    const { createDefaultCircleLayout } = await import('/src/lib/defaultCircleLayout.js');
    const { makeDefaultWiring } = await import('/src/lib/wiringModel.js');
    project.layout.strips = createDefaultCircleLayout({ totalPixels: 55, sectionCount: 1 });
    project.layout.wiring = makeDefaultWiring(project.layout.strips, { pin: 18 });
    project.layout.patchBoard = null;
    project.layout.starterPending = false;
    project.portRoles = [{ pin: 18, role: 'strip', pixelCount: 55, controlKind: '' }];
    localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_autosave_v3_backup', JSON.stringify(project));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({ version: 2, dirty: true, persistedDestination: 'browser', installation: null }));
  }, { cardId: CARD_ID, projectId: PROJECT_ID });
  await page.goto(`/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await connect(page);
  return mutations;
}

async function expectDraftPreserved(page: Page) {
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  expect(draft.id).toBe(PROJECT_ID);
  expect(draft.name).toBe('Unsaved studio draft');
  expect(draft.layout.strips).toHaveLength(1);
  expect(draft.layout.strips[0].pixelCount).toBe(55);
  expect(draft.portRoles.find((port: { pin: number }) => port.pin === 18).pixelCount).toBe(55);
}

test('installed 41-pixel card resumes controls without recounting or replacing its same-ID draft', async ({ page }) => {
  const mutations = await fixture(page);
  const home = page.getByTestId('card-installed-home');
  await expect(home).toBeVisible();
  await expect(page.getByTestId('setup-identity-row')).toContainText('41 on GPIO 18');
  await expect(page.getByTestId('setup-todo')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/card-first-resume-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/card-first-resume-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId('installed-control-open').click();
  const drawer = page.getByRole('dialog', { name: 'Installed gallery controls' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('select[aria-label="Pattern"]')).toHaveValue('installed-warm');
  await expect(drawer.getByRole('slider', { name: 'Brightness' })).toBeEnabled();
  await expectDraftPreserved(page);
  expect(mutations).toEqual([]);
});

test('explicit Layout deep link and reconnect retain the draft and destination without card writes', async ({ page }) => {
  const mutations = await fixture(page, '#screen=layout');
  await expect(page).toHaveURL(/#screen=layout$/);
  await page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    getSharedCardLink().dispatch({ type: 'operation-boundary-lost' });
  });
  await connect(page);
  await expect(page.getByTestId('card-link-status')).toHaveAccessibleName(/Connected/);
  await expect(page).toHaveURL(/#screen=layout$/);
  await expectDraftPreserved(page);
  expect(mutations).toEqual([]);
});

test('lost command evidence disables installed controls without discarding the draft', async ({ page }) => {
  const mutations = await fixture(page);
  await page.getByTestId('installed-control-open').click();
  const drawer = page.getByRole('dialog', { name: 'Installed gallery controls' });
  await expect(drawer.getByRole('slider', { name: 'Brightness' })).toBeEnabled();
  // Prevent a successful background poll from legitimately restoring authority.
  await page.route('http://lightweaver.local/api/{status,firmware-info}', route => route.abort());
  await page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    getSharedCardLink().dispatch({ type: 'operation-boundary-lost' });
  });
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Reconnect' })).toBeVisible();
  await expect(page.getByRole('dialog').locator('input[aria-label="Brightness"]:enabled')).toHaveCount(0);
  await expect(page.getByTestId('setup-identity-row')).toContainText('41 on GPIO 18');
  await expect(page.getByTestId('card-installed-home')).toContainText(/last seen/i);
  await expectDraftPreserved(page);
  expect(mutations).toEqual([]);
});

test('a replacement at the same host cannot inherit installed control authority', async ({ page }) => {
  const mutations = await fixture(page);
  await page.getByTestId('installed-control-open').click();
  const drawer = page.getByRole('dialog', { name: 'Installed gallery controls' });
  await expect(drawer.getByRole('slider', { name: 'Brightness' })).toBeEnabled();
  // Prevent a successful background poll from legitimately restoring authority.
  await page.route('http://lightweaver.local/api/{status,firmware-info}', route => route.abort());
  await page.evaluate(async status => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    getSharedCardLink().dispatch({
      type: 'direct-status', connected: true, host: 'lightweaver.local',
      card: { id: 'lw-other-card', firmwareVersion: status.firmwareVersion, buildId: status.buildId },
      expectedCard: { id: status.cardId, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
      readiness: { ...status, cardId: 'lw-other-card', bootId: 'other-boot' },
    });
  }, installedStatus());
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Reconnect' })).toBeVisible();
  await expect(page.getByRole('dialog').locator('input[aria-label="Brightness"]:enabled')).toHaveCount(0);
  await expectDraftPreserved(page);
  expect(mutations).toEqual([]);
});

test('bare entry restores the remembered place only for the verified card', async ({ page }) => {
  const mutations = await fixture(page, '#screen=layout');
  await page.evaluate(({ cardId }) => {
    localStorage.setItem(`lw_card_resume_place_v1:${cardId}`, '#screen=playlist');
    localStorage.setItem('lw_card_resume_place_v1:lw-other-card', '#screen=pattern');
  }, { cardId: CARD_ID });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await connect(page);
  await expect(page).toHaveURL(/#screen=playlist$/);
  await expectDraftPreserved(page);
  expect(mutations).toEqual([]);
});


test('save review names the installed-to-draft change before any mutation', async ({ page }) => {
  const mutations = await fixture(page, '#screen=card&section=setup&task=install-project');
  const summary = page.getByTestId('card-save-summary').first();
  await expect(summary).toContainText('41 → 55 configured pixels');
  await expect(summary).toContainText('GPIOs unchanged');
  await expect(summary).toContainText('can interrupt playback');
  await expectDraftPreserved(page);
  expect(mutations).toEqual([]);
});
