import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { installHttpsStudio, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';

const CARD_ID = 'lw-aabbccddeeff';
const SSID = 'Gallery USB privacy sentinel';
const PASSWORD = 'Only-USB-secret-2819';
type Outcome = 'connected' | 'ssid-not-found' | 'authentication-failed' | 'unknown' | 'wrong-card' | 'wrong-status-card';

// Exercise the production HTTPS app and real newline USB transport. Only the
// physical ESP loader/port is replaced; signed firmware verification and
// commissioning/project persistence stay real.
async function openFreshInstaller(page: Page, request: any, outcome: Outcome = 'connected') {
  const manifest = await (await request.get('/firmware/release-manifest.json')).json();
  await installHttpsStudio(page, testBaseURL);
  await page.route(/http:\/\/(?:lightweaver\.local|192\.168\.)/, route => route.abort());
  await page.addInitScript(({ cardId, release, selectedOutcome }) => {
    localStorage.clear();
    sessionStorage.clear();
    (window as any).showSaveFilePicker = undefined;
    const state = { outcome: selectedOutcome, commands: [] as any[], flashWrites: [] as any[], opens: 0, closes: 0, provisionCount: 0, generation: 0, resetCount: 0 };
    (window as any).__usbWifiFixture = state;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let pending = '';
    let provisioned = false;
    let attemptId = '';
    const port: any = {
      readable: null, writable: null,
      open: async () => {
        state.opens += 1;
        port.readable = new ReadableStream({ start(value) { controller = value; } });
        port.writable = new WritableStream({ write(bytes) {
          pending += new TextDecoder().decode(bytes);
          while (pending.includes('\n')) {
            const index = pending.indexOf('\n');
            const line = pending.slice(0, index).trim();
            pending = pending.slice(index + 1);
            if (!line) continue;
            const message = JSON.parse(line);
            state.commands.push(message);
            if (message.command === 'provision') { provisioned = true; attemptId = message.id; state.provisionCount += 1; state.generation += 1; }
            const connected = provisioned && message.command === 'status' && state.outcome === 'connected';
            const failure = provisioned && message.command === 'status' && !connected ? state.outcome : '';
            const response = {
              protocol: 'lightweaver-usb-wifi', version: 1, id: message.id, command: message.command, ok: true,
              cardId: (state.outcome === 'wrong-card' || (state.outcome === 'wrong-status-card' && message.command === 'status')) ? 'lw-112233445566' : cardId,
              bootId: 'usb-wifi-boot-1', firmwareVersion: release.firmwareVersion, buildId: release.buildId, buildNumber: release.buildNumber,
              usbWifiProvisioning: true, attemptId,
              wifi: { transition: connected ? 'handoff-ready' : failure ? 'failed' : 'setup-ap', stationIp: connected ? '192.168.18.70' : '', handoffGeneration: state.generation,
                joinFailed: Boolean(failure), lastError: failure, failureReason: failure === 'unknown' ? 'connection_failed' : failure.replaceAll('-', '_'), driverReason: failure === 'ssid-not-found' ? 201 : failure === 'authentication-failed' ? 202 : 0, apActive: true },
              ...(message.command === 'scan' ? { scanning: false, networks: [{ ssid: 'Gallery scanned network', rssi: -42, secure: true }] } : {}),
            };
            controller.enqueue(new TextEncoder().encode(`${JSON.stringify(response)}\n`));
          }
        } });
      },
      close: async () => { state.closes += 1; },
      getInfo: () => ({ usbVendorId: 0x303a, usbProductId: 0x1001 }),
    };
    let activeHost = '192.168.18.70';
    let acked = false;
    const bridgeStats = { allowed: false, types: [] as string[], opens: [] as string[], acked: false };
    (window as any).__usbWifiBridge = bridgeStats;
    const bridgeStatus = () => ({
      app: 'Lightweaver', provisioningContractVersion: 1, cardId,
      firmwareVersion: release.firmwareVersion, buildId: release.buildId, buildNumber: release.buildNumber,
      bootId: 'usb-wifi-boot-1', runtimePhase: 'factory', mode: 'factory-flash', source: 'defaults',
      knownGoodProject: false, commandReady: false, outputReady: false,
      wifi: { transport: 'station', transition: acked ? 'station' : 'handoff-ready', transitionPending: !acked,
        apActive: !acked, stationIp: '192.168.18.70', ip: '192.168.18.70', handoffGeneration: state.generation },
    });
    const emit = (data: any) => {
      const event = new Event('message');
      Object.defineProperties(event, { data: { value: data }, origin: { value: `http://${activeHost}` }, source: { value: cardTab } });
      window.dispatchEvent(event);
    };
    const ready = () => emit({ app: 'LightweaverCardBridge', type: 'ready', version: 6, host: activeHost });
    const cardTab = {
      closed: false, focus() {},
      postMessage(message: any) {
        bridgeStats.types.push(message.type);
        let response: any = { ok: true };
        if (message.type === 'status') response = bridgeStatus();
        if (message.type === 'firmware-info') response = { app: 'Lightweaver', cardId, firmwareVersion: release.firmwareVersion, buildId: release.buildId, buildNumber: release.buildNumber, outputs: [] };
        if (message.type === 'wifi-handoff-ack') { acked = true; bridgeStats.acked = true; response = { ok: true, handoffGeneration: state.generation }; }
        queueMicrotask(() => emit({ app: 'LightweaverCardBridge', version: 6, id: message.id, ok: true, response }));
      },
      location: { set href(value: string) { activeHost = new URL(value).hostname; setTimeout(ready, 0); } },
    };
    window.open = ((url: string) => { if (!bridgeStats.allowed) return null; activeHost = new URL(url).hostname; bridgeStats.opens.push(activeHost); setTimeout(ready, 0); return cardTab; }) as any;
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { getPorts: async () => [port] } });
    (window as any).__LW_FIND_INSTALL_CARD_FOR_TEST__ = async () => ({
      connection: {
        loader: {
          writeFlash: async (options: any) => {
            state.flashWrites.push({ eraseAll: options.eraseAll, addresses: options.fileArray.map((file: any) => file.address) });
            options.reportProgress(0, 1, 1);
          },
          after: async () => { state.resetCount += 1; },
        },
        transport: { device: port, disconnect: async () => true },
      },
      hardware: { cardId, chipName: 'ESP32-S3', chipDescription: 'ESP32-S3', flashSize: '16MB', flashBytes: 16 * 1024 * 1024 },
    });
  }, { cardId: CARD_ID, release: manifest, selectedOutcome: outcome });
  await page.goto(`${STUDIO_ORIGIN}/#screen=flash&mode=install`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Find connected card', exact: true }).click();
  await expect(page.getByTestId('install-card-identity')).toContainText(CARD_ID);
}
async function fillWifi(page: Page) {
  await page.getByTestId('usb-wifi-ssid').fill(SSID);
  await page.getByTestId('usb-wifi-password').fill(PASSWORD);
}
async function install(page: Page) {
  await page.getByRole('checkbox', { name: 'I understand this will erase everything currently stored on this card.' }).check();
  await page.getByRole('button', { name: 'Erase card and install Lightweaver', exact: true }).click();
}
async function serialCommands(page: Page) { return page.evaluate(() => (window as any).__usbWifiFixture.commands); }

