// [J01-partial] blank card to saved playback — docs/plans/2026-09-06-unified-card-journey-execution.md ticket A1.
//
// This is a NEW file (journey-continuity.spec.ts is left untouched per the
// ticket). It reuses that file's boot/connect conventions — see the comment
// on each helper below for what was copied verbatim vs. adapted for a card
// that starts with NO project at all.
//
// What this proves, continuously, on ONE simulated card: a factory-blank card
// can be found (with no prior identity — a genuinely fresh browser), its one
// strip discovered by port/colour/count exactly the way StripDiscoveryPanel.jsx
// drives it (beacon probe, bench install, colour proof, ruler count, end
// marker, record), and folded into a real project with a real wiring mapping
// (discoveryCommit.js — no manual Layout drag needed; starterPending flips
// false the moment discovery records).
//
// It stops there — not on a missing test id, but on a real product defect
// this test found: the colour order a discovery walk measures never survives
// into the saved project, so the Setup ladder can never leave its
// discover-lights task after ANY real discovery run. See the "STOPS HERE"
// comment below for the exact root cause, and the return packet for the full
// writeup.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';

// ---------------------------------------------------------------------------
// Copied from journey-continuity.spec.ts verbatim (that file exports only its
// fixtures, not its helpers, and the ticket forbids editing it).
// ---------------------------------------------------------------------------
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

async function visibleAlerts(page: Page): Promise<string[]> {
  const alerts = await page.getByRole('alert').all();
  const raised: string[] = [];
  for (const alert of alerts) {
    if (await alert.isVisible()) raised.push(((await alert.textContent()) || '').trim().slice(0, 120));
  }
  return raised;
}

function journeyLocator(page: Page) {
  return page.getByTestId('setup-journey');
}

function patternTile(page: Page, patternId: string) {
  return page.locator(`.pm-cards .pmcard[data-pattern-id="${patternId}"]`);
}

// ---------------------------------------------------------------------------
// New to this file: a genuinely blank card gets none of journey-continuity's
// `seedKnownCard` (that seeds a REMEMBERED card identity — the return-visit
// case). A fresh browser knows nothing; DEFAULT_CARD_HOST
// ('lightweaver.local', src/lib/cardConnection.js) is what a first-run Studio
// polls on its own, and createCardSimulator already answers on that host.
// ---------------------------------------------------------------------------
async function bootBlank(page: Page, card: CardSimulator) {
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
}

