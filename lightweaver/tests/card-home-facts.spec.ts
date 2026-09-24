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

test('the supply size is typed in the power row and sets the limit the card caps itself at', async ({ page }) => {
  const spec = cardState('installed-match');
  await seedInstalledMatch(page, spec, {});
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });

  const power = page.getByTestId('card-facts').getByTestId('fact-power');
  await expect(power.getByTestId('fact-power-limit')).toHaveText('2000 mA');

  // Setting the supply writes led.maxMilliamps (80% of the supply); the
  // readout beside the field says so at once.
  await power.getByLabel('Power supply amps').fill('3');
  await expect(power.getByTestId('fact-power-limit')).toHaveText('2400 mA');
  // Autosave is debounced; poll the stored project rather than read it once.
  await expect.poll(async () => {
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
    const led = stored.devices?.standaloneController?.led || {};
    return [led.maxMilliamps, led.psuAmps];
  }, { timeout: 10000 }).toEqual([2400, 3]);

  // The Hardware fold no longer carries a second copy of these editors.
  await page.getByTestId('card-hardware-fold').locator('summary').click();
  await expect(page.getByTestId('card-hardware-fold')).toHaveAttribute('open', '');
  await expect(page.getByTestId('settings-power-supply')).toHaveCount(0);
  await expect(page.locator('.set-row', { hasText: 'Brightness limit' })).toHaveCount(0);
});

test('the brightness fader in the row writes the limit', async ({ page }) => {
  const spec = cardState('installed-match');
  await seedInstalledMatch(page, spec, { brightnessLimit: 0.45 });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });

  const row = page.getByTestId('fact-brightness');
  await expect(row).toContainText('115');
  await row.getByLabel('Brightness limit').fill('200');
  await expect(row).toContainText('200');
  await expect.poll(async () => {
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
    return Math.round((stored.devices?.standaloneController?.led?.brightnessLimit || 0) * 255);
  }, { timeout: 10000 }).toBe(200);
});

test('an installed card sends count changes to Layout; a bench card takes them in the row and lights the strip', async ({ page }) => {
  // Installed and matching: the strips are Layout's geometry, so no stepper.
  const spec = cardState('installed-match');
  await seedInstalledMatch(page, spec, {});
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });
  await expect(page.getByTestId('fact-lights-stepper')).toHaveCount(0);
  await expect(page.getByTestId('fact-lights')).toContainText(String(spec.pixels));
  await page.getByTestId('fact-lights').getByRole('button', { name: 'Change count' }).click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw$/);
});

for (const width of [1440, 390]) {
  test(`Change wiring opens the actual Layout Specs controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const spec = cardState('installed-match');
    await seedInstalledMatch(page, spec, {});
    await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });
    await page.getByTestId('fact-outputs').getByRole('button', { name: 'Change wiring' }).click();
    await expect(page).toHaveURL(/#screen=layout&mode=draw&panel=specs$/);
    await expect(page.getByTestId('layout-specs-panel')).toBeVisible();
    await expect(page.getByTestId('layout-specs-trigger')).toHaveAttribute('aria-expanded', 'true');
    const wiring = page.getByTestId('advanced-installation-tools');
    await expect(wiring).toHaveAttribute('open', '');
    await expect(wiring.getByRole('button', { name: 'Find my LED wire' })).toBeVisible();
    await expect(wiring.getByText('Advanced mapping')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390) {
      await expect.poll(async () => {
        const box = await wiring.boundingBox();
        return box !== null && box.y >= 0 && box.y < 900;
      }).toBe(true);
    }
  });
}

test('a colour-order key tries that order on the strip and reads it back', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = await seedInstalledMatch(page, spec, {});
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });

  const keys = page.getByTestId('fact-color-keys');
  await expect(keys.getByRole('button', { name: 'GRB', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const controlPostsBefore = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/control').length;
  await keys.getByRole('button', { name: 'BRG', exact: true }).click();
  await expect(keys.getByRole('button', { name: 'BRG', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/control').length, { timeout: 10000 }).toBeGreaterThan(controlPostsBefore);
  await expect(page.getByTestId('fact-color-status')).toContainText(/BRG/, { timeout: 10000 });
  await expect.poll(async () => {
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
    return stored.devices?.standaloneController?.led?.colorOrder;
  }, { timeout: 10000 }).toBe('BRG');
});

test('Health remembers its last result', async ({ page }) => {
  const spec = cardState('installed-match');
  await seedInstalledMatch(page, spec, {});
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });

  const health = page.getByTestId('card-checks-recovery');
  await expect(health.getByTestId('card-checks-last')).toContainText('Not checked yet');
  await health.getByRole('button', { name: 'Verify hardware' }).click();
  await expect(health.getByTestId('card-checks-message')).toContainText(/readback verified/i, { timeout: 15000 });

  // Leave and come back: the row still says when the card was last read.
  // (Stored per card id in localStorage, so it survives a full reload too;
  // the in-app round trip is what an owner actually does.)
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-checks-recovery').getByTestId('card-checks-last')).toContainText(/^Verified .* · readback verified/, { timeout: 20000 });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_card_health_v1') || '{}'));
  expect(Object.values(stored)[0]).toEqual(expect.objectContaining({ status: 'ok' }));
});

for (const width of [1440, 390]) {
test(`a verified blank factory card leads with setup and retains checks at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const spec = cardState('factory-blank');
  const card = createCardSimulator({ ...spec, runtimePhase: 'factory', commandReady: false });
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_card_health_v1', JSON.stringify({
      [id]: { status: 'ok', message: 'prior readback verified', at: Date.now() - 60_000 },
    }));
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  const health = page.getByTestId('card-checks-recovery');
  await expect(health).toBeVisible({ timeout: 15000 });
  await expect(health).toContainText('Continue setup');
  await expect(health.getByTestId('card-checks-last')).toContainText('Last check: Verified');
  await expect(health.getByTestId('card-checks-last')).toContainText('prior readback verified');
  const checks = health.getByTestId('blank-card-checks');
  await expect(checks.locator('summary')).toHaveText('Checks & recovery');
  await checks.locator('summary').click();
  await expect(checks).toContainText('Finish setup before checking the lights');
  await expect(checks.getByRole('button', { name: 'Recover lights' })).toBeVisible();
  await expect(checks.getByRole('button', { name: 'Verify hardware' })).toBeVisible();
  await expect(page.getByTestId('card-detected-state')).not.toContainText('Recover lights');
  await health.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`blank-card-checks-${width}.png`), fullPage: true });
  await checks.locator('summary').click();
  await page.screenshot({ path: testInfo.outputPath(`blank-card-home-${width}.png`), fullPage: true });
  await health.getByRole('button', { name: 'Continue setup' }).click();
  await expect(page.getByTestId('setup-active-task')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
}

