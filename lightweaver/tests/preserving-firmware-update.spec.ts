import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, type CardStateSpec } from './harness/cardStates';
import { installHttpsStudio, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';

const CARD_ID = 'lw-b0fe81f61b44';
const OLD_BUILD = '1'.repeat(40);
const TARGET_BUILD = '2'.repeat(40);
const HEAD = 'a'.repeat(64);
const FINGERPRINT = 'b'.repeat(64);

// grantProbe stands in for `probeFirmwareUpdateGrantService`'s answer. Every
// scenario here defaults to 'ready' so existing assertions about the
// software-authorization path keep exercising it exactly as before; F12's
// own scenario passes 'blocked' to get the truthful default this fixture
// would otherwise short-circuit past — see lw-flash.jsx's DEV branch, which
// never performs a real fetch under `npx vite` and so cannot be driven by
// mocking /api/library/session directly.
async function openPreservingFixture(page: any, mode: 'wifi' | 'usb', outcome = 'progress', capabilityShape = 'current', { returnHash = '', grantProbe = 'ready' }: { returnHash?: string, grantProbe?: 'ready' | 'blocked' } = {}) {
  if (outcome === 'reload-disconnected' || outcome === 'in-place-disconnect') {
    const exactRestartedStatus = {
      app: 'Lightweaver', provisioningContractVersion: 1,
      cardId: CARD_ID, bootId: 'boot-new', projectHead: HEAD, projectFingerprint: FINGERPRINT,
      projectId: 'recovered-project', projectRevision: 7,
      firmwareVersion: '1.2.0', buildId: TARGET_BUILD, buildNumber: 1300,
      runtimePhase: 'ready', knownGoodProject: true, commandReady: true,
      outputReady: true, playbackReady: true,
    };
    await page.route('http://lightweaver.local/api/status', route => route.fulfill({ json: exactRestartedStatus }));
    await page.route('http://lightweaver.local/api/update/status', route => route.fulfill({ json: { phase: 'idle' } }));
  }
  await page.addInitScript(({ mode, outcome, capabilityShape, cardId, oldBuild, targetBuild, head, fingerprint, returnHash, grantProbe }) => {
    localStorage.clear();
    sessionStorage.clear();
    (window as any).__LW_GRANT_PROBE_RESULT_FOR_TEST__ = grantProbe === 'blocked'
      ? { state: 'unavailable', reason: 'no-session-service' }
      : { state: 'ready', reason: '' };
    // Stands in for whatever real surface (footer chip, Connection Center,
    // Setup) took the owner into this update: those callers call
    // rememberCardReturnIntent before routing here, and this fixture models
    // that already having happened for the working screen under test.
    if (returnHash) {
      sessionStorage.setItem('lw_card_return_intent_v1', JSON.stringify({ hash: returnHash, cardId }));
    }
    const imageBytes = new Uint8Array([0xe9, 1, 2]);
    const recovering = outcome === 'reload-valid';
    const disconnectedRecovery = outcome === 'reload-disconnected';
    (window as any).__LW_PRESERVING_UPDATE_FIXTURE__ = {
      ...(disconnectedRecovery ? {} : {
      ...(mode === 'usb' ? { mode } : {}),
      card: { id: cardId, cardId, firmwareVersion: recovering ? '1.2.0' : '1.1.1', buildId: recovering ? targetBuild : oldBuild, buildNumber: recovering ? 1300 : 1198 },
      readiness: {
        cardId, bootId: recovering ? 'boot-new' : 'boot-old', projectHead: head, projectFingerprint: fingerprint,
        firmwareVersion: recovering ? '1.2.0' : '1.1.1', buildId: recovering ? targetBuild : oldBuild,
        firmwareUpdate: { phase: recovering ? 'valid' : 'idle', rollbackReason: '' },
        ...(outcome === 'blank-ready' ? { runtimePhase: 'factory', configValid: false, knownGoodProject: false, commandReady: false, playbackReady: false, firmwareUpdateReady: true, projectId: '', projectHead: '', projectFingerprint: '' } : {}),
        ...(capabilityShape === 'current'
          ? { capabilities: { firmwareUpdate: { version: 1, network: mode === 'wifi', softwareGrant: mode === 'wifi' } } }
          : capabilityShape === 'network-physical'
            ? { capabilities: { firmwareUpdate: { version: 1, network: mode === 'wifi' } } }
          : { firmwareUpdate: { version: 1, network: mode === 'wifi' } }),
      },
      }),
    };
    if (recovering || disconnectedRecovery) sessionStorage.setItem('lw_firmware_update_session_v1', JSON.stringify({
      version: 1, cardId, previousBootId: 'boot-old', expectedProjectHead: head,
      expectedProjectFingerprint: fingerprint, targetFirmwareVersion: '1.2.0',
      targetBuildId: targetBuild, targetBuildNumber: 1300, ticketSha256: '4'.repeat(64),
      phase: disconnectedRecovery ? 'valid' : 'restarting', acknowledgedBytes: 3,
    }));
    (window as any).__LW_LOAD_UPDATE_RELEASE_FOR_TEST__ = async () => ({
      manifest: { target: 'esp32-s3-n16r8', firmwareVersion: '1.2.0', buildId: targetBuild, buildNumber: 1300 },
      ticket: {
        schemaVersion: 1, target: 'esp32-s3-n16r8', firmwareVersion: '1.2.0', buildId: targetBuild, buildNumber: 1300,
        image: { size: 3, sha256: '0'.repeat(64) },
        partition: { layout: 'default_16MB.csv', tableSha256: '3'.repeat(64), app0Offset: 0x10000, app1Offset: 0x650000, slotSize: 0x640000 },
        compatibility: { minimumBootstrapBuild: 1198 }, preservation: { dataPartitionsIncluded: false },
      },
      ticketBytes: new Uint8Array([1]), ticketSha256: '4'.repeat(64), ticketSignature: new Uint8Array(64), imageBytes,
    });
    (window as any).__LW_UPDATE_READ_STATUS_CALLS__ = 0;
    (window as any).__LW_PRESERVING_RECONNECT_TIMEOUT_MS__ = outcome === 'reload-disconnected' ? 800 : 75;
    (window as any).__LW_RUN_PRESERVING_USB_BOOTSTRAP_FOR_TEST__ = async ({ onProgress }: any) => {
      onProgress({ phase: 'updating', progress: 1 });
      onProgress({ phase: 'verifying', progress: 1 });
      if (outcome === 'usb-verifying') await new Promise(() => {});
      return { ok: true };
    };
    (window as any).__LW_CREATE_FIRMWARE_UPDATER_FOR_TEST__ = ({ onProgress }: any) => {
      const saveExactSession = (phase: string) => sessionStorage.setItem('lw_firmware_update_session_v1', JSON.stringify({
        version: 1, cardId, previousBootId: 'boot-old', expectedProjectHead: head,
        expectedProjectFingerprint: fingerprint, targetFirmwareVersion: '1.2.0',
        targetBuildId: targetBuild, targetBuildNumber: 1300, ticketSha256: '4'.repeat(64),
        phase, acknowledgedBytes: phase === 'preflight' ? 0 : 3,
      }));
      return ({
      preflight: async () => {
        if (outcome === 'http-400') throw Object.assign(new Error('owner binding is incomplete'), {
          status: 400, code: 'owner binding is incomplete',
        });
        saveExactSession('preflight');
        onProgress({ phase: 'preflight', acknowledgedBytes: 0, totalBytes: 3 });
      },
      begin: async () => {
        saveExactSession('sending');
        onProgress({ phase: 'sending', acknowledgedBytes: 0, totalBytes: 3 });
        if (outcome === 'pause-sending') await new Promise(() => {});
      },
      send: async () => { onProgress({ phase: 'sending', acknowledgedBytes: 3, totalBytes: 3 }); },
      commit: async () => {
        saveExactSession('restarting');
        if (outcome === 'in-place-disconnect') (window as any).__LW_PRESERVING_UPDATE_FIXTURE__ = null;
        onProgress({ phase: 'restarting', acknowledgedBytes: 3, totalBytes: 3 });
      },
      readStatus: async () => {
        (window as any).__LW_UPDATE_READ_STATUS_CALLS__ += 1;
        const status = outcome === 'rollback'
          ? { phase: 'rolled-back', restoredBuildNumber: 1198, rollbackReason: 'boot-health-failed' }
          : { phase: 'pending-reboot', receivedBytes: 3 };
        onProgress(status);
        return status;
      },
      });
    };
  }, { mode, outcome, capabilityShape, cardId: CARD_ID, oldBuild: OLD_BUILD, targetBuild: TARGET_BUILD, head: HEAD, fingerprint: FINGERPRINT, returnHash, grantProbe });
  await page.goto('/#screen=card&section=install', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', {
    name: capabilityShape === 'legacy' ? 'Install Lightweaver' : 'Update Lightweaver',
  })).toBeVisible({ timeout: 15_000 });
}

