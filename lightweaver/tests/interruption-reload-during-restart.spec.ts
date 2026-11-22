// Interruption 2: the owner reloads the tab while Studio is waiting out the
// card's restart after Save to card, and later opens Studio again in a new
// tab. The card took the save. Studio must come to know that — "Installed on
// card" — and never invite the owner to save again as if it had not landed.
// Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import { cardState } from './harness/cardStates';
import {
  realPracticeCard, bootConnected, nextWrite, holds, lastSent, configWrites,
  startWordsLog, wordsSeen, startQuietWatch, stopQuietWatch, startNotTakenWatch, notTakenSeen, reportWords,
  QUIET_LIMIT_MS,
} from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

test.describe.configure({ timeout: 180_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

// After a reload nothing is pending, so "how the wait ended" is the header
// saying where the project stands.
const SETTLED = 'Installed on card|Unsaved changes|Draft kept separately|Not on (the )?card|differs';

test('reload while the card restarts after Save, then reopen Studio: it knows the save landed', async ({ page, context }) => {
  practice = realPracticeCard(cardState('playing'));
  await bootConnected(page, practice, { hash: '#screen=pattern' });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await page.waitForTimeout(2_500);
  const write = nextWrite(practice.card);
  await button.click();
  await write;
  await expect(page.getByText(/Restarting (the )?card/).first()).toBeVisible({ timeout: 10_000 });
  const sent = lastSent(practice.card);
  expect(holds(practice.card).projectFingerprint, 'the card holds the save').toBe(sent.projectFingerprint);

  // 4 s into the ~14 s restart, the owner reloads.
  await page.waitForTimeout(4_000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await startWordsLog(page);
  await startNotTakenWatch(page);
  await startQuietWatch(page, SETTLED);
  await expect(page.getByText('Installed on card', { exact: true }), 'after the reload, Studio knows').toBeVisible({ timeout: 45_000 });
  const quiet = await stopQuietWatch(page);
  await expect(button).not.toHaveText(/Try saving again/);
  expect(await notTakenSeen(page)).toEqual([]);
  expect(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);

  // Later: the owner closes the tab and opens Studio again.
  await page.close();
  const again = await context.newPage();
  await again.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await startWordsLog(again);
  try {
    await expect(again.getByText('Installed on card', { exact: true }), 'reopened Studio knows').toBeVisible({ timeout: 45_000 });
    await expect(again.getByTestId('pattern-install-on-card')).not.toHaveText(/Try saving again/);
  } finally {
    console.log(`  reopened tab said: ${JSON.stringify((await wordsSeen(again)).map(w => `${(w.t / 1000).toFixed(1)}s ${w.text}`))}`);
  }
  expect(configWrites(practice.card), 'no second save').toHaveLength(1);
  expect(holds(practice.card).projectFingerprint).toBe(sent.projectFingerprint);
});
