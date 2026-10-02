import { expect, test } from '@playwright/test';

async function mockLibraryCard(page) {
  const writes: string[] = [];
  await page.route('http://lightweaver.local/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') { writes.push(path); return route.fulfill({ status: 403, json: { ok: false } }); }
    if (path === '/api/status' || path === '/api/firmware-info') return route.fulfill({ json: {
      app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-library123', bootId: 'library-boot',
      firmwareVersion: '1.2.1', buildId: 'a'.repeat(40), buildNumber: 2311, runtimePhase: 'ready', configValid: true,
      knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
      projectId: 'moon', projectRevision: 1, projectFingerprint: 'b'.repeat(64), piece: { name: 'Moon' }, capabilities: { clientPlaylist: { version: 1 } }, playlist: {},
    } });
    if (path === '/api/client-playlist') return route.fulfill({ json: { ok: true, cardId: 'lw-library123', revision: 'playlist-1', enabled: false, fadeMs: 1000, entries: [] } });
    if (path === '/api/patterns') return route.fulfill({ json: { currentId: 'ocean', patterns: [{ id: 'ocean', label: 'Ocean', mode: 'procedural', zones: [] }] } });
    if (path === '/api/zones') return route.fulfill({ json: { zones: [
      { id: 'outer', label: 'Outer ring', patternId: 'ocean', brightness: .7, speed: 1, hueShift: 0, ranges: [{ start: 0, count: 20 }] },
      { id: 'inner', label: 'Inner ring', patternId: 'ocean', brightness: .7, speed: 1, hueShift: 0, ranges: [{ start: 20, count: 20 }] },
      { id: 'mirror', label: 'Mirrored outer', mirrorOf: 'outer', mirrorFlip: true, patternId: 'ocean', brightness: .7, speed: 1, hueShift: 0, ranges: [{ start: 40, count: 20 }] },
    ] } });
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  return writes;
}

