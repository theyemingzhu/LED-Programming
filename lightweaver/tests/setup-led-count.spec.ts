import { test, expect, type Route } from '@playwright/test';

const CARD_ID = 'lw-setup-count';
const CARD_HOST = 'lightweaver.local';
const CARD_STATION_IP = '192.168.250.41';
const BUILD_ID = 'b'.repeat(40);
let countWrites: any[] = [];
let recoveryWrites: any[] = [];

function benchStatus() {
  return {
    app: 'Lightweaver',
    provisioningContractVersion: 1,
    cardId: CARD_ID,
    firmwareVersion: '1.4.0',
    buildId: BUILD_ID,
    buildNumber: 1446,
    bootId: 'boot-setup-count',
    runtimePhase: 'ready',
    knownGoodProject: true,
    commandReady: true,
    playbackReady: true,
    outputReady: true,
    provisionalSetup: true,
    projectId: 'lightweaver-bench-discovery-v1',
    projectRevision: 1,
    piece: { id: 'lightweaver-bench-discovery-v1', name: 'Lightweaver Bench Discovery' },
    led: { pixels: 256, type: 'WS2812B', colorOrder: 'GRB', maxMilliamps: 2000 },
    outputs: [{
      id: 'bench-18', pin: 18, gpio: 18, pixels: 256, count: 256,
      segments: [{ id: 'bench-18-full', count: 256, direction: 'forward' }],
    }],
    wifi: {
      transport: 'station', transition: 'station', transitionPending: false,
      stationIp: CARD_STATION_IP, ip: CARD_STATION_IP,
    },
  };
}

test.beforeEach(async ({ page }) => {
  const status = benchStatus();
  countWrites = [];
  recoveryWrites = [];
  const fulfillCard = (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/status' || pathname === '/api/firmware-info') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(status),
      });
    }
    if (pathname === '/api/recover-lights') {
      recoveryWrites.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          accepted: true,
          recovered: true,
          patternId: 'warm-white',
          appliedPatternId: 'warm-white',
          diagnostics: { rendered: true, frameSubmitted: true, nonBlackPixels: 41, brightnessByte: 140 },
        }),
      });
    }
    if (pathname === '/api/config') {
      const config = route.request().postDataJSON();
      countWrites.push(config);
      status.led = { ...status.led, ...config.led };
      status.outputs = config.led.outputs;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, saved: true, requiresReboot: false }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  };
  await page.route(`http://${CARD_HOST}/**`, fulfillCard);
  await page.route(`http://${CARD_STATION_IP}/**`, fulfillCard);
  await page.route('http://192.168.4.1/**', route => route.abort());
  await page.route('http://192.168.18.70/**', route => route.abort());
  await page.addInitScript(({ cardId, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: cardId, firmwareVersion, buildId,
    }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, status);

  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-workspace-heading')).toBeVisible();

  await page.evaluate(async ({ cardId, host, readiness }) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const link = getSharedCardLink();
    const card = {
      id: cardId,
      firmwareVersion: readiness.firmwareVersion,
      buildId: readiness.buildId,
    };
    const event = {
      type: 'card-verified',
      via: 'direct',
      host,
      card,
      expectedCard: card,
      readiness,
    };
    link.dispatch(event);
    link.dispatch(event);
  }, { cardId: CARD_ID, host: CARD_HOST, readiness: status });
});

test('Setup offers an empty LED count field on a find-my-strips card', async ({ page }) => {
  const count = page.getByTestId('setup-led-count');
  await expect(count).toBeVisible();
  await expect(count).toHaveValue('');
  await expect(page.getByTestId('setup-active-task')).not.toContainText('256');
  await expect(page.getByRole('button', { name: 'Use this count' })).toBeVisible();
});

test('typed LED count lights the strip and tells the owner to look', async ({ page }) => {
  await expect(page.getByTestId('setup-led-count')).toBeVisible();
  await page.getByTestId('setup-led-count').fill('41');
  await page.getByRole('button', { name: 'Use this count' }).click();
  await expect(page.getByTestId('setup-led-count-status')).toBeVisible();
  await expect(page.getByTestId('setup-led-count-status')).toHaveCount(1);
  await expect(page.getByTestId('setup-led-count-status')).toContainText(/41 lights are set.*Look at the strip/i);
  expect(countWrites).toHaveLength(1);
  expect(countWrites[0].led.outputs).toEqual([expect.objectContaining({ pin: 18, pixels: 41 })]);
  expect(recoveryWrites).toHaveLength(1);
  expect(recoveryWrites[0]).toEqual(expect.objectContaining({ patternId: 'warm-white' }));
  // The status stays on the current row; there is no other phase to browse
  // to and back from any more.
  await expect(page.getByTestId('setup-led-count-status')).toBeVisible();
  await expect(page.getByTestId('setup-led-count-status')).toHaveCount(1);
});
