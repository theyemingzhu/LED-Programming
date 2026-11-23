// Interruption 7: the card's store is full when a save arrives — the real
// card's refusal, measured on lw-b0fe81f61b44 (2026-11-19): HTTP 400
// `nvs write failed; previous project remains intact and runtime unchanged`.
// The card keeps what it had. Studio must say there was no room (not "did not
// answer"), must not say Saved or Installed, must offer the way out — and a
// retry once there is room must end clean.
//   (a) Patterns Save on an installed card.
//   (b) First install over the temporary Find-my-strips setup: the door is
//       "Clear temporary setup", then install again.
// Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cardState } from './harness/cardStates';
import {
  realPracticeCard, bootConnected, nextWrite, holds, lastSent, configWrites, linkState,
  startWordsLog, startQuietWatch, stopQuietWatch, startNotTakenWatch, notTakenSeen, reportWords,
  QUIET_LIMIT_MS,
} from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

test.describe.configure({ timeout: 300_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

const NO_ROOM = (bytes: number) => ({
  status: 400,
  body: { ok: false, error: `nvs write failed; previous project remains intact and runtime unchanged (project is ${bytes} bytes, card storage has room for 3968)` },
  times: 1,
});
const NO_ROOM_WORDS = /no room|not enough room|too large|storage/i;
const WRONG_CAUSE = ['did not answer', 'not connected', 'could not reach', 'card stopped responding'];

test('Patterns Save, card has no room: Studio says so, the card keeps its project, and a retry with room saves', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  await bootConnected(page, practice, { hash: '#screen=pattern' });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await page.waitForTimeout(2_500);
  const before = holds(practice.card);
  practice.card.refuse('/api/config', NO_ROOM(4100));
  await startWordsLog(page);
  await startNotTakenWatch(page, WRONG_CAUSE);
  await startQuietWatch(page, 'no room|Try saving again|Not saved|\\bSaved\\b');
  const write = nextWrite(practice.card);
  await button.click();
  await write;
  await expect(page.getByText(NO_ROOM_WORDS).first(), 'Studio names the cause: no room').toBeVisible({ timeout: 20_000 });
  const quiet = await stopQuietWatch(page);
  expect.soft(holds(practice.card), 'the card kept the project it had').toEqual(before);
  await expect.soft(button).not.toHaveText(/^\W*Saved\W*$/);
  await expect.soft(page.getByText('Installed on card', { exact: true })).toHaveCount(0);
  expect.soft(await notTakenSeen(page), 'a refusal is not "did not answer"').toEqual([]);
  expect.soft(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);

  // There is room now (the refusal was one-shot). The owner saves again.
  await expect(button).toBeEnabled({ timeout: 10_000 });
  await startQuietWatch(page, '\\bSaved\\b|has not come back|Not saved|did not');
  await button.click();
  await expect(button, 'the retry ends Saved').toHaveText(/Saved/, { timeout: 60_000 });
  const retry = await stopQuietWatch(page);
  await expect.soft(page.getByText(NO_ROOM_WORDS), 'the no-room line is gone after a clean save').toHaveCount(0);
  expect.soft(holds(practice.card).projectFingerprint).toBe(lastSent(practice.card).projectFingerprint);
  expect.soft(configWrites(practice.card)).toHaveLength(2);
  expect.soft(retry.gapMs, `retry: longest wait with nothing on screen began at: ${retry.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
});

/** The [J01] walk at the practice card's real speed, up to the install task over the temporary setup. */
async function walkToInstall(page: Page, p: InterruptionCard) {
  await p.card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Pair this card', exact: true }).click();
  await expect.poll(() => linkState(page), { timeout: 30_000 }).toMatch(/^connected-/);
  await page.getByTestId('setup-lights-action').click();
  await page.getByTestId('discovery-probe-18').click();
  await expect(page.getByTestId('discovery-start')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('discovery-start').click();
  await expect(page.getByTestId('discovery-color-proof')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('discovery-color-red').click();
  await page.getByTestId('discovery-color-green').click();
  await page.getByTestId('discovery-count-18').fill('41');
  await page.getByTestId('discovery-counts-done').click();
  await page.getByTestId('discovery-end-yes').click();
  await page.getByTestId('discovery-record-save').click();
  await expect(page.getByTestId('discovery-done')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('discovery-continue-layout').click();
  await expect(page).toHaveURL(/#screen=layout/, { timeout: 30_000 });
  await page.evaluate(() => { window.location.hash = '#screen=card&section=setup'; });
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-task', 'test-and-save', { timeout: 60_000 });
  await page.getByTestId('setup-verify-action').click();
  await expect(page.getByTestId('replace-card-project')).toBeVisible({ timeout: 30_000 });
  return page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || '');
}

test('install over the temporary setup, card has no room: Studio says so and offers Clear temporary setup; after it, install lands', async ({ page }) => {
  practice = realPracticeCard(cardState('factory-blank'));
  const projectId = await walkToInstall(page, practice);
  const before = holds(practice.card);
  expect(before.projectId, 'fixture: the card is on the temporary setup').toBe('lightweaver-bench-discovery-v1');
  // The real project is staged as a wiring candidate; the card has no room for it.
  practice.card.refuse('/api/wiring/candidate', NO_ROOM(4100));
  practice.card.refuse('/api/config', NO_ROOM(4100));
  await startWordsLog(page);
  await startNotTakenWatch(page, WRONG_CAUSE);
  await startQuietWatch(page, 'no room|could not|did not|refused|Clear temporary setup');
  await page.getByTestId('replace-card-project').click();
  await expect(page.getByText(NO_ROOM_WORDS).first(), 'Studio names the cause: no room').toBeVisible({ timeout: 60_000 });
  const quiet = await stopQuietWatch(page);
  expect.soft(holds(practice.card), 'the card kept the temporary setup').toEqual(before);
  await expect.soft(page.getByText('Installed on card', { exact: true })).toHaveCount(0);
  expect.soft(await notTakenSeen(page)).toEqual([]);
  expect.soft(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);

  // The way out: Clear temporary setup, reachable from where the owner is.
  const clear = page.getByRole('button', { name: 'Clear temporary setup' });
  const doorHere = await clear.first().isVisible().catch(() => false);
  expect.soft(doorHere, 'the no-room message offers Clear temporary setup on the same screen').toBe(true);
  if (!doorHere) {
    await page.evaluate(() => { window.location.hash = '#screen=card'; });
    await page.getByText(/Checks & recovery/).first().click().catch(() => {});
  }
  await clear.first().click({ timeout: 30_000 });
  await expect.poll(() => practice!.card.state.projectId, { timeout: 30_000, message: 'the temporary setup is cleared' }).toBe('');
  // A blank card has room. Install again.
  await page.waitForTimeout(20_000);
  await page.evaluate(() => { window.location.hash = '#screen=card&section=setup'; });
  const install = page.getByTestId('setup-verify-action').or(page.getByTestId('replace-card-project')).or(page.getByRole('button', { name: /Save to card|Install/ }));
  await install.first().click({ timeout: 60_000 });
  await page.getByTestId('replace-card-project').click({ timeout: 10_000 }).catch(() => {});
  await page.getByTestId('wiring-test-start').click({ timeout: 60_000 }).catch(() => {});
  await page.getByTestId('wiring-test-confirm').click({ timeout: 60_000 }).catch(() => {});
  await expect.poll(() => practice!.card.state.projectId, { timeout: 90_000, message: 'the retry installs the real project' }).toBe(projectId);
  await expect.soft(page.getByText(NO_ROOM_WORDS), 'no stale no-room line after the clean install').toHaveCount(0);
});