async function openPreservingUsbWifiFixture(page: any, { eligible = true, wrongCard = false, wrongBuild = false,
  staleBoot = false, noHello = false, wrongRomCard = false, savedAttempt = false, savedUpdate = true,
  savedPhase = 'restarting', bootstrapFailure = false, emptyPriorBoot = false, missedHelloReplies = 0, failedJoinStage = '', rebootOnReopen = false,
  scanBusyReplies = 0, scanAlwaysBusy = false, scanDeadlineMs = 0 }: { eligible?: boolean, wrongCard?: boolean, wrongBuild?: boolean,
  staleBoot?: boolean, noHello?: boolean, wrongRomCard?: boolean, savedAttempt?: boolean,
  savedUpdate?: boolean, savedPhase?: string, bootstrapFailure?: boolean, emptyPriorBoot?: boolean, missedHelloReplies?: number, failedJoinStage?: string, rebootOnReopen?: boolean,
  scanBusyReplies?: number, scanAlwaysBusy?: boolean, scanDeadlineMs?: number } = {}) {
  await page.addInitScript(({ cardId, oldBuild, targetBuild, eligible, wrongCard, wrongBuild, staleBoot, noHello, wrongRomCard, savedAttempt, savedUpdate, savedPhase, bootstrapFailure, emptyPriorBoot, missedHelloReplies, failedJoinStage, rebootOnReopen, scanBusyReplies, scanAlwaysBusy, scanDeadlineMs }) => {
    if (scanDeadlineMs) (window as any).__LW_USB_WIFI_SCAN_DEADLINE_MS_FOR_TEST__ = scanDeadlineMs;
    if (!sessionStorage.getItem('__LW_PRESERVING_USB_WIFI_FIXTURE__')) {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem('__LW_PRESERVING_USB_WIFI_FIXTURE__', '1');
      if (savedUpdate) sessionStorage.setItem('lw_firmware_update_session_v1', JSON.stringify({
        version: 1, mode: 'usb', cardId, previousBootId: emptyPriorBoot ? '' : 'boot-old', expectedProjectHead: '',
        expectedProjectFingerprint: '', targetFirmwareVersion: '1.2.0', targetBuildId: targetBuild,
        targetBuildNumber: 1300, ticketSha256: '4'.repeat(64), phase: savedPhase, acknowledgedBytes: 3,
        ...(savedAttempt ? { usbWifiAttempt: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', bootId: 'boot-new', generation: null } } : {}),
      }));
    }
    (window as any).__LW_PRESERVING_UPDATE_FIXTURE__ = {
      mode: 'usb', card: { id: cardId, cardId, firmwareVersion: '1.1.1', buildId: oldBuild, buildNumber: 1198,
        source: 'usb-flash', chipName: 'ESP32-S3', flashBytes: 16 * 1024 * 1024 },
      readiness: { cardId, bootId: 'boot-old', firmwareVersion: '1.1.1', buildId: oldBuild,
        runtimePhase: 'factory', configValid: false, knownGoodProject: false, commandReady: false,
        outputReady: false, firmwareUpdateReady: true,
        capabilities: { firmwareUpdate: { version: 1, network: false, softwareGrant: false } } },
    };
    (window as any).__LW_LOAD_UPDATE_RELEASE_FOR_TEST__ = async () => ({
      manifest: { target: 'esp32-s3-n16r8', firmwareVersion: '1.2.0', buildId: targetBuild, buildNumber: 1300 },
      ticket: { schemaVersion: 1, target: 'esp32-s3-n16r8', firmwareVersion: '1.2.0', buildId: targetBuild, buildNumber: 1300,
        image: { size: 3, sha256: '0'.repeat(64) },
        partition: { layout: 'default_16MB.csv', tableSha256: '3'.repeat(64), app0Offset: 0x10000, app1Offset: 0x650000, slotSize: 0x640000 },
        compatibility: { minimumBootstrapBuild: 1198 }, preservation: { dataPartitionsIncluded: false } },
      ticketBytes: new Uint8Array([1]), ticketSha256: '4'.repeat(64), ticketSignature: new Uint8Array(64), imageBytes: new Uint8Array([0xe9, 1, 2]),
    });
    (window as any).__LW_RUN_PRESERVING_USB_BOOTSTRAP_FOR_TEST__ = async ({ onProgress }: any) => {
      if (bootstrapFailure) {
        onProgress({ phase: 'updating', progress: 1 });
        throw Object.assign(new Error('Invalid head packet 0x45'), { code: 'usb-update-verification-unknown' });
      }
      return { ok: true };
    };
    const state = { opens: 0, closes: 0, requests: [] as any[], provisions: 0, romConnects: 0, resets: 0, hellos: 0, scanBusyReplies };
    (window as any).__preservingUsbWifi = state;
    let appReady = !['sending', 'verification-unknown'].includes(savedPhase);
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let requestBuffer = '';
    let requestDecoder = new TextDecoder();
    const initial = JSON.parse(sessionStorage.getItem('lw_firmware_update_session_v1') || 'null')?.usbWifiAttempt;
    let attemptId = initial?.id || '';
    let generation = attemptId ? 1 : 0;
    let bootId = 'boot-new';
    const port: any = {
      readable: null, writable: null,
      open: async () => {
        if (!appReady) throw new Error('Card is still in ROM loader');
        if (rebootOnReopen && state.opens > 0) { bootId = 'boot-reopened'; attemptId = ''; generation = 0; }
        state.opens += 1;
        requestBuffer = '';
        requestDecoder = new TextDecoder();
        port.readable = new ReadableStream({ start(value) { controller = value; } });
        port.writable = new WritableStream({ write(bytes) {
          requestBuffer += requestDecoder.decode(bytes, { stream: true });
          const newline = requestBuffer.indexOf('\n');
          if (newline < 0) return;
          const request = JSON.parse(requestBuffer.slice(0, newline));
          requestBuffer = requestBuffer.slice(newline + 1);
          state.requests.push(request);
          if (request.command === 'hello') state.hellos += 1;
          if (request.command === 'hello' && state.hellos <= missedHelloReplies) return;
          if (noHello && request.command === 'hello') return;
          if (request.command === 'provision') { state.provisions += 1; attemptId = request.id; generation += 1; }
          const scanBusy = request.command === 'scan' && (scanAlwaysBusy || state.scanBusyReplies > 0);
          if (scanBusy && !scanAlwaysBusy) state.scanBusyReplies -= 1;
          const reply = {
            protocol: 'lightweaver-usb-wifi', version: 1, id: request.id, command: request.command,
            ok: !scanBusy, ...(scanBusy ? { error: 'busy' } : {}), cardId: wrongCard ? 'lw-112233445566' : cardId,
            bootId: staleBoot ? 'boot-old' : bootId, firmwareVersion: '1.2.0',
            buildId: wrongBuild ? oldBuild : targetBuild, buildNumber: 1300,
            usbWifiProvisioning: true, freshInstallEligible: eligible, attemptId,
            wifi: { transition: attemptId ? 'handoff-ready' : 'setup-ap', stationIp: attemptId && !failedJoinStage ? '192.168.18.70' : '',
              handoffGeneration: generation, joinFailed: Boolean(failedJoinStage && request.command === 'status'),
              ...(failedJoinStage && request.command === 'status' ? { failureReason: 'connection_failed', failureStage: failedJoinStage,
                driverReason: 0, lastError: 'router did not assign an IP address' } : {}) },
            ...(request.command === 'scan' ? { scanning: false, networks: [{ ssid: 'Gallery network', secure: true, rssi: -43 }] } : {}),
          };
          controller.enqueue(new TextEncoder().encode(`${JSON.stringify(reply)}\n`));
        } });
      },
      close: async () => { state.closes += 1; },
    };
    (window as any).__preservingUsbPort = port;
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => port } });
    (window as any).__LW_CONNECT_ESP_FOR_TEST__ = async () => {
      state.romConnects += 1;
      return {
        loader: {
          chip: { CHIP_NAME: 'ESP32-S3', readMac: async () => wrongRomCard ? '11:22:33:44:55:66' : '44:1b:f6:81:fe:b0' },
          detectFlashSize: async () => '16MB',
          writeReg: async () => { state.resets += 1; },
        },
        transport: { device: port, setDTR: async () => {}, disconnect: async () => { appReady = true; } },
        chip: 'ESP32-S3',
      };
    };
    (window as any).__LW_FIND_INSTALL_CARD_FOR_TEST__ = async () => ({
      connection: { loader: {}, transport: { device: port, disconnect: async () => true } },
      hardware: { cardId, chipName: 'ESP32-S3', flashSize: '16MB', flashBytes: 16 * 1024 * 1024,
        source: 'usb-flash', firmwareVersion: '1.1.1', buildId: oldBuild, buildNumber: 1198 },
    });
  }, { cardId: CARD_ID, oldBuild: OLD_BUILD, targetBuild: TARGET_BUILD, eligible, wrongCard, wrongBuild,
    staleBoot, noHello, wrongRomCard, savedAttempt, savedUpdate, savedPhase, bootstrapFailure, emptyPriorBoot, missedHelloReplies, failedJoinStage, rebootOnReopen,
    scanBusyReplies, scanAlwaysBusy, scanDeadlineMs });
  await page.goto('/#screen=card&section=install', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('preserving-update-panel')).toBeVisible({ timeout: 15_000 });
}

