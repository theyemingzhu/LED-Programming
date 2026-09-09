// U1-build — Card Home compact pass (round2/ux-card-setup).
//
// The UX critique flagged five repeats/clutter defects on Card Home and the
// Setup ladder: two primaries at once while the card is blacked out, a stale
// "set up your Lightweaver" heading once setup is finished, a toast telling
// the owner the same fact the persistent badge already states, an
// ellipsis-truncated identity value on a phone, and a phase-4 summary table
// repeating the Card/Project facts the identity row directly above already
// states. This spec is the red-then-green proof for the fix.
//
// Fixture recipes are copied verbatim from tests/journey-continuity.spec.ts
// per that suite's own header convention (spec files here copy each other's
// fixture recipes instead of importing them, so a fixture invariant lives
// with its test, not behind an import).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, copyFileSync } from 'node:fs';
import { createCardSimulator, seedWiringDivergedProject, type CardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  type CardStateSpec,
} from './harness/cardStates';

const CONNECT_BUDGET_MS = 15000;
const CONNECTED = /^connected-(direct|bridge)$/;

const AFTER_DIR = 'test-results/u1-after';
const UX_SCREENS_DIR = '../.claude/ux-screens';
mkdirSync(AFTER_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Fixture helpers — copied from tests/journey-continuity.spec.ts.
// ---------------------------------------------------------------------------

/** A browser that has met this card before but holds no project of its own. */
async function seedKnownCard(page: Page, cardId = MATRIX_CARD_ID) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
}

/** A returning owner whose saved project is already the exact card's install. */
async function seedReturningOwnerWithCompleteProject(page: Page, spec: CardStateSpec) {
  await page.addInitScript(({ id, firmwareVersion, buildId, project }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3,
      id: project.projectId,
      name: 'Matrix piece',
      layout: {
        starterPending: false,
        strips: [{ id: 'strip-1', pixels: project.pixels, pin: project.pin }],
        wiring: {
          verified: true,
          runs: [{ id: 'strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward' }],
        },
      },
      portRoles: [{ port: 'out1', role: 'strip', pin: project.pin, pixelCount: project.pixels }],
      devices: {
        standaloneController: {
          led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' },
        },
      },
    }));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2,
      dirty: false,
      persistedDestination: null,
      installation: {
        cardId: id,
        projectRevision: project.projectRevision,
        projectFingerprint: project.projectFingerprint,
        studioFingerprint: project.projectFingerprint,
      },
    }));
  }, {
    id: MATRIX_CARD_ID,
    firmwareVersion: MATRIX_FIRMWARE_VERSION,
    buildId: MATRIX_BUILD_ID,
    project: {
      projectId: spec.projectId,
      projectRevision: spec.projectRevision,
      projectFingerprint: spec.projectFingerprint,
      pixels: spec.pixels,
      pin: spec.pin,
    },
  });
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

async function waitConnectedUnaided(page: Page, note: string) {
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(CONNECTED, { message: note } as never);
}

function journeyLocator(page: Page) {
  return page.getByTestId('setup-journey');
}

/** Screenshot at a size, into test-results/u1-after/, then mirrored beside
 * the critique's before-pictures so the two sit next to each other. */
async function captureAfter(page: Page, state: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  // Let layout settle after a resize before capturing.
  await page.waitForTimeout(150);
  const filename = `after-${state}-${width}x${height}.png`;
  const outPath = `${AFTER_DIR}/${filename}`;
  await page.screenshot({ path: outPath });
  try {
    copyFileSync(outPath, `${UX_SCREENS_DIR}/${filename}`);
  } catch {
    // The critique folder lives outside this worktree's write scope in some
    // environments — the canonical copy in test-results/u1-after/ is never
    // skipped, so nothing is lost when this best-effort mirror can't land.
  }
}

