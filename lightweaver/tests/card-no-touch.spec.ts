import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createPracticeCard } from './harness/practiceTiming.js';
import { cardState } from './harness/cardStates';

// What Studio says about touching the card depends on what the card reports.
//   Firmware 1.2.6+ reports capabilities.ownerNoTouch in /api/status and
//   /api/firmware-info: nothing on the card needs touching, and Studio never says so.
//   A card that does not report it (1.2.5 and older): the touch instruction stays.
// The practice card does not model the touch itself (no 403 "touch a card control
// to pair", no pairing step), so these cases prove what Studio SAYS and ASKS on a
// connected card, in both cases. Saving through the real touch gate needs the
// simulator to answer the owner capability with that 403 until a control is touched.

async function cardReportsOwnerNoTouch(page: Page, reported: boolean) {
  await page.addInitScript((on: boolean) => {
    const cardFetch = window.fetch.bind(window);
    window.fetch = async (input: any, init?: any) => {
      const response = await cardFetch(input, init);
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (!/\/api\/(status|firmware-info)(\?|$)/.test(url) || !response.ok) return response;
      try {
        const body = await response.clone().json();
        const capabilities = { ...(body.capabilities || {}) };
        if (on) capabilities.ownerNoTouch = 1; else delete capabilities.ownerNoTouch;
        return new Response(JSON.stringify({ ...body, capabilities }), { status: response.status, headers: response.headers });
      } catch {
        return response;
      }
    };
  }, reported);
}

async function linkConnected(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  });
}

async function connectedCard(page: Page, { noTouch }: { noTouch: boolean }) {
  const { card } = createPracticeCard(cardState('factory-blank'), { restartAfterSaveMs: 600, seed: 7 });
  card.state.explicitOutputs = [];
  await card.install(page);
  await cardReportsOwnerNoTouch(page, noTouch);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto('/#screen=card&section=settings', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkConnected(page), { timeout: 45000, message: 'the practice card must be connected' }).toBe(true);
  return card;
}

const hint = (page: Page) => page.locator('p.hh', { hasText: /touch a physical control|Nothing needs pressing/ });

test('an old card still gets the touch instruction in Settings, and a press of Save still asks first', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await connectedCard(page, { noTouch: false });
  await expect(hint(page)).toContainText('When prompted, touch a physical control on the card');
  await expect(hint(page)).not.toContainText('Nothing needs pressing');
  const save = page.getByRole('button', { name: 'Save project to this card' });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  // The old way: Studio asks the owner to touch the card before it asks the card for anything.
  await expect.poll(() => dialogs.length).toBeGreaterThan(0);
  expect(dialogs[0]).toMatch(/Touch a physical control on the Lightweaver card/);
});

test('a card that reports ownerNoTouch is never told to be touched and never asked', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await connectedCard(page, { noTouch: true });
  await expect(hint(page)).toContainText('Studio saves to this exact card. Nothing needs pressing on the card.');
  await expect(page.getByText(/touch a physical control/i)).toHaveCount(0);
  const save = page.getByRole('button', { name: 'Save project to this card' });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  // Straight to the save: no confirm that mentions touching, and no touch sentence in the status.
  await page.waitForTimeout(1500);
  expect(dialogs.filter(message => /touch/i.test(message))).toEqual([]);
  const status = page.getByTestId('settings-card-status');
  if (await status.count()) await expect(status).not.toContainText(/touch/i);
});
