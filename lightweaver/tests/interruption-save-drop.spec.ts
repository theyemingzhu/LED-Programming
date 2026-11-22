// Interruption 1: the card stops answering halfway through Save to card —
// after it took the write, before its restart finishes — and comes back at
// 20 s, at 45 s, or never. In all three the card HOLDS the save, so Studio
// must never say it was not saved; it may say "Saved" only once it has read
// that back. Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cardState } from './harness/cardStates';
import {
  realPracticeCard, bootConnected, nextWrite, dropOffAir, holds, lastSent, configWrites,
  startWordsLog, startQuietWatch, stopQuietWatch, startNotTakenWatch, notTakenSeen, reportWords,
  QUIET_LIMIT_MS,
} from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

test.describe.configure({ timeout: 180_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

// The save's own outcome on its button, or any line that settles it.
const ENDED = '\\bSaved\\b|has not come back|Not saved to the card|did not verify|did not take|Try saving again';

async function pressSaveOnPatterns(page: Page, p: InterruptionCard) {
  await bootConnected(page, p, { hash: '#screen=pattern' });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 30_000 });
  // Change the look so the save carries something new.
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await page.waitForTimeout(2_500);
  await startWordsLog(page);
  await startNotTakenWatch(page);
  await startQuietWatch(page, ENDED);
  const writeAt = nextWrite(p.card);
  await button.click();
  return { button, writeAt: await writeAt };
}

for (const backAfterMs of [20_000, 45_000]) {
  test(`card silent from just after the write until ${backAfterMs / 1000} s: Studio never says it was not saved, and ends Saved`, async ({ page }) => {
    practice = realPracticeCard(cardState('playing'));
    const { button, writeAt } = await pressSaveOnPatterns(page, practice);
    // Let the save's own reply out (Real-timing: ~200 ms), then the card goes quiet.
    await page.waitForTimeout(400);
    dropOffAir(practice, backAfterMs - (Date.now() - writeAt));

    // The card took it: same project identity as the save Studio sent.
    const sent = lastSent(practice.card);
    expect(holds(practice.card).projectFingerprint, 'the card holds the save').toBe(sent.projectFingerprint);

    // Within 30 s of the card answering again, Studio says Saved.
    await expect(button).toHaveText(/Saved/, { timeout: backAfterMs + 30_000 });
    const quiet = await stopQuietWatch(page);
    expect(await notTakenSeen(page), 'Studio said the card did not take a save it held').toEqual([]);
    expect(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
    expect(configWrites(practice.card), 'one save, not a resend').toHaveLength(1);
    expect(holds(practice.card).projectFingerprint).toBe(sent.projectFingerprint);
  });
}

test('card never answers again after the write: Studio does not say Saved, and does not say it was not saved', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  const { button } = await pressSaveOnPatterns(page, practice);
  await page.waitForTimeout(400);
  dropOffAir(practice, Infinity);
  const sent = lastSent(practice.card);
  expect(holds(practice.card).projectFingerprint, 'the card holds the save').toBe(sent.projectFingerprint);

  // Studio's restart limit is 45 s; give it that and a margin, then read the screen.
  await page.waitForTimeout(60_000);
  const quiet = await stopQuietWatch(page);
  await expect(button).not.toHaveText(/^\s*\S*\s*Saved\s*$/);
  expect(await notTakenSeen(page), 'Studio said "not saved" about a save the card took').toEqual([]);
  expect(quiet.endedAtMs, 'Studio said how the wait ended').not.toBeNull();
  expect(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
});

test('card comes back at 75 s, after Studio gave up: Studio then sees the card holds the save', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  const { button, writeAt } = await pressSaveOnPatterns(page, practice);
  await page.waitForTimeout(400);
  dropOffAir(practice, 75_000 - (Date.now() - writeAt));
  const sent = lastSent(practice.card);
  await expect(page.getByText(/has not come back/).first()).toBeVisible({ timeout: 60_000 });
  // The card answers again at 75 s. It holds the save.
  await page.waitForTimeout(Math.max(0, 75_000 - (Date.now() - writeAt)));
  expect(holds(practice.card).projectFingerprint).toBe(sent.projectFingerprint);
  // Within 30 s Studio must stop inviting a resend of a save the card holds.
  await expect(page.getByText('Installed on card', { exact: true }), 'header knows the card holds it').toBeVisible({ timeout: 30_000 });
  await expect(button, 'button no longer says "Try saving again"').not.toHaveText(/Try saving again/);
  expect(await notTakenSeen(page)).toEqual([]);
  expect(configWrites(practice.card), 'one save, not a resend').toHaveLength(1);
});
