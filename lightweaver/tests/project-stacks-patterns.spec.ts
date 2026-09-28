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
  await page.addInitScript(saved => {
    if (!localStorage.getItem('lw_stack_pattern_fixture_loaded')) {
      localStorage.setItem('lw_autosave_v3', JSON.stringify(saved));
      localStorage.setItem('lw_stack_pattern_fixture_loaded', saved.id);
    }
  }, project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('stack-new')).toBeVisible();
}

async function newStack(page) {
  await page.getByTestId('stack-new').click();
  await expect(page.getByTestId('stack-save-bar')).toBeVisible();
}

async function editStack(page, label: string) {
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await page.getByTestId('project-stack-card').getByRole('button', { name: `Edit ${label}`, exact: true }).click();
  await expect(page.getByTestId('stack-save-bar')).toBeVisible();
}

async function backToPatterns(page) {
  await page.getByRole('tab', { name: 'Patterns', exact: true }).click();
}

async function returnToStackEditor(page) {
  await page.getByTestId('stack-return-save').click();
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

test('chip selection stays local while Preview, Edit, and Add remain explicit', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'project-stack-chip-actions';
  const saved = namedLook('calm-stack', 'Calm stack');
  delete saved.sectionLooks['patch-default-ring-3'];
  project.devices.standaloneController.looks = [saved];
  project.devices.standaloneController.activeLookId = '';
  await page.addInitScript(value => localStorage.setItem('lw_autosave_v3', JSON.stringify(value)), project);
  let previewRequests = 0;
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => { previewRequests += 1; return route.abort(); });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  const chip = page.getByTestId('project-stack-card').filter({ hasText: 'Calm stack' });
  await expect(chip.locator('.project-stack-thumbnail')).toHaveCount(2);
  await expect(chip.getByRole('img', { name: 'Inner circle: Ocean' })).toBeVisible();
  const before = await page.evaluate(() => window.scrollY);
  const requestsBeforeSelect = previewRequests;
  await chip.getByRole('button', { name: 'Select Calm stack' }).click();
  await expect(chip.getByRole('button', { name: 'Select Calm stack' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('stack-save-bar')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  expect(previewRequests).toBe(requestsBeforeSelect);
  await chip.getByRole('button', { name: 'Preview Calm stack' }).click();
  await expect(page.getByTestId('stack-save-bar')).toHaveCount(0);
  expect(previewRequests).toBe(requestsBeforeSelect);
  await chip.getByRole('button', { name: 'Add Calm stack to playlist' }).click();
  await expect(chip).toContainText('In playlist');
  await expect.poll(async () => {
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}'));
    return stored.devices.standaloneController.playlist.filter((item: any) => item.lookId === saved.id).length;
  }).toBe(1);
  await chip.getByRole('button', { name: 'Edit Calm stack' }).click();
  await expect(page.getByTestId('stack-save-bar')).toBeVisible();
});

test('section choices save as a named project stack outside built-in patterns', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'project-stack-patterns-test';
  await page.addInitScript(saved => localStorage.setItem('lw_autosave_v3', JSON.stringify(saved)), project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await newStack(page);
  await backToPatterns(page);
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await page.getByTestId('section-target-patch-default-inner-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="ocean"]').click();
  await returnToStackEditor(page);
  await page.getByTestId('look-name').fill('Ember garden');
  await page.getByTestId('look-save-preset').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Saved');
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  const stack = page.getByTestId('project-stack-card').filter({ hasText: 'Ember garden' });
  await expect(stack).toBeVisible();
  await expect(page.getByTestId('stack-save-bar')).toContainText('Outer circle');
  await expect(page.getByTestId('stack-save-bar')).toContainText('Fire');
  await expect(page.getByTestId('stack-save-bar')).toContainText('Inner circle');
  await expect(page.getByTestId('stack-save-bar')).toContainText('Ocean');
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
  await newStack(page);
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
  await editStack(page, 'Used stack');
  await expect(page.getByTestId('look-save-preset')).toHaveText('Save changes');
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
  await editStack(page, 'One');
  await expect(page.getByTestId('look-name')).toBeVisible();
  await expect(page.getByTestId('look-save-preset')).toBeVisible();
  await expect(page.getByTestId('stack-save-add')).toBeVisible();
  await expect(page.getByTestId('look-brightness-slider')).toBeInViewport();
  await expect(page.getByTestId('stack-save-bar')).toContainText('Outer circle');
  await expect(page.getByTestId('look-save-as-new')).not.toBeVisible();
  await page.getByTestId('stack-more-actions').click();
  await expect(page.getByTestId('look-save-as-new')).toBeVisible();
  await expect(page.getByTestId('stack-revert')).toBeVisible();
  await expect(page.getByTestId('look-delete')).toBeVisible();
});

test('duplicate, revert and delete undo keep separate identities', async ({ page }) => {
  await openStackProject(page, 'stack-lifecycle', [namedLook('stack-one', 'One')]);
  await editStack(page, 'One');
  await page.getByTestId('stack-more-actions').click();
  await page.getByRole('button', { name: 'Duplicate stack' }).click();
  await expect(page.getByTestId('project-stack-card')).toHaveCount(2);
  await expect(page.getByTestId('look-name')).toHaveValue('One 2');
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await backToPatterns(page);
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await returnToStackEditor(page);
  await page.getByTestId('stack-more-actions').click();
  await page.getByTestId('stack-revert').click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).not.toContainText('Fire');
  await page.getByTestId('stack-more-actions').click();
  await page.getByTestId('look-delete').click();
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
  await page.getByTestId('project-stack-card').getByRole('button', { name: 'Edit B' }).click();
  await page.getByTestId('look-name').fill('B renamed');
  await page.getByTestId('stack-more-actions').click();
  await page.getByTestId('look-rename').click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Aurora');
  await page.getByTestId('stack-more-actions').click();
  await page.getByTestId('look-delete').click();
  await page.getByTestId('look-delete-undo').click();
  await page.reload();
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await page.getByTestId('project-stack-card').getByRole('button', { name: 'Edit A' }).click();
  await expect(page.getByTestId('look-name')).toHaveValue('A');
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
});

