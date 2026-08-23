// The card state matrix — docs/card-state-matrix.md.
//
// Every cell drives ONE journey and asserts exactly the three things Adrian
// named, and nothing else:
//
//   A  Click connect, the card connects.        (within 15s)
//   B  A problem resolves itself.               (zero clicks, no blocker)
//   C  Click a pattern, it plays.               (the CARD's playing id changes)
//
// C is asserted against the simulated card, not the screen. A tile that lights
// up while the strip stays dark is a fail.
//
// The point of the matrix is that it cannot forget a state. Every bug in the
// setup flow so far was a state nobody had put the card in; hand-walking one
// path and calling it "the journey works" is how each of them shipped.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import {
  CARD_STATES,
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  MATRIX_PATTERNS,
  type CardStateSpec,
} from './harness/cardStates';

/** Where Adrian actually lands. */
const ENTRIES = [
  { id: 'bare', hash: '/' },
  { id: 'install', hash: '/#screen=card&section=install' },
  { id: 'patterns', hash: '/#screen=pattern' },
];

/** What Studio remembers when he opens it. */
type BrowserState = { id: string; describe: string; seed: (page: Page) => Promise<void> };

async function seedKnownCard(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

export const BROWSER_STATES: BrowserState[] = [
  {
    id: 'fresh',
    describe: 'a browser that has never seen this card',
    seed: async () => {},
  },
  {
    id: 'remembers-card',
    describe: 'a browser that remembers the card but holds no project',
    seed: seedKnownCard,
  },
  {
    id: 'other-project-open',
    describe: 'a browser with someone else’s work open, which must not be replaced',
    seed: async (page: Page) => {
      await seedKnownCard(page);
      await page.addInitScript(() => {
        localStorage.setItem('lw_autosave_v3', JSON.stringify({
          id: 'lwproj-open-work',
          name: 'Open work',
          layout: { starterPending: false, strips: [{ id: 'strip-a', pixels: 60, pin: 21 }] },
        }));
      });
    },
  },
];

async function boot(page: Page, spec: CardStateSpec, hash: string, browser: BrowserState) {
  const card = createCardSimulator(spec);
  await card.install(page);
  await browser.seed(page);
  await page.goto(hash, { waitUntil: 'domcontentloaded' });
  return card;
}

/** A — the transport is connected. Read from the card link, not from text. */
async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

const CONNECTED = /^connected-(direct|bridge)$/;
/** CARD_LINK_CONNECT_TIMEOUT_MS in src/lib/cardLink.js. */
const CONNECT_BUDGET_MS = 15000;

async function settlesConnected(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (CONNECTED.test(await linkState(page))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function connectionPanelOpen(page: Page): Promise<boolean> {
  const panel = page.locator('#card-connection-center');
  return (await panel.count()) > 0 && panel.first().isVisible();
}

/**
 * A — "click connect and the card connects".
 *
 * ONE click is the whole budget, and it is spent on the connect affordance.
 * A browser that already knows the card should need none; a browser meeting it
 * for the first time gets exactly one. Anything beyond that is the chunky
 * workaround this suite exists to stop, so the click count is returned and the
 * caller asserts on it.
 *
 * Two affordances count, because the owner does not care which screen he is
 * on: Setup's own connect button, and the footer status chip that every screen
 * carries. A screen offering neither is a dead end, and says so.
 */
async function expectConnects(page: Page, note: string): Promise<{ clicks: number; panelOpenedItself: boolean }> {
  // The whole 15s, not a tighter "it should feel instant" window. The claim
  // being made is "no click was needed", not "it was quick" — and on a loaded
  // host a tighter budget turns that claim into a coin flip, which is how a
  // suite starts inventing failures and stops being believed.
  if (await settlesConnected(page, CONNECT_BUDGET_MS)) {
    return { clicks: 0, panelOpenedItself: await connectionPanelOpen(page) };
  }

  // Read the panel BEFORE clicking: a panel this test opened is not a panel
  // that opened itself, and only the second one is a defect.
  const panelOpenedItself = await connectionPanelOpen(page);

  const setupConnect = page.getByTestId('setup-connect-card');
  const footerChip = page.getByTestId('card-link-status');
  const target = (await setupConnect.count()) ? setupConnect : footerChip;
  if (!(await target.count())) {
    throw new Error(`${note}: not connected, and this screen offers nothing to click to connect`);
  }
  await target.first().click();
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] }).toMatch(CONNECTED);
  return { clicks: 1, panelOpenedItself };
}

