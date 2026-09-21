import { test, expect } from '@playwright/test';

// Card Home owns project install once a card is available. A deep install
// route must not bypass the fresh worker's truthful first action when there
// is no connected or remembered card.

test.beforeEach(async ({ page }) => {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
});

async function openCardInstallHome(page: { goto: Function; evaluate: Function; reload: Function }) {
  await page.goto('/#screen=card&section=setup&task=install-project', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('install-project keeps card setup first when Studio has no card', async ({ page }) => {
  await openCardInstallHome(page);

  await expect(page.getByTestId('public-worker-start')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start Lightweaver' })).toBeVisible();
  await expect(page.getByTestId('public-worker-start').getByRole('button', { name: /set up the card/i })).toBeVisible();
  await expect(page.getByTestId('commissioning-step')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Find your connected card/i })).toHaveCount(0);
  // Home carries no kicker; the status module is its name-plate.
  await expect(page.getByText('Lightweaver hardware')).toHaveCount(0);
  await expect(page.getByTestId('card-workspace-heading')).toBeVisible();

  // Setup is on Home. Hardware is a fold, not a second install page.
  await expect(page.getByRole('heading', { name: 'Hardware settings' })).toHaveCount(0);
  await expect(page.getByTestId('card-hardware-fold')).toBeVisible();
});
