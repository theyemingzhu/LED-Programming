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
// F1 (fixed): the colour order a discovery walk measures used to never
// survive into the saved project — src/lib/discoveryCommit.js read
// `channelProof?.channelMap`, but StripDiscoveryPanel.jsx's own channelProof
// state stores the measured map under `map`. discoveryProjectParts() now
// reads either field (a real discovery walk supplies `map`; this file's own
// hand-built fixtures still supply `channelMap`), so colorOrderConfirmed
// lands and the Setup ladder can leave discover-lights after a real walk.
// See "STOPS HERE" below for where this test genuinely still stops — a
// missing test id, not a product defect — and the return packet for the full
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

test('[J01] blank card: connect, discover one strip, install it, confirm the wiring test, and play a pattern', {
  // F4 (docs/plans/2026-09-06-unified-card-journey-execution.md): counted by
  // hand — every `.click()` below, in source order: setup-connect-card,
  // setup-lights-action, discovery-probe-18, discovery-start,
  // discovery-color-red, discovery-color-green, discovery-counts-done,
  // discovery-end-yes, discovery-record-save, discovery-continue-layout,
  // setup-verify-action ("Open Patterns"), wiring-test-confirm, the
  // 'aurora' pattern tile. `.fill()` is a keyboard action, not a click, and
  // is not counted.
  annotation: { type: 'clicks', description: '13 deliberate clicks' },
}, async ({ page }) => {
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

  // ── F1 fixed: the measured colour order now survives into the project. ────
  //
  // discoveryProjectParts (src/lib/discoveryCommit.js) now reads
  // channelProof.map — the field StripDiscoveryPanel.jsx's own state actually
  // carries — falling back to channelProof.channelMap for callers that still
  // pass that shape (this file's own fixtures). Confirmed below from the
  // SAVED PROJECT, not asserted on prose: record()'s
  // `...(parts.colorOrder ? { led: { …, colorOrderConfirmed: true } } : {})`
  // spread now fires for a real discovery walk.
  const { savedColor, realProjectId } = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return {
      savedColor: saved?.devices?.standaloneController?.led?.colorOrderConfirmed ?? null,
      // ProjectContext.jsx's own persisted shape (`id: projectId` in its
      // autosave writer) — the id discoveryProjectParts minted for this
      // walk, needed below to prove the CARD ends up holding this exact
      // project rather than just "some" project.
      realProjectId: saved?.id || '',
    };
  });
  expect(
    savedColor,
    'discoveryProjectParts must read the colour map out of channelProof.map (the panel\'s real shape) '
    + 'so colorOrderConfirmed lands after a real discovery walk — see src/lib/discoveryCommit.js',
  ).toBe(true);
  expect(realProjectId, 'fixture sanity: discovery must have minted a real project id to install later').toBeTruthy();

  // The ladder must leave discover-lights now that colour is confirmed AND
  // layout is already placed (asserted above: starterPending:false, one
  // strip). It does not assert the exact next task id — that is
  // setupJourney.js's call, not this test's — only that discovery is no
  // longer the current task.
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J01 back on the ladder after a completed discovery walk');
  await expect(
    journey,
    'the owner-visible fix: after a fully completed, correctly-counted discovery walk with colour '
    + 'confirmed and a strip already placed, the ladder must not still be asking to discover lights',
  ).not.toHaveAttribute('data-journey-task', 'discover-lights', { timeout: CONNECT_BUDGET_MS });
  await expect(journey).toHaveAttribute('data-journey-complete', 'false');

  // Every card endpoint this prefix actually needed was modelled — nothing
  // Studio asked for fell through to the simulator's 404 default.
  expect(card.unhandled, 'every /api/* path this journey touched must be modelled by the simulator').toEqual([]);

  // ── F4: on to the last phase. discoveryProjectParts() already wrote a
  // complete strip + wiring run the instant record() ran (proven above from
  // the SAVED PROJECT: starterPending:false, one strip) — layoutProgress()
  // in src/lib/setupJourney.js only needs exactly that, so there is nothing
  // left in Layout for this walk to place. Assert the ladder's own verdict
  // (setupJourney.js's call, not this test's) directly, rather than driving
  // placement test ids against a screen with nothing left to do.
  await expect(
    journey,
    'a fully placed, colour-confirmed discovery walk must land the ladder on its last phase (test-and-save), '
    + 'not layout placement — there is no strip left to place',
  ).toHaveAttribute('data-journey-task', 'test-and-save', { timeout: CONNECT_BUDGET_MS });

  // ── "Open Patterns" — phase 4's real button (setup-verify-action, inside
  // setup-install-slot's phase). It navigates to
  // '…&task=install-project&next=patterns', which is exactly what makes
  // CardInstallAction render CardPushControl with autoStart=true
  // (continueToPatterns): the install push runs with no further click
  // (CardPushControl.jsx's autoStartedRef effect). Going from the 256-pixel
  // bench sentinel to this project's real 41-pixel/pin-18 strip changes ONLY
  // the pixel count — the pin stays 18, the exact port the beacon probed —
  // which per the firmware rule (F14, LightweaverStorage.cpp's
  // runtimeConfigJsonChangesWiring) is NOT a rewire: the card applies it and
  // reboots at once, no staged candidate, no light test. (This test used to
  // assert the opposite here — `wiringTestActive: true` plus a
  // wiring-test-confirm click — on the mistaken belief that any pixel change
  // stages a candidate; that was the simulator's own prior bug, corrected
  // alongside F14 to match cardDeployment.js's classifyCardChanges, which
  // never counted pixel count as a hardware fact in the first place.)
  // Discovery's own bench-sentinel write already posted one /api/config
  // before this point (installBenchConfig, above) — count only what "Open
  // Patterns" itself sends, not the whole walk's total.
  const configPostsBeforeOpenPatterns = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/config').length;
  await page.getByTestId('setup-verify-action').click();
  await expect(page).toHaveURL(/next=patterns/);

  await expect.poll(
    () => ({ wiringTestActive: card.state.wiringTestActive, pixels: card.state.pixels, projectId: card.state.projectId }),
    {
      timeout: CONNECT_BUDGET_MS,
      message: 'Open Patterns must auto-push the real project — a pixel-count-only change on the same pin '
        + 'applies and reboots at once, with no wiring candidate to activate or confirm',
    },
  ).toEqual({ wiringTestActive: false, pixels: COUNTED_PIXELS, projectId: realProjectId });

  // The card's first /api/config reply is lost to its own immediate reboot
  // (F14) — Studio must recover by reading the card back, never by resending
  // the write. Exactly one /api/config POST from "Open Patterns" itself, and
  // never a wiring candidate: this really was a length change, not a rewire.
  const configPostsAfterOpenPatterns = card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/config').length
    - configPostsBeforeOpenPatterns;
  expect(
    configPostsAfterOpenPatterns,
    'the auto-push must send exactly one /api/config — Studio must recover from the lost reply by reading '
    + 'the card back, not by resending the write',
  ).toBe(1);
  expect(
    card.requests.some(entry => entry.method === 'POST' && entry.path === '/api/wiring/candidate'),
    'a pixel-count-only change on the same pin must never open a wiring candidate',
  ).toBe(false);

  // CardPushControl's own onInstalled (continueToPatterns) sends the owner
  // straight to Patterns the moment verification lands — waiting for that
  // natural navigation proves the restart-recovery chain (F14) actually
  // finished settling, not just that the card-side facts already had.
  await expect(page, 'a confirmed install must hand the owner on to Patterns on its own').toHaveURL(/#screen=pattern$/, { timeout: CONNECT_BUDGET_MS });

  // ── Prove the ladder's own verdict on Card Home, on its own terms, before
  // following that handoff onward — "the card holds the project" and "Card
  // Home reads complete" are two different claims and each gets its own
  // assertion rather than being inferred from the other.
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J01 back on Card Home after the real project was installed');
  await expect(
    journey,
    'the real project is now installed and confirmed on the card — Card Home must read the setup as complete',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });

  // ── The last step of J01: play a pattern for real, on the card this whole
  // walk just finished setting up. 'aurora' is the project's own default
  // look — DEFAULT_CARD_PATTERN_BANK[0].id (src/lib/cardVisualLook.js) — so
  // buildRuntimeLooksFromPlaylist always produces it as the fresh project's
  // one playlist entry, and it is guaranteed to be in card.state.patterns
  // after the install (unlike MATRIX_PATTERNS' 'plasma'/'fire', which this
  // project's config never asked the card to hold).
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'J01 patterns entry');
  await patternTile(page, 'aurora').click();
  await card.waitForPlaying('aurora', 8000);

  // Every card endpoint this journey actually needed was modelled — nothing
  // Studio asked for fell through to the simulator's 404 default, start to
  // finish.
  expect(card.unhandled, 'every /api/* path this journey touched must be modelled by the simulator').toEqual([]);
  expect(await visibleAlerts(page), 'a fully successful J01 walk must never raise an alert').toEqual([]);
});
