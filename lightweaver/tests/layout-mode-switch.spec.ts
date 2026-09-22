import { test, expect } from '@playwright/test';

// Layout is Wire drawing only. Old Test & Install bookmarks open Card install.

async function gotoLayout(page: any, hash = '#screen=layout') {
  await page.route('http://lightweaver.local/**', (route: any) => route.abort());
  await page.route('http://192.168.4.1/**', (route: any) => route.abort());
  await page.goto(`/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function expectFreshCardInstallEntry(page: any) {
  await expect(page).toHaveURL(/#screen=card&section=setup&task=install-project/);
  const start = page.getByTestId('public-worker-start');
  await expect(start).toBeVisible();
  await expect(start.getByRole('button', { name: /set up the card/i })).toBeVisible();
  // This fixture deliberately clears every remembered card. A fresh browser
  // must find a card before it can offer the project-writing control.
  await expect(page.getByTestId('commissioning-step')).toHaveCount(0);
  await expect(page.getByTestId('layout-send-to-card')).toHaveCount(0);
  await expect(page.getByTestId('layout-primitive-picker')).toHaveCount(0);
}

test('Layout has no Test & Install tab and keyboard 2 does not open a second mode', async ({ page }) => {
  await gotoLayout(page);

  await expect(page.getByTestId('layout-mode-switch')).toHaveCount(0);
  await expect(page.getByTestId('layout-mode-wire')).toHaveCount(0);
  await expect(page.getByTestId('layout-mode-draw')).toHaveCount(0);
  await expect(page.getByTestId('layout-mode-size')).toHaveCount(0);
  await expect(page.getByTestId('layout-wire-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Install on card', exact: true })).toBeVisible();
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();

  await page.keyboard.press('2');
  await expect(page).not.toHaveURL(/mode=wire/);
  await expect(page).toHaveURL(/screen=layout/);
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  await expect(page.getByTestId('commissioning-step')).toHaveCount(0);
});

test('Wire tools stay on Layout as their own panel, not a second mode', async ({ page }) => {
  await gotoLayout(page);

  // Optional wiring controls stay on Layout without a mode switch.
  await page.getByTestId('layout-specs-trigger').click();
  const advanced = page.getByTestId('advanced-installation-tools');
  await expect(advanced).toBeVisible();
  await expect(advanced).toHaveJSProperty('open', false);
  await advanced.locator(':scope > summary').click();
  await expect(page.getByTestId('commissioning-step')).toHaveCount(0);
  // The deeper settings stay folded after opening Wiring & hardware.
  const power = page.getByTestId('wire-power-section');
  await expect(power).toBeVisible();
  await expect(power).toHaveJSProperty('open', false);
  await power.locator('summary').click();
  await expect(page.getByLabel('Power supply amps')).toBeVisible();
  await expect(page.getByLabel('Milliamps per LED')).toBeVisible();
});

test('the Check and install CTA opens Card install', async ({ page }) => {
  await gotoLayout(page);
  await page.getByTestId('layout-check-and-install').click();
  await expectFreshCardInstallEntry(page);
});

test('#screen=layout&mode=wire opens Card install, not a Layout tab', async ({ page }) => {
  await gotoLayout(page, '#screen=layout&mode=wire');

  await expectFreshCardInstallEntry(page);
  await expect(page.getByTestId('layout-mode-switch')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Find your connected card/i })).toHaveCount(0);
});

test('#screen=layout and mode=draw stay on the Wire drawing workspace', async ({ page }) => {
  await gotoLayout(page);
  await expect(page).toHaveURL(/screen=layout/);
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  await expect(page.getByTestId('layout-primitive-picker')).toBeVisible();

  await gotoLayout(page, '#screen=layout&mode=draw');
  await expect(page).toHaveURL(/screen=layout&mode=draw/);
  await expect(page.getByTestId('layout-check-and-install')).toBeVisible();
  await expect(page.getByTestId('commissioning-step')).toHaveCount(0);
});

test('drawing a strip stays on Layout; other screens are unaffected', async ({ page }) => {
  await gotoLayout(page);

  const drawBtn = page.getByTitle('Draw a new LED strip path on the artwork.');
  await drawBtn.click();
  await expect(drawBtn).toHaveClass(/active/);

  const svg = page.locator('.lw-viewport svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('canvas svg not found');
  await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * 0.08);
  await page.mouse.click(box.x + box.width * 0.14, box.y + box.height * 0.16);
  await expect(page.locator('.la-draw-hint')).toContainText('2 points');

  await page.keyboard.press('2');
  await expect(page.locator('.la-draw-hint')).toContainText('2 points');
  await expect(page).toHaveURL(/screen=layout/);

  await page.getByRole('button', { name: /Cancel \(Esc\)/ }).click();
  await expect(page.locator('.la-draw-hint')).toHaveCount(0);

  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.chips[aria-label="Target sections"]')).toBeVisible();
  await expect(page.locator('.rail-item.active')).toContainText('Patterns');
});
