import { test, expect } from '@playwright/test';
import { settleEndCheck, stopRunAt } from './ux/drivers';
import { REFERENCE_BOARDS, draftBoard } from '../src/lib/boardProfiles.js';
import {
  CARD_LINK_DIRECT_PING_INTERVAL_MS,
  CARD_LINK_PING_INTERVAL_MS,
  CARD_LINK_PING_TIMEOUT_MS,
} from '../src/lib/cardLink.js';

// Strip discovery is the only flow that works on a card with nothing on it, and
// the two routing fixes it depends on are what stop a blank card being sent into
// the Layout install deadlock (install needs a bench LED check, the check sends
// frames, the bridge refuses frames while playbackReady is false).
//
// The card fixture below models the firmware, not a convenient stub. An earlier
// version of this file answered POST /api/config with `{ok:true,
// rebootRequired:true}` — a key the firmware does not have — and served the same
// blank /api/status for the whole run, so the card never left factory-beacon
// mode and the test still passed. That is precisely how a shipped deadlock
// reported itself as complete. Every response here is taken from
// LightweaverWeb.cpp `handleConfigPost` and LightweaverStorage.cpp.

const CARD_ID = 'lw-d15c0ae00001';
const BUILD_ID = 'd'.repeat(40);
const HOST = 'lightweaver.local';

// LightweaverWeb.cpp:1239 — the ordinary applied answer. The config is saved,
// runtimeApplySavedConfig() runs, and runtimeMarkRestartPending() sets a pending
// transition. The card does NOT restart itself: somebody has to POST /api/reboot.
function appliedConfigResponse() {
  return { ok: true, message: 'configuration saved', requiresReboot: true };
}

// LightweaverWeb.cpp:1218-1228 — the wiring-candidate answer. Note `ok` is TRUE
// on it, which is why a bare `response.ok` check reads a total non-event as
// success. Nothing was applied, nothing will reboot, the strip stays dark.
function stagedConfigResponse(activationId: string) {
  return {
    ok: true,
    state: 'staged',
    activationId,
    message: 'physical wiring changed',
    requiresReboot: false,
    requiresConfirmation: true,
  };
}

function blankStatus(overrides: Record<string, unknown> = {}) {
  // Exactly the shape classifyCardReadiness calls 'blank': erased NVS, so no
  // project identity at all and the factory-flash provisioning mode.
  return {
    app: 'Lightweaver',
    ok: true,
    provisioningContractVersion: 1,
    cardId: CARD_ID,
    firmwareVersion: '1.4.0',
    buildId: BUILD_ID,
    bootId: 'boot-discovery-1',
    runtimePhase: 'factory',
    mode: 'factory-flash',
    source: 'defaults',
    knownGoodProject: false,
    commandReady: false,
    playbackReady: false,
    outputReady: false,
    maxMilliamps: 100,
    maxMilliampsSource: 'default',
    ...overrides,
  };
}

// What the card reports once it has rebooted onto a saved config: the identity
// it was given, a NEW boot id because it really restarted, and playbackReady —
// the exact flag the frame path is gated on.
function readyStatus(applied: any, boots: number) {
  return {
    app: 'Lightweaver',
    ok: true,
    provisioningContractVersion: 1,
    cardId: CARD_ID,
    firmwareVersion: '1.4.0',
    buildId: BUILD_ID,
    bootId: `boot-discovery-${boots + 1}`,
    capabilities: { physicalFrameOrder: { version: 1 } },
    runtimePhase: 'ready',
    mode: 'website-flash',
    source: 'nvs',
    projectId: applied?.projectId ?? '',
    projectRevision: applied?.projectRevision ?? 0,
    projectFingerprint: applied?.projectFingerprint ?? '',
    knownGoodProject: true,
    commandReady: true,
    playbackReady: true,
    outputReady: true,
    maxMilliamps: applied?.led?.maxMilliamps ?? 0,
    maxMilliampsSource: 'config',
  };
}

type CardFirmware = 'blank-applies' | 'stages-everything';

interface FakeCard {
  configs: any[];
  applied: any;
  reboots: number;
  booted: boolean;
  restartPending: boolean;
  statusReads: number;
  beaconPinned: number | null;
  beaconPins: number[];
  beaconRefused: number[];
  availableBeaconPorts: number[];
  frames: string[][];
}

// The ports a stock card can actually light: the approved output menu minus the
// GPIOs the default control assignment claims (4/5/6/7). Studio must render THIS
// list, not its own hardware contract, or it offers buttons that do nothing.
const BEACON_PORTS = [15, 16, 17, 18, 21, 38, 40, 41, 42, 47, 48];

/**
 * A blank card at `lightweaver.local`.
 *
 *  - 'blank-applies' is the firmware this flow targets: the blank card is
 *    exempted from the wiring-staging path, so its first config is applied and
 *    answered with requiresReboot. Only after a reboot does /api/status stop
 *    reporting blank.
 *  - 'stages-everything' is a card still on older firmware, where
 *    runtimeConfigJsonChangesWiring sees outputCount 0 -> N and files the write
 *    as a candidate. Nothing is applied and the card stays blank forever.
 */
