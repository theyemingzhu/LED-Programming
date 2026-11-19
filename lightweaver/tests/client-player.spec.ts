import { expect, test, type Page } from '@playwright/test';

const CARD = 'lw-client123';
const samplePatterns = [
  { id: 'installed_Moon', label: 'Moon garden', mode: 'procedural', zones: [] },
  { id: 'artwork-amber', label: 'Amber tides', mode: 'procedural', zones: [] },
  { id: 'combo-dusk', label: 'Velvet dusk', mode: 'combo', zones: [] },
  { id: 'stillwater', label: 'Stillwater', mode: 'procedural', zones: [] },
];

async function mockClientCard(page: Page, { oldFirmware = false, patterns = samplePatterns, pieceName = 'The moon garden' } = {}) {
  const state = {
    patternId: patterns[0].id, brightness: 0.7, speed: 1, hueShift: 0, blackout: false,
    playing: false, revision: 'saved-1', enabled: false,
    entries: [] as { patternId: string; dwellSeconds: number }[],
    controls: [] as Record<string, unknown>[],
    cardId: CARD, bootId: 'client-boot', rejectSave: false,
  };
  const status = () => ({
    app: 'Lightweaver', provisioningContractVersion: 1, cardId: state.cardId, bootId: state.bootId,
    firmwareVersion: '1.1.1', buildId: 'a'.repeat(40), buildNumber: 444,
    runtimePhase: 'ready', configValid: true, knownGoodProject: true,
    commandReady: true, outputReady: true, playbackReady: true,
    projectId: 'client-artwork', projectRevision: 1, projectFingerprint: 'b'.repeat(64),
    piece: { name: pieceName },
    capabilities: oldFirmware ? {} : { clientPlaylist: { version: 1 } },
    playlist: { configured: state.enabled && state.entries.length > 0, playing: state.playing, entryIndex: 0, entryCount: state.entries.length, patternId: state.patternId, remainingSeconds: 28 },
  });
  const playlist = () => ({ ok: true, cardId: state.cardId, revision: state.revision, enabled: state.enabled, fadeMs: 1500, entries: state.entries });
  await page.route('http://lightweaver.local/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/status' || path === '/api/firmware-info') return route.fulfill({ json: status() });
    if (path === '/api/patterns') return route.fulfill({ json: { currentId: state.patternId, patterns } });
    if (path === '/api/zones') return route.fulfill({ json: { zones: [{ id: 'all', label: 'Whole piece', patternId: state.patternId, brightness: state.brightness, speed: state.speed, blackout: state.blackout, hueShift: state.hueShift }] } });
    if (path === '/api/client-playlist') {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (state.rejectSave || body.expectedRevision !== state.revision || body.expectedCardId !== CARD) return route.fulfill({ status: 409, json: { ok: false, error: 'Playlist changed. Reload it from your card.' } });
        state.entries = body.entries; state.enabled = body.enabled; state.revision = 'saved-2'; state.playing = false;
      }
      return route.fulfill({ json: playlist() });
    }
    if (path === '/api/control') {
      const body = route.request().postDataJSON(); state.controls.push(body);
      if (body.patternId) { state.patternId = body.patternId; state.playing = false; }
      if (body.brightness !== undefined) state.brightness = body.brightness;
      if (body.hueShift !== undefined) state.hueShift = body.hueShift;
      if (body.speed !== undefined) state.speed = body.speed;
      if (body.blackout !== undefined) state.blackout = body.blackout;
      if (body.playlist === 'play') state.playing = true;
      if (body.playlist === 'pause') state.playing = false;
      return route.fulfill({ json: { ok: true, cardId: state.cardId, ...body, appliedPatternId: state.patternId } });
    }
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  return state;
}

async function connect(page: Page) {
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
}

