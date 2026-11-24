// Card Home's Health row reads the card's last crash (firmware 1.2.7,
// /api/status lastCrash) and offers its details for support, only when one
// is recorded. Plan: todo/plans/crash-recorder.md (Studio line).
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';
import { seedKnownCard, waitForCardProject } from './harness/falseFailureWatch';

test.describe.configure({ timeout: 90000 });

const watchdogCrash = {
  sequence: 2, resetReason: 6, reason: 'taskWatchdog', phase: 'idle', task: 'loopTask',
  uptimeMs: 27252000, freeHeap: 91234, minFreeHeap: 40960, pc: '0x420a1b2c',
  backtrace: ['0x420a1b2c', '0x4037f001'],
};

async function openCardHome(page, lastCrash) {
  const card = createCardSimulator(cardState('playing'));
  (card.state as { lastCrash?: unknown }).lastCrash = lastCrash;
  await card.install(page);
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForCardProject(page);
  await page.evaluate(() => { window.location.hash = '#screen=card'; });
  await expect(page.getByTestId('card-checks-recovery')).toBeVisible({ timeout: 20000 });
  return card;
}

test('a card that crashed says so in Health and copies the details', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openCardHome(page, watchdogCrash);
  const line = page.getByTestId('card-crash-line');
  await expect(line).toContainText('Last crash: The card stopped responding (task watchdog) while idle, after 7.57 hours running. It has done this 2 times.');
  await page.getByTestId('card-crash-copy').click();
  await expect(page.getByTestId('card-crash-copied')).toHaveText(/Copied/);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Backtrace: 0x420a1b2c 0x4037f001');
  expect(copied).toMatch(/Firmware: .+ \(build /);
});

test('a card that never crashed, or predates the recorder, shows no crash line', async ({ page }) => {
  await openCardHome(page, null);
  await expect(page.getByTestId('card-checks-recovery')).toBeVisible();
  await expect(page.getByTestId('card-crash-line')).toHaveCount(0);
});
