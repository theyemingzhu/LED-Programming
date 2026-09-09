import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { CARD_PATTERN_BANK } from '../src/lib/cardPatternBank.js';
import { compileWiring } from '../src/lib/wiringCompiler.js';
import { cardProjectFingerprint } from '../src/lib/cardProjectResolver.js';

// U2-build: the round-2 UX critique's SAFE items 1-6 and 8 for Patterns and
// Playlist (docs/ux/2026-09-09-u2-patterns-playlist-critique.md). Each test
// below names the critique item it proves. Item 7 (the footer/tile
// confidence mismatch) is a different ticket and is not covered here.

const DEFAULT_CARD_ZONE_IDS = (({ layout }) => compileWiring({
  wiring: layout.wiring,
  strips: layout.strips,
  groups: layout.layerGroups,
}).zones.map(zone => zone.id))(createDefaultProject());

async function mockDefaultCardZones(page) {
  await page.route('**/api/zones', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ zones: DEFAULT_CARD_ZONE_IDS.map(id => ({ id })) }),
  }));
}

/**
 * A card genuinely connected, ready, and holding the exact project under
 * test — same shape as patterns-v3.spec.ts's pairReadyPatternCard, kept
 * local here since that helper is not exported.
 */
async function mockReadyPatternsCard(page, project, cardId: string) {
  const buildId = `${cardId}-build`;
  const projectFingerprint = cardProjectFingerprint(project);
  const controlRequests: Record<string, unknown>[] = [];
  await mockDefaultCardZones(page);
  await page.addInitScript(({ id, build, savedProject }) => {
    localStorage.clear();
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id, firmwareVersion: '1.0.0', buildId: build,
    }));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2,
      dirty: false,
      persistedDestination: 'browser',
      installation: { cardId: id, projectRevision: 0, projectFingerprint: '' },
    }));
  }, { id: cardId, build: buildId, savedProject: project });
  await page.route('**/api/status', route => route.fulfill({ json: {
    app: 'Lightweaver', provisioningContractVersion: 1,
    cardId, firmwareVersion: '1.0.0', buildId, bootId: `${cardId}-boot`,
    runtimePhase: 'ready', knownGoodProject: true,
    commandReady: true, outputReady: true, playbackReady: true,
    projectId: project.id, piece: { id: project.id },
    projectRevision: 0, projectFingerprint,
  } }));
  await page.route('**/api/firmware-info', route => route.fulfill({ json: {
    app: 'Lightweaver', cardId, firmwareVersion: '1.0.0', buildId, bootId: `${cardId}-boot`,
    projectId: project.id, projectRevision: 0, projectFingerprint,
  } }));
  await page.route('**/api/control', async route => {
    const request = JSON.parse(route.request().postData() || '{}');
    controlRequests.push(request);
    await route.fulfill({ json: {
      ok: true, cardId, patternId: request.patternId, revision: request.revision,
    } });
  });
  await page.goto('/#screen=patterns', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pm')).toBeVisible();
  return { controlRequests, projectFingerprint };
}

/**
 * A card Studio has paired with (a persisted local identity) but which
 * answers with a DIFFERENT card's identity — the "connection is uncertain"
 * state item 5 is about: `connected` goes false because the exact card
 * cannot be confirmed, but the card is still paired (Studio still has an
 * expected identity for it), which is exactly when Recover lights used to
 * disappear. Modelled verbatim on patterns-v3.spec.ts's own
 * "a card answering with the wrong identity" test.
 */
