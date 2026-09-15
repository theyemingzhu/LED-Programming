import { test, expect } from './studioTest';
import { openControls } from './helpers/pattern-lab';

// These browser journeys are deliberately offline. Native card capability and
// interrupted transaction behavior are exercised by the focused transport tests.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.addInitScript(() => {
    if (localStorage.getItem('lw_autosave_v3')) return;
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3, id: 'native-journey-browser', name: 'Journey software fixture',
      layout: {
        starterPending: false, svgText: '', viewBox: '0 0 240 200',
        strips: [{ id: 'art', name: 'Artwork', pathData: 'M 20 20 L 200 60 L 100 180', pixelCount: 16, color: '#d99865', x: 0, y: 0 }],
        wiring: {
          version: 1, locked: true, verified: true,
          outputs: [{ id: 'out', name: 'Out', pin: 18, runIds: ['art-run'] }],
          runs: [{ id: 'art-run', type: 'strip', verified: true, source: { stripId: 'art', from: 0, to: 15 }, physicalDirection: 'source-reverse' }],
        },
      },
    }));
  });
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await openControls(page);
  await page.getByRole('button', { name: 'Slow color drift', exact: true }).click();
});

test('a journey exposes a truthful standalone handoff while keeping browser save available', async ({ page }) => {
  await expect(page.getByTestId('color-journey-ribbon')).toBeVisible();
  const handoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  await expect(handoff).toBeVisible();
  await expect(handoff).toContainText(/card|project/i);
  await page.getByRole('button', { name: 'Keep this look', exact: true }).click();
  await expect(page.getByTestId('color-journey-save-state')).toContainText(/saved/i);
});

test('phone standalone handoff is readable and does not overflow the composer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openControls(page);
  const handoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  await expect(handoff).toBeVisible();
  await handoff.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const box = await handoff.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
});

test('timing controls preserve one-shot and interpolation choices after reload', async ({ page }) => {
  await page.getByText('Journey timing', { exact: true }).click();
  await page.getByLabel('Interpolation', { exact: true }).selectOption('linear');
  await page.getByLabel('Loop journey', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Keep this look', exact: true }).click();
  await expect(page.getByTestId('color-journey-save-state')).toContainText(/saved/i);
  await page.reload();
  await openControls(page);
  await page.getByText('Journey timing', { exact: true }).click();
  await expect(page.getByLabel('Interpolation', { exact: true })).toHaveValue('linear');
  await expect(page.getByLabel('Loop journey', { exact: true })).not.toBeChecked();
  await expect(page.locator('.plab-journey-details')).toContainText(/first color/i);
});


test('a supported mapped journey enters the project with its authored timing intact', async ({ page }) => {
  const handoff = page.getByTestId('pattern-lab-use-in-project-promoted');
  await expect(page.getByTestId('pattern-lab-verdict')).toHaveAttribute('data-classification', 'live-on-card');
  await handoff.getByRole('button', { name: 'Use in Project', exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices?.standaloneController?.looks?.some((look: any) =>
      look.patternLabRecipe?.base?.kind === 'color-journey'
        && look.patternLabRecipe.journey.stops.length === 3);
  })).toBe(true);
  const savedJourney = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices.standaloneController.looks.find((look: any) => look.patternLabRecipe?.base?.kind === 'color-journey');
  });
  await page.goto('/#screen=patterns');
  await page.locator(`button[data-pattern-id="${savedJourney.id}"]`).click();
  await expect(page.getByTestId('look-save-preset')).toHaveText('Open Color Journey in Lab');
  await page.getByTestId('look-save-as-new').click();
  await expect(page).toHaveURL(/screen=pattern-lab/);
  await openControls(page);
  await expect(page.getByTestId('color-journey-ribbon')).toBeVisible();
  expect(await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices.standaloneController.looks.length;
  })).toBe(1);
});
