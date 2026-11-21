// Stubs for the signed release and the updater, copied from
// tests/preserving-firmware-update.spec.ts (via card-update.measure.spec.ts).
// Every owner action stays real.
import type { Page } from '@playwright/test';
import { MATRIX_CARD_ID } from '../harness/cardStates';

export async function seedFirmwareUpdate(page: Page) {
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
}
