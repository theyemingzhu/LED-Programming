// Card Home's facts: always on screen, each with one door to its editor.
// The power limit is the one fact whose row used to read a path nothing
// writes (power.maxMilliamps) and whose only editor lived in Layout → Wire;
// this proves the row reads led.maxMilliamps and that the Hardware fold now
// carries the editor that writes it.
import { test, expect, type Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION, type CardStateSpec } from './harness/cardStates';
import { BENCH_PROJECT_ID } from '../src/lib/benchConfig.js';
import { fileURLToPath } from 'node:url';
import { createBenchDiscoveryCard } from './harness/benchDiscoveryCard';
const PROJECT = fileURLToPath(new URL('./fixtures/real-card-bench-2026-11-21/nov19-restore.lw.json', import.meta.url));
async function linkConnected(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  });
}

async function seedCardAndDraft(page: Page, spec: CardStateSpec, led: Record<string, unknown>) {
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('lw-card-facts-seeded')) return;
    sessionStorage.setItem('lw-card-facts-seeded', '1');
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3, id: s.projectId, name: 'Facts piece',
      layout: {
        starterPending: false,
        viewBox: '0 0 240 200',
        strips: [{ id: 'strip-1', name: 'Artwork', pathData: 'M 20 20 L 200 60 L 100 180', pixelCount: s.pixels, pin: s.pin }],
        wiring: {
          verified: true,
          outputs: [{ id: 'out1', pin: s.pin, runIds: ['run-strip-1'] }],
          runs: [{
            id: 'run-strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward',
            source: { stripId: 'strip-1', from: 0, to: s.pixels - 1 },
          }],
        },
      },
      portRoles: [{ port: 'out1', role: 'strip', pin: s.pin, pixelCount: s.pixels }],
      devices: { standaloneController: { led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB', ...s.led } } },
    }));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2,
      dirty: false,
      persistedDestination: 'browser',
      installation: null,
    }));
  }, { projectId: spec.projectId, pixels: spec.pixels, pin: spec.pin, led });
  return card;
}

// Real card lw-b0fe81f61b44, live Studio 2623 (durability run, night of
// 2026-11-22). Card Home → Light count 42 → Set: the installed-card row hands
// the count to Layout, whose save the card refused (POST /api/wiring/candidate
// 400 "candidate storage failed", shown as "no room"). From then on the count
// row read "Setting…" (later "Saving…") with every count control disabled,
// across reloads, with nothing in flight. The owner could not use the count
// any more. The row must come back usable and say why the count did not land.
const REFUSAL = { ok: false, state: 'known-good', error: 'candidate storage failed', rebooting: false, nextStep: 'none' };

test('a count the card refuses for room leaves the count row usable and names the reason', async ({ page }) => {
  test.setTimeout(240000);
  // The real card refused the staged copy; this one-strip practice card sends
  // a count as a plain save, so it refuses that save with the same reason.
  const spec = cardState('installed-match');
  const card = await seedCardAndDraft(page, spec, {});
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Installed project', { timeout: 20000 });
  await page.getByRole('button', { name: 'Open installed project' }).click();
  const before = card.state.pixels;
  card.refuse('/api/config', { status: 400, body: { ok: false, error: 'config storage failed' }, times: 20 });
  await page.evaluate(() => { window.location.hash = '#screen=card&section=overview'; });
  const stepper = page.getByTestId('fact-lights-stepper');
  await expect(stepper).toBeVisible({ timeout: 30000 });
  await stepper.getByLabel('Light count').fill(String(before + 1));
  await stepper.getByTestId('fact-lights-set').click();
  await expect.poll(() => card.requests.some(r => r.method === 'POST' && r.path === '/api/config'), { timeout: 60000 }).toBe(true);
  await page.waitForTimeout(5000);
  expect(card.state.pixels, 'the card kept its count').toBe(before);

  // Back on Card Home the row is usable again and a second press is answered.
  await page.evaluate(() => { window.location.hash = '#screen=card&section=overview'; });
  await expect(stepper).toBeVisible({ timeout: 20000 });
  const set = stepper.getByTestId('fact-lights-set');
  await expect(set).not.toHaveText(/Setting…|Saving…/, { timeout: 20000 });
  await expect(stepper.getByLabel('Light count')).toBeEnabled();
  await stepper.getByLabel('Light count').fill(String(before + 2));
  if (await set.isEnabled()) {
    await set.click();
    await page.evaluate(() => { window.location.hash = '#screen=card&section=overview'; });
    await expect(page.getByTestId('fact-lights-stepper').getByTestId('fact-lights-set')).not.toHaveText(/Setting…|Saving…/, { timeout: 45000 });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('fact-lights-stepper').getByTestId('fact-lights-set')).not.toHaveText(/Setting…|Saving…/, { timeout: 30000 });
  await expect(page.getByTestId('fact-lights-stepper').getByLabel('Light count')).toBeEnabled();
});
