import { test, expect } from '@playwright/test';

// Pattern Lab auto-loads the project look (or a hash patternId) so the owner
// does not start over on an empty sculpture. See
// docs/superpowers/plans/2026-08-27-pattern-sampling-join.md Phase 2.

function nameField(page: import('@playwright/test').Page) {
  return page.getByTestId('pattern-lab-draft-name');
}

test('default project opens Lab on the current look, not the empty sculpture', async ({ page }) => {
  await page.goto('/#screen=pattern-lab', { waitUntil: 'domcontentloaded' });
  await expect(nameField(page)).toHaveValue(/.+/);
  await expect(page.getByRole('heading', { name: 'Begin with a pattern' })).toHaveCount(0);
});

test('hash patternId=fire opens Lab named Fire', async ({ page }) => {
  await page.goto('/#screen=pattern-lab&patternId=fire', { waitUntil: 'domcontentloaded' });
  await expect(nameField(page)).toHaveValue('Fire');
});

test('unknown hash patternId keeps the empty state without crashing', async ({ page }) => {
  await page.goto('/#screen=pattern-lab&patternId=not-a-pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Begin with a pattern' })).toBeVisible();
  await expect(nameField(page)).toHaveCount(0);
});
