// Six sides, saved to a card: the owner journey behind "symmetry by eye".
//
// tests/layout-symmetry-by-eye.spec.ts proves the Layout control; the unit
// suite and tests/symmetry-card-contract.mjs prove the config Studio builds
// and that the card's own validator takes six mirrored sides. This spec joins
// them through the buttons an owner presses: draw six petals and a centre
// ring, choose "6 sides", Save to card, and read back what the card holds —
// then reload Studio and check the card's project is still recognised.
//
// The card is the practice card (docs/practice-card.md), blank, as a new
// piece's card is. Fast by default; LW_PRACTICE_TIMING=real runs the same
// journey with the measured 14.2 s restart after the save.
//
// One layer is this spec's own. The practice card does not yet report
// `capabilities.symmetrySides` (the physical card does:
// tests/harness/traces/real-card-bench-2026-11-21/status.json), and the
// simulator is another session's file. `cardReportsSymmetrySides` adds or
// removes that one field on the card's status and firmware-info replies as
// the page receives them. Everything else is the practice card's own answer.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createPracticeCard, defaultTimingName } from './harness/practiceTiming.js';
import { cardState } from './harness/cardStates';
import { answerFirstInstallCheck } from './ux/drivers';

type StripDef = { name: string; d: string };

const REAL = defaultTimingName() === 'real';
// The real card restarts after every accepted save and comes back under a new
// boot id; Studio's read-back waits for that. 14.2 s is the measured restart
// (practiceTiming.ts REAL_PROFILE.restartSilenceMs); Fast keeps the restart
// and shortens the silence.
const RESTART_AFTER_SAVE_MS = REAL ? 14200 : 600;
const SETTLE_MS = REAL ? 150000 : 45000;
const CARD_STORAGE_BYTES = 3968;
const SIDE_IDS = ['side-1', 'side-2', 'side-3', 'side-4', 'side-5', 'side-6'];
const LEDS_PER_STRIP = 24;

test.describe.configure({ timeout: REAL ? 420000 : 180000 });

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null'));
const savedSymmetry = async (page: Page) => (await saved(page))?.layout?.symmetry ?? null;
const lifecycle = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_project_lifecycle_v1') || 'null'));

async function linkConnected(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return /^connected-/.test(String(getSharedCardLink().getState()?.state || ''));
  });
}

async function cardReportsSymmetrySides(page: Page, supported: boolean) {
  await page.addInitScript((on: boolean) => {
    const cardFetch = window.fetch.bind(window);
    window.fetch = async (input: any, init?: any) => {
      const response = await cardFetch(input, init);
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (!/\/api\/(status|firmware-info)(\?|$)/.test(url) || !response.ok) return response;
      try {
        const body = await response.clone().json();
        const capabilities = { ...(body.capabilities || {}) };
        if (on) capabilities.symmetrySides = 1; else delete capabilities.symmetrySides;
        return new Response(JSON.stringify({ ...body, capabilities }), { status: response.status, headers: response.headers });
      } catch {
        return response;
      }
    };
  }, supported);
}

// Same seeding as layout-symmetry-by-eye.spec.ts: build through the real UI so
// the wiring and patch board are genuine, then redraw each strip's path.
async function seedPiece(page: Page, defs: StripDef[]) {
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  const count = page.locator('.la-strip-detail .la-row-count input').first();
  await count.fill(String(LEDS_PER_STRIP));
  await count.blur();
  for (let index = 1; index < defs.length; index += 1) {
    await page.locator('.la-strip-item.is-editing .la-strip-menu > summary').click();
    await page.locator('.la-strip-item.is-editing .la-strip-menu-popover').getByRole('button', { name: 'Duplicate strip' }).click();
    await expect(page.locator('.la-strip-row')).toHaveCount(index + 1);
  }
  await expect.poll(async () => (await saved(page))?.layout?.strips?.length).toBe(defs.length);
  await expect.poll(async () => (await saved(page))?.layout?.wiring?.runs?.length).toBe(defs.length);
  await page.evaluate((stripDefs: StripDef[]) => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null');
    project.layout.strips = project.layout.strips.map((strip: any, index: number) => {
      const def = stripDefs[index];
      const { pixels, ...rest } = strip;
      return { ...rest, name: def.name, pathData: def.d, x: 0, y: 0, reversed: false, sourceLayerId: null, sourcePathId: null };
    });
    // The two-sides offer is another test's subject; here it would cover the card under test.
    project.layout.symmetryOfferDismissed = true;
    localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
  }, defs);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.la-strip-row')).toHaveCount(defs.length);
  const ids: string[] = await page.evaluate(() => (JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null')?.layout?.strips || [])
    .map((strip: any) => strip.id));
  return Object.fromEntries(defs.map((def, index) => [def.name, ids[index]]));
}

