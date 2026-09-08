// F18 — an edit request from the card page must land on Patterns, never on
// the setup ladder — docs/plans/2026-09-06-unified-card-journey-execution.md,
// round 2. See lw-card.jsx's `editIntentPatternRouteRef` effect (the fix) and
// THINKING.md's two 2026-08-07 entries (the routing race, and the handoff
// loop breaker in cardEditIntent.js) before touching this file.
//
// Real-bench defect (2026-09-08): the owner has Studio open on Patterns with
// "Test Strip" open and an unsaved wiring edit. From the card's own page they
// click "EDIT IN STUDIO" next to a pattern; firmware navigates the opener
// Studio tab (a full reload) to
//   /?cardBridge=1&cardHost=lightweaver.local&editLook=combo-aurora#screen=card&section=overview
// Studio restores the autosave, the lifecycle record shows the wiring edit
// invalidated the installation (`installation: null, dirty: true`), and
// deriveCardLifecycle — independently, from that persisted record — lands on
// `project-mismatch` → task `load-matching-project`: phase 1 of the setup
// ladder, "Use this card's project". The edit intent is dropped and a
// finished-setup owner is put back on phase 1.
//
// This file uses `editPattern=` rather than the real repro's `editLook=`:
// cardEditIntent.js treats them as the same class of intent (see its own
// comment), but `editPattern` resolves against the global pattern bank
// (getCardPatternById) while `editLook` resolves against this Studio
// project's OWN saved looks (savedLooks) — a fixture concern orthogonal to
// the routing bug this file proves. The selected-chip assertion below is the
// one the codebase already has a testid for (`data-pattern-id` +
// `aria-pressed` on `.pmcard`, used the same way in
// card-state-matrix.spec.ts's [T5] tests).
//
// The "one wiring edit" fixture is Studio's OWN generated project — booted
// on the install screen and finished exactly as
// journey-ownership.spec.ts's own `readyInstallProject` does (verified/locked
// wiring, confirmed colour order, a reload before anything else touches it)
// — with its id relabelled to the card's project id. Three things a
// hand-authored `{ id, pixels, pin }` strip cannot get right, each verified
// against this exact harness before landing:
//   1. A hand-authored strip (no `pixels` geometry, no `portRoles`) is not
//      the shape Studio's own project migration expects and is silently
//      discarded outright — the seed never loads at all, and Studio falls
//      back to reconstructing straight from the connected card, which erases
//      the deliberate divergence before the test ever gets to look at it.
//   2. Once the seed loads for real, `portRoles` still all `unused` (true of
//      Studio's own default the instant it is generated, before the app's
//      own boot derives them from the verified wiring) is what
//      lw-setup.jsx's `adoptWiringFromCard` calls "untouched" — its own
//      comment names the exact hazard: "a real piece that simply had not yet
//      written its strip into `portRoles` was overwritten by the first card
//      it met, whichever project that card held." The fixture marks one
//      output `role: 'strip'` itself so that auto-adopt sees the piece as
//      already described.
//   3. `deriveCardLifecycle` checks TOTAL pixel count before it checks
//      project identity (`length-mismatch` outranks `project-mismatch`), so
//      a project whose total differs from the card's lands on the length
//      chip, not the ladder task this ticket is about. The fixture keeps
//      Studio's own two-strip layout (proving the divergence is structural,
//      not just a name change) but rebalances the SECOND strip's count so
//      the total matches the card's, leaving the first strip's pixel
//      geometry untouched — trimming a strip's `pixels` array instead was
//      tried and crashed the render (the patch board holds references into
//      it), so only `pixelCount` moves.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_FIRMWARE_VERSION,
  MATRIX_BUILD_ID,
  MATRIX_HOST,
} from './harness/cardStates';

const CONNECT_BUDGET_MS = 15000;
const INSTALL_ROUTE = '/#screen=card&section=setup&task=install-project';

/**
 * Boots Studio's own default project directly on the install screen, marks
 * it verified/locked/color-confirmed exactly the way
 * journey-ownership.spec.ts's `readyInstallProject` does, and reloads so the
 * mutated copy — with `portRoles` properly derived from the now-verified
 * wiring — is what the app actually runs on. Copied rather than imported:
 * per that file's own header, spec files in this suite copy each other's
 * fixture recipes instead of importing them.
 */
async function readyInstallProject(page: Page, edit?: (project: Record<string, any>) => void) {
  await page.goto(INSTALL_ROUTE, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('lw_autosave_v3'))), {
    timeout: CONNECT_BUDGET_MS,
  }).toBe(true);
  await page.waitForTimeout(600);
  const project = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  project.layout.wiring.verified = true;
  project.layout.wiring.locked = true;
  project.layout.wiring.runs.forEach((run: Record<string, any>) => { run.verified = true; });
  const led = project.devices.standaloneController.led;
  led.colorOrder = led.colorOrder || 'GRB';
  led.colorOrderConfirmed = true;
  led.confirmedColorOrder = led.colorOrder;
  edit?.(project);
  await page.addInitScript(value => localStorage.setItem('lw_autosave_v3', value), JSON.stringify(project));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('commissioning-step')).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(page.getByText('Ready to install on the card.')).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect(page.getByTestId('layout-send-to-card')).toBeEnabled({ timeout: CONNECT_BUDGET_MS });
  return project;
}

