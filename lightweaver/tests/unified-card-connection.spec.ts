import { expect, test } from '@playwright/test';
import { installHttpsStudio, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';

test('Find and footer share Connection with immediate USB recovery and retain network input', async ({ page }, testInfo) => {
  await installHttpsStudio(page, testBaseURL);
  await page.route(/http:\/\/(?:lightweaver\.local|192\.168\.)/, route => route.abort());
  await page.addInitScript(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {} });
  });
  await page.goto(`${STUDIO_ORIGIN}/#screen=card&section=setup`);
  await page.getByTestId('setup-connect-card').click();
  await expect(page).toHaveURL(/section=connection/);
  await expect(page.getByRole('heading', { name: 'Find your card', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find over USB', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Find on Wi-Fi', exact: true }).click();
  await expect(page.getByTestId('connection-message')).toContainText('same Wi-Fi');
  await page.getByRole('button', { name: 'Find over USB', exact: true }).click();
  await expect(page.getByTestId('connection-message')).toContainText('USB');
  await page.getByRole('button', { name: 'Other ways', exact: true }).click();
  await page.getByLabel('Card address').fill('192.168.18.70');
  await page.evaluate(() => { location.hash = '#screen=pattern'; });
  await page.getByTestId('card-link-status').click();
  await expect(page).toHaveURL(/section=connection/);
  await expect(page.getByLabel('Card address')).toHaveValue('192.168.18.70');
  await page.screenshot({ path: testInfo.outputPath('connection-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('connection-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