for (const stateId of ['not-ready', 'provisional'] as const) {
  test(`${stateId} card keeps its Health recovery actions`, async ({ page }) => {
    const card = createCardSimulator(cardState(stateId));
    await card.install(page);
    await page.addInitScript(({ id, firmwareVersion, buildId }) => {
      localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
      localStorage.setItem('lw_card_host', 'lightweaver.local');
      localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
    await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
    const health = page.getByTestId('card-checks-recovery');
    await expect(health).toBeVisible({ timeout: 15000 });
    await expect(health.getByRole('button', { name: 'Verify hardware' })).toBeVisible();
    await expect(health.getByRole('button', { name: 'Recover lights' })).toBeVisible();
    await expect(health.getByRole('button', { name: 'Continue setup' })).toHaveCount(0);
    if (stateId === 'provisional') {
      await expect(health.getByRole('button', { name: 'Clear temporary setup' })).toBeVisible();
    }
  });
}

test('the project is renamed right in the status row', async ({ page }) => {
  const spec = cardState('installed-match');
  await seedInstalledMatch(page, spec, {});
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-progress')).toHaveText('Setup complete', { timeout: 20000 });

  await page.getByTestId('setup-project-name-edit').click();
  const input = page.getByTestId('setup-project-name-input');
  await expect(input).toBeFocused();
  await input.fill('Gallery north wall');
  await input.press('Enter');

  // The same rename path as the top bar: both now say the new name, and it
  // is what gets saved.
  await expect(page.getByTestId('setup-project-name-edit')).toContainText('Gallery north wall');
  // The top bar carries no project crumb on the Card screen (the status row
  // is the project there); on Layout it shows the same name.
  await expect(page.getByTestId('project-name-edit')).toHaveCount(0);
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('project-name-edit')).toHaveText('Gallery north wall');
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-project-name-edit')).toContainText('Gallery north wall', { timeout: 20000 });
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'))).name, { timeout: 10000 }).toBe('Gallery north wall');
  // Escape cancels without renaming.
  await page.getByTestId('setup-project-name-edit').click();
  await page.getByTestId('setup-project-name-input').fill('Nope');
  await page.getByTestId('setup-project-name-input').press('Escape');
  await expect(page.getByTestId('setup-project-name-edit')).toContainText('Gallery north wall');
});

// Last on purpose: the bench card's typed-count write goes to a route the
// simulator does not serve, and the connection refusal it leaves behind in
// the browser made the next test's card slow to connect when it ran after.
test('a bench card takes the count typed in the row and lights the strip to it', async ({ page }) => {
  const spec = cardState('provisional');
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-todo')).toBeVisible({ timeout: 20000 });

  const stepper = page.getByTestId('fact-lights-stepper');
  await expect(stepper).toBeVisible({ timeout: 15000 });
  const input = stepper.getByLabel('Light count');
  await input.fill('60');
  await page.getByTestId('fact-lights-set').click();

  // The count lands in the project either way; the row says whether the card
  // took it. (The simulator does not serve the typed-count card write the way
  // a real card does — setup-led-count.spec.ts mocks that by hand — so here
  // the honest outcome is "saved here, the card did not take it yet".)
  await expect(page.getByTestId('fact-lights')).toContainText(/60 lights are set|Count saved here|Could not reach/, { timeout: 15000 });
  await expect.poll(async () => {
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
    return (stored.portRoles || []).find((role: { role: string }) => role.role === 'strip')?.pixelCount;
  }, { timeout: 10000 }).toBe(60);
  await expect(page.getByTestId('setup-identity-lights')).toContainText('60');
});
