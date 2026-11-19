import { test, expect } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_FIRMWARE_VERSION, MATRIX_BUILD_ID, MATRIX_HOST } from './harness/cardStates';
import { installHttpsStudio, installFakeCardBridge, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';

// Owner-journey audit 2026-11-19, gap 1. On the public Studio a card on a
// direct link that dropped for longer than the reconnect window was never
// asked again: the card came back, and 30 seconds later Studio still said
// "Not connected" with every card button disabled. Localhost healed in about
// eight seconds because useCardStatus polls there; the https Studio does not
// run it (app.jsx `directCardControl`), so nothing was left looking.
//
// This is the card-state matrix's "heals itself, zero clicks" contract, held
// at the origin owners actually use.

async function linkState(page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const state = getSharedCardLink().getState();
    return `${state?.state || ''}/${state?.transport || ''}`;
  });
}

test('[https-direct] a card that drops past the reconnect window reconnects by itself', async ({ page }) => {
  test.setTimeout(150_000);
  const card = createCardSimulator(cardState('installed-match'));
  await card.install(page);
  await installHttpsStudio(page, testBaseURL);
  await installFakeCardBridge(page, card);
  await page.addInitScript(({ id, firmwareVersion, buildId, host }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', host);
    localStorage.setItem('lw_chip_card_host', host);
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, host: MATRIX_HOST });

  let clicks = 0;
  await page.exposeFunction('__countClick', () => { clicks += 1; });

  await page.goto(`${STUDIO_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkState(page), { timeout: 20_000, intervals: [250] }).toBe('connected-direct/direct');
  await page.evaluate(() => document.addEventListener('click', () => (window as any).__countClick(), true));

  card.goOffline();
  // Idle keepalive (20s) + the reconnect window (15s): Studio must be allowed
  // to give up honestly before the card returns, or this proves nothing.
  await expect.poll(() => linkState(page), { timeout: 60_000, intervals: [500] }).toMatch(/^disconnected\//);

  card.goOnline();
  await expect.poll(() => linkState(page), { timeout: 15_000, intervals: [250] }).toBe('connected-direct/direct');
  expect(clicks, 'the owner pressed nothing').toBe(0);
  await expect(page.getByTestId('card-link-status')).toContainText('Connected');
});
