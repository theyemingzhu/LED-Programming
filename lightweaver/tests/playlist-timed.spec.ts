// Timed playlist (F26 / S3 lane): dwell per look, fade + "Play on the card"
// for the whole order, played on the card through /api/control's playlist
// verb, and read back through /api/status's playlist block. The wire
// contract itself (buildCardPlaylistConfig, normalizeCardRuntimeConfig's
// playlist block, normalizeCardReadiness's playlist block) is unit-tested in
// src/lib/cardPlaylist.test.js, tests/card-runtime-contract.mjs, and
// src/lib/cardReadiness.test.js — this spec proves the same contract end to
// end against the simulated card and the Playlist screen a phone actually
// renders.
import { test, expect } from './studioTest';
import type { Page } from '@playwright/test';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';
import { CARD_PATTERN_BANK } from '../src/lib/cardPatternBank.js';
import { CARD_PLAYLIST_ENTRY_LIMIT } from '../src/lib/cardPlaylist.js';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';

function makeTimedPlaylistProject({ count = 2 } = {}) {
  const project = createDefaultProject();
  project.id = `timed-playlist-project-${count}`;
  project.name = 'Timed playlist project';
  const patterns = CARD_PATTERN_BANK.slice(0, count);
  project.devices.standaloneController.playlist = patterns.map((pattern, order) => ({
    id: pattern.id,
    label: pattern.label,
    type: 'pattern',
    patternId: pattern.id,
    enabled: true,
    dwellSeconds: 30,
    createdAt: order,
  }));
  project.devices.standaloneController.controls.encoder.patternCycleIds = patterns.map(pattern => pattern.id);
  return project;
}

async function gotoPlaylist(page: Page, project) {
  await page.addInitScript((savedProject) => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
  }, project);
  await page.goto('/#screen=playlist', { waitUntil: 'domcontentloaded' });
}