/**
 * B — nothing asked him to intervene. Two separate failures are covered:
 * a raised alert, and a modal that opened itself. Both are "chunky workaround"
 * in his words, and both have shipped before.
 */
async function expectUnaided(page: Page, note: string, panelOpenedItself = false) {
  const alerts = await page.getByRole('alert').all();
  const raised: string[] = [];
  for (const alert of alerts) {
    if (await alert.isVisible()) raised.push(((await alert.textContent()) || '').trim().slice(0, 120));
  }
  expect(raised, `${note}: Studio raised an alert before the owner did anything — ${JSON.stringify(raised)}`).toEqual([]);
  expect(panelOpenedItself, `${note}: the connection panel opened itself`).toBe(false);
}

/**
 * D — the screen is not STUCK.
 *
 * The weakest thing about A–C: a screen can be completely broken without
 * raising an alert or crashing. The fault Adrian actually hit was a disabled
 * "Verifying project…" that never resolved — connected, no alert, no crash,
 * and useless. Every assertion above would have passed it.
 *
 * This codebase marks in-progress states with a trailing ellipsis ("Looking…",
 * "Connecting…", "Sending to Lightweaver", "Verifying project…"). A busy label
 * is fine; a busy label that never goes away is the defect. So: give the screen
 * the connect budget to settle, then require that nothing is still announcing
 * work, and that at least one control can actually be pressed.
 */
async function expectNotStuck(page: Page, note: string) {
  const busyText = /(…|\.\.\.)\s*$/;
  const stillBusy = async () => {
    const candidates = await page.locator('button, [role="status"], [aria-busy="true"]').all();
    const busy: string[] = [];
    for (const candidate of candidates) {
      if (!(await candidate.isVisible())) continue;
      const text = ((await candidate.textContent()) || '').trim();
      if (text && busyText.test(text)) busy.push(text.slice(0, 60));
    }
    return busy;
  };

  const deadline = Date.now() + CONNECT_BUDGET_MS;
  let lastBusy = await stillBusy();
  while (lastBusy.length && Date.now() < deadline) {
    await page.waitForTimeout(500);
    lastBusy = await stillBusy();
  }
  expect(lastBusy, `${note}: still announcing work after ${CONNECT_BUDGET_MS}ms — ${JSON.stringify(lastBusy)}`)
    .toEqual([]);

  const pressable = await page.locator('button:not([disabled])').all();
  const visiblePressable: string[] = [];
  for (const button of pressable) {
    if (await button.isVisible()) visiblePressable.push(((await button.textContent()) || '').trim().slice(0, 40));
  }
  expect(visiblePressable.length, `${note}: every control on this screen is disabled — the owner cannot do anything`)
    .toBeGreaterThan(0);
}

/** C — the CARD is playing what was tapped. */
async function expectTapPlays(page: Page, card: CardSimulator, patternId: string) {
  const tile = page.locator(`.pm-cards .pmcard[data-pattern-id="${patternId}"]`);
  await expect(tile, `no pattern tile for "${patternId}"`).toHaveCount(1, { timeout: 15000 });
  await tile.click();
  await card.waitForPlaying(patternId, 5000);
}

// ---------------------------------------------------------------------------
// Tier 1 — every card state, at every entry Adrian uses, on the direct
// transport. 30 cells.
// ---------------------------------------------------------------------------
const remembers = BROWSER_STATES.find(state => state.id === 'remembers-card')!;

