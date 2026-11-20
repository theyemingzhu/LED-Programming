// Measure: rename the project from a connected, set-up, remembered card.
// A first-time client lands on Card Home. The status row's project name is
// read-only there ("On the card"), so the shortest paths are
//   A (rename): Review checks -> tap name -> type -> Enter  (stays on Card Home)
//   B (rename-layout): Layout tab -> tap crumb name -> type -> Enter
import { test, expect, type Page } from '@playwright/test';
import { recordJourney, WIDTHS } from './journeyRecorder';
import { bootSetUp } from './journeySeed';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

async function afterRename(page: Page, j: ReturnType<typeof recordJourney>, card: any) {
  await page.waitForTimeout(1500);
  await j.land('after rename committed');
  const bar = await page.evaluate(() => document.querySelector('[data-testid="project-name-edit"]')?.textContent || '');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').name);
  j.note(`autosave name now: ${stored}; topbar crumb: ${bar}`);
  j.note(`card POSTs after rename: ${JSON.stringify(card.requests.filter((r: any) => r.method === 'POST').map((r: any) => r.path))}`);
  const save = page.getByRole('button', { name: /save to card/i }).first();
  const vis = await save.isVisible().catch(() => false);
  j.note(`'Save to card' visible after rename: ${vis}`);
}

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    test(`rename via Review checks @${vp.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      const card = await bootSetUp(page); // guardRealCard first, then the simulator
      const j = recordJourney(page, 'rename', vp.width);
      try {
        await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20000 });
        await page.waitForTimeout(2500);
        await j.land('Card Home, connected, project name is read-only');
        await j.press(page.getByRole('button', { name: 'Review checks', exact: true }), 'Review checks (leaves installed-home so the name becomes editable)');
        await j.press(page.getByTestId('setup-project-name-edit'), 'Tap the project name');
        await j.type(page.getByTestId('setup-project-name-input'), 'Gallery north wall', 'Type new name');
        await page.getByTestId('setup-project-name-input').press('Enter');
        j.record.presses += 1; j.note('Enter key counted as one press');
        await afterRename(page, j, card);
        // Does the owner need to get the name onto the card? Press the offered Save to card and see.
        const save = page.getByRole('button', { name: 'Save to card', exact: true }).first();
        await j.press(save, 'Save to card (puts the new name on the card?)');
        await page.waitForTimeout(4000);
        await j.land('after Save to card');
        j.note(`card POSTs after Save to card: ${JSON.stringify(card.requests.filter((r: any) => r.method === 'POST').map((r: any) => r.path))}`);
        const extra = await page.locator('button:visible').allTextContents();
        j.note(`visible buttons after save: ${extra.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 400)}`);
      } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });

    test(`rename via Layout crumb @${vp.width}`, async ({ page }) => {
      test.setTimeout(120_000);
      const card = await bootSetUp(page);
      const j = recordJourney(page, 'rename-layout', vp.width);
      try {
        await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('card-installed-home')).toBeVisible({ timeout: 20000 });
        await page.waitForTimeout(2500);
        await j.land('Card Home, connected, project name is read-only');
        await j.press(page.getByRole('link', { name: /^layout$/i }).or(page.getByRole('button', { name: /^layout$/i })).first(), 'Layout tab');
        await j.press(page.getByTestId('project-name-edit'), 'Tap the project name in the top bar');
        await j.type(page.getByTestId('project-name-input'), 'Gallery north wall', 'Type new name');
        await page.getByTestId('project-name-input').press('Enter');
        j.record.presses += 1; j.note('Enter key counted as one press');
        await afterRename(page, j, card);
      } catch (error) { j.blocked(String(error).split('\n')[0].slice(0, 200)); }
      await j.finish();
    });
  });
}
