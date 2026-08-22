import { expect, test, type Page } from '@playwright/test';

async function installFindCardHarness(page: Page) {
  await page.addInitScript(() => {
    const state = {
      opens: [] as Array<{ url: string; name: string; features: string }>,
      captureSweep: false,
      sweepStarted: false,
    };
    Object.defineProperty(window, '__findCardHarness', { value: state, configurable: true });
    window.open = ((url?: string | URL, name?: string, features?: string) => {
      state.opens.push({
        url: String(url || ''),
        name: String(name || ''),
        features: String(features || ''),
      });
      return null;
    }) as typeof window.open;

    const realFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!/^http:\/\/192\.168\.77\.\d+\/api\/status$/.test(url)) return realFetch(input, init);
      if (!state.captureSweep) {
        return Promise.resolve(new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
      }
      state.sweepStarted = true;
      return Promise.resolve(new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }) as typeof window.fetch;
  });

  await page.route('http://lightweaver.local/**', route => route.abort());
  await page.route('http://192.168.4.1/**', route => route.abort());
  await page.goto('/#screen=setup', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lw_chip_card_host', '192.168.77.1');
    localStorage.setItem('lw_chip_card_host_history', JSON.stringify(['192.168.77.1']));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { (window as any).__findCardHarness.captureSweep = true; });
}

// The button says "Find my card", so pressing it must LOOK for the card. It
// used to open the connect panel without trying anything, and that panel's
// first move was to ask the owner what colour the LEDs were — on a screen
// already displaying the card's address. Reported as the button doing nothing.
//
// What must NOT come back: launching a card-page window uninvited while a
// direct route is still available. That stays asserted below.
test('Find my card searches first, and only opens the connection panel once that fails', async ({ page }) => {
  await installFindCardHarness(page);

  await page.getByTestId('setup-connect-card').click();

  // A real search ran — including across the addresses this card has answered
  // on before, which is the recovery for a card the router has moved.
  await expect
    .poll(() => page.evaluate(() => (window as any).__findCardHarness.sweepStarted), { timeout: 20000 })
    .toBe(true);

  // Nothing answered, so the panel's triage steps are now the right offer.
  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver', exact: true })).toBeVisible({ timeout: 30000 });
  // And no card-page window was opened behind the owner's back on the way.
  expect(await page.evaluate(() => (window as any).__findCardHarness.opens)).toEqual([]);
});
