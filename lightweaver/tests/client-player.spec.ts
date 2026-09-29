import { expect, test, type Page } from '@playwright/test';

const CARD = 'lw-client123';
const patterns = [
  { id: 'installed_Moon', label: 'Moon garden', mode: 'procedural', zones: [] },
  { id: 'artwork-amber', label: 'Amber tides', mode: 'procedural', zones: [] },
  { id: 'combo-dusk', label: 'Velvet dusk', mode: 'combo', zones: [] },
  { id: 'stillwater', label: 'Stillwater', mode: 'procedural', zones: [] },
];

export async function mockClientCard(page: Page, { oldFirmware = false } = {}) {
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
    piece: { name: 'The moon garden' },
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

test('installed patterns, persisted playlist and sliders work at phone and desktop sizes', async ({ page }) => {
  const state = await mockClientCard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  await expect(page.getByRole('heading', { name: 'Moon garden', exact: true })).toBeVisible();
  await expect(page.getByLabel('Card address')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Studio|Card page/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Owner tools' })).toHaveAttribute('href', 'https://led.mandalacodes.com/api/owner/studio');
  await expect(page.getByRole('link', { name: 'Lightweaver player' })).toHaveAttribute('href', '/client.html');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lw_client_pairing_v1') || '{}').cardId)).toBe(CARD);
  await expect(page.locator('.cl-pattern')).toHaveCount(4);
  await page.getByRole('button', { name: 'Stay on pattern' }).click();
  expect(state.controls).toHaveLength(0);
  await page.getByRole('button', { name: /Your playlist/ }).click();
  await page.getByRole('button', { name: '+ Add pattern' }).click();
  const duration = page.getByRole('spinbutton', { name: /Duration for Moon garden/ });
  await duration.fill(''); await duration.fill('45'); await duration.press('Tab');
  await page.getByLabel('Pattern to add').selectOption('artwork-amber');
  await page.getByRole('button', { name: '+ Add pattern' }).click();
  await page.getByRole('button', { name: 'Move entry 2 up' }).click();
  await page.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByText('Playlist saved on your card.')).toBeVisible();
  expect(state.enabled).toBe(true);
  expect(state.entries).toEqual([{ patternId: 'artwork-amber', dwellSeconds: 30 }, { patternId: 'installed_Moon', dwellSeconds: 45 }]);
  await page.getByRole('button', { name: 'Repeat playlist' }).click();
  await expect(page.getByRole('button', { name: 'Repeat playlist' })).toHaveAttribute('aria-pressed', 'true');
  const brightness = page.getByRole('slider', { name: 'Brightness' });
  await brightness.focus(); await brightness.press('ArrowLeft');
  await expect.poll(() => state.brightness).toBe(0.69);
  expect(state.controls.at(-1)).toEqual({ brightness: 0.69 });
  expect(state.playing).toBe(true);
  await page.getByRole('slider', { name: 'Hue shift' }).press('ArrowRight');
  await expect.poll(() => state.hueShift).toBe(1);
  expect(state.controls.at(-1)).toEqual({ hueShift: 1 });
  expect(state.playing).toBe(true);
  await page.getByRole('button', { name: /Patterns 4/ }).click();
  await page.screenshot({ path: '/private/tmp/lightweaver-client-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '/private/tmp/lightweaver-client-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Amber tides/ }).click();
  await expect(page.getByRole('heading', { name: 'Amber tides' })).toBeVisible();
  expect(state.controls.at(-1)).toEqual({ patternId: 'artwork-amber', syncZones: true });
  expect(state.playing).toBe(false);
  await connect(page);
  await page.getByRole('button', { name: /Your playlist/ }).click();
  await expect(page.getByRole('spinbutton', { name: /Duration for Moon garden/ })).toHaveValue('45');
  await page.getByRole('button', { name: 'Remove entry 1' }).click();
  await expect(page.locator('.cl-playlist-row')).toHaveCount(1);
  state.rejectSave = true;
  await page.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Playlist changed');
  expect(state.entries).toHaveLength(2);
});

test('unsupported playlist firmware keeps existing light controls usable', async ({ page }) => {
  await mockClientCard(page, { oldFirmware: true });
  await connect(page);
  await page.getByRole('button', { name: /Your playlist/ }).click();
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
