import { expect, test, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MIN_TAP } from './harness/tapSize';

const home = '/#screen=card&section=overview';
const setup = '/#screen=card&section=setup';
const hardware = '/#screen=card&section=settings';
const support = '/#screen=card&section=support';
const recovery = support + '&tool=recovery';
const evidenceDir = process.env.LW_CARD_TOOLS_EVIDENCE;

test.beforeEach(async ({ page }) => {
  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
});

for (const form of ['desktop', 'phone']) {
  test(`Card tools work from Home with no card (${form})`, async ({ browser, baseURL }) => {
    const phone = devices['Pixel 5'];
    const context = await browser.newContext(form === 'phone'
      ? { ...phone, viewport: { width: 390, height: 844 }, baseURL, serviceWorkers: 'block' }
      : { viewport: { width: 1440, height: 900 }, baseURL, serviceWorkers: 'block' });
    try {
      await context.route('http://lightweaver.local/**', route => route.abort());
      await context.route('http://192.168.4.1/**', route => route.abort());
      const mutations: string[] = [];
      context.on('request', request => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) &&
            /\/api\//.test(request.url())) {
          mutations.push(request.url());
        }
      });
      const page = await context.newPage();
      await page.goto(home);
      const cardTools = page.getByRole('navigation', { name: 'Card tools' });
      const recoveryEntry = cardTools.getByRole('button', { name: 'Recovery', exact: true });
      await expect(recoveryEntry).toBeInViewport();
      await expect(cardTools.locator('details, summary, [aria-expanded]')).toHaveCount(0);
      if (form === 'phone') await context.setOffline(true);
      const bounds = await recoveryEntry.boundingBox();
      if (form === 'phone') expect(bounds?.height).toBe(MIN_TAP);
      if (evidenceDir) {
        mkdirSync(evidenceDir, { recursive: true });
        await page.screenshot({ scale: 'css', path: resolve(evidenceDir, `home-${form}.png`) });
        console.log(`${form} Recovery button ${JSON.stringify(bounds)}`);
      }

      await recoveryEntry.click();
      await expect(page).toHaveURL(recovery);
      await expect(page.getByRole('heading', { name: 'Recovery', level: 1 })).toBeFocused();
      await expect(page.getByRole('button', { name: 'Recover lights', exact: true })).toHaveCount(0);
      if (evidenceDir) await page.screenshot({ scale: 'css', path: resolve(evidenceDir, `recovery-${form}.png`) });
      await page.getByRole('button', { name: 'Reconnect card', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Reconnect card', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'Back to Card' }).click();
      await expect(page).toHaveURL(home);
      await expect(page.getByTestId('card-workspace-heading')).toBeFocused();

      const hardwareEntry = cardTools.getByRole('button', { name: 'Hardware', exact: true });
      if (form === 'phone') await hardwareEntry.tap();
      else await hardwareEntry.press('Enter');
      await expect(page).toHaveURL(hardware);
      await expect(page.getByRole('heading', { name: 'Hardware settings' })).toBeFocused();
      await expect(page.getByTestId('card-address-summary')).toBeInViewport();
      if (evidenceDir) await page.screenshot({ scale: 'css', path: resolve(evidenceDir, `hardware-${form}.png`) });
      await expect(page.getByTestId('card-facts')).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL(home);
      await expect(page.getByTestId('card-workspace-heading')).toBeFocused();

      await cardTools.getByRole('button', { name: 'Support' }).click();
      await expect(page).toHaveURL(support);
      await expect(page.getByRole('heading', { name: 'Support', level: 1 })).toBeFocused();
      if (evidenceDir) await page.screenshot({ scale: 'css', path: resolve(evidenceDir, `support-${form}.png`) });
      await page.getByRole('button', { name: 'Connection log', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Connection log', level: 1 })).toBeFocused();
      await expect(page.getByTestId('connection-log-text')).toBeVisible();
      await page.getByRole('button', { name: 'Back to Support' }).click();
      await expect(page).toHaveURL(support);
      await page.getByRole('button', { name: 'Back to Card' }).click();
      await expect(page).toHaveURL(home);
      expect(mutations).toEqual([]);
      expect(await page.locator('.card-workspace-body').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    } finally {
      await context.close();
    }
  });
}

test('legacy Hardware and Advanced bookmarks keep their tool and return destinations', async ({ page }) => {
  await page.goto(hardware + '&tool=color-order');
  await expect(page.getByTestId('strip-color-order')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Card' }).click();
  await expect(page).toHaveURL(setup);

  await page.goto(support);
  for (const label of ['Technician firmware & logs', 'GPIO & install guide', 'Designer JSON', 'Recovery', 'Deployment check', 'Connection log', 'Batch production']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Back to Card' }).click();
  await expect(page).toHaveURL(setup);

  for (const [route, heading] of [['/#screen=flash', 'Manual firmware tools'], ['/#screen=installer', 'Worker install']]) {
    await page.goto(route);
    await expect(page).toHaveURL(route);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Support' }).click();
    await expect(page).toHaveURL(support);
  }
});

test('Card tools return to the exact setup task they came from', async ({ page }) => {
  const taskRoute = setup + '&task=install-project';
  await page.goto(taskRoute);
  await page.getByRole('button', { name: 'Hardware', exact: true }).click();
  await expect(page).toHaveURL(hardware);
  await page.getByRole('button', { name: 'Back to Card' }).click();
  await expect(page).toHaveURL(taskRoute);
  await expect(page.getByTestId('card-workspace-heading')).toBeFocused();
});
