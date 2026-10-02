import { expect, test } from '@playwright/test';
import { REAL_PATTERN_BY_ID } from '../src/v3/v3-data.js';

test('player uses Studio gradients and branding with three phone sections', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const status = { app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-visual123', bootId: 'visual-boot', firmwareVersion: '1.2.1', buildId: 'a'.repeat(40), buildNumber: 2311, projectId: 'garden', projectRevision: 1, projectFingerprint: 'b'.repeat(64), runtimePhase: 'ready', configValid: true, knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true, piece: { name: 'Garden' }, capabilities: {}, playlist: {} };
  await page.route('http://lightweaver.local/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/status' || path === '/api/firmware-info') return route.fulfill({ json: status });
    if (path === '/api/patterns') return route.fulfill({ json: { currentId: 'installed-fire', patterns: [
      { id: 'installed-fire', label: 'Evening fire', runtimePatternId: 'fire' },
      { id: 'journey-art', label: 'Personal journey', nativeRecipe: { kind: 'color-journey', journey: { stops: [{ color: '#fa1020' }, { color: '#2200ee' }] } } },
      { id: 'unknown-recording', label: 'Recording', mode: 'sequence' },
    ] } });
    if (path === '/api/zones') return route.fulfill({ json: { zones: [{ id: 'all', patternId: 'installed-fire', brightness: .7, speed: 1, hueShift: 0 }] } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await expect(page.locator('.cl-brand-name')).toHaveText('Lightweaver');
  await expect(page.locator('.cl-brand-name')).toHaveCSS('font-size', '14.5px');
  await expect(page.locator('.cl-brand-mark')).toHaveCSS('width', '17px');
  const fire = page.locator('.cl-pattern [data-pattern-preview="installed-fire"]');
  expect(await fire.evaluate((element, gradient) => {
    const comparison = document.createElement('div'); comparison.style.background = gradient as string;
    return (element as HTMLElement).style.background === comparison.style.background;
  }, REAL_PATTERN_BY_ID.get('fire').grad)).toBe(true);
  await expect(page.locator('.cl-pattern [data-pattern-preview="journey-art"]')).toHaveCSS('background-image', 'linear-gradient(110deg, rgb(250, 16, 32), rgb(34, 0, 238))');
  await expect(page.locator('[data-pattern-preview="unknown-recording"]')).toHaveText('Preview unavailable');
  const nav = page.getByRole('navigation', { name: 'Player views' });
  await expect(nav.getByRole('button', { name: /^Patterns/ })).toBeVisible();
  await nav.getByRole('button', { name: /^Playlist/ }).click();
  await expect(page.getByRole('heading', { name: 'Your playlist' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Library' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await nav.getByRole('button', { name: /^Patterns/ }).click();
  await page.screenshot({ path: testInfo.outputPath('client-gradients-phone.png'), fullPage: true });
});