// ---------------------------------------------------------------------------
// (a) One orange primary when the strip is dark.
//
// Scoped to the two banners the critique named — the F16 blackout banner and
// the Setup ready banner — not the whole page. Card Home already carries
// other, unrelated primary controls further down (the phase ladder's own
// "Open Patterns" and the wiring Install action) that this ticket's five
// items do not touch; scoping here to what U1-build item 1 actually names
// keeps this spec honest about what it proves.
// ---------------------------------------------------------------------------
test('[U1a] the ready banner stands down to secondary while the card is blacked out', async ({ page }) => {
  const spec = cardState('blackout');
  await boot(page, spec, '/', p => seedReturningOwnerWithCompleteProject(p, spec));
  await waitConnectedUnaided(page, 'U1a connect');

  await expect(
    journeyLocator(page),
    'a card holding exactly the project it already reports installed must read as setup-complete even while blacked out',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });

  const blackoutNotice = page.getByTestId('card-blackout-notice');
  await expect(blackoutNotice, 'Card Home must say the lights are off on the card').toBeVisible({ timeout: CONNECT_BUDGET_MS });

  const scopedPrimaries = page.locator(
    '.card-blackout-banner .btn.primary, [data-testid="setup-card-ready"] .btn.primary',
  );
  await expect(
    scopedPrimaries,
    'exactly one primary action may show while the card is dark — Recover lights',
  ).toHaveCount(1);
  await expect(scopedPrimaries.first()).toHaveAttribute('data-testid', 'recover-lights');

  // The ready banner's own Open Patterns control must still exist and still
  // work — it just may not wear the primary look while the strip is dark.
  const openPatterns = page.getByTestId('setup-open-patterns');
  await expect(openPatterns).toBeVisible();
  await expect(openPatterns).not.toHaveClass(/\bprimary\b/);

  await captureAfter(page, 'blackout', 1440, 900);
  await captureAfter(page, 'blackout', 390, 844);
});

// ---------------------------------------------------------------------------
// (b) Heading follows the journey.
// ---------------------------------------------------------------------------
test('[U1b] Card Home heading follows the setup journey', async ({ page }) => {
  const spec = cardState('factory-blank');
  await boot(page, spec, '/', seedKnownCard);
  await waitConnectedUnaided(page, 'U1b factory-blank connect');

  await expect(
    journeyLocator(page),
    'a blank card must not read as setup-complete',
  ).toHaveAttribute('data-journey-complete', 'false');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up your Lightweaver');

  await captureAfter(page, 'factory-blank', 1440, 900);
  await captureAfter(page, 'factory-blank', 390, 844);
});

test('[U1b] Card Home heading reads "Your Lightweaver" once setup is complete', async ({ page }) => {
  const spec = cardState('installed-match');
  await boot(page, spec, '/', p => seedReturningOwnerWithCompleteProject(p, spec));
  await waitConnectedUnaided(page, 'U1b installed-match connect');

  await expect(
    journeyLocator(page),
    'a card holding exactly the open project must read as setup-complete',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Lightweaver');

  await captureAfter(page, 'installed-match', 1440, 900);
  await captureAfter(page, 'installed-match', 390, 844);
});

// ---------------------------------------------------------------------------
// (c) One telling of "Restored from recovery copy".
//
// No card needed — this is a pure project-lifecycle boot state. A valid v3
// autosave copy with no lifecycle record restores as `restored: true`
// (src/lib/projectLifecycle.js `lifecycleForRestoredProject`), which is
// exactly the recipe tests/project-recovery-fixtures.spec.ts uses for its
// own "valid v3 autosave restores" case.
// ---------------------------------------------------------------------------
test('[U1c] recovery is told once, by the badge, not the toast', async ({ page }) => {
  const project = JSON.stringify({ version: 3, id: 'lwproj-u1c-recovery', name: 'Recovery Fixture' });
  await page.addInitScript(({ payload }) => {
    localStorage.clear();
    localStorage.setItem('lw_autosave_v3', payload);
    localStorage.setItem('lw_autosave_v3_backup', payload);
  }, { payload: project });

  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.crumb .proj')).toHaveText('Recovery Fixture');

  const badge = page.getByTestId('project-lifecycle-label');
  await expect(badge, 'the persistent lifecycle badge must state the restore').toHaveText('Restored from recovery copy');

  // The old toast's whole lifetime was ~2200ms (fire on mount, auto-dismiss
  // after 2200ms). Checking only after that window closed would pass whether
  // or not the toast ever fired — this polls THROUGH the window it used to
  // be visible in, so it actually catches it while it would have been shown.
  const toastWithSameText = page.getByTestId('workspace-notice').filter({ hasText: 'Restored from recovery copy' });
  let sawToast = false;
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (await toastWithSameText.count() > 0) { sawToast = true; break; }
    await page.waitForTimeout(100);
  }
  expect(sawToast, 'the toast must not repeat what the persistent badge already states').toBe(false);

  // The badge is still there — removing the toast must not have silenced
  // the one place this fact is supposed to live.
  await expect(badge).toHaveText('Restored from recovery copy');
});