async function mockPairedButMismatchedPatternsCard(page, project, cardId: string) {
  const buildId = `${cardId}-build`;
  const projectFingerprint = cardProjectFingerprint(project);
  await mockDefaultCardZones(page);
  await page.addInitScript(({ id, build, savedProject, fingerprint }) => {
    localStorage.clear();
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id, firmwareVersion: '1.0.0', buildId: build,
    }));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2,
      dirty: false,
      persistedDestination: 'browser',
      installation: { cardId: id, projectRevision: 0, projectFingerprint: fingerprint },
    }));
  }, { id: cardId, build: buildId, savedProject: project, fingerprint: projectFingerprint });
  await page.route('**/api/status', route => route.fulfill({ json: {
    app: 'Lightweaver', provisioningContractVersion: 1,
    cardId: `${cardId}-impostor`, firmwareVersion: '1.0.0', buildId,
    bootId: `${cardId}-impostor-boot`,
    runtimePhase: 'ready', knownGoodProject: true,
    commandReady: true, outputReady: true, playbackReady: true,
  } }));
  await page.route('**/api/firmware-info', route => route.fulfill({ json: {
    app: 'Lightweaver', cardId: `${cardId}-impostor`, firmwareVersion: '1.0.0', buildId,
    bootId: `${cardId}-impostor-boot`,
  } }));
  await page.goto('/#screen=patterns', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pm')).toBeVisible();
}

async function gotoPlaylist(page, project) {
  await page.addInitScript((savedProject) => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
  }, project);
  await page.goto('/#screen=playlist', { waitUntil: 'domcontentloaded' });
}

function makePlaylistProject({ count = 2 } = {}) {
  const project = createDefaultProject();
  project.id = 'u2-compact-playlist';
  project.name = 'U2 compact playlist fixture';
  const patterns = CARD_PATTERN_BANK.slice(0, count);
  project.devices.standaloneController.playlist = patterns.map((pattern, order) => ({
    id: pattern.id,
    label: pattern.label,
    type: 'pattern',
    patternId: pattern.id,
    enabled: true,
    order,
  }));
  return project;
}

const SHARED_SEND_STATUS_LABELS = [
  'Previewing in Studio',
  'Sending to Lightweaver',
  'Applied by Lightweaver runtime',
];
const RETIRED_SEND_STATUS_LITERALS = [
  'Selected in Studio',
  'Sending to card',
  'On the card now',
  'no live look sent',
  'live preview confirmed',
];

// ── Item 1: one vocabulary for "has this reached the card" ─────────────────

test('Patterns Design target card status uses the shared send-status vocabulary', async ({ page }) => {
  const project = createDefaultProject();
  await mockReadyPatternsCard(page, project, 'lw-u2-patterns-vocab');

  const targetLabel = page.locator('.pm-targetcard .tc-live .tc-stat-k');
  await expect(targetLabel).toHaveText('Previewing in Studio');

  await page.locator('.pm-cards .pmcard').first().click();
  await expect
    .poll(async () => targetLabel.textContent())
    .toEqual(expect.stringMatching(new RegExp(SHARED_SEND_STATUS_LABELS.join('|'))));

  for (const retired of RETIRED_SEND_STATUS_LITERALS) {
    await expect(page.locator('.pm-targetcard')).not.toContainText(retired);
  }
});

test('Playlist Playing stat uses the shared send-status vocabulary, never its own boolean wording', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await gotoPlaylist(page, project);

  const playingNote = page.getByTestId('playlist-stat-playing').locator('.n');
  await expect(playingNote).toHaveText('Previewing in Studio');
  await expect(playingNote).not.toHaveText('no live look sent');
  await expect(playingNote).not.toHaveText('live preview confirmed');
});

// ── Item 2: Playlist stays first on a phone ─────────────────────────────────

test('at 390px Playlist keeps the playlist above the Saved looks / Pattern pool add-ons', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await gotoPlaylist(page, project);
  await page.setViewportSize({ width: 390, height: 844 });

  const mainFirstChild = page.locator('.pm-main > *').first();
  const savedLooksPanel = page.locator('.pm-aside .card.pm-pane').first();
  await expect(mainFirstChild).toBeVisible();
  await expect(savedLooksPanel).toBeVisible();
  await expect(savedLooksPanel).toContainText('Saved looks');

  const mainBox = await mainFirstChild.boundingBox();
  const savedBox = await savedLooksPanel.boundingBox();
  expect(mainBox).not.toBeNull();
  expect(savedBox).not.toBeNull();
  expect(mainBox!.y).toBeLessThan(savedBox!.y);
});

// ── Item 3: the header count can never exceed its own total ────────────────

