import { expect, test, type Page, type Route } from '@playwright/test';

const session = { username: 'member', displayName: 'Studio member', role: 'customer', mustChangePassword: false };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, json: body });
}

async function installSignInFixture(page: Page, options: { cancelGoogle?: boolean; owner?: boolean } = {}) {
  let signedIn = options.owner === true;
  const activeSession = options.owner ? { ...session, role: 'owner' } : session;
  const accounts: unknown[] = [];
  const requests: Array<{ path: string; body?: unknown }> = [];
  await page.route('**/api/**', route => {
    const request = route.request();
    const { pathname: path } = new URL(request.url());
    if (path.startsWith('/api/account/') || path.startsWith('/api/library/')) {
      requests.push({ path, body: request.postData() ? request.postDataJSON() : undefined });
    }
    if (path === '/api/account/methods') return json(route, { enabled: true, google: true, email: true });
    if (path === '/api/account/session') {
      return signedIn ? json(route, { session: activeSession }) : json(route, { error: { code: 'unauthenticated' } }, 401);
    }
    if (path === '/api/account/email/start') return json(route, { accepted: true });
    if (path === '/api/account/email/verify') {
      if (request.postDataJSON().code !== '123456') {
        return json(route, { error: { code: 'invalid_code' } }, 401);
      }
      signedIn = true;
      return json(route, { session });
    }
    if (path === '/api/account/google/start') {
      signedIn = !options.cancelGoogle;
      return route.fulfill({ status: 302, headers: { location: `/?lwSignIn=${signedIn ? 'success' : 'error'}` } });
    }
    if (path === '/api/library/projects') return json(route, { projects: [] });
    if (path === '/api/library/accounts') {
      if (request.method() !== 'POST') return json(route, { accounts });
      const account = { ...request.postDataJSON(), id: 'account-new', username: 'added-member', status: 'active',
        mustChangePassword: false, createdAt: '2026-11-17T00:00:00Z', updatedAt: '2026-11-17T00:00:00Z' };
      accounts.push(account);
      return json(route, { account }, 201);
    }
    if (path.endsWith('/assignments')) return json(route, { assignments: [] });
    if (path === '/api/library/session') return json(route, { session: { email: 'legacy@example.test', role: 'owner' } });
    return json(route, { error: { code: 'not_found' } }, 404);
  });
  return requests;
}

async function renameDraft(page: Page, name: string) {
  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill(name);
  await page.getByTestId('project-name-input').press('Enter');
}

test('local save is available before email verification opens the private library', async ({ page }, testInfo) => {
  const requests = await installSignInFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#screen=layout');
  await renameDraft(page, 'Local canvas');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.getByRole('button', { name: 'Save in browser' }).click();
  const saved = page.getByTestId('workspace-notice');
  await expect(saved).toContainText('Local canvas saved in browser library');
  await saved.getByRole('button', { name: 'Dismiss notice' }).click();

  await page.getByTestId('topbar-projects').click();
  const projects = page.getByRole('dialog', { name: 'Projects' });
  await expect(projects.getByRole('button', { name: 'Open Local canvas' })).toBeVisible();
  const onlineShortcut = projects.getByRole('button', { name: 'Online library', exact: true });
  await expect(onlineShortcut).toBeInViewport();
  const projectPreview = testInfo.outputPath('projects-shortcut-390px.png');
  await page.screenshot({ path: projectPreview });
  await onlineShortcut.click();
  const library = projects.getByTestId('project-library-panel');
  await expect(library.getByRole('button', { name: 'Continue with Google' })).toBeVisible({ timeout: 3000 });
  await expect(library.getByRole('button', { name: 'Continue with Google' })).toBeInViewport();
  await expect(library.getByRole('button', { name: 'Create owner account' })).toHaveCount(0);
  await expect(library.getByLabel('Password')).toHaveCount(0);
  const signInPreview = testInfo.outputPath('passwordless-390px.png');
  await page.screenshot({ path: signInPreview });
  await testInfo.attach('passwordless phone options', { path: signInPreview, contentType: 'image/png' });
  await library.getByLabel('Email address').fill('member@example.test');
  await library.getByRole('button', { name: 'Email me a code' }).click();
  await expect(library.getByLabel('Sign-in code')).toBeVisible();
  await library.getByLabel('Sign-in code').fill('000000');
  await library.getByRole('button', { name: 'Verify code' }).click();
  await expect(library.getByRole('alert')).toContainText('code');
  await library.getByLabel('Sign-in code').fill('123456');
  await library.getByRole('button', { name: 'Verify code' }).click();
  await expect(library.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByTestId('project-name-edit')).toHaveText('Local canvas');
  expect(requests.map(entry => entry.path)).not.toContain('/api/library/session');
  expect(requests.filter(entry => entry.path === '/api/account/email/verify').map(entry => entry.body))
    .toEqual([{ email: 'member@example.test', code: '000000' }, { email: 'member@example.test', code: '123456' }]);
  await testInfo.attach('signed-in narrow Studio', { body: await page.screenshot(), contentType: 'image/png' });
});

test('Google return reopens Projects and restores the edited draft and route', async ({ page }) => {
  const requests = await installSignInFixture(page);
  await page.goto('/#screen=layout');
  await renameDraft(page, 'Draft before Google');
  await page.getByTestId('topbar-projects').click();
  await page.getByRole('button', { name: 'Continue with Google' }).click({ timeout: 3000 });
  await expect(page.getByRole('dialog', { name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByTestId('project-name-edit')).toHaveText('Draft before Google');
  await expect(page).toHaveURL(/\/#screen=layout$/);
  expect(requests.map(entry => entry.path)).toContain('/api/account/google/start');
  expect(requests.map(entry => entry.path)).not.toContain('/api/library/session');
});

test('a cancelled Google sign-in returns to the same draft with another sign-in option', async ({ page }) => {
  await installSignInFixture(page, { cancelGoogle: true });
  await page.goto('/#screen=layout');
  await renameDraft(page, 'Keep this draft');
  await page.getByTestId('topbar-projects').click();
  await page.getByRole('button', { name: 'Continue with Google' }).click({ timeout: 3000 });
  const projects = page.getByRole('dialog', { name: 'Projects' });
  await expect(projects.getByRole('alert')).toContainText('Google sign-in');
  await expect(projects.getByRole('button', { name: 'Email me a code' })).toBeVisible();
  await expect(page.getByTestId('project-name-edit')).toHaveText('Keep this draft');
});

test('owners add a buyer by email without a temporary password', async ({ page }) => {
  const requests = await installSignInFixture(page, { owner: true });
  await page.goto('/#screen=layout');
  await page.getByTestId('topbar-projects').click();
  const library = page.getByTestId('project-library-panel');
  await library.getByLabel('New account email').fill('buyer@example.test');
  await library.getByLabel('New account display name').fill('Artwork buyer');
  await library.getByLabel('New account role').selectOption('customer');
  await library.getByRole('button', { name: 'Add account' }).click();
  const account = library.getByTestId('account-row');
  await expect(account).toContainText('buyer@example.test');
  await expect(library.getByLabel('Temporary password')).toHaveCount(0);
  await expect(library.getByRole('button', { name: 'Reset password' })).toHaveCount(0);
  expect(requests.find(entry => entry.path === '/api/library/accounts' && entry.body)?.body)
    .toEqual({ email: 'buyer@example.test', displayName: 'Artwork buyer', role: 'customer' });
});