async function mockBlankCard(page: any, { firmware = 'blank-applies' as CardFirmware, reportedMaxMilliamps = 100 as number | null, availableBeaconPorts = BEACON_PORTS } = {}) {
  const card: FakeCard = {
    configs: [], applied: null, reboots: 0, booted: false, restartPending: false, statusReads: 0,
    beaconPinned: null, beaconPins: [], beaconRefused: [], availableBeaconPorts, frames: [],
  };
  await page.routeWebSocket(`ws://${HOST}:81/ws`, socket => {
    socket.onMessage(message => {
      const payload = JSON.parse(String(message));
      if (Array.isArray(payload.seg?.[0]?.i)) card.frames.push(payload.seg[0].i);
    });
  });
  await page.route(`http://${HOST}/**`, async (route: any) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/config' && request.method() === 'POST') {
      const config = JSON.parse(request.postData() || '{}');
      card.configs.push(config);
      if (firmware === 'stages-everything') {
        await route.fulfill({ json: stagedConfigResponse(`wiring-${card.configs.length}`) });
        return;
      }
      card.applied = config;
      card.restartPending = true;
      await route.fulfill({ json: appliedConfigResponse() });
      return;
    }
    if (pathname === '/api/reboot' && request.method() === 'POST') {
      card.reboots += 1;
      if (card.applied) {
        card.booted = true;
        card.restartPending = false;
      }
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (pathname === '/api/status' || pathname === '/api/firmware-info') {
      card.statusReads += 1;
      await route.fulfill({ json: card.booted ? readyStatus(card.applied, card.reboots) : blankStatus({ maxMilliamps: reportedMaxMilliamps }) });
      return;
    }
    // The blank-card port probe. GET lists the ports this card can light; POST
    // pins one. GPIO 4/5/6/7 are absent because the stock control assignment
    // claims them — the card, not Studio, decides which ports exist.
    if (pathname === '/api/beacon/port') {
      if (request.method() === 'GET') {
        await route.fulfill({
          json: { ok: true, available: !card.booted, ports: card.availableBeaconPorts, pixelsPerPort: 8 },
        });
        return;
      }
      const body = JSON.parse(request.postData() || '{}');
      if (body.release) {
        card.beaconPinned = null;
        await route.fulfill({ json: { ok: true, pinned: false } });
        return;
      }
      if (!card.availableBeaconPorts.includes(body.gpio)) {
        card.beaconRefused.push(body.gpio);
        await route.fulfill({
          status: 409,
          json: { ok: false, error: 'this card cannot light that port right now' },
        });
        return;
      }
      card.beaconPinned = body.gpio;
      card.beaconPins.push(body.gpio);
      await route.fulfill({ json: { ok: true, pinned: true, gpio: body.gpio, litPixels: 8, holdMs: 20000 } });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('http://192.168.4.1/**', (route: any) => route.abort());
  return card;
}

// addInitScript re-runs on EVERY navigation, including page.reload(). Clearing
// storage unconditionally therefore wiped lw_discovery_run_v1 before the app
// booted, which made the resume-after-reload banner unreachable in tests no
// matter how the product behaved (ui-repair B2/O1). Clear only on the first
// boot of a context — the identity key is the sentinel for "already seeded".
async function seedBlankCardLink(page: any) {
  await page.addInitScript(cardId => {
    if (!localStorage.getItem('lw_card_identity_v1')) localStorage.clear();
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
  }, CARD_ID);
}

async function dispatchBlankCard(page: any, { routeToDiscovery = true, reportedMaxMilliamps = 100 as number | null } = {}) {
  await page.evaluate(async ({ status, routeToDiscovery }) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const link = getSharedCardLink();
    const event = {
      type: 'card-verified',
      transport: 'direct',
      host: 'lightweaver.local',
      readiness: status,
      card: { id: status.cardId, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
    };
    link.dispatch(event);
    link.dispatch(event);
    // A fresh Studio may route away from discovery before the asynchronous
    // card-link event arrives. Return to the requested screen once the exact
    // blank-card evidence is installed so every test is independent of order.
    if (routeToDiscovery && !window.location.hash.includes('screen=discovery')) {
      window.location.hash = 'screen=discovery';
    }
  }, { status: blankStatus({ maxMilliamps: reportedMaxMilliamps }), routeToDiscovery });
}

// Walk the port picker to the point where the one card write has happened and
// the card is answering as Ready.
async function startDiscoveryOnGpio16(page: any) {
  const panel = page.getByTestId('strip-discovery');
  await expect(panel).toBeVisible();
  // The first press opens the question and removes the pin picker. A caller
  // that already selected GPIO 16 can answer without changing the active test.
  const pin = panel.getByTestId('discovery-probe-16');
  const question = panel.getByRole('heading', { name: 'Did the strip on GPIO 16 light up?', exact: true });
  await expect(pin.or(question)).toBeVisible();
  if (await pin.isVisible()) await pin.click();
  await panel.getByTestId('discovery-start').click();
}

// Combined flow (todo/plans/find-strips-redesign.md §6): one colour row, then
// a running light the owner stops. The ruler and typed count are gone.
async function showCountingRuler(page: any) {
  await expect(page.getByTestId('discovery-color-proof')).toBeVisible();
  await page.getByTestId('discovery-colour-row-rgb').click();
  await expect(page.getByTestId('discovery-run')).toBeVisible();
}

// Stop the running light at `count` and settle the end check on it.
async function countTo(page: any, count: number) {
  await stopRunAt(page, count);
  await settleEndCheck(page, count);
}

async function modelBenchPatterns(page: any, card: FakeCard) {
  const controls: any[] = [];
  let modeledConfig: any = null;
  let zones: any[] = [];
  let syncZones = true;
  let nativeArmedZones: string[] = [];
  let currentPatternId = '';
  let blackout = false;
  let refuseReadback = false;
  const refresh = () => {
    if (modeledConfig === card.applied) return;
    modeledConfig = card.applied;
    zones = (card.applied?.zones || []).map((zone: any) => ({ ...structuredClone(zone), blackout: zone.blackout ?? false }));
    syncZones = card.applied?.syncZones ?? true;
    nativeArmedZones = [];
    currentPatternId = card.applied?.startupPatternId || '';
    blackout = false;
  };
  await page.route(`http://${HOST}/api/status`, async (route: any) => {
    refresh();
    await route.fulfill({ json: card.booted ? {
      ...readyStatus(card.applied, card.reboots), provisionalSetup: true,
      projectId: card.applied?.piece?.id || card.applied?.projectId || '',
      outputs: structuredClone(card.applied?.led?.outputs || []),
      nativeRenderArmSupported: true, nativeArmedZones: [...nativeArmedZones],
      nativeRenderArmed: nativeArmedZones.length > 0,
      nativeRendering: nativeArmedZones.length > 0 && !blackout,
      nativeFadeScale: nativeArmedZones.length > 0 ? 1 : 0,
      currentPatternId, blackout, streaming: false, playlist: { playing: false },
    } : blankStatus() });
  });
  await page.route(`http://${HOST}/api/zones`, async (route: any) => {
    refresh();
    await route.fulfill({ json: { syncZones, zones: structuredClone(zones) } });
  });
  await page.route(`http://${HOST}/api/control`, async (route: any) => {
    refresh();
    const body = JSON.parse(route.request().postData() || '{}');
    controls.push(body);
    if ('armNative' in body) {
      if (Object.keys(body).length !== 2 || !zones.some(zone => zone.id === body.zone)) {
        await route.fulfill({ status: 422, json: { ok: false, error: 'native arm requires an exact zone' } });
        return;
      }
      nativeArmedZones = body.armNative
        ? [...new Set([...nativeArmedZones, body.zone])]
        : nativeArmedZones.filter(id => id !== body.zone);
      if (body.armNative) zones.find(zone => zone.id === body.zone).blackout = false;
      await route.fulfill({ json: { ok: true, zone: body.zone, nativeZoneArmed: body.armNative,
        nativeRenderArmed: nativeArmedZones.length > 0, streaming: false, blackout } });
      return;
    }
    if (Object.keys(body).length === 1 && body.syncZones === syncZones) {
      await route.fulfill({ status: 422, json: { ok: false, error: 'command affects zero outputs' } });
      return;
    }
    if (!refuseReadback && body.patternId) {
      if (body.zone) {
        zones.find(zone => zone.id === body.zone).patternId = body.patternId;
        currentPatternId = zones.length === 1 ? body.patternId : '';
      } else if (body.patternId === card.applied?.startupPatternId) {
        zones = (card.applied?.zones || []).map((zone: any) => ({ ...structuredClone(zone), blackout: zone.blackout ?? false }));
        currentPatternId = body.patternId;
      } else {
        for (const zone of zones) zone.patternId = body.patternId;
        currentPatternId = body.patternId;
      }
    }
    if ('blackout' in body) {
      if (body.zone) zones.find(zone => zone.id === body.zone).blackout = body.blackout;
      else blackout = body.blackout;
    }
    if ('syncZones' in body) syncZones = body.syncZones;
    await route.fulfill({ json: { ok: true, appliedPatternId: body.patternId || '' } });
  });
  return { controls, refuse: () => { refuseReadback = true; } };
}

async function recordTwoGpioWalk(page: any, onFirstCount?: () => Promise<void>) {
  await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
  await dispatchBlankCard(page);
  await startDiscoveryOnGpio16(page);
  await showCountingRuler(page);
  await onFirstCount?.();
  await countTo(page, 30);
  // Keep this strip and count another (simpler-journeys C8).
  await page.getByTestId('discovery-end-add-strip').click();
  await page.getByTestId('discovery-probe-17').click();
  await page.getByTestId('discovery-start').click();
  // The colour is measured once; strip 2 goes straight to its count, and
  // strip 1 keeps its count without a second walk.
  await expect(page.getByTestId('discovery-run')).toBeVisible();
  await countTo(page, 20);
  await page.getByTestId('discovery-end-yes').click();
  await expect(page.getByTestId('discovery-done')).toBeVisible();
  // The pattern preview is folded off the main path.
  await page.getByTestId('discovery-pattern-audition-open').click();
  // The Bench config reboot changes bootId. Direct keepalive can take a full
  // 20-second interval to notice it, then requires a second matching envelope
  // before the new boot becomes authority. Allow two bounded, one-retry reads,
  // the faster revalidation tick, and scheduling margin. The previous 15s
  // expired before even one ordinary direct keepalive was due.
  const postBenchBootWaitMs = CARD_LINK_DIRECT_PING_INTERVAL_MS
    + 4 * CARD_LINK_PING_TIMEOUT_MS
    + Math.min(500, CARD_LINK_PING_INTERVAL_MS)
    + 5000;
  let lastBootEvidence: any = null;
  try {
    await expect.poll(async () => {
      const evidence = await page.evaluate(async () => {
        const status = await fetch('http://lightweaver.local/api/status', { cache: 'no-store' }).then(response => response.json());
        const { getCardLinkState } = await import('/src/lib/cardLink.js');
        const link = getCardLinkState();
        return {
          statusBootId: status.bootId, statusCardId: status.cardId,
          linkBootId: link.validatedBootId, linkCardId: link.card?.id,
          candidateBootId: link.candidateBootId, linkState: link.state,
          linkReason: link.reason, linkTransport: link.transport, linkHost: link.host,
        };
      });
      lastBootEvidence = evidence;
      return Boolean(evidence.statusBootId && evidence.linkBootId === evidence.statusBootId
        && evidence.linkCardId === evidence.statusCardId);
    }, { timeout: postBenchBootWaitMs, message: 'shared card link must validate the post-Bench boot before pattern audition' }).toBe(true);
  } catch (error) {
    throw new Error(`${String(error)}; last boot evidence: ${JSON.stringify(lastBootEvidence)}`);
  }
}

test('a card without a numeric power limit gets an honest discovery notice', async ({ page }) => {
  await mockBlankCard(page, { reportedMaxMilliamps: null });
  await seedBlankCardLink(page);
  await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
  await dispatchBlankCard(page, { reportedMaxMilliamps: null });
  const notice = page.getByTestId('discovery-power-warning');
  await expect(notice).toContainText('has not reported its current power limit');
  await expect(notice).toContainText('2000 mA');
  await expect(notice).not.toContainText('1500 mA');
});

test.describe('a blank card whose firmware applies its first config', () => {
  let card: FakeCard;

  test.beforeEach(async ({ page }) => {
    card = await mockBlankCard(page, { firmware: 'blank-applies' });
    await seedBlankCardLink(page);
  });

  test('light discovery stays content-sized with a compact idle dock on a phone', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    const setup = page.getByTestId('card-setup-overlay');
    await expect(page.getByTestId('card-setup-minimize')).toBeVisible();
    const expanded = await setup.boundingBox();
    expect(expanded).toBeTruthy();
    expect(expanded!.width).toBeLessThanOrEqual(390);
    expect(expanded!.height).toBeLessThan(800);
    await page.getByTestId('card-setup-minimize').click();
    await expect(setup).toHaveAttribute('role', 'region');
    await expect(page.getByTestId('card-setup-stop-lights')).toBeVisible();
    const dock = await setup.boundingBox();
    expect(dock).toBeTruthy();
    expect(dock!.width).toBeLessThanOrEqual(390);
    expect(dock!.height).toBeLessThan(180);
    await page.getByTestId('card-setup-restore').click();
    await expect(setup).toHaveAttribute('role', 'dialog');
    await expect(page.getByTestId('strip-discovery')).toBeVisible();
    await testInfo.attach('phone-light-discovery-geometry', {
      body: Buffer.from(JSON.stringify({ expanded, dock }, null, 2)), contentType: 'application/json',
    });
  });

  test('light discovery minimizes to a usable dock and restores the same counting and pattern session', async ({ page }, testInfo) => {
    const geometry: Record<string, unknown> = {};
    await modelBenchPatterns(page, card);
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    const setup = page.getByTestId('card-setup-overlay');
    await expect(page.getByTestId('card-setup-minimize')).toBeVisible();
    const expanded = await setup.boundingBox();
    expect(expanded).toBeTruthy();
    geometry.expandedDesktop = expanded;
    expect(expanded!.height).toBeLessThan(500);
    await page.getByTestId('card-setup-minimize').click();
    await expect(setup).toHaveAttribute('role', 'region');
    await expect(setup).not.toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('strip-discovery')).toHaveCount(1);
    await expect(page.getByTestId('strip-discovery')).not.toBeVisible();
    await expect(page.getByTestId('card-setup-stop-lights')).toBeVisible();
    const idleDock = await setup.boundingBox();
    expect(idleDock).toBeTruthy();
    geometry.idleDockDesktop = idleDock;
    expect(idleDock!.height).toBeLessThan(150);
    expect(idleDock!.width).toBeLessThan(420);
    await page.getByRole('button', { name: 'Layout', exact: true }).click();
    await expect(page).toHaveURL(/screen=layout/);
    await expect(setup).toBeVisible();
    await page.getByRole('button', { name: 'Patterns', exact: true }).focus();
    await expect(page.getByRole('button', { name: 'Patterns', exact: true })).toBeFocused();
    await page.getByTestId('card-setup-restore').click();
    await expect(setup).toHaveAttribute('role', 'dialog');
    await expect(setup).toHaveAttribute('aria-modal', 'true');

    await recordTwoGpioWalk(page, async () => {
      // Minimizing mid-count keeps the same running count (no card write).
      const configsBefore = card.configs.length;
      const rebootsBefore = card.reboots;
      await page.getByTestId('card-setup-minimize').click();
      await expect(setup).toHaveAttribute('role', 'dialog');
      await expect(setup).toHaveAttribute('aria-modal', 'true');
      await expect(setup).toContainText('Light check active — restore to continue');
      await expect(page.getByTestId('strip-discovery')).toHaveCount(1);
      await expect(page.getByTestId('strip-discovery')).not.toBeVisible();
      await expect(page.getByTestId('card-setup-stop-lights')).toBeVisible();
      const dock = await setup.boundingBox();
      expect(dock).toBeTruthy();
      geometry.dockDesktop = dock;
      expect(dock!.height).toBeLessThan(150);
      expect(dock!.width).toBeLessThan(420);
      await expect(page.getByRole('button', { name: 'Layout', exact: true })
        .click({ trial: true, timeout: 1000 })).rejects.toThrow();
      await page.getByTestId('card-setup-restore').click();
      await expect(setup).toHaveAttribute('role', 'dialog');
      await expect(setup).toHaveAttribute('aria-modal', 'true');
      await expect(page.getByTestId('discovery-run')).toBeVisible();
      expect(card.configs.length).toBe(configsBefore);
      expect(card.reboots).toBe(rebootsBefore);
    });

    await expect(page.getByTestId('discovery-found').getByText('Visually confirmed', { exact: true })).toHaveCount(2);
    await expect(page.getByTestId('discovery-output-row')).toHaveCount(2);
    await expect(page.getByTestId('card-setup-close')).toBeEnabled();
    await page.getByTestId('discovery-pattern-whole').selectOption('aurora');
    await expect(page.getByTestId('discovery-pattern-16')).toHaveValue('aurora');
    const configsBefore = card.configs.length;
    const rebootsBefore = card.reboots;
    await page.getByTestId('card-setup-minimize').click();
    await expect(page.getByTestId('card-setup-stop-lights')).toBeVisible();
    await page.getByTestId('card-setup-restore').click();
    await expect(page.getByTestId('discovery-pattern-16')).toHaveValue('aurora');
    await expect(page.getByTestId('discovery-output-row').first()).toContainText('GPIO 16 · 30 LEDs');
    expect(card.configs.length).toBe(configsBefore);
    expect(card.reboots).toBe(rebootsBefore);
    await testInfo.attach('light-discovery-geometry', {
      body: Buffer.from(JSON.stringify(geometry, null, 2)), contentType: 'application/json',
    });
    await page.getByTestId('discovery-keep-patterns').click();
    await expect(page.getByText('Patterns saved for the final setup.')).toBeVisible();
    await page.getByTestId('discovery-continue-layout').click();
    await expect(page).toHaveURL(/screen=layout/);
    await expect(setup).toHaveCount(0);
  });

  test('minimizing during an idle-phase port probe keeps the light check modal and the probe pinned', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await page.getByTestId('discovery-probe-16').click();
    await expect.poll(() => card.beaconPinned).toBe(16);
    const configsBefore = card.configs.length;
    const rebootsBefore = card.reboots;
    await expect(page.getByTestId('card-setup-minimize')).toBeVisible();
    await page.getByTestId('card-setup-minimize').click();
    const setup = page.getByTestId('card-setup-overlay');
    await expect(setup).toHaveAttribute('role', 'dialog');
    await expect(setup).toHaveAttribute('aria-modal', 'true');
    await expect(setup).toContainText('Light check active — restore to continue');
    await expect(page.getByTestId('card-setup-stop-lights')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Layout', exact: true })
      .click({ trial: true, timeout: 1000 })).rejects.toThrow();
    expect(card.beaconPinned).toBe(16);
    await page.getByTestId('card-setup-restore').click();
    await expect(setup.getByRole('heading', { name: 'Did the strip on GPIO 16 light up?', exact: true })).toBeVisible();
    await expect(setup.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled();
    expect(card.beaconPinned).toBe(16);
    expect(card.configs.length).toBe(configsBefore);
    expect(card.reboots).toBe(rebootsBefore);
  });

  test('two GPIOs can try one scene, diverge, and keep exact patterns in the measured install package', async ({ page }, testInfo) => {
    const modeled = await modelBenchPatterns(page, card);
    await recordTwoGpioWalk(page);
    await expect(page.getByTestId('discovery-output-row')).toHaveCount(2);
    await expect(page.getByTestId('discovery-output-row').nth(0)).toContainText('GPIO 16 · 30 LEDs');
    await expect(page.getByTestId('discovery-output-row').nth(1)).toContainText('GPIO 17 · 20 LEDs');
    await expect(page.getByTestId('discovery-output-row').first()).toContainText('Choose a pattern');
    await page.getByTestId('discovery-pattern-whole').selectOption('aurora');
    await expect.poll(() => modeled.controls.filter(control => control.patternId === 'aurora'
      && control.syncZones === false).map(control => control.zone)).toEqual(['bench-16', 'bench-17']);
    await page.getByTestId('discovery-pattern-17').selectOption('ocean');
    await expect.poll(() => modeled.controls.some(control => control.zone === 'bench-17' && control.syncZones === false && control.patternId === 'ocean')).toBe(true);
    await expect(page.getByTestId('discovery-pattern-16')).toHaveValue('aurora');
    await expect(page.getByTestId('discovery-pattern-17')).toHaveValue('ocean');
    await expect(page.getByTestId('discovery-pattern-whole')).toHaveValue('');
    await expect(page.getByTestId('discovery-pattern-whole')).toContainText('Mixed patterns');
    await expect(page.getByTestId('discovery-output-row').first()).toContainText('Aurora');
    await expect(page.getByTestId('discovery-output-row').last()).toContainText('Ocean');
    await expect(page.getByTestId('discovery-stop-preview')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('bench-different-patterns-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('bench-different-patterns-phone.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTestId('discovery-keep-patterns').click();
    await expect(page.getByText('Patterns saved for the final setup.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
      return project.layout?.patchBoard?.patches?.map((patch: any) => patch.playback?.patternId);
    })).toEqual(['aurora', 'ocean']);
    const saved = await page.evaluate(async () => {
      const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
      const { buildPackageForPortRoles } = await import('/src/lib/cardSetupDeploy.js');
      const { prepareCardDeployment } = await import('/src/lib/cardDeployment.js');
      const portRoles = project.portRoles;
      const prepared = buildPackageForPortRoles({ projectId: project.id, projectName: project.name,
        projectRevision: 1, standaloneController: project.devices?.standaloneController || {}, portRoles,
        measuredGeometry: { strips: project.layout.strips, patchBoard: project.layout.patchBoard, wiring: project.layout.wiring },
      }, prepareCardDeployment);
      return { roles: portRoles.filter((role: any) => role.role === 'strip').map((role: any) => [role.pin, role.pixelCount]),
        outputs: prepared.config.led.outputs.map((output: any) => [output.pin, output.pixels]),
        patches: project.layout.patchBoard.patches.map((patch: any) => patch.playback.patternId),
        zones: prepared.config.zones.map((zone: any) => zone.patternId), startup: prepared.config.startupPatternId };
    });
    expect(saved.roles).toEqual([[16, 30], [17, 20]]);
    expect(saved.outputs).toEqual([[16, 30], [17, 20]]);
    expect(saved.patches).toEqual(['aurora', 'ocean']);
    expect(saved.zones).toEqual(['aurora', 'ocean']);
    expect(saved.startup).toMatch(/section-layout/);
    await page.getByTestId('discovery-continue-layout').click();
    await expect(page).toHaveURL(/screen=layout/);
  });

  test('a wrong GPIO pattern readback leaves Keep unavailable and reports the failure', async ({ page }) => {
    const modeled = await modelBenchPatterns(page, card);
    await recordTwoGpioWalk(page);
    modeled.refuse();
    await page.getByTestId('discovery-pattern-17').selectOption('ocean');
    await expect(page.getByRole('alert')).toContainText(/did not confirm ocean/i);
    await expect(page.getByTestId('discovery-keep-patterns')).toHaveCount(0);
    await expect(page.getByText('Patterns saved for the final setup.')).toHaveCount(0);
  });

  test('factory power notice reports the actual cap before the temporary counting cap', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    const notice = page.getByTestId('discovery-power-warning');
    await expect(notice).toContainText('100 mA');
    await expect(notice).toContainText('2000 mA');
    await expect(notice).not.toContainText('default 1500 mA');
  });

  // The owner usually already knows roughly where they plugged the strip in.
  // Confirming that by waiting for the beacon sweep to reach their port means
  // watching and trusting they read the timing right; clicking the port and
  // looking is the same answer without the guesswork.
  test('clicking a port lights that port, and only that port', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('strip-discovery')).toBeVisible();

    // Picking an eligible pin stops the sweep and lights that pin.
    await page.getByTestId('discovery-probe-18').click();
    await expect(page.getByRole('heading', { name: 'Did the strip on GPIO 18 light up?' })).toBeVisible();
    await expect.poll(() => card.beaconPinned, {
      message: 'the card must be lighting the port the owner named',
    }).toBe(18);
    const fromTap = card.beaconPins.lastIndexOf(18);
    await page.waitForTimeout(2600);
    expect(card.beaconPins.slice(fromTap), 'the sweep does not resume after a tap').toEqual([18]);

    // Picking a different port moves the light rather than lighting both, or the
    // owner could not tell which port answered.
    await page.getByTestId('discovery-try-another').click();
    await expect(page.getByTestId('discovery-probe-18')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('discovery-probe-21').click();
    await expect(page.getByRole('heading', { name: 'Did the strip on GPIO 21 light up?' })).toBeVisible();
    await expect.poll(() => card.beaconPinned).toBe(21);

    // Tapping the lit pin again turns it off, so a probe can be stopped
    // without leaving the screen.
    await page.getByTestId('discovery-try-another').click();
    await expect(page.getByTestId('discovery-probe-18')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('discovery-probe-21').click();
    await expect.poll(() => card.beaconPinned).toBeNull();
  });

  test('the sweep lights each pin the card can light in turn, identifies it, and That\u2019s mine picks it', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('discovery-plan')).toHaveAttribute('data-find-mode', 'watch');
    await expect.poll(() => card.beaconPins.length, { timeout: 15000 }).toBeGreaterThanOrEqual(3);
    expect(card.beaconPins.slice(0, 3)).toEqual(BEACON_PORTS.slice(0, 3));
    expect(card.beaconRefused).toEqual([]);
    const lit = page.locator('[data-testid="discovery-pin-map"] .is-pulse[data-pin="17"]');
    await expect(lit).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('discovery-sweep-pin')).toHaveText('Testing GPIO 17');
    await page.waitForTimeout(700);
    await page.getByTestId('discovery-sweep-mine').click();
    await expect.poll(() => card.configs.length).toBeGreaterThan(0);
    expect(card.configs[0].led.outputs.map((output: { pin: number }) => output.pin)).toEqual([17]);
  });

  test('the grid offers exactly the ports the card says it can light', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('strip-discovery')).toBeVisible();
    await expect(page.getByTestId('discovery-plan')).toContainText('Watch your strip.');

    for (const pin of BEACON_PORTS) {
      await expect(page.getByTestId(`discovery-probe-${pin}`)).toBeVisible();
    }
    // The stock controls claim 4/5/6/7. Studio must take that from the CARD, not
    // from its own hardware contract, because the control assignment lives in
    // the card's config and differs between cards. A button here would light
    // nothing and read as a dead port.
    for (const claimed of [4, 5, 6, 7]) {
      await expect(page.getByTestId(`discovery-probe-${claimed}`)).toHaveCount(0);
    }
    expect(card.beaconRefused, 'Studio must never ask for a port the card excluded').toEqual([]);
  });

  test('a confirmed board map excludes its reserved pins from strip discovery', async ({ page }) => {
    const profile = draftBoard(REFERENCE_BOARDS[0]);
    profile.revision = 1;
    profile.name = 'Confirmed bench board';
    profile.groups = profile.groups.map(group => ({
      ...group,
      pins: group.pins.map(pin => pin.gpio === 39
        ? { ...pin, role: 'control', detail: 'External control' }
        : pin),
    }));
    await page.addInitScript(({ cardId, profile }) => {
      localStorage.setItem('lw-board-profiles-v1', JSON.stringify({
        profiles: [profile], confirmations: { [cardId]: { id: profile.id, revision: profile.revision } },
      }));
    }, { cardId: CARD_ID, profile });
    card.availableBeaconPorts = [...BEACON_PORTS, 39];

    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('discovery-probe-39')).toHaveCount(0);
    await expect(page.getByTestId('discovery-probe-38')).toBeVisible();
    await page.getByRole('button', { name: 'Full pinout' }).click();
    const map = page.getByTestId('discovery-pin-map');
    await expect(map).toContainText('Confirmed bench board');
    await expect(map.locator('[data-pin="39"]')).toContainText('External control');
    await expect(page.getByTestId('discovery-probe-39')).toHaveCount(0);
    expect(card.beaconPins).not.toContain(39);
  });

  test('new firmware reports GPIO 39, while GPIOs 35–37 remain unavailable', async ({ page }, testInfo) => {
    card.availableBeaconPorts = [...BEACON_PORTS, 39];
    await page.route('**/api/firmware-info', route => route.fulfill({ json: blankStatus({
      controls: {
        encoder: { a: 14, b: 5, press: 0, configuredAlternatePress: 6, effectiveAlternatePress: 6 },
        previous: 7, next: 8, blackout: 9, statusLed: 2, brightnessAnalog: 1,
      },
    }) }));
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('discovery-probe-39')).toBeVisible();
    await expect(page.getByTestId('discovery-probe-36')).toHaveCount(0);
    await expect(page.getByTestId('discovery-probe-37')).toHaveCount(0);
    await page.getByTestId('discovery-probe-39').click();
    await expect.poll(() => card.beaconPinned).toBe(39);
    await page.getByRole('button', { name: 'Full pinout' }).click();
    await expect(page.getByTestId('discovery-gpio-availability')).toContainText('GPIOs 35–37');
    await expect(page.getByTestId('discovery-gpio-availability')).toContainText('PSRAM');
    const pinMap = page.getByTestId('discovery-pin-map');
    await expect(pinMap.locator('[data-pin="39"]')).toContainText('LED available · JTAG');
    await expect(pinMap.locator('[data-pin="12"]')).toContainText('microSD SCK');
    await expect(pinMap.locator('[data-pin="37"]')).toContainText('PSRAM');
    await expect(pinMap).toContainText('Card controls');
    await expect(pinMap.locator('[data-pin="14"]')).toContainText('Encoder A');
    await expect(pinMap.locator('[data-pin="1"]')).toContainText('Dimmer pot');
    await pinMap.screenshot({ path: testInfo.outputPath('gpio39-discovery-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await pinMap.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await pinMap.screenshot({ path: testInfo.outputPath('gpio39-discovery-mobile.png') });
    await page.getByRole('button', { name: 'Back to strip check' }).click();
    await page.getByTestId('discovery-start').click();
    await expect.poll(() => card.configs.length).toBeGreaterThan(0);
    expect(card.configs[0].led.outputs.map((output: { pin: number }) => output.pin)).toEqual([39]);
  });

  test('older firmware does not offer GPIO 39 until the card reports it', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('discovery-plan')).toBeVisible();
    await expect(page.getByTestId('discovery-probe-39')).toHaveCount(0);
    await expect(page.getByTestId('discovery-probe-38')).toBeVisible();
    expect(card.beaconRefused).toEqual([]);
  });

  test('starting the run releases the port so the card is not left pinned', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('strip-discovery')).toBeVisible();
    await page.getByTestId('discovery-probe-16').click();
    await expect.poll(() => card.beaconPinned).toBe(16);

    await startDiscoveryOnGpio16(page);
    // Once the bench config owns the outputs the beacon is no longer driving
    // anything, so a pin left behind would be a stale claim on the card.
    await expect.poll(() => card.beaconPinned).toBeNull();
  });

  test('a blank card is offered discovery, not the Layout dead end', async ({ page }) => {
    await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page, { routeToDiscovery: false });
    await page.getByTestId('card-link-status').click();
    // A card that needs a project now enters the single Setup flow instead of
    // opening a second connection dialog with overlapping setup actions.
    const findStrips = page.getByRole('button', { name: 'Find and count the lights' });
    await expect(findStrips).toBeVisible();
    await findStrips.click();
    await expect(page).toHaveURL(/#screen=discovery/);
    const setup = page.getByTestId('card-setup-overlay');
    await expect(setup).toBeVisible();
    await expect(setup).toHaveAttribute('role', 'dialog');
    await expect(setup).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('strip-discovery')).toBeVisible();
    await expect(page.getByTestId('card-setup-stop-lights')).toBeVisible();

    await page.getByTestId('card-setup-close').click();
    await expect(setup).toHaveCount(0);
    await expect(page).toHaveURL(/#screen=card&section=setup&task=discover-lights$/);
  });

  test('Test & Install sends a blank card to discovery instead of an LED check it cannot run', async ({ page }) => {
    await page.goto('/#screen=layout&mode=wire', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page, { routeToDiscovery: false });
    const findStrips = page.getByRole('button', { name: 'Find and count the lights' });
    await expect(page.getByTestId('setup-phase-lights')).toHaveAttribute('aria-current', 'step');
    await expect(findStrips).toBeVisible();
    // The LED check is not offered, because it provably cannot complete here.
    await expect(page.getByTestId('start-led-check')).toHaveCount(0);
    await expect(page.getByTestId('layout-send-to-card')).toHaveCount(0);
    await findStrips.click();
    await expect(page).toHaveURL(/#screen=discovery/);
  });

  test('the one card write applies, reboots, and only then is the strip probed', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);

    // Probing must not begin while the card is still restarting: every frame
    // sent in that window is refused, and a dark strip reads as "no LEDs here".
    await expect(page.getByTestId('discovery-installing')).toBeVisible();
    await expect(page.getByTestId('card-setup-close')).toBeDisabled();
    await expect(page.getByTestId('card-setup-disconnect')).toBeDisabled();
    await expect(page.getByTestId('card-setup-stop-lights')).toBeEnabled();
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('card-setup-close')).toBeDisabled();
    await expect(page.getByTestId('card-setup-disconnect')).toBeDisabled();

    // Exactly one write, it was a config the card can actually run (one output
    // and one look is the whole validity bar), and Studio issued the restart
    // itself rather than leaving the card on its old pixel buffers.
    expect(card.configs).toHaveLength(1);
    expect(card.applied.led.outputs.length).toBeGreaterThanOrEqual(1);
    expect(card.applied.looks.length).toBeGreaterThanOrEqual(1);
    expect(card.reboots).toBe(1);
    expect(card.booted).toBe(true);
    expect(card.restartPending).toBe(false);
  });

  test('counting is a running light stopped by one press, and the end check lights past the count', async ({ page }, testInfo) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    const overlay = page.getByTestId('card-setup-overlay');
    await expect(overlay).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('card-setup-stop-lights')).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTestId('discovery-probe-16').click();
    await expect(page.getByTestId('discovery-claim-16')).toHaveCount(0);
    await expect(page.getByTestId('discovery-start')).toHaveText('Yes');
    await page.getByTestId('discovery-start').click();
    await expect(page.getByTestId('discovery-color-proof')).toBeVisible();
    // One tap: lights 1, 2, 3 each in one send slot.
    await expect.poll(() => card.frames.some(frame => frame.length === 256
      && frame[0] === '3C0000' && frame[1] === '003C00' && frame[2] === '00003C' && frame[3] === '000000')).toBe(true);
    await page.getByTestId('discovery-colour-row-rgb').click();
    await expect(page.getByTestId('discovery-run')).toBeVisible();
    await expect(page.getByTestId('discovery-more')).toHaveCount(0);
    await expect(page.getByTestId('discovery-enough')).toHaveCount(0);
    await expect(page.getByTestId('discovery-count-16')).toHaveCount(0);
    // The light really runs: frames grow from the strip's start.
    await expect.poll(() => card.frames.some(frame => frame.length === 256
      && frame[0] === '281400' && frame[9] === '281400' && frame[255] === '000000'), { timeout: 15000 }).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('discovery-run-stop')).toBeInViewport();
    await expect(page.getByTestId('card-setup-stop-lights')).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 800 });
    await countTo(page, 47);
    // The end check: purple on light 47, the light after it lit, so a longer
    // strip would show it.
    await expect.poll(() => card.frames.some(frame => frame.length === 256
      && frame[46] === '3C003C' && frame[45] === '281400' && frame[47] === '281400')).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('lightweaver-end-check-desktop.png') });
    await page.getByTestId('discovery-end-yes').click();
    await expect(page.getByTestId('discovery-found').getByRole('listitem')).toContainText('Visually confirmed');
    await expect(page.getByTestId('discovery-result-16')).toHaveText('Strip 1 · 47 lights');
    await expect(page.getByTestId('card-setup-stop-lights')).toBeVisible();
  });

  test('ruler read-off and end marker produce recorded counts', async ({ page }, testInfo) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);

    // Every port starts unused: the card's compiled pin menu is wider than the
    // four outputs it can drive, so discovery never guesses which are wired.
    await startDiscoveryOnGpio16(page);

    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });
    await showCountingRuler(page);

    await countTo(page, 47);
    await expect(page.getByTestId('discovery-end-marker')).toBeVisible();
    // A correction stays on the end check: one more, one fewer, back to 47.
    await page.getByTestId('discovery-end-plus').click();
    await expect(page.getByTestId('discovery-end-count')).toHaveText('48');
    await page.getByTestId('discovery-end-minus').click();
    await expect(page.getByTestId('discovery-end-count')).toHaveText('47');
    await page.getByTestId('discovery-end-yes').click();

    await expect(page.getByTestId('discovery-done')).toBeVisible();
    await expect(page.getByTestId('discovery-result-16')).toHaveText('Strip 1 · 47 lights');
    await expect(page.getByTestId('discovery-total')).toContainText('47');
    // The pattern preview is folded off the main path, and still all there.
    await page.getByTestId('discovery-pattern-audition-open').click();
    await expect(page.getByTestId('discovery-pattern-audition')).toBeVisible();
    await expect(page.getByTestId('discovery-pattern-whole')).toBeVisible();
    await expect(page.getByTestId('discovery-pattern-16')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('bench-patterns-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('bench-patterns-phone.png'), fullPage: true });
    await expect(page.getByTestId('discovery-pattern-16')).toBeInViewport();
    await page.setViewportSize({ width: 320, height: 720 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('discovery-install')).toHaveCount(0);
    await expect(page.getByTestId('discovery-open-patterns')).toBeVisible();
    await expect(page.getByTestId('discovery-continue-layout')).toBeVisible();
    await expect(page.getByTestId('discovery-continue-layout'), 'Layout is a door, not the step').not.toHaveClass(/primary/);
    await expect(page.getByTestId('card-setup-close')).toBeEnabled();
    await expect(page.getByTestId('card-setup-disconnect')).toBeEnabled();

    await expect.poll(() => page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
      const strip = saved.layout?.strips?.[0];
      const output = saved.layout?.wiring?.outputs?.[0];
      const run = saved.layout?.wiring?.runs?.[0];
      return {
        starterPending: saved.layout?.starterPending,
        strip: strip ? [strip.id, strip.pixelCount] : null,
        output: output ? [output.pin, output.runIds] : null,
        run: run ? [run.source?.stripId, run.source?.to] : null,
      };
    })).toEqual({
      starterPending: false,
      strip: ['strip-16', 47],
      output: [16, ['run-strip-16']],
      run: ['strip-16', 46],
    });

    await page.getByTestId('discovery-continue-layout').click();
    await expect(page).toHaveURL(/#screen=layout&mode=draw$/);
    await expect(page.locator('.la-strip-row')).toHaveCount(1);
    await expect(page.locator('.la-strip-row')).toHaveClass(/sel/);

    const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_port_roles_v1') || 'null'));
    expect(recorded).toContainEqual({ pin: 16, role: 'strip', pixelCount: 47, controlKind: '' });
  });

  test('adding a strip keeps its count and extension grows only the chosen port', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await showCountingRuler(page);
    await countTo(page, 47);
    // Keep this strip and count another (simpler-journeys C8).
    await page.getByTestId('discovery-end-add-strip').click();
    await page.getByTestId('discovery-probe-17').click();
    await page.getByTestId('discovery-start').click();
    await expect(page.getByTestId('discovery-run')).toBeVisible();
    // The light reaches the end of what is set up (256) and offers more.
    await expect(page.getByTestId('discovery-run-at-end')).toBeVisible({ timeout: 60000 });
    await page.getByTestId('discovery-ruler-extend-17').click();
    await expect.poll(() => card.configs.length).toBe(3);
    const outputs = card.configs[2].led.outputs;
    expect(outputs.find((output: any) => output.pin === 16).pixels).toBe(256);
    expect(outputs.find((output: any) => output.pin === 17).pixels).toBe(512);
    await countTo(page, 300);
    await page.getByTestId('discovery-end-yes').click();
    await expect(page.getByTestId('discovery-result-16')).toHaveText('Strip 1 · 47 lights');
    await expect(page.getByTestId('discovery-result-17')).toHaveText('Strip 2 · 300 lights');
  });

  test('the running light stops at the lights the card can verify', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });
    await showCountingRuler(page);
    await expect(page.getByTestId('discovery-run-at-end')).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('discovery-run-count')).toHaveText('256');
    await page.waitForTimeout(600);
    await expect(page.getByTestId('discovery-run-count'), 'never past what is set up').toHaveText('256');
    await page.getByTestId('discovery-run-stop').click();
    await expect(page.getByTestId('discovery-end-count')).toHaveText('256');
    await page.getByTestId('discovery-end-yes').click();
    await expect(page.getByTestId('discovery-result-16')).toHaveText('Strip 1 · 256 lights');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_port_roles_v1') || 'null')))
      .toContainEqual({ pin: 16, role: 'strip', pixelCount: 256, controlKind: '' });
  });

  test('a fifth strip is refused before writing another setup', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    for (const [index, pin] of [15, 16, 17, 18].entries()) {
      await page.getByTestId(`discovery-probe-${pin}`).click();
      await page.getByTestId('discovery-start').click();
      if (index === 0) await showCountingRuler(page);
      // Strips counted before keep their counts; only this one is walked.
      await countTo(page, 20);
      // The last confirm keeps every strip and counts another (simpler-journeys C8).
      await page.getByTestId('discovery-end-add-strip').click();
    }
    await page.getByTestId('discovery-probe-21').click();
    await expect(page.getByTestId('discovery-output-limit')).toContainText('use a second card for the rest');
    await expect(page.getByTestId('discovery-start')).toBeDisabled();
    expect(card.configs).toHaveLength(4);
  });

  test('a retained count is distinct from a light count confirmed on this visit', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lw_port_roles_v1', JSON.stringify([{ pin: 17, role: 'strip', pixelCount: 31 }]));
    });
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await showCountingRuler(page);
    await countTo(page, 47);
    await page.getByTestId('discovery-end-yes').click();
    const counts = page.getByTestId('discovery-found');
    await expect(counts.getByRole('listitem').filter({ has: page.getByTestId('discovery-result-16') }))
      .toHaveText(/47 lights.*Visually confirmed/);
    await expect(counts.getByRole('listitem').filter({ has: page.getByTestId('discovery-result-17') }))
      .toHaveText(/31 lights.*Last counted/);
  });

  test('the probe question offers an explicit relight control', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });

    const relight = page.getByTestId('discovery-relight');
    await expect(relight).toBeVisible();
    await relight.click();
    // Relighting never changes the question or the count being asked about.
    await expect(page.getByTestId('discovery-color-proof')).toBeVisible();
    await expect(page.getByTestId('discovery-probe')).toBeVisible();
  });

  test('the idle screen says what the temporary setup writes', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('strip-discovery')).toBeVisible();
    await page.getByTestId('discovery-probe-16').click();
    await expect(page.getByTestId('discovery-start-note')).toContainText('temporary setup');
    await expect(page.getByTestId('discovery-start-note')).toContainText(/restart/i);
  });
});

