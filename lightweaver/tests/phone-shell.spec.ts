// The phone shell (src/styles/lw-phone.css): tab bar instead of the rail, the
// status line under the top bar, notices that never cover a control, and the
// card setup sheet filling the phone. Each phone check has a desktop twin so
// the desktop layout cannot regress. Plan: todo/plans/simpler-journeys.md,
// "Mobile UI/UX".
import { test, expect, type Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState } from './harness/cardStates';
import { guardRealCard } from './ux/journeyRecorder';
import { bootSetUp } from './ux/journeySeed';
import { findStrip, settleEndCheck, stopRunAt } from './ux/drivers';
import { MIN_TAP, DESKTOP_TAP } from './harness/tapSize';

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

const rect = (page: Page, selector: string) => page.locator(selector).first().evaluate(el => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right, vw: innerWidth, vh: innerHeight };
});

async function openInstalled(page: Page) {
  await bootSetUp(page);
  await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20_000 });
}

/** Every visible control whose centre is under a notice. */
function controlsUnderNotices(page: Page) {
  return page.evaluate(() => {
    const hits: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], input, select')) {
      if (el.closest('.lw-notice-layer')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight) continue;
      // A control scrolled out of its screen is clipped, not covered.
      const cy = r.y + r.height / 2;
      const screen = el.closest('.screen, .card-setup-overlay')?.getBoundingClientRect();
      if (screen && (cy < screen.top || cy > screen.bottom)) continue;
      const top = document.elementFromPoint(Math.min(innerWidth - 1, r.x + r.width / 2), Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2)));
      if (top?.closest('.lw-notice-layer')) hits.push((el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40));
    }
    return hits;
  });
}

async function publishWarning(page: Page) {
  await page.evaluate(async () => {
    const mod = await import('/src/lib/noticeLayer.js');
    mod.publishNotice({ tone: 'warning', title: 'Phone probe', body: 'A two-line warning that would once have sat on top of whatever was at the bottom of the screen.', testId: 'phone-probe-notice' });
  });
  await expect(page.getByTestId('phone-probe-notice')).toBeVisible();
  await page.waitForTimeout(400);
}

/** Text or controls off the phone scale: body text above 15px, titles above 17px. */
function offScale(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('.card-setup-overlay') || document.querySelector('.app > .screen');
    const out: string[] = [];
    for (const el of root!.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || el.closest('svg, canvas')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()) || el.matches('input, select, textarea');
      const title = /^H[1-3]$/.test(el.tagName);
      if ((own && !title && fs > 15) || (title && fs > 17)) out.push(`${el.tagName.toLowerCase()} ${fs}px: ${(el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 30)}`);
    }
    return out;
  });
}


/** Heights of the visible .btn controls on the current screen. */
function buttonHeights(page: Page) {
  return page.locator('.app > .screen .btn:visible').evaluateAll(all => all.map(b => Math.round(b.getBoundingClientRect().height)));
}