test('[preserving-usb-wifi] a verified preserving USB write continues through fresh exact-card Wi-Fi setup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreservingUsbWifiFixture(page, { savedUpdate: false });
  await page.getByRole('button', { name: 'Find connected card' }).click();
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update once over USB' }).click();
  await panel.getByRole('checkbox', { name: /selected USB card.*lw-b0fe81f61b44/i }).check();
  await panel.getByRole('button', { name: 'Start preserving update' }).click();
  const form = page.getByTestId('usb-wifi-setup');
  await expect(form.getByTestId('usb-wifi-status')).toContainText('Exact card and firmware verified');
  await form.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/lightweaver-preserving-usb-wifi-narrow.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await form.getByTestId('usb-wifi-ssid').fill('Gallery network');
  await form.getByTestId('usb-wifi-password').fill('gallerypass123');
  await form.getByRole('button', { name: 'Join Wi-Fi over USB' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__preservingUsbWifi.provisions)).toBe(1);
  expect(await page.evaluate(async () => (await import('/src/lib/cardCommissioningFlow.js')).readCardCommissioning())).toBeNull();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('gallerypass123');
});

test('[preserving-usb-wifi-copy] one Wi-Fi heading keeps help available without repeating the firmware step', async ({ page }) => {
  await openPreservingUsbWifiFixture(page);
  await page.getByTestId('preserving-usb-wifi-resume').click();
  const form = page.getByTestId('usb-wifi-setup');
  await expect(form).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connect to Wi-Fi', exact: true })).toHaveCount(1);
  await expect(form.locator('h2')).toHaveCount(0);
  await expect(page.getByText('Firmware updated', { exact: true })).toBeVisible();
  const details = form.locator('.usb-wifi-help').first();
  await expect(details).not.toHaveAttribute('open');
  await expect(details.getByText(/32 bytes/)).toBeHidden();
  await details.locator('summary').click();
  await expect(details.getByText(/32 bytes/)).toBeVisible();
  await expect(form.getByLabel('Wi-Fi network name')).toBeVisible();
  await expect(form.getByLabel('Wi-Fi password', { exact: true })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Show Wi-Fi password' })).toBeVisible();
  await expect(form.getByRole('checkbox', { name: /open network/ })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Scan nearby networks' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Use card setup page instead' })).toBeVisible();
  await page.screenshot({ path: '/tmp/lightweaver-preserving-wifi-copy-2107.png', fullPage: true });
});

test('[preserving-usb-wifi-scan] busy scan retries the same session and returns nearby networks', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { scanBusyReplies: 2 });
  await page.getByTestId('preserving-usb-wifi-resume').click();
  const form = page.getByTestId('usb-wifi-setup');
  await form.getByRole('button', { name: 'Scan nearby networks' }).click();
  await expect(form.getByRole('combobox', { name: 'Nearby Wi-Fi networks' })).toContainText('Gallery network');
  await expect(form.getByTestId('usb-wifi-status')).toContainText('Choose a network below');
  const state = await page.evaluate(() => (window as any).__preservingUsbWifi);
  const scans = state.requests.filter((request: any) => request.command === 'scan');
  expect(scans).toHaveLength(3);
  expect(scans.every((request: any) => request.refresh === true)).toBe(true);
  expect(state.opens).toBe(1);
  expect(state.provisions).toBe(0);
});

