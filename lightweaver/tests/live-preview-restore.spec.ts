// LIVE HARDWARE CHECK — not part of CI.
//
// Starts a live preview on Adrian's real card at 192.168.18.70, stops it, and
// checks the card is back on the look it was playing (/api/patterns currentId),
// not on per-section patterns with no current look (measured 2026-11-25).
//
//   LW_ALLOW_PHYSICAL_CARD=1 npx playwright test tests/live-preview-restore.spec.ts --project=chromium --workers=1
//
// It streams dim red frames for a few seconds; brightness and power cap are not touched.
import { test, expect } from '@playwright/test';

const CARD_ID = 'lw-b0fe81f61b44';
const HOST = '192.168.18.70';

async function cardLook() {
  const patterns = await (await fetch(`http://${HOST}/api/patterns`)).json();
  return { id: patterns.currentId as string, index: patterns.currentIndex as number };
}

test.setTimeout(120000);

test('stopping a live preview gives the real card its look back', async ({ page }) => {
  const before = await cardLook();
  console.log('RESTORE before:', JSON.stringify(before));
  expect(before.index).toBeGreaterThanOrEqual(0);

  await page.addInitScript(([id, host]) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id }));
    localStorage.setItem('lw_card_host', host);
  }, [CARD_ID, HOST]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async host => {
    const { createPatternLabPreviewSession } = await import('/src/lib/patternLabPreviewSession.js');
    const states: string[] = [];
    const session = createPatternLabPreviewSession({ host, onStateChange: s => states.push(s.state) });
    const frame = Array.from({ length: 205 }, () => '200000');
    await session.start(frame);
    for (let i = 0; i < 40; i += 1) { session.push(frame); await new Promise(r => setTimeout(r, 100)); }
    const live = session.status();
    let stopError = '';
    try { await session.stop('user'); } catch (error) { stopError = String(error?.message || error); }
    return { states, live: { state: live.state, delivered: live.delivered }, end: session.status(), stopError };
  }, HOST);
  console.log('RESTORE session:', JSON.stringify({ ...result, end: { state: result.end.state, restored: result.end.restored } }));

  await page.waitForTimeout(1500);
  const after = await cardLook();
  console.log('RESTORE after:', JSON.stringify(after));
  expect(result.stopError).toBe('');
  expect(result.end.state).toBe('restored');
  expect(after).toEqual(before);
});