test('client library selects and tunes locally, offers actual sections, and refuses unsupported card saves', async ({ page }, testInfo) => {
  const writes = await mockLibraryCard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const library = page.getByRole('region', { name: 'Pattern library' });
  await expect(library.locator('a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create a new pattern', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search library patterns' }).fill('ocean');
  await page.getByRole('button', { name: 'Use Ocean', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Create your pattern' })).toBeVisible();
  await expect(page).toHaveURL(/client\.html/);
  await page.getByRole('radio', { name: 'Choose sections', exact: true }).check();
  await page.getByRole('checkbox', { name: /Outer ring/ }).check();
  await expect(page.getByRole('checkbox', { name: /Mirrored outer/ })).toHaveCount(0);
  await expect(page.getByText('Includes its mirrored sections')).toBeVisible();
  await page.getByLabel('Pattern name', { exact: true }).fill('Evening ocean');
  await page.getByRole('slider', { name: 'Library brightness', exact: true }).focus();
  await page.getByRole('slider', { name: 'Library brightness', exact: true }).press('ArrowLeft');
  await expect(page.getByRole('button', { name: 'Add to playlist', exact: true })).toBeDisabled();
  await expect(page.getByText(/need an update before new library patterns/)).toBeVisible();
  await page.getByRole('button', { name: 'Keep draft on this phone' }).click();
  await expect(page.getByText('Draft saved in this browser. It has not been sent to your lights.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('self-contained-library-phone.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Evening ocean', exact: true }).click();
  await expect(page.getByLabel('Pattern name', { exact: true })).toHaveValue('Evening ocean');
  await expect(page.getByRole('slider', { name: 'Library brightness', exact: true })).toHaveValue('69');
});

test('disconnected library can create a draft without opening any other app', async ({ page }) => {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.goto('/client.html');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new pattern', exact: true }).click();
  await page.getByRole('button', { name: 'Use Fire', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add to playlist', exact: true })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Choose sections', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Pattern library' }).locator('a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Keep draft on this phone' }).click();
  await expect(page.getByText('Draft saved in this browser. It has not been sent to your lights.')).toBeVisible();
});


test('an installed look goes straight to playlist draft by its exact ID without installation', async ({ page }) => {
  const writes = await mockLibraryCard(page);
  await page.route('http://lightweaver.local/api/patterns', route => route.fulfill({ json: { currentId: 'ocean-soft', patterns: [
    { id: 'ocean-soft', label: 'Soft ocean', runtimePatternId: 'ocean', mode: 'procedural', zones: [] },
    { id: 'ocean-fast', label: 'Fast ocean', runtimePatternId: 'ocean', mode: 'procedural', zones: [] },
  ] } }));
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Library playlist duration' }).fill('45');
  await page.getByRole('button', { name: 'Add Fast ocean to playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your playlist' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Duration for Fast ocean/ })).toHaveValue('45');
  await expect(page.getByRole('spinbutton', { name: /Duration for Soft ocean/ })).toHaveCount(0);
  expect(writes).toEqual([]);
});

async function mockInstallingLibrary(page, { full = false, failReadback = false } = {}) {
  const writes = await mockLibraryCard(page);
  const sections = [
    { id: 'outer', label: 'Outer ring', ranges: [{ start: 0, count: 20 }], mirrorOf: '', mirrorFlip: false, continuous: true },
    { id: 'inner', label: 'Inner ring', ranges: [{ start: 20, count: 20 }], mirrorOf: '', mirrorFlip: false, continuous: false },
    { id: 'mirror', label: 'Mirrored outer', ranges: [{ start: 40, count: 20 }], mirrorOf: 'outer', mirrorFlip: true, continuous: false },
  ];
  const state = { installed: false, posts: [] as any[], layoutRevision: 'map-1', failReadback, hold: null as Promise<void> | null };
  const library = () => ({ ok: true, cardId: 'lw-library123', bootId: 'library-boot', revision: state.installed ? 'library-2' : 'library-1', layoutRevision: state.layoutRevision,
    currentLookId: 'ocean', supportedPresetIds: ['ocean', 'fire'], remaining: state.installed ? 28 : 29, canInstall: true, sections,
    layout: { sections, outputs: [{ pin: 16, segments: [{ start: 0, count: 60, reversed: true }] }], kaleidoscopeMappings: [] },
  });
  await page.route('http://lightweaver.local/api/status', route => route.fulfill({ json: {
    app: 'Lightweaver', provisioningContractVersion: 1, cardId: 'lw-library123', bootId: 'library-boot', firmwareVersion: '1.2.2', buildId: 'a'.repeat(40), buildNumber: 2315,
    runtimePhase: 'ready', configValid: true, knownGoodProject: true, commandReady: true, outputReady: true, playbackReady: true,
    projectId: 'moon', projectRevision: 1, projectFingerprint: 'b'.repeat(64), piece: { name: 'Moon' },
    capabilities: { clientPlaylist: { version: 1 }, clientLibrary: { version: 1 } }, playlist: {},
  } }));
  await page.route('http://lightweaver.local/api/client-playlist', route => {
    if (route.request().method() !== 'GET') writes.push('/api/client-playlist');
    return route.fulfill({ json: { ok: true, cardId: 'lw-library123', revision: 'playlist-1', enabled: full, fadeMs: 1000, entries: full ? Array.from({ length: 16 }, () => ({ patternId: 'ocean', dwellSeconds: 30 })) : [] } });
  });
  await page.route('http://lightweaver.local/api/client-library', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: library() });
    const body = route.request().postDataJSON(); state.posts.push(body);
    if (body.expectedLayoutRevision !== state.layoutRevision) return route.fulfill({ status: 409, json: { ok: false, error: 'The artwork map changed.' } });
    state.installed = true;
    return route.fulfill({ json: { ...library(), installedPatternId: 'saved-evening-123' } });
  });
  await page.route('http://lightweaver.local/api/patterns', async route => {
    if (state.installed && state.hold) await state.hold;
    if (state.installed && state.failReadback) { state.failReadback = false; return route.fulfill({ status: 503, json: { ok: false } }); }
    const body = state.posts[0];
    return route.fulfill({ json: { currentId: 'ocean', patterns: [{ id: 'ocean', label: 'Ocean', mode: 'procedural', zones: [] }, ...(state.installed ? [{ id: 'saved-evening-123', label: body.label, mode: 'procedural', zones: sections.map(section => { const assignment = body.assignments?.find(item => item.targetId === section.id); return { ...section, patternId: assignment?.presetId || (body.targetIds.includes(section.id) ? body.presetId : 'ocean'), ...(assignment?.tuning || (body.targetIds.includes(section.id) ? body.tuning : { brightness: .7, speed: 1, hueShift: 0 })) }; }) }] : [])] } });
  });
  return { state, writes, sections };
}

async function chooseNewLook(page) {
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new pattern', exact: true }).click();
  await page.getByRole('button', { name: 'Use Fire', exact: true }).click();
  await page.getByLabel('Pattern name', { exact: true }).fill('Evening glow');
  await page.getByRole('radio', { name: 'Choose sections', exact: true }).check();
  await page.getByRole('checkbox', { name: /Outer ring/ }).check();
}

test('new library look waits for verified receipt and preserved map before adding exact ID to playlist draft', async ({ page }) => {
  const { state, writes } = await mockInstallingLibrary(page);
  await chooseNewLook(page);
  await page.getByRole('spinbutton', { name: 'Library playlist duration' }).fill('45');
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Library', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(state.posts[0]).toEqual({ expectedCardId: 'lw-library123', expectedBootId: 'library-boot', expectedRevision: 'library-1', expectedLayoutRevision: 'map-1', expectedCurrentLookId: 'ocean', presetId: 'fire', label: 'Evening glow', targetIds: ['outer'], tuning: { brightness: .7, speed: 1, hueShift: 0 }, assignments: [{ targetId: 'outer', presetId: 'fire', tuning: { brightness: .7, speed: 1, hueShift: 0 } }] });
  release();
  await expect(page.getByRole('heading', { name: 'Your playlist' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Duration for Evening glow/ })).toHaveValue('45');
  expect(writes).toEqual([]);
  expect(state.layoutRevision).toBe('map-1');
  expect(state.posts).toHaveLength(1);
});

test('changed map and full playlist prevent installation', async ({ page }) => {
  const { state } = await mockInstallingLibrary(page);
  await chooseNewLook(page);
  state.layoutRevision = 'map-2';
  await page.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  await expect(page.getByText(/artwork map changed/i).first()).toBeVisible();
  expect(state.posts).toHaveLength(0);
  await page.unrouteAll({ behavior: 'wait' });
  const full = await mockInstallingLibrary(page, { full: true });
  await chooseNewLook(page);
  await expect(page.getByRole('button', { name: 'Add to playlist', exact: true })).toBeDisabled();
  expect(full.state.posts).toHaveLength(0);
});

test('readback failure retries confirmation and draft addition without installing twice', async ({ page }) => {
  const { state, writes } = await mockInstallingLibrary(page, { failReadback: true });
  await chooseNewLook(page);
  await page.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  await expect(page.getByText(/confirmation is incomplete/)).toBeVisible();
  expect(state.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your playlist' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Duration for Evening glow/ })).toHaveValue('30');
  expect(state.posts).toHaveLength(1);
  expect(writes).toEqual([]);
});

test('section board supports phone tap placement, drag placement and live card names', async ({ page }, testInfo) => {
  const { state, sections } = await mockInstallingLibrary(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new pattern', exact: true }).click();
  await page.getByRole('button', { name: 'Use Fire', exact: true }).click();
  await page.getByRole('radio', { name: 'Choose sections', exact: true }).check();
  const outer = page.getByRole('button', { name: 'Place Fire on Outer ring', exact: true });
  await expect(outer).toBeVisible({ timeout: 1000 });
  await outer.click();
  await expect(outer).toHaveAttribute('aria-pressed', 'true');
  await expect(outer.locator('[data-placement-preview]')).toHaveAttribute('data-placement-preview', 'fire');
  await expect(page.getByRole('button', { name: /Place.*Mirrored outer/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Outer ring/ })).toBeChecked();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await page.getByRole('button', { name: 'Select Ocean', exact: true }).dispatchEvent('dragstart', { dataTransfer: transfer });
  await page.getByRole('button', { name: 'Place Fire on Inner ring', exact: true }).dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByRole('button', { name: 'Place Ocean on Inner ring', exact: true })).toHaveAttribute('aria-pressed', 'true');
  sections[1].label = 'Center petals';
  await expect(page.getByRole('button', { name: 'Place Ocean on Center petals', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place Ocean on Inner ring', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tune Outer ring', exact: true }).click();
  await expect(page.getByText('Adjusting Outer ring', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Library brightness', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.locator('.cl-section-board').screenshot({ path: testInfo.outputPath('library-section-board-phone.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.posts).toHaveLength(0);
  await page.getByLabel('Pattern name', { exact: true }).fill('Fire and ocean');
  await page.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your playlist' })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].assignments).toEqual([{ targetId: 'outer', presetId: 'fire', tuning: { brightness: .69, speed: 1, hueShift: 0 } }, { targetId: 'inner', presetId: 'ocean', tuning: { brightness: .7, speed: 1, hueShift: 0 } }]);
});

test('Library opens with ready looks and creates a whole-piece look without hidden placement', async ({ page }, testInfo) => {
  const { state } = await mockInstallingLibrary(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Ocean to playlist', exact: true })).toBeInViewport();
  await expect(page.getByRole('region', { name: 'Place patterns on your piece' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('library-ready-phone.png') });
  await page.getByRole('button', { name: 'Create a new pattern', exact: true }).click();
  await page.getByRole('button', { name: 'Use Fire', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Whole piece', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Add to playlist', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Add to playlist', exact: true })).toBeEnabled();
  expect(state.posts).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('library-create-phone.png') });
  await page.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your playlist' })).toBeVisible();
  expect(state.posts[0].targetIds).toEqual(['outer', 'inner']);
});


test('Library keeps Create visible above five saved patterns on a phone', async ({ page }) => {
  await mockLibraryCard(page);
  await page.route('http://lightweaver.local/api/patterns', route => route.fulfill({ json: { currentId: 'ocean', patterns: ['Ocean', 'Fire', 'Aurora', 'Plasma', 'Breathe'].map(label => ({ id: label.toLowerCase(), label, mode: 'procedural', zones: [] })) } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/client.html');
  await expect(page.getByText('Lights connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create a new pattern', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Add Ocean to playlist', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Create a new pattern', exact: true })).toHaveCount(1);
});
