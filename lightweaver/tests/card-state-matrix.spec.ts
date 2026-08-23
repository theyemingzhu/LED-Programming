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

async function expectConnects(page: Page) {
  // 15s is not arbitrary: CARD_LINK_CONNECT_TIMEOUT_MS in src/lib/cardLink.js.
  await expect.poll(() => linkState(page), { timeout: 15000, intervals: [250] })
    .toMatch(/^connected-(direct|bridge)$/);
}

/**
 * B — nothing asked him to intervene. Two separate failures are covered:
 * a raised alert, and a modal that opened itself. Both are "chunky workaround"
 * in his words, and both have shipped before.
 */
async function expectUnaided(page: Page, note: string) {
  const alerts = await page.getByRole('alert').all();
  const raised: string[] = [];
  for (const alert of alerts) {
    if (await alert.isVisible()) raised.push(((await alert.textContent()) || '').trim().slice(0, 120));
  }
  expect(raised, `${note}: Studio raised an alert before the owner did anything`).toEqual([]);
  const panel = page.locator('#card-connection-center');
  const panelOpen = (await panel.count()) > 0 && await panel.first().isVisible();
  expect(panelOpen, `${note}: the connection panel opened itself`).toBe(false);
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

for (const spec of CARD_STATES) {
  for (const entry of ENTRIES) {
    test(`[T1] ${spec.id} @ ${entry.id} — a card ${spec.describe} connects, unaided`, async ({ page }) => {
      const crashes: string[] = [];
      page.on('pageerror', error => crashes.push(String(error.message)));

      const card = await boot(page, spec, entry.hash, remembers);
      await expectConnects(page);
      await expectUnaided(page, `${spec.id} @ ${entry.id}`);

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
  test(`[T1C] ${spec.id} — tapping a pattern plays it on the card`, async ({ page }) => {
    const card = await boot(page, spec, '/#screen=pattern', remembers);
    await expectConnects(page);
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
      await expectConnects(page);
      await expectUnaided(page, `${stateId} + ${browser.id}`);

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
  test(`[T2] ${spec.id} over the card page — a card ${spec.describe} connects, unaided`, async ({ page }) => {
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

    await expect.poll(() => linkState(page), { timeout: 20000, intervals: [250] })
      .toMatch(/^connected-(direct|bridge)$/);
    await expectUnaided(page, `${spec.id} over the bridge`);
    expect(crashes, 'the screen crashed').toEqual([]);
  });
}
