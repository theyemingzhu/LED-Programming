// Shared seeding for tests/ux journeys: a remembered card + a complete,
// installed project, against the 'installed-match' simulator state.
// The project comes from createDefaultProject (the seed in first-action-walk
// uses a numeric strip.pixels, which crashes the Patterns screen).
import type { Page } from '@playwright/test';
import { createCardSimulator } from '../harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from '../harness/cardStates';
import { guardRealCard } from './journeyRecorder';

export async function bootSetUp(page: Page, mutate?: string) {
  await guardRealCard(page);
  const spec = cardState('installed-match');
  spec.pin = 16;
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  const fingerprint = await page.evaluate(async ({ spec, cardId, buildId, fw, mutate }) => {
    const { createDefaultProject } = await import('/src/lib/projectModel.js');
    const project: any = createDefaultProject();
    project.id = spec.projectId; project.name = spec.projectName;
    project.layout.starterPending = false;
    project.layout.wiring = { ...(project.layout.wiring || {}), verified: true };
    // Same recipe as seedWiringDivergedProject: total pixels == the card's, one strip port on pin 16.
    const strips = project.layout.strips;
    const total = strips.reduce((n: number, st: any) => n + (st.pixelCount || 0), 0);
    strips[1].pixelCount = Math.max(1, strips[1].pixelCount - (total - spec.pixels));
    strips[1].pixels = strips[1].pixels.slice(0, strips[1].pixelCount);
    project.portRoles = (project.portRoles || []).map((e: any) => (e.pin === 16 ? { ...e, role: 'strip', pixelCount: spec.pixels, controlKind: '' } : e));
    project.layout.wiring.locked = true;
    (project.layout.wiring.runs || []).forEach((r: any) => { r.verified = true; });
    const sc = project.devices?.standaloneController;
    if (sc) sc.led = { ...(sc.led || {}), type: 'WS2812B', maxMilliamps: 2000, colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' };
    // eslint-disable-next-line no-new-func
    if (mutate) new Function('project', mutate)(project);
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId, firmwareVersion: fw, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    const { migrateProject } = await import('/src/lib/projectModel.js');
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const fp = cardProjectFingerprint(migrateProject(project));
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_autosave_v3_backup', JSON.stringify(project));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2, dirty: false, persistedDestination: null,
      installation: { cardId, projectRevision: spec.projectRevision, projectFingerprint: fp, studioFingerprint: fp },
    }));
    return fp;
  }, { spec, cardId: MATRIX_CARD_ID, buildId: MATRIX_BUILD_ID, fw: MATRIX_FIRMWARE_VERSION, mutate: mutate || '' });
  card.state.projectFingerprint = fingerprint;
  // The card holds the same two-run output the project would send, so the
  // "would change the card output layout" guard does not misfire on a seed artefact.
  card.state.explicitOutputs = [{
    id: 'out1', pin: 16, pixels: spec.pixels,
    segments: [
      { id: 'run-default-outer-circle', count: 27, direction: 'forward' },
      { id: 'run-default-inner-circle', count: spec.pixels - 27, direction: 'forward' },
    ],
  }];
  await page.reload({ waitUntil: 'domcontentloaded' });
  return card;
}