test('[J01-partial] blank card: connect, discover one strip, push to card, wiring test activates', async ({ page }) => {
  const spec = cardState('factory-blank');
  const card = createCardSimulator(spec);
  await bootBlank(page, card);

  // Unlike every other journey-continuity fixture, a truly fresh browser has
  // no `lw_card_identity_v1` to remember — bootstrapStudioCardConnection
  // (src/lib/studioCardBootstrap.js) returns early with nothing to restore
  // when there is no persisted identity, so this is the one card state in the
  // suite where the owner must press Find my card themselves before anything
  // connects. That IS the first-meeting journey, not a gap in it.
  await page.getByTestId('setup-connect-card').click();
  await waitConnectedUnaided(page, 'J01 first connect to a blank card');

  // ── Setup ladder: connect phase is done, lights phase is current ──────────
  const journey = journeyLocator(page);
  await expect(
    journey,
    'a card with no project must present the discover-lights task, not a completed ladder',
  ).toHaveAttribute('data-journey-task', 'discover-lights', { timeout: CONNECT_BUDGET_MS });
  await expect(journey).toHaveAttribute('data-journey-complete', 'false');

  await page.getByTestId('setup-lights-action').click();
  await expect(page).toHaveURL(/#screen=discovery/);

  // ── Strip discovery: port probe → bench install → colour proof → ruler → end marker → record ──
  const overlay = page.getByTestId('card-setup-overlay');
  await expect(overlay).toBeVisible();
  const panel = page.getByTestId('strip-discovery');
  await expect(panel).toBeVisible();

  const PROBE_PIN = 18;
  await page.getByTestId(`discovery-probe-${PROBE_PIN}`).click();
  await expect.poll(
    () => card.state.beaconPinned,
    { message: 'the beacon must be lighting the port the owner clicked' },
  ).toBe(PROBE_PIN);

  await page.getByTestId('discovery-start').click();
  // installBenchConfig only resolves once the card has applied the config AND
  // reports it will accept playback — this is the ONE card write in
  // discovery, and it must genuinely leave the card holding the bench
  // sentinel project, not a cosmetic "installing…" spinner.
  await expect.poll(
    () => ({ projectId: card.state.projectId, provisional: card.state.provisionalSetup, pixels: card.state.pixels }),
    { timeout: CONNECT_BUDGET_MS, message: 'the bench config must actually land on the card before the probe phase opens' },
  ).toEqual({ projectId: 'lightweaver-bench-discovery-v1', provisional: true, pixels: 256 });
  await expect(page.getByTestId('discovery-probe')).toBeVisible({ timeout: 15000 });

  await expect(page.getByTestId('discovery-color-proof')).toBeVisible();
  await page.getByTestId('discovery-color-red').click();
  await page.getByTestId('discovery-color-green').click();
  await expect(page.getByTestId('discovery-decade')).toBeVisible();

  const COUNTED_PIXELS = 41;
  await page.getByTestId(`discovery-count-${PROBE_PIN}`).fill(String(COUNTED_PIXELS));
  await page.getByTestId('discovery-counts-done').click();
  await expect(page.getByTestId('discovery-end-marker')).toBeVisible();
  await page.getByTestId('discovery-end-yes').click();

  await expect(page.getByTestId('discovery-record')).toBeVisible();
  await page.getByTestId('discovery-record-save').click();

  // Embedded discovery's "done" screen only ever offers Continue to Layout —
  // recording never installs the real project, so the card is still holding
  // the bench sentinel exactly as it was after the write above.
  await expect(page.getByTestId('discovery-done')).toBeVisible();
  await expect(
    card.state.projectId,
    'recording the discovery answers must not, by itself, touch the card — only "Open Patterns" does',
  ).toBe('lightweaver-bench-discovery-v1');
  await page.getByTestId('discovery-continue-layout').click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw$/);

  // ── Layout: discoveryProjectParts already wrote a complete strip + wiring
  // run (no manual drag needed — src/lib/setupJourney.js's layoutProgress()
  // only needs starterPending:false and a non-empty strips array, both true
  // the instant record() ran). Prove that from the project's own saved state
  // rather than the canvas, per the ticket's "card.state / data-testid only"
  // rule — there is no data-testid on the Layout canvas itself.
  const savedLayout = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return {
      starterPending: saved?.layout?.starterPending,
      stripCount: Array.isArray(saved?.layout?.strips) ? saved.layout.strips.length : 0,
    };
  });
  expect(savedLayout, 'discovery must leave a placed strip behind — the ladder should already show layout done').toEqual({
    starterPending: false,
    stripCount: 1,
  });
  expect(await visibleAlerts(page), 'a fully successful discovery walk must not itself raise an alert').toEqual([]);

  // ── STOPS HERE — a genuine product defect, not a missing test id. ─────────
  //
  // The ladder should now show "layout" (or later) as the current task:
  // src/lib/setupJourney.js's layoutProgress() only needs starterPending:false
  // and a non-empty strips array, both true above. But lightsComplete() gates
  // on colorDone (confirmedColor(project) — devices.standaloneController.led.
  // colorOrderConfirmed) BEFORE layout is even consulted, and that flag can
  // never be set from a real discovery walk:
  //
  //   src/components/card/StripDiscoveryPanel.jsx's channelProof state stores
  //   the measured colour-order map under the key `map` (see the `useState`
  //   initializer and `answerChannelProof`'s three `return`s), and passes that
  //   object straight to `discoveryProjectParts(session, channelProof, …)`
  //   (StripDiscoveryPanel.jsx `record()`). But
  //   src/lib/discoveryCommit.js:142 reads `channelProof?.channelMap` — a
  //   different key that channelProof never has. `namedColorOrderFromChannelMap`
  //   therefore always receives `undefined` from a real run, always returns
  //   '', and `parts.colorOrder` is always falsy — so `record()`'s
  //   `...(parts.colorOrder ? { led: { …, colorOrderConfirmed: true } } : {})`
  //   spread never fires. This is independent of which colour buttons are
  //   pressed, and independent of Skip: every path through the real colour
  //   proof ends the same way. discoveryCommit.test.js never catches it
  //   because its own fixtures hand-construct `{ channelMap: {...} }` directly
  //   rather than obtaining channelProof from the component, so the two
  //   disagree on the field name without either side's tests ever comparing
  //   them.
  //
  // Confirmed below from the SAVED PROJECT (not asserted on prose): the
  // colour order this walk measured is missing from local storage, so the
  // ladder is still showing discover-lights after a full, successful
  // discovery walk — the exact owner-visible consequence of the defect above.
  // This is unreachable from `journeyLocator`/`setupJourney.js` and from
  // `discoveryCommit.js`, neither of which is in this ticket's file list
  // (`journey-continuity.spec.ts`, `cardSimulator.ts`, `cardStates.ts` only),
  // so it is reported here rather than fixed in this change.
  const savedColor = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return saved?.devices?.standaloneController?.led?.colorOrderConfirmed ?? null;
  });
  expect(
    savedColor,
    'src/lib/discoveryCommit.js:142 reads channelProof.channelMap, but StripDiscoveryPanel.jsx\'s '
    + 'channelProof state stores the measured map under `map` — colorOrderConfirmed can never be set '
    + 'by a real discovery walk. This is the actual block on J01, upstream of the CardPushControl '
    + 'confirm-button test-id gap noted in the ticket.',
  ).toBeNull();

  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J01 back on the ladder after a completed discovery walk');
  await expect(
    journey,
    'the owner-visible symptom: the ladder cannot leave discover-lights after a fully completed, '
    + 'correctly-counted discovery walk, because colorOrderConfirmed never lands (see above)',
  ).toHaveAttribute('data-journey-task', 'discover-lights', { timeout: CONNECT_BUDGET_MS });

  // Every card endpoint this prefix actually needed was modelled — nothing
  // Studio asked for fell through to the simulator's 404 default.
  expect(card.unhandled, 'every /api/* path this journey touched must be modelled by the simulator').toEqual([]);

  // Everything past this point — Layout placement already being a no-op,
  // "Open Patterns", CardPushControl's autoStart push + wiring activate, the
  // confirm gate, and the final pattern click / card.waitForPlaying — is
  // real, reachable code (verified by reading
  // src/components/layout/shared/CardPushControl.jsx and
  // src/components/card/CardInstallAction.jsx) but not reachable from the
  // real screens while the defect above stands. `patternTile` is kept, unused,
  // as the marker for where a follow-up resumes once discoveryCommit.js is
  // fixed to read `channelProof.map` and CardPushControl.jsx's confirm/
  // rollback buttons gain data-testids.
  void patternTile;
});
