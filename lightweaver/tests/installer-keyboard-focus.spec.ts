import { expect, test, type Locator, type Page } from '@playwright/test';
import { installReplacementFixture } from './harness/replacementFixture';

test.use({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true });

async function expectRestoredFocus(page: Page, target: Locator) {
  await expect(target).toBeFocused();
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }));
  await expect(target).toBeFocused();
}

async function cardHome(page: Page) {
  const fixture = await installReplacementFixture(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Connect this card', exact: true }).press('Enter');
  await page.goto('/#screen=card&section=overview');
  return fixture;
}

async function openBeforePairingCompletes(page: Page) {
  await installReplacementFixture(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  const pair = page.getByRole('button', { name: 'Connect this card', exact: true });
  await expect(pair).toBeEnabled();
  // Hold every status read so a background poll cannot consume the pairing gate.
  let releaseStatus = () => {};
  const statusGate = new Promise<void>(resolve => { releaseStatus = resolve; });
  await page.route('**/api/status', async route => {
    await statusGate;
    await route.fallback();
  });
  try {
    await pair.press('Enter');
    await page.goto('/#screen=card&section=overview');
    // Card Home announces the new section before keyboard navigation resumes.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    const origin = page.getByTestId('fact-outputs').getByRole('link', { name: 'Change wiring', exact: true });
    await origin.focus();
    await expect(origin).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Find my strips' });
    await expect(dialog.getByRole('heading', { name: /^(Watch your strip|Pick the LED pin)\.$/ })).toBeFocused();
    return { origin, dialog, releaseStatus };
  } catch (error) {
    releaseStatus();
    throw error;
  }
}

test('ordinary light check starts on the chooser, wraps Tab, and returns to Change wiring', async ({ page }) => {
  const { origin, dialog, releaseStatus } = await openBeforePairingCompletes(page);
  releaseStatus();
  const title = dialog.getByRole('heading', { name: 'Configured pins', exact: true });
  await expect(title).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Test GPIO 15', exact: true })).toBeFocused();

  const minimize = dialog.getByRole('button', { name: 'Minimize', exact: true });
  await minimize.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Disconnect card', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(minimize).toBeFocused();

  await page.keyboard.press('Enter');
  const dock = page.getByRole('region', { name: 'Light check dock' });
  await expect(dock.getByRole('button', { name: 'Restore', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(title).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expectRestoredFocus(page, origin);
});

test('pairing completion preserves focus when the user has moved to a dialog action', async ({ page }) => {
  const { dialog, releaseStatus } = await openBeforePairingCompletes(page);
  const minimize = dialog.getByRole('button', { name: 'Minimize', exact: true });
  try {
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Close light check', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(minimize).toBeFocused();
  } finally {
    releaseStatus();
  }
  await expect(dialog.getByRole('heading', { name: 'Configured pins', exact: true })).toBeVisible();
  await expect(minimize).toBeFocused();
});

test('direct Replace starts on New pin and Escape returns to the chooser before closing', async ({ page }) => {
  const { card } = await cardHome(page);
  const origin = page.getByTestId('fact-outputs').getByRole('link', { name: 'Replace GPIO 38', exact: true });
  await origin.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Find my strips' });
  const target = dialog.getByRole('combobox', { name: 'New pin', exact: true });
  await expect(target).toBeFocused();
  await expect(target).toHaveValue('17');
  await page.keyboard.press('ArrowDown');
  await expect(target).toHaveValue('18');

  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('heading', { name: 'Configured pins' })).toBeFocused();
  const replace = dialog.getByRole('button', { name: 'Replace GPIO 38', exact: true });
  await replace.press('Enter');
  await expect(target).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(replace).toBeFocused();
  await replace.press('Enter');
  await expect(target).toBeFocused();
  await dialog.getByRole('button', { name: 'Minimize', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(replace).toBeFocused();

  await dialog.getByRole('button', { name: 'Close light check', exact: true }).press('Enter');
  await expect(dialog).toHaveCount(0);
  await expectRestoredFocus(page, origin);
  expect(card.requests.filter(request => request.method === 'POST' && request.path.startsWith('/api/wiring/'))).toEqual([]);
});

test('protected replacement retains keyboard access through minimize, restore, Keep and Test', async ({ page }) => {
  await cardHome(page);
  await page.getByTestId('fact-outputs').getByRole('link', { name: 'Replace GPIO 38', exact: true }).press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Find my strips' });
  const overlay = page.getByTestId('card-setup-overlay');
  const start = overlay.getByRole('button', { name: 'Test replacement', exact: true });
  const keep = overlay.getByRole('button', { name: 'Keep this pin', exact: true });
  const previous = overlay.getByRole('button', { name: 'Restore previous setup', exact: true });
  const stop = overlay.getByRole('button', { name: 'Stop lights', exact: true });

  await expect(start).toBeEnabled();
  await start.press('Enter');
  await expect(keep).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(keep).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Light check is active' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Minimize', exact: true }).press('Enter');
  await expect(overlay).toHaveAttribute('aria-modal', 'true');
  await expect(overlay.getByRole('button', { name: 'Restore', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(stop).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(overlay.getByRole('button', { name: 'Restore', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(keep).toBeFocused();

  await previous.press('Enter');
  await expect(overlay.getByTestId('replacement-status')).toHaveText('The card confirmed its previous setup.');
  await expect(overlay.getByRole('combobox', { name: 'New pin', exact: true })).toBeFocused();

  await expect(start).toBeEnabled();
  await start.press('Enter');
  await expect(keep).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(overlay.getByTestId('replacement-status')).toHaveText('GPIO 17 saved and verified on the card.');
  await expect(overlay.getByRole('heading', { name: 'Configured pins' })).toBeFocused();
  const testPin = overlay.getByRole('button', { name: 'Test GPIO 17', exact: true });
  await testPin.press('Enter');
  await expect(overlay.getByRole('heading', { name: 'Did the strip on GPIO 17 light up?', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(overlay.getByRole('button', { name: 'Yes', exact: true })).toBeFocused();
  await overlay.getByRole('button', { name: 'Try another pin', exact: true }).press('Enter');
  await expect(testPin).toBeFocused();
});

test('closing after a saved move focuses Change wiring when the original pin link is gone', async ({ page }) => {
  await cardHome(page);
  const facts = page.getByTestId('fact-outputs');
  const origin = facts.getByRole('link', { name: 'Replace GPIO 38', exact: true });
  await origin.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Find my strips' });
  const start = dialog.getByRole('button', { name: 'Test replacement', exact: true });
  await expect(start).toBeEnabled();
  await start.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Keep this pin', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByTestId('replacement-status')).toHaveText('GPIO 17 saved and verified on the card.');
  await expect(origin).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(facts.getByRole('link', { name: 'Change wiring', exact: true })).toBeFocused();
});

for (const name of ['Change wiring', 'Replace GPIO 38']) {
  test(`closing the light check restores the remounted ${name} link`, async ({ page }) => {
    await cardHome(page);
    const facts = page.getByTestId('fact-outputs');
    const origin = facts.getByRole('link', { name, exact: true });
    const openedFrom = await origin.elementHandle();
    await origin.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Find my strips' });
    await dialog.getByRole('button', { name: 'Minimize', exact: true }).press('Enter');

    const dock = page.getByRole('region', { name: 'Light check dock' });
    await expect(dock.getByRole('button', { name: 'Restore', exact: true })).toBeFocused();
    const rail = page.getByRole('complementary');
    await rail.getByRole('button', { name: 'Layout', exact: true }).press('Enter');
    await expect(page).toHaveURL(/screen=layout/);
    expect(await openedFrom!.evaluate(element => element.isConnected)).toBe(false);
    await rail.getByRole('button', { name: 'Card', exact: true }).press('Enter');
    await expect(origin).toBeVisible();

    await dock.getByRole('button', { name: 'Restore', exact: true }).press('Enter');
    await dialog.getByRole('button', { name: 'Close light check', exact: true }).press('Enter');
    await expect(dialog).toHaveCount(0);
    await expectRestoredFocus(page, origin);
  });
}

test('closing the light check preserves focus already moved outside the dialog', async ({ page }) => {
  await cardHome(page);
  await page.getByTestId('fact-outputs').getByRole('link', { name: 'Change wiring', exact: true }).press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Find my strips' });
  await expect(dialog.getByRole('heading', { name: 'Configured pins' })).toBeFocused();
  const outside = page.getByRole('button', { name: 'New project', exact: true });
  await outside.evaluate(button => {
    const lightCheck = document.querySelector('[data-testid="card-setup-overlay"]');
    const observer = new MutationObserver(() => {
      if (lightCheck?.isConnected) return;
      observer.disconnect();
      button.focus();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expectRestoredFocus(page, outside);
});
