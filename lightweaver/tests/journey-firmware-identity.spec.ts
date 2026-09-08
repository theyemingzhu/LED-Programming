// F13 — after a firmware update, the same card must reconnect without re-pairing.
//
// Found on Adrian's real card 2026-09-07. He ran the preserving Wi-Fi update
// 1524 → 1548 by the card-button path. The card came back healthy on the new
// build with its Wi-Fi, project and 41 pixels intact and playback ready — and
// Studio said "Not connected", Patterns refused and sent him to "Connect your
// card", and he re-walked setup and re-loaded the card by hand.
//
// `src/lib/cardReadiness.js` has always named the distinction exactly:
// `unexpected-card` is a DIFFERENT card id answering at this address — the
// thing worth stopping for — while `unexpected-firmware-version` and
// `unexpected-firmware-build` are the SAME card id reporting firmware that
// differs from the note Studio wrote down, which happens every time a card is
// updated. Every gate treated all three as "a stranger answered", so the one
// state a successful official update always produces was refused at every
// transport.
//
// The blueprint's transition rules say it in one line: "Unknown firmware is not
// old firmware", and its preservation matrix says a firmware update preserves
// Wi-Fi and project while invalidating only the RUNNING FIRMWARE IDENTITY — the
// note, not the pairing.
//
// This suite fixes both halves in place:
//   1. the updated card reconnects unaided and the remembered identity is
//      rewritten WHOLE — buildId, firmwareVersion and buildNumber together, so
//      no reader can ever see a record that is half one build and half another
//      (the live record showed the OLD buildId beside the NEW buildNumber);
//   2. a genuinely different card at the same address is still refused, and
//      nothing is written.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_BUILD_NUMBER,
  MATRIX_FIRMWARE_VERSION,
  MATRIX_PATTERNS,
} from './harness/cardStates';

// The compatible signed release the card is on AFTER the update. Same shape as
// a real one: a 40-hex revision (footerFirmwareStatus.js refuses anything else)
// and a build number above the remembered one, exactly as 1524 → 1548 was.
const UPDATED_BUILD_ID = 'c'.repeat(40);
const UPDATED_BUILD_NUMBER = MATRIX_BUILD_NUMBER + 116;
const UPDATED_FIRMWARE_VERSION = '1.1.33';

const CONNECTED = /^connected-(direct|bridge)$/;
const CONNECT_BUDGET_MS = 15000;

type PersistedIdentity = {
  id?: string;
  firmwareVersion?: string;
  buildId?: string;
  buildNumber?: number;
} | null;

/**
 * A browser that met this card BEFORE the update: it remembers the old
 * firmware whole, which is the honest starting state — Studio wrote that note
 * itself the last time it verified this card.
 */
async function seedCardKnownOnOldFirmware(page: Page) {
  await page.addInitScript(({ id, firmwareVersion, buildId, buildNumber }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({
      version: 1, id, firmwareVersion, buildId, buildNumber,
    }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, {
    id: MATRIX_CARD_ID,
    firmwareVersion: MATRIX_FIRMWARE_VERSION,
    buildId: MATRIX_BUILD_ID,
    buildNumber: MATRIX_BUILD_NUMBER,
  });
}

/** Put the simulated card on the new release, before Studio ever reads it. */
function applyFirmwareUpdate(card: CardSimulator) {
  card.state.buildId = UPDATED_BUILD_ID;
  card.state.buildNumber = UPDATED_BUILD_NUMBER;
  card.state.firmwareVersion = UPDATED_FIRMWARE_VERSION;
}

async function linkSnapshot(page: Page): Promise<{ state: string; reason: string }> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const state = getSharedCardLink().getState() || {};
    return { state: String(state.state || ''), reason: String(state.reason || '') };
  });
}

async function linkState(page: Page): Promise<string> {
  return (await linkSnapshot(page)).state;
}

async function persistedIdentity(page: Page): Promise<PersistedIdentity> {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('lw_card_identity_v1') || 'null'); }
    catch { return null; }
  });
}

function patternTile(page: Page, patternId: string) {
  return page.locator(`.pm-cards .pmcard[data-pattern-id="${patternId}"]`);
}

