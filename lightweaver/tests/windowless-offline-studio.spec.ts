import { expect, test } from '@playwright/test';

test('simulated installed browser cold-reloads the complete Studio with the network offline', async ({ page, context }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => fetch('/sw.js', { cache: 'no-store' }).then(response => response.status))).toBe(200);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller != null)).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.locator('body')).toContainText(/Lightweaver|Project|Patterns/i);
});

// C2 — a card-local Studio tab that already has a project saved (the normal
// state of the deployed card page's own tab, not a fresh visit) must keep
// working offline instead of restarting onboarding. `lw_autosave_v3` is the
// exact key/shape ProjectContext.jsx reads at boot (see the 'other-project-
// open' fixture in journey-continuity.spec.ts, same shape here). The bare
// root's own bootstrap (studioRoute.js FIRST_RUN_CARD_SECTION) always forces
// `#screen=card&section=setup` on an empty hash regardless of whether a
// project already exists — a separate, pre-existing routing question outside
// this ticket — so this reaches the working screen the way a returning
// owner's bookmarked/cached tab actually does: with a hash already in the
// URL.
test('offline entry with a project already saved keeps controls usable and does not restart setup', async ({ page, context }) => {
  await page.addInitScript(() => {
    // `strip.pixels` must be the per-pixel geometry array (src/lib/stripPixels.js,
    // src/lib/previewVisuals.js), not the numeric count — journey-continuity.spec.ts's
    // 'other-project-open' fixture gets away with `pixels: 60` because it only
    // ever exercises Setup's adoption check, never the Patterns preview memo
    // this deep link renders. A bare pixel count there throws
    // `(a.pixels || []).map is not a function` inside that memo.
    const pixels = Array.from({ length: 60 }, (_, index) => ({ x: index, y: 0 }));
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3,
      id: 'lwproj-offline-entry',
      name: 'Offline entry project',
      portRoles: [{ pin: 21, role: 'strip', pixelCount: 60, controlKind: '' }],
      layout: { starterPending: false, strips: [{ id: 'strip-a', pixels, pixelCount: 60, pin: 21 }] },
    }));
  });

  await page.goto('/');
  await expect.poll(() => page.evaluate(() => fetch('/sw.js', { cache: 'no-store' }).then(response => response.status))).toBe(200);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller != null)).toBe(true);

  await context.setOffline(true);
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#root')).not.toBeEmpty();
  // No crash to the recovery boundary (app.jsx's screen error boundary).
  await expect(page.getByTestId('screen-error-fallback')).toHaveCount(0);
  // No setup restart: the ladder (lw-setup.jsx's `[data-testid="setup-journey"]`,
  // only rendered for `section=setup`) never appears on this deep link.
  await expect(page.getByTestId('setup-journey')).toHaveCount(0);
  // Controls stay usable: the pattern catalog renders and is interactive
  // (tapping merely explains that it could not reach a card while offline —
  // see lw-pattern.jsx's `pattern-gate-notice` — rather than being hidden or
  // disabled outright).
  const firstTile = page.locator('.pm-cards .pmcard').first();
  await expect(firstTile).toBeVisible();
  await expect(firstTile).toBeEnabled();
});
