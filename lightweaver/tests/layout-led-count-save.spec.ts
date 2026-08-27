import { test, expect } from '@playwright/test';

const CARD_ID = 'lw-led-count-save';
const PROJECT_ID = 'led-count-piece';
const FINGERPRINT = 'c'.repeat(64);
const BUILD_ID = 'a'.repeat(40);
const START_COUNT = 8;
const NEXT_COUNT = 5;

function readyStatus(pixels: number, extra = {}) {
  return {
    app: 'Lightweaver',
    provisioningContractVersion: 1,
    cardId: CARD_ID,
    firmwareVersion: '1.4.0',
    buildId: BUILD_ID,
    bootId: 'boot-led-count',
    runtimePhase: 'ready',
    knownGoodProject: true,
    commandReady: true,
    outputReady: true,
    playbackReady: true,
    projectId: PROJECT_ID,
    projectRevision: 1,
    projectFingerprint: FINGERPRINT,
    piece: { id: PROJECT_ID, name: 'LED count piece' },
    requestedPixels: pixels,
    led: { pixels, type: 'WS2812B', colorOrder: 'RGB', maxMilliamps: 1500 },
    outputs: [{
      id: 'out1', pin: 16, gpio: 16, pixels, count: pixels,
      segments: [{ id: 'out1-full', count: pixels, direction: 'forward' }],
    }],
    ...extra,
  };
}

function seedProject() {
  const pxPerMm = 3.7795;
  const lengthM = 0.13;
  const svgLength = lengthM * 1000 * pxPerMm;
  return {
    version: 3,
    id: PROJECT_ID,
    name: 'LED count piece',
    layout: {
      starterPending: false,
      strips: [{
        id: 'count-strip',
        name: 'Line',
        pathData: `M 100 200 L ${100 + svgLength} 200`,
        svgLength,
        closed: false,
        pixelCount: START_COUNT,
        x: 0, y: 0, emit: 'omni', angle: 0, reversed: false,
        speed: 1, brightness: 1, hueShift: 0, patternId: null,
      }],
      viewBox: '0 0 640 400',
      svgText: null,
      layers: [],
      density: 60,
      pxPerMm,
      stripCountOverrides: { 'count-strip': true },
      stripDensities: { 'count-strip': 60 },
      patchBoard: { physicalLocked: false },
      wiring: {
        version: 1,
        locked: false,
        verified: false,
        controllerAnchor: null,
        outputs: [{ id: 'out1', name: 'GPIO 16', pin: 16, runIds: ['run-count-strip'] }],
        runs: [{
          id: 'run-count-strip',
          type: 'strip',
          source: { stripId: 'count-strip', from: 0, to: START_COUNT - 1 },
          directionPolicy: 'flexible',
          physicalDirection: 'source-forward',
          seamLed: null,
        }],
      },
    },
    devices: {
      standaloneController: {
        outputs: [{ id: 'out1', pin: 16, pixels: START_COUNT }],
        led: { type: 'WS2812B', colorOrder: 'RGB' },
      },
    },
  };
}

async function dispatchCardLink(page: any, events: Record<string, unknown>[]) {
  await page.evaluate(async (nextEvents) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const link = getSharedCardLink();
    for (const event of nextEvents) {
      const priorBootId = link.getState().validatedBootId;
      link.dispatch(event);
      if (event.type === 'card-verified' && event.readiness?.bootId
        && (!priorBootId || priorBootId === event.readiness.bootId)) link.dispatch(event);
    }
  }, events);
}

