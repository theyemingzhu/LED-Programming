import { expect, test } from '@playwright/test';
import { installReplacementFixture, openReplacementDiscovery } from './harness/replacementFixture';

test('four occupied slots block a fifth addition but offer a direct replacement', async ({ page }) => {
  const { card } = await installReplacementFixture(page, { timing: 'real' });
  await openReplacementDiscovery(page);
  const pin = page.getByRole('group', { name: 'Eligible LED pins', exact: true })
    .getByRole('button', { name: 'GPIO 17', exact: true })
    .or(page.getByTestId('discovery-pin-map').getByRole('button', { name: 'Pin 17', exact: true }));
  await pin.click();
  await expect(page.getByTestId('discovery-start')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replace GPIO 38', exact: true })).toBeVisible();
  expect(card.requests.filter(request => request.method === 'POST' && request.path.startsWith('/api/wiring/'))).toEqual([]);
});

for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]] as const) {
  test.describe(label, () => {
    test.use({ viewport, isMobile: label === 'phone', hasTouch: label === 'phone' });
    test('keeps the installed project at four slots after two visibly confirmed replacements and reload', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      const alternate = label === 'phone';
      const { card, pins, planned, counts, project } = await installReplacementFixture(page, { timing: alternate ? 'fast' : 'real', alternate });
      await openReplacementDiscovery(page);
      const originalOutputs = card.state.explicitOutputs!;
      const originalPatterns = card.state.patterns.map(pattern => pattern.id);
      const mutations = () => card.requests.filter(request => request.method === 'POST' && request.path.startsWith('/api/wiring/'));
      for (const index of alternate ? [0, 2] : [2, 3]) {
        await page.getByRole('button', { name: `Replace GPIO ${pins[index]}`, exact: true }).click();
        await expect(page.getByRole('combobox', { name: 'New pin' })).toHaveValue(String(planned[index]));
        await expect(page.getByRole('option', { name: 'GPIO 5', exact: true })).toHaveCount(0);
        await expect(page.getByRole('option', { name: 'GPIO 42', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Test replacement', exact: true }).click();
        const confirm = page.getByRole('button', { name: 'Keep this pin', exact: true });
        await expect(confirm, await page.getByTestId('replacement-flow').textContent() || '').toBeVisible({ timeout: 45_000 });
        await expect(page.getByText(`Check those lights on the strip you moved to GPIO ${planned[index]}.`, { exact: false })).toBeVisible();
        expect(card.state.wiringTestActive).toBe(true);
        expect(card.state.explicitOutputs?.map(output => output.pixels)).toEqual(counts);
        await page.screenshot({ path: testInfo.outputPath(`test-gpio-${planned[index]}.png`) });
        await confirm.click();
        await expect(page.getByTestId('replacement-status')).toHaveText(`GPIO ${planned[index]} saved and verified on the card.`, { timeout: 45_000 });
      }
      expect(card.state.explicitOutputs).toEqual(originalOutputs.map((output, index) => ({ ...output, pin: planned[index] })));
      expect(card.state.projectId).toBe(project.id);
      expect(card.state.patterns.map(pattern => pattern.id)).toEqual(originalPatterns);
      expect(card.state.wiringTestActive).toBe(false);
      expect(card.state.wiringTransactionOpen).toBe(false);
      expect(mutations().map(request => request.path)).toEqual([
        '/api/wiring/candidate', '/api/wiring/activate', '/api/wiring/confirm',
        '/api/wiring/candidate', '/api/wiring/activate', '/api/wiring/confirm',
      ]);
      const stageIndex = card.requests.findIndex(request => request.method === 'POST' && request.path === '/api/wiring/candidate');
      const activateIndex = card.requests.findIndex(request => request.method === 'POST' && request.path === '/api/wiring/activate');
      expect(card.requests.slice(stageIndex + 1, activateIndex).some(request => request.method === 'GET' && request.path === '/api/wiring/status')).toBe(true);
      const candidates = mutations().filter(request => request.path === '/api/wiring/candidate').map(request => (request.body as any).candidate);
      expect(candidates.map(candidate => candidate.led.outputs.length)).toEqual([4, 4]);
      expect(candidates[1].led.outputs.map((output: { pin: number }) => output.pin)).toEqual(planned);
      expect(card.requests.some(request => request.method === 'POST' && ['/api/config', '/api/clear-project'].includes(request.path))).toBe(false);
      await expect.poll(() => page.evaluate(() => {
        const draft = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
        return draft.portRoles.filter((role: { role: string }) => role.role === 'strip')
          .map((role: { pin: number }) => role.pin);
      })).toEqual([...planned].sort((a, b) => a - b));
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')
        .portRoles.find((role: { pin: number }) => role.pin === 15).pixelCount)).toBe(11);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: `Replace GPIO ${planned[0]}`, exact: true })).toBeVisible();
      for (const pin of pins.filter(pin => !planned.includes(pin))) {
        await expect(page.getByRole('button', { name: `Replace GPIO ${pin}`, exact: true })).toHaveCount(0);
      }
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').layout.wiring.outputs
        .map((output: { pin: number }) => output.pin))).toEqual(planned);
    });
  });
}