test('[preserving-usb-wifi-scan] persistent busy ends with a retry action and sends no credentials', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { scanAlwaysBusy: true, scanDeadlineMs: 1400 });
  await page.getByTestId('preserving-usb-wifi-resume').click();
  const form = page.getByTestId('usb-wifi-setup');
  await form.getByRole('button', { name: 'Scan nearby networks' }).click();
  await expect(form.getByTestId('usb-wifi-status')).toContainText('Card is busy. Try scanning again');
  await expect(form.getByRole('button', { name: 'Scan nearby networks' })).toBeEnabled();
  const state = await page.evaluate(() => (window as any).__preservingUsbWifi);
  const scans = state.requests.filter((request: any) => request.command === 'scan');
  expect(scans.length).toBeGreaterThan(1);
  expect(scans.every((request: any) => request.refresh === true)).toBe(true);
  expect(state.provisions).toBe(0);
});

test('[preserving-usb-wifi] a configured card is not offered USB Wi-Fi mutation after update', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { eligible: false });
  await page.getByTestId('preserving-usb-wifi-resume').click();
  await expect(page.getByTestId('preserving-update-panel')).toContainText('already has Wi-Fi or a project');
  await expect(page.getByTestId('usb-wifi-setup')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.requests.map((request: any) => request.command))).toEqual(['hello']);
});

test('[preserving-usb-wifi] a different card cannot resume the saved update over USB', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { wrongCard: true });
  await page.getByTestId('preserving-usb-wifi-resume').click();
  await expect(page.getByTestId('preserving-update-panel').getByRole('alert')).toContainText('different card or firmware build');
  await expect(page.getByTestId('usb-wifi-setup')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.provisions)).toBe(0);
});

test('[preserving-usb-wifi] reload resumes the saved exact attempt without resending credentials', async ({ page }) => {
  // The card can mark Wi-Fi proven before Studio gets the provision reply.
  // A read-only status reconciliation must still work when new writes are no
  // longer eligible.
  await openPreservingUsbWifiFixture(page, { savedAttempt: true, eligible: false });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('preserving-usb-wifi-resume').click();
  await expect.poll(() => page.evaluate(() => (window as any).__preservingUsbWifi.requests.map((request: any) => request.command)))
    .toEqual(['hello', 'status']);
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.provisions)).toBe(0);
  expect(await page.evaluate(async () => (await import('/src/lib/cardCommissioningFlow.js')).readCardCommissioning())).toBeNull();
});

test('[preserving-usb-wifi] a failed saved attempt shows safe card diagnostics without resending credentials', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { savedAttempt: true, failedJoinStage: 'ip' });
  await page.getByTestId('preserving-usb-wifi-resume').click();
  const form = page.getByTestId('usb-wifi-setup');
  await expect(form.getByTestId('usb-wifi-status')).toHaveText('The card could not complete the connection. It did not report a specific cause.');
  const details = form.getByTestId('usb-wifi-failure-details');
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  await expect(details).toContainText('Stage: ip');
  await expect(details).toContainText('Driver reason: 0');
  await expect(details).toContainText('Card note: router did not assign an IP address');
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.provisions)).toBe(0);
});

test('[preserving-usb-wifi] same-form attempt check keeps the live USB session and failure details', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { failedJoinStage: 'association', rebootOnReopen: true });
  await page.getByTestId('preserving-usb-wifi-resume').click();
  const form = page.getByTestId('usb-wifi-setup');
  await expect(form.getByTestId('usb-wifi-status')).toContainText('Exact card and firmware verified');
  await form.getByTestId('usb-wifi-ssid').fill('Gallery network');
  await form.getByTestId('usb-wifi-password').fill('gallerypass123');
  await form.getByRole('button', { name: 'Join Wi-Fi over USB' }).click();
  await expect(form.getByTestId('usb-wifi-failure-details')).toBeVisible();
  const before = await page.evaluate(() => ({
    opens: (window as any).__preservingUsbWifi.opens,
    closes: (window as any).__preservingUsbWifi.closes,
    provisions: (window as any).__preservingUsbWifi.provisions,
  }));
  await form.getByRole('button', { name: /^(Reconnect USB setup|Check current attempt)$/ }).click();
  await expect(form.getByTestId('usb-wifi-failure-details')).toBeVisible();
  await expect(form.getByTestId('usb-wifi-status')).not.toContainText('another Wi-Fi attempt');
  expect(await page.evaluate(() => ({
    opens: (window as any).__preservingUsbWifi.opens,
    closes: (window as any).__preservingUsbWifi.closes,
    provisions: (window as any).__preservingUsbWifi.provisions,
  }))).toEqual(before);
});

test('[usb-unknown-recovery] legacy sending session with no old boot resets exact ROM card and verifies target runtime without a second write', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { savedPhase: 'sending', emptyPriorBoot: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel).toContainText('Not verified after USB transfer');
  await expect(panel.getByRole('button', { name: 'Update once over USB' })).toHaveCount(0);
  await expect(page.getByTestId('footer-firmware-status')).toContainText('unknown');
  await panel.getByTestId('preserving-usb-wifi-resume').click();
  await expect(page.getByTestId('usb-wifi-setup')).toBeVisible();
  await expect(page.getByTestId('usb-wifi-status')).toContainText('Exact card and firmware verified');
  await expect(page.getByTestId('footer-firmware-status')).toContainText('USB verified');
  await expect(page.getByTestId('footer-firmware-status')).not.toContainText('unknown');
  await expect(page.getByTestId('card-link-status')).not.toHaveText(/Connected/);
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.romConnects)).toBe(1);
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.resets)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.requests.map((request: any) => request.command))).toEqual(['hello']);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('lw_firmware_update_session_v1') || 'null')?.phase)).toBe('restarting');
});

test('[usb-unknown-recovery] retries a lost early hello on the same selected card while startup finishes', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { savedPhase: 'sending', emptyPriorBoot: true, missedHelloReplies: 1 });
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByTestId('preserving-usb-wifi-resume').click();
  await expect(panel.getByTestId('preserving-usb-wifi-resume')).toHaveText('Checking card…');
  await expect(page.getByTestId('usb-wifi-status')).toContainText('Exact card and firmware verified', { timeout: 20_000 });
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.requests.map((request: any) => request.command))).toEqual(['hello', 'hello']);
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.provisions)).toBe(0);
});

test('[usb-unknown-recovery] failed readback blocks repeat update immediately on the same page', async ({ page }) => {
  await openPreservingUsbWifiFixture(page, { savedUpdate: false, bootstrapFailure: true });
  await page.getByRole('button', { name: 'Find connected card' }).click();
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update once over USB' }).click();
  await panel.getByRole('checkbox', { name: /selected USB card.*lw-b0fe81f61b44/i }).check();
  await panel.getByRole('button', { name: 'Start preserving update' }).click();
  await expect(panel).toContainText('Not verified after USB transfer');
  await expect(panel.getByRole('button', { name: 'Start preserving update' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Update once over USB' })).toHaveCount(0);
  await expect(panel.getByTestId('preserving-usb-wifi-resume')).toHaveText('Check running firmware over USB');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('lw_firmware_update_session_v1') || 'null')?.phase)).toBe('verification-unknown');
  expect(await page.evaluate(() => (window as any).__preservingUsbWifi.provisions)).toBe(0);
});