test.describe('a blank card on firmware that still stages the first config', () => {
  let card: FakeCard;

  test.beforeEach(async ({ page }) => {
    card = await mockBlankCard(page, { firmware: 'stages-everything' });
    await seedBlankCardLink(page);
  });

  test('a staged answer stops discovery and asks for a firmware update', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);

    // `ok: true` on the staged envelope is the trap. Nothing was applied, so
    // there is no honest way to continue — and the owner is told what to do
    // rather than left watching an unlit strip.
    // The reason is now stated once, where the action would be, instead of
    // twice — the same sentence used to appear as the explanation AND again as
    // a red alert underneath, which reads as two separate problems.
    const failure = page.getByTestId('discovery-install-error');
    await expect(failure).toBeVisible({ timeout: 15000 });
    await expect(failure).toContainText(/update the card firmware/i);
    await expect(page.getByTestId('discovery-failure')).toHaveCount(0);
    await expect(page.getByTestId('discovery-failure-size')).toHaveCount(0);

    // Never silently treated as success: the probe phase is refused outright,
    // and Studio does not try to reboot a card that applied nothing.
    await expect(page.getByTestId('discovery-probe')).toHaveCount(0);
    await expect(page.getByTestId('discovery-decade')).toHaveCount(0);
    expect(card.configs).toHaveLength(1);
    expect(card.applied).toBeNull();
    expect(card.reboots).toBe(0);
    expect(card.booted).toBe(false);
  });
});