test('copy to selected sections is a draft and can be undone', async ({ page }) => {
  await openStackProject(page, 'stack-copy');
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await page.getByTestId('stack-copy-open').click();
  await page.getByTestId('stack-copy-panel').getByLabel('Inner circle').check();
  await page.getByTestId('stack-copy-panel').getByRole('button', { name: 'Copy settings' }).click();
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toContainText('Fire');
  await newStack(page);
  await page.getByTestId('stack-copy-undo').click();
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).not.toContainText('Fire');
});

test('a changed section map asks for review before updating a stack', async ({ page }) => {
  const broken = { ...namedLook('stack-needs-review', 'Review me'), sectionLooks: { 'section-that-no-longer-exists': { patternId: 'fire' } } };
  await openStackProject(page, 'stack-review', [broken]);
  await editStack(page, 'Review me');
  await expect(page.getByTestId('stack-review')).toBeVisible();
  await page.getByTestId('look-save-preset').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Review sections');
  await page.getByRole('button', { name: 'Dismiss notice' }).click();
  await page.getByTestId('stack-review').getByRole('button').click();
  await expect(page.getByTestId('stack-review')).toHaveCount(0);
});

test('failed browser persistence keeps the stack draft and offers retry', async ({ page }) => {
  await openStackProject(page, 'stack-quota-retry');
  await newStack(page);
  await backToPatterns(page);
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await returnToStackEditor(page);
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
  await page.getByTestId('project-stack-card').first().getByRole('button', { name: /^Edit / }).click();
  const saveBox = await page.getByTestId('stack-save-bar').boundingBox();
  await page.getByTestId('stack-more-actions').click();
  const deleteBox = await page.getByTestId('look-delete').boundingBox();
  expect(saveBox && deleteBox && deleteBox.x >= saveBox.x - 1 && deleteBox.x + deleteBox.width <= saveBox.x + saveBox.width + 1).toBe(true);
  await page.screenshot({ path: '/tmp/lightweaver-stacks-patterns-phone.png' });
});

test('ten saved stack chips wrap into rows and the editor stays below them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStackProject(page, 'stack-compact-density', Array.from({ length: 10 }, (_, index) => {
    const look = namedLook(`compact-${index}`, `Garden ${index + 1}`);
    delete look.sectionLooks['patch-default-ring-3'];
    return look;
  }), true);
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  const chips = page.getByTestId('project-stack-card');
  await expect(chips).toHaveCount(10);
  const first = await chips.nth(0).boundingBox();
  const second = await chips.nth(1).boundingBox();
  expect(first && second && Math.abs(first.y - second.y) < 3 && second.x > first.x).toBe(true);
  expect(first!.width).toBeLessThanOrEqual(220);
  expect((await chips.first().locator('.project-stack-thumbnail').first().boundingBox())?.height).toBeGreaterThanOrEqual(26);
  await chips.first().getByRole('button', { name: /^Edit / }).click();
  const editor = page.getByTestId('stack-save-bar');
  await expect(editor).toBeVisible();
  const lastChip = await chips.last().boundingBox();
  const editorBox = await editor.boundingBox();
  expect(lastChip && editorBox && editorBox.y >= lastChip.y + lastChip.height).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const phoneFirst = await chips.nth(0).boundingBox();
  const phoneSecond = await chips.nth(1).boundingBox();
  expect(phoneFirst && phoneSecond && Math.abs(phoneFirst.y - phoneSecond.y) < 3 && phoneSecond.x > phoneFirst.x).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
});

