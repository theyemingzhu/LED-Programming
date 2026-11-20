// A fresh browser (it holds only the untouched starter) meets a card that
// already holds a project. The card is where browsers meet: Studio opens the
// card's project by itself, with no press, because the starter holds no owner
// work. Open work is never replaced this way; see the J02/T3 guards for that.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

for (const vp of [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }]) {
  test(`a fresh browser picks up the card's project with no press · ${vp.id}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const card = createCardSimulator(cardState('playing'));
    await card.install(page);
    await page.addInitScript(({ id, firmwareVersion, buildId }) => {
      localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
      localStorage.setItem('lw_card_host', 'lightweaver.local');
      localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
    }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

// The starter flag clears only on a layout edit, so a browser can hold the
// starter AND owner work (a rename, saved looks). That work survives a reload
// as unsaved changes, and it must never be swapped out by the pick-up.
test('a starter holding unsaved owner work is not replaced by the card project', async ({ page }) => {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });

  // First visit with the card out of reach: Studio writes its starter.
  card.goOffline();
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  const autosave = () => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null'); } catch { return null; }
  });
  await expect.poll(async () => (await autosave())?.layout?.starterPending, { timeout: 15000 }).toBe(true);
  const starterId = (await autosave()).id;
  expect(starterId).not.toBe('lwproj-matrix-piece');

  // The owner's own work on that starter, left unsaved.
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    project.name = 'My looks';
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
    const record = JSON.parse(localStorage.getItem('lw_project_lifecycle_v1') || '{}');
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({ ...record, dirty: true }));
  });

  card.goOnline();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 25000 });
  await page.waitForTimeout(5000);
  const after = await autosave();
  expect(after?.id, 'the card project replaced unsaved owner work').toBe(starterId);
  expect(after?.name).toBe('My looks');
});

for (const vp of [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }]) {
  test(`a fresh browser opened straight onto Patterns shows the card's project · ${vp.id}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const card = createCardSimulator(cardState('playing'));
    await card.install(page);
    await page.addInitScript(({ id, firmwareVersion, buildId }) => {
      localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
      localStorage.setItem('lw_card_host', 'lightweaver.local');
      localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
    await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
    }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
    await expect(page.locator('body')).toContainText('Matrix piece', { timeout: 10000 });
    await expect(page).toHaveURL(/screen=pattern/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('with browser A open, a fresh browser B on Patterns shows the card project', async ({ browser }) => {
  const card = createCardSimulator(cardState('playing'));
  const seed = async (page) => page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await card.install(a); await seed(a);
  await a.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect(a.locator('body')).toContainText('Matrix piece', { timeout: 25000 });
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await card.install(b); await seed(b);
  await b.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => b.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; }
  }), { timeout: 25000 }).toBe('lwproj-matrix-piece');
  await expect(b.locator('body')).toContainText('Matrix piece');
  await expect(a.getByRole('alert')).toHaveCount(0);
  await expect(b.getByRole('alert')).toHaveCount(0);
  await ctxA.close(); await ctxB.close();
});