for (const scenario of ['wrong-rom-card', 'old-build', 'stale-boot', 'no-hello'] as const) {
  test(`[usb-unknown-recovery] ${scenario} cannot claim update or send credentials`, async ({ page }) => {
    await openPreservingUsbWifiFixture(page, { savedPhase: 'sending',
      wrongRomCard: scenario === 'wrong-rom-card', wrongBuild: scenario === 'old-build',
      staleBoot: scenario === 'stale-boot', noHello: scenario === 'no-hello' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const panel = page.getByTestId('preserving-update-panel');
    await panel.getByTestId('preserving-usb-wifi-resume').click();
    await expect(panel.getByRole('alert')).toContainText(/unknown|different card/i);
    await expect(page.getByTestId('footer-firmware-status')).not.toContainText('USB verified');
    await expect(panel).toContainText('Not verified after USB transfer');
    await expect(page.getByTestId('usb-wifi-setup')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__preservingUsbWifi.provisions)).toBe(0);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('lw_firmware_update_session_v1') || 'null')?.phase)).toBe('sending');
  });
}

test('preserving update: capable card uses Wi-Fi with exact preservation facts and acknowledged phases', async ({ page }) => {
  await openPreservingFixture(page, 'wifi');
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel.getByRole('button', { name: 'Update over Wi-Fi' })).toBeVisible();
  await expect(panel).toContainText(CARD_ID);
  await expect(panel).toContainText('1.1.1 · Build 1198');
  await expect(panel).toContainText('1.2.0 · Build 1300');
  await expect(panel).toContainText(HEAD);
  await expect(panel).toContainText('Keeps Wi-Fi, project, patterns, wiring, and settings');
  await expect(panel).not.toContainText(/SSID|password|flash address|partition/i);
  await expect(page.getByRole('button', { name: 'Find connected card' })).toHaveCount(0);

  const updateAction = panel.getByRole('button', { name: 'Update over Wi-Fi' });
  const targetBuild = panel.getByText('1.2.0 · Build 1300');
  await expect(updateAction).toHaveClass(/btn-lg/);
  const targetBox = await targetBuild.boundingBox();
  const actionBox = await updateAction.boundingBox();
  expect(targetBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.y).toBeGreaterThan(targetBox!.y + targetBox!.height);
  await updateAction.click();
  await expect(panel).toContainText('securely binds this signed update to this exact card');
  await expect(panel.getByRole('checkbox', { name: /physically confirmed/i })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Start secure Wi-Fi update' }).click();
  await expect(panel).toContainText('Restarting card');
});

test('preserving update: a legacy top-level capability cannot unlock network firmware update', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'progress', 'legacy');
  await expect(page.getByRole('button', { name: 'Update over Wi-Fi' })).toHaveCount(0);
});

test('preserving update: an older network-capable card retains the one-button bootstrap path', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'progress', 'network-physical');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await expect(panel).toContainText('Briefly press BOOT/control once');
  await expect(panel.getByRole('checkbox', { name: /physically confirmed/i })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Start secure Wi-Fi update' })).toHaveCount(0);
  await panel.getByRole('checkbox', { name: /physically confirmed/i }).check();
  await panel.getByRole('button', { name: 'Start preserving update' }).click();
  await expect(panel).toContainText('Restarting card');
});

test('preserving update: a software-capable card keeps the physical fallback available', async ({ page }) => {
  await openPreservingFixture(page, 'wifi');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await panel.getByRole('button', { name: 'Use card button instead' }).click();
  await expect(panel).toContainText('Briefly press BOOT/control once');
  await expect(panel.getByRole('checkbox', { name: /physically confirmed/i })).toBeVisible();
  await panel.getByRole('button', { name: 'Use secure software authorization' }).click();
  await expect(panel.getByRole('button', { name: 'Start secure Wi-Fi update' })).toBeVisible();
});

// F12: a Studio origin with no grant service at all — the dev server's own
// GET /api/library/session answers a deliberate 204 stub and its
// POST /api/library/firmware-update-grant answers 404 {"error":{"code":
// "not_found", ...}} (the same shape a card-hosted Studio's unmatched routes
// return). The panel must never offer software authorization as if it could
// work here — the card-button path is the only one shown, already primary,
// with a truthful explanation instead of a dead "Start secure Wi-Fi update"
// button that would fail with a bare "API route not found".
test('preserving update: an origin with no grant service defaults to the card-button path, not a dead software offer', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'progress', 'current', { grantProbe: 'blocked' });
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();

  // The card-button path is offered immediately and is the primary action —
  // never gated behind a "Use card button instead" click, because there is
  // no working software alternative to fall back from.
  await expect(panel).toContainText('Briefly press BOOT/control once');
  const primaryAction = panel.getByRole('button', { name: 'Start preserving update' });
  await expect(primaryAction).toBeVisible();
  await expect(primaryAction).toHaveClass(/btn-lg/);

  // The software path is not offered at all — not as the primary action,
  // and not as a "use it instead" fallback button either.
  await expect(panel.getByRole('button', { name: 'Start secure Wi-Fi update' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Use secure software authorization' })).toHaveCount(0);

  const blocked = panel.getByTestId('software-grant-blocked');
  await expect(blocked).toBeVisible();
  await expect(blocked).toContainText('no software authorisation service');
  await expect(blocked).toContainText('local or card-hosted');
  await expect(blocked).toContainText('card button');
  // This is not the owner-sign-in copy — signing in would not fix a route
  // that does not exist, and offering that button here would be a lie.
  await expect(blocked).not.toContainText('owner sign-in');
  await expect(blocked.getByRole('button', { name: 'Open owner sign-in' })).toHaveCount(0);
  await expect(blocked.getByRole('button', { name: 'Check again' })).toBeVisible();
});

test('preserving update: Wi-Fi panel surfaces the card response detail for a rejected request', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'http-400');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await panel.getByRole('button', { name: 'Start secure Wi-Fi update' }).click();
  await expect(panel.getByRole('alert')).toHaveText('owner binding is incomplete');
  await expect(panel.getByRole('alert')).not.toContainText('Card returned HTTP 400');
});

test('preserving update: rollback names the restored build and a redacted reason', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'rollback');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await panel.getByRole('button', { name: 'Start secure Wi-Fi update' }).click();
  await expect(panel).toContainText('Update rolled back');
  await expect(panel).toContainText('restored Build 1198');
  await expect(panel).toContainText('boot-health-failed');
  expect(await page.evaluate(() => (window as any).__LW_UPDATE_READ_STATUS_CALLS__)).toBeGreaterThan(0);
});

test('preserving update: reload resumes redacted state and shows valid only after exact correlation', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'reload-valid');
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel).toContainText(`Reconnected to Card ${CARD_ID} on firmware 1.2.0 · Build 1300`);
});

