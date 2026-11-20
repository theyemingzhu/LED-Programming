// Seeding helpers copied from tests/first-action-walk.spec.ts (measurement plumbing only).
import type { Page } from '@playwright/test';
import { MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION, type CardStateSpec } from '../harness/cardStates';

export async function seedKnownCard(page: Page, spec: CardStateSpec) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: spec.firmwareVersion, buildId: spec.buildId });
}

export async function seedCompleteProject(page: Page, spec: CardStateSpec) {
  await page.addInitScript(({ id, firmwareVersion, buildId, project }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3, id: project.projectId, name: 'Matrix piece',
      layout: {
        starterPending: false,
        strips: [{ id: 'strip-1', pixels: project.pixels, pin: project.pin }],
        wiring: { verified: true, runs: [{ id: 'strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward' }] },
      },
      portRoles: [{ port: 'out1', role: 'strip', pin: project.pin, pixelCount: project.pixels }],
      devices: { standaloneController: { led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' } } },
    }));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2, dirty: false, persistedDestination: null,
      installation: {
        cardId: id, projectRevision: project.projectRevision,
        projectFingerprint: project.projectFingerprint, studioFingerprint: project.projectFingerprint,
      },
    }));
  }, {
    id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID,
    project: {
      projectId: spec.projectId, projectRevision: spec.projectRevision, projectFingerprint: spec.projectFingerprint,
      pixels: spec.pixels, pin: spec.pin,
    },
  });
}
