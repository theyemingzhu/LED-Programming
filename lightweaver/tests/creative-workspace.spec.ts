import { test, expect } from './studioTest';
import { mkdirSync } from 'node:fs';

const SCREEN_DIR = '../.claude/ux-screens/creative-workspace';
mkdirSync(SCREEN_DIR, { recursive: true });

test('Patterns keeps the piece and section context together while browsing and tuning', async ({ page }) => {
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });

  const instrument = page.getByTestId('pattern-instrument');
  const preview = page.getByTestId('pattern-piece-preview');
  const target = instrument.locator('.pm-target');
  await expect(preview).toBeVisible();
  await expect(target).toBeVisible();
  await expect(target).toContainText('Pixels driven');
  await expect(page.getByTestId('look-save-preset')).toHaveText('Keep this look');
  const previewSelect = await page.getByLabel('Preview target').boundingBox();
  expect(previewSelect!.width).toBeGreaterThanOrEqual(120);
  await page.screenshot({ path: `${SCREEN_DIR}/desktop-patterns.png` });

  await page.locator('.pm-cards').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.getByTestId('look-brightness-slider').scrollIntoViewIfNeeded();
  const [previewBox, targetBox] = await Promise.all([preview.boundingBox(), target.boundingBox()]);
  expect(previewBox && targetBox).toBeTruthy();
  expect(previewBox!.y).toBeGreaterThanOrEqual(0);
  expect(previewBox!.y + previewBox!.height).toBeLessThanOrEqual(900);
  expect(targetBox!.y).toBeGreaterThanOrEqual(previewBox!.y);
  expect(targetBox!.y).toBeLessThan(900);
  const sliderReachable = await page.getByTestId('look-brightness-slider').evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === element;
  });
  expect(sliderReachable).toBe(true);
  await page.screenshot({ path: `${SCREEN_DIR}/desktop-tuning.png` });
});

test('phone browsing keeps the preview useful and Lab offers a visible way back', async ({ page }) => {
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });

  const preview = page.getByTestId('pattern-piece-preview');
  const bank = page.locator('.pm-browse');
  const tune = page.locator('.pm-tune-pane');
  const [previewBox, bankBox, tuneBox] = await Promise.all([
    preview.boundingBox(), bank.boundingBox(), tune.boundingBox(),
  ]);
  expect(previewBox!.height).toBeGreaterThanOrEqual(150);
  expect(bankBox!.y).toBeLessThan(tuneBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SCREEN_DIR}/phone-patterns.png` });

  await page.getByTestId('open-pattern-lab').click();
  await expect(page.getByTestId('pattern-lab-screen')).toBeVisible();
  await expect(page.getByTestId('pattern-lab-back')).toBeVisible();
  await expect(page.getByTestId('pattern-lab-screen')).toHaveAttribute('data-sheet-detent', 'peek');
  const labStage = await page.locator('.plab-stage').boundingBox();
  expect(labStage!.height).toBeGreaterThanOrEqual(120);
  await page.screenshot({ path: `${SCREEN_DIR}/phone-lab.png` });
  await page.getByTestId('pattern-lab-back').click();
  await expect(page.getByTestId('pattern-piece-preview')).toBeVisible();
});

test('short desktop inspector can scroll its full tuning controls into reach', async ({ page }) => {
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });

  const keep = page.getByTestId('look-save-preset');
  const brightness = page.getByTestId('look-brightness-slider');
  await keep.scrollIntoViewIfNeeded();
  await brightness.scrollIntoViewIfNeeded();
  const controls = [keep, page.getByTestId('look-name'), brightness,
    page.locator('.slider-row').filter({ has: brightness }).locator('.lab')];
  for (const [index, control] of controls.entries()) {
    const reachability = await control.evaluate(element => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { top: box.top, bottom: box.bottom, hit: element.contains(hit), hitClass: hit?.className };
    });
    expect(reachability.top >= 0 && reachability.bottom <= 692 && reachability.hit,
      `control ${index}: ${JSON.stringify(reachability)}`).toBe(true);
  }
  await page.screenshot({ path: `${SCREEN_DIR}/compact-desktop-tuning.png` });
});