test('installed patterns, persisted playlist and sliders work at phone and desktop sizes', async ({ page }, testInfo) => {
  const state = await mockClientCard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  await expect(page.getByRole('button', { name: 'Moon garden', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Card address')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Studio|Card page/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Owner tools' })).toHaveAttribute('href', 'https://led.mandalacodes.com/api/owner/studio');
  await expect(page.getByRole('link', { name: 'Lightweaver player' })).toHaveAttribute('href', '/client.html');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lw_client_pairing_v1') || '{}').cardId)).toBe(CARD);
  await expect(page.locator('.cl-pattern')).toHaveCount(4);
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Add look' }).click();
  const duration = page.getByRole('spinbutton', { name: /Duration for Moon garden/ });
  await duration.fill(''); await duration.fill('45'); await duration.press('Tab');
  await page.getByLabel('Look to add').selectOption('artwork-amber');
  await page.getByRole('button', { name: 'Add look' }).click();
  await page.getByRole('button', { name: 'Move entry 2 up' }).click();
  await page.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByText('Playlist saved on your card.')).toBeVisible();
  expect(state.enabled).toBe(true);
  expect(state.entries).toEqual([{ patternId: 'artwork-amber', dwellSeconds: 30 }, { patternId: 'installed_Moon', dwellSeconds: 45 }]);
  await page.getByRole('button', { name: 'Play playlist' }).click();
  await expect(page.getByRole('button', { name: 'Pause playlist' })).toBeEnabled();
  const brightness = page.getByRole('slider', { name: 'Brightness' });
  await brightness.focus(); await brightness.press('ArrowLeft');
  await expect.poll(() => state.brightness).toBe(0.69);
  expect(state.controls.at(-1)).toEqual({ brightness: 0.69 });
  expect(state.playing).toBe(true);
  await page.getByRole('button', { name: 'Tuning', exact: true }).click();
  await page.getByRole('slider', { name: 'Hue shift' }).press('ArrowRight');
  await expect.poll(() => state.hueShift).toBe(1);
  expect(state.controls.at(-1)).toEqual({ hueShift: 1 });
  expect(state.playing).toBe(true);
  await page.getByRole('button', { name: 'Looks', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('lightweaver-client-phone.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('lightweaver-client-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: /Amber tides/ }).click();
  await expect(page.getByRole('button', { name: 'Amber tides' })).toHaveAttribute('aria-pressed', 'true');
  expect(state.controls.at(-1)).toEqual({ patternId: 'artwork-amber', syncZones: true });
  expect(state.playing).toBe(false);
  await connect(page);
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: /Duration for Moon garden/ })).toHaveValue('45');
  await page.getByRole('button', { name: 'Remove entry 1' }).click();
  await expect(page.locator('.cl-playlist-row')).toHaveCount(1);
  state.rejectSave = true;
  await page.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Playlist changed');
  expect(state.entries).toHaveLength(2);
});