test('fresh installer accepts Wi-Fi locally before any erase and keeps the setup-page fallback', async ({ page, request }) => {
  await openFreshInstaller(page, request);
  await expect(page.getByTestId('usb-wifi-setup')).toBeVisible();
  await expect(page.getByLabel('Wi-Fi network name')).toBeVisible();
  await expect(page.getByLabel('Wi-Fi password')).toHaveAttribute('type', 'password');
  await fillWifi(page);
  expect(await serialCommands(page)).toEqual([]);
  expect(await page.evaluate(() => (window as any).__usbWifiFixture.flashWrites)).toEqual([]);
  await expect(page.getByTestId('usb-wifi-setup')).toContainText('setup page remains available as a fallback');
  await page.screenshot({ path: '/tmp/lightweaver-usb-wifi-before-install.png', fullPage: true });
});

test('Wi-Fi credentials never enter browser storage, exported projects, HTTP requests, or console output', async ({ page, request }) => {
  const requests: string[] = [];
  const logs: string[] = [];
  page.on('request', value => requests.push(`${value.url()} ${value.postData() || ''}`));
  page.on('console', value => logs.push(value.text()));
  page.on('pageerror', value => logs.push(value.message));
  await openFreshInstaller(page, request);
  await fillWifi(page);
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  const file = await exported;
  const filePath = await file.path();
  expect(filePath).toBeTruthy();
  const project = await readFile(filePath!, 'utf8');
  await install(page);
  await expect(page.locator('[data-post-flash="station"]')).toContainText('192.168.18.70');
  const saved = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  for (const sensitive of [SSID, PASSWORD]) {
    expect(saved).not.toContain(sensitive);
    expect(project).not.toContain(sensitive);
    expect(requests.join('\n')).not.toContain(sensitive);
    expect(logs.join('\n')).not.toContain(sensitive);
  }
  const commands = await serialCommands(page);
  const provision = commands.filter((value: any) => value.command === 'provision');
  expect(provision).toHaveLength(1);
  expect(provision[0]).toMatchObject({ ssid: SSID, password: PASSWORD, expectedCardId: CARD_ID, expectedBootId: 'usb-wifi-boot-1' });
  expect(commands[0].command).toBe('hello');
  expect(await page.evaluate(() => (window as any).__usbWifiFixture.flashWrites)).toEqual([{ eraseAll: true, addresses: [0] }]);
});

