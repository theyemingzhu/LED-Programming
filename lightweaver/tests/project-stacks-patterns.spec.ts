import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';

async function openStackProject(page, id: string, looks: any[] = [], matchFirstLook = false) {
  const project = createDefaultProject();
  project.id = id;
  project.devices.standaloneController.looks = looks;
  project.devices.standaloneController.activeLookId = looks[0]?.id || '';
  if (matchFirstLook && looks[0]) {
    project.layout.starterPending = false;
    project.layout.patchBoard.patches.forEach(patch => {
      patch.playback.patternId = looks[0].sectionLooks[patch.id]?.patternId || looks[0].defaultLook.patternId;
    });
  }
  await page.addInitScript(saved => localStorage.setItem('lw_autosave_v3', JSON.stringify(saved)), project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('stack-save-bar')).toBeVisible();
}

const namedLook = (id: string, label: string) => ({
  id, label, sectionSnapshotVersion: 1, defaultLook: { patternId: 'aurora' },
  sectionLooks: {
    'patch-default-outer-circle': { patternId: 'aurora' },
    'patch-default-inner-circle': { patternId: 'ocean' },
    'patch-default-ring-3': { patternId: 'plasma' },
  },
});

test('section choices save as a named project stack outside built-in patterns', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'project-stack-patterns-test';
  await page.addInitScript(saved => localStorage.setItem('lw_autosave_v3', JSON.stringify(saved)), project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await page.getByTestId('section-target-patch-default-inner-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="ocean"]').click();
  await page.getByTestId('look-name').fill('Ember garden');
  await page.getByTestId('look-save-preset').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Saved');
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  const stack = page.getByTestId('project-stack-card').filter({ hasText: 'Ember garden' });
  await stack.getByTestId('stack-card-more').click();
  await stack.locator('.project-stack-assignments summary').click();
  await expect(stack.getByText('Outer circle')).toBeVisible();
  await expect(stack.getByText('Fire')).toBeVisible();
  await expect(stack.getByText('Inner circle')).toBeVisible();
  await expect(stack.getByText('Ocean')).toBeVisible();
  await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
  await expect(page.locator('.pm-cards .pmcard[data-pattern-id="fire"]')).toBeVisible();
  await expect(page.getByTestId('project-stack-card')).toHaveCount(0);
});

test('Save and add records one stack playlist reference', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'project-stack-save-add-test';
  await page.addInitScript(saved => localStorage.setItem('lw_autosave_v3', JSON.stringify(saved)), project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('look-name').fill('First stack');
  await page.getByTestId('stack-save-add').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Saved');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
  const look = saved.devices.standaloneController.looks.find((item: any) => item.label === 'First stack');
  expect(look).toBeTruthy();
  expect(saved.devices.standaloneController.playlist.filter((item: any) => item.type === 'combo' && item.lookId === look.id)).toHaveLength(1);
});

test('a stack already in the playlist offers Arrange instead of adding again', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'stack-already-in-playlist';
  project.devices.standaloneController.looks = [namedLook('stack-used', 'Used stack')];
  project.devices.standaloneController.activeLookId = 'stack-used';
  project.devices.standaloneController.playlist = [{ id: 'combo-used', type: 'combo', lookId: 'stack-used', label: 'Used stack', enabled: true }];
  await page.addInitScript(saved => localStorage.setItem('lw_autosave_v3', JSON.stringify(saved)), project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('look-save-preset')).toHaveText('Update stack');
  await expect(page.getByTestId('stack-save-add')).toHaveCount(0);
  await page.getByTestId('stack-arrange-playlist').click();
  await expect(page).toHaveURL(/#screen=playlist/);
});

test('drafts stay attached to their stack when switching and reloading', async ({ page }) => {
  await openStackProject(page, 'stack-draft-isolation', [namedLook('stack-one', 'One'), namedLook('stack-two', 'Two')]);
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await page.getByTestId('project-stack-card').filter({ hasText: 'Two' }).getByRole('button', { name: /^Edit / }).click();
  await expect(page.getByTestId('look-name')).toHaveValue('Two');
  await page.getByTestId('project-stack-card').filter({ has: page.locator('.project-stack-card-head strong').filter({ hasText: /^One$/ }) }).getByRole('button', { name: /^Edit / }).click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await expect(page.getByTestId('look-save-status')).toContainText('Unsaved');
  await page.reload();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
});

test('stack editor keeps tuning visible and reveals secondary actions on demand', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStackProject(page, 'stack-editor-focus', [namedLook('stack-one', 'One')]);
  await expect(page.getByTestId('look-name')).toBeVisible();
  await expect(page.getByTestId('look-save-preset')).toBeVisible();
  await expect(page.getByTestId('stack-save-add')).toBeVisible();
  await expect(page.getByTestId('look-brightness-slider')).toBeInViewport();
  const details = page.getByTestId('stack-details');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('Outer circle');
  await expect(page.getByTestId('look-save-as-new')).not.toBeVisible();
  await page.getByTestId('stack-more-actions').click();
  await expect(page.getByTestId('look-save-as-new')).toBeVisible();
  await expect(page.getByTestId('stack-revert')).toBeVisible();
  await expect(page.getByTestId('look-delete')).toBeVisible();
});