test('an unverified card pin menu cannot stage a replacement', async ({ page }) => {
  const { card } = await installReplacementFixture(page, { capabilities: false });
  await openReplacementDiscovery(page);
  await page.getByRole('button', { name: 'Replace GPIO 38', exact: true }).click();
  await expect(page.getByText('Studio has no verified pin list for this card.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test replacement', exact: true })).toBeDisabled();
  expect(card.requests.filter(request => request.method === 'POST' && request.path.startsWith('/api/wiring/'))).toEqual([]);
});

test('cancel leaves storage alone and rejected or expired tests recover the working outputs', async ({ page }) => {
  const { card, pins } = await installReplacementFixture(page);
  await openReplacementDiscovery(page);
  const choose = page.getByRole('button', { name: 'Replace GPIO 38', exact: true });
  const testReplacement = page.getByRole('button', { name: 'Test replacement', exact: true });
  const restore = page.getByRole('button', { name: 'Restore previous setup', exact: true });
  const keep = page.getByRole('button', { name: 'Keep this pin', exact: true });
  const mutations = () => card.requests.filter(request => request.method === 'POST' && request.path.startsWith('/api/wiring/'));
  await choose.click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(choose).toBeVisible();
  expect(mutations()).toEqual([]);

  await choose.click();
  card.refuse('/api/wiring/candidate', { status: 422, body: { ok: false, error: 'Candidate refused by card' } });
  await testReplacement.click();
  await expect(page.getByRole('alert').getByText('Candidate refused by card', { exact: false })).toBeVisible();
  expect(mutations().map(request => request.path)).toEqual(['/api/wiring/candidate']);

  await testReplacement.click();
  await expect(keep).toBeVisible();
  await restore.click();
  await expect(page.getByTestId('replacement-status')).toHaveText('The card confirmed its previous setup.');
  expect(card.state.explicitOutputs?.map(output => output.pin)).toEqual(pins);
  expect(mutations().at(-1)?.path).toBe('/api/wiring/rollback');

  await testReplacement.click();
  await expect(keep).toBeVisible();
  card.expireWiringProbation();
  await keep.click();
  await expect(page.getByText('The card no longer verifies the tested outputs.', { exact: false })).toBeVisible();
  await restore.click();
  await expect(page.getByTestId('replacement-status')).toHaveText('The card confirmed its previous setup.');
  expect(card.state.explicitOutputs?.map(output => output.pin)).toEqual(pins);
  expect(mutations().some(request => request.path === '/api/wiring/confirm')).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lw_port_roles_v1') || '[]')
    .filter((entry: { role: string }) => entry.role === 'strip').map((entry: { pin: number }) => entry.pin))).toEqual(pins);
});

test('the known legacy release verifies a replacement even if its confirmation reply is lost', async ({ page }) => {
  const { card } = await installReplacementFixture(page, { legacy: true });
  await openReplacementDiscovery(page);
  await page.getByRole('button', { name: 'Close light check' }).click();
  await page.goto('/#screen=discovery&installer=1&replace=38&pin=17', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('combobox', { name: 'New pin' })).toHaveValue('17');
  await expect(page.getByRole('option', { name: 'GPIO 5', exact: true })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'GPIO 39', exact: true })).toHaveCount(1);
  expect(card.requests.filter(request => request.method === 'POST' && request.path === '/api/beacon/port')).toEqual([]);
  await page.getByRole('button', { name: 'Test replacement', exact: true }).click();
  const keep = page.getByRole('button', { name: 'Keep this pin', exact: true });
  await expect(keep).toBeVisible();
  card.respondThenDrop('/api/wiring/confirm');
  await keep.click();
  await expect(page.getByTestId('replacement-status')).toHaveText('GPIO 17 saved and verified on the card.');
  expect(card.state.explicitOutputs?.map(output => output.pin)).toEqual([15, 16, 17, 41]);
  expect(card.requests.filter(request => request.method === 'POST' && request.path === '/api/wiring/confirm')).toHaveLength(1);
});