test('preserving update: the continue button returns the owner to the task an update interrupted', async ({ page }) => {
  // The owner was on Playlist when they entered this update (from the footer
  // chip, Connection Center, or Setup — every one of those callers records
  // this before routing here). Once the card is verified back on the target
  // build, the panel offers exactly one button, and it must go home instead
  // of always defaulting to Patterns.
  await openPreservingFixture(page, 'wifi', 'reload-valid', 'current', { returnHash: '#screen=playlist' });
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel).toContainText(`Reconnected to Card ${CARD_ID} on firmware 1.2.0 · Build 1300`);
  const continueButton = panel.getByTestId('preserving-update-continue');
  await expect(continueButton).toHaveText('Back to Playlist');
  await continueButton.click();
  await expect(page).toHaveURL(/#screen=playlist$/);
  // Pressed once, spent once: a second visit to this update must not still
  // offer a stale destination from the last interruption.
  expect(await page.evaluate(() => sessionStorage.getItem('lw_card_return_intent_v1'))).toBeNull();
});

test('preserving update: with nothing remembered, the continue button falls back to Patterns', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'reload-valid');
  const panel = page.getByTestId('preserving-update-panel');
  const continueButton = panel.getByTestId('preserving-update-continue');
  await expect(continueButton).toHaveText('Open Patterns');
  await continueButton.click();
  await expect(page).toHaveURL(/#screen=pattern$/);
});

test('preserving update: a Wi-Fi reboot self-heals from exact runtime-known-good evidence', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'reload-disconnected');
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel).toContainText(`Reconnected to Card ${CARD_ID} on firmware 1.2.0 · Build 1300`);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('lw_firmware_update_session_v1'))).toBeNull();
  const recoveredLink = await page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const state = getSharedCardLink().getState();
    return {
      cardId: state.readiness?.cardId,
      bootId: state.validatedBootId || state.readiness?.bootId,
      projectHead: state.readiness?.projectHead,
      projectFingerprint: state.readiness?.projectFingerprint,
      firmwareVersion: state.readiness?.firmwareVersion,
      buildId: state.readiness?.buildId,
    };
  });
  expect(recoveredLink).toEqual({
    cardId: CARD_ID,
    bootId: 'boot-new',
    projectHead: HEAD,
    projectFingerprint: FINGERPRINT,
    firmwareVersion: '1.2.0',
    buildId: TARGET_BUILD,
  });
});

test('preserving update: navigation cannot discard an active update lifecycle or reopen controls', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'pause-sending');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await panel.getByRole('button', { name: 'Start secure Wi-Fi update' }).click();
  await expect(panel).toContainText('Sending signed update');
  // A percentage inside a sentence is a number; the rail is the thing an owner
  // can watch move, which is what "is this stuck?" actually asks. It must be a
  // real progressbar carrying the position, and it must still print the byte
  // count it is derived from — the rail never shows a figure Studio was not
  // given.
  const sending = panel.getByTestId('preserving-update-progress');
  await expect(sending.getByRole('progressbar')).toHaveAttribute('aria-valuenow', /^\d+$/);
  await expect(sending).toContainText('acknowledged by the card');

  await page.getByRole('button', { name: 'Layout' }).click();
  await expect(page).toHaveURL(/screen=layout/);
  const footer = page.getByTestId('card-link-status');
  await expect(footer).toHaveAccessibleName(/Updating card/);
  await footer.click();
  await expect(page.getByRole('dialog', { name: /connect lightweaver/i })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /controls/i })).toHaveCount(0);
});

test('preserving update: an in-place disconnect retains the new session and self-heals through the real coordinator', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'in-place-disconnect');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await panel.getByRole('button', { name: 'Start secure Wi-Fi update' }).click();
  await expect(panel).toContainText(`Reconnected to Card ${CARD_ID} on firmware 1.2.0 · Build 1300`);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('lw_firmware_update_session_v1'))).toBeNull();
});

test('preserving update: an already healthy exact card clears stale restart evidence outside the update route', async ({ page }) => {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  const status = await page.evaluate(async ({ cardId, targetBuild }) => {
    const { createDefaultProject, migrateProject } = await import('/src/lib/projectModel.js');
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const project = createDefaultProject();
    project.id = 'stale-session-project';
    project.name = 'Stale session project';
    const migratedProject = migrateProject(project);
    const fingerprint = cardProjectFingerprint(migratedProject);
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lw_autosave_v3', JSON.stringify(migratedProject));
    localStorage.setItem('lw_autosave_v3_backup', JSON.stringify(migratedProject));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: cardId, firmwareVersion: '1.1.13', buildId: targetBuild,
    }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    sessionStorage.setItem('lw_firmware_update_session_v1', JSON.stringify({
      version: 1, cardId, previousBootId: 'boot-before-update',
      expectedProjectHead: '', expectedProjectFingerprint: fingerprint,
      targetFirmwareVersion: '1.1.13', targetBuildId: targetBuild,
      targetBuildNumber: 1286, ticketSha256: '4'.repeat(64),
      phase: 'pending-reboot', acknowledgedBytes: 3,
    }));
    return {
      app: 'Lightweaver', provisioningContractVersion: 1, cardId,
      bootId: 'boot-after-update', firmwareVersion: '1.1.13', buildId: targetBuild, buildNumber: 1286,
      projectId: project.id, projectRevision: 0, projectHead: '', projectFingerprint: fingerprint,
      runtimePhase: 'ready', knownGoodProject: true, commandReady: true,
      outputReady: true, playbackReady: true, provisionalSetup: false,
      firmwareUpdate: { phase: 'idle' },
    };
  }, { cardId: CARD_ID, targetBuild: TARGET_BUILD });
  await page.route('http://lightweaver.local/api/status', route => route.fulfill({ json: status }));
  await page.route('http://lightweaver.local/api/firmware-info', route => route.fulfill({ json: status }));
  // The query change forces a new document so the app boots from the project
  // and recovery session written above instead of retaining the first mount.
  await page.goto('/?stale-recovery=1#screen=card&section=support', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async freshStatus => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const event = {
      type: 'card-verified', via: 'direct', host: 'lightweaver.local',
      card: { id: freshStatus.cardId, firmwareVersion: freshStatus.firmwareVersion, buildId: freshStatus.buildId },
      expectedCard: { id: freshStatus.cardId, firmwareVersion: freshStatus.firmwareVersion, buildId: freshStatus.buildId },
      readiness: freshStatus,
    };
    getSharedCardLink().dispatch(event);
    getSharedCardLink().dispatch(event);
  }, status);

  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('lw_firmware_update_session_v1'))).toBeNull();
  await expect(page.getByTestId('card-link-status')).toHaveAccessibleName(/Connected/);
});

test('preserving update: older card offers one USB bootstrap and separates factory reset', async ({ page }) => {
  await openPreservingFixture(page, 'usb');
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel.getByRole('button', { name: 'Update once over USB' })).toBeVisible();
  await expect(panel).toContainText('Future updates use Wi-Fi');
  await expect(panel).not.toContainText(/erase all|flash address|choose.*file/i);
  const recovery = page.getByText('Factory reset and reinstall', { exact: true });
  await expect(recovery).toBeVisible();
  await recovery.click();
  await expect(page.getByText(/permanently removes Wi-Fi, projects, patterns, wiring, and settings/i)).toBeVisible();
});