test('duplicate, revert and delete undo keep separate identities', async ({ page }) => {
  await openStackProject(page, 'stack-lifecycle', [namedLook('stack-one', 'One')]);
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await page.getByTestId('project-stack-card').getByTestId('stack-card-more').click();
  await page.getByTestId('project-stack-card').getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByTestId('project-stack-card')).toHaveCount(2);
  await expect(page.getByTestId('look-name')).toHaveValue('One 2');
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await page.getByTestId('stack-more-actions').click();
  await page.getByTestId('stack-revert').click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).not.toContainText('Fire');
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await page.getByTestId('project-stack-card').filter({ hasText: 'One 2' }).getByTestId('stack-card-more').click();
  await page.getByTestId('project-stack-card').filter({ hasText: 'One 2' }).getByRole('button', { name: /Delete/ }).click();
  await expect(page.getByTestId('project-stack-card')).toHaveCount(1);
  await page.getByTestId('look-delete-undo').click();
  await expect(page.getByTestId('project-stack-card')).toHaveCount(2);
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController.looks.map((item: any) => item.id));
  expect(new Set(ids).size).toBe(2);
});

test('renaming and deleting another stack preserve this stack draft through Undo and reload', async ({ page }) => {
  await openStackProject(page, 'stack-unrelated-draft', [namedLook('stack-a', 'A'), namedLook('stack-b', 'B')]);
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  const b = page.getByTestId('project-stack-card').filter({ has: page.locator('.project-stack-card-head strong').filter({ hasText: /^B$/ }) });
  await b.getByTestId('stack-card-more').click();
  await b.getByRole('button', { name: 'Rename' }).click();
  await expect(b.getByTestId('stack-card-more')).toBeFocused();
  await b.getByRole('textbox', { name: 'New name for B' }).fill('B renamed');
  await b.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await page.getByTestId('project-stack-card').filter({ hasText: 'B renamed' }).getByTestId('stack-card-more').click();
  await page.getByTestId('project-stack-card').filter({ hasText: 'B renamed' }).getByRole('button', { name: /Delete/ }).click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await page.getByTestId('look-delete-undo').click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await page.reload();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await expect(page.getByTestId('look-name')).toHaveValue('A');
});

test('copy to selected sections is a draft and can be undone', async ({ page }) => {
  await openStackProject(page, 'stack-copy');
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await page.getByTestId('stack-copy-open').click();
  await page.getByTestId('stack-copy-panel').getByLabel('Inner circle').check();
  await page.getByTestId('stack-copy-panel').getByRole('button', { name: 'Copy settings' }).click();
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toContainText('Fire');
  await page.getByTestId('stack-copy-undo').click();
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).not.toContainText('Fire');
});

test('a changed section map asks for review before updating a stack', async ({ page }) => {
  const broken = { ...namedLook('stack-needs-review', 'Review me'), sectionLooks: { 'section-that-no-longer-exists': { patternId: 'fire' } } };
  await openStackProject(page, 'stack-review', [broken]);
  await expect(page.getByTestId('stack-review')).toBeVisible();
  await page.getByTestId('look-save-preset').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Review sections');
  await page.getByTestId('stack-review').getByRole('button').click();
  await expect(page.getByTestId('stack-review')).toHaveCount(0);
});

test('failed browser persistence keeps the stack draft and offers retry', async ({ page }) => {
  await openStackProject(page, 'stack-quota-retry');
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await page.getByTestId('look-name').fill('Quota trial');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).__restoreStorageWrite = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lw_autosave_v3') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByTestId('look-save-preset').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Could not save');
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await page.evaluate(() => (window as any).__restoreStorageWrite());
  await page.getByTestId('stack-save-retry').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Saved');
});

test('ten project stacks fit desktop and phone without horizontal overflow', async ({ page }) => {
  await openStackProject(page, 'stack-visual-density', Array.from({ length: 10 }, (_, index) => {
    const look = namedLook(`stack-${index + 1}`, `Stack ${String(index + 1).padStart(2, '0')}`);
    delete look.sectionLooks['patch-default-ring-3'];
    return look;
  }), true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await expect(page.getByTestId('project-stack-card')).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: '/tmp/lightweaver-stacks-patterns-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('project-stack-card').first().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('project-stack-card').first().getByRole('button', { name: /^Edit / })).toBeVisible();
  const saveBox = await page.getByTestId('stack-save-bar').boundingBox();
  await page.getByTestId('stack-more-actions').click();
  const deleteBox = await page.getByTestId('look-delete').boundingBox();
  expect(saveBox && deleteBox && deleteBox.x >= saveBox.x - 1 && deleteBox.x + deleteBox.width <= saveBox.x + saveBox.width + 1).toBe(true);
  await page.screenshot({ path: '/tmp/lightweaver-stacks-patterns-phone.png' });
});

test('stack editor and ten saved rows stay compact across desktop and phone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStackProject(page, 'stack-compact-density', Array.from({ length: 10 }, (_, index) => {
    const look = namedLook(`compact-${index}`, `Garden ${index + 1}`);
    delete look.sectionLooks['patch-default-ring-3'];
    return look;
  }), true);
  const editor = page.getByTestId('stack-save-bar');
  expect((await editor.boundingBox())?.height).toBeLessThanOrEqual(150);
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  const rows = page.getByTestId('project-stack-card');
  await expect(rows).toHaveCount(10);
  expect((await rows.first().locator('.project-stack-swatch span').first().boundingBox())?.height).toBeGreaterThanOrEqual(4);
  for (const row of await rows.all()) expect((await row.boundingBox())?.height).toBeLessThanOrEqual(76);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const row of await rows.all()) expect((await row.boundingBox())?.height).toBeLessThanOrEqual(96);
});
