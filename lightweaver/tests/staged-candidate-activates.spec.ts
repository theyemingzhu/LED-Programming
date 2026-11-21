// FAILING ON PURPOSE (handed to the false-failures session, 2026-11-21).
// An owner moves a set-up card (the real card's bench state: 256 px on GPIO 18)
// to a new project with five sections, 41 px. Studio stages the wiring
// candidate, the card answers "staged, nextStep: activate", and Studio must then
// activate it. Today it never sends /api/wiring/activate, says "A Lightweaver
// card is not connected…" while the link is up, and the card stays at 256 px.
// Fixtures: tests/fixtures/real-card-bench-2026-11-21/ (real card read-back,
// Wi-Fi name redacted; recorded-writes-practice-card.json is the recording).
import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { REAL_CARD_STATE } from './harness/cardStates';

const FIXTURE = new URL('./fixtures/real-card-bench-2026-11-21/nov19-restore.lw.json', import.meta.url).pathname;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

test('a staged wiring candidate is activated and the card ends at the new count', async ({ page }) => {
  test.setTimeout(240000);
  const card = createCardSimulator({ ...REAL_CARD_STATE, wiringTransactionOpen: false, firmwareVersion: '1.2.4', buildNumber: 2464, projectFingerprint: 'd93ebe18ab7780b1' } as any);
  await card.install(page);
  const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.addInitScript(({ id }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion: '1.2.4', buildId: '' }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: (card.state as any).cardId });
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' }); await sleep(12000);
  await page.evaluate(() => { window.location.hash = '#screen=pattern'; }); await sleep(4000);
  await page.getByTestId('project-file-input').setInputFiles(FIXTURE, { timeout: 15000 }); await sleep(6000);
  await page.evaluate(() => { window.location.hash = '#screen=layout'; }); await sleep(6000);
  await page.getByTestId('layout-check-and-install').first().click({ timeout: 15000 });
  const seen = new Set<string>(); const end = Date.now() + 150000;
  while (Date.now() < end && !(card.state.pixels === 41 && posts.includes('/api/wiring/confirm'))) {
    for (const t of await page.locator('main [role=status], main [role=alert]').allTextContents().catch(() => [])) seen.add(t.replace(/\s+/g, ' ').trim());
    const go = page.locator('main button:not([disabled])').filter({ hasText: /^(Save project to this card|Yes.*|They look right|Lights look right|Keep this|Confirm.*|Continue|Start test|Test lights|Looks right)$/ }).first();
    if (await go.count().catch(() => 0)) await go.click({ timeout: 5000 }).catch(() => {});
    await sleep(1000);
  }
  await test.info().attach('screen', { body: [...seen].join('\n') });
  await test.info().attach('posts', { body: posts.join('\n') });
  expect(posts, 'the staged candidate was never activated').toContain('/api/wiring/activate');
  expect([...seen].filter(t => /A Lightweaver card is not connected/.test(t)), 'said not connected while the card link was up').toEqual([]);
  expect(card.state.pixels, 'the card did not end at the new count').toBe(41);
});
