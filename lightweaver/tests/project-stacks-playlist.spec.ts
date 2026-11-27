import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { deriveSectionTargets } from '../src/lib/sectionLookModel.js';
import { createDefaultCircleLayout } from '../src/lib/defaultCircleLayout.js';
import { createDefaultPatchBoard } from '../src/lib/patchBoard.js';
import { makeDefaultWiring } from '../src/lib/wiringModel.js';

function projectWithStacks(count = 3, ineligibleLast = true) {
  const project = createDefaultProject();
  project.id = `playlist-stacks-${count}`;
  project.name = 'Playlist stacks';
  project.layout.starterPending = false;
  project.layout.strips = createDefaultCircleLayout({ sectionPixelCounts: [8, 9, 10, 11] });
  project.layout.patchBoard = createDefaultPatchBoard(project.layout.strips);
  project.layout.wiring = makeDefaultWiring(project.layout.strips);
  const targets = deriveSectionTargets({
    strips: project.layout.strips,
    patchBoard: project.layout.patchBoard,
    wiring: project.layout.wiring,
    defaultLook: project.devices.standaloneController.defaultLook,
  }).filter(target => target.kind === 'section');
  project.devices.standaloneController.looks = Array.from({ length: count }, (_, index) => ({
    id: `stack-${index + 1}`,
    label: `Stack ${index + 1}`,
    defaultLook: { patternId: 'fire' },
    sectionLooks: Object.fromEntries(targets.map((target, targetIndex) => [
      target.id, { patternId: ['fire', 'ocean', 'plasma'][(index + targetIndex) % 3] },
    ])),
    ...(ineligibleLast && index === count - 1 ? { projectOnly: true } : {}),
  }));
  project.devices.standaloneController.playlist = [];
  return { project, targets };
}

async function openPlaylist(page, project) {
  await page.addInitScript(savedProject => {
    if (!localStorage.getItem('lw_stacks_fixture_loaded')) {
      localStorage.clear();
      localStorage.setItem('lw_autosave_v3', JSON.stringify(savedProject));
      localStorage.setItem('lw_stacks_fixture_loaded', savedProject.id);
    }
  }, project);
  await page.goto('/#screen=playlist', { waitUntil: 'domcontentloaded' });
}

