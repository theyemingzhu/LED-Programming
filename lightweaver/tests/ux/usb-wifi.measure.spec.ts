// Measure: Wi-Fi setup over USB for a fresh card (fixtures copied from
// tests/fresh-install-usb-wifi.spec.ts: Web Serial stub, bridge stub, HTTPS Studio).
// The 'connected' outcome. Variant usb-wifi = blank card (needs the firmware install first);
// usb-wifi-current = blank card already running the official firmware.
import { test, expect, type Page } from '@playwright/test';
import { installHttpsStudio, STUDIO_ORIGIN } from '../harness/bridgeTransport';
import { guardRealCard, recordJourney, WIDTHS } from './journeyRecorder';
import { testBaseURL } from '../testPort.mjs';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

const CARD_ID = 'lw-aabbccddeeff';
const SSID = 'Gallery USB privacy sentinel';
const PASSWORD = 'Only-USB-secret-2819';
type Outcome = 'connected' | 'ssid-not-found' | 'authentication-failed' | 'unknown' | 'wrong-card' | 'wrong-status-card' | 'wrong-bridge-card' | 'lost-response' | 'already-configured' | 'already-configured-early';

test.afterEach(async ({ page }) => {
  // A navigation can still be loading a Studio module when the test's final
  // assertion completes. Drain the HTTPS proxy routes before Playwright closes
  // the page; `wait` keeps real route errors visible instead of ignoring them.
  await page.unrouteAll({ behavior: 'wait' });
});

