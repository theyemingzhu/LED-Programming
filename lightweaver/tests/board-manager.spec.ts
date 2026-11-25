import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const route = '/#screen=card&section=boards';
const v10 = 'espressif-devkitc-1-n16r8-v1.0';
const v11 = 'espressif-devkitc-1-n16r8-v1.1';

async function dragPin(page: Page, handle: Locator, contact: Locator, touch: boolean) {
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  try {
    if (cdp) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await contact.evaluate(node => node.scrollIntoView({ block: 'center' }));
    const source = (await handle.boundingBox())!;
    const target = (await contact.boundingBox())!;
    const from = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
      await expect(contact.locator('..')).toHaveAttribute('data-swap-target', 'true', { timeout: 3000 });
      await expect(page.getByText('Release to swap', { exact: true })).toBeVisible();
      await expect(page.getByText('J1 pin 2 (GPIO 16) ↔ J1 pin 1 (GROUND)', { exact: true })).toBeVisible();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await expect(contact.locator('..')).toHaveAttribute('data-swap-target', 'true', { timeout: 3000 });
      await expect(page.getByText('Release to swap', { exact: true })).toBeVisible();
      await expect(page.getByText('J1 pin 2 (GPIO 16) ↔ J1 pin 1 (GROUND)', { exact: true })).toBeVisible();
      await page.mouse.up();
    }
  } finally {
    await cdp?.detach();
  }
}