// Six petals about (300, 200), each one curved strip drawn from the centre
// outward, plus a ring on the centre that belongs to no side.
const C = { x: 300, y: 200 };
const at = (radius: number, degrees: number) => {
  const x = C.x + radius * Math.cos(degrees * Math.PI / 180);
  const y = C.y + radius * Math.sin(degrees * Math.PI / 180);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
};
const PETALS: StripDef[] = Array.from({ length: 6 }, (_, k) => {
  const th = -90 + 60 * k;
  return { name: `Petal ${k + 1}`, d: `M ${at(45, th - 8)} Q ${at(105, th - 22)} ${at(150, th)}` };
});
const LOTUS: StripDef[] = [...PETALS, { name: 'Centre ring', d: 'M 288 200 A 12 12 0 1 1 312 200 A 12 12 0 1 1 288 200' }];

// A blank practice card Studio already knows, and a six-petal piece with
// "6 sides" chosen, ready for Save to card.
async function blankCardAndSixSidedPiece(page: Page, { symmetrySides }: { symmetrySides: boolean }) {
  const { card, profile } = createPracticeCard(cardState('factory-blank'), {
    restartAfterSaveMs: RESTART_AFTER_SAVE_MS,
    seed: 7,
  });
  // Track the whole output list, as the simulator does for any card created
  // with `initialOutputs` (which a blank card, with no pixels, cannot pass).
  // The card then keeps the zones it is sent, so /api/zones answers with the
  // saved ranges and not one whole-strip default per zone.
  card.state.explicitOutputs = [];
  await card.install(page);
  await cardReportsSymmetrySides(page, symmetrySides);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId });

  const ids = await seedPiece(page, LOTUS);
  await page.getByTestId('layout-symmetry-6').click();
  await expect(page.getByTestId('symmetry-focus-verdict')).toContainText('6 sides line up.');
  await expect.poll(async () => ((await savedSymmetry(page))?.sides || []).length).toBe(6);
  await page.getByTestId('symmetry-focus-done').click();
  await expect.poll(() => linkConnected(page), { timeout: SETTLE_MS, message: 'the practice card must be connected before the save' }).toBe(true);
  return { card, profile, ids };
}

const configPosts = (card: { requests: { method: string; path: string; body: unknown }[] }) =>
  card.requests.filter(entry => entry.method === 'POST' && entry.path === '/api/config');
const writes = (card: { requests: { method: string; path: string }[] }) =>
  card.requests.filter(entry => entry.method === 'POST').map(entry => entry.path);