// Exercise the production HTTPS app and real newline USB transport. Only the
// physical ESP loader/port is replaced; signed firmware verification and
// commissioning/project persistence stay real.
async function openFreshInstaller(page: Page, request: any, outcome: Outcome = 'connected', { currentInstalled = false, preservingSameBuild = false, skipFind = false, inspectionReadError = false, startHash = '#screen=flash&mode=install' } = {}) {
  await guardRealCard(page); // BEFORE any fixture install
  const manifest = await (await request.get('/firmware/release-manifest.json')).json();
  await installHttpsStudio(page, testBaseURL);
  await page.route(/http:\/\/(?:lightweaver\.local|192\.168\.)/, route => route.abort());
  await page.addInitScript(({ cardId, release, selectedOutcome, currentInstalled, preservingSameBuild, inspectionReadError }) => {
    if (!sessionStorage.getItem('__LW_USB_WIFI_FIXTURE_READY__')) {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem('__LW_USB_WIFI_FIXTURE_READY__', '1');
    }
    (window as any).showSaveFilePicker = undefined;
    if (preservingSameBuild) {
      (window as any).__LW_PRESERVING_UPDATE_FIXTURE__ = {
        card: { id: cardId, cardId, firmwareVersion: release.firmwareVersion,
          buildId: release.buildId, buildNumber: release.buildNumber },
        readiness: { cardId, bootId: 'usb-wifi-boot-1', firmwareVersion: release.firmwareVersion,
          buildId: release.buildId, buildNumber: release.buildNumber,
          capabilities: { firmwareUpdate: { version: 1, network: true, softwareGrant: true } } },
      };
      (window as any).__LW_LOAD_UPDATE_RELEASE_FOR_TEST__ = async () => ({ manifest: release });
    }
    const state = { outcome: selectedOutcome, commands: [] as any[], flashWrites: [] as any[], opens: 0, closes: 0, disconnects: 0, provisionCount: 0, generation: 0, resetCount: 0 };
    (window as any).__usbWifiFixture = state;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let pending = '';
    let attemptId = sessionStorage.getItem('__LW_USB_WIFI_FIXTURE_ATTEMPT__') || '';
    let provisioned = Boolean(attemptId);
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
            if (message.command === 'provision') { provisioned = true; attemptId = message.id; sessionStorage.setItem('__LW_USB_WIFI_FIXTURE_ATTEMPT__', attemptId); state.provisionCount += 1; state.generation += 1; }
            const connected = ['already-configured', 'already-configured-early'].includes(state.outcome)
              || (provisioned && message.command === 'status' && ['connected', 'lost-response', 'wrong-bridge-card'].includes(state.outcome));
            const failure = provisioned && message.command === 'status' && !connected ? state.outcome : '';
            const response = {
              protocol: 'lightweaver-usb-wifi', version: 1, id: message.id, command: message.command, ok: true,
              cardId: (state.outcome === 'wrong-card' || (state.outcome === 'wrong-status-card' && message.command === 'status')) ? 'lw-112233445566' : cardId,
              bootId: 'usb-wifi-boot-1', firmwareVersion: release.firmwareVersion, buildId: release.buildId, buildNumber: release.buildNumber,
              usbWifiProvisioning: true, freshInstallEligible: !connected, attemptId,
              wifi: { transition: connected ? 'handoff-ready' : failure ? 'failed' : 'setup-ap', stationIp: connected && state.outcome !== 'already-configured-early' ? '192.168.18.70' : '', handoffGeneration: attemptId ? Math.max(state.generation, 1) : 0,
                joinFailed: Boolean(failure), lastError: failure, failureReason: failure === 'unknown' ? 'connection_failed' : failure.replaceAll('-', '_'), driverReason: failure === 'ssid-not-found' ? 201 : failure === 'authentication-failed' ? 202 : 0, apActive: true },
              ...(message.command === 'scan' ? { scanning: false, networks: [{ ssid: 'Gallery scanned network', rssi: -42, secure: true }] } : {}),
            };
            if (message.command === 'provision' && state.outcome === 'lost-response') continue;
            controller.enqueue(new TextEncoder().encode(`${JSON.stringify(response)}\n`));
          }
        } });
      },
      close: async () => { state.closes += 1; },
      getInfo: () => ({ usbVendorId: 0x303a, usbProductId: 0x1001 }),
    };
    let activeHost = '192.168.18.70';
    let acked = false;
    const bridgeStats = { allowed: false, captureAttempts: sessionStorage.getItem('__LW_CAPTURE_WINDOW_ATTEMPTS__') === '1',
      types: [] as string[], opens: [] as string[], openUrls: [] as string[], attempts: [] as string[], acked: false,
      holdInspectReadback: false, heldResponses: [] as any[], candidate: false };
    (window as any).__usbWifiBridge = bridgeStats;
    const bridgeStatus = () => ({
      app: 'Lightweaver', provisioningContractVersion: 1,
      cardId: state.outcome === 'wrong-bridge-card' ? 'lw-112233445566' : cardId,
      firmwareVersion: release.firmwareVersion, buildId: release.buildId, buildNumber: release.buildNumber,
      bootId: 'usb-wifi-boot-1', runtimePhase: 'factory', mode: 'factory-flash', source: 'defaults',
      knownGoodProject: false, commandReady: false, outputReady: false,
      configValid: false, outputs: [], projectId: '', projectFingerprint: '', projectRevision: 0,
      wifi: { transport: 'station', transition: acked ? 'station' : 'handoff-ready', transitionPending: !acked,
        apActive: !acked, stationIp: '192.168.18.70', ip: '192.168.18.70', handoffGeneration: state.generation },
    });
    const emit = (data: any) => {
      const event = new Event('message');
      Object.defineProperties(event, { data: { value: data }, origin: { value: `http://${activeHost}` }, source: { value: cardTab } });
      window.dispatchEvent(event);
    };
    (bridgeStats as any).releaseHeldResponses = () => {
      bridgeStats.holdInspectReadback = false;
      for (const response of bridgeStats.heldResponses.splice(0)) emit(response);
    };
    const ready = () => emit({ app: 'LightweaverCardBridge', type: 'ready', version: 6, host: activeHost });
    const cardTab = {
      closed: false, focus() {},
      postMessage(message: any) {
        bridgeStats.types.push(message.type);
        let response: any = { ok: true };
        if (message.type === 'status') response = bridgeStatus();
        if (message.type === 'firmware-info') response = { app: 'Lightweaver', cardId, firmwareVersion: release.firmwareVersion, buildId: release.buildId, buildNumber: release.buildNumber, outputs: [] };
        if (message.type === 'wiring-status') response = {
          app: 'Lightweaver', cardId, firmwareVersion: release.firmwareVersion, buildId: release.buildId, buildNumber: release.buildNumber,
          state: bridgeStats.candidate ? 'staged' : 'factory', hasCandidate: bridgeStats.candidate,
          activationId: bridgeStats.candidate ? 'fixture_candidate_123456' : '', outputs: [],
        };
        if (message.type === 'wifi-handoff-ack') { acked = true; bridgeStats.acked = true; response = { ok: true, handoffGeneration: state.generation }; }
        if (message.type === 'status' && bridgeStats.holdInspectReadback
          && Object.values(JSON.parse(localStorage.getItem('lw_card_commissioning_registry_v2') || '{}').flows || {})
            .some((entry: any) => Boolean(entry.flow.cardAcknowledgedAt))) {
          bridgeStats.heldResponses.push({ app: 'LightweaverCardBridge', version: 6, id: message.id, ok: true, response });
          return;
        }
        queueMicrotask(() => emit({ app: 'LightweaverCardBridge', version: 6, id: message.id, ok: true, response }));
      },
      location: { set href(value: string) { activeHost = new URL(value).hostname; setTimeout(ready, 0); } },
    };
    window.open = ((url: string) => { bridgeStats.openUrls.push(String(url)); if (!bridgeStats.allowed) { if (bridgeStats.captureAttempts) bridgeStats.attempts.push(String(url)); return null; } activeHost = new URL(url).hostname; if (bridgeStats.captureAttempts) bridgeStats.attempts.push(activeHost); bridgeStats.opens.push(activeHost); setTimeout(ready, 0); return cardTab; }) as any;
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { getPorts: async () => [port], requestPort: async () => port } });
    (window as any).__LW_FIND_INSTALL_CARD_FOR_TEST__ = async () => ({
      probeCurrentRuntime: currentInstalled,
      connection: {
        loader: {
          ...(inspectionReadError ? { readFlash: async () => { throw new Error('simulated USB read failure'); } } : {}),
          writeFlash: async (options: any) => {
            state.flashWrites.push({ eraseAll: options.eraseAll, addresses: options.fileArray.map((file: any) => file.address) });
            options.reportProgress(0, 1, 1);
          },
          after: async () => { state.resetCount += 1; },
        },
        transport: { device: port, disconnect: async () => { state.disconnects += 1; return true; } },
      },
      hardware: { cardId, chipName: 'ESP32-S3', chipDescription: 'ESP32-S3', flashSize: '16MB', flashBytes: 16 * 1024 * 1024 },
    });
  }, { cardId: CARD_ID, release: manifest, selectedOutcome: outcome, currentInstalled, preservingSameBuild, inspectionReadError });
  await page.goto(`${STUDIO_ORIGIN}/${startHash}`, { waitUntil: 'domcontentloaded' });
  if (skipFind) return;
  await page.getByRole('button', { name: 'Find connected card', exact: true }).click();
  if (currentInstalled) {
    await expect(page.getByRole('heading', { name: /Connect to Wi-Fi|Set up/i })).toBeVisible();
  } else await expect(page.getByTestId('install-card-identity')).toContainText(CARD_ID);
}

