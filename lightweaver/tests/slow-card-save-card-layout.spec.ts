// Card Home and Layout saves against a card as slow as the real one: every
// accepted save restarts it, and it is silent for about 14 s. Both end
// "Installed on card", show they are working the whole time, and never say
// they failed. Plan: todo/plans/false-failures.md.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, CARD_HOSTS } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';
import {
  seedKnownCard, startFalseFailureWatch, falseFailures, startWorkingWatch, stopWorkingWatch,
} from './harness/falseFailureWatch';

const REAL_RESTART_MS = 14000;
// Success text counts: the owner is told how it ended, not left waiting.
const WORKING = 'Restarting (the )?card|Checking card|Verifying|Sending|Saving|Loading';
// The save's own success: its banner, or (Layout's install hands off) arriving
// on Patterns with the card holding the project. Matched against
// "<hash> <screen text>". Watching stops counting once either is shown.
const DONE = 'Installed revision \\d+ on card|^#screen=pattern [\\s\\S]*Installed on card';
const BUSY = '.la-card-push-banner.is-pending, [aria-busy="true"], .lw-notice-spinner';

test.describe.configure({ timeout: 150000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[false-failures] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 700)}`);
});

async function bootRealCard(page: Page) {
  const spec = {
    ...cardState('installed-match'),
    firmwareUpdateOverride: { phase: 'rolled-back', rollbackReason: 'health-check-failed' },
  };
  const card = createCardSimulator(spec, { restartAfterSaveMs: REAL_RESTART_MS });
  await card.install(page);
  for (const other of CARD_HOSTS) {
    if (other === 'lightweaver.local') continue;
    await page.route(`http://${other}/**`, route => route.abort('connectionrefused'));
  }
  await seedKnownCard(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  }), { timeout: 20000 }).toMatch(/^connected-/);
  // A fresh browser may already have picked the card's project up by itself.
  const open = page.getByTestId('installed-project-open');
  await open.waitFor({ timeout: 8000 }).then(() => open.click()).catch(() => {});
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.id; } catch { return null; }
  })).toBe(spec.projectId);
  return { card, spec };
}

test('Layout: an LED-count save through a 14 s restart ends Installed on card, never failed', async ({ page }) => {
  const { card, spec } = await bootRealCard(page);
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('[data-strip-id]').first();
  await expect(strip).toBeVisible({ timeout: 20000 });
  if (!await strip.locator('.la-strip-detail').isVisible()) await strip.locator('.la-strip-row').click();
  const countInput = strip.getByRole('spinbutton', { name: /LED count$/ });
  await expect(countInput).toHaveValue(String(spec.pixels));
  await countInput.fill(String(spec.pixels + 1));
  await countInput.blur();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips?.[0]?.pixelCount ?? null))
    .toBe(spec.pixels + 1);

  await startFalseFailureWatch(page);
  await startWorkingWatch(page, BUSY, WORKING, DONE);
  const startedAt = Date.now();
  await page.getByTestId('layout-check-and-install').click();
  await expect(page.getByText(/Restarting (the )?card/).first()).toBeVisible({ timeout: 15000 });
  await expect(page, 'verified install hands off to Patterns').toHaveURL(/#screen=pattern$/, { timeout: 60000 });
  await expect(page.getByText('Installed on card', { exact: true })).toBeVisible({ timeout: 10000 });
  const tookMs = Date.now() - startedAt;
  const working = await stopWorkingWatch(page);
  expect(await falseFailures(page)).toEqual([]);
  expect(working.idleGapMs, `longest stretch with no sign of work began at: ${working.gapText}`).toBeLessThan(600);
  expect(tookMs).toBeGreaterThan(REAL_RESTART_MS - 1000);
  expect(card.state.pixels).toBe(spec.pixels + 1);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/config')).toHaveLength(1);
  await page.waitForTimeout(3000);
  expect(await falseFailures(page)).toEqual([]);
});

test('Card Home: Save to card through a 14 s restart ends Installed on card, never failed', async ({ page }) => {
  const { card } = await bootRealCard(page);
  // An edit kept in this browser: same project, a new playlist.
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
  await expect(save).toBeEnabled({ timeout: 25000 });

  await startFalseFailureWatch(page);
  await startWorkingWatch(page, BUSY, WORKING, DONE);
  const startedAt = Date.now();
  await save.click();
  await expect(page.getByText(/Restarting (the )?card/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Installed (revision \d+ )?on card/).first()).toBeVisible({ timeout: 60000 });
  const tookMs = Date.now() - startedAt;
  const working = await stopWorkingWatch(page);
  expect(await falseFailures(page)).toEqual([]);
  expect(working.idleGapMs, `longest stretch with no sign of work began at: ${working.gapText}`).toBeLessThan(600);
  expect(tookMs).toBeGreaterThan(REAL_RESTART_MS - 1000);
  expect(card.requests.filter(r => r.method === 'POST' && r.path === '/api/config')).toHaveLength(1);
  await page.waitForTimeout(3000);
  expect(await falseFailures(page)).toEqual([]);
});
