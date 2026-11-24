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

const SECTIONS = [11, 5, 10, 10, 5];
async function seedCardAndDraft(page: Page, spec: CardStateSpec, led: Record<string, unknown>, sections: number[] | null = null) {
  let at = 0;
  const card = sections
    ? createCardSimulator(spec, { initialOutputs: [{ id: 'out1', pin: spec.pin, pixels: spec.pixels, segments: sections.map((count, i) => ({ id: `run-strip-${i + 1}`, count, direction: 'forward' })) }] })
    : createCardSimulator(spec);
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('lw-card-facts-seeded')) return;
    const secs = s.sections || [s.pixels];
    let from = 0;
    const strips = secs.map((n, i) => ({ id: `strip-${i + 1}`, name: `Strip ${i + 1}`, pathData: `M ${20 + i * 40} 20 L ${40 + i * 40} 180`, pixelCount: n, pin: s.pin }));
    const runs = secs.map((n, i) => { const r = { id: `run-strip-${i + 1}`, type: 'strip', verified: true, physicalDirection: 'source-forward', source: { stripId: `strip-${i + 1}`, from: 0, to: n - 1 } }; from += n; return r; });
    sessionStorage.setItem('lw-card-facts-seeded', '1');
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3, id: s.projectId, name: 'Facts piece',
      layout: {
        starterPending: false,
        viewBox: '0 0 240 200',
        strips,
        wiring: {
          verified: true,
          outputs: [{ id: 'out1', pin: s.pin, runIds: runs.map(r => r.id) }],
          runs,
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
  }, { projectId: spec.projectId, pixels: spec.pixels, pin: spec.pin, led, sections });
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
  // Five sections on one output, as on the real card (11/5/10/10/5 on GPIO 18).
  const spec = cardState('installed-match');
  const card = await seedCardAndDraft(page, spec, {}, SECTIONS);
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Installed project', { timeout: 20000 });
  await page.getByRole('button', { name: 'Open installed project' }).click();
  const before = card.state.pixels;
  card.refuse('/api/wiring/candidate', { status: 400, body: REFUSAL, times: 20 });
  await page.evaluate(() => { window.location.hash = '#screen=card&section=overview'; });
  const stepper = page.getByTestId('fact-lights-stepper');
  await expect(stepper).toBeVisible({ timeout: 30000 });
  await stepper.getByLabel('Light count').fill(String(before + 1));
  await stepper.getByTestId('fact-lights-set').click();
  // The row answers: it is released and says why the count did not land.
  await expect(stepper.getByTestId('fact-lights-set')).not.toHaveText(/Setting…|Saving…/, { timeout: 20000 });
  await expect(page.getByText(/more than one run|wiring change|no room/i).first()).toBeVisible({ timeout: 20000 });
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
