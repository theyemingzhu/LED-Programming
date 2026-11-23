// Interruption 8: the card answers the save "saved", restarts, and comes back
// holding the OLD project (a write that rolled back — power cut mid-commit, or
// the card refusing the new project at boot). Studio must not say "Saved" or
// "Installed on card" about it, must say the card does not have it, and must
// not go quiet. Patterns and Card Home.
// Real-timing practice card. Plan: todo/plans/practice-card-interruptions.md.
import { test, expect } from '@playwright/test';
import { cardState } from './harness/cardStates';
import {
  realPracticeCard, bootConnected, nextWrite, holds, lastSent, rollBackNextSave, REAL_RESTART_MS,
  startWordsLog, startQuietWatch, stopQuietWatch, reportWords, SAYS_TAKEN, QUIET_LIMIT_MS,
} from './harness/interruptions';
import type { InterruptionCard } from './harness/interruptions';

test.describe.configure({ timeout: 180_000 });

let practice: InterruptionCard | null = null;
test.afterEach(async ({ page }, info) => { await reportWords(page, practice, info); practice = null; });

const ENDED = '\\bSaved\\b|Installed (revision \\d+ )?on card|did not verify|did not take|not saved|Try saving again|has not come back|could not verify|Retry';

async function sawTakenAfter(page, t0: number) {
  // Lines already on screen before the press are logged at ~0 ms; only what appears after counts.
  return page.evaluate(({ src, flags, t0 }) => {
    const words = (window as unknown as { __lwWords?: { t: number; text: string }[] }).__lwWords || [];
    const re = new RegExp(src, flags);
    return words.filter(w => w.t > t0 && re.test(w.text)).map(w => w.text);
  }, { src: SAYS_TAKEN.source, flags: SAYS_TAKEN.flags.replace('g', ''), t0 });
}

test('Patterns Save, the card comes back holding the old project: Studio never says Saved or Installed', async ({ page }) => {
  practice = realPracticeCard(cardState('playing'));
  await bootConnected(page, practice, { hash: '#screen=pattern' });
  const button = page.getByTestId('pattern-install-on-card');
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await page.locator('[data-pattern-id="aurora"]').first().click();
  await page.waitForTimeout(2_500);
  const old = holds(practice.card);
  const rollback = rollBackNextSave(practice.card);
  await startWordsLog(page);
  await startQuietWatch(page, ENDED);
  const write = nextWrite(practice.card);
  await button.click();
  await write;
  await rollback.done;
  await page.waitForTimeout(REAL_RESTART_MS + 35_000);
  const quiet = await stopQuietWatch(page);
  expect.soft(holds(practice.card), 'fixture: the card holds the old project').toEqual(old);
  expect.soft(lastSent(practice.card).projectFingerprint, 'fixture: Studio sent a different project').not.toBe(old.projectFingerprint);
  expect.soft(await sawTakenAfter(page, 300), 'Studio said Saved / Installed about a save the card does not hold').toEqual([]);
  await expect.soft(button).not.toHaveText(/^\W*Saved\W*$/);
  expect.soft(quiet.endedAtMs, 'Studio said how the save ended').not.toBeNull();
  expect.soft(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
});

test('Card Home Save to card, the card comes back holding the old project: Studio never says Installed', async ({ page }) => {
  practice = realPracticeCard(cardState('installed-match'));
  await bootConnected(page, practice);
  // An edit kept in this browser: same project, a new playlist (as slow-card-save-card-layout).
  await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    project.devices.standaloneController.playlist = [
      { id: 'aurora', type: 'pattern', patternId: 'aurora', label: 'Aurora', enabled: true, createdAt: 1 },
      { id: 'plasma', type: 'pattern', patternId: 'plasma', label: 'Plasma', enabled: true, createdAt: 2 },
    ];
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  });
  await page.goto('/#screen=card&section=setup&task=install-project', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const save = page.getByRole('button', { name: 'Save to card', exact: true }).first();
  await expect(save).toBeEnabled({ timeout: 30_000 });
  const old = holds(practice.card);
  const rollback = rollBackNextSave(practice.card);
  await startWordsLog(page);
  await startQuietWatch(page, ENDED);
  const write = nextWrite(practice.card);
  await save.click();
  await write;
  await rollback.done;
  await page.waitForTimeout(REAL_RESTART_MS + 35_000);
  const quiet = await stopQuietWatch(page);
  expect.soft(holds(practice.card), 'fixture: the card holds the old project').toEqual(old);
  expect.soft(await sawTakenAfter(page, 300), 'Studio said Installed about a save the card does not hold').toEqual([]);
  expect.soft(quiet.endedAtMs, 'Studio said how the save ended').not.toBeNull();
  expect.soft(quiet.gapMs, `longest wait with nothing on screen began at: ${quiet.gapText}`).toBeLessThan(QUIET_LIMIT_MS);
});