test.describe('phone 390', () => {
  test.use(PHONE);

  test('the rail is a tab bar along the bottom and the screen gets the full width', async ({ page }) => {
    await openInstalled(page);
    const rail = await rect(page, '.rail');
    expect(rail.bottom).toBeGreaterThanOrEqual(rail.vh - 1);
    expect(rail.w).toBeGreaterThanOrEqual(rail.vw - 1);
    expect(rail.h).toBeLessThan(80);
    const screen = await rect(page, '.app > .screen');
    expect(screen.x).toBe(0);
    expect(screen.w).toBeGreaterThanOrEqual(screen.vw - 1);
    expect(screen.bottom).toBeLessThanOrEqual(rail.y + 1);
    await expect(page.locator('.rail-workshop')).toBeHidden();
    for (const label of ['Card', 'Layout', 'Patterns', 'Lab', 'Playlist', 'Show']) {
      const tab = await rect(page, `.rail-item[aria-label="${label}"]`);
      expect(tab.h, label).toBeGreaterThanOrEqual(44);
      expect(tab.right, label).toBeLessThanOrEqual(tab.vw);
    }
    await page.locator('.rail-item[aria-label="Patterns"]').click();
    await expect(page).toHaveURL(/#screen=pattern/);
    await expect(page.locator('.rail-item[aria-label="Patterns"]')).toHaveAttribute('aria-current', 'page');
  });

  test('the footer is one status line under the top bar, build numbers still visible', async ({ page }) => {
    await openInstalled(page);
    const top = await rect(page, '.topbar');
    const bar = await rect(page, '.status-bar');
    expect(Math.abs(bar.y - top.bottom)).toBeLessThanOrEqual(1);
    expect(bar.h).toBeLessThanOrEqual(40);
    await expect(page.getByTestId('studio-freshness')).toBeVisible();
    await expect(page.getByTestId('footer-firmware-status')).toBeVisible();
    await expect(page.getByTestId('card-link-status')).toBeVisible();
    const overflow = await page.locator('.status-bar').evaluate(n => n.scrollWidth - n.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // Status, not boxes: the connection word has no filled background.
    const bg = await page.getByTestId('card-link-status').evaluate(n => getComputedStyle(n).backgroundColor);
    expect(bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });

  test('a notice sits above the tab bar and the screen ends where it begins', async ({ page }) => {
    await openInstalled(page);
    for (const screen of ['card&section=overview', 'pattern', 'playlist', 'layout']) {
      await page.evaluate(h => { location.hash = h; }, `#screen=${screen}`);
      await page.waitForTimeout(600);
      await publishWarning(page);
      const notice = await rect(page, '.lw-notice-layer');
      const rail = await rect(page, '.rail');
      expect(notice.bottom, screen).toBeLessThanOrEqual(rail.y);
      const body = await rect(page, '.app > .screen');
      expect(body.bottom, screen).toBeLessThanOrEqual(notice.y);
      expect(await controlsUnderNotices(page), screen).toEqual([]);
      await page.evaluate(async () => (await import('/src/lib/noticeLayer.js')).resetNotices());
      await expect(page.getByTestId('notice-layer')).toHaveCount(0);
      // The ground is given back when the notice goes.
      const after = await rect(page, '.app > .screen');
      expect(after.bottom, screen).toBeGreaterThan(body.bottom);
    }
  });

  test('the card setup sheet fills the phone and a notice never covers its step', async ({ page }) => {
    test.setTimeout(90_000);
    await guardRealCard(page);
    const card = createCardSimulator(cardState('factory-blank'));
    await card.install(page);
    await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Connect this card', exact: true }).click({ timeout: 45_000 });
    await page.getByTestId('setup-lights-action').click({ timeout: 20_000 });
    await expect(page.locator('.card-setup-overlay')).toBeVisible();
    // Let the entry slide settle before measuring where the sheet rests.
    await expect.poll(async () => (await rect(page, '.card-setup-overlay')).y).toBeLessThan(0.5);
    const sheet = await rect(page, '.card-setup-overlay');
    expect(sheet.x).toBe(0);
    expect(sheet.w).toBeGreaterThanOrEqual(sheet.vw - 1);
    const foot = await rect(page, '.card-setup-overlay-foot');
    expect(foot.h).toBeLessThanOrEqual(100);
    await publishWarning(page);
    const notice = await rect(page, '.lw-notice-layer');
    const covered = await rect(page, '.card-setup-overlay');
    expect(covered.bottom).toBeLessThanOrEqual(notice.y);
    expect(await controlsUnderNotices(page)).toEqual([]);
  });
});

test.describe('phone 390, one scale', () => {
  test.use(PHONE);

  test('no text on Card Home, Patterns, Playlist or Layout is off the phone scale', async ({ page }) => {
    await openInstalled(page);
    await page.locator('.app > .screen details').evaluateAll(all => all.forEach(d => { (d as HTMLDetailsElement).open = true; }));
    expect(await offScale(page), 'card home').toEqual([]);
    for (const screen of ['pattern', 'playlist', 'layout']) {
      await page.evaluate(h => { location.hash = h; }, `#screen=${screen}`);
      await page.waitForTimeout(600);
      expect(await offScale(page), screen).toEqual([]);
    }
  });

  test('buttons are 36px tall, not the 44px desktop size', async ({ page }) => {
    await openInstalled(page);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lw-tap').trim())).toBe(`${MIN_TAP}px`);
    const heights = await buttonHeights(page);
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) expect(h).toBeLessThan(DESKTOP_TAP);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(MIN_TAP);
  });

  test('the LED count box is the same scale as the text around it', async ({ page }) => {
    test.setTimeout(90_000);
    await guardRealCard(page);
    const card = createCardSimulator(cardState('factory-blank'));
    await card.install(page);
    await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Connect this card', exact: true }).click({ timeout: 45_000 });
    await page.getByTestId('setup-lights-action').click({ timeout: 20_000 });
    await page.getByTestId('discovery-probe-18').click({ timeout: 20_000 });
    await page.getByTestId('discovery-start').click();
    await expect(page.getByTestId('discovery-color-proof')).toBeVisible({ timeout: 20_000 });
    // Colour rows and the end check's − / + follow the phone scale Adrian chose
    // (36 px, harness/tapSize MIN_TAP): big enough to tap, not oversized.
    const row = page.getByTestId('discovery-colour-row-rgb');
    const rowBox = (await row.boundingBox())!;
    expect(rowBox.height).toBeGreaterThanOrEqual(MIN_TAP);
    expect(rowBox.height).toBeLessThanOrEqual(DESKTOP_TAP);
    expect(await offScale(page)).toEqual([]);
    await row.click();
    await stopRunAt(page, 41);
    const minusBox = (await page.getByTestId('discovery-end-minus').boundingBox())!;
    expect(minusBox.height).toBeGreaterThanOrEqual(MIN_TAP);
    expect(minusBox.height).toBeLessThanOrEqual(DESKTOP_TAP);
    expect(await offScale(page)).toEqual([]);
  });
});

test.describe('desktop 1280 is unchanged', () => {
  test.use(DESKTOP);

  test('rail on the left, footer at the bottom, notices beside the rail', async ({ page }) => {
    await openInstalled(page);
    const rail = await rect(page, '.rail');
    expect(rail.x).toBe(0);
    expect(rail.w).toBeLessThan(80);
    expect(rail.h).toBeGreaterThan(rail.vh / 2);
    await expect(page.locator('.rail-workshop')).toBeVisible();
    // Only the phone sheet lowers the tap size; desktop and touch tablets keep 44px.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lw-tap').trim())).toBe('');
    const bar = await rect(page, '.status-bar');
    expect(bar.bottom).toBeGreaterThanOrEqual(bar.vh - 1);
    await publishWarning(page);
    const notice = await rect(page, '.lw-notice-layer');
    expect(notice.x).toBeGreaterThanOrEqual(rail.right);
    expect(notice.bottom).toBeLessThanOrEqual(bar.y);
    // Desktop gives up no ground for a notice.
    const screen = await rect(page, '.app > .screen');
    expect(screen.bottom).toBeGreaterThanOrEqual(bar.y - 1);
  });

  test('the card setup sheet stays a centred dialog', async ({ page }) => {
    test.setTimeout(90_000);
    await guardRealCard(page);
    const card = createCardSimulator(cardState('factory-blank'));
    await card.install(page);
    await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Connect this card', exact: true }).click({ timeout: 45_000 });
    await page.getByTestId('setup-lights-action').click({ timeout: 20_000 });
    const sheet = await rect(page, '.card-setup-overlay');
    expect(sheet.x).toBeGreaterThan(0);
    expect(sheet.w).toBeLessThanOrEqual(700);
  });
});
