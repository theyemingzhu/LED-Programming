// Measure: a connected card on an older firmware build; owner updates it over Wi-Fi from the browser.
// Test plumbing (signer + updater hooks) is copied from tests/preserving-firmware-update.spec.ts;
// every owner action goes through j.press.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState, MATRIX_CARD_ID } from '../harness/cardStates';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';
import { seedKnownCard, seedCompleteProject } from './_seed';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
    test(`card update @${vp.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      await guardRealCard(page);
      const spec = cardState('stale-firmware');
      const card = createCardSimulator(spec);
      await seedCompleteProject(page, cardState('installed-match'));
      await seedKnownCard(page, spec);
      await page.addInitScript(({ cardId }) => {
        (window as any).__LW_GRANT_PROBE_RESULT_FOR_TEST__ = { state: 'ready', reason: '' };
        (window as any).__LW_LOAD_UPDATE_RELEASE_FOR_TEST__ = async () => ({
          manifest: { target: 'esp32-s3-n16r8', firmwareVersion: '1.2.0', buildId: '2'.repeat(40), buildNumber: 2407 },
          ticket: {
            schemaVersion: 1, target: 'esp32-s3-n16r8', firmwareVersion: '1.2.0', buildId: '2'.repeat(40), buildNumber: 2407,
            image: { size: 3, sha256: '0'.repeat(64) },
            partition: { layout: 'default_16MB.csv', tableSha256: '3'.repeat(64), app0Offset: 0x10000, app1Offset: 0x650000, slotSize: 0x640000 },
            compatibility: { minimumBootstrapBuild: 1198 }, preservation: { dataPartitionsIncluded: false },
          },
          ticketBytes: new Uint8Array([1]), ticketSha256: '4'.repeat(64), ticketSignature: new Uint8Array(64), imageBytes: new Uint8Array([0xe9, 1, 2]),
        });
        (window as any).__LW_UPDATER_ARGUMENTS__ = [];
        (window as any).__LW_CREATE_FIRMWARE_UPDATER_FOR_TEST__ = ({ onProgress, softwareGrant }: any) => {
          (window as any).__LW_UPDATER_ARGUMENTS__.push({ softwareGrant });
          return {
            preflight: async () => { onProgress({ phase: 'preflight', acknowledgedBytes: 0, totalBytes: 3 }); },
            begin: async () => { onProgress({ phase: 'sending', acknowledgedBytes: 0, totalBytes: 3 }); },
            send: async () => { onProgress({ phase: 'sending', acknowledgedBytes: 3, totalBytes: 3 }); },
            commit: async () => { onProgress({ phase: 'restarting', acknowledgedBytes: 3, totalBytes: 3 }); },
            readStatus: async () => { const s = { phase: 'pending-reboot', receivedBytes: 3 }; onProgress(s); return s; },
          };
        };
      }, { cardId: MATRIX_CARD_ID });
      await card.install(page);
      const j = recordJourney(page, 'card-update', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await j.land('opens Studio; card connected, firmware older than release');
        await j.press(page.getByRole('button', { name: /^\s*\d+\s*→\s*\d+/ }).first(), 'Card Home: "1392 → 2407" update link');
        const panel = page.getByTestId('preserving-update-panel');
        await expect(panel).toBeVisible({ timeout: 15000 });
        await j.press(panel.getByRole('button', { name: 'Update over Wi-Fi' }), 'Update over Wi-Fi');
        await j.press(panel.getByRole('button', { name: 'Start secure Wi-Fi update' }), 'Start secure Wi-Fi update');
        await expect(panel).toContainText(/Restarting card|restart/i, { timeout: 20000 });
        await page.waitForTimeout(1500);
        await j.land('update sent; card restarting');
      } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