test('the pattern bank header count never exceeds its own total', async ({ page }) => {
  const project = createDefaultProject();
  project.devices.standaloneController.looks = [
    { id: 'u2-saved-mix', label: 'U2 saved mix' },
  ];
  await page.addInitScript((savedProject) => {
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
  }, project);
  await mockDefaultCardZones(page);
  await page.goto('/#screen=patterns', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.pm')).toBeVisible();

  const headerMeta = page.locator('.pm-browse .sec-h .m').first();
  const text = (await headerMeta.textContent()) || '';
  const match = text.match(/(\d+)\s+shown of\s+(\d+)\s+chip-ready/);
  if (match) {
    expect(Number(match[1])).toBeLessThanOrEqual(Number(match[2]));
  }
  // The correctly-scoped duplicate stays, so the fact is not lost, only the
  // broken restatement of it.
  await expect(page.locator('.pt-count')).toBeVisible();
});

// ── Item 4: the refusal notice stays clear of the target card ──────────────

test('the pattern-gate refusal reserves its own space and does not cover the Design target card', async ({ page }) => {
  const project = createDefaultProject();
  await mockPairedButMismatchedPatternsCard(page, project, 'lw-u2-gate');

  await page.locator('.pm-cards .pmcard').first().click();
  const notice = page.getByTestId('pattern-gate-notice');
  await expect(notice).toContainText('That tap was not sent to the card.');

  const pixelsLabel = page.locator('.pm-targetcard .tc-layer .tc-stat-k');
  await expect(pixelsLabel).toHaveText('Pixels driven');
  await pixelsLabel.scrollIntoViewIfNeeded();
  // Measure and hit-test in the SAME evaluate call, so nothing can relayout
  // between reading the label's position and asking what is on top of it.
  const uncovered = await page.evaluate(() => {
    const label = document.querySelector('.pm-targetcard .tc-layer .tc-stat-k');
    if (!label) return false;
    const box = label.getBoundingClientRect();
    const el = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(el && el.closest('.pm-targetcard'));
  });
  expect(uncovered).toBe(true);
});

// ── Item 5: one repair control that never vanishes in an uncertain state ───

test('Card tools has no separate Repair LED item, and Recover lights stays visible, disabled with a reason, while paired but not ready', async ({ page }) => {
  const project = createDefaultProject();
  await mockPairedButMismatchedPatternsCard(page, project, 'lw-u2-recover');

  const recoverButton = page.getByTestId('recover-lights');
  await expect(recoverButton).toBeVisible();
  await expect(recoverButton).toBeDisabled();
  const title = await recoverButton.getAttribute('title');
  expect(title && title.trim().length > 0).toBe(true);

  await page.getByRole('button', { name: /Card tools/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Repair LED' })).toHaveCount(0);
});

// ── Item 6: "On the card now" means one thing ───────────────────────────────

test('Patterns no longer reuses "On the card now" as a per-tap confirmed label', async ({ page }) => {
  const project = createDefaultProject();
  await mockReadyPatternsCard(page, project, 'lw-u2-confirmed-label');

  await page.locator('.pm-cards .pmcard').first().click();
  await expect
    .poll(async () => page.locator('.pm-targetcard .tc-live .tc-stat-k').textContent())
    .toEqual('Applied by Lightweaver runtime');
  await expect(page.locator('.pm-targetcard')).not.toContainText('On the card now');
  await expect(page.locator('.pm-targetcard')).not.toContainText('Confirmed on card');
});

// ── Item 8: no dead menu wrapper around a single button ─────────────────────

test('Playlist "Copy chip config" is a plain toolbar button, not a menu wrapper', async ({ page }) => {
  const project = makePlaylistProject({ count: 2 });
  await gotoPlaylist(page, project);

  const copyButton = page.getByRole('button', { name: 'Copy chip config' });
  await expect(copyButton).toBeVisible();
  const hasMenuAncestor = await copyButton.evaluate((el) => Boolean(el.closest('.pm-menu')));
  expect(hasMenuAncestor).toBe(false);
});
