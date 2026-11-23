// Interruption: Find my strips with no known wiring, then Save — and the card
// answers slowly (about 13 s a reply) right then, as the real card does about
// half the time after the restart that follows Save (measured by the Find my
// strips session on live build 7d0ba7da). The save is staged for a light test;
// its reply is lost to Studio's 6 s limit.
//
// Before the fix Studio took the first unanswered look for "nothing was
// staged", read the card back, found the temporary setup and said "could not
// verify this install (read-back-mismatch)" — the light test never started.
// It must keep reading while the card is slow, say that it is waiting, then
// open the light test; a card that answers with no staged change still
// reports a mismatch. Real-timing practice card.
// Plan: todo/plans/practice-card-interruptions.md (D11).
import { test, expect, type Page } from '@playwright/test';
import { createPracticeCard } from './harness/practiceTiming';
import { cardState } from './harness/cardStates';
import { guardRealCard } from './ux/journeyRecorder';
import { settleEndCheck, stopRunAt } from './ux/drivers';
import { startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';
import { startQuietWatch, stopQuietWatch, startWordsLog, wordsSeen, QUIET_LIMIT_MS } from './harness/interruptions';

const SLOW_REPLY_MS = 13_000;
const SLOW_FOR_MS = 60_000;

async function linkConnected(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  });
}

test.describe.configure({ timeout: 420_000 });

test.afterEach(async ({ page }, info) => {
  const words = await wordsSeen(page);
  console.log(`[interruptions] ${info.status === info.expectedStatus ? 'GREEN' : 'RED'} ${info.title}\n  Studio said: ${JSON.stringify(words.map(w => `${(w.t / 1000).toFixed(1)}s ${w.text}`))}`);
});

test('Find my strips Save while the card answers in 13 s: Studio waits, says so, then opens the light test', async ({ page }) => {
  await guardRealCard(page);
  const { card } = createPracticeCard(cardState('factory-blank'), {
    timing: 'real', seed: 11, restartAfterSaveMs: 14_200,
    overrides: { spontaneousSilence: null, unsettledAfterRestart: null },
  });
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Pair this card', exact: true }).click({ timeout: 45_000 });
  await expect.poll(() => linkConnected(page), { timeout: 40_000 }).toBe(true);
  await page.getByTestId('setup-lights-action').click();

  // Way in 2, at the card's real speed.
  await expect(page.getByTestId('discovery-plan')).toHaveAttribute('data-find-mode', 'watch', { timeout: 30_000 });
  await expect(page.locator('[data-testid="discovery-pin-map"] .is-pulse[data-pin="18"]')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(700);
  await page.getByTestId('discovery-sweep-mine').click();
  await expect(page.getByTestId('discovery-color-proof')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('discovery-colour-row-rgb').click();
  await expect(page.getByTestId('discovery-run')).toBeVisible();
  await stopRunAt(page, 41);
  await expect(page.getByTestId('discovery-end-marker')).toBeVisible();
  await settleEndCheck(page, 41);
  await page.getByTestId('discovery-end-yes').click();
  await expect(page.getByTestId('discovery-total')).toContainText('41');
  expect(card.state.provisionalSetup, 'fixture: still the temporary setup before Save').toBe(true);

  // The card turns slow just as the owner presses Save.
  await startWordsLog(page);
  await startFalseFailureWatch(page, ['read-back-mismatch', 'could not verify', 'did not answer', 'failed']);
  await startQuietWatch(page, 'The lights look correct|Confirm|could not verify|did not');
  card.setReplyDelay(SLOW_REPLY_MS);
  const slowUntil = Date.now() + SLOW_FOR_MS;
  const fast = setTimeout(() => card.setReplyDelay(0), SLOW_FOR_MS);
  try {
    await page.getByTestId('discovery-save-to-card').click();
    const confirm = page.getByTestId('wiring-test-confirm');
    await expect(confirm, 'the light test opens once the slow card has answered').toBeVisible({ timeout: 240_000 });
    const quiet = await stopQuietWatch(page);
    expect.soft(await falseFailures(page), 'no mismatch or failure about a change the card staged').toEqual([]);
    expect.soft(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
    console.log(`  light test opened ${Math.round((Date.now() - (slowUntil - SLOW_FOR_MS)) / 1000)} s after Save`);
    await confirm.click();
    await expect.poll(() => ({ pixels: card.state.pixels, provisional: card.state.provisionalSetup }), { timeout: 120_000 })
      .toEqual({ pixels: 41, provisional: false });
  } finally {
    clearTimeout(fast);
    card.setReplyDelay(0);
  }
});