test('New stack saves a separate full-section snapshot without overwriting the source', async ({ page }) => {
  await openStackProject(page, 'stack-new-from-saved', [namedLook('source-stack', 'Source stack')], true);
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toContainText('Ocean');
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await page.getByTestId('stack-new').click();
  await expect(page.getByTestId('look-name')).toHaveValue('');
  await page.getByTestId('look-name').fill('Second garden');
  await page.getByTestId('look-save-preset').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Saved');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices.standaloneController);
  expect(saved.looks).toHaveLength(2);
  expect(saved.looks.find(look => look.id === 'source-stack')?.sectionLooks['patch-default-outer-circle']?.patternId).toBe('aurora');
  const created = saved.looks.find(look => look.label === 'Second garden');
  expect(created.id).not.toBe('source-stack');
  expect(created.sectionLooks['patch-default-outer-circle'].patternId).toBe('fire');
  expect(created.sectionLooks['patch-default-inner-circle'].patternId).toBe('ocean');
  await editStack(page, 'Source stack');
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
});

test('opening a saved chip before New captures that stack instead of the untouched blank slot', async ({ page }) => {
  const project = createDefaultProject();
  project.id = 'stack-new-after-untouched-blank';
  const source = namedLook('source', 'Source');
  delete source.sectionLooks['patch-default-ring-3'];
  project.devices.standaloneController.looks = [source];
  project.devices.standaloneController.activeLookId = '';
  await page.addInitScript(saved => localStorage.setItem('lw_autosave_v3', JSON.stringify(saved)), project);
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await editStack(page, 'Source');
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toContainText('Ocean');
  await page.getByTestId('stack-new').click();
  await page.getByTestId('look-name').fill('Copied source');
  await page.getByTestId('look-save-preset').click();
  await expect.poll(async () => page.evaluate(() => {
    const looks = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').devices?.standaloneController?.looks || [];
    return looks.find(look => look.label === 'Copied source')?.sectionLooks?.['patch-default-inner-circle']?.patternId;
  })).toBe('ocean');
});

test('saved stack chips sit side by side and toggle one inline editor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStackProject(page, 'stack-chip-expand', [namedLook('one', 'One'), namedLook('two', 'Two')]);
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  const chips = page.getByTestId('project-stack-card');
  const first = await chips.nth(0).boundingBox();
  const second = await chips.nth(1).boundingBox();
  expect(first && second && Math.abs(first.y - second.y) < 3 && second.x > first.x).toBe(true);
  await chips.nth(1).getByRole('button', { name: 'Edit Two' }).click();
  await expect(page.getByTestId('stack-save-bar')).toBeVisible();
  await expect(page.getByTestId('look-name')).toHaveValue('Two');
  await chips.nth(1).getByRole('button', { name: 'Select Two' }).click();
  await expect(page.getByTestId('stack-save-bar')).toHaveCount(0);
});

test('unfinished new stack restores every section after opening another chip and reloading', async ({ page }) => {
  const source = namedLook('source', 'Source');
  delete source.sectionLooks['patch-default-ring-3'];
  await openStackProject(page, 'stack-new-draft-resume', [source], true);
  await newStack(page);
  await backToPatterns(page);
  await page.getByTestId('section-target-patch-default-outer-circle').click();
  await page.locator('.pm-cards .pmcard[data-pattern-id="fire"]').click();
  await page.getByRole('tab', { name: /Project stacks/ }).click();
  await page.getByTestId('project-stack-card').getByRole('button', { name: 'Edit Source' }).click();
  await page.reload();
  await expect(page.getByTestId('stack-new')).toContainText('Resume new draft');
  await page.getByTestId('stack-new').click();
  await expect(page.getByTestId('section-pattern-patch-default-outer-circle')).toContainText('Fire');
  await expect(page.getByTestId('section-pattern-patch-default-inner-circle')).toContainText('Ocean');
});
