import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const CARD = 'lw-shared-pattern';
const PROJECT = 'shared-pattern-project';
const MOON = 'installed-moon';
const AMBER = 'installed-amber';
const HASH = 'a'.repeat(40);

function sharedCard() {
  const patterns = [
    { id: MOON, label: 'Moon garden', mode: 'preset', runtimePatternId: 'warm-white', zones: [], controls: {} },
    { id: AMBER, label: 'Amber tides', mode: 'preset', runtimePatternId: 'warm-white', zones: [], controls: {} },
  ];
  const state = { cardId: CARD, bootId: 'shared-boot', fingerprint: 'b'.repeat(64), active: MOON, playing: false,
    live: { brightness: 0.7, speed: 1, hueShift: 0 },
    overrides: { [MOON]: {}, [AMBER]: {} } as Record<string, Record<string, number>>,
    revisions: { [MOON]: 'r0', [AMBER]: 'r0' }, saves: [] as Record<string, any>[], lookBrightness: 0.35 };
  const select = (id: string) => { state.active = id; state.playing = false; state.live = { brightness: 0.7, speed: 1, hueShift: 0, ...state.overrides[id] }; };
  const patternResponse = (id: string) => ({ ok: true, cardId: state.cardId, patternId: id, revision: state.revisions[id], overrides: state.overrides[id], lookBrightness: state.lookBrightness });
  const attach = (context: BrowserContext) => context.route('http://lightweaver.local/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/status' || url.pathname === '/api/firmware-info') return route.fulfill({ json: {
      app: 'Lightweaver', provisioningContractVersion: 1, cardId: state.cardId, bootId: state.bootId,
      firmwareVersion: '1.2.1', buildId: HASH, buildNumber: 456, runtimePhase: 'ready', knownGoodProject: true, configValid: true,
      commandReady: true, outputReady: true, playbackReady: true, projectId: PROJECT, projectRevision: 0, projectFingerprint: state.fingerprint,
      piece: { name: 'The moon garden' }, capabilities: { clientPattern: { version: 1 } },
      playlist: { configured: true, playing: state.playing, entryIndex: 0, entryCount: 2, patternId: state.active, remainingSeconds: 28 },
    } });
    if (url.pathname === '/api/patterns') return route.fulfill({ json: { currentId: state.active, currentIndex: patterns.findIndex(pattern => pattern.id === state.active), patterns: patterns.map(pattern => ({ ...pattern, brightness: state.lookBrightness, savedControls: state.overrides[pattern.id], savedControlsRevision: state.revisions[pattern.id] })) } });
    if (url.pathname === '/api/zones') return route.fulfill({ json: { zones: [{ id: 'all', label: 'Whole piece', patternId: state.active, blackout: false, ...state.live }] } });
    if (url.pathname === '/api/control') {
      const body = route.request().postDataJSON();
      if (body.patternId) select(body.patternId);
      for (const key of ['brightness', 'speed', 'hueShift']) if (body[key] !== undefined) state.live[key] = body[key];
      if (body.playlist) state.playing = body.playlist === 'play';
      return route.fulfill({ json: { ok: true, cardId: state.cardId, appliedPatternId: state.active, ...body } });
    }
    if (url.pathname === '/api/client-pattern') {
      if (route.request().method() === 'GET') return route.fulfill({ json: patternResponse(url.searchParams.get('patternId')!) });
      const body = route.request().postDataJSON(); state.saves.push(body);
      if (body.expectedCardId !== state.cardId || body.expectedRevision !== state.revisions[body.patternId] || body.patternId !== state.active || state.playing) {
        return route.fulfill({ status: 409, json: { ok: false, error: 'Saved pattern changed. Reconnect before saving.' } });
      }
      state.overrides[body.patternId] = { ...state.overrides[body.patternId], ...body.changes };
      state.revisions[body.patternId] = `r${state.saves.length}`;
      return route.fulfill({ json: patternResponse(body.patternId) });
    }
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  return { state, attach, select };
}

async function openStudioDrawer(page: Page, state: ReturnType<typeof sharedCard>['state']) {
  await page.goto('/#screen=layout');
  state.fingerprint = await page.evaluate(async ({ projectId, cardId }) => {
    const { createDefaultProject, migrateProject } = await import('/src/lib/projectModel.js');
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const project = createDefaultProject(); project.id = projectId; project.name = 'The moon garden'; project.layout.starterPending = false;
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: cardId }));
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project)); localStorage.setItem('lw_autosave_v3_backup', JSON.stringify(project));
    return cardProjectFingerprint(migrateProject(project));
  }, { projectId: PROJECT, cardId: CARD });
  await page.reload();
  await page.evaluate(async ({ cardId, hash, fingerprint, projectId }) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const event = { type: 'card-verified', via: 'direct', host: 'lightweaver.local',
      card: { id: cardId, name: 'Moon garden lights', firmwareVersion: '1.2.1', buildId: hash },
      expectedCard: { id: cardId, firmwareVersion: '1.2.1', buildId: hash },
      readiness: { app: 'Lightweaver', provisioningContractVersion: 1, cardId, firmwareVersion: '1.2.1', buildId: hash, bootId: 'shared-boot',
        runtimePhase: 'ready', knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
        projectId, projectRevision: 0, projectFingerprint: fingerprint } };
    const link = getSharedCardLink(); link.dispatch(event); link.dispatch(event);
  }, { cardId: CARD, hash: HASH, fingerprint: state.fingerprint, projectId: PROJECT });
  await page.getByTestId('card-link-status').click();
  return page.getByRole('dialog');
}