async function controls(page: Page) {
  return page.locator('button:visible, a[href]:visible, input:visible, summary:visible').evaluateAll(els => els.map(e => ((e as HTMLElement).getAttribute('aria-label') || (e as HTMLElement).textContent || (e as HTMLInputElement).placeholder || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60));
}

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    for (const variant of ['blank', 'current'] as const) {
      test(`usb wifi ${variant} @${vp.width}`, async ({ page, request }) => {
        test.setTimeout(240_000);
        const currentInstalled = variant === 'current';
        await openFreshInstaller(page, request, 'connected', { currentInstalled, skipFind: true, startHash: '' });
        const j = recordJourney(page, variant === 'blank' ? 'usb-wifi' : 'usb-wifi-current', vp.width);
        try {
          await page.waitForTimeout(2500);
          await j.land('opens led.mandalacodes.com on a fresh browser');
          await j.press(page.getByRole('button', { name: 'Card software', exact: true }), 'Card software');
          await j.press(page.getByRole('button', { name: 'Find connected card', exact: true }), 'Find connected card (USB)');
          if (currentInstalled) await expect(page.getByTestId('usb-wifi-setup')).toBeVisible({ timeout: 20000 });
          else await expect(page.getByTestId('install-card-identity')).toContainText(CARD_ID, { timeout: 20000 });
          await page.waitForTimeout(800);
          await j.land('card found');
          j.note(`controls: ${(await controls(page)).join(' | ')}`);
          await j.type(page.getByTestId('usb-wifi-ssid'), SSID, 'Type Wi-Fi network name');
          await j.type(page.getByTestId('usb-wifi-password'), PASSWORD, 'Type Wi-Fi password');
          if (!currentInstalled) {
            await j.press(page.getByRole('checkbox', { name: 'I understand this will erase everything currently stored on this card.' }), 'Tick: I understand this will erase the card');
            await page.getByRole('checkbox', { name: 'I understand this will erase everything currently stored on this card.' }).check();
            await j.press(page.getByRole('button', { name: 'Erase card and install Lightweaver', exact: true }), 'Erase card and install Lightweaver');
          } else {
            await j.press(page.getByRole('button', { name: 'Join Wi-Fi over USB' }), 'Join Wi-Fi over USB');
          }
          await expect(page.locator('[data-post-flash="station"]')).toContainText('192.168.18.70', { timeout: 30000 });
          await page.waitForTimeout(800);
          await j.land('card joined Wi-Fi');
          j.note(`controls: ${(await controls(page)).join(' | ')}`);
          await page.evaluate(() => { (window as any).__usbWifiBridge.allowed = true; });
          await j.press(page.getByRole('button', { name: 'Open the card at 192.168.18.70', exact: true }), 'Open the card at 192.168.18.70');
          if (currentInstalled) {
            await expect(page).toHaveURL(/#screen=discovery/, { timeout: 20000 });
          } else {
            // A freshly flashed card offers 'Restore saved project' next (the flow flashed with a project to restore).
            const restore = page.getByRole('button', { name: 'Restore saved project', exact: true });
            await expect(restore).toBeEnabled({ timeout: 20000 });
            await page.waitForTimeout(800);
            await j.land('card verified on the LAN; Restore saved project offered');
            j.note(`controls: ${(await controls(page)).join(' | ')}`);
            await j.press(restore, 'Restore saved project');
            await page.waitForTimeout(4000);
            j.note(`after restore url: ${page.url()}`);
          }
          await page.waitForTimeout(1200);
          await j.land('end of Wi-Fi setup');
          j.note(`flash writes: ${JSON.stringify(await page.evaluate(() => (window as any).__usbWifiFixture.flashWrites))}; provision count ${await page.evaluate(() => (window as any).__usbWifiFixture.provisionCount)}`);
        } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
        await j.finish();
      });
    }
  });
}