for (const width of [1280, 390]) {
  test(`select, create, reorder, reopen and transfer a profile at ${width}px`, async ({ page, browser, baseURL }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/#screen=card&section=setup');
    await page.getByRole('button', { name: 'Board Manager' }).click();
    await expect(page).toHaveURL(/#screen=card&section=boards$/);
    await expect(page.getByRole('heading', { name: 'Board Manager' })).toBeVisible();

    const profile = page.getByRole('combobox', { name: 'Board profile', exact: true });
    await profile.selectOption(v10);
    await expect(page.getByRole('button', { name: /GPIO 48 · Onboard RGB/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /GPIO 38 · Onboard RGB/ })).toHaveCount(0);
    await profile.selectOption(v11);
    const rgbPin = page.getByRole('button', { name: /GPIO 38 · Onboard RGB/ });
    await rgbPin.evaluate(element => element.scrollIntoView({ block: 'center' }));
    const pinTop = (await rgbPin.boundingBox())!.y;
    await rgbPin.click();
    const inspector = page.getByRole('dialog', { name: 'Pin details' });
    await expect(inspector.getByText('Can carry LED data. Check that the pin is free before wiring.')).toBeVisible();
    expect(Math.abs((await rgbPin.boundingBox())!.y - pinTop)).toBeLessThan(2);
    await inspector.getByRole('button', { name: 'Done' }).click();
    expect(Math.abs((await rgbPin.boundingBox())!.y - pinTop)).toBeLessThan(2);
    await expect(rgbPin).toBeFocused();
    for (const [gpio, signal] of [[10, 'CS'], [11, 'MOSI'], [12, 'SCK'], [13, 'MISO']]) {
      await expect(page.getByRole('button', { name: new RegExp(`GPIO ${gpio} · General-purpose pin · Lightweaver microSD ${signal}`) })).toBeVisible();
    }

    await profile.selectOption('espressif-esp32-s3-usb-otg-v1.0');
    await expect(page.getByRole('region', { name: 'J5 odd' }).getByRole('button', { name: /J5 odd 3: GPIO 39/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'microSD' }).getByRole('button', { name: /CMD · SDIO/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Lightweaver microSD/ })).toHaveCount(0);
    await profile.selectOption(v11);
    await page.getByRole('button', { name: 'Copy this board' }).click();
    await expect(page.getByLabel('Board name')).toHaveValue('ESP32-S3-DevKitC-1 N16R8 copy');
    const paired = await Promise.all(['J1', 'J3'].map(group =>
      page.getByRole('button', { name: new RegExp(`^${group} 10:`) }).boundingBox()));
    expect(Math.abs(paired[0]!.y - paired[1]!.y)).toBeLessThan(1);
    await page.getByRole('button', { name: /GPIO 10 · General-purpose pin · Lightweaver microSD CS/ }).click();
    await expect(page.getByLabel('Installation function')).toHaveValue('microSD CS');
    await page.getByLabel('Installation function').selectOption('LED data');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /GPIO 10 · General-purpose pin · Lightweaver LED data/ })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel edit' }).click();
    await expect(page.getByRole('button', { name: /GPIO 10 · General-purpose pin · Lightweaver microSD CS/ })).toBeVisible();
    await page.getByRole('button', { name: 'Start blank' }).click();
    await page.getByLabel('Board name').fill('Supplier variant');
    await page.getByRole('button', { name: 'Board details' }).click();
    await page.getByLabel('Manufacturer').fill('Example Maker');
    await page.getByLabel('PCB revision').fill('B');
    await page.getByLabel('Supplier or listing').fill('Example Store');
    await page.getByLabel('Chip', { exact: true }).fill('ESP32-S3');
    await page.getByLabel('Module marking').fill('ESP32-S3-WROOM-1-N16R8');
    await page.getByLabel(/Source links/).fill('https://example.com/schematic.pdf');
    await page.getByRole('dialog', { name: 'Board details' }).getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Add pin to J1' }).click();
    await page.getByLabel('Pin label').fill('GROUND');
    await page.getByRole('combobox', { name: 'What it does' }).selectOption('ground');
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button', { name: 'Add pin to J1' }).click();
    await page.getByLabel('Pin label').fill('DATA');
    await page.getByLabel('Pin number', { exact: true }).fill('16');
    await page.getByRole('combobox', { name: 'What it does' }).selectOption('gpio');
    await page.getByLabel('Lightweaver assignment note').fill('Planned strip data');
    await page.getByRole('button', { name: 'Done' }).click();
    await dragPin(page, page.getByRole('button', { name: 'Swap J1 2: DATA', exact: true }),
      page.getByRole('button', { name: /^J1 1: GROUND/ }), width === 390);
    await expect(page.getByRole('button', { name: /^J1 1: DATA/ })).toBeVisible();
    await expect(page.getByText('Swapped · Save profile to keep the change')).toBeVisible();
    await page.getByRole('button', { name: 'Swap J1 1: DATA', exact: true }).press('Enter');
    await page.getByRole('button', { name: /^J1 2: GROUND/ }).press('Enter');
    const move = page.getByRole('dialog', { name: 'Move or swap pin' });
    await expect(move.getByText('J1 pin 1 (GPIO 16)', { exact: true })).toBeVisible();
    await expect(move.getByRole('definition').filter({ hasText: 'J1 pin 2 (GROUND)' })).toBeVisible();
    await expect(page.locator('[data-board-pin="0:0"]')).toContainText('DATA');
    await move.getByRole('button', { name: 'Apply swap' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^J1 2: DATA/ })).toBeVisible();
    await page.getByRole('button', { name: /^J1 2: DATA/ }).click();
    await page.getByRole('button', { name: 'Move or swap pin' }).click();
    await move.getByRole('combobox', { name: 'Move to' }).selectOption('0:0');
    await expect(move.getByText('J1 pin 1', { exact: true })).toBeVisible();
    await move.getByRole('button', { name: 'Apply move' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^J1 1: DATA/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add pin group' }).click();
    await page.getByLabel('Group name').fill('J2');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /^J1 2: GROUND/ }).click();
    await page.getByRole('button', { name: 'Move or swap pin' }).click();
    await move.getByRole('combobox', { name: 'Move to' }).selectOption({ label: 'End of J2' });
    await expect(move.getByText('J2 pin 1', { exact: true })).toBeVisible();
    await move.getByRole('button', { name: 'Apply move' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: /^J2 1: GROUND/ })).toBeVisible();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Saved in this browser · profile revision 1.')).toBeVisible();

    await page.getByRole('button', { name: 'Back to Card' }).click();
    await page.getByRole('button', { name: 'Board Manager' }).click();
    await profile.selectOption({ label: 'Supplier variant B (Example Store)' });
    await page.getByRole('button', { name: 'Edit profile' }).click();
    await page.getByRole('button', { name: /^J1 1: DATA/ }).click();
    await expect(page.getByLabel('Lightweaver assignment note')).toHaveValue('Planned strip data');
    await page.getByLabel('Board signal or note').fill('Header breakout');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Save profile' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click(),
    ]);
    const bytes = await readFile((await download.path())!);
    const payload = JSON.parse(bytes.toString());
    expect(payload.version).toBe(1);
    expect(payload.profile.revision).toBe(2);
    expect(payload.profile.groups[0].pins[0]).toMatchObject({ gpio: 16, detail: 'Header breakout' });

    const emptyContext = await browser.newContext({ baseURL, viewport: { width, height: 850 } });
    try {
      const importPage = await emptyContext.newPage();
      await importPage.goto(route);
      await importPage.getByLabel('Import board profile JSON file').setInputFiles({
        name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes,
      });
      await expect(importPage.getByText('Imported and saved in this browser.')).toBeVisible();
      await importPage.getByRole('button', { name: /^J1 1: DATA/ }).click();
      await expect(importPage.getByText('This pin is outside the LED pin list.')).toBeVisible();
      await expect(importPage.getByRole('dialog').getByText('Planned strip data')).toBeVisible();
      expect(await importPage.evaluate(() => {
        const region = document.querySelector('.lw-board-manager')!;
        return region.scrollWidth <= region.clientWidth;
      })).toBe(true);
    } finally {
      await emptyContext.close();
    }
  });
}