for (const [outcome, explanation] of [
  ['ssid-not-found', /not found|could not find/i],
  ['authentication-failed', /authentication/i],
  ['unknown', /unknown|did not report|could not determine/i],
] as const) {
  test(`USB stays available to correct ${outcome} without another firmware erase`, async ({ page, request }) => {
    await openFreshInstaller(page, request, outcome);
    await fillWifi(page);
    await install(page);
    await expect(page.getByTestId('usb-wifi-status')).toContainText(explanation);
    if (outcome === 'ssid-not-found') await page.screenshot({ path: '/tmp/lightweaver-usb-wifi-failure.png', fullPage: true });
    if (outcome !== 'authentication-failed') await expect(page.getByTestId('usb-wifi-status')).not.toContainText(/wrong password/i);
    expect(await page.evaluate(() => (window as any).__usbWifiFixture.closes)).toBe(0);
    await expect(page.getByTestId('usb-wifi-password')).toHaveValue('');
    await page.evaluate(() => { (window as any).__usbWifiFixture.outcome = 'connected'; });
    await fillWifi(page);
    await expect(page.getByRole('button', { name: 'Join Wi-Fi over USB', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Join Wi-Fi over USB', exact: true }).click();
    await expect(page.locator('[data-post-flash="station"]')).toContainText('192.168.18.70');
    expect(await page.evaluate(() => (window as any).__usbWifiFixture.flashWrites.length)).toBe(1);
    expect((await serialCommands(page)).filter((value: any) => value.command === 'provision')).toHaveLength(2);
  });
}

test('a different runtime card receives no credentials and cannot claim Wi-Fi setup success', async ({ page, request }) => {
  await openFreshInstaller(page, request, 'wrong-card');
  await fillWifi(page);
  await install(page);
  await expect(page.getByTestId('usb-wifi-status')).toContainText(/different|identity|match/i);
  expect((await serialCommands(page)).filter((value: any) => value.command === 'provision')).toEqual([]);
  await expect(page.getByTestId('usb-wifi-status')).not.toContainText(/joined.*verified|verified.*joined/i);
});

test('USB handoff-ready reaches final exact-card station proof through the local card page', async ({ page, request }) => {
  await openFreshInstaller(page, request);
  await fillWifi(page);
  await install(page);
  await expect(page.locator('[data-post-flash="station"]')).toContainText('192.168.18.70');
  await expect(page.getByRole('heading', { name: 'Check lights' })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/lightweaver-usb-wifi-station.png', fullPage: true });
  await page.evaluate(() => { (window as any).__usbWifiBridge.allowed = true; });
  await page.getByRole('button', { name: 'Open the card at 192.168.18.70', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__usbWifiBridge.acked)).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const link = await import('/src/lib/cardLink.js');
    const state = link.getCardLinkState();
    return { verified: state.handoffStationVerified, cardId: state.card?.id, host: state.host, bootId: state.validatedBootId };
  })).toEqual({ verified: true, cardId: CARD_ID, host: '192.168.18.70', bootId: 'usb-wifi-boot-1' });
  await expect(page.getByRole('button', { name: 'Restore saved project', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__usbWifiBridge.types.filter((type: string) => type === 'wifi-handoff-ack').length)).toBe(1);
  await page.screenshot({ path: '/tmp/lightweaver-usb-wifi-verified.png', fullPage: true });
});

test('network scan selects a card-observed SSID and fallback releases USB for the card setup page', async ({ page, request }) => {
  await openFreshInstaller(page, request);
  await install(page);
  await expect(page.getByTestId('usb-wifi-status')).toContainText('Exact card and firmware verified');
  await page.getByRole('button', { name: 'Scan nearby networks', exact: true }).click();
  await page.getByLabel('Nearby Wi-Fi networks').selectOption('0');
  await expect(page.getByTestId('usb-wifi-ssid')).toHaveValue('Gallery scanned network');
  await page.getByRole('button', { name: 'Use card setup page instead', exact: true }).click();
  await expect(page.locator('[data-post-flash="inconclusive"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'I’ve joined Lightweaver-EEFF', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__usbWifiFixture.closes)).toBe(1);
  expect((await serialCommands(page)).filter((value: any) => value.command === 'provision')).toEqual([]);
});

test('a swapped card status cannot turn an accepted USB credential write into a completed setup', async ({ page, request }) => {
  await openFreshInstaller(page, request, 'wrong-status-card');
  await fillWifi(page);
  await install(page);
  await expect(page.getByTestId('usb-wifi-status')).toContainText('different card or firmware build');
  expect((await serialCommands(page)).filter((value: any) => value.command === 'provision')).toHaveLength(1);
  await expect(page.locator('[data-post-flash="station"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore saved project', exact: true })).toHaveCount(0);
});

test('USB Wi-Fi form stays usable on a narrow browser viewport', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshInstaller(page, request);
  await fillWifi(page);
  const form = page.getByTestId('usb-wifi-setup');
  await expect(form).toBeVisible();
  expect(await form.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const input = await page.getByTestId('usb-wifi-password').boundingBox();
  expect(input!.height).toBeGreaterThanOrEqual(44);
  expect(input!.x + input!.width).toBeLessThanOrEqual(390);
  await form.screenshot({ path: '/tmp/lightweaver-usb-wifi-narrow.png' });
});