/**
 * A card reporting a build Studio did not record cannot reconnect on its own,
 * and clicking the connect control does not recover it either — the only way
 * back is "Trust updated card" in the Connection Center.
 *
 * That is currently DELIBERATE: accepting firmware that changed underneath
 * Studio is a trust decision, not a bug. But Studio also refuses the card it
 * updated ITSELF, which is pure bookkeeping —
 * `correlateFirmwareUpdateReconnect` in src/lib/cardFirmwareUpdater.js already
 * proves "same card, new boot, exactly the build I installed" and its
 * `reconnect()` is called from nowhere in src/.
 *
 * Marked rather than deleted: these cells are the specification of the fix,
 * and they turn green the moment that correlation is wired up. Awaiting the
 * owner's call — see TODO.md.
 */
const AWAITING_FIRMWARE_TRUST_DECISION = 'stale-firmware';
const cell = (stateId: string) => (stateId === AWAITING_FIRMWARE_TRUST_DECISION ? test.fixme : test);

for (const spec of CARD_STATES) {
  for (const entry of ENTRIES) {
    cell(spec.id)(`[T1] ${spec.id} @ ${entry.id} — a card ${spec.describe} connects, unaided`, async ({ page }) => {
      const crashes: string[] = [];
      page.on('pageerror', error => crashes.push(String(error.message)));

      const card = await boot(page, spec, entry.hash, remembers);
      // A browser that already knows this card must need no click at all.
      const { clicks, panelOpenedItself } = await expectConnects(page, `${spec.id} @ ${entry.id}`);
      expect(clicks, 'a remembered card should reconnect on its own').toBe(0);
      await expectUnaided(page, `${spec.id} @ ${entry.id}`, panelOpenedItself);
      await expectNotStuck(page, `${spec.id} @ ${entry.id}`);

      expect(crashes, 'the screen crashed').toEqual([]);
      expect(card.unhandled, 'Studio called a card endpoint the simulator does not model').toEqual([]);
    });
  }
}

// ---------------------------------------------------------------------------
// Tier 1C — tapping a pattern reaches the card, for every state where the card
// has something to play. This is the assertion the whole suite exists for.
// ---------------------------------------------------------------------------
for (const spec of CARD_STATES) {
  if (!spec.patterns.length || !spec.projectId || spec.provisionalSetup) continue;
  // A card that is not command-ready is SUPPOSED to refuse. Asserting that it
  // plays would be asserting the firmware's safety gate away. What it owes the
  // owner instead — a message with something to press — is [T5].
  if (spec.commandReady === false) continue;
  cell(spec.id)(`[T1C] ${spec.id} — tapping a pattern plays it on the card`, async ({ page }) => {
    const card = await boot(page, spec, '/#screen=pattern', remembers);
    await expectConnects(page, `${spec.id} @ patterns`);
    // Tap something the card is definitely NOT already playing, so a pass
    // cannot be an accident of the starting state.
    const target = MATRIX_PATTERNS.find(pattern => pattern.id !== spec.currentId) || MATRIX_PATTERNS[0];
    await expectTapPlays(page, card, target.id);
  });
}

// ---------------------------------------------------------------------------
// Tier 3 — what Studio remembers, crossed with what the card holds. The cell
// that matters most is open work + a card holding something else: adopting
// must never silently replace it.
// ---------------------------------------------------------------------------
const TIER3_CARD_STATES = ['installed-match', 'installed-different', 'provisional'];

for (const browser of BROWSER_STATES) {
  for (const stateId of TIER3_CARD_STATES) {
    const spec = cardState(stateId);
    test(`[T3] ${stateId} + ${browser.id} — connects with ${browser.describe}`, async ({ page }) => {
      const card = await boot(page, spec, '/', browser);
      const { clicks, panelOpenedItself } = await expectConnects(page, `${stateId} + ${browser.id}`);
      // Meeting the card for the first time costs one click. Knowing it costs none.
      expect(clicks).toBeLessThanOrEqual(browser.id === 'fresh' ? 1 : 0);
      await expectUnaided(page, `${stateId} + ${browser.id}`, panelOpenedItself);

      if (browser.id === 'other-project-open') {
        const open = await page.evaluate(() => {
          try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; }
          catch { return ''; }
        });
        expect(open, 'Studio replaced the owner’s open work without being asked').toBe('lwproj-open-work');
      }
      expect(card.unhandled).toEqual([]);
    });
  }
}

