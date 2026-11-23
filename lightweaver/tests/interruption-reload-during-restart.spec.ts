// Interruption 2: the owner reloads the tab while Studio is waiting out the
// card's restart after Save to card, and later opens Studio again in a new
// tab. The card took the save. Studio must come to know that — "Installed on
// card" — and never invite the owner to save again as if it had not landed.
// Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { cardState } from './harness/cardStates';
import {
  knownDefect, realPracticeCard, bootConnected, nextWrite, holds, lastSent, configWrites,
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

async function saveAndWaitForRestart(page, p: InterruptionCard, context?: BrowserContext) {
  await bootConnected(page, p, { hash: '#screen=pattern', context });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await page.waitForTimeout(2_500);
  const write = nextWrite(p.card);
  await button.click();
  await write;
  await expect(page.getByText(/Restarting (the )?card/).first()).toBeVisible({ timeout: 10_000 });
  const sent = lastSent(p.card);
  expect(holds(p.card).projectFingerprint, 'the card holds the save').toBe(sent.projectFingerprint);
  // 4 s into the ~14 s restart.
  await page.waitForTimeout(4_000);
  return sent;
}

test('reload while the card restarts after Save: Studio then knows the save landed', async ({ page }) => {
  knownDefect('D2', 'after a reload Studio says Previously installed / Draft kept separately about a save that landed');
  practice = realPracticeCard(cardState('playing'));
  const sent = await saveAndWaitForRestart(page, practice);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await startWordsLog(page);
  await startNotTakenWatch(page);
  await startQuietWatch(page, SETTLED);
  await expect(page.getByText('Installed on card', { exact: true }), 'after the reload, Studio knows').toBeVisible({ timeout: 45_000 });
  const quiet = await stopQuietWatch(page);
  await expect(page.getByTestId('pattern-install-on-card')).not.toHaveText(/Try saving again/);
  expect(await notTakenSeen(page)).toEqual([]);
  expect(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
  expect(configWrites(practice.card), 'no second save').toHaveLength(1);
  expect(holds(practice.card).projectFingerprint).toBe(sent.projectFingerprint);
});

test('tab closed while the card restarts after Save, Studio reopened 30 s later: it knows the save landed', async ({ page, context }) => {
  knownDefect('D2b', 'reopened Studio says Previously installed / Draft kept separately about a save that landed');
  practice = realPracticeCard(cardState('playing'));
  const sent = await saveAndWaitForRestart(page, practice, context);
  await page.close();
  await new Promise(resolve => setTimeout(resolve, 30_000));
  const again = await context.newPage();
  await again.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await startWordsLog(again);
  await startNotTakenWatch(again);
  try {
    await expect(again.getByText('Installed on card', { exact: true }), 'reopened Studio knows').toBeVisible({ timeout: 45_000 });
    await expect(again.getByTestId('pattern-install-on-card')).not.toHaveText(/Try saving again/);
    expect(await notTakenSeen(again)).toEqual([]);
  } finally {
    console.log(`  reopened tab said: ${JSON.stringify((await wordsSeen(again)).map(w => `${(w.t / 1000).toFixed(1)}s ${w.text}`))}`);
  }
  expect(configWrites(practice.card), 'no second save').toHaveLength(1);
  expect(holds(practice.card).projectFingerprint).toBe(sent.projectFingerprint);
});
