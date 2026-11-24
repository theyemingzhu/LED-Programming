// The physical card, live build 2559 (durability run, 2026-11-21): an owner
// moves the bench-discovery card (256 lights) to a 5-section, 41-light project
// and presses Layout's "Check and install". Card setup opens the install task
// in step 3 while step 3 is still locked, the install starts anyway, the card
// stages the wiring ("staged, nextStep: activate") — and "Start light test",
// the only way to activate it, is never on screen. The staged change expires;
// the card stays at 256. The owner must always reach the light test from
// wherever they saved, see progress, and never read "not connected" while the
// card is connected. Plan: todo/plans/false-failures.md (F-E1).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createBenchDiscoveryCard, createBenchDiscoveryPracticeCard } from './harness/benchDiscoveryCard';
import type { CardSimulator } from './harness/cardSimulator';
import { startFalseFailureWatch, falseFailures } from './harness/falseFailureWatch';

const PROJECT = fileURLToPath(new URL('./fixtures/real-card-bench-2026-11-21/nov19-restore.lw.json', import.meta.url));

test.describe.configure({ timeout: 240000 });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const seen = await falseFailures(page).catch(() => []);
  const text = await page.locator('body').innerText().catch(() => '');
  console.log(`[step3] ${info.title}\n  wording seen: ${JSON.stringify(seen)}\n  hash: ${page.url()}\n  screen: ${text.replace(/\s+/g, ' ').slice(0, 1200)}`);
});

async function seedCard(page: Page, card: CardSimulator) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });
}

async function linkConnected(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  });
}

async function moveCardToProject(page: Page, card: CardSimulator) {
  await card.install(page);
  await seedCard(page, card);
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkConnected(page), { timeout: 25000 }).toBe(true);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await page.getByTestId('project-file-input').setInputFiles(PROJECT, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.layout?.strips?.length || 0; } catch { return 0; }
  }), { timeout: 20000 }).toBeGreaterThan(1);
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  const install = page.getByTestId('layout-check-and-install').first();
  await expect(install).toBeEnabled({ timeout: 20000 });
  await startFalseFailureWatch(page, ['a lightweaver card is not connected', 'not connected', 'has not come back after restarting', 'update rolled back', 'the last card operation failed']);
  await install.click();
  // The owner reaches the light test from where they saved. A wiring change
  // this press staged starts its own test (simpler-journeys C2); one Studio
  // found already staged, or whose automatic start failed, offers "Start
  // light test". Either way it is never out of reach.
  const start = page.getByTestId('wiring-test-start');
  const confirm = page.getByTestId('wiring-test-confirm');
  await expect(start.or(confirm).first(), 'the light test must be reachable after the card staged the wiring').toBeVisible({ timeout: 60000 });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
  } else {
    // Self-started: the card, not the screen, proves the test is running.
    expect(card.requests.some(r => r.method === 'POST' && r.path === '/api/wiring/activate'),
      'the activation was sent before the confirm showed').toBe(true);
    expect(card.state.wiringTestActive, 'the card is in its light-test probation').toBe(true);
  }
  await expect(confirm).toBeVisible({ timeout: 60000 });
  await confirm.click();
  await expect.poll(() => card.requests.some(r => r.method === 'POST' && r.path === '/api/wiring/confirm'), { timeout: 60000 }).toBe(true);
  await expect.poll(() => card.state.pixels, { timeout: 60000 }).toBe(41);
  await expect.poll(() => card.state.wiringTestActive, { timeout: 30000, message: 'the light test ended confirmed, not left open' }).toBe(false);
  expect(card.requests.some(r => r.method === 'POST' && r.path === '/api/wiring/activate')).toBe(true);
  expect(await falseFailures(page)).toEqual([]);
}

test('bench card, Fast: a Layout save to a new 5-section project reaches the light test and ends at 41 lights', async ({ page }) => {
  await moveCardToProject(page, createBenchDiscoveryCard());
});