async function mockCard(page: any, card: { pixels: number; configPosts: any[]; wiringPosts: any[]; projectRevision?: number; projectFingerprint?: string }) {
  await page.unroute('http://lightweaver.local/**').catch(() => {});
  await page.route('http://lightweaver.local/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const posted = card.configPosts.at(-1);
    const status = readyStatus(card.pixels, {
      projectRevision: posted?.projectRevision ?? card.projectRevision ?? 0,
      projectFingerprint: posted?.projectFingerprint ?? card.projectFingerprint ?? FINGERPRINT,
    });
    if (pathname === '/api/status' || pathname === '/api/firmware-info') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) });
      return;
    }
    if (pathname === '/api/config') {
      const body = JSON.parse(request.postData() || '{}');
      card.configPosts.push(body);
      const nextPixels = body?.led?.pixels ?? body?.led?.outputs?.[0]?.pixels;
      if (Number.isFinite(Number(nextPixels))) card.pixels = Math.trunc(Number(nextPixels));
      await route.fulfill({ json: { ok: true, requiresReboot: false } });
      return;
    }
    if (pathname.startsWith('/api/wiring/')) {
      card.wiringPosts.push({ pathname, body: request.postData() });
      await route.fulfill({ status: 500, json: { ok: false, error: 'length-only write must not rewire' } });
      return;
    }
    if (pathname === '/api/reboot') {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('http://192.168.4.1/**', route => route.abort());
  await page.route('http://192.168.18.70/**', route => route.abort());
});

test('typed LED count resamples canvas dots on the same path, disconnected footer stays off', async ({ page }) => {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();

  const strip = page.locator('[data-strip-id]').first();
  if (!await strip.locator('.la-strip-detail').isVisible()) await strip.locator('.la-strip-row').click();

  let starting: { pixelCount: number; svgLength: number } | null = null;
  await expect.poll(async () => {
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('lw_autosave_v3') || 'null'));
    const item = saved?.layout?.strips?.[0];
    starting = item ? { pixelCount: item.pixelCount, svgLength: item.svgLength } : null;
    return Boolean(starting?.svgLength > 0 && starting.pixelCount > 2);
  }).toBe(true);

  const next = starting!.pixelCount - 2;
  await page.getByLabel('Strip LED count', { exact: true }).fill(String(next));
  await page.getByLabel('Strip LED count', { exact: true }).blur();

  await expect.poll(async () => {
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('lw_autosave_v3') || 'null'));
    const item = saved?.layout?.strips?.[0];
    return item ? [item.pixelCount, item.svgLength, item.pixels?.length ?? 0] : null;
  }).toEqual([next, starting!.svgLength, next]);

  await expect(page.locator('[data-testid^="strip-led-"]')).toHaveCount(next);
  await expect(page.getByTestId('card-link-status')).not.toHaveAttribute('data-lifecycle-state', 'length-mismatch');
  await expect(page.getByTestId('card-link-status')).not.toContainText('Save to card');
});