// Same recipe as playlist-storage.spec.ts's stateFromProject — a card
// reporting exactly the project under test, so applyControl can resolve
// every playlist entry's patternId against a real installed look.
function stateFromProject(project, overrides: Record<string, unknown> = {}) {
  const prepared = prepareCardDeployment({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 0,
    strips: project.layout.strips,
    patchBoard: project.layout.patchBoard,
    wiring: project.layout.wiring,
    standaloneController: project.devices.standaloneController,
  });
  const config = prepared.runtimePackage.config;
  const outputs = config.led?.outputs || [];
  const patterns = CARD_PATTERN_BANK.map(pattern => ({ id: pattern.id, label: pattern.label }));
  const currentId = config.startupPatternId;
  const currentIndex = patterns.findIndex(pattern => pattern.id === currentId);
  return {
    id: 'playlist-timed-card',
    describe: 'card holding the timed-playlist project under test',
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

async function mockConnectedTimedCard(
  page: Page,
  project,
  cardId = 'lw-playlist-timed',
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

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 900 },
  { label: '390px', width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Playlist timed transport at ${viewport.label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test('setting dwell, fade, and enable marks the project edited, and Install sends the exact playlist block', async ({ page }) => {
      const project = makeTimedPlaylistProject({ count: 2 }); // aurora, plasma
      const [auroraId, plasmaId] = project.devices.standaloneController.playlist.map((item) => item.id);
      const card = await mockConnectedTimedCard(page, project, `lw-playlist-timed-set-${viewport.label}`);
      await gotoPlaylist(page, project);

      // Dwell: change Aurora's row from the default 30s to 45s.
      const dwellInput = page.getByTestId(`playlist-dwell-${auroraId}`);
      await expect(dwellInput).toHaveValue('30');
      await dwellInput.fill('45');
      await expect(dwellInput).toHaveValue('45');

      // Fade: the playlist-wide field, in seconds with one decimal.
      const fadeInput = page.getByTestId('playlist-fade-seconds');
      await expect(fadeInput).toHaveValue('1.5'); // DEFAULT_PLAYLIST_FADE_MS (1500ms)
      await fadeInput.fill('0.8');
      await expect(fadeInput).toHaveValue('0.8');

      // Enable: "Play on the card".
      const enableToggle = page.getByTestId('playlist-enabled-toggle');
      await expect(enableToggle).toHaveAttribute('aria-pressed', 'false');
      await enableToggle.click();
      await expect(enableToggle).toHaveAttribute('aria-pressed', 'true');

      // Install and assert the EXACT JSON the simulator received for the
      // contract's playlist block — not merely that installing succeeded.
      const configRequest = page.waitForRequest((request) => request.url().endsWith('/api/config'));
      await page.getByRole('button', { name: 'Install playlist on card' }).click();
      const request = await configRequest;
      const body = JSON.parse(request.postData() || '{}');
      expect(body.playlist).toEqual({
        enabled: true,
        fadeMs: 800,
        entries: [
          { patternId: auroraId, dwellSeconds: 45 },
          { patternId: plasmaId, dwellSeconds: 30 },
        ],
      });
      await expect(page.getByTestId('playlist-card-status')).toContainText('Playlist installed on card.');
      expect(card.state.playlistEntries).toEqual([
        { patternId: auroraId, dwellSeconds: 45 },
        { patternId: plasmaId, dwellSeconds: 30 },
      ]);
    });

    test('Play advances entry 1, Next moves to entry 2, and a manual look tap pauses the card', async ({ page }) => {
      const project = makeTimedPlaylistProject({ count: 2 }); // aurora, plasma
      const [auroraId] = project.devices.standaloneController.playlist.map((item) => item.id);
      const card = await mockConnectedTimedCard(page, project, `lw-playlist-timed-transport-${viewport.label}`);
      await gotoPlaylist(page, project);

      // "Absent or disabled produces no block at all" (the contract) — so a
      // playlist only reaches the card, and only becomes CONFIGURED there, by
      // installing with "Play on the card" on. That also auto-starts it,
      // which is exactly the Play button's own resting state — Pause proves
      // the transport can stop it, and Play proves it can restart it, without
      // this test having to invent a "configured but never started" card
      // state the real firmware does not have.
      await page.getByTestId('playlist-enabled-toggle').click();
      const configRequest = page.waitForRequest((request) => request.url().endsWith('/api/config'));
      await page.getByRole('button', { name: 'Install playlist on card' }).click();
      await configRequest;
      await expect(page.getByTestId('playlist-card-status')).toContainText('Playlist installed on card.');

      const transportStatus = page.getByTestId('playlist-card-transport-status');
      await expect(transportStatus).toContainText('Playing entry 1 of 2, Aurora');
      await expect.poll(() => card.state.playlistPlaying).toBe(true);

      // One status, one primary action: with the playlist playing, "Install
      // playlist on card" is the only filled button on the screen, and the
      // transport reads as a pressed toggle, not a second primary.
      const filled = page.locator('.pm button.btn.primary:visible');
      await expect(filled).toHaveCount(1);
      await expect(filled).toHaveText(/Install playlist on card/);
      await expect(page.getByTestId('playlist-play-toggle')).toHaveAttribute('aria-pressed', 'true');

      // Pause, then Play again — the toggling primary action round-trips.
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(transportStatus).toContainText('Paused on Aurora');
      await expect.poll(() => card.state.playlistPlaying).toBe(false);

      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(transportStatus).toContainText('Playing entry 1 of 2, Aurora');
      await expect.poll(() => card.state.playlistPlaying).toBe(true);

      // Next → entry 2 (Plasma).
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(transportStatus).toContainText('Playing entry 2 of 2, Plasma');
      await expect.poll(() => card.state.playlistEntryIndex).toBe(1);
      await expect.poll(() => card.state.currentId).toBe('plasma');

      // A manual look tap (Live on Aurora's row) pauses the playlist — the
      // card-side rule this whole feature depends on: any manual look change
      // pauses the playlist on the card.
      await page.getByTestId(`playlist-row-${auroraId}`).getByRole('button', { name: 'Live', exact: true }).click();
      await expect.poll(() => card.state.playlistPlaying).toBe(false);
      await expect(transportStatus).toContainText('Paused on');

      if (viewport.label === '390px') {
        // Re-arm playing state for the screenshot, so the required capture
        // genuinely shows "a card linked and playing", not the paused state
        // the pause assertion just left behind.
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await expect(transportStatus).toContainText('Playing');
        await page.screenshot({ path: 'test-results/playlist-390.png', fullPage: true });
      }
    });

    test('a playlist past the 16-entry card cap says so plainly', async ({ page }) => {
      const project = makeTimedPlaylistProject({ count: 17 });
      await mockConnectedTimedCard(page, project, `lw-playlist-timed-overflow-${viewport.label}`);
      await gotoPlaylist(page, project);

      await expect(page.getByTestId('playlist-overflow-notice')).toContainText(
        `Only the first ${CARD_PLAYLIST_ENTRY_LIMIT} looks reach the card. 1 more is in the order but will not play there.`,
      );
    });

    test('a playlist within the 16-entry card cap shows no overflow notice', async ({ page }) => {
      const project = makeTimedPlaylistProject({ count: CARD_PLAYLIST_ENTRY_LIMIT });
      await mockConnectedTimedCard(page, project, `lw-playlist-timed-no-overflow-${viewport.label}`);
      await gotoPlaylist(page, project);

      await expect(page.getByTestId('playlist-overflow-notice')).toHaveCount(0);
    });
  });
}
