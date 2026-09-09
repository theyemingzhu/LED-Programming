// F39 — "if I have a version open and then I do another version open and it
// sometimes causes problems in between everything." Two rules:
//   1. A superseded tab reloads itself the moment it is idle (no card
//      operation, no dialog, no edit in progress) — never mid-write.
//   2. Only one Studio tab is active per browser; a second tab shows a quiet
//      notice and sends no card requests until it takes over.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';

// Mirrors tests/footer-build-status.spec.ts's marker/graph helpers — kept
// local rather than imported, per this ticket's file boundary (one new spec,
// nothing shared extracted).
const studioRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const studioBuild = Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim());

function currentStudioMarker() {
  return {
    schemaVersion: 1,
    sourceRevision: studioRevision,
    buildId: studioRevision.slice(0, 12),
    buildNumber: studioBuild,
  };
}

function studioBuildGraph(marker: ReturnType<typeof currentStudioMarker>) {
  const markerText = `${JSON.stringify(marker)}\n`;
  return {
    schemaVersion: 1,
    files: [
      { path: 'assets/one-studio-ready.js', bytes: 1, sha256: '1'.repeat(64) },
      { path: 'index.html', bytes: 1, sha256: '2'.repeat(64) },
      { path: 'studio-release.json', bytes: Buffer.byteLength(markerText), sha256: createHash('sha256').update(markerText).digest('hex') },
    ],
  };
}

async function installReleaseRoutes(page: Page, marker: ReturnType<typeof currentStudioMarker>) {
  // The route handler reads `marker` at fulfill time, not at route-install
  // time — mutating the object after load is how a test bumps the "live"
  // release out from under an already-open tab.
  await page.route('**/studio-release.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: `${JSON.stringify(marker)}\n`,
  }));
  await page.route('**/studio-build-graph.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: `${JSON.stringify(studioBuildGraph(marker))}\n`,
  }));
  await page.route('**/assets/one-studio-ready.js', route => route.fulfill({ status: 200, body: 'x' }));
}

const CONNECTED = /^connected-(direct|bridge)$/;

async function linkState(page: Page) {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

async function settlesConnected(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (CONNECTED.test(await linkState(page))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

// Mirrors tests/card-home-checks.spec.ts's connectRealCard: at most one
// click, on whichever connect affordance the screen offers.
async function openConnectedStudio(page: Page, card: ReturnType<typeof createCardSimulator>, marker: ReturnType<typeof currentStudioMarker>) {
  await installReleaseRoutes(page, marker);
  await card.install(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  if (!(await settlesConnected(page, 15_000))) {
    const setupConnect = page.getByTestId('setup-connect-card');
    const footerChip = page.getByTestId('card-link-status');
    const target = (await setupConnect.count()) ? setupConnect : footerChip;
    if (await target.count()) {
      await target.first().click();
      await expect.poll(() => linkState(page), { timeout: 15_000, intervals: [250] }).toMatch(CONNECTED);
    }
  }
}

async function markWindow(page: Page) {
  await page.evaluate(() => { (window as any).__f39Present = true; });
}

async function windowMarkerGone(page: Page) {
  return !(await page.evaluate(() => (window as any).__f39Present === true));
}

function bumpMarker(marker: ReturnType<typeof currentStudioMarker>) {
  // Must stay exactly 40 lowercase hex characters — see studioRelease.js's
  // SOURCE_REVISION validation. A mismatched length parses as 'invalid' and
  // the monitor never reaches 'update-ready', which reads as "no reload"
  // for an unrelated reason.
  const nextRevision = studioRevision.slice(0, 33) + 'f39beef';
  Object.assign(marker, {
    sourceRevision: nextRevision,
    buildId: nextRevision.slice(0, 12),
    buildNumber: studioBuild + 1,
  });
}

// The dev server this suite runs against never actually rebuilds — a real
// deploy would make the reloaded page EMBED the bumped build, but here the
// reloaded page still embeds `studioBuild`. Once the reload is proven (the
// window marker is gone), settle the route back to what the page actually
// runs, the way a real deploy settling to a matching release would: this is
// what proves the tab recovers to a clean 'current' state afterward rather
// than looping (the same sessionStorage reload-loop guard that protects a
// real broken deploy would otherwise fire here too).
function settleMarker(marker: ReturnType<typeof currentStudioMarker>) {
  Object.assign(marker, currentStudioMarker());
}

test.describe('F39 — one Studio at a time', () => {
  test('[F39-supersede] a superseded tab reloads itself within 15s when idle', async ({ page }) => {
    const marker = currentStudioMarker();
    const card = createCardSimulator(cardState('installed-match'));
    await openConnectedStudio(page, card, marker);

    await markWindow(page);
    bumpMarker(marker);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await expect.poll(() => windowMarkerGone(page), { timeout: 15_000, intervals: [300] }).toBe(true);
    settleMarker(marker);
    await expect(page.getByTestId('studio-freshness')).toHaveClass(/is-current/, { timeout: 15_000 });
    await expect(page.getByTestId('studio-freshness')).toContainText(`Studio ${studioBuild}`);
  });

  test('[F39-supersede-waits] a tab mid card-write never reloads until the write finishes', async ({ page }) => {
    const marker = currentStudioMarker();
    const card = createCardSimulator(cardState('blackout'));
    await openConnectedStudio(page, card, marker);

    const releaseReply = card.holdNextReply('/api/control');
    await page.getByTestId('card-link-status').click();
    await expect(page.getByTestId('card-link-status')).toContainText('Sending…');

    await markWindow(page);
    bumpMarker(marker);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    // The held write keeps a hardware operation in flight the whole time —
    // no reload while it is pending, however long the idle-watch retries.
    await page.waitForTimeout(4_000);
    expect(await windowMarkerGone(page)).toBe(false);

    releaseReply();

    await expect.poll(() => windowMarkerGone(page), { timeout: 15_000, intervals: [300] }).toBe(true);
    settleMarker(marker);
    await expect(page.getByTestId('studio-freshness')).toHaveClass(/is-current/, { timeout: 15_000 });
    await expect(page.getByTestId('studio-freshness')).toContainText(`Studio ${studioBuild}`);
  });

  test('[F39-second-tab] a second tab is quiet and sends no card requests until it takes over', async ({ page, context }) => {
    const marker = currentStudioMarker();
    const card = createCardSimulator(cardState('installed-match'));
    await openConnectedStudio(page, card, marker);

    // A second, independent simulator installed only on the second tab: the
    // first tab keeps polling its own card the whole time (expected — it is
    // still active), so proving "the QUIET tab sends nothing" needs traffic
    // counted separately from the active tab's normal polling.
    const quietCard = createCardSimulator(cardState('installed-match'));
    const page2 = await context.newPage();
    await installReleaseRoutes(page2, marker);
    await quietCard.install(page2);
    await page2.goto('/', { waitUntil: 'domcontentloaded' });

    const notice = page2.getByTestId('studio-tab-notice');
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText('Studio is open in another tab.');

    await page2.waitForTimeout(10_000);
    expect(quietCard.requests.length).toBe(0);

    await page2.getByRole('button', { name: 'Use this tab' }).click();

    await expect(notice).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => quietCard.requests.length, { timeout: 15_000, intervals: [300] }).toBeGreaterThan(0);

    await expect(page.getByTestId('studio-tab-notice')).toContainText('Studio moved to another tab.', { timeout: 15_000 });
  });
});
