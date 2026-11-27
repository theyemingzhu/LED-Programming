// Measure: change and then delete a saved look ("project stack") on Patterns.
import { test, expect } from '@playwright/test';
import { recordJourney, WIDTHS } from './journeyRecorder';
import { bootSetUp } from './journeySeed';

// Measurement only: never part of a normal or CI run (todo/plans/simpler-journeys.md).
test.skip(!process.env.LW_UX_OUT, 'set LW_UX_OUT to measure owner journeys');

// A project that already holds one saved look, as the owner would after saving one earlier.
const SEED_LOOK = `project.devices.standaloneController.looks = [{
  id: 'calm-stack', label: 'Calm stack', sectionSnapshotVersion: 1, defaultLook: { patternId: 'aurora' },
  sectionLooks: { 'patch-default-outer-circle': { patternId: 'aurora' }, 'patch-default-inner-circle': { patternId: 'ocean' } },
}]; project.devices.standaloneController.activeLookId = '';`;

for (const vp of WIDTHS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });

    test(`edit then delete a saved look @${vp.width}`, async ({ page }) => {
      test.setTimeout(240_000);
      await bootSetUp(page, SEED_LOOK);
      const j = recordJourney(page, 'edit-delete-look', vp.width);
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        await j.land('opens led.mandalacodes.com (remembered card, one saved look "Calm stack")');
        await j.press(page.getByRole('link', { name: /^patterns$/i }).or(page.getByRole('button', { name: /^patterns$/i })).first(), 'Patterns tab');
        await page.waitForTimeout(1500);
        await j.press(page.getByRole('tab', { name: /Project stacks/ }), 'Project stacks tab');
        await j.press(page.getByTestId('project-stack-card').getByRole('button', { name: 'Edit Calm stack', exact: true }), 'Edit Calm stack');
        await expect(page.getByTestId('stack-save-bar')).toBeVisible();
        // The tile grid is hidden while a stack is open; the Tune sliders beside it stay.
        await j.type(page.getByTestId('look-speed-slider'), '2', 'Change the look: Speed slider to 2x');
        j.note(`status after the change: ${(await page.getByTestId('look-save-status').textContent().catch(() => '?'))?.trim()}`);
        await j.press(page.getByTestId('look-save-preset'), 'Save changes');
        await page.waitForTimeout(600);
        j.note(`save status: ${(await page.getByTestId('look-save-status').textContent().catch(() => '?'))?.trim()}`);
        await j.press(page.getByTestId('look-delete'), 'Delete stack');
        await expect(page.getByTestId('look-delete-undo')).toBeVisible({ timeout: 8000 });
        await page.waitForTimeout(600);
        const left = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController.looks.length);
        j.note(`looks left in project after delete: ${left}`);
      } catch (error) {
        j.blocked(String(error).split('\n')[0].slice(0, 200));
      }
      await j.finish();
    });
  });
}