test('project stacks have their own picker, exact details, and ordered multi-add', async ({ page }) => {
  const { project, targets } = projectWithStacks();
  project.devices.standaloneController.looks[0].sectionLooks[targets[0].id] = { patternId: 'blackout' };
  await openPlaylist(page, project);

  await expect(page.getByRole('tab', { name: 'Project stacks (3)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('playlist-stack-stack-3')).toContainText('Unavailable on card');
  await expect(page.getByTestId('playlist-stack-stack-3').getByRole('checkbox')).toBeDisabled();
  await page.getByTestId('playlist-stack-stack-1').getByRole('button', { name: 'Show sections' }).click();
  for (const target of targets) {
    await expect(page.getByTestId('playlist-stack-stack-1')).toContainText(target.label);
  }
  await expect(page.getByTestId('playlist-stack-stack-1')).toContainText('Off');

  await page.getByTestId('playlist-stack-stack-2').getByRole('checkbox').check();
  await page.getByTestId('playlist-stack-stack-1').getByRole('checkbox').check();
  await expect(page.getByTestId('playlist-stack-selection-preview')).toContainText('1. Stack 1');
  await expect(page.getByTestId('playlist-stack-selection-preview')).toContainText('2. Stack 2');
  await expect(page.getByTestId('playlist-stack-order-help')).toContainText('library order');
  await page.getByRole('button', { name: 'Add selected' }).click();
  await expect(page.locator('[data-testid^="playlist-row-combo-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="playlist-row-combo-"]').first()).toContainText('Stack 1');
  await expect(page.locator('[data-testid^="playlist-row-combo-"]').last()).toContainText('Stack 2');
  await expect(page.getByTestId('playlist-stack-stack-1')).toContainText('In playlist: 1');
  await page.getByRole('tab', { name: 'Patterns' }).click();
  await expect(page.getByRole('tab', { name: 'Patterns' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Project stacks (3)' }).click();
  await expect(page.getByTestId('playlist-stack-stack-1')).toBeVisible();

  const first = page.locator('[data-testid^="playlist-row-combo-"]').first();
  await expect(first).toContainText('Look');
  await expect(first.locator('.pl-art-slice').first()).toHaveCSS('background-color', 'rgb(23, 27, 33)');
  await first.getByRole('button', { name: 'Show sections' }).click();
  for (const target of targets) await expect(first).toContainText(target.label);
  await expect(first.getByRole('link', { name: 'Edit look' })).toHaveAttribute('href', /editStack=stack-1/);
  await first.getByRole('link', { name: 'Edit look' }).click();
  await expect(page).toHaveURL(/screen=pattern/);
  await expect(page.getByTestId('look-save-preset')).toHaveText('Save changes');
  await expect(page.getByTestId('look-name')).toHaveValue('Stack 1');
});

test('repeating a stack creates a separate occurrence with its own Length', async ({ page }) => {
  const { project } = projectWithStacks(1, false);
  project.devices.standaloneController.playlist = [
    { id: 'combo-stack-1', type: 'combo', lookId: 'stack-1', label: 'Stack 1', dwellSeconds: 90 },
    { id: 'fire', type: 'pattern', patternId: 'fire', label: 'Fire', dwellSeconds: 30 },
  ];
  await openPlaylist(page, project);
  const original = page.getByTestId('playlist-row-combo-stack-1');
  await original.getByRole('button', { name: 'More actions for Stack 1' }).click();
  await original.getByRole('menuitem', { name: 'Repeat this look' }).click();
  const occurrences = page.locator('[data-testid^="playlist-row-combo-stack-1"]');
  await expect(occurrences).toHaveCount(2);
  await expect(occurrences.first().getByRole('spinbutton', { name: 'Length in minutes for Stack 1' })).toHaveValue('1.5');
  await occurrences.last().getByRole('spinbutton', { name: 'Length in minutes for Stack 1' }).fill('2.5');
  await occurrences.last().getByRole('spinbutton', { name: 'Length in minutes for Stack 1' }).press('Enter');
  await expect(occurrences.first().getByRole('spinbutton', { name: 'Length in minutes for Stack 1' })).toHaveValue('1.5');
  await expect(occurrences.last().getByRole('spinbutton', { name: 'Length in minutes for Stack 1' })).toHaveValue('2.5');
  await expect(page.getByTestId('playlist-stack-stack-1')).toContainText('In playlist: 1, 2');
  await occurrences.last().getByRole('button', { name: 'Reorder Stack 1' }).press('ArrowDown');
  await expect(page.getByTestId('playlist-stack-stack-1')).toContainText('In playlist: 1, 3');
});

test('repeat refuses a full 16-entry timed playlist without changing its order', async ({ page }) => {
  const { project } = projectWithStacks(1, false);
  project.devices.standaloneController.playlist = [
    { id: 'combo-stack-1', type: 'combo', lookId: 'stack-1', label: 'Stack 1', dwellSeconds: 90 },
    ...Array.from({ length: 15 }, (_, index) => ({ id: `full-${index}`, type: 'pattern', patternId: 'fire', label: `Fire ${index}`, dwellSeconds: 30 })),
  ];
  project.devices.standaloneController.controls.playlist = { enabled: true, fadeMs: 1500 };
  await openPlaylist(page, project);
  const fullOriginal = page.getByTestId('playlist-row-combo-stack-1');
  await fullOriginal.getByRole('button', { name: 'More actions for Stack 1' }).click();
  await fullOriginal.getByRole('menuitem', { name: 'Repeat this look' }).click();
  await expect(page.locator('[data-testid^="playlist-row-combo-stack-1"]')).toHaveCount(1);
  await expect(page.getByTestId('playlist-repeat-feedback')).toContainText('16');
});

test('repeat refuses a full 32-entry manual bank', async ({ page }) => {
  const { project } = projectWithStacks(1, false);
  project.devices.standaloneController.playlist = [
    { id: 'combo-stack-1', type: 'combo', lookId: 'stack-1', label: 'Stack 1', dwellSeconds: 90 },
    ...Array.from({ length: 31 }, (_, index) => ({ id: `manual-${index}`, type: 'pattern', patternId: 'fire', label: `Fire ${index}`, dwellSeconds: 30 })),
  ];
  await openPlaylist(page, project);
  await expect(page.getByTestId('playlist-overflow-notice')).toHaveCount(0);
  const row = page.getByTestId('playlist-row-combo-stack-1');
  await row.getByRole('button', { name: 'More actions for Stack 1' }).click();
  await row.getByRole('menuitem', { name: 'Repeat this look' }).click();
  await expect(page.locator('.pl-row')).toHaveCount(32);
  await expect(page.getByTestId('playlist-repeat-feedback')).toContainText('32');
});

test('multi-add refuses capacity overflow without adding a subset', async ({ page }) => {
  const { project } = projectWithStacks();
  project.devices.standaloneController.playlist = Array.from({ length: 15 }, (_, index) => ({
    id: `fire-${index}`, type: 'pattern', patternId: 'fire', label: `Fire ${index}`, dwellSeconds: 30,
  }));
  await openPlaylist(page, project);
  await page.getByTestId('playlist-stack-stack-1').getByRole('checkbox').check();
  await page.getByTestId('playlist-stack-stack-2').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add selected' }).click();
  await expect(page.getByTestId('playlist-stack-feedback')).toContainText('Not enough playlist slots');
  await expect(page.locator('[data-testid^="playlist-row-combo-"]')).toHaveCount(0);
});

test('an older partial saved look keeps its historical default-section inheritance', async ({ page }) => {
  const { project } = projectWithStacks(1, false);
  project.devices.standaloneController.looks[0].sectionLooks = {};
  await openPlaylist(page, project);
  const source = page.getByTestId('playlist-stack-stack-1');
  await expect(source.getByRole('link', { name: /update sections/i })).toHaveCount(0);
  await source.getByRole('button', { name: 'Add look' }).click();
  const row = page.getByTestId('playlist-row-combo-stack-1');
  await expect(row).toBeVisible();
  await expect(page.getByTestId('playlist-project-save-status')).toHaveText('Playlist saved in this browser.');
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
  await expect(source.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled();
  await row.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.getByTestId('playlist-card-status')).toContainText('Connect this Lightweaver card before sending live control.');
});

test('ten four-section stacks add in display order and survive playlist removal', async ({ page }) => {
  const { project, targets } = projectWithStacks(10, false);
  expect(targets).toHaveLength(4);
  await openPlaylist(page, project);
  await expect(page.getByRole('tab', { name: 'Project stacks (10)' })).toHaveAttribute('aria-selected', 'true');
  for (let index = 1; index <= 10; index += 1) {
    await page.getByTestId(`playlist-stack-stack-${index}`).getByRole('checkbox').check();
  }
  await page.getByRole('button', { name: 'Add selected' }).click();
  await expect(page.locator('[data-testid^="playlist-row-combo-"]')).toHaveCount(10);
  for (let index = 1; index <= 10; index += 1) {
    await expect(page.locator('[data-testid^="playlist-row-combo-"]').nth(index - 1)).toContainText(`Stack ${index}`);
  }
  const firstRow = page.getByTestId('playlist-row-combo-stack-1');
  await firstRow.getByRole('button', { name: 'More actions for Stack 1' }).click();
  await firstRow.getByRole('menuitem', { name: 'Remove Stack 1' }).click();
  await expect(firstRow).toHaveCount(0);
  await expect(page.getByTestId('playlist-stack-stack-1')).toBeVisible();
  await expect(page.getByTestId('playlist-stack-stack-1')).not.toContainText('In playlist');
  await expect(page.getByTestId('playlist-project-save-status')).toHaveText('Playlist saved in this browser.');
  await expect.poll(() => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
    return project.devices?.standaloneController?.playlist?.filter(item => item.type === 'combo').length ?? -1;
  })).toBe(9);
  await page.getByRole('tab', { name: 'Patterns' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Patterns' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-testid^="playlist-row-combo-"]')).toHaveCount(9);
});

for (const [size, width, height] of [['desktop', 1280, 900], ['phone', 390, 844]] as const) {
  test(`ten-stack picker fits the ${size} screen`, async ({ page }) => {
    const { project } = projectWithStacks(10, false);
    await page.setViewportSize({ width, height });
    await openPlaylist(page, project);
    const picker = page.getByTestId('playlist-source-picker');
    await expect(page.getByRole('tab', { name: 'Project stacks (10)' })).toHaveAttribute('aria-selected', 'true');
    await expect(picker.locator('.pl-stack-card')).toHaveCount(10);
    const bounds = await picker.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: `/tmp/lightweaver-stacks-playlist-${size}.png`, fullPage: true });
  });
}

test('phone jumps between playlist order and the stack picker', async ({ page }) => {
  const { project } = projectWithStacks(10, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlaylist(page, project);
  const order = page.getByTestId('playlist-order-section');
  const picker = page.getByTestId('playlist-source-picker');
  await order.getByRole('button', { name: 'Browse looks & patterns', exact: true }).click();
  await expect(picker).toBeInViewport({ ratio: 0.01 });
  await expect(picker).toBeFocused();
  await expect(picker.getByRole('tab', { name: 'Project stacks (10)', selected: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Back to order' }).click();
  await expect(order).toBeInViewport({ ratio: 0.01 });
  await expect(order).toBeFocused();
});

test('phone can browse and add a pattern quietly offline with no project stacks', async ({ page }) => {
  const { project } = projectWithStacks(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlaylist(page, project);
  const order = page.getByTestId('playlist-order-section');
  const picker = page.getByTestId('playlist-source-picker');
  await order.getByRole('button', { name: 'Browse looks & patterns', exact: true }).click();
  await expect(picker).toBeInViewport({ ratio: 0.01 });
  await expect(picker).toBeFocused();
  await expect(picker.getByRole('tab', { name: 'Patterns', selected: true })).toBeVisible();
  await picker.getByRole('tab', { name: 'Project stacks (0)' }).click();
  await expect(picker.getByRole('tabpanel', { name: 'Project stacks' })).toContainText('No saved looks yet.');
  await picker.getByRole('tab', { name: 'Patterns' }).click();
  await picker.getByRole('button', { name: 'Add Ocean', exact: true }).click();
  await expect(page.getByTestId('playlist-project-save-status')).toHaveText('Playlist saved in this browser.');
  await expect(page.getByTestId('playlist-card-status')).toHaveCount(0);
  await picker.getByRole('button', { name: 'Back to order' }).click();
  await expect(order).toBeInViewport({ ratio: 0.01 });
  await expect(order).toBeFocused();
  await expect(order.getByTestId('playlist-row-ocean')).toContainText('Ocean');
  await picker.getByRole('button', { name: 'Ocean, already in playlist; preview', exact: true }).click();
  await expect(page.getByTestId('playlist-card-status')).toContainText('Connect this Lightweaver card before sending live control.');
  await expect(order.getByTestId('playlist-row-ocean')).toHaveCount(1);
});

test('mixed mirror modes use each saved look’s own section assignments', async ({ page }) => {
  const { project } = projectWithStacks(2, false);
  project.layout.strips = createDefaultCircleLayout({ sectionPixelCounts: [27, 17] });
  project.layout.patchBoard = createDefaultPatchBoard(project.layout.strips);
  project.layout.wiring = makeDefaultWiring(project.layout.strips);
  project.layout.symmetry = {
    fold: 2, orientation: 'mirror', sides: [
      { id: 'side-1', label: 'Left side', stripIds: [project.layout.strips[0].id] },
      { id: 'side-2', label: 'Right side', stripIds: [project.layout.strips[1].id] },
    ],
  };
  project.pattern.sidesMirrored = true;
  project.devices.standaloneController.looks = [
    { id: 'mirror', label: 'A — Warm rings', sidesMirrored: true, sectionSnapshotVersion: 1,
      defaultLook: { patternId: 'fire' }, sectionLooks: { 'side-1': { patternId: 'fire' } } },
    { id: 'own', label: 'B — Blue currents across both sides', sidesMirrored: false, sectionSnapshotVersion: 1,
      defaultLook: { patternId: 'ocean' }, sectionLooks: { 'side-1': { patternId: 'ocean' }, 'side-2': { patternId: 'plasma' } } },
    { id: 'stale', label: 'Old mirrored look', sidesMirrored: true, sectionSnapshotVersion: 1,
      defaultLook: { patternId: 'fire' }, sectionLooks: { 'old-side': { patternId: 'fire' } } },
  ];
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
  await openPlaylist(page, project);
  const mirrored = page.getByTestId('playlist-stack-mirror');
  const independent = page.getByTestId('playlist-stack-own');
  await expect(mirrored).toContainText('1 section');
  await expect(independent).toContainText('2 sections');
  await expect(page.getByTestId('playlist-stack-stale').getByRole('checkbox')).toBeDisabled();
  await mirrored.getByRole('checkbox').check();
  await independent.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add selected' }).click();
  const second = page.getByTestId('playlist-row-combo-own');
  await expect(second).toContainText('B — Blue currents');
  await second.getByRole('button', { name: 'Show sections' }).click();
  await expect(second).toContainText('Right side');
  await expect(second).toContainText('Plasma');
  await page.setViewportSize({ width: 390, height: 844 });
  const titleFits = await second.locator('.pl-copy > strong').evaluate(title => {
    const text = document.createRange();
    text.selectNodeContents(title);
    const bounds = title.getBoundingClientRect();
    return [...text.getClientRects()].every(rect => rect.right <= bounds.right + 1);
  });
  expect(titleFits).toBe(true);
  const actions = second.getByRole('button', { name: /More actions/ });
  await actions.click();
  await second.getByRole('menuitem', { name: 'View sections' }).click();
  const assignments = page.getByRole('dialog', { name: 'B — Blue currents across both sides' });
  await expect(assignments).toContainText('Plasma');
  await assignments.getByRole('button', { name: 'Done' }).click();
  await expect(actions).toBeFocused();
  await actions.click();
  await second.getByRole('menuitem', { name: 'Edit look' }).click();
  await expect(page.getByTestId('look-name')).toHaveValue('B — Blue currents across both sides');
  await expect(page.getByTestId('stack-review')).toHaveCount(0);
  await page.getByTestId('pattern-sides').getByRole('button', { name: 'Mirror each other' }).click();
  await expect(page.getByTestId('stack-review')).toHaveCount(0);
  await page.getByTestId('look-save-preset').click();
  await expect(page.getByTestId('look-save-status')).toContainText('Saved in project');
  await page.goBack();
  await expect(second).toContainText('B — Blue currents');
  await expect(second).toContainText('1 section');
});

test.describe('Playlist compact touch rows', () => {
  test.use({ hasTouch: true });
  test('Playlist names, swatches and timing controls fit at phone widths', async ({ page }) => {
    const { project } = projectWithStacks(3, false);
    const names = ['A — Warm rings', 'B — Blue currents', 'C — Copper sparks across the outer ring'];
    for (const [index, look] of project.devices.standaloneController.looks.entries()) {
      look.label = names[index];
      project.devices.standaloneController.playlist.push({
        id: `combo-${look.id}`, type: 'combo', lookId: look.id, label: look.label,
        dwellSeconds: 30, enabled: true, createdAt: index,
      });
    }
    await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
    await openPlaylist(page, project);
    const rows = page.locator('[data-playlist-index]');
    await expect(rows).toHaveCount(3);
    for (const [width, height] of [[320, 760], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const layout = await rows.evaluateAll(elements => elements.map(row => {
        const title = row.querySelector('.pl-copy > strong')!;
        const range = document.createRange();
        range.selectNodeContents(title);
        const lines = [...range.getClientRects()];
        const bounds = title.getBoundingClientRect();
        const length = row.querySelector('.pl-dwell')!.getBoundingClientRect();
        const unit = row.querySelector('.pl-dwell-unit')!.getBoundingClientRect();
        const label = row.querySelector('.pl-dwell .sf-l')!.getBoundingClientRect();
        const swatch = row.querySelector('.pl-art')!.getBoundingClientRect();
        return {
          titleLines: new Set(lines.map(line => line.y)).size,
          fullTitleVisible: lines.every(line => line.right <= bounds.right + 1),
          lengthFits: label.width > 20 && unit.width > 0 && unit.right <= length.right + 1,
          swatchFits: swatch.height >= 20 && swatch.left >= bounds.right && swatch.right <= row.getBoundingClientRect().right,
        };
      }));
      expect(layout[0].titleLines).toBe(1);
      expect(layout.every(row => row.fullTitleVisible && row.lengthFits && row.swatchFits)).toBe(true);
      const { fade, playback } = await page.locator('.pl-timing').evaluate(panel => ({
        fade: panel.querySelector('.pl-timing-input')!.getBoundingClientRect().top,
        playback: panel.querySelector('.pl-timing-switch')!.getBoundingClientRect().top,
      }));
      expect(Math.abs(fade - playback)).toBeLessThan(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  });
});