for (const exact of [false, true]) test(`checks a connected card automatically and ${exact ? 'selects its reported profile' : 'asks which PCB revision to use'}`, async ({ page }) => {
  const cardId = 'lw-aabbccddeeff';
  const host = 'lightweaver.local';
  const status = {
    app: 'Lightweaver', provisioningContractVersion: 1, cardId, firmwareVersion: '1.2.8',
    buildId: 'a'.repeat(40), bootId: 'boot-1', runtimePhase: 'ready', commandReady: true,
    outputReady: true, playbackReady: true, configValid: true, knownGoodProject: true,
    ...(exact ? { boardProfile: { id: v10, revision: 1 } } : {}),
    outputs: [{ pin: 15, pixels: 40 }],
    controls: { encoder: { a: 16 } },
    capabilities: { outputTopology: { version: 1, outputPins: [15, 16, 17] } },
  };
  const methods: string[] = [];
  await page.route(`http://${host}/api/**`, async request => {
    methods.push(request.request().method());
    await request.fulfill({ json: status });
  });
  await page.goto(route);
  await expect(page.getByRole('heading', { name: 'Board Manager', exact: true })).toBeVisible();
  await page.evaluate(async ({ host, status }) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const link = getSharedCardLink();
    const verified = { type: 'card-verified', via: 'direct', host, readiness: status, card: { id: status.cardId } };
    link.dispatch(verified);
    link.dispatch(verified);
  }, { host, status });
  const selector = page.getByRole('combobox', { name: 'Board profile', exact: true });
  if (exact) {
    await expect(selector).toHaveValue(v10);
    await expect(page.getByText(/Your card reports ESP32-S3-DevKitC-1/)).toBeVisible();
  } else {
    await expect(page.getByText('Check the name and version printed on your board. Choose the matching map below.')).toBeVisible();
    await expect(selector).toHaveValue(v11);
    await page.getByRole('button', { name: 'ESP32-S3-DevKitC-1 N16R8 v1.0', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Use this board' }).click();
  const ledPins = page.getByRole('region', { name: 'LED pins' });
  await expect(ledPins.getByText(/Free now.*GPIO 17/)).toBeVisible();
  await expect(ledPins.getByText(/In use.*GPIO 15.*GPIO 16/)).toBeVisible();
  await expect(ledPins.getByRole('link', { name: 'Open Wiring' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Card' }).click();
  await expect(page.getByText('Saved for this card')).toBeVisible();
  await page.getByRole('button', { name: 'Board Manager' }).click();
  await expect(page.getByRole('combobox', { name: 'Board profile', exact: true })).toHaveValue(v10);
  expect(methods.length).toBeGreaterThan(0);
  expect(methods.every(method => method === 'GET')).toBe(true);
});
