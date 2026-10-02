import { expect, test } from '@playwright/test';

test('phone playlist remains visible and keeps unsaved timing after a failed save and reconnect', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let rejectSave = true;
  let entries: { patternId: string; dwellSeconds: number }[] = [];
  const controls: unknown[] = [];
  const status = { app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-recovery123', bootId: 'recovery-boot', firmwareVersion: '1.2.1', buildId: 'a'.repeat(40), buildNumber: 2311, projectId: 'garden', projectRevision: 1, projectFingerprint: 'b'.repeat(64), runtimePhase: 'ready', configValid: true, knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true, piece: { name: 'Garden' }, capabilities: { clientPlaylist: { version: 1 } }, playlist: {} };
  await page.route('http://lightweaver.local/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/status' || path === '/api/firmware-info') return route.fulfill({ json: status });
    if (path === '/api/patterns') return route.fulfill({ json: { currentId: 'fire', patterns: [{ id: 'fire', label: 'Evening fire', runtimePatternId: 'fire' }] } });
    if (path === '/api/zones') return route.fulfill({ json: { zones: [{ id: 'all', patternId: 'fire', brightness: .7, speed: 1, hueShift: 0 }] } });
    if (path === '/api/client-playlist') {
      if (route.request().method() === 'POST' && rejectSave) return route.fulfill({ status: 504, json: { ok: false, error: 'Request timed out' } });
      if (route.request().method() === 'POST') { entries = route.request().postDataJSON().entries; status.playlist = { configured: true } as any; }
      return route.fulfill({ json: { ok: true, cardId: status.cardId, revision: 'saved-1', enabled: entries.length > 0, fadeMs: 1500, entries } });
    }
    if (path === '/api/control') { controls.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, cardId: status.cardId } }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Player views' });
  expect((await nav.boundingBox())!.y).toBeLessThan(180);
  await nav.getByRole('button', { name: /^Playlist/ }).click();
  await expect(page.getByRole('heading', { name: 'Your playlist', exact: true })).toBeVisible();
  const addPatterns = page.getByRole('button', { name: 'Add patterns', exact: true });
  expect((await addPatterns.boundingBox())!.y).toBeLessThan(650);
  await addPatterns.click();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.locator('.cl-playlist-choice [data-pattern-preview="fire"]')).toHaveCSS('background-image', /gradient/);
  await page.getByRole('button', { name: 'Add Evening fire to playlist' }).click();
  const duration = page.getByRole('spinbutton', { name: /Duration for/ });
  await duration.fill('90'); await duration.press('Tab');
  await page.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your playlist edits are still here');
  await expect(page.getByText('Playlist saved on your card.')).toHaveCount(0);
  await page.getByRole('alert').getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByText('Reconnected. Your unsaved playlist is still here.')).toBeVisible();
  await expect(duration).toHaveValue('90');
  await expect(page.getByRole('button', { name: 'Save playlist', exact: true })).toBeEnabled();
  await expect(page.locator('.cl-row-art [data-pattern-preview="fire"]')).toBeVisible();
  expect((await page.getByRole('heading', { name: 'Your playlist' }).boundingBox())!.y).toBeLessThan(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('playlist-phone.png'), fullPage: true });
  await nav.getByRole('button', { name: 'Library', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Add Evening fire to playlist', exact: true }).click();
  const saveAction = page.getByRole('button', { name: 'Save playlist', exact: true });
  await expect(saveAction).toBeInViewport();
  expect((await saveAction.boundingBox())!.y).toBeLessThan(650);
  await page.getByRole('button', { name: 'Remove entry 2', exact: true }).click();
  rejectSave = false;
  await page.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByText('Playlist saved on your card.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play playlist', exact: true })).toBeEnabled();
  expect(controls).toEqual([]);
  expect(entries).toEqual([{ patternId: 'fire', dwellSeconds: 90 }]);
  await page.getByRole('button', { name: 'Play playlist', exact: true }).click();
  await expect.poll(() => controls).toEqual([{ playlist: 'play' }]);
});