test('connected length drift shows Save to card and click writes length only', async ({ page }) => {
  const card = { pixels: START_COUNT, configPosts: [] as any[], wiringPosts: [] as any[], projectRevision: 0, projectFingerprint: FINGERPRINT };
  await mockCard(page, card);
  await page.addInitScript(({ project, cardId, buildId }) => {
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: cardId, firmwareVersion: '1.4.0', buildId,
    }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { project: seedProject(), cardId: CARD_ID, buildId: BUILD_ID });

  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid^="strip-led-"]')).toHaveCount(START_COUNT);
  await expect.poll(async () => page.evaluate(count => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.strips?.[0]?.pixels?.length === count;
  }, START_COUNT)).toBe(true);

  const identity = await page.evaluate(async () => {
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return {
      projectId: saved?.id,
      fingerprint: cardProjectFingerprint(saved),
    };
  });
  card.projectFingerprint = identity.fingerprint;
  card.projectRevision = 0;
  const status = readyStatus(START_COUNT, {
    projectId: identity.projectId,
    projectRevision: 0,
    projectFingerprint: identity.fingerprint,
  });
  await dispatchCardLink(page, [{
    type: 'card-verified',
    via: 'direct',
    host: 'lightweaver.local',
    card: { id: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: BUILD_ID },
    expectedCard: { id: CARD_ID, firmwareVersion: status.firmwareVersion, buildId: BUILD_ID },
    readiness: status,
  }]);

  await expect(page.getByTestId('card-link-status')).toContainText('Connected');
  await expect(page.getByTestId('card-link-status')).toHaveAttribute('data-lifecycle-state', 'ready');

  const strip = page.locator('[data-strip-id]').first();
  if (!await strip.locator('.la-strip-detail').isVisible()) await strip.locator('.la-strip-row').click();
  const startingLength = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.strips?.[0]?.svgLength;
  });

  await page.getByLabel('Strip LED count', { exact: true }).fill(String(NEXT_COUNT));
  await page.getByLabel('Strip LED count', { exact: true }).blur();
  await expect(page.locator('[data-testid^="strip-led-"]')).toHaveCount(NEXT_COUNT);
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return saved?.layout?.strips?.[0]?.svgLength;
  })).toBe(startingLength);

  await page.waitForTimeout(1200);
  expect(card.configPosts).toHaveLength(0);

  const footer = page.getByTestId('card-link-status');
  await expect(footer).toContainText('Save to card');
  await expect(footer).toHaveAttribute('data-lifecycle-state', 'length-mismatch');
  await expect(footer).toHaveAttribute('data-needs-save', 'true');
  await expect(footer).toHaveClass(/needs-save/);
  await expect(footer).toHaveAccessibleName('Save to card');

  await footer.click();
  await expect.poll(() => card.configPosts.length).toBe(1);
  await expect(footer).not.toBeDisabled();
  const posted = card.configPosts[0];
  expect(posted.led?.pixels ?? posted.led?.outputs?.[0]?.pixels).toBe(NEXT_COUNT);
  expect(posted.led?.outputs?.[0]?.pin ?? posted.led?.outputs?.[0]?.gpio).toBe(16);
  expect(card.wiringPosts).toHaveLength(0);

  await dispatchCardLink(page, [{
    type: 'card-verified',
    via: 'direct',
    host: 'lightweaver.local',
    card: { id: CARD_ID, firmwareVersion: '1.4.0', buildId: BUILD_ID },
    expectedCard: { id: CARD_ID, firmwareVersion: '1.4.0', buildId: BUILD_ID },
    readiness: readyStatus(NEXT_COUNT, {
      projectId: identity.projectId,
      projectRevision: posted.projectRevision ?? 0,
      projectFingerprint: posted.projectFingerprint || identity.fingerprint,
    }),
  }]);

  await expect(footer).toContainText('Connected');
  await expect(footer).toHaveAttribute('data-lifecycle-state', 'ready');
});

test('adding a playlist pattern lights Save to card on the footer', async ({ page }) => {
  const project = seedProject();
  project.devices.standaloneController.playlist = [{
    id: 'aurora', type: 'pattern', patternId: 'aurora', label: 'Aurora', enabled: true, createdAt: 0,
  }];
  const card = { pixels: START_COUNT, configPosts: [] as any[], wiringPosts: [] as any[], projectRevision: 0, projectFingerprint: FINGERPRINT };
  await mockCard(page, card);
  await page.addInitScript(({ nextProject, cardId, buildId }) => {
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', JSON.stringify(nextProject));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: cardId, firmwareVersion: '1.4.0', buildId,
    }));
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { nextProject: project, cardId: CARD_ID, buildId: BUILD_ID });

  await page.goto('/#screen=playlist', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Playlist' })).toBeVisible();
  const addPlasma = page.getByTitle('Add Plasma', { exact: true });
  await expect(addPlasma).toBeVisible();
  const identity = await page.evaluate(async () => {
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    return { projectId: saved?.id, fingerprint: cardProjectFingerprint(saved) };
  });
  card.projectFingerprint = identity.fingerprint;
  await dispatchCardLink(page, [{
    type: 'card-verified',
    via: 'direct',
    host: 'lightweaver.local',
    card: { id: CARD_ID, firmwareVersion: '1.4.0', buildId: BUILD_ID },
    expectedCard: { id: CARD_ID, firmwareVersion: '1.4.0', buildId: BUILD_ID },
    readiness: readyStatus(START_COUNT, {
      projectId: identity.projectId,
      projectRevision: 0,
      projectFingerprint: identity.fingerprint,
    }),
  }]);

  const footer = page.getByTestId('card-link-status');
  await addPlasma.click();
  await expect(footer).toContainText('Save to card');
  await expect(footer).toHaveAttribute('data-lifecycle-state', 'content-mismatch');
  await expect(footer).toHaveAttribute('data-needs-save', 'true');
  await expect(footer).toHaveClass(/needs-save/);
});