// ---------------------------------------------------------------------------
// F13 — the updated card is the same card.
// ---------------------------------------------------------------------------
test('[F13] a card that came back on a newer signed build reconnects without re-pairing', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);
  applyFirmwareUpdate(card);
  await card.install(page);
  await seedCardKnownOnOldFirmware(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // A. Zero clicks. This is the whole ticket: Adrian opened Studio and it said
  // "Not connected" about a card that was answering, healthy, on the build the
  // official updater had just installed.
  await expect
    .poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(CONNECTED);

  // B. The installation is still recognized. A firmware update preserves the
  // project (the preservation matrix says so, and the card still reports it),
  // so nothing about setup may restart.
  await expect(
    page.getByTestId('setup-journey'),
    'an updated card still holding its project must read as setup-complete, not re-onboard',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });
  await expect(
    page.getByTestId('setup-identity-row'),
    'the identity row must name the installed project as matching, not as a stranger',
  ).toContainText('Installed project matches', { timeout: CONNECT_BUDGET_MS });

  // C. The footer reports the build the card is ACTUALLY on. This is the number
  // Adrian reads to answer "am I running the newest code?".
  await expect(
    page.getByTestId('footer-firmware-status'),
    'the footer must show the build the card came back on',
  ).toContainText(String(UPDATED_BUILD_NUMBER), { timeout: CONNECT_BUDGET_MS });

  // D. The remembered identity is rewritten WHOLE. The live failure carried the
  // OLD buildId (…7654b, 1.1.31) beside a buildNumber that had already moved to
  // 1548 — a record that described no build that has ever existed. Assert all
  // three moved together, and that the card id did not.
  await expect
    .poll(async () => (await persistedIdentity(page))?.buildId, { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toBe(UPDATED_BUILD_ID);
  const identity = await persistedIdentity(page);
  expect(identity?.firmwareVersion, 'firmware version must move with the build id, never apart from it')
    .toBe(UPDATED_FIRMWARE_VERSION);
  expect(identity?.buildNumber, 'build number must move with the build id, never apart from it')
    .toBe(UPDATED_BUILD_NUMBER);
  expect(identity?.id, 'the pairing itself must be untouched — this is the same card').toBe(MATRIX_CARD_ID);

  // E. And the card actually does what it is for.
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(CONNECTED);
  const target = MATRIX_PATTERNS.find(pattern => pattern.id !== spec.currentId) || MATRIX_PATTERNS[0];
  await patternTile(page, target.id).click();
  await card.waitForPlaying(target.id, 5000);
});

// ---------------------------------------------------------------------------
// F13 (negative) — a different card is still a different card.
//
// The fix above must not become "any card answering at the remembered address
// is the paired one". Writing to a stranger's card is the exact harm
// `unexpected-card` exists to prevent, and it stays prevented.
// ---------------------------------------------------------------------------
test('[F13] a different card at the same address is still refused, and nothing is written', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec, { cardId: 'lw-someone-elses-card' });
  applyFirmwareUpdate(card);
  await card.install(page);
  await seedCardKnownOnOldFirmware(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Give the same budget the positive case gets to reach a green link, so this
  // is a real refusal rather than a race the assertion happened to win.
  await page.waitForTimeout(CONNECT_BUDGET_MS);
  const snapshot = await linkSnapshot(page);
  expect(snapshot.state, `a stranger's card must never become the paired link (reason: ${snapshot.reason})`)
    .not.toMatch(CONNECTED);

  const identity = await persistedIdentity(page);
  expect(identity?.id, 'the pairing must still name Adrian’s card').toBe(MATRIX_CARD_ID);
  expect(identity?.buildId, 'a stranger’s firmware must never be adopted as this card’s note').toBe(MATRIX_BUILD_ID);
  expect(identity?.firmwareVersion, 'a stranger’s firmware must never be adopted as this card’s note')
    .toBe(MATRIX_FIRMWARE_VERSION);
  expect(identity?.buildNumber, 'a stranger’s firmware must never be adopted as this card’s note')
    .toBe(MATRIX_BUILD_NUMBER);

  const writes = card.requests.filter(request => request.method !== 'GET');
  expect(writes.map(request => `${request.method} ${request.path}`), 'nothing may be written to a card Studio has not verified')
    .toEqual([]);
});
