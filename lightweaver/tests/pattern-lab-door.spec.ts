import { test, expect } from '@playwright/test';
import { openControls } from './helpers/pattern-lab';

// Door both ways: Patterns → Lab with the selected look, and Use in Project
// returns to Patterns. See
// docs/superpowers/plans/2026-08-27-pattern-sampling-join.md Phase 3.

test('Sculpt in Lab opens Lab on the Patterns selection', async ({ page }) => {
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await page.locator('.pmcard[data-pattern-id="plasma"]').click();
  const selectedName = 'My plasma evening';
  await page.getByTestId('look-name').fill(selectedName);
  await page.getByTestId('open-pattern-lab').click();
  await expect(page).toHaveURL(/screen=pattern-lab/);
  await expect(page.getByTestId('pattern-lab-draft-name')).toHaveValue(selectedName);
});

test('Use in Project on a native look returns to Patterns', async ({ page }) => {
  await page.goto('/#screen=pattern-lab&patternId=aurora', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('pattern-lab-draft-name')).toHaveValue('Aurora');
  await openControls(page);
  await expect(page.getByTestId('pattern-lab-compat-badge')).toHaveAttribute(
    'data-classification',
    'live-on-card',
  );
  await page.getByTestId('pattern-lab-use-in-project-promoted').getByRole('button', { name: 'Use in Project' }).click();
  await expect(page).toHaveURL(/screen=pattern(?:&|$)/);
  await expect(page.getByTestId('pattern-preview-meta')).toContainText(/Aurora/i);
});
