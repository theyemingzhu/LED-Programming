// Card Home's facts: always on screen, each with one door to its editor.
// The power limit is the one fact whose row used to read a path nothing
// writes (power.maxMilliamps) and whose only editor lived in Layout → Wire;
// this proves the row reads led.maxMilliamps and that the Hardware fold now
// carries the editor that writes it.
import { test, expect, type Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION, type CardStateSpec } from './harness/cardStates';

async function seedInstalledMatch(page: Page, spec: CardStateSpec, led: Record<string, unknown>) {
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.addInitScript((s) => {
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      id: s.projectId, name: 'Facts piece',
      layout: { starterPending: false, strips: [{ id: 'strip-1', pixels: s.pixels, pin: s.pin }],
        wiring: { verified: true, runs: [{ id: 'strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward' }] } },
      portRoles: [{ port: 'out1', role: 'strip', pin: s.pin, pixelCount: s.pixels }],
      devices: { standaloneController: { led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB', ...s.led } } },
    }));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      generation: 1, editedRevision: 1, installedRevision: 1, dirty: false,
      installation: { cardId: s.cardId, projectRevision: s.projectRevision, projectFingerprint: s.projectFingerprint, studioFingerprint: s.projectFingerprint, verified: true },
    }));
  }, { projectId: spec.projectId, projectRevision: spec.projectRevision, projectFingerprint: spec.projectFingerprint, pixels: spec.pixels, pin: spec.pin, cardId: MATRIX_CARD_ID, led });
  return card;
}

test('the facts read the project, and the power limit reads the path the editor writes', async ({ page }) => {
  const spec = cardState('installed-match');
  await seedInstalledMatch(page, spec, { maxMilliamps: 3200, psuAmps: 4, milliampsPerPixel: 50, brightnessLimit: 0.45 });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });

  const facts = page.getByTestId('card-facts');
  await expect(facts.getByTestId('fact-outputs')).toContainText(`GPIO ${spec.pin}`);
  await expect(facts.getByTestId('fact-lights')).toContainText(String(spec.pixels));
  await expect(facts.getByTestId('fact-color-order')).toContainText('GRB');
  await expect(facts.getByTestId('fact-artwork')).toContainText('1 strip');
  // An installed, matching card is the authority on its own limit: Studio
  // reconciles led.maxMilliamps from the card's read-back (the simulator
  // reports 2000), so the row shows what the card actually enforces, not
  // the number the project file happened to carry.
  await expect(facts.getByTestId('fact-power')).toContainText('2000 mA');
  await expect(facts.getByTestId('fact-brightness')).toContainText('115');
  // Nothing on Card Home is still to do once installed.
  await expect(page.getByTestId('setup-todo')).toHaveCount(0);
});

test('the power row opens the Hardware fold, where the supply size sets the limit both readouts show', async ({ page }) => {
  const spec = cardState('installed-match');
  await seedInstalledMatch(page, spec, {});
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });

  const power = page.getByTestId('card-facts').getByTestId('fact-power');
  await expect(power).toContainText('2000 mA');
  await power.getByRole('button', { name: 'Change' }).click();

  // One click: the Hardware fold opens and carries the supply fields.
  await expect(page).toHaveURL(/#screen=card&section=settings$/);
  await expect(page.getByTestId('card-hardware-fold')).toHaveAttribute('open', '');
  const supply = page.getByTestId('settings-power-supply');
  await expect(supply).toBeVisible();

  // Setting the supply writes led.maxMilliamps (80% of the supply), and the
  // fact row on Home reads that same number.
  await supply.getByLabel('Power supply amps').fill('3');
  await expect(page.getByTestId('settings-power-limit')).toHaveText('2400 mA');
  await expect(power).toContainText('2400 mA');
  // Autosave is debounced; poll the stored project rather than read it once.
  await expect.poll(async () => {
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
    const led = stored.devices?.standaloneController?.led || {};
    return [led.maxMilliamps, led.psuAmps];
  }, { timeout: 10000 }).toEqual([2400, 3]);
});
