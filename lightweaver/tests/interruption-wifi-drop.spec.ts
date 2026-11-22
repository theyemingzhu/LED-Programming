// Interruption 4: the card's Wi-Fi drops for 10 s
//   (a) while a look change goes out on the quick path (Patterns tap → /api/control),
//   (b) during a Card Home light-count Set, after the card took the write and
//       before it has restarted into the new count (the stage → activate gap).
// The card holds what it took; Studio must end saying so, never that it did
// not take it, and never leave a wait silent for 3 s.
// Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import { cardState } from './harness/cardStates';
import { createBenchDiscoveryPracticeCard } from './harness/benchDiscoveryCard';
import {
  realPracticeCard, bootConnected, nextWrite, dropOffAir, configWrites, REAL_RESTART_MS,
  startWordsLog, startQuietWatch, stopQuietWatch, startNotTakenWatch, notTakenSeen, reportWords,
  QUIET_LIMIT_MS,
} from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

test.describe.configure({ timeout: 150_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

test('look change on the quick path into a 10 s Wi-Fi drop: the card plays it once back, and Studio says it is sending', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  await bootConnected(page, practice, { hash: '#screen=pattern' });
  await expect(page.getByTestId('pattern-install-on-card')).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  expect(practice.card.state.currentId).not.toBe('aurora');
  await startWordsLog(page);
  await startNotTakenWatch(page, ['did not answer', 'not connected', 'card stopped responding', 'could not']);
  // The quiet watch ends when the lights follow; the spec stops it then.
  await startQuietWatch(page, '$^');
  dropOffAir(practice, 10_000);
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await expect.poll(() => practice!.card.state.currentId, { timeout: 25_000, message: 'the card plays the look once its Wi-Fi is back' }).toBe('aurora');
  const quiet = await stopQuietWatch(page);
  await page.waitForTimeout(3_000);
  await expect(page.getByText(/did not answer/i)).toHaveCount(0);
  expect(await notTakenSeen(page), 'failure wording about a change the card made').toEqual([]);
  expect(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
  expect(configWrites(practice.card)).toHaveLength(0);
});

test('light count Set, Wi-Fi drops 10 s after the card took the write: the card has the count, Studio says so', async ({ page }) => {
  practice = createBenchDiscoveryPracticeCard({
    timing: 'real', seed: 11, overrides: { spontaneousSilence: null }, restartAfterSaveMs: REAL_RESTART_MS,
  }) as InterruptionCard;
  await bootConnected(page, practice, { hash: '#screen=card', projectId: '' });
  const input = page.getByLabel('Light count');
  await expect(input).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  await startWordsLog(page);
  await startNotTakenWatch(page, ['did not take it yet', 'could not take that length', 'did not answer', 'not saved', 'update rolled back']);
  await startQuietWatch(page, 'did not take|could not|41 lights|Count (is )?on the card|on the strip');
  await input.fill('41');
  const write = nextWrite(practice.card);
  await page.getByTestId('fact-lights-set').click();
  await write;
  await page.waitForTimeout(300);
  dropOffAir(practice, 10_000);
  await expect.poll(() => practice!.card.state.pixels, { timeout: 5_000 }).toBe(41);
  // Restart (~14 s) plus the drop overlap; give Studio until 60 s.
  await page.waitForTimeout(REAL_RESTART_MS + 20_000);
  const quiet = await stopQuietWatch(page);
  expect(practice.card.state.pixels, 'the card holds the count').toBe(41);
  expect(await notTakenSeen(page), 'Studio said the card did not take a count it holds').toEqual([]);
  expect(quiet.endedAtMs, 'Studio said how the Set ended').not.toBeNull();
  expect(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
  expect(configWrites(practice.card), 'one write, not a resend').toHaveLength(1);
});