// ---------------------------------------------------------------------------
// Tier 2 — the https lane. Same card, same three assertions, but Studio is
// served at led.mandalacodes.com, where it CANNOT fetch the card directly and
// must go through the card page. Every walkthrough before this suite drove the
// local http Studio, so this whole transport shipped untested.
// ---------------------------------------------------------------------------
import { installHttpsStudio, installFakeCardBridge, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { testBaseURL } from './testPort.mjs';

for (const spec of CARD_STATES) {
  cell(spec.id)(`[T2] ${spec.id} over the card page — a card ${spec.describe} connects, unaided`, async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', error => crashes.push(String(error.message)));

    const card = createCardSimulator(spec);
    await installHttpsStudio(page, testBaseURL);
    await installFakeCardBridge(page, card);
    // Deliberately NOT installing the direct HTTP routes: on https a direct
    // fetch is mixed-content blocked, so anything that tries one should fail
    // loudly here rather than quietly succeed in a test and break in the world.
    await remembers.seed(page);
    await page.goto(`${STUDIO_ORIGIN}/`, { waitUntil: 'domcontentloaded' });

    const { panelOpenedItself } = await expectConnects(page, `${spec.id} over the bridge`);
    await expectUnaided(page, `${spec.id} over the bridge`, panelOpenedItself);
    await expectNotStuck(page, `${spec.id} over the bridge`);
    expect(crashes, 'the screen crashed').toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// Tier 5 — a card that is answering but NOT well.
//
// This is the state behind every HTTP 423 the firmware returns, and it was not
// expressible in a fixture until now, so none of Studio's behaviour on refusal
// was tested. The specific fault: Patterns says "Recover and verify it before
// sending lights" and its button routes to Card Home, where the Checks &
// recovery section was hidden for exactly this card. The one stated remedy
// landed on a screen that did not show it.
// ---------------------------------------------------------------------------
test('[T5] a card that is not ready still offers the recovery it was sent for', async ({ page }) => {
  const spec = cardState('not-ready');
  const card = await boot(page, spec, '/#screen=card&section=overview', remembers);
  await expectConnects(page, 'not-ready @ overview');

  // The remedy Patterns names must exist on the screen Patterns sends you to.
  await expect(
    page.getByRole('button', { name: /Recover lights/i }),
    'a card that is answering but not ready must still offer Recover lights',
  ).toBeVisible({ timeout: 15000 });

  expect(card.unhandled).toEqual([]);
});

test('[T5] a refused pattern command does not leave the owner with nothing to press', async ({ page }) => {
  const card = await boot(page, cardState('blackout'), '/#screen=pattern', remembers);
  await expectConnects(page, 'refused control @ patterns');

  // The card accepts the read, then refuses the write — the commonest real
  // sequence, because readiness is polled far less often than taps happen.
  card.refuse('/api/control', { status: 423, times: 3 });

  const tile = page.locator('.pm-cards .pmcard[data-pattern-id="aurora"]');
  await expect(tile).toHaveCount(1, { timeout: 15000 });
  await tile.click();
  await page.waitForTimeout(3000);

  // Whatever Studio says, it must leave a way forward. A message with no
  // control is where the owner stops.
  const pressable = await page.locator('button:not([disabled])').all();
  const visible: string[] = [];
  for (const button of pressable) {
    if (await button.isVisible()) visible.push(((await button.textContent()) || '').trim().slice(0, 40));
  }
  expect(visible.length, 'a refused command left no enabled control on screen').toBeGreaterThan(0);
});
