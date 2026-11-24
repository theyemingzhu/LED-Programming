// Interruption 3: the card restarts by itself (power blip, watchdog) — a new
// boot id and ~14 s off the air — while Studio sits idle on Card Home, and
// while the owner is mid-way through editing a look on Patterns. Nothing was
// lost on the card, so Studio must not say anything failed, must pick up the
// new boot, and must not drop the owner's edit or claim it reached the card
// when it did not. Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import { cardState } from './harness/cardStates';
import { FALSE_FAILURE_WORDING } from './harness/falseFailureWatch';
import {
  realPracticeCard, bootConnected, holds, configWrites, restartByItself, linkState, REAL_PROFILE,
  startWordsLog, startNotTakenWatch, notTakenSeen, reportWords,
} from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

test.describe.configure({ timeout: 150_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

// Lines that would tell the owner the card lost or no longer holds the project.
const LOST_PROJECT = ['draft kept separately', 'differs from', 'not on the card', 'no project', 'update rolled back', 'needs attention'];

async function studioKnowsBoot(page, bootId: string) {
  return page.evaluate(async id => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return JSON.stringify(getSharedCardLink().getState() || {}).includes(id);
  }, bootId);
}

test('idle on Card Home, the card restarts by itself: no failure wording, and Studio picks up the new boot', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  await bootConnected(page, practice, { hash: '#screen=card' });
  await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3_000);
  const heldBefore = holds(practice.card);
  await startWordsLog(page);
  await startNotTakenWatch(page, [...FALSE_FAILURE_WORDING, ...LOST_PROJECT]);

  restartByItself(practice);
  const newBoot = practice.card.state.bootId;
  // Off the air for the real restart, then back: give Studio 20 s more.
  await page.waitForTimeout(REAL_PROFILE.restartSilenceMs + 20_000);

  expect(await notTakenSeen(page), 'failure or lost-project wording during a harmless restart').toEqual([]);
  expect(await linkState(page)).toMatch(/^connected-/);
  expect(await studioKnowsBoot(page, newBoot), 'Studio picked up the new boot id').toBe(true);
  expect(holds(practice.card)).toEqual(heldBefore);
  expect(configWrites(practice.card), 'a restart does not make Studio write').toHaveLength(0);
});

test('editing a look on Patterns when the card restarts by itself: the edit is kept, and Studio does not claim it reached the card', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  await bootConnected(page, practice, { hash: '#screen=pattern' });
  await expect(page.getByTestId('pattern-install-on-card')).toBeEnabled({ timeout: 30_000 });
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await expect.poll(() => practice!.card.state.currentId, { timeout: 15_000 }).toBe('aurora');
  const heldBefore = holds(practice.card);
  await startWordsLog(page);
  await startNotTakenWatch(page, ['card stopped responding', 'did not answer', ...LOST_PROJECT]);

  restartByItself(practice);
  await page.waitForTimeout(2_000);
  // Mid-restart the owner picks another look.
  await page.locator('[data-pattern-id="plasma"]').first().click();
  await page.waitForTimeout(REAL_PROFILE.restartSilenceMs);

  // Within 20 s of the card answering again, the lights follow the owner's pick.
  await expect.poll(() => practice!.card.state.currentId, { timeout: 20_000, message: 'the card plays the look picked during the restart' }).toBe('plasma');
  // The edit is still Studio's, and was not saved to the card by itself.
  await expect(page.getByText('Unsaved changes').first()).toBeVisible();
  expect(holds(practice.card)).toEqual(heldBefore);
  expect(configWrites(practice.card)).toHaveLength(0);
  expect(await notTakenSeen(page)).toEqual([]);
});
