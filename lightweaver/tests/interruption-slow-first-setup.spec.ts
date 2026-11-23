// Interruption 6: a card that answers, but slowly — 5 s for every reply — for
// the whole of first setup (the [J01] walk: pair a factory-blank card, find
// its strip, count it, install the real project through the light test, play
// a pattern). Every step must finish, the card must end holding the
// discovered project, nothing may say a step failed, and after each of the
// owner's actions Studio must show it is working within 3 s.
// Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import { settleEndCheck, stopRunAt } from './ux/drivers';
import type { Locator, Page } from '@playwright/test';
import { cardState } from './harness/cardStates';
import { FALSE_FAILURE_WORDING } from './harness/falseFailureWatch';
import {
  knownDefect, realPracticeCard, linkState, startWordsLog, startQuietWatch, stopQuietWatch, startNotTakenWatch, notTakenSeen,
  reportWords, QUIET_LIMIT_MS,
} from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

const SLOW_REPLY_MS = 5_000;
const STEP_MS = 120_000;

test.describe.configure({ timeout: 900_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

type Gap = { step: string; gapMs: number; gapText: string };

/** One owner action, then wait for what it leads to; keep the longest silent stretch in between. */
async function step(page: Page, gaps: Gap[], name: string, act: () => Promise<unknown>, until: () => Promise<unknown>) {
  await startQuietWatch(page, '$^');
  await act();
  await until();
  const quiet = await stopQuietWatch(page);
  gaps.push({ step: name, gapMs: quiet.gapMs, gapText: quiet.gapText });
}

const visible = (l: Locator) => () => expect(l).toBeVisible({ timeout: STEP_MS });

test('pairing a factory-blank card that answers in 5 s: it pairs, and Studio never shows a raw error', async ({ page }) => {
  knownDefect('D5', 'a card answering in 5 s cannot be paired; raw "signal is aborted without reason"');
  practice = realPracticeCard(cardState('factory-blank'));
  practice.card.setReplyDelay(SLOW_REPLY_MS);
  await practice.card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await startWordsLog(page);
  const pair = page.getByRole('button', { name: 'Pair this card', exact: true });
  await expect(pair).toBeVisible({ timeout: STEP_MS });
  await startQuietWatch(page, '$^');
  await pair.click();
  let pairedFirstTime = await expect.poll(() => linkState(page), { timeout: 60_000 }).toMatch(/^connected-/).then(() => true, () => false);
  if (!pairedFirstTime) {
    await page.getByRole('button', { name: 'Connect', exact: true }).first().click();
    await expect.poll(() => linkState(page), { timeout: 60_000 }).toMatch(/^connected-/).catch(() => {});
  }
  const quiet = await stopQuietWatch(page);
  const screen = await page.locator('body').innerText();
  expect.soft(pairedFirstTime, 'Pair this card pairs a slow card on the first press').toBe(true);
  expect.soft(await linkState(page), 'connected in the end').toMatch(/^connected-/);
  expect.soft(screen, 'no raw browser error text').not.toMatch(/signal is aborted|AbortError|Failed to fetch|TypeError/i);
  expect.soft(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
});

test('first setup after pairing, card answering in 5 s: every step finishes, the card holds the project, never silent for 3 s', async ({ page }) => {
  // D6 (probe 4 s timeout, raw abort text) is fixed in beaconProbe.js and the
  // Find my strips panel. D7 is benchInstall.js, outside that change.
  knownDefect('D7', 'setup write blamed on the card page (D7)');
  practice = realPracticeCard(cardState('factory-blank'));
  const { card } = practice;
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await startWordsLog(page);
  await startNotTakenWatch(page, [...FALSE_FAILURE_WORDING, 'failed', 'could not']);
  const gaps: Gap[] = [];
  const t0 = Date.now();

  const pair = page.getByRole('button', { name: 'Pair this card', exact: true });
  await expect(pair).toBeVisible({ timeout: STEP_MS });
  // Paired at the card's normal speed (pairing at 5 s is the test above), then slow from here on.
  await pair.click();
  await expect.poll(() => linkState(page), { timeout: 30_000 }).toMatch(/^connected-/);
  card.setReplyDelay(SLOW_REPLY_MS);
  const journey = page.getByTestId('setup-journey');
  await expect(journey).toHaveAttribute('data-journey-task', 'discover-lights', { timeout: STEP_MS });

  await step(page, gaps, 'open find-my-strips', () => page.getByTestId('setup-lights-action').click(),
    visible(page.getByTestId('strip-discovery')));
  await step(page, gaps, 'probe GPIO 18', () => page.getByTestId('discovery-probe-18').click(),
    () => expect.poll(async () => card.state.beaconPinned === 18 || await page.getByText(/Could not light GPIO 18/).count() > 0, { timeout: STEP_MS }).toBe(true));
  expect.soft(card.state.beaconPinned, 'the probe lit GPIO 18 (else: the owner carries on, as the screen offers)').toBe(18);
  await expect(page.getByTestId('discovery-start')).toBeEnabled({ timeout: STEP_MS });
  await step(page, gaps, 'start (bench install)', () => page.getByTestId('discovery-start').click(),
    visible(page.getByTestId('discovery-color-proof')));
  await step(page, gaps, 'colour row', () => page.getByTestId('discovery-colour-row-rgb').click(),
    visible(page.getByTestId('discovery-run')));
  await stopRunAt(page, 41);
  await settleEndCheck(page, 41);
  await step(page, gaps, 'end check', () => page.getByTestId('discovery-end-yes').click(),
    visible(page.getByTestId('discovery-done')));
  await step(page, gaps, 'continue to layout', () => page.getByTestId('discovery-continue-layout').click(),
    () => expect(page).toHaveURL(/#screen=layout/, { timeout: STEP_MS }));
  const realProjectId = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || '');

  await page.evaluate(() => { window.location.hash = '#screen=card&section=setup'; });
  await expect(journey).toHaveAttribute('data-journey-task', 'test-and-save', { timeout: STEP_MS });
  await step(page, gaps, 'test and save', () => page.getByTestId('setup-verify-action').click(),
    visible(page.getByTestId('replace-card-project')));
  await step(page, gaps, 'replace bench project (stage)', () => page.getByTestId('replace-card-project').click(),
    visible(page.getByTestId('wiring-test-start')));
  await step(page, gaps, 'start light test (activate)', () => page.getByTestId('wiring-test-start').click(),
    visible(page.getByTestId('wiring-test-confirm')));
  await step(page, gaps, 'confirm light test', () => page.getByTestId('wiring-test-confirm').click(),
    () => expect(page).toHaveURL(/#screen=pattern$/, { timeout: STEP_MS }));
  await step(page, gaps, 'play aurora', () => page.locator('.pm-cards .pmcard[data-pattern-id="aurora"]').click(),
    () => expect.poll(() => card.state.currentId, { timeout: STEP_MS }).toBe('aurora'));

  console.log(`  first setup took ${Math.round((Date.now() - t0) / 1000)} s; gaps: ${JSON.stringify(gaps.map(g => `${g.step} ${g.gapMs}ms`))}`);
  expect.soft(card.state.projectId, 'the card holds the discovered project').toBe(realProjectId);
  expect.soft(card.state.pixels).toBe(41);
  expect.soft(card.state.wiringTestActive).toBe(false);
  expect.soft(await notTakenSeen(page), 'failure wording during a slow but healthy setup').toEqual([]);
  for (const gap of gaps) {
    expect.soft(gap.gapMs, `"${gap.step}": longest wait with nothing on screen began at: ${gap.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
  }
});