test('three named complete looks fit the first viewport and select the whole installation', async ({ page }, testInfo) => {
  const patterns = [
    { id: 'combo-a', label: 'A · Moon Garden over the North and South Courtyards', mode: 'combo', zones: [] },
    { id: 'combo-b', label: 'B · Amber Tides at the Water Garden and Entry Archway', mode: 'combo', zones: [] },
    { id: 'combo-c', label: 'C · Indigo Hour across the East Colonnade and Central Sculpture', mode: 'combo', zones: [] },
  ];
  const state = await mockClientCard(page, { patterns, pieceName: 'The Moon Garden and Courtyard Installation' });
  state.entries = patterns.map(({ id }) => ({ patternId: id, dwellSeconds: 30 }));
  state.enabled = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  const looks = page.getByRole('region', { name: 'Installed looks' });
  const choice = (label: string) => looks.getByRole('button', { name: label, exact: true });
  const brightness = page.getByRole('slider', { name: 'Brightness' });
  const power = page.getByRole('button', { name: 'Turn lights off' });
  await expect(choice(patterns[0].label)).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(patterns[0].label)).toContainText('Playing');
  for (const [width, height, image] of [
    [390, 844, 'player-390x844.png'],
    [320, 568, 'player-320x568.png'],
    [1440, 1000, 'player-1440x1000.png'],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const { label } of patterns) await expect(choice(label)).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(brightness).toBeInViewport({ ratio: 1 });
    await expect(power).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Play playlist' })).toBeInViewport({ ratio: 1 });
    expect((await power.boundingBox())!.y).toBeLessThan((await choice(patterns[0].label).boundingBox())!.y);
    expect((await choice(patterns[2].label).boundingBox())!.y).toBeLessThan((await brightness.boundingBox())!.y);
    await page.screenshot({ path: testInfo.outputPath(image) });
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByRole('slider', { name: 'Hue shift' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play playlist' }).click();
  await expect(page.getByText('Look 1 of 3 · 28s left')).toBeVisible();
  await expect(choice(patterns[2].label)).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('player-320x568-playlist-running.png') });
  await page.getByRole('button', { name: 'Pause playlist' }).click();
  await expect(page.getByRole('button', { name: 'Play playlist' })).toBeEnabled();
  await page.getByRole('button', { name: 'Play playlist' }).click();
  for (const { id, label } of [patterns[1], patterns[2], patterns[0]]) {
    await choice(label).click();
    await expect(choice(label)).toHaveAttribute('aria-pressed', 'true');
    await expect(looks.locator('button[aria-pressed=true]')).toHaveCount(1);
    expect(state.controls.at(-1)).toEqual({ patternId: id, syncZones: true });
    expect(state.playing).toBe(false);
  }
  await page.getByRole('button', { name: 'Turn lights off' }).click();
  await expect(choice(patterns[0].label)).toContainText('Selected');
  expect(state.controls.at(-1)).toEqual({ blackout: true });
  await page.getByRole('button', { name: 'Turn lights on' }).click();
  await expect(choice(patterns[0].label)).toContainText('Playing');
  expect(state.controls.at(-1)).toEqual({ blackout: false });
});

test('unsupported playlist firmware keeps existing light controls usable', async ({ page }) => {
  await mockClientCard(page, { oldFirmware: true });
  await connect(page);
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Playlist editing needs a card update' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Brightness' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save playlist', exact: true })).toHaveCount(0);
});

test('a different card or boot cannot receive a stale control', async ({ page }) => {
  const state = await mockClientCard(page);
  await connect(page);
  state.cardId = 'lw-different';
  await page.getByRole('button', { name: /Amber tides/ }).click();
  await expect(page.getByRole('alert')).toContainText('different card');
  expect(state.controls).toHaveLength(0);
});

for (const failure of ['rejected', 'missing-identity']) {
  test(`brightness ${failure} restores the confirmed slider value`, async ({ page }) => {
    const state = await mockClientCard(page);
    await connect(page);
    await page.route('http://lightweaver.local/api/control', route => {
      if (failure === 'rejected') return route.fulfill({ status: 503, json: { ok: false, error: 'Control temporarily unavailable.' } });
      return route.fulfill({ json: { ok: true, brightness: 0.69 } });
    });
    const brightness = page.getByRole('slider', { name: 'Brightness' });
    await brightness.press('ArrowLeft');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(brightness).toBeEnabled();
    await expect(brightness).toHaveValue('70');
    expect(state.brightness).toBe(0.7);
  });
}


