// A healthy card that goes quiet for a few seconds while the owner is simply
// looking at a screen. The real card does this for 4–12 s when its Wi-Fi
// re-associates. Studio may say it is checking; it must never say the card is
// not connected or that something failed. Plan: todo/plans/false-failures.md.
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';
import { seedKnownCard, waitForCardProject, startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';

test.describe.configure({ timeout: 90000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  console.log(`[false-failures] ${info.title}\n  wording seen: ${JSON.stringify(seen)}`);
});

async function linkState(page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

/** Wait for the next keepalive to leave, so the quiet spell lands on it. */
async function nextKeepalive(card, timeoutMs = 30000) {
  const seen = card.requests.filter(r => r.path === '/api/status').length;
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (card.requests.filter(r => r.path === '/api/status').length > seen) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('no keepalive was sent');
}

async function bootConnected(page, hash) {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForCardProject(page);
  await page.evaluate(h => { window.location.hash = h; }, hash);
  await expect.poll(() => linkState(page), { timeout: 20000 }).toMatch(/^connected-/);
  await page.waitForTimeout(1500);
  return card;
}

for (const [screen, hash] of [['Card Home', '#screen=card'], ['Patterns', '#screen=pattern']]) {
  test(`${screen}: a 6 s silence on an idle connected screen never shows Not connected or an error`, async ({ page }) => {
    const card = await bootConnected(page, hash);
    await startFalseFailureWatch(page);
    await nextKeepalive(card);
    card.silenceFor(6000);
    // Long enough for two keepalives to fall inside the silence and for the
    // card's answers afterwards to be read.
    await page.waitForTimeout(14000);
    expect(await falseFailures(page)).toEqual([]);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await linkState(page)).toMatch(/^connected-/);
  });
}

test('F4: while every reply takes 4 s, the card screen says it is checking, never Not connected', async ({ page }) => {
  const card = await bootConnected(page, '#screen=card');
  await startFalseFailureWatch(page);
  await nextKeepalive(card);
  card.setReplyDelay(4000);
  await page.waitForTimeout(26000);
  card.setReplyDelay(0);
  await page.waitForTimeout(4000);
  expect(await falseFailures(page)).toEqual([]);
  expect(await linkState(page)).toMatch(/^connected-/);
});

test('F3: a tap during a 5 s silence lands once the card answers, and no timeout line is left', async ({ page }) => {
  const card = await bootConnected(page, '#screen=pattern');
  const aurora = page.locator('[data-pattern-id="aurora"]').first();
  await expect(aurora).toBeVisible({ timeout: 15000 });
  expect(card.state.currentId).not.toBe('aurora');
  await startFalseFailureWatch(page, ['not connected', 'card stopped responding']);
  card.silenceFor(5000);
  await aurora.click();
  // The card plays it once it answers again…
  await expect.poll(() => card.state.currentId, { timeout: 15000 }).toBe('aurora');
  // …and nothing still claims it did not answer.
  await expect(page.getByText('did not answer in time', { exact: false })).toHaveCount(0, { timeout: 5000 });
  expect(await falseFailures(page)).toEqual([]);
});
