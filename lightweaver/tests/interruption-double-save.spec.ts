// Interruption 5: Save to card pressed twice — a double press 1 s apart, and
// a second press while the first save's restart wait is still showing (with
// an edit made during the wait). A tap on a busy control is forced, as a
// finger would land it. The card ends holding exactly one consistent save,
// Studio's last word matches what the card holds, and nothing says a save
// failed. Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cardState } from './harness/cardStates';
import {
  realPracticeCard, bootConnected, nextWrite, holds, lastSent, configWrites, REAL_RESTART_MS,
  startWordsLog, startQuietWatch, stopQuietWatch, startNotTakenWatch, notTakenSeen, reportWords,
  QUIET_LIMIT_MS,
} from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

test.describe.configure({ timeout: 180_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

const ENDED = '\\bSaved\\b|has not come back|Not saved to the card|did not verify|did not take|Try saving again';

async function openPatternsWithEdit(page: Page, p: InterruptionCard) {
  await bootConnected(page, p, { hash: '#screen=pattern' });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await page.waitForTimeout(2_500);
  await startWordsLog(page);
  await startNotTakenWatch(page);
  await startQuietWatch(page, ENDED);
  return button;
}

test('double press on Save to card, 1 s apart: one save reaches the card and Studio says Saved', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  const button = await openPatternsWithEdit(page, practice);
  const write = nextWrite(practice.card);
  await button.click();
  await page.waitForTimeout(1_000);
  await button.click({ force: true });
  await write;
  await expect(button).toHaveText(/Saved/, { timeout: REAL_RESTART_MS + 40_000 });
  await page.waitForTimeout(5_000);
  const quiet = await stopQuietWatch(page);
  expect.soft(configWrites(practice.card), 'a double press sends one save').toHaveLength(1);
  expect.soft(holds(practice.card).projectFingerprint, 'the card holds the save').toBe(lastSent(practice.card).projectFingerprint);
  await expect.soft(button).toHaveText(/Saved/);
  expect.soft(await notTakenSeen(page)).toEqual([]);
  expect.soft(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
});

test('Save pressed again during the first save\'s restart wait, after an edit: Studio\'s last word matches the card', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  const button = await openPatternsWithEdit(page, practice);
  const write = nextWrite(practice.card);
  await button.click();
  await write;
  const first = lastSent(practice.card);
  await expect(page.getByText(/Restarting (the )?card/).first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(4_000);
  // During the wait: pick another look, and press Save again.
  await page.locator('[data-pattern-id="plasma"]').first().click();
  await page.waitForTimeout(800);
  await button.click({ force: true });
  // Two restarts at most, then settle.
  await page.waitForTimeout(2 * REAL_RESTART_MS + 25_000);
  const quiet = await stopQuietWatch(page);
  const writes = configWrites(practice.card).length;
  const held = holds(practice.card);
  const sent = lastSent(practice.card);
  const screen = await page.locator('body').innerText();
  console.log(`  writes ${writes}; card holds ${held.projectFingerprint.slice(0, 12)}; first ${first.projectFingerprint.slice(0, 12)}; last sent ${sent.projectFingerprint.slice(0, 12)}`);
  expect.soft(held.projectFingerprint, 'the card holds the last save Studio sent').toBe(sent.projectFingerprint);
  if (writes === 1) {
    // The second press was not sent: the plasma edit is NOT on the card, so
    // Studio must not say it is.
    expect.soft(screen, 'edit not on the card, so Studio keeps "Unsaved changes"').toMatch(/Unsaved changes/);
    expect.soft(screen, 'and does not say Installed on card').not.toMatch(/Installed on card/);
  } else {
    expect.soft(writes, 'at most the two presses').toBe(2);
    await expect.soft(button, 'the second save ends Saved').toHaveText(/Saved/);
  }
  expect.soft(await notTakenSeen(page)).toEqual([]);
  expect.soft(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
});