test.describe('phone with a Wi-Fi interruption', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('losing the card before confirmation explains what happened and allows restore', async ({ page }) => {
    const { card, pins } = await installReplacementFixture(page);
    await openReplacementDiscovery(page);
    await page.getByRole('button', { name: 'Replace GPIO 38', exact: true }).tap();
    await page.getByRole('button', { name: 'Test replacement', exact: true }).tap();
    const keep = page.getByRole('button', { name: 'Keep this pin', exact: true });
    await expect(keep).toBeVisible();

    card.goOffline();
    await keep.tap();
    const alert = page.getByTestId('replacement-error');
    await expect(alert).toHaveText('Studio verified the light test, then lost contact before sending confirmation. Keep the card powered. Reconnect to the card’s network, then choose Restore previous setup.');
    expect(card.requests.filter(request => request.method === 'POST' && request.path === '/api/wiring/confirm')).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lw_port_roles_v1') || '[]')
      .filter((entry: { role: string }) => entry.role === 'strip').map((entry: { pin: number }) => entry.pin))).toEqual(pins);

    card.goOnline();
    await page.getByRole('button', { name: 'Restore previous setup', exact: true }).tap();
    await expect(page.getByTestId('replacement-status')).toHaveText('The card confirmed its previous setup.');
    expect(card.state.explicitOutputs?.map(output => output.pin)).toEqual(pins);
    expect(card.requests.filter(request => request.method === 'POST' && request.path === '/api/wiring/rollback')).toHaveLength(1);
  });
});

test.describe('phone from Card Home', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('direct replacement links return to the current slots after saving and reopening', async ({ page }) => {
    const { card, planned, project } = await installReplacementFixture(page);
    await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Connect this card', exact: true }).tap();
    await page.goto('/#screen=card&section=overview');
    const link = page.getByTestId('fact-outputs').getByRole('link', { name: 'Replace GPIO 38', exact: true });
    const writes = () => card.requests.filter(request => request.method === 'POST' && request.path.startsWith('/api/wiring/'));

    const overlay = page.getByTestId('card-setup-overlay');
    const slots = overlay.getByTestId('replacement-slots');
    await link.tap();
    await expect(page.getByRole('combobox', { name: 'New pin' })).toHaveValue('17');
    expect(writes()).toEqual([]);
    for (const [from, to] of [[38, 17], [41, 18]]) {
      if (from === 41) await page.getByRole('button', { name: 'Replace GPIO 41', exact: true }).tap();
      await expect(page.getByRole('combobox', { name: 'New pin' })).toHaveValue(String(to));
      await page.getByRole('button', { name: 'Test replacement', exact: true }).tap();
      await page.getByRole('button', { name: 'Keep this pin', exact: true }).tap();
      await expect(page.getByTestId('replacement-status')).toHaveText(`GPIO ${to} saved and verified on the card.`);
      await expect(slots.getByRole('heading', { name: 'Configured pins' })).toBeFocused();
      await expect(slots.getByRole('listitem')).toHaveCount(4);
      await expect(overlay.getByRole('button', { name: `Test GPIO ${from}`, exact: true })).toHaveCount(0);
      await expect(overlay.getByRole('button', { name: `Replace GPIO ${from}`, exact: true })).toHaveCount(0);
      await expect(overlay.getByTestId(`discovery-probe-${to}`)).toHaveCount(1);

      if (from === 38) {
        await slots.getByRole('button', { name: 'Test GPIO 17', exact: true }).tap();
        await expect(overlay.getByRole('heading', { name: 'Did the strip on GPIO 17 light up?', exact: true })).toBeFocused();
        await expect(overlay.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled();
        await expect(overlay.getByRole('button', { name: 'Stop lights', exact: true })).toBeInViewport();
        await overlay.getByRole('button', { name: 'Try another pin', exact: true }).tap();
        await expect(slots.getByRole('listitem')).toHaveCount(4);
        expect(writes()).toHaveLength(3);
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(slots.getByRole('button', { name: 'Replace GPIO 18', exact: true })).toBeVisible({ timeout: 5000 });
    await expect(slots.getByRole('button', { name: 'Replace GPIO 38', exact: true })).toHaveCount(0);
    await expect(slots.getByRole('button', { name: 'Replace GPIO 41', exact: true })).toHaveCount(0);
    expect(card.state.explicitOutputs?.map(output => output.pin)).toEqual(planned);
    expect(card.state.projectId).toBe(project.id);
    const writesAfterSaving = writes().length;

    await page.goBack();
    await expect(page).toHaveURL(/#screen=card&section=overview$/);
    await expect(page.getByRole('dialog', { name: 'Find my strips' })).toHaveCount(0);
    await page.goForward();
    await expect(slots.getByRole('button', { name: 'Replace GPIO 18', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Close light check', exact: true }).tap();
    await page.goto('/#screen=discovery&replace=38');
    await expect(page.getByText('This pin is not configured on the connected card.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Test replacement', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show configured outputs', exact: true }).press('Enter');
    await expect(slots.getByRole('heading', { name: 'Configured pins' })).toBeFocused();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(slots.getByRole('button', { name: 'Replace GPIO 18', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Close light check', exact: true }).tap();
    await page.goto('/#screen=discovery&replace=18&pin=21');
    await expect(page.getByRole('combobox', { name: 'New pin' })).toHaveValue('21');
    await page.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
    await expect(slots.getByRole('heading', { name: 'Configured pins' })).toBeFocused();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(slots.getByRole('button', { name: 'Replace GPIO 18', exact: true })).toBeVisible();
    expect(writes()).toHaveLength(writesAfterSaving);
  });
});