// ---------------------------------------------------------------------------
// (d) Identity-row values wrap on narrow screens.
// ---------------------------------------------------------------------------
test('[U1d] the Installed identity value wraps instead of truncating on a phone', async ({ page }) => {
  const spec = await seedWiringDivergedProject(page);
  const card = createCardSimulator(spec);
  await card.install(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'U1d connect');
  await expect(journeyLocator(page)).toBeVisible({ timeout: CONNECT_BUDGET_MS });

  const installedValue = page.locator('[data-testid="setup-identity-row"] > div').nth(3).locator('strong');
  await expect(installedValue).toHaveText('Same project, not yet verified');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);

  await expect(installedValue).toHaveText('Same project, not yet verified');
  const box = await installedValue.evaluate(node => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    textOverflow: getComputedStyle(node).textOverflow,
    whiteSpace: getComputedStyle(node).whiteSpace,
  }));
  expect(box.scrollWidth, 'a wrapped value must not overflow its own box').toBeLessThanOrEqual(box.clientWidth);
  expect(box.textOverflow, 'a wrapped value must not still be styled to ellipsis').not.toBe('ellipsis');
  expect(box.whiteSpace, 'a wrapped value must be allowed to break to a second line').not.toBe('nowrap');

  await captureAfter(page, 'wiring-diverged', 1440, 900);
  await captureAfter(page, 'wiring-diverged', 390, 844);
});

// ---------------------------------------------------------------------------
// (e) Phase 4 table stops repeating the identity row.
// ---------------------------------------------------------------------------
test('[U1e] the phase 4 summary drops Card and Project once setup is complete', async ({ page }) => {
  const spec = cardState('installed-match');
  await boot(page, spec, '/', p => seedReturningOwnerWithCompleteProject(p, spec));
  await waitConnectedUnaided(page, 'U1e connect');

  await expect(
    journeyLocator(page),
    'a card holding exactly the open project must read as setup-complete',
  ).toHaveAttribute('data-journey-complete', 'true', { timeout: CONNECT_BUDGET_MS });

  const summary = page.locator('.lw-setup-summary');
  await expect(summary, 'the phase 4 summary must still be showing').toBeVisible();
  await expect(summary.locator('dt', { hasText: 'Card' })).toHaveCount(0);
  await expect(summary.locator('dt', { hasText: 'Project' })).toHaveCount(0);
  await expect(summary.locator('dt', { hasText: 'Outputs' })).toHaveCount(1);
  await expect(summary.locator('dt', { hasText: 'Lights' })).toHaveCount(1);
  await expect(summary.locator('dt', { hasText: 'Color' })).toHaveCount(1);
  await expect(summary.locator('dt', { hasText: 'Power' })).toHaveCount(1);
});