test('six sides save to a blank card, are confirmed, and are still the card\'s project after a reload', async ({ page }) => {
  const { card, profile, ids } = await blankCardAndSixSidedPiece(page, { symmetrySides: true });
  const project = await saved(page);
  expect(configPosts(card), 'nothing is written before the owner saves').toHaveLength(0);

  // The owner's two presses: Save to card on Layout, then Save to card on the
  // blank card's own panel.
  await page.getByTestId('layout-check-and-install').click();
  await expect(page).toHaveURL(/#screen=card&section=setup&task=install-project/);
  const blankSave = page.getByTestId('blank-card-save');
  await expect(blankSave).toBeVisible({ timeout: SETTLE_MS });
  const pressedAt = Date.now();
  await blankSave.click();

  // Since the first-install light check landed on main, a blank card's first
  // save is followed by that check (the colour row as sent, each strip's end)
  // before Studio moves on. Answer it, then expect Patterns.
  await answerFirstInstallCheck(page, { timeout: SETTLE_MS });

  // Confirmed, not just sent: Studio hands off to Patterns only after it has
  // read the exact project back from the restarted card.
  await expect(page, 'a verified save hands off to Patterns').toHaveURL(/#screen=pattern$/, { timeout: SETTLE_MS });
  await expect(page.getByText('Installed on card', { exact: true })).toBeVisible({ timeout: SETTLE_MS });
  await expect(page.getByRole('alert')).toHaveCount(0);
  console.log(`[symmetry-sides-card-save] ${profile}: confirmed ${Date.now() - pressedAt} ms after the press`);

  // What the card received: one whole-project write, no staged candidate.
  const posts = configPosts(card);
  expect(posts, 'one press, one write').toHaveLength(1);
  expect(writes(card)).not.toContain('/api/wiring/candidate');
  const config = posts[0].body as Record<string, any>;
  const bytes = Buffer.byteLength(JSON.stringify(config));
  console.log(`[symmetry-sides-card-save] ${profile}: config payload ${bytes} bytes of ${CARD_STORAGE_BYTES}`);
  expect(bytes, 'the six-sided project fits the card\'s project store').toBeLessThan(CARD_STORAGE_BYTES);

  const zones = config.zones as Record<string, any>[];
  expect(zones.map(zone => zone.id)).toEqual([...SIDE_IDS, ids['Centre ring']]);
  const sides = zones.slice(0, 6);
  sides.forEach((side, index) => {
    expect(side.continuous, `${side.id} plays as one continuous run`).toBe(true);
    expect(side.ranges, `${side.id} is one petal`).toEqual([{ start: index * LEDS_PER_STRIP, count: LEDS_PER_STRIP }]);
  });
  expect(sides[0], 'side 1 is the source, not a copy').not.toHaveProperty('mirrorOf');
  for (const side of sides.slice(1)) expect(side.mirrorOf, `${side.id} copies side 1`).toBe('side-1');
  const ring = zones[6];
  expect(ring.label).toBe('Centre ring');
  expect(ring.ranges).toEqual([{ start: 6 * LEDS_PER_STRIP, count: LEDS_PER_STRIP }]);
  expect(ring, 'the centre ring belongs to no side').not.toHaveProperty('mirrorOf');
  expect(ring).not.toHaveProperty('continuous');

  // What the card now holds, and that Studio's record of the install is the
  // card's own identity for it.
  expect(card.state.projectId).toBe(project.id);
  expect(card.state.pixels).toBe(7 * LEDS_PER_STRIP);
  expect((card.state.installedZones || []).map(zone => zone.id)).toEqual([...SIDE_IDS, ids['Centre ring']]);
  expect((card.state.installedZones || []).slice(1, 6).map(zone => zone.mirrorOf)).toEqual(Array(5).fill('side-1'));
  const installation = (await lifecycle(page))?.installation;
  expect(installation?.cardId).toBe(card.state.cardId);
  expect(installation?.projectFingerprint).toBe(card.state.projectFingerprint);
  expect(installation?.projectFingerprint).toBe(config.projectFingerprint);
  // Patterns reads the card's sections back and finds its own.
  await expect(page.getByText(/Save to card to send yours/)).toHaveCount(0);

  // Reload Studio and reconnect: the card's project is the open one.
  const writesBeforeReload = writes(card).length;
  await page.goto('/#screen=card', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => linkConnected(page), { timeout: SETTLE_MS }).toBe(true);
  await expect(page.getByTestId('setup-identity-installed')).toHaveText('Installed project', { timeout: SETTLE_MS });
  await expect(page.locator('[data-journey-complete]').first()).toHaveAttribute('data-journey-complete', 'true');
  await expect(page.getByText('Your draft matches the installed project.', { exact: false })).toBeVisible();
  await expect(page.getByText(/differs/i)).toHaveCount(0);
  await expect(page.getByText('This card is blank')).toHaveCount(0);
  expect((await lifecycle(page))?.installation).toEqual(installation);

  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('layout-symmetry-6')).toHaveAttribute('aria-pressed', 'true');
  const symmetry = await savedSymmetry(page);
  expect(symmetry.fold).toBe(6);
  expect(symmetry.sides.map((side: any) => side.id)).toEqual(SIDE_IDS);
  expect(symmetry.sides.map((side: any) => side.stripIds)).toEqual([1, 2, 3, 4, 5, 6].map(n => [ids[`Petal ${n}`]]));
  expect(symmetry.sides.flatMap((side: any) => side.stripIds)).not.toContain(ids['Centre ring']);
  expect(writes(card).length, 'reloading and reconnecting writes nothing to the card').toBe(writesBeforeReload);
  expect(card.unhandled, 'the journey asked the practice card nothing it does not model').toEqual([]);
});

test('a card that cannot play mirrored sides is refused, and nothing is written to it', async ({ page }) => {
  const { card } = await blankCardAndSixSidedPiece(page, { symmetrySides: false });
  await page.getByTestId('layout-check-and-install').click();
  await expect(page).toHaveURL(/#screen=card&section=setup&task=install-project/);
  const blankSave = page.getByTestId('blank-card-save');
  await expect(blankSave).toBeVisible({ timeout: SETTLE_MS });
  await blankSave.click();

  const status = page.getByTestId('blank-card-save-status');
  await expect(status).toHaveText('Update this card to play mirrored sides.', { timeout: SETTLE_MS });
  await expect(status).toHaveAttribute('role', 'alert');
  await expect(blankSave).toHaveText('Try saving again');
  await expect(page).toHaveURL(/#screen=card&section=setup&task=install-project/);

  expect(writes(card), 'the refusal comes before any write').toEqual([]);
  expect(card.state.projectId).toBe('');
  expect(card.state.pixels).toBe(0);
  expect((await lifecycle(page))?.installation ?? null).toBeNull();
});