test('preserving update: completed USB send visibly acknowledges readback verification', async ({ page }) => {
  await openPreservingFixture(page, 'usb', 'usb-verifying');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update once over USB' }).click();
  await expect(panel).not.toContainText('Briefly press BOOT');
  await panel.getByRole('checkbox', { name: /selected USB card.*lw-b0fe81f61b44/i }).check();
  await panel.getByRole('button', { name: 'Start preserving update' }).click();
  const phaseStatus = panel.locator('.install-release.ready[role="status"]');
  await expect(phaseStatus).toHaveText('Upload complete · checking the saved update');
  await expect(phaseStatus).not.toContainText('Sending signed update');
});

test('preserving update: USB reset ends with an actionable bounded reconnect failure', async ({ page }) => {
  await openPreservingFixture(page, 'usb', 'usb-timeout');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update once over USB' }).click();
  await panel.getByRole('checkbox', { name: /selected USB card.*lw-b0fe81f61b44/i }).check();
  await panel.getByRole('button', { name: 'Start preserving update' }).click();
  await expect(panel.getByRole('alert')).toContainText(/could not verify the restarted card/i);
  await expect(panel).not.toContainText('Restarting card');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('lw_firmware_update_session_v1') || 'null')?.phase)).toBe('restarting');
});


test('preserving update: a blank card with explicit update readiness can start without a project', async ({ page }) => {
  await openPreservingFixture(page, 'wifi', 'blank-ready');
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await panel.getByRole('button', { name: 'Start secure Wi-Fi update' }).click();
  await expect(panel).toContainText('Restarting card');
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// F34/F35 — Adrian, live site, 2026-09-09, Studio build 1777, card
// lw-b0fe81f61b44 firmware 1548. The identity row and the footer chip both
// read Connected with an exact "1548 → 1759" build diff, and pressing
// "Update card" still opened on "Studio can't reach the Lightweaver card it
// remembers" stacked above the destructive USB eraser — never the preserving
// Wi-Fi panel. "This is the problem. I'm often on the wrong doors... When I
// open it up and click card, I should always be on the right door."
//
// Root cause, confirmed against the real card with `curl` (both direct-read
// and, separately, through the app): `cardSupportsNetworkFirmwareUpdate`
// (firmwareUpdatePlan.js) additionally requires the live
// `readiness.firmwareUpdateReady !== false` bit — the real card answers this
// false while otherwise `runtimePhase: 'ready'`, `commandReady: true`,
// `knownGoodProject: true` and fully commissioned, so the preserving door
// never resolved and the timeout gate further down eventually printed a
// false "can't reach" over a card the footer, at the same instant, correctly
// called Connected. No fixture had this shape — every existing card
// simulator response omits `firmwareUpdateReady` entirely (reads as `true`)
// — so this suite's own default left the gap invisible.
//
// This runs on the https lane (same technique as journey-continuity.spec.ts's
// J33/J33b) so `canPushDirectlyToCard()` is genuinely false and the only way
// the screen can resolve without a false "can't reach" is by reading the
// SAME connectedness the footer chip reads, over the SAME direct link.
// ---------------------------------------------------------------------------
async function seedKnownRealCard(page: import('@playwright/test').Page) {
  await page.addInitScript(({ id }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id, firmwareVersion: '1.1.32', buildId: 'f'.repeat(40),
    }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: CARD_ID });
}

/** Models the real lw-b0fe81f61b44 exactly as it answered live on 2026-09-09:
 * fully ready and commissioned, but `firmwareUpdateReady: false`. */
function realCardOlderBuildSpec(): CardStateSpec & { firmwareUpdateReady: boolean } {
  return {
    ...cardState('installed-match'),
    firmwareUpdateReady: false,
  };
}

test('[factory-ota-door] an exact factory AP card ready for firmware update opens the preserving panel', async ({ page }) => {
  await stubWebSerialSupport(page);
  const spec = {
    ...cardState('factory-blank'),
    runtimePhase: 'factory', commandReady: false, firmwareUpdateReady: true,
  };
  const card = createCardSimulator(spec, { cardId: CARD_ID });
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  await page.addInitScript(({ id }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id, firmwareVersion: '1.1.1', buildId: '1'.repeat(40),
    }));
    localStorage.setItem('lw_chip_card_host', '192.168.4.1');
  }, { id: CARD_ID });

  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=install`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('preserving-update-panel')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Update Lightweaver' })).toBeVisible();
  await expect(page.getByText('Erase card and install Lightweaver')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find connected card' })).toHaveCount(0);

  let preflightCalls = 0;
  await page.route('http://192.168.4.1/api/owner/capability', route => route.fulfill({ json: {
    capability: 'simulated-owner-capability', cardId: CARD_ID, bootId: card.state.bootId,
    expiresInMs: 60000,
  } }));
  await page.route('http://192.168.4.1/api/update/preflight', route => {
    preflightCalls += 1;
    return route.fulfill({ status: 409, json: { error: 'simulated-stop-before-write' } });
  });
  const statusReadsBeforeStart = card.requests.filter(request => request.method === 'GET' && request.path === '/api/status').length;
  const panel = page.getByTestId('preserving-update-panel');
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await panel.getByRole('checkbox', { name: /physically confirmed/i }).check();
  await panel.getByRole('button', { name: 'Start preserving update' }).click();
  await expect.poll(() => preflightCalls).toBe(1);
  expect(card.requests.filter(request => request.method === 'GET' && request.path === '/api/status').length)
    .toBeGreaterThan(statusReadsBeforeStart);
  await expect(panel).toContainText('simulated-stop-before-write');
  await expect(panel.getByTestId('preserving-update-usb-after-error')).toBeVisible();
});

test('[factory-card-home-update] Update card opens the preserving step while ordinary install keeps unfinished Wi-Fi', async ({ page }) => {
  await stubWebSerialSupport(page);
  const card = createCardSimulator({
    ...cardState('factory-blank'), runtimePhase: 'factory', commandReady: false, firmwareUpdateReady: true,
  }, { cardId: CARD_ID });
  await card.install(page);
  await page.addInitScript(({ id }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion: '1.1.1', buildId: '1'.repeat(40) }));
    localStorage.setItem('lw_chip_card_host', '192.168.4.1');
  }, { id: CARD_ID });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ id }) => {
    const api = await import('/src/lib/cardCommissioningFlow.js');
    const projectRecord = { id: 'factory-home-project', project: { id: 'factory-home-project', name: 'Factory home project' } };
    const flow = api.completeCardInstall(api.beginCardCommissioning({
      source: 'web-serial', operation: 'install-current-release', strategy: 'clean-recovery',
      projectRecord, projectRevision: 1, flowId: 'flow-factory-home-123456789', now: Date.now() - 1000,
    }), { operation: 'install-current-release', cardId: id, firmwareVersion: '1.1.1', buildId: '1'.repeat(40) });
    await api.writeCardCommissioning(flow, { locks: null });
  }, { id: CARD_ID });
  const release = page.getByTestId('fact-release');
  await expect(release.getByRole('button', { name: 'Update card' })).toBeVisible({ timeout: 15000 });
  await release.getByRole('button', { name: 'Update card' }).click();
  await expect(page.getByTestId('preserving-update-panel')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Update Lightweaver' })).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/lib/cardCommissioningFlow.js')).readCardCommissioning()?.stage)).toBe('set-up-card');
  await page.evaluate(() => { window.location.hash = '#screen=card&section=overview'; });
  await expect(page.getByTestId('fact-release')).toBeVisible();
  await expect(page).not.toHaveURL(/intent=update-card/);
  await page.evaluate(() => { window.location.hash = '#screen=card&section=install'; });
  await expect(page.getByRole('heading', { name: 'Set up card' })).toBeVisible();
});

test('[factory-ota-direct-unavailable] a bridge-proven factory card keeps the preserving USB exit when direct update transport fails', async ({ page }) => {
  await stubWebSerialSupport(page);
  const card = createCardSimulator({
    ...cardState('factory-blank'), runtimePhase: 'factory', commandReady: false, firmwareUpdateReady: true,
  }, { cardId: CARD_ID });
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  await page.addInitScript(({ id }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id }));
    localStorage.setItem('lw_chip_card_host', '192.168.4.1');
  }, { id: CARD_ID });
  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=install`, { waitUntil: 'domcontentloaded' });
  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel).toBeVisible({ timeout: 15000 });
  await panel.getByRole('button', { name: 'Update over Wi-Fi' }).click();
  await panel.getByRole('checkbox', { name: /physically confirmed/i }).check();
  await page.route('http://192.168.4.1/api/status', route => route.abort());
  await panel.getByRole('button', { name: 'Start preserving update' }).click();
  await expect(panel.getByRole('alert')).toContainText('cannot reach this card directly');
  expect(card.requests.some(request => request.path.startsWith('/api/update/'))).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByTestId('preserving-update-usb-after-error')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await panel.getByTestId('preserving-update-usb-after-error').scrollIntoViewIfNeeded();
  await panel.getByTestId('preserving-update-usb-after-error').click();
  await expect(panel.getByRole('button', { name: 'Update once over USB' })).toBeVisible();
});

