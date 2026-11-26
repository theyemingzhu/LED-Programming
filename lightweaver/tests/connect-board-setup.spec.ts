import { expect, test, type Page } from '@playwright/test';

const status = {
  app: 'Lightweaver', provisioningContractVersion: 1,
  cardId: 'lw-aabbccddeeff', firmwareVersion: '1.4.0', buildId: 'a'.repeat(40),
  bootId: 'boot-board-setup', runtimePhase: 'ready', commandReady: true,
  outputReady: true, playbackReady: true, configValid: true, knownGoodProject: true,
  chipName: 'ESP32-S3', flashBytes: 16 * 1024 * 1024, psramBytes: 8 * 1024 * 1024,
  outputs: [{ pin: 15, pixels: 40 }], controls: { encoder: { a: 16 } },
  capabilities: { outputTopology: { version: 1, outputPins: [15, 16, 17, 39] } },
};
const referenceId = 'espressif-devkitc-1-n16r8-v1.1';

async function connectCard(page: Page, readiness = status, firmwareInfo = readiness, methods: string[] = []) {
  let connected = false;
  await page.route('http://lightweaver.local/api/**', async route => {
    if (!connected) return route.abort();
    methods.push(route.request().method());
    // Pairing reads firmware-info too. Only change the later, independent check
    // so the test exercises the board review's own identity boundary.
    const paired = route.request().url().endsWith('/firmware-info')
      && await page.evaluate(() => localStorage.getItem('lw_card_identity_v1'));
    return route.fulfill({ json: paired ? firmwareInfo : readiness });
  });
  await page.goto('/#screen=card&section=overview');
  await page.getByRole('button', { name: /^Connect Lightweaver/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver' })).toBeVisible();
  connected = true;
  await page.evaluate(async readiness => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const { normalizeCardIdentity } = await import('/src/lib/cardIdentity.js');
    const link = getSharedCardLink();
    const host = 'lightweaver.local';
    link.dispatch({ type: 'direct-status', connected: true, host, readiness,
      card: normalizeCardIdentity(readiness, host) });
  }, readiness);
  await page.getByRole('dialog', { name: 'Connect Lightweaver' }).getByRole('button', { name: 'Connect', exact: true }).click();
  return page.getByTestId('connect-board-setup');
}

test('an ambiguous card can be matched to its printed revision without writing to the card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const methods: string[] = [];
  const board = await connectCard(page, status, status, methods);
  const useBoard = board.getByRole('button', { name: 'Use this board' });
  await expect(board.getByText(/Which version is printed/)).toBeVisible();
  const progress = page.getByTestId('installer-setup-progress');
  await expect(progress.locator('[aria-current="step"]')).toHaveText('2Choose board');
  await expect(board.getByRole('figure', { name: 'Where to find the board revision' })).toContainText('Turn the board over');
  await expect(board.getByText('Look for RGB@IO38 on the front')).toBeVisible();
  await expect(useBoard).toBeDisabled();
  await board.getByRole('button', { name: 'Browse boards' }).click();
  const search = board.getByRole('searchbox', { name: 'Search board profiles' });
  await search.fill('v1.1');
  const revision = board.getByRole('button', { name: 'ESP32-S3-DevKitC-1 N16R8 v1.1' });
  await expect(revision).toBeVisible();
  await expect(board.getByRole('button', { name: /v1.0/ })).toHaveCount(0);
  await revision.click();
  await useBoard.click();
  await expect(board.getByRole('heading', { name: 'ESP32-S3-DevKitC-1 N16R8 v1.1' })).toBeFocused();
  await expect(board.getByText('Free for LED data', { exact: true }).locator('..')).toContainText('J1 pin 10 · GPIO 17');
  await expect(board.getByText('Shared with board functions', { exact: true }).locator('..')).toHaveText('Shared with board functionsGPIO 39');
  await expect(board.getByText('GPIO 15')).toBeVisible();
  await expect(board.getByText('Used by the dial')).toBeVisible();
  await expect(board.getByText('Used by the dial').locator('..')).toContainText('GPIO 16');
  await expect(board.getByRole('button', { name: 'Connect strips' })).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(methods).toContain('GET');
  expect(methods.every(method => method === 'GET')).toBe(true);
  const confirmed = await page.evaluate(cardId => (
    JSON.parse(localStorage.getItem('lw-board-profiles-v1') || '{}').confirmations?.[cardId]
  ), status.cardId);
  expect(confirmed).toEqual({ id: referenceId, revision: 1 });
  await board.getByRole('button', { name: 'Change board' }).click();
  await expect(board.getByRole('heading', { name: 'Previously used' })).toBeVisible();
  await expect(search).toBeFocused();
});