// ─── ui-repair blocker coverage: B0, B2, B5, B-COLOUR ────────────────────────

test.describe('discovery on a card that already holds a project (ui-repair B0)', () => {
  // The observed live failure: the card was NOT on old firmware — it held the
  // bench project from an earlier abandoned run, so its wiring protection
  // staged the new bench config. Studio blamed the firmware and prescribed a
  // reflash, which cannot help. The right diagnosis is "clear the card".
  test('a card already holding a setup is cleared automatically and discovery carries on', async ({ page }) => {
    const clears: string[] = [];
    const card: { cleared: boolean; applied: any; booted: boolean; reboots: number; configs: any[] } = {
      cleared: false, applied: null, booted: false, reboots: 0, configs: [],
    };
    const benchStatus = () => ({
      app: 'Lightweaver', ok: true, provisioningContractVersion: 1,
      cardId: CARD_ID, firmwareVersion: '1.4.0', buildId: BUILD_ID,
      bootId: `boot-heldproject-${card.reboots + 1}`,
      runtimePhase: 'ready', mode: 'website-flash', source: 'nvs',
      projectId: 'lightweaver-bench-discovery-v1', projectRevision: 1,
      projectFingerprint: 'a1b2c3d4e5f60718', provisionalSetup: true,
      knownGoodProject: true, commandReady: true, playbackReady: true, outputReady: true,
    });
    // The frame stream opens ws://<host>:81/ws; answer it here, or it leaves this
    // Mac for whatever card is on the network (tests/harness/networkGuard.ts).
    await page.routeWebSocket(`ws://${HOST}:81/ws`, () => {});
    await page.route(`http://${HOST}/**`, async (route: any) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/config' && request.method() === 'POST') {
        card.configs.push(JSON.parse(request.postData() || '{}'));
        if (!card.cleared) {
          // The card protects its existing layout: staged, nothing applied.
          await route.fulfill({ json: stagedConfigResponse(`wiring-${card.configs.length}`) });
          return;
        }
        card.applied = card.configs[card.configs.length - 1];
        await route.fulfill({ json: appliedConfigResponse() });
        return;
      }
      if (pathname === '/api/clear-project' && request.method() === 'POST') {
        clears.push(request.postData() || '');
        card.cleared = true;
        card.reboots += 1;
        await route.fulfill({ status: 202, json: { ok: true, accepted: true, wifiPreserved: true, requiresReboot: true } });
        return;
      }
      if (pathname === '/api/reboot' && request.method() === 'POST') {
        card.reboots += 1;
        if (card.applied) card.booted = true;
        await route.fulfill({ json: { ok: true } });
        return;
      }
      if (pathname === '/api/status' || pathname === '/api/firmware-info') {
        if (card.booted) await route.fulfill({ json: readyStatus(card.applied, card.reboots) });
        else if (card.cleared) await route.fulfill({ json: blankStatus({ bootId: `boot-cleared-${card.reboots}` }) });
        else await route.fulfill({ json: benchStatus() });
        return;
      }
      if (pathname === '/api/beacon/port' && request.method() === 'GET') {
        await route.fulfill({ json: { ok: true, available: false, ports: [], pixelsPerPort: 8 } });
        return;
      }
      await route.fulfill({ json: { ok: true } });
    });
    await page.route('http://192.168.4.1/**', (route: any) => route.abort());
    await seedBlankCardLink(page);
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async status => {
      const { getSharedCardLink } = await import('/src/lib/cardLink.js');
      const link = getSharedCardLink();
      const event = {
        type: 'card-verified', transport: 'direct', host: 'lightweaver.local',
        readiness: status,
        card: { id: status.cardId, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
      };
      link.dispatch(event);
      link.dispatch(event);
    }, benchStatus());
    await startDiscoveryOnGpio16(page);

    // NO tap. A card already holding a saved setup is the ordinary state of
    // every card that has been used once, clearing it is the only thing the
    // owner could have done anyway, and the run replaces that project
    // regardless. Stopping to explain it made the FIRST step of setup a dead
    // end on any card that was not factory-fresh. Studio clears it (Wi-Fi
    // kept), says so, and carries straight on to the probe.
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('discovery-install-error')).toHaveCount(0);
    await showCountingRuler(page);
    await expect(page.getByTestId('discovery-bench-maxed'))
      .toContainText(/cleared it/i);
    expect(clears).toHaveLength(1);
    expect(JSON.parse(clears[0])).toEqual({ confirm: 'CLEAR' });
    expect(card.configs.length).toBe(2);
    expect(card.booted).toBe(true);
  });
});

