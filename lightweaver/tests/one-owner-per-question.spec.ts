import { test, expect, type Page } from '@playwright/test';

// Card Home is the install. Hardware fold keeps recovery and calibration —
// card address and the strip colour check (the order itself is set on Card
// Home's Color order row). It must not offer a second
// "Install on card" primary. Deleting that row used to be withdrawn; this
// plan deletes it because Home now *is* that install.

const HARDWARE_ROUTE = '/#screen=card&section=settings';
const CARD_HOME = '/#screen=card';

test.beforeEach(async ({ page }) => {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
});

async function openHardware(page: Page) {
  await page.goto(HARDWARE_ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-hardware-fold')).toHaveAttribute('open', '');
  await expect(page.getByTestId('card-address-summary')).toBeVisible({ timeout: 20_000 });
}

test('Hardware fold has no primary Install on card row', async ({ page }) => {
  await openHardware(page);

  const fold = page.getByTestId('card-hardware-fold');
  await expect(fold.locator('.set-row', { hasText: 'Install on card' })).toHaveCount(0);
  await expect(fold.getByRole('button', { name: 'Install on card', exact: true })).toHaveCount(0);
  await expect(fold.getByRole('button', { name: 'Open card installer' })).toHaveCount(0);
  await expect(fold.getByRole('button', { name: 'Flash chip' })).toHaveCount(0);
  await expect(fold.getByRole('button', { name: 'Installer guide' })).toHaveCount(0);
});

test('Card Home gives connection to the setup journey without a duplicate install', async ({ page }) => {
  await page.goto(CARD_HOME, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('setup-connect-card')).toHaveCount(1);
  await expect(page.getByTestId('commissioning-step')).toHaveCount(0);
  await expect(page.getByTestId('layout-send-to-card')).toHaveCount(0);
});

test('the card address stays editable, because it is also the recovery path', async ({ page }) => {
  await openHardware(page);

  const address = page.getByTestId('card-address-summary').locator('input');
  await expect(address).toBeVisible();
  // Typing a raw IP is how an owner reaches a card whose name will not resolve.
  await address.fill('192.168.4.1');
  await expect(address).toHaveValue('192.168.4.1');
  // The hint has to say which job this is, or it reads as a second setup.
  await expect(page.locator('.set-row', { hasText: 'Card address' }).locator('.hh'))
    .toContainText('where Studio looks for it');
});

test('the colour-order picker is gone from Hardware; Card Home owns the order', async ({ page }) => {
  await openHardware(page);

  // One owner per question: the order is set on Card Home's Color order row
  // (three keys, pushed live and read back). Hardware keeps only the proof.
  await expect(page.getByTestId('color-order-summary')).toHaveCount(0);
  await expect(page.getByTestId('card-hardware-fold').locator('.set-row', { hasText: 'Color order' })).toHaveCount(0);
  await expect(page.getByTestId('card-hardware-fold').getByRole('button', { name: 'Check colors' })).toBeVisible();

  await page.goto(CARD_HOME, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('fact-color-keys')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('fact-color-keys')).toHaveCount(1);
});

test('the colour-order test deep link from the card still lands here', async ({ page }) => {
  await page.goto(`${HARDWARE_ROUTE}&tool=color-order`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-hardware-fold')).toHaveAttribute('open', '');
  await expect(page.getByTestId('strip-color-order')).toBeVisible({ timeout: 20_000 });
});
