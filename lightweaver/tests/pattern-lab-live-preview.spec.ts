import { test, expect, type Page, type Route } from '@playwright/test';
import { choosePattern, closeControls } from './helpers/pattern-lab.ts';

declare global {
  interface Window { __patternLabFrames: string[]; }
}

async function installCardHarness(page: Page) {
  const controlBodies: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1,
      id: 'test-card',
      name: 'Test card',
      host: 'lightweaver.local',
    }));
    window.__patternLabFrames = [];
    class FakeWebSocket {
      readyState = 0;
      bufferedAmount = 0;
      onopen: null | (() => void) = null;
      onerror: null | (() => void) = null;
      onclose: null | (() => void) = null;
      constructor(_url: string) {
        setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0);
      }
      send(payload: string) { window.__patternLabFrames.push(payload); }
      close() { this.readyState = 3; this.onclose?.(); }
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: FakeWebSocket });
  });
  await page.route('http://lightweaver.local/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers, body: '' });
      return;
    }
    if (url.pathname === '/api/zones') {
      await route.fulfill({ status: 200, headers, json: {
        syncZones: false,
        zones: [{
          id: 'all', patternId: 'aurora', brightness: 0.62,
          driftHueMin: 12, driftHueMax: 211,
        }],
      } });
      return;
    }
    if (url.pathname === '/api/firmware-info' || url.pathname === '/api/status') {
      await route.fulfill({ status: 200, headers, json: {
        cardId: 'test-card', name: 'Test card', firmwareVersion: '1.0.0', buildId: 'test-build',
      } });
      return;
    }
    if (url.pathname === '/api/control' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      controlBodies.push(body);
      // requireLivePreviewAcknowledgement (cardLiveControl.js) confirms the
      // applied look via response.appliedPatternId, not response.patternId —
      // every other card-control test fixture in this suite echoes it
      // (card-control-drawer.spec.ts, patterns-v3.spec.ts,
      // wiring-workspace.spec.ts). This fixture was missing it, so any push
      // that actually named a pattern (the restore-after-stop call) failed
      // acknowledgement with "did not report which pattern … it applied".
      await route.fulfill({ status: 200, headers, json: body.cancelStream && !body.patternId
        ? { ok: true }
        : { ok: true, cardId: 'test-card', patternId: body.patternId || 'aurora', appliedPatternId: body.patternId || 'aurora' } });
      return;
    }
    await route.fulfill({ status: 404, headers, json: { ok: false } });
  });
  return controlBodies;
}

test('native bank aurora samples via look preview, never a frame stream', async ({ page }) => {
  const controls = await installCardHarness(page);
  await page.goto('/#screen=pattern-lab&patternId=aurora', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('pattern-lab-draft-name')).toBeVisible();
  await closeControls(page);

  await page.getByRole('button', { name: 'Live preview', exact: true }).click();
  await expect.poll(() => controls.some(body => body.patternId === 'aurora')).toBe(true);
  expect(await page.evaluate(() => window.__patternLabFrames.length)).toBe(0);
  await expect(page.getByRole('button', { name: 'Preview on Lights' })).toHaveCount(0);
  await expect(page.locator('.plab-live-preview')).toHaveAttribute('data-live-state', 'native-look');
});

test('library-only gradient still uses Preview on Lights frames and Stop restores', async ({ page }) => {
  const controls = await installCardHarness(page);
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await choosePattern(page, 'gradient');
  await closeControls(page);

  const preview = page.getByRole('button', { name: 'Live preview', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).toBeEnabled();
  // Autoload / native sampling must not have opened a frame stream for gradient.
  expect(await page.evaluate(() => window.__patternLabFrames.length)).toBe(0);

  await preview.click();
  await expect(page.getByRole('button', { name: 'Stop preview' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__patternLabFrames.length)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Stop preview' }).click();
  await expect(page.locator('.plab-live-preview [role="status"]')).toContainText('Previous card look restored');
  expect(controls.some(body => body.cancelStream && !body.patternId)).toBe(true);
  expect(controls.some(body => (
    body.patternId === 'aurora'
    && body.brightness === 0.62
    && body.zone === 'all'
    && body.syncZones === false
    && body.driftMin === 12
    && body.driftMax === 211
  ))).toBe(true);
});

test('leaving Pattern Lab rolls back an active frame-stream preview', async ({ page }) => {
  const controls = await installCardHarness(page);
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await choosePattern(page, 'gradient');
  await closeControls(page);
  await page.getByRole('button', { name: 'Live preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop preview' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__patternLabFrames.length)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await expect(page.getByTestId('pattern-lab-screen')).toHaveCount(0);
  await expect.poll(() => controls.filter(body => body.cancelStream && !body.patternId).length).toBe(1);
  await expect.poll(() => controls.some(body => body.patternId === 'aurora' && body.zone === 'all')).toBe(true);
});

test('Live preview keeps following native, Mandelbrot and Lotus selections until stopped', async ({ page }) => {
  const controls = await installCardHarness(page);
  await page.goto('/#screen=pattern-lab&patternId=aurora', { waitUntil: 'domcontentloaded' });
  await closeControls(page);
  await page.getByRole('button', { name: 'Live preview', exact: true }).click();
  await expect.poll(() => controls.some(body => body.patternId === 'aurora')).toBe(true);

  await choosePattern(page, 'mandelbrot');
  await closeControls(page);
  await expect(page.getByRole('button', { name: 'Stop preview', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__patternLabFrames.length)).toBeGreaterThan(0);
  const beforeLotus = await page.evaluate(() => window.__patternLabFrames.length);
  await choosePattern(page, 'lotus');
  await closeControls(page);
  await expect.poll(() => page.evaluate(() => window.__patternLabFrames.length)).toBeGreaterThan(beforeLotus);
  await expect(page.getByRole('button', { name: 'Live preview', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Live preview', exact: true })).toBeVisible();
  await expect.poll(() => controls.some(body => body.cancelStream)).toBe(true);
});