test.describe('a reload mid-discovery (ui-repair B2)', () => {
  let card: FakeCard;

  test.beforeEach(async ({ page }) => {
    card = await mockBlankCard(page, { firmware: 'blank-applies' });
    await seedBlankCardLink(page);
  });

  // KNOWN BROKEN — ui-repair B2 is written but does not work: after a reload the
  // `discovery-resume` banner never appears, so the interrupted run cannot be
  // picked up. The wiring reads correctly (writeDiscoveryRun on every question
  // phase, useState(readDiscoveryRun) at mount, banner inside the idle guard),
  // so the fault is somewhere between the write and the read and needs a live
  // debugging pass, not another reading of the code. These two tests describe
  // the intended behaviour exactly and should be un-fixme'd by whoever fixes it.
  test('the run is offered back after a reload and resumes at the same question', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });
    await showCountingRuler(page);
    await countTo(page, 47);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('discovery-resume')).toBeVisible();
    await page.getByTestId('discovery-resume-continue').click();
    // Back on the same question with the same count.
    await expect(page.getByTestId('discovery-end-marker')).toBeVisible();
    await expect(page.getByTestId('discovery-end-count')).toHaveText('47');

    // Finishing the resumed run records normally and clears the stored run.
    await page.getByTestId('discovery-end-yes').click();
    await expect(page.getByTestId('discovery-done')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lw_discovery_run_v1'))).toBeNull();
  });

  // KNOWN BROKEN — same cause as the test above (ui-repair B2).
  test('Start over discards the stored run and returns a clean port picker', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await expect(page.getByTestId('discovery-resume')).toBeVisible();
    await page.getByTestId('discovery-resume-discard').click();
    await expect(page.getByTestId('discovery-resume')).toHaveCount(0);
    await expect(page.getByTestId('discovery-plan')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lw_discovery_run_v1'))).toBeNull();
  });
});