test('player saves one installed pattern and an independent Studio context reads the same saved values', async ({ browser, baseURL }) => {
  const card = sharedCard();
  const playerContext = await browser.newContext({ baseURL }); const studioContext = await browser.newContext({ baseURL });
  try {
    await card.attach(playerContext); await card.attach(studioContext);
    const player = await playerContext.newPage(); const studio = await studioContext.newPage();
    const drawer = await openStudioDrawer(studio, card.state);
    await expect(drawer.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('70');
    const originalProject = await studio.evaluate(() => { const saved = JSON.parse(localStorage.getItem('lw_autosave_v3')!); return { looks: saved.devices.standaloneController.looks, defaultLook: saved.devices.standaloneController.defaultLook, playlist: saved.devices.standaloneController.playlist }; });
    await player.goto(`/client.html#host=lightweaver.local&cardId=${CARD}`);
    await expect(player.getByRole('heading', { name: 'Moon garden', exact: true })).toBeVisible();
    const brightness = player.getByRole('slider', { name: 'Brightness', exact: true });
    await brightness.focus(); await brightness.fill('40'); await brightness.press('Tab');
    await expect(player.getByText('Unsaved pattern changes', { exact: true })).toBeVisible();
    await player.getByRole('button', { name: 'Update pattern', exact: true }).click();
    await expect(player.getByText('Pattern updated on your lights.', { exact: true })).toBeVisible();
    expect(card.state.saves[0]).toEqual({ expectedCardId: CARD, expectedRevision: 'r0', patternId: MOON, changes: { brightness: 0.4 } });
    expect(card.state.lookBrightness).toBe(0.35); expect(card.state.overrides[AMBER]).toEqual({});
    await player.getByRole('button', { name: /Amber tides/ }).click();
    await player.getByRole('button', { name: /Moon garden/ }).click();
    await expect(brightness).toHaveValue('40');
    await player.reload(); await expect(brightness).toHaveValue('40');
    await drawer.getByRole('button', { name: 'Refresh saved settings' }).click();
    await expect(drawer.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('40');
    await expect(drawer.getByRole('region', { name: 'Saved pattern settings' })).toContainText('Brightness 40%');
    expect(await studio.evaluate(() => { const saved = JSON.parse(localStorage.getItem('lw_autosave_v3')!); return { looks: saved.devices.standaloneController.looks, defaultLook: saved.devices.standaloneController.defaultLook, playlist: saved.devices.standaloneController.playlist }; })).toEqual(originalProject);
    await player.screenshot({ path: '/private/tmp/lightweaver-client-pattern-saved.png', fullPage: true });
    await player.setViewportSize({ width: 390, height: 844 });
    await expect(player.getByRole('button', { name: 'Update pattern', exact: true })).toBeVisible();
    expect(await player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await player.screenshot({ path: '/private/tmp/lightweaver-client-pattern-saved-phone.png', fullPage: true });
  } finally { await playerContext.close(); await studioContext.close(); }
});

test('changed playback target, stale revision and wrong card cannot redirect or clear unsaved edits', async ({ page, context }) => {
  const card = sharedCard(); await card.attach(context);
  await page.goto(`/client.html#host=lightweaver.local&cardId=${CARD}`);
  const brightness = page.getByRole('slider', { name: 'Brightness', exact: true });
  await expect(brightness).toHaveValue('70');
  await brightness.press('ArrowLeft');
  await expect(page.getByText('Unsaved pattern changes', { exact: true })).toBeVisible();
  card.select(AMBER);
  await expect(page.getByRole('heading', { name: 'Amber tides', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update pattern', exact: true })).toBeDisabled();
  expect(card.state.saves).toHaveLength(0);
  await page.getByRole('button', { name: /Moon garden/ }).click();
  await expect(page.getByRole('heading', { name: 'Moon garden', exact: true })).toBeVisible();
  await expect(brightness).toBeEnabled();
  await expect(brightness).toHaveValue('70');
  await expect(page.getByRole('button', { name: 'Update pattern', exact: true })).toBeDisabled();
  await brightness.press('ArrowLeft');
  await expect(page.getByText('Unsaved pattern changes', { exact: true })).toBeVisible();
  card.state.revisions[MOON] = 'external-change';
  await page.getByRole('button', { name: 'Update pattern', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Saved pattern changed');
  await expect(page.getByText('Unsaved pattern changes', { exact: true })).toBeVisible();
  expect(card.state.saves[0].patternId).toBe(MOON); expect(card.state.saves[0].expectedRevision).toBe('r0');
  expect(card.state.overrides[MOON]).toEqual({});
  card.state.cardId = 'lw-different';
  await page.getByRole('button', { name: 'Update pattern', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('different card');
  await expect(page.getByText('Unsaved pattern changes', { exact: true })).toBeVisible();
  expect(card.state.saves).toHaveLength(1);
});
