import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';

const PINS = [18, 21] as const;
const COUNTS = [41, 27] as const;

async function waitConnected(page: Page) {
  await expect(page.getByRole('button', { name: 'Connection Connected' }))
    .toBeVisible({ timeout: 15_000 });
}

test('a blank card discovers two GPIO strips, installs their saved pattern, plays it, and accepts a control change', async ({ page }) => {
  const card = createCardSimulator(cardState('factory-blank'));
  // The simulator owns every card address used by this journey, including the
  // bench LAN address. All card reads and writes stay in this browser fixture.
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Pair this card', exact: true }).click();
  await waitConnected(page);
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-task', 'discover-lights');
  await page.getByTestId('setup-lights-action').click();
  await expect(page.getByTestId('strip-discovery')).toBeVisible();

  for (const [index, pin] of PINS.entries()) {
    await page.getByTestId(`discovery-probe-${pin}`).click();
    await expect.poll(() => card.state.beaconPinned).toBe(pin);
    await page.getByTestId('discovery-start').click();
    if (index === 0) {
      await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('discovery-color-proof')).toBeVisible();
      await page.getByTestId('discovery-color-red').click();
      await page.getByTestId('discovery-color-green').click();
    }
    await expect(page.getByTestId('discovery-decade')).toBeVisible();
    await page.getByTestId(`discovery-count-${pin}`).fill(String(COUNTS[index]));
    await page.getByTestId('discovery-counts-done').click();
    await page.getByTestId('discovery-end-yes').click();
    if (index > 0 && await page.getByTestId('discovery-end-marker').isVisible()) {
      await page.getByTestId('discovery-end-yes').click();
    }
    if (index === 0) {
      await page.getByTestId('discovery-add-strip').click();
      await expect(page.getByTestId('discovery-plan')).toBeVisible();
    }
  }

  await expect(page.getByTestId('discovery-record')).toBeVisible();
  await expect(page.getByTestId('discovery-result-18')).toContainText('41 LEDs');
  await expect(page.getByTestId('discovery-result-21')).toContainText('27 LEDs');
  await page.getByTestId('discovery-record-save').click();
  await expect(page.getByTestId('discovery-done')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.layout?.wiring?.outputs?.map((output: { pin: number }) => output.pin);
  })).toEqual([...PINS]);

  await page.getByTestId('discovery-continue-layout').click();
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await waitConnected(page);
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-task', 'test-and-save');
  await page.getByTestId('setup-verify-action').click();
  // Adding a second output changes wiring. The card runs a probationary light
  // test and waits for the owner's visible confirmation before saving it.
  await expect(page.getByRole('button', { name: 'The lights look correct' }))
    .toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'The lights look correct' }).click();
  await expect(page).toHaveURL(/#screen=pattern$/, { timeout: 15_000 });

  const installed = card.requests.filter(request => request.method === 'POST' && request.path === '/api/config').at(-1)?.body as any;
  expect(installed?.led?.outputs?.map((output: any) => [output.pin, output.pixels])).toEqual([[18, 41], [21, 27]]);
  expect(installed?.looks?.length).toBeGreaterThan(0);
  await expect.poll(() => card.state.explicitOutputs?.map(output => [output.pin, output.pixels]))
    .toEqual([[18, 41], [21, 27]]);
  const installedReadback = await page.evaluate(async () => {
    const [status, patterns] = await Promise.all([
      fetch('http://lightweaver.local/api/status').then(response => response.json()),
      fetch('http://lightweaver.local/api/patterns').then(response => response.json()),
    ]);
    return { status, patterns };
  });
  expect(installedReadback.status.outputs.map((output: { pin: number; pixels: number }) => [output.pin, output.pixels]))
    .toEqual([[18, 41], [21, 27]]);
  expect(installedReadback.patterns.patterns.some((pattern: { id: string }) => pattern.id === 'aurora'))
    .toBe(true);

  await page.locator('.pm-cards .pmcard[data-pattern-id="aurora"]').click();
  await card.waitForPlaying('aurora', 8000);
  const slider = page.getByTestId('look-brightness-slider');
  await expect(slider).toBeVisible();
  await slider.evaluate((element: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(element, '0.3');
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => card.requests.some(request => request.method === 'POST'
    && request.path === '/api/control'
    && Math.abs(Number((request.body as { brightness?: number })?.brightness) - 0.3) < 0.005),
  ).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const [status, zones] = await Promise.all([
      fetch('http://lightweaver.local/api/status').then(response => response.json()),
      fetch('http://lightweaver.local/api/zones').then(response => response.json()),
    ]);
    return status.currentPatternId === 'aurora'
      && status.outputs.length === 2
      && zones.zones.some((zone: { brightness: number }) => Math.abs(zone.brightness - 0.3) < 0.005);
  })).toBe(true);

  // Save a named look through Patterns, include it in the card playlist, and
  // verify that the second config write actually persists it on this card.
  await page.getByTestId('look-name').fill('Two-strip saved look');
  await page.getByTestId('look-save-preset').click();
  const savedLookId = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.devices?.standaloneController?.looks?.find(
      (look: { label: string }) => look.label === 'Two-strip saved look',
    )?.id || '';
  });
  expect(savedLookId).toBeTruthy();
  await page.getByRole('button', { name: 'Add Two-strip saved look to playlist' }).click();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const savedPlaylistId = await page.evaluate(({ lookId }) => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved.devices?.standaloneController?.playlist?.find(
      (item: { lookId: string }) => item.lookId === lookId,
    )?.id || '';
  }, { lookId: savedLookId });
  expect(savedPlaylistId).toBeTruthy();
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await expect(page.locator('[data-testid^="playlist-row-"]').filter({ hasText: 'Two-strip saved look' }))
    .toBeVisible();
  await page.getByTestId('playlist-enabled-toggle').click();
  await page.getByRole('button', { name: 'Install playlist on card' }).click();
  await expect(page.getByTestId('playlist-card-status')).toContainText('Playlist installed on card.');
  const savedPatternReadback = await page.evaluate(async () => {
    const [status, patterns] = await Promise.all([
      fetch('http://lightweaver.local/api/status').then(response => response.json()),
      fetch('http://lightweaver.local/api/patterns').then(response => response.json()),
    ]);
    return { status, patterns };
  });
  expect(savedPatternReadback.status.outputs.map((output: { pin: number; pixels: number }) => [output.pin, output.pixels]))
    .toEqual([[18, 41], [21, 27]]);
  expect(savedPatternReadback.patterns.patterns.some((pattern: { id: string }) => pattern.id === savedPlaylistId))
    .toBe(true);
  expect(savedPatternReadback.patterns.playlist.entries.some((entry: { patternId: string }) => entry.patternId === savedPlaylistId))
    .toBe(true);
  expect(card.unhandled).toEqual([]);
});
