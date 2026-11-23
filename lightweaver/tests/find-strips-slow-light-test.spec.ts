// D9 (practice card interruptions, todo/plans/practice-card-interruptions.md):
// a card that takes 5 s to answer holds the saved project and is testing it,
// but the light test said "The card did not reconnect to this wiring
// transaction in time." and then "Studio could not confirm the result…".
// That is Studio saying it failed when it worked. Each status poll during the
// reconnect gave up after 1.2 s, so a 5 s card could never count as back.
//
// Practice card Real-timing (restart ~14 s after a save) plus a 5 s reply
// delay, as the interruption specs use. Never the physical card.
import { test, expect } from '@playwright/test';
import { cardState } from './harness/cardStates';
import { realPracticeCard, linkState, startWordsLog, reportWords } from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';
import { startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';
import { findStrip } from './ux/drivers';

const SLOW_REPLY_MS = 5_000;
const WRONG = ['did not reconnect', 'could not confirm', 'did not answer', 'card stopped responding', 'try saving again', 'failed'];

test.describe.configure({ timeout: 420_000 });
let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

test('a slow card that is testing the saved wiring reaches the light test, and Studio says what the card holds', async ({ page }) => {
  practice = realPracticeCard(cardState('factory-blank'));
  const { card } = practice;
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Pair this card', exact: true }).click();
  await expect.poll(() => linkState(page), { timeout: 30_000 }).toMatch(/^connected-/);
  await page.getByTestId('setup-lights-action').click();
  await findStrip(page, { pin: 18, count: 41, via: 'tap' });
  await expect(page.getByTestId('discovery-done')).toBeVisible({ timeout: 30_000 });
  const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || '');

  await startWordsLog(page);
  await startFalseFailureWatch(page, WRONG);
  await page.getByTestId('discovery-save-to-card').click();
  // Since the combined flow (#489) this card holds the temporary counting
  // setup, so Save lands on Card Home's "Test and save", which stages the
  // wiring candidate.
  await page.getByTestId('setup-verify-action').click({ timeout: 30_000 }).catch(() => {});
  // The card restarts into the candidate for the light test and comes back
  // slow: every reply from then on takes 5 s (D9's stage). A card that is slow
  // through the whole save is a separate finding (the save's own reads give up
  // first); it is not what this test is about.
  await expect.poll(() => card.requests.some(r => r.method === 'POST' && r.path === '/api/wiring/activate'), { timeout: 120_000 }).toBe(true);
  card.setReplyDelay(SLOW_REPLY_MS);

  const confirm = page.getByTestId('wiring-test-confirm');
  await expect(confirm, 'the light test opens on the card that is testing the wiring').toBeVisible({ timeout: 240_000 });
  expect(await falseFailures(page), 'no failure wording about a save that landed').toEqual([]);
  await confirm.click();
  await expect.poll(() => card.state.projectId, { timeout: 120_000, message: 'the card keeps the saved project' }).toBe(projectId);
  expect(await falseFailures(page)).toEqual([]);
});