test('bench card, Real-timing: the same move, with real restart and reply times', async ({ page }) => {
  const { card } = createBenchDiscoveryPracticeCard({ timing: 'real' });
  await moveCardToProject(page, card);
});

test('bench card: the card stages the wiring but its reply is lost, and the owner still reaches the light test', async ({ page }) => {
  // The card stages the wiring, but its "staged" reply lands after Studio's
  // 6 s write timeout. Studio must ask the card what it holds, find the staged
  // change, and offer "Start light test", never a restart wait (F-E1).
  const card = createBenchDiscoveryCard();
  // The card stores the staged change, and its reply never arrives (the
  // honest shape of "staged, but Studio never heard"): respondThenDrop
  // applies the request for real and withholds only the reply.
  card.respondThenDrop('/api/wiring/candidate');
  await moveCardToProject(page, card);
});

test('bench card, Real-timing: a card answering in 3.5 s gets its staged wiring within 25 s of the press', async ({ page }) => {
  // On the real card the candidate was sent 70 s after the press.
  const { card } = createBenchDiscoveryPracticeCard({ timing: 'real' });
  const pressedAt: number[] = [];
  page.on('console', () => {});
  await card.install(page);
  await seedCard(page, card);
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkConnected(page), { timeout: 25000 }).toBe(true);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await page.getByTestId('project-file-input').setInputFiles(PROJECT, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.layout?.strips?.length || 0; } catch { return 0; }
  }), { timeout: 20000 }).toBeGreaterThan(1);
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  const install = page.getByTestId('layout-check-and-install').first();
  await expect(install).toBeEnabled({ timeout: 20000 });
  card.setReplyDelay(3500);
  pressedAt.push(Date.now());
  await install.click();
  await expect.poll(() => card.requests.find(r => r.method === 'POST' && r.path === '/api/wiring/candidate')?.at || 0, { timeout: 90000 }).toBeGreaterThan(0);
  const sentAfterMs = card.requests.find(r => r.method === 'POST' && r.path === '/api/wiring/candidate')!.at - pressedAt[0];
  console.log(`[step3] candidate sent ${sentAfterMs} ms after the press`);
  // 25 s, not 20: since L1 (2026-11-24) every save first re-reads the card's
  // look list so it can never drop looks, one more 3.5 s round trip here.
  expect(sentAfterMs).toBeLessThan(25000);
  await expect(page.getByTestId('wiring-test-start').or(page.getByTestId('wiring-test-confirm')).first()).toBeVisible({ timeout: 60000 });
  card.setReplyDelay(0);
});

test('bench card: when the light test cannot start by itself, "Start light test" is offered to try again', async ({ page }) => {
  // The real-card restore path: the card staged the wiring, but activating it
  // failed. The staged change must not be left to expire unreachable.
  const card = createBenchDiscoveryCard();
  card.refuse('/api/wiring/activate', { status: 503, body: { ok: false, error: 'busy' }, times: 1 });
  await card.install(page);
  await seedCard(page, card);
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkConnected(page), { timeout: 25000 }).toBe(true);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; });
  await page.getByTestId('project-file-input').setInputFiles(PROJECT, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.layout?.strips?.length || 0; } catch { return 0; }
  }), { timeout: 20000 }).toBeGreaterThan(1);
  await page.evaluate(() => { window.location.hash = '#screen=layout'; });
  const install = page.getByTestId('layout-check-and-install').first();
  await expect(install).toBeEnabled({ timeout: 20000 });
  await install.click();
  const start = page.getByTestId('wiring-test-start');
  await expect(start, 'a failed automatic start leaves the manual start on screen').toBeVisible({ timeout: 60000 });
  await start.click();
  await page.getByTestId('wiring-test-confirm').click({ timeout: 60000 });
  await expect.poll(() => card.state.pixels, { timeout: 60000 }).toBe(41);
});
