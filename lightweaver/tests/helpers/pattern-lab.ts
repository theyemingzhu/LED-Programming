import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Pattern Lab's control column (PatternLabControls.jsx — the tile browser,
// sliders, evolution and save steps, all rendered inside
// `#plab-controls-drawer`) collapses behind a modal bottom-sheet drawer at
// `max-width: 640px` (src/pattern-lab/pattern-lab.css `@media (max-width:
// 640px)`, mirrored exactly by the `useMobileDrawer()` matchMedia hook in
// PatternLabScreen.jsx — both read the same 640 number, so this constant is
// the single place a future breakpoint change needs to land in tests).
// Below that width the drawer starts closed: `aria-hidden="true"` and
// `inert` until the "Pattern controls" trigger is pressed. Every Playwright
// spec written before the Mobile Chrome project existed reaches straight
// into the control column — a slider, a tile, the search box — assuming a
// desktop two-pane layout where that content is always live. On a phone
// those locators exist in the DOM but are unqueryable while the drawer is
// shut, so every one of those specs failed shut rather than failed loud.
//
// The fix is not "add a beforeEach that quietly opens the drawer" — a
// reader of a failing test should be able to see, in the test body, that the
// drawer had to be opened to reach what it's asserting on. So this module
// exports one explicit action, `openControls`, that specs call themselves.
// It is a genuine no-op above the breakpoint (desktop chromium never touches
// the drawer machinery) and idempotent on mobile (safe to call even if the
// drawer is already open), so ONE spec body drives both Playwright projects
// unmodified — the goal stated in the mobile-readiness brief.
export const PATTERN_LAB_MOBILE_BREAKPOINT = 640;

export async function isMobileDrawerViewport(page: Page): Promise<boolean> {
  const viewport = page.viewportSize();
  const width = viewport ? viewport.width : await page.evaluate(() => window.innerWidth);
  return width <= PATTERN_LAB_MOBILE_BREAKPOINT;
}

export function controlsDrawer(page: Page): Locator {
  return page.locator('#plab-controls-drawer');
}

export function drawerTrigger(page: Page): Locator {
  return page.getByRole('button', { name: 'Pattern controls', exact: true });
}

export function drawerCloseButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Close pattern controls' });
}

