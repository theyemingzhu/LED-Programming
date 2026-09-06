// [J01] blank card to saved playback — docs/plans/2026-09-06-unified-card-journey-execution.md ticket A1.
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
// marker, record), folded into a real project with a real wiring mapping
// (discoveryCommit.js — no manual Layout drag needed), installed on the card
// through the Setup ladder's own "Open Patterns" (CardPushControl autoStart:
// push, staged wiring candidate, light-test activation, all unaided), confirmed
// by the owner at the light-test gate, and then played from the Patterns
// screen. Every step is asserted from the card's own state or a data-testid,
// never from prose.
//
// History: the first version of this file stopped after the discovery walk on
// a real defect it found — the panel's colour proof stored its measured map
// under `map` while discoveryCommit.js read `channelMap`, so
// colorOrderConfirmed never landed and the ladder never left discover-lights.
// The proof's state machine now lives in src/lib/channelProof.js and both
// sides import it; the assertion on the saved colour order below is the
// regression guard.
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

test('[J01] blank card: connect, discover one strip, install through Open Patterns, confirm the light test, play', async ({ page }) => {
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

  // ── The colour order the walk measured must survive into the saved project.
  // src/lib/setupJourney.js's lightsComplete() gates on confirmedColor(project)
  // (devices.standaloneController.led.colorOrderConfirmed) before the count or
  // the layout are even consulted, so this flag is what lets the ladder leave
  // discover-lights. Red-then-green is the identity answer: the strip renders
  // truly under the declared order, and a correct strip must still count as
  // "checked". Asserted from the SAVED PROJECT, not prose. (Before the shared
  // src/lib/channelProof.js state machine existed, the panel wrote the map
  // under `map` while discoveryCommit.js read `channelMap`, and this was
  // null after every real walk — the ladder never left discover-lights.)
  const savedColor = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    const led = saved?.devices?.standaloneController?.led || {};
    return { confirmed: led.colorOrderConfirmed ?? null, order: led.colorOrder ?? null };
  });
  expect(
    savedColor,
    'a completed colour proof must land in the saved project as a confirmed colour order',
  ).toEqual({ confirmed: true, order: 'GRB' });

  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J01 back on the ladder after a completed discovery walk');
  await expect(
    journey,
    'after a fully completed, correctly-counted discovery walk the ladder must move past discover-lights',
  ).not.toHaveAttribute('data-journey-task', 'discover-lights', { timeout: CONNECT_BUDGET_MS });

  await expect(journey, 'connect, lights and layout are done; only the verified install remains')
    .toHaveAttribute('data-journey-task', 'test-and-save');
  await expect(journey).toHaveAttribute('data-journey-complete', 'false');

  // ── Verify phase: "Open Patterns" IS the install. With setup incomplete it
  // routes through the install-project task with next=patterns, where
  // CardInstallAction mounts CardPushControl with autoStart — the push, the
  // staged wiring candidate and the light-test activation all run unaided.
  const openProjectId = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || '');
  expect(openProjectId, 'discovery must have left a real project open').not.toBe('');
  await page.getByTestId('setup-verify-action').click();
  await expect(page).toHaveURL(/task=install-project&next=patterns/);

  // The simulator stages any config that changes wiring (bench 256px → 41px
  // counted) and only adopts it on confirm, exactly like firmware. autoStart
  // must therefore end with the card in probation, not merely "pushed".
  await expect.poll(
    () => ({ testing: card.state.wiringTestActive, staged: card.state.stagedPixels }),
    { timeout: 30000, message: 'the auto-started push must stage the counted wiring and activate the light test by itself' },
  ).toEqual({ testing: true, staged: COUNTED_PIXELS });
  await expect(page.getByTestId('wiring-test-confirm'), 'the confirm gate must be on screen while the card is in probation')
    .toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('wiring-test-reject')).toBeVisible();
  await expect(journey, 'the ladder must agree that the card is mid light test')
    .toHaveAttribute('data-journey-task', 'confirm-visible-lights', { timeout: CONNECT_BUDGET_MS });

  // The owner confirms the lights. The card promotes the candidate: real
  // project id, counted pixel length, no longer provisional.
  await page.getByTestId('wiring-test-confirm').click();
  await expect.poll(
    () => ({
      testing: card.state.wiringTestActive,
      projectId: card.state.projectId,
      provisional: card.state.provisionalSetup,
      pixels: card.state.pixels,
    }),
    { timeout: 30000, message: 'confirming the light test must make the counted project the card\'s working setup' },
  ).toEqual({ testing: false, projectId: openProjectId, provisional: false, pixels: COUNTED_PIXELS });

  // onInstalled hands the owner to Patterns, and the card is playable there.
  await expect(page).toHaveURL(/#screen=pattern/, { timeout: 15000 });
  await waitConnectedUnaided(page, 'J01 patterns after the verified install');
  const cardPatterns = card.state.patterns.map(pattern => pattern.id);
  expect(cardPatterns.length, 'the installed project must have put at least one pattern on the card').toBeGreaterThan(0);
  const target = cardPatterns.find(id => id !== card.playingId()) || cardPatterns[0];
  const tile = patternTile(page, target);
  await expect(tile).toHaveCount(1, { timeout: CONNECT_BUDGET_MS });
  await tile.click();
  await card.waitForPlaying(target, 8000);

  expect(await visibleAlerts(page), 'the whole blank-card journey must complete without raising an alert').toEqual([]);
  // Every card endpoint this journey actually needed was modelled — nothing
  // Studio asked for fell through to the simulator's 404 default.
  expect(card.unhandled, 'every /api/* path this journey touched must be modelled by the simulator').toEqual([]);
});
