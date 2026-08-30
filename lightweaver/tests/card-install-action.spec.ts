import { test, expect } from '@playwright/test';

// Card Home owns LED check and project install. install-project must land
// here — not on the firmware flash screen, and not only after opening
// Hardware settings.

test.beforeEach(async ({ page }) => {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
});

async function openCardInstallHome(page: { goto: Function; evaluate: Function; reload: Function }) {
  await page.goto('/#screen=card&section=setup&task=install-project', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('install-project shows LED check on Card Home, not firmware flash', async ({ page }) => {
  await openCardInstallHome(page);

  await expect(page.getByTestId('commissioning-step')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Find your connected card/i })).toHaveCount(0);
  await expect(page.getByText('Lightweaver hardware')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Set up your Lightweaver' })).toBeVisible();

  // The flow is on Home. Hardware settings exists as a tab (not yet folded)
  // but is not required to see check + install.
  await expect(page.getByRole('heading', { name: 'Hardware settings' })).toHaveCount(0);
  await expect(page.locator('[data-testid="start-led-check"], [data-testid="wire-find-strips"], [data-testid="layout-send-to-card"], [data-testid="unlock-and-check"]')).toBeVisible();
});