test.describe('a card restart while a question is on screen (ui-repair B5)', () => {
  let card: FakeCard;

  test.beforeEach(async ({ page }) => {
    card = await mockBlankCard(page, { firmware: 'blank-applies' });
    await seedBlankCardLink(page);
  });

  test('a restart pauses the answers until the lights are shown again', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });

    // The card's own bootId change is the restart evidence; two envelopes are
    // the stable pair the link requires after a boot change.
    await page.evaluate(async status => {
      const { getSharedCardLink } = await import('/src/lib/cardLink.js');
      const link = getSharedCardLink();
      const event = {
        type: 'card-verified', transport: 'direct', host: 'lightweaver.local',
        readiness: status,
        card: { id: status.cardId, firmwareVersion: status.firmwareVersion, buildId: status.buildId },
      };
      link.dispatch(event);
      link.dispatch(event);
    }, blankStatus({ bootId: 'boot-discovery-99' }));

    await expect(page.getByTestId('discovery-card-restarted')).toBeVisible();
    await expect(page.getByTestId('discovery-colour-row-rgb')).toBeDisabled();
    await expect(page.getByTestId('discovery-colour-row-grb')).toBeDisabled();
    await expect(page.getByTestId('discovery-color-skip')).toBeDisabled();

    // "Light these again" is the one gate back to answering.
    await page.getByTestId('discovery-relight').click();
    await expect(page.getByTestId('discovery-card-restarted')).toHaveCount(0);
    await expect(page.getByTestId('discovery-colour-row-rgb')).toBeEnabled();
  });
});