test('[F34-one-door] a connected, capable card opens straight on the preserving Wi-Fi update panel, never the USB eraser', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', error => crashes.push(String(error.message)));

  const spec = realCardOlderBuildSpec();
  const card = createCardSimulator(spec, { cardId: CARD_ID });
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  await seedKnownRealCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=install`, { waitUntil: 'domcontentloaded' });
  expect(page.url().startsWith(STUDIO_ORIGIN), 'the page did not actually land on the https origin').toBe(true);

  const panel = page.getByTestId('preserving-update-panel');
  await expect(
    panel,
    'a connected, capable card must open straight on the preserving Wi-Fi panel, not the destructive USB installer',
  ).toBeVisible({ timeout: 15000 });
  await expect(panel.getByRole('heading', { name: 'On this card' })).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Find connected card' }),
    'the erase installer must not be rendered at all on this path',
  ).toHaveCount(0);
  await expect(page.getByText('Erase card and install Lightweaver')).toHaveCount(0);
  await expect(page.getByTestId('install-remembered-card-unreachable')).toHaveCount(0);

  expect(crashes, 'the screen crashed').toEqual([]);
});

test('[F35-reach] a card the footer calls Connected is never reported unreachable on the install screen', async ({ page }) => {
  const spec = realCardOlderBuildSpec();
  const card = createCardSimulator(spec, { cardId: CARD_ID });
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  await seedKnownRealCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=install`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('preserving-update-panel')).toBeVisible({ timeout: 15000 });

  await expect(
    page.getByTestId('install-remembered-card-unreachable'),
    'no "can\'t reach" copy while the link this screen holds is genuinely connected',
  ).toHaveCount(0);
  await expect(page.getByText(/can.t reach the Lightweaver card/i)).toHaveCount(0);
  await expect(page.getByTestId('install-checking-card')).toHaveCount(0);

  // The screen's own read of this card's status must have gone out over the
  // direct route this link actually holds — proof the underlying connect/poll
  // never fell back to guessing a bridge tab that was never opened.
  await expect
    .poll(() => card.requests.some(entry => entry.method === 'GET' && entry.path === '/api/status'), {
      message: 'the install screen\'s status read must reach the card via the direct route it holds, not a bridge with nothing to answer it',
      timeout: 15000,
    })
    .toBe(true);
});

// ---------------------------------------------------------------------------
// F40 — Adrian, verbatim: "I tried to look for where you're talking about, I
// don't quite see it." He was told to use the one-time USB update (keeps
// Wi-Fi, project, settings) for the F34/F35 card, which answers
// `firmwareUpdateReady: false` and so cannot take a network write yet. The
// preserving panel correctly still opens on the Wi-Fi door (F34: the card CAN
// take a network update once the bit clears), but that door was a dead end —
// there was no way out to the USB path that actually works today. This runs
// on the same https/direct-link rig as F34/F35: a genuine, reached, capable
// card, not the DEV-only `__LW_PRESERVING_UPDATE_FIXTURE__` shortcut.
// ---------------------------------------------------------------------------

/** Chromium ships navigator.serial; this pins it so the USB door's
 * availability never depends on the runner's own Web Serial support. */
async function stubWebSerialSupport(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: { requestPort: async () => ({}) },
    });
  });
}

test('[F40-usb-door] a card that cannot take a Wi-Fi update yet leads with the one-time USB door', async ({ page }) => {
  await stubWebSerialSupport(page);
  const spec = realCardOlderBuildSpec();
  const card = createCardSimulator(spec, { cardId: CARD_ID });
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  await seedKnownRealCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=install`, { waitUntil: 'domcontentloaded' });

  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(panel.getByRole('heading', { name: 'On this card' })).toBeVisible();
  await expect(page.locator('.install-intro .install-release.ready')).toHaveText('Official update verified and ready.');
  await expect(page.locator('.install-intro')).not.toContainText('Build');

  await expect(
    panel.getByTestId('preserving-update-usb-required-notice'),
    'a card answering firmwareUpdateReady: false must say so before offering either action',
  ).toHaveText('This card needs USB for this update. Future updates can use Wi-Fi.');

  const primary = panel.getByTestId('preserving-update-primary-action');
  await expect(primary).toHaveText('Continue with USB');
  await expect(primary).toHaveClass(/btn-lg/);
  const secondary = panel.getByTestId('preserving-update-secondary-action');
  await expect(secondary).toHaveCount(0);

  await primary.click();
  await expect(panel.getByRole('heading', { name: 'On this card' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Update once over USB' })).toBeVisible();
});

test('[F40-wifi-ready] a card that CAN take a Wi-Fi update leads with Wi-Fi and still offers the USB door', async ({ page }) => {
  await stubWebSerialSupport(page);
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec, { cardId: CARD_ID });
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  await seedKnownRealCard(page);

  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=install`, { waitUntil: 'domcontentloaded' });

  const panel = page.getByTestId('preserving-update-panel');
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(panel.getByRole('heading', { name: 'On this card' })).toBeVisible();

  await expect(
    panel.getByTestId('preserving-update-usb-required-notice'),
    'a card that can take a Wi-Fi update right now must not be told otherwise',
  ).toHaveCount(0);

  const primary = panel.getByTestId('preserving-update-primary-action');
  await expect(primary).toHaveText('Update over Wi-Fi');
  const secondary = panel.getByTestId('preserving-update-secondary-action');
  await expect(secondary).toHaveText('Use USB instead');
  await expect(secondary).not.toBeVisible();
  await panel.getByText('Need another way?').click();
  await expect(secondary).toBeVisible();
  await expect(secondary).not.toHaveClass(/btn-lg/);
});