test('a firmware reply from a different card stays unconfirmed', async ({ page }) => {
  const board = await connectCard(page, status, { ...status, cardId: 'lw-aabbccddee00' });
  await expect(board.getByRole('alert')).toContainText('different card or firmware session');
  await expect(board.getByRole('button', { name: 'Use this board' })).toHaveCount(0);
  await expect(board.getByRole('button', { name: 'Connect strips' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lw-board-profiles-v1'))).toBeNull();
});

test('current signed firmware without a pin list uses standard pins and excludes live controls', async ({ page }) => {
  const legacy = { ...status, capabilities: {}, limits: { outputs: 4 } };
  const board = await connectCard(page, legacy);
  await board.getByRole('button', { name: 'ESP32-S3-DevKitC-1 N16R8 v1.1' }).click();
  await board.getByRole('button', { name: 'Use this board' }).click();
  await expect(board.getByText('Free for LED data').locator('..')).toContainText('GPIO 17');
  await expect(board.getByText('Free for LED data').locator('..')).not.toContainText('GPIO 16');
  await expect(board.getByText('LEDs already set up').locator('..')).toContainText('GPIO 15');
  await expect(board.getByText('This card supports up to 4 LED outputs.')).toBeVisible();
});

test('a blank card with an exact reported revision continues straight to finding strips', async ({ page }) => {
  const blank = {
    ...status, runtimePhase: 'factory', source: 'defaults', knownGoodProject: false,
    commandReady: false, outputReady: false, playbackReady: false, outputs: [],
    limits: { outputs: 6 }, boardProfile: { id: referenceId, revision: 1 },
  };
  const board = await connectCard(page, blank);
  await expect(board.getByText(/Your card reports/)).toContainText('ESP32-S3-DevKitC-1 N16R8 v1.1');
  await board.getByRole('button', { name: 'Use this board' }).click();
  await expect(board.getByText('This card supports up to 6 LED outputs.')).toBeVisible();
  await board.getByRole('button', { name: 'Connect strips' }).click();
  await expect(page).toHaveURL(/#screen=discovery&installer=1/);
  await expect(page.getByTestId('strip-discovery').getByTestId('installer-setup-progress').locator('[aria-current="step"]')).toHaveText('3Connect strips');
});

test('the suggested pin waits for the worker to confirm before touching the card', async ({ page }) => {
  const methods: string[] = [];
  const board = await connectCard(page, status, status, methods);
  await board.getByRole('button', { name: 'ESP32-S3-DevKitC-1 N16R8 v1.1' }).click();
  await board.getByRole('button', { name: 'Use this board' }).click();
  await board.getByRole('button', { name: 'Connect strips' }).click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw&installer=1/);
  const liveControls = page.waitForResponse(response => response.url().endsWith('/firmware-info'));
  await page.evaluate(() => { window.location.hash = '#screen=discovery&installer=1&pin=16'; });
  await liveControls;
  const discovery = page.getByTestId('strip-discovery');
  await expect(discovery.getByText('GPIO 16 is unavailable for LED data. Pick another pin.')).toBeVisible();
  await expect(discovery.getByRole('heading', { name: 'Count the strip on GPIO 16?' })).toHaveCount(0);
  await expect(discovery.getByTestId('discovery-probe-17')).toBeVisible();
  await expect(discovery.getByTestId('discovery-probe-16')).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = '#screen=layout&mode=draw&installer=1'; });
  await expect(discovery).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = '#screen=discovery&installer=1&pin=17'; });
  await expect(discovery.getByRole('heading', { name: 'Count the strip on GPIO 17?' })).toBeVisible();
  await expect(discovery.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled();
  expect(methods.every(method => method === 'GET')).toBe(true);
});
