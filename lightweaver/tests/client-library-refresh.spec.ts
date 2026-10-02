import { expect, test } from '@playwright/test';

async function mockLibraryCard(page) {
  const writes: string[] = [];
  await page.route('http://lightweaver.local/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403, json: { ok: false } }); }
    if (path === '/api/status' || path === '/api/firmware-info') return route.fulfill({ json: {
      app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-library123', bootId: 'library-boot',
      firmwareVersion: '1.2.1', buildId: 'a'.repeat(40), buildNumber: 2311, runtimePhase: 'ready', configValid: true,
      knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
      projectId: 'moon', projectRevision: 1, projectFingerprint: 'b'.repeat(64), piece: { name: 'Moon' }, capabilities: { clientPlaylist: { version: 1 } }, playlist: {},
    } });
    if (path === '/api/client-playlist') return route.fulfill({ json: { ok: true, cardId: 'lw-library123', revision: 'playlist-1', enabled: false, fadeMs: 1000, entries: [] } });
    if (path === '/api/patterns') return route.fulfill({ json: { currentId: 'ocean', patterns: [{ id: 'ocean', label: 'Ocean', mode: 'procedural', zones: [] }] } });
    if (path === '/api/zones') return route.fulfill({ json: { zones: [
      { id: 'outer', label: 'Outer ring', patternId: 'ocean', brightness: .7, speed: 1, hueShift: 0, ranges: [{ start: 0, count: 20 }] },
      { id: 'inner', label: 'Inner ring', patternId: 'ocean', brightness: .7, speed: 1, hueShift: 0, ranges: [{ start: 20, count: 20 }] },
      { id: 'mirror', label: 'Mirrored outer', mirrorOf: 'outer', mirrorFlip: true, patternId: 'ocean', brightness: .7, speed: 1, hueShift: 0, ranges: [{ start: 40, count: 20 }] },
    ] } });
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  return writes;
}

test('Library refreshes renamed sections without reconnecting or losing drafts', async ({ page }) => {
  const writes = await mockLibraryCard(page);
  let label = 'Outer ring'; let failZones = false; let bootId = 'library-boot';
  const sections = () => [{ id: 'outer', label, ranges: [{ start: 0, count: 20 }], mirrorOf: '', mirrorFlip: false }];
  await page.route('http://lightweaver.local/api/status', route => route.fulfill({ json: {
    app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-library123', bootId, firmwareVersion: '1.2.2', buildId: 'a'.repeat(40), buildNumber: 2315,
    runtimePhase: 'ready', configValid: true, knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
    projectId: 'moon', projectRevision: 1, projectFingerprint: 'b'.repeat(64), piece: { name: 'Moon' },
    capabilities: { clientPlaylist: { version: 1 }, clientLibrary: { version: 1 } }, playlist: {},
  } }));
  await page.route('http://lightweaver.local/api/zones', route => failZones ? route.fulfill({ status: 504, json: { error: 'Timed out' } }) : route.fulfill({ json: { zones: sections().map(section => ({ ...section, patternId: 'ocean', brightness: .7, speed: 1, hueShift: 0 })) } }));
  await page.route('http://lightweaver.local/api/client-library', route => route.fulfill({ json: { ok: true, cardId: 'lw-library123', bootId: 'library-boot', revision: 'lib-1', layoutRevision: 'map-1', currentLookId: 'ocean', supportedPresetIds: ['ocean'], remaining: 29, canInstall: true, sections: sections() } }));
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: /^Playlist/ }).click();
  await page.getByRole('button', { name: 'Add Ocean to playlist', exact: true }).click();
  await page.getByRole('spinbutton', { name: /Duration for Ocean/ }).fill('75');
  await page.getByRole('spinbutton', { name: /Duration for Ocean/ }).press('Tab');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new pattern', exact: true }).click();
  await page.getByRole('button', { name: 'Use Ocean', exact: true }).click();
  await page.getByRole('radio', { name: 'Choose sections', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Outer ring', exact: true }).check();
  await page.getByLabel('Pattern name', { exact: true }).fill('My quiet ocean');
  label = 'Upper petals';
  await expect(page.getByRole('checkbox', { name: 'Upper petals', exact: true })).toBeChecked({ timeout: 6000 });
  await expect(page.getByLabel('Pattern name', { exact: true })).toHaveValue('My quiet ocean');
  failZones = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Checking lights…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to playlist', exact: true })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Upper petals', exact: true })).toBeChecked();
  failZones = false; label = 'Crown petals';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('checkbox', { name: 'Crown petals', exact: true })).toBeChecked();
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Pattern name', { exact: true })).toHaveValue('My quiet ocean');
  await page.getByRole('navigation').getByRole('button', { name: /^Playlist/ }).click();
  await expect(page.getByRole('spinbutton', { name: /Duration for Ocean/ })).toHaveValue('75');
  await expect(page.getByRole('button', { name: 'Save playlist', exact: true })).toBeEnabled();
  bootId = 'changed-boot';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText(/restarted|boot/i);
  await expect(page.getByRole('button', { name: 'Save playlist', exact: true })).toBeDisabled();
  await expect(page.getByRole('spinbutton', { name: /Duration for Ocean/ })).toHaveValue('75');
  expect(writes).toEqual([]);
});
