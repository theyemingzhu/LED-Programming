// L1 (todo/plans/practice-card-interruptions.md): the bench card (1.2.6,
// 2026-11-23) answers /api/patterns with 9,066 bytes for its six looks. Studio
// refused anything over 8 KiB, so "Open installed project" rebuilt the project
// from the status alone, holding Fire only, and the next save wiped five looks.
//
//   1. The real 9,066-byte answer: all six looks are opened.
//   2. An answer too large to read, or one that never arrives in time: nothing
//      is opened, the open project is unchanged, and Studio says so.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';

const BENCH = fs.readFileSync(fileURLToPath(new URL('../src/lib/fixtures/real-card-bench-2026-11-23-patterns.json', import.meta.url)), 'utf8').trim();

test.describe.configure({ timeout: 120_000 });

async function openCard(page: Page, answer: (route: any) => Promise<void>) {
  const card = createCardSimulator(cardState('playing'));
  await card.install(page);
  await page.route('http://lightweaver.local/api/patterns', answer);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    if (localStorage.getItem('lw_card_identity_v1')) return;
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  const open = page.getByTestId('installed-project-open');
  await open.waitFor({ timeout: 30_000 }).then(() => open.click()).catch(() => {});
  return card;
}

const draft = (page: Page) => page.evaluate(() => {
  try {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return { id: project?.id || '', looks: (project?.devices?.standaloneController?.looks || []).length };
  } catch { return { id: '', looks: 0 }; }
});

test('the bench card\'s 9,066-byte look list opens all six looks', async ({ page }) => {
  expect(Buffer.byteLength(BENCH), 'fixture: the bench card\'s own answer').toBe(9066);
  const card = await openCard(page, route => route.fulfill({ status: 200, contentType: 'application/json', body: BENCH }));
  await expect.poll(async () => (await draft(page)).id, { timeout: 30_000 }).toBe(card.state.projectId);
  expect((await draft(page)).looks, 'all six looks opened').toBe(6);
});

for (const [name, answer] of [
  ['too large to read', async route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ...JSON.parse(BENCH), padding: 'x'.repeat(140 * 1024) }),
  })],
  ['never in time', async route => {
    await new Promise(resolve => setTimeout(resolve, 8_000));
    await route.fulfill({ status: 200, contentType: 'application/json', body: BENCH }).catch(() => {});
  }],
] as const) {
  test(`a look list ${name}: nothing is opened, and Studio says so`, async ({ page }) => {
    const card = await openCard(page, answer);
    await expect(page.getByText(/could not read every look on this card, so nothing was opened/).first()).toBeVisible({ timeout: 60_000 });
    expect((await draft(page)).id, 'the card\'s project was not opened').not.toBe(card.state.projectId);
    await expect(page.getByText(/Your draft matches the installed project/), 'never claims a match it could not check').toHaveCount(0);
  });
}
