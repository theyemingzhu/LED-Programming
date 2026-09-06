// A6 — full-field read-back. Companion to tests/journey-continuity.spec.ts's
// J05, which proved a lost reply after a PATTERN change is settled by reading
// the card, not resent. This file proves the same contract for the OTHER
// customer controls (brightness, speed, hue, saturation, breathe, drift):
// `readBackLivePreview` used to give up on anything but a pattern/zone/
// syncZones patch (`READ_BACK_VERIFIABLE_PATCH_KEYS`), so a lost reply after a
// brightness change always fell through to a real second `/api/control` post
// — the exact duplicate write the journey contract forbids. See
// docs/plans/2026-09-06-unified-card-journey-execution.md ticket A6.
//
// Helpers below are copied from tests/journey-continuity.spec.ts, which keeps
// them local to itself rather than exporting them.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  MATRIX_PATTERNS,
  type CardStateSpec,
} from './harness/cardStates';

async function seedKnownCard(page: Page, cardId = MATRIX_CARD_ID) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

async function boot(page: Page, spec: CardStateSpec, hash: string, seed: (page: Page) => Promise<void>, card?: CardSimulator) {
  const sim = card || createCardSimulator(spec);
  await sim.install(page);
  await seed(page);
  await page.goto(hash, { waitUntil: 'domcontentloaded' });
  return sim;
}

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

const CONNECTED = /^connected-(direct|bridge)$/;
const CONNECT_BUDGET_MS = 15000;

async function waitConnectedUnaided(page: Page, note: string) {
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(CONNECTED, { message: note } as never);
}

function brightnessSlider(page: Page) {
  return page.getByTestId('look-brightness-slider');
}

function patternTile(page: Page, patternId: string) {
  return page.locator(`.pm-cards .pmcard[data-pattern-id="${patternId}"]`);
}

/** Drag a native range input to `value` the way a real pointer would — set
 * the value through the prototype setter (React tracks the DOM setter, not a
 * bare `.value =`) and fire the events React listens for. Matches the
 * pattern tests/pattern-controls-live.spec.ts already uses for these sliders. */
async function setSlider(page: Page, locator: ReturnType<typeof brightnessSlider>, value: number) {
  await locator.evaluate((element: HTMLInputElement, next: number) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

// ---------------------------------------------------------------------------
// [J05] a lost reply after a brightness change is settled by read-back, not
// resent.
//
// Same shape as journey-continuity.spec.ts's J05 (a pattern change whose
// reply is dropped after the card genuinely applied it), but the changed
// control is brightness — a field `readBackLivePreview` could not confirm
// before this ticket, so it always fell through to a duplicate `/api/control`
// post. Red on the code before A6's fix: the simulator reported a fixed
// brightness on every zone regardless of what was posted, and
// READ_BACK_VERIFIABLE_PATCH_KEYS refused to even ask.
// ---------------------------------------------------------------------------
test('[J05] a lost reply after a brightness change is settled by read-back, not resent', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = await boot(page, spec, '/#screen=pattern', seedKnownCard);
  await waitConnectedUnaided(page, 'A6 brightness readback connect');

  // The default starter project's own current look uses a pattern id (its
  // own custom preset) this simulated card was never given — `installed
  // -match` only means the card holds the same PROJECT, not that its
  // patterns list happens to include whatever the untouched default look
  // names. A patternId the card cannot play never confirms on read-back (its
  // zone keeps reporting the pattern it actually has), which would fail this
  // test for a reason unrelated to brightness. Establish a look whose
  // pattern the card genuinely recognizes — the same first move
  // journey-continuity.spec.ts's own J05 makes — before touching brightness
  // at all. Selecting a tile does not target a specific board section (no
  // `zone` in the wire payload — see `zoneConfirmsLivePreviewIntent`'s test
  // and `targetZoneIds` in cardSimulator.ts), so this always lands on the
  // one zone the simulated card reports.
  const target = MATRIX_PATTERNS.find(pattern => pattern.id !== spec.currentId) || MATRIX_PATTERNS[0];
  await patternTile(page, target.id).click();
  await card.waitForPlaying(target.id, 8000);

  const slider = brightnessSlider(page);
  await expect(slider).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  const TARGET_BRIGHTNESS = 0.3;
  const before = Number(await slider.inputValue());
  expect(Math.abs(before - TARGET_BRIGHTNESS), 'fixture sanity: the slider must actually move for this test to prove anything').toBeGreaterThan(0.05);

  card.respondThenDrop('/api/control', { times: 1 });
  await setSlider(page, slider, TARGET_BRIGHTNESS);

  // The zone the card actually holds settling on the requested brightness IS
  // the write landing — poll the CARD, not the screen, exactly as J05 does in
  // journey-continuity.spec.ts with waitForPlaying. `zoneControls` may already
  // hold its DEFAULT entry (0.65) from an earlier `/api/zones` read during
  // connect, so this must wait for the TARGET value, not merely a non-null one.
  await expect.poll(
    () => card.state.zoneControls.get('zone-all')?.brightness ?? -1,
    { timeout: 8000, intervals: [100] },
  ).toBeCloseTo(TARGET_BRIGHTNESS, 2);

  // Give any naive "no reply, so retry" behaviour time to actually fire
  // before counting — a fixed short wait, not a race against the assertion
  // below. Same convention as journey-continuity.spec.ts's J05.
  await page.waitForTimeout(2000);

  // Every /api/control post carries the full look (not just the changed
  // field), so the earlier pattern-tile click also posted a `brightness`
  // (its prior value) — matching on the key alone would double-count that
  // unrelated write. Match the actual requested value instead, exactly as
  // journey-continuity.spec.ts's own J05 matches on `patternId === target.id`.
  const brightnessPosts = card.requests.filter(
    entry => entry.method === 'POST' && entry.path === '/api/control'
      && Math.abs(Number((entry.body as Record<string, unknown> | null)?.brightness) - TARGET_BRIGHTNESS) < 0.005,
  );
  expect(
    brightnessPosts.length,
    `a lost reply after a real brightness write must not duplicate the command — Studio sent it `
    + `${brightnessPosts.length} times. Timeline: ${JSON.stringify(card.requests.map(entry => [entry.at - card.requests[0].at, entry.method, entry.path, (entry.body as Record<string, unknown> | null)?.brightness ?? '']))}`,
  ).toBe(1);

  expect(
    card.state.zoneControls.get('zone-all')?.brightness,
    'the card zone must hold the requested brightness, not a stale or default value',
  ).toBeCloseTo(TARGET_BRIGHTNESS, 2);
});