/**
 * The fixture this file's two tests share: Studio's own default project,
 * relabelled to the card's project id, one output marked `role: 'strip'` so
 * `adoptWiringFromCard` treats the piece as already described, and the
 * second strip's pixel count rebalanced so the TOTAL matches the card's
 * (`deriveCardLifecycle` checks length before identity) while the structure
 * still genuinely differs — then the card-identity keys and the ticket's
 * exact lifecycle seed (`dirty: true, installation: null`, a wiring edit
 * that invalidated the install entirely) layered on top for the caller's own
 * final navigation.
 */
async function seedWiringDivergedProject(page: Page) {
  const spec = cardState('installed-match');
  await readyInstallProject(page, project => {
    project.id = spec.projectId;
    project.name = 'Test Strip';
    const strips = project.layout.strips;
    const currentTotal = strips.reduce((sum: number, strip: Record<string, any>) => sum + (strip.pixelCount || 0), 0);
    const delta = currentTotal - spec.pixels;
    strips[1].pixelCount = Math.max(1, strips[1].pixelCount - delta);
    project.portRoles = (project.portRoles || []).map((entry: Record<string, any>) => (
      entry.pin === 16 ? { ...entry, role: 'strip', pixelCount: spec.pixels, controlKind: '' } : entry
    ));
  });
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    // The install-screen bootstrap above left a resumable commissioning flow
    // behind in sessionStorage (it never clicked Install or Cancel) — and
    // app.jsx's route reconciler forces the URL back to the install route for
    // as long as `installActiveRef` reads one, which stomped every attempt to
    // navigate to Patterns before this was found. This owner has already
    // finished setup once and is returning to edit; nothing here should still
    // look mid-commissioning.
    sessionStorage.removeItem('lw_card_commissioning_active_v2');
    localStorage.removeItem('lw_card_commissioning_registry_v2');
    localStorage.removeItem('lw_card_commissioning_registry_v2_backup');
    // The wiring edit invalidated the installation entirely — no verified
    // record survives it. This is the ticket's exact seed, not an
    // approximation: `dirty: true, installation: null`.
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      generation: 2,
      editedRevision: 2,
      installedRevision: 1,
      dirty: true,
      installation: null,
    }));
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  return spec;
}

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

async function currentHash(page: Page): Promise<string> {
  return page.evaluate(() => window.location.hash);
}

test('[J18-edit-intent] a card-issued edit request lands on Patterns, wiring drift and all', async ({ page }) => {
  const spec = await seedWiringDivergedProject(page);
  const card = createCardSimulator(spec);
  await card.install(page);

  await page.goto(
    `/?editPattern=aurora&cardHost=${MATRIX_HOST}#screen=card&section=overview`,
    { waitUntil: 'domcontentloaded' },
  );

  // The card connects (this is a card Studio already knows), the resolved
  // adoption run refuses on the fingerprint drift, and lw-card.jsx's F18
  // effect reacts to that refusal by routing to Patterns anyway.
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(/^connected-(direct|bridge)$/);

  await expect.poll(() => currentHash(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(/^#screen=pattern/);

  // Patterns is on screen and the owner's request survives in the URL. With
  // drifted wiring Patterns cannot yet claim the edit authorization (that is
  // the F5/F6 write gate, deliberately untouched), so the look is offered,
  // not auto-selected; the 2026-08-07 breaker keeps the intent in the URL.
  await expect(page.locator('.pm-cards .pmcard[data-pattern-id="aurora"]'))
    .toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get('editPattern')))
    .toBe('aurora');

  await expect(
    page.locator('[data-journey-task="load-matching-project"]'),
    'an honoured edit intent must never surface the ladder\'s "which copy wins" task',
  ).toHaveCount(0);

  // The 2026-08-07 ping-pong: Patterns bouncing an unauthorized landing back
  // to the card, which then re-issues the same refused edit intent and
  // routes straight back. A single hash sample can catch the destination
  // mid-flip and pass by coincidence (the exact failure mode the 2026-08-07
  // "handoff loop" entry names), so hold the sample window open and confirm
  // the screen never leaves Patterns once it lands there.
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(250);
    expect(await currentHash(page)).toMatch(/^#screen=pattern/);
  }
});

test('[J18-bare] the same drifted card, visited bare, still shows the ladder\'s load-matching-project task', async ({ page }) => {
  const spec = await seedWiringDivergedProject(page);
  const card = createCardSimulator(spec);
  await card.install(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(/^connected-(direct|bridge)$/);

  // No edit intent in the URL: the ladder's "which copy wins" diagnosis is
  // the correct, honest answer for a bare visit, and F18 must not swallow it.
  await expect(
    page.locator('[data-journey-task="load-matching-project"]'),
    'a bare visit to a drifted card must still surface the honest diagnosis',
  ).toHaveCount(1, { timeout: CONNECT_BUDGET_MS });

  await expect(page.locator('[data-journey-task="load-matching-project"]'))
    .toBeVisible();
});