// No-op on desktop. On a mobile-width page, opens the controls drawer if it
// is not already open and waits for the drawer to report itself live
// (aria-hidden removed) before returning — so a spec that calls this and
// then immediately queries inside the drawer never races the CSS
// transform/visibility transition in `@media (max-width: 640px)
// .plab-controls.drawer-open`.
export async function openControls(page: Page): Promise<void> {
  if (!(await isMobileDrawerViewport(page))) return;
  const drawer = controlsDrawer(page);
  // Autoload peeks the sheet. A single click can land while that transition
  // still owns the trigger, so ask until the drawer is actually live.
  await expect(async () => {
    if ((await drawer.getAttribute('aria-hidden')) === 'true') {
      await drawerTrigger(page).click();
    }
    await expect(drawer).not.toHaveAttribute('aria-hidden', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

// No-op on desktop (the drawer concept does not exist there). On mobile,
// closes the drawer if open. Specs need this far less often than
// openControls — mostly to assert on what the closed-drawer state (the
// preview, the trigger button) looks like after a control was set.
export async function closeControls(page: Page): Promise<void> {
  if (!(await isMobileDrawerViewport(page))) return;
  const drawer = controlsDrawer(page);
  if ((await drawer.getAttribute('aria-hidden')) === 'true') return;
  await drawerCloseButton(page).click();
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
}

// Pattern Lab's "Choose" step used to be a native <select> plus the new tile
// grid shown side by side — kept only so ~22 Playwright specs could keep
// driving `getByLabel('Base pattern').selectOption(...)`. That duplicated the
// picker on screen for real owners, so the select was removed
// (see todo/plans/patternlab-rebuild.md §7 Phase 1 consolidation). Every spec
// that used to drive the select now goes through this helper instead, which
// clicks the matching tile in PatternTileBrowser.jsx by its stable
// `data-pattern-id` attribute.
export function patternTile(page: Page, patternId: string): Locator {
  return page.locator(`[data-testid="pattern-lab-tile"][data-pattern-id="${patternId}"]`);
}

// The tile grid lives inside the controls drawer (`#plab-pattern-select` is
// nested in `#plab-controls-drawer`), so choosing a pattern is drawer-gated
// content on mobile exactly like every slider next to it. openControls()
// makes this call identical on both Playwright projects.
// Pick a pattern AND get to work on it. Since the inspector became a ladder,
// only the open step renders its controls, and choosing a pattern deliberately
// leaves the band on Choose — so every flow that goes on to move a slider has
// to open Sculpt, which is the click an owner makes too. Doing it here rather
// than in ten specs keeps the intent ("start sculpting Aurora") in one place.
// A spec that cares about where the band sits immediately after picking should
// call pickPatternTile instead.
export async function choosePattern(page: Page, patternId: string): Promise<void> {
  await pickPatternTile(page, patternId);
  await openStep(page, 'sculpt');
}

// Just the pick, with no opinion about which step is open afterwards. Choose
// is opened first because the tile grid IS Choose's body — once you are in
// Sculpt it is collapsed, so switching to another pattern mid-flow means
// going back to Choose, exactly as an owner does.
export async function pickPatternTile(page: Page, patternId: string): Promise<void> {
  await openControls(page);
  await openStep(page, 'choose');
  await patternTile(page, patternId).click();
}

export function patternSearchInput(page: Page): Locator {
  return page.getByLabel('Search patterns');
}

export function selectedPatternTile(page: Page): Locator {
  return page.locator('[data-testid="pattern-lab-tile"][aria-pressed="true"]');
}

// CSS `@media (hover: hover)` is what actually gates Pattern Lab's
// `[data-tooltip]` hover reveal (src/v3/v3-styles.css) — real touchscreens
// have no persistent hover, and Playwright's Mobile Chrome project emulates
// that honestly (hasTouch: true), so `locator.hover()` does not produce the
// hover-visible tooltip state there. That is not a test bug to work around;
// it is the same reason a real phone owner never sees these tooltips by
// touch. Specs that assert hover-revealed tooltip copy should check this
// first and assert the capability-appropriate behaviour instead of assuming
// desktop's mouse exists everywhere.
export async function supportsHover(page: Page): Promise<boolean> {
  return page.evaluate(() => window.matchMedia('(hover: hover)').matches);
}

// The document-level `document.documentElement.scrollWidth - innerWidth`
// check every destination test already runs is not sufficient for Pattern
// Lab: a live session found 36px of horizontal overflow inside `.plab-scroll`
// (the screen's own scroll container, which owns its own overflow rather
// than the document's) while the document-level number stayed clean and the
// screen title clipped off-screen. Call this in addition to, never instead
// of, the document-level check.
export async function innerScrollOverflow(page: Page, selector = '.plab-scroll'): Promise<number> {
  return page.locator(selector).evaluate(element => element.scrollWidth - element.clientWidth);
}

// The global Studio footer (`<footer class="status-bar">` in src/v3/app.jsx)
// renders the card link, offline-update chip (`[data-testid=
// "offline-update-status"]`) and firmware chip (`[data-testid=
// "footer-firmware-status"]`) on every screen including Pattern Lab. At
// narrow widths it switches from flexbox to CSS grid with named
// `grid-area`s (src/v3/v3-styles.css `@media (max-width: 640px)
// .status-bar`); a live session found the offline and firmware chips
// assigned the same grid cell, painting on top of each other. Two elements
// can occupy the same rectangle honestly (a decorative icon inside its own
// label, for instance) — the meaningful check is whether two *separately
// meaningful* status chips overlap, so this only compares elements that
// carry their own accessible name/role, not every DOM node in the bar.
export async function overlappingStatusBarChips(page: Page): Promise<Array<[string, string]>> {
  const bar = page.locator('.status-bar');
  if ((await bar.count()) === 0) return [];
  const chips = bar.locator('[data-testid]');
  const count = await chips.count();
  const boxes: Array<{ testId: string; box: { x: number; y: number; width: number; height: number } }> = [];
  for (let index = 0; index < count; index += 1) {
    const chip = chips.nth(index);
    if (!(await chip.isVisible())) continue;
    const box = await chip.boundingBox();
    const testId = await chip.getAttribute('data-testid');
    if (box && testId && box.width > 0 && box.height > 0) boxes.push({ testId, box });
  }
  const overlaps: Array<[string, string]> = [];
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const boxA = boxes[a].box;
      const boxB = boxes[b].box;
      const overlapsX = boxA.x < boxB.x + boxB.width && boxB.x < boxA.x + boxA.width;
      const overlapsY = boxA.y < boxB.y + boxB.height && boxB.y < boxA.y + boxA.height;
      if (overlapsX && overlapsY) overlaps.push([boxes[a].testId, boxes[b].testId]);
    }
  }
  return overlaps;
}

// Workspace convention: primary touch controls must be >=44px in the
// dimension a thumb has to hit. Pass every locator that is a primary control
// at the current viewport; returns the ones that fall short so a failure
// message names the offender instead of a bare boolean.
export async function touchTargetShortfalls(
  page: Page,
  locators: Locator[],
  minimum = 44,
): Promise<Array<{ label: string; width: number; height: number }>> {
  const shortfalls: Array<{ label: string; width: number; height: number }> = [];
  for (const locator of locators) {
    if (!(await locator.isVisible())) continue;
    const box = await locator.boundingBox();
    if (!box) continue;
    if (box.width < minimum || box.height < minimum) {
      const label = (await locator.getAttribute('aria-label'))
        || (await locator.textContent())?.trim()
        || (await locator.evaluate(element => element.outerHTML.slice(0, 80)));
      shortfalls.push({ label: label || '(unlabeled)', width: box.width, height: box.height });
    }
  }
  return shortfalls;
}

// The inspector is a ladder: only the open step renders its controls, so a
// flow that goes on to touch Sculpt's sliders or Evolve's fields has to open
// that step first — the same click an owner makes. Before the ladder every
// step was open at once and this was unnecessary; a spec that skips it now
// waits sixty seconds for a control that is deliberately not on screen.
export async function openStep(page: Page, name: 'choose' | 'sculpt' | 'evolve' | 'save'): Promise<void> {
  await page.getByTestId(`pattern-lab-step-${name}`).locator('.plab-step-open').click();
  await expect(page.getByTestId(`pattern-lab-step-${name}`)).toHaveAttribute('data-active', 'true');
}