test('shared installation link auto-connects only its exact card', async ({ page }) => {
  const state = await mockClientCard(page);
  await page.goto('/client.html#host=lightweaver.local&cardId=lw-client123&name=Moon%20garden');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lw_client_pairing_v1') || '{}').cardId)).toBe(CARD);
  state.cardId = 'lw-another';
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Lights unavailable' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('different card');
  await expect(page.getByRole('slider', { name: 'Brightness' })).toHaveCount(0);
  expect(state.controls).toHaveLength(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lw_client_pairing_v1') || '{}').cardId)).toBe(CARD);
});

test('shared links without exact identity never probe an arbitrary card', async ({ page }) => {
  let probes = 0;
  await page.route('http://lightweaver.local/api/**', route => { probes += 1; return route.abort(); });
  await page.goto('/client.html#host=lightweaver.local');
  await expect(page.getByRole('alert')).toContainText('link is incomplete');
  expect(probes).toBe(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('relative tuning reads, saves, and recalls the exact look session', async ({ page }, testInfo) => {
  const neutral = { brightnessScale: 1, speedScale: 1, hueOffset: 0 };
  const patterns = [
    { id: 'combo-a', label: 'A · Moon Garden over the North and South Courtyards', mode: 'combo', zones: [] },
    { id: 'combo-b', label: 'B · Amber Tides at the Water Garden and Entry Archway', mode: 'combo', zones: [] },
    { id: 'recorded', label: 'C · Recorded motion', mode: 'sequence', zones: [] },
  ];
  const saves: Record<string, typeof neutral> = {};
  const changes: unknown[] = [];
  const defaultId = patterns[0].id;
  let active = defaultId;
  let live = { ...neutral };
  let bootId = 'relative-boot';
  let lookSession = 1;
  let saveCount = 0;
  let ignoreReadback = false;
  const select = (id: string) => {
    active = id;
    lookSession += 1;
    live = { ...(saves[id] || neutral) };
  };
  const tuning = () => ({
    patternId: active, session: lookSession, revision: 'relative-' + (saves[active] ? saveCount : 0),
    motion: active !== 'recorded', speedMin: 0.1, speedMax: 2, live, saved: saves[active] || neutral,
  });
  await page.route('http://lightweaver.local/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/status' || path === '/api/firmware-info') return route.fulfill({ json: {
      app: 'Lightweaver', provisioningContractVersion: 1, cardId: CARD, bootId,
      firmwareVersion: '1.1.1', buildId: 'a'.repeat(40), buildNumber: 444,
      runtimePhase: 'ready', configValid: true, knownGoodProject: true, commandReady: true,
      outputReady: true, playbackReady: true, projectId: 'client-artwork', projectRevision: 1,
      projectFingerprint: 'b'.repeat(64), piece: { name: 'The Moon Garden and Courtyard Installation' },
      capabilities: { lookTuning: { version: 1 }, clientPattern: { version: 1 } },
    } });
    if (path === '/api/patterns') return route.fulfill({ json: { currentId: active, patterns } });
    if (path === '/api/zones') return route.fulfill({ json: {
      lookTuning: tuning(), blackout: false, zones: [
        { id: 'left', patternId: 'aurora', brightness: 0.8, speed: 1, hueShift: 0 },
        { id: 'right', patternId: 'fire', brightness: 0.3, speed: 0.6, hueShift: -15 },
      ],
    } });
    if (path === '/api/control') {
      const body = route.request().postDataJSON();
      if (body.patternId) {
        select(body.patternId);
        return route.fulfill({ json: { ok: true, cardId: CARD, appliedPatternId: active } });
      }
      const target = body.lookTuning;
      if (target?.expectedCardId !== CARD || target.expectedBootId !== bootId ||
        target.session !== lookSession || target.patternId !== active) {
        return route.fulfill({ status: 409, json: { ok: false, error: 'The active look changed.' } });
      }
      changes.push(body);
      live = { ...live, ...target.changes };
      return route.fulfill({ json: { ok: true, cardId: CARD, bootId, lookTuning: tuning() } });
    }
    if (path === '/api/client-pattern') {
      const isSave = route.request().method() === 'POST';
      const patternId = isSave ? active : url.searchParams.get('patternId')!;
      if (isSave) {
        const body = route.request().postDataJSON();
        expect(body).toEqual({
          expectedCardId: CARD, expectedRevision: tuning().revision, patternId: active,
          tuning: { expectedBootId: bootId, session: lookSession, values: live },
        });
        saves[active] = { ...live };
        saveCount += 1;
      }
      return route.fulfill({ json: {
        ok: true, cardId: CARD, patternId, revision: 'legacy', overrides: {},
        tuning: { revision: tuning().revision, values: !isSave && ignoreReadback ? neutral : saves[patternId] || neutral },
      } });
    }
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  const brightness = page.getByRole('slider', { name: 'Brightness' });
  const tuningView = page.getByRole('button', { name: 'Tuning', exact: true });
  const looks = page.getByRole('button', { name: 'Looks', exact: true });
  const save = page.getByRole('button', { name: 'Save adjustments' });
  await expect(brightness).toHaveValue('100');
  await brightness.focus();
  await brightness.fill('50');
  await brightness.press('Tab');
  await tuningView.click();
  await expect(save).toBeEnabled();
  const speed = page.getByRole('slider', { name: 'Speed' });
  await speed.focus();
  await speed.fill('1.5');
  await speed.press('Tab');
  await expect(speed).toHaveValue('1.5');
  const hue = page.getByRole('slider', { name: 'Hue shift' });
  await hue.focus();
  await hue.fill('20');
  await hue.press('Tab');
  await expect.poll(() => live).toEqual({ brightnessScale: 0.5, speedScale: 1.5, hueOffset: 20 });
  expect(changes).toHaveLength(3);
  await page.screenshot({ path: testInfo.outputPath('relative-tuning-phone.png') });

  // Reconnecting reads the card's unsaved active settings. Save needs the
  // exact current look session and card revision from this readback.
  await connect(page);
  await tuningView.click();
  await expect(save).toBeEnabled();
  ignoreReadback = true;
  await save.click();
  await expect(page.getByRole('alert')).toContainText('could not be verified');
  ignoreReadback = false;
  await looks.click();
  await page.getByRole('button', { name: /^B ·/ }).click();
  await expect(brightness).toHaveValue('100');
  await page.getByRole('button', { name: /^A ·/ }).click();
  await expect(brightness).toHaveValue('50');

  await brightness.press('ArrowLeft');
  await tuningView.click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Adjustments saved to this look.')).toBeVisible();
  expect(saves[defaultId]).toEqual({ brightnessScale: 0.49, speedScale: 1.5, hueOffset: 20 });
  await brightness.press('ArrowLeft');
  await expect(brightness).toHaveValue('48');
  await expect(save).toBeEnabled();
  await looks.click();
  await page.getByRole('button', { name: /^A ·/ }).click();
  await expect(brightness).toHaveValue('49');
  // The same name does not authorize a stale command after reselection.
  select(defaultId);
  await brightness.press('ArrowLeft');
  await expect(page.getByRole('alert')).toContainText('The active look changed.');
  expect(live.brightnessScale).toBe(0.49);
  await page.getByRole('button', { name: /^C ·/ }).click();
  await tuningView.click();
  await expect(page.getByText('Their speed and hue are fixed.', { exact: false })).toBeVisible();
  await expect(speed).toHaveCount(0);
  await expect(hue).toHaveCount(0);

  // This fixture simulates boot behavior. Firmware boot ordering has a
  // separate native source check and physical playback needs a bench check.
  bootId = 'second-boot';
  select(defaultId);
  await connect(page);
  await expect(page.getByRole('button', { name: /^A ·/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(brightness).toHaveValue('49');
});

test('legacy multi-zone cards retain playback and explain why tuning and save need an update', async ({ page }) => {
  const state = await mockClientCard(page);
  await page.route('http://lightweaver.local/api/zones', route => route.fulfill({ json: {
    zones: [
      { id: 'left', brightness: 0.8, speed: 1, hueShift: 0 },
      { id: 'right', brightness: 0.3, speed: 0.6, hueShift: -15 },
    ],
  } }));
  await connect(page);
  await expect(page.getByRole('slider', { name: 'Brightness' })).toHaveCount(0);
  await expect(page.getByText('Update the card to adjust and save this whole look.')).toBeVisible();
  const look = page.getByRole('button', { name: 'Velvet dusk', exact: true });
  await look.click();
  await expect(look).toHaveAttribute('aria-pressed', 'true');
  expect(state.controls.at(-1)).toEqual({ patternId: 'combo-dusk', syncZones: true });
  await page.getByRole('button', { name: 'Tuning', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save adjustments' })).toBeDisabled();
});
