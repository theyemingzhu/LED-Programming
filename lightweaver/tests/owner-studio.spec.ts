import { test, expect } from '@playwright/test';
import { handleOwnerStudio } from '../functions/api/owner/studio.js';

test('owner entry signs in through existing account API and never reveals tools before success', async ({ page }) => {
  let signedIn = false;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/owner/studio**', async route => {
    const headers = { ...route.request().headers(), ...(signedIn ? { cookie: `__Host-lightweaver_session=${'a'.repeat(43)}` } : {}) };
    const response = await handleOwnerStudio({ request: new Request(route.request().url(), { headers }), env: { ASSETS: { fetch: async () => new Response('<h1>Owner workspace</h1>', { headers: { 'content-type': 'text/html' } }) } } }, { accountStore: { authenticateSession: async () => signedIn ? { role: 'owner', mustChangePassword: false } : null } });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.route('**/api/account/login', async route => {
    const body = route.request().postDataJSON();
    signedIn = body.username === 'owner' && body.password === 'correct-password';
    await route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { session: { role: 'owner' } } : { error: { message: 'Invalid username or password.' } } });
  });
  await page.goto('/api/owner/studio');
  await expect(page.getByRole('heading', { name: 'Owner tools', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to player' })).toHaveAttribute('href', 'https://light.mandalacodes.com/');
  await page.getByLabel('Username').fill('owner'); await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Open owner tools' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid username or password.');
  await expect(page.getByRole('heading', { name: 'Owner workspace' })).toHaveCount(0);
  await page.getByLabel('Password', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Open owner tools' }).click();
  await expect(page.getByRole('heading', { name: 'Owner workspace' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('authenticated entry boots the real Studio from its absolute asset paths', async ({ page, request }) => {
  const asset = await request.get('/');
  expect(asset.status()).toBe(200);
  const html = await asset.text();
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) expect(match[1]).toMatch(/^\//);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/owner/studio', async route => {
    const response = await handleOwnerStudio({ request: new Request(route.request().url(), { headers: { cookie: `__Host-lightweaver_session=${'a'.repeat(43)}` } }), env: { ASSETS: { fetch: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) } } }, { accountStore: { authenticateSession: async () => ({ role: 'owner', mustChangePassword: false }) } });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.goto('/api/owner/studio');
  await expect(page.locator('#root > *').first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/api/owner/studio');
  expect(errors).toEqual([]);
});
