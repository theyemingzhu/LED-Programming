// LIVE HARDWARE — the https bridge, end to end, against the real card.
//
//   npx playwright test tests/live-bridge-handshake.spec.ts --project=chromium --workers=1
//
// Everything else in the matrix fakes the card page. This does not: Studio is
// served at its real production origin, and the card page it opens is the
// actual ESP32 on the LAN. It is the only test that can prove the handshake
// Adrian's phone performs, because that handshake is between two real origins
// and a real popup.
//
// It exists because of a specific failure: patterns played fine ON the card
// while Studio's Patterns screen only ever said "Previewing in Studio", with
// "The card page opened but did not answer" above it.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { testBaseURL } from './testPort.mjs';

const HOST = '192.168.18.70';
const CARD_ID = 'lw-b0fe81f61b44';
const STUDIO_ORIGIN = 'https://led.mandalacodes.com';

test.setTimeout(180000);

async function cardStatus(): Promise<Record<string, unknown>> {
  const response = await fetch(`http://${HOST}/api/status`, { cache: 'no-store' });
  return response.json() as Promise<Record<string, unknown>>;
}

async function playingOnCard(): Promise<string> {
  const status = await cardStatus();
  return String(status.currentPatternId || status.currentLookId || '');
}

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const cardLink = await import('/src/lib/cardLink.js');
    return String(cardLink.getSharedCardLink().getState()?.state || '');
  });
}

test.beforeAll(async () => {
  const reachable = await cardStatus().then(() => true, () => false);
  test.skip(!reachable, `no Lightweaver card answering at ${HOST} — bench-only`);
  const status = await cardStatus();
  expect(String(status.cardId)).toBe(CARD_ID);
  console.log('CARD', JSON.stringify({
    build: status.buildNumber, playing: status.currentPatternId, project: status.projectId,
  }));
});

test('[LIVE] the https bridge reaches the real card and a tapped pattern plays', async ({ page }) => {
  // Serve the real app at the real production origin, so canPushDirectlyToCard()
  // is honestly false and Studio must go through the card page — the exact
  // path a phone takes, and the one nothing else exercises.
  await page.route(`${STUDIO_ORIGIN}/**`, async route => {
    const requested = new URL(route.request().url());
    const upstream = await page.request.fetch(`${testBaseURL}${requested.pathname}${requested.search}`, {
      method: route.request().method(),
      headers: route.request().headers(),
    });
    await route.fulfill({ response: upstream });
  });

  const status = await cardStatus();
  await page.addInitScript((seed) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id: seed.id, firmwareVersion: seed.firmwareVersion, buildId: seed.buildId,
    }));
    localStorage.setItem('lw_card_host', seed.host);
    localStorage.setItem('lw_chip_card_host', seed.host);
  }, {
    id: CARD_ID,
    host: HOST,
    firmwareVersion: String(status.firmwareVersion || ''),
    buildId: String(status.buildId || ''),
  });

  // Is window.open even called, and what does it hand back?
  await page.addInitScript(() => {
    const original = window.open.bind(window);
    (window as unknown as { __opens: string[] }).__opens = [];
    window.open = (...args: unknown[]) => {
      const result = original(...(args as Parameters<typeof original>));
      (window as unknown as { __opens: string[] }).__opens.push(
        `open(${String(args[0]).slice(0, 90)}) -> ${result ? 'window' : 'NULL (blocked)'}`,
      );
      return result;
    };
  });

  // Diagnostics: the whole question is whether the card page opens and answers.
  page.on('console', message => {
    const text = message.text();
    if (/bridge|card|popup|origin|blocked/i.test(text)) console.log('CONSOLE:', text.slice(0, 200));
  });
  page.on('pageerror', error => console.log('PAGEERROR:', String(error.message).slice(0, 200)));
  page.context().on('page', async popup => {
    console.log('POPUP OPENED:', popup.url());
    popup.on('console', m => console.log('  popup console:', m.text().slice(0, 160)));
    popup.on('pageerror', e => console.log('  popup error:', String(e.message).slice(0, 160)));
  });

  await page.goto(`${STUDIO_ORIGIN}/#screen=pattern`, { waitUntil: 'domcontentloaded' });

  // Tapping a pattern IS the gesture that opens the card page. A real popup to
  // the real card follows, so allow generously — an ESP32 serving its page to
  // a browser is slow, which was half the original fault.
  const tile = page.locator('.pm-cards .pmcard').first();
  await expect(tile).toBeVisible({ timeout: 30000 });
  const target = await tile.getAttribute('data-pattern-id');

  // "Use local card" is the gesture that opens the card page. A tap alone only
  // previews in Studio, which is exactly what the owner saw.
  const useLocal = page.getByRole('button', { name: /Use local card/i });
  console.log('Use local card present:', await useLocal.count());
  if (await useLocal.count()) await useLocal.first().click();
  await page.waitForTimeout(3000);
  await tile.click();

  await page.waitForTimeout(12000);
  const diag = await page.evaluate(async () => {
    const bridge = await import('/src/lib/cardBridge.js');
    const cardLink = await import('/src/lib/cardLink.js');
    const state = bridge.getCardBridgeState();
    return {
      link: cardLink.getSharedCardLink().getState()?.state,
      linkReason: cardLink.getSharedCardLink().getState()?.reason,
      bridge: {
        open: state?.open, connected: state?.connected, verified: state?.verified,
        version: state?.version, host: state?.host, identityError: state?.identityError,
      },
      opens: (window as unknown as { __opens?: string[] }).__opens || [],
      protocol: window.location.protocol,
      origin: window.location.origin,
    };
  });
  console.log('DIAG:', JSON.stringify(diag, null, 1));

  await expect
    .poll(() => linkState(page), { timeout: 60000, intervals: [1000] })
    .toMatch(/^connected-(bridge|direct)$/);

  console.log('LINK', await linkState(page), '-> tapped', target);

  // The proof is the strip, not the screen.
  await expect.poll(playingOnCard, { timeout: 20000, intervals: [500] }).toBe(target);
});