test.describe('the colour-proof quiz (ui-repair B-COLOUR)', () => {
  let card: FakeCard;

  test.beforeEach(async ({ page }) => {
    card = await mockBlankCard(page, { firmware: 'blank-applies' });
    await seedBlankCardLink(page);
  });

  test('one tap on what lights 1, 2 and 3 show calibrates the colours', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });

    const proof = page.getByTestId('discovery-color-proof');
    await expect(proof).toBeVisible();
    await expect(page.getByTestId('discovery-probe')).toContainText('Tap what you see.');
    await expect(proof.getByRole('button')).toHaveCount(6);
    // This strip swaps red and green: it shows green, red, blue.
    await page.getByTestId('discovery-colour-row-grb').click();
    await expect(proof).toHaveCount(0);
    await expect(page.getByTestId('discovery-run')).toBeVisible();
    // From here every frame is corrected, so a dim warm light is sent with its
    // red and green swapped to look warm on this strip.
    await expect.poll(() => card.frames.some(frame => frame.length === 256 && frame[0] === '142800'), { timeout: 15000 }).toBe(true);
  });

  // On a phone the floating notices sat over the counting controls, and the
  // colour question could be closed, taking its answers with it.
  test('on a phone, the colour question and power note live in the page and cover nothing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.lw-notice-layer [data-testid="discovery-color-proof"]')).toHaveCount(0);
    await expect(page.locator('.lw-notice-layer [data-testid="discovery-power-warning"]')).toHaveCount(0);
    await expect(page.getByTestId('discovery-probe').getByTestId('discovery-colour-row-rgb')).toBeVisible();
    await page.getByTestId('discovery-colour-row-rgb').click();
    await stopRunAt(page, 20);
    await expect(page.getByTestId('discovery-end-marker')).toBeVisible();
    // Nothing floating may sit over a control on the end check.
    const overlaps = await page.evaluate(() => {
      const notes = [...document.querySelectorAll('.lw-notice-layer .lw-notice')].map(n => n.getBoundingClientRect());
      const controls = [...document.querySelectorAll('[data-testid="discovery-end-marker"] button')]
        .map(c => ({ name: c.textContent?.trim() || c.getAttribute('aria-label') || c.tagName, r: c.getBoundingClientRect() }))
        .filter(c => c.r.width > 0 && c.r.bottom > 0 && c.r.top < window.innerHeight);
      return controls.filter(c => notes.some(n => n.left < c.r.right && n.right > c.r.left && n.top < c.r.bottom && n.bottom > c.r.top)).map(c => c.name);
    });
    expect(overlaps).toEqual([]);
  });

  test('the quiz can be skipped and never blocks the walk', async ({ page }) => {
    await page.goto('/#screen=discovery', { waitUntil: 'domcontentloaded' });
    await dispatchBlankCard(page);
    await startDiscoveryOnGpio16(page);
    await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('discovery-color-skip').click();
    await expect(page.getByTestId('discovery-color-proof')).toHaveCount(0);
    await expect(page.getByTestId('discovery-run')).toBeVisible();
    await expect(page.getByTestId('discovery-run-stop')).toBeEnabled();
  });
});
