import type { Page } from '@playwright/test';
import { test, expect } from './studioTest';
import { prepareCardDeployment } from '../src/lib/cardDeployment.js';
import { normalizeWiring } from '../src/lib/wiringModel.js';
import { createPracticeCard } from './harness/practiceTiming';
import { cardState } from './harness/cardStates';
import {
  cueId,
  lookId,
  lookName,
  removedSectionId,
  sectionNames,
  seedSavedLookSectionChanges,
} from './fixtures/savedLookSectionChanges.mjs';

const readProject = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3')!));
const updateSections = (surface: ReturnType<Page['getByTestId']>) =>
  surface.getByRole('button', { name: `Update sections for ${lookName}`, exact: true });
const editSections = (surface: ReturnType<Page['getByTestId']>) =>
  surface.getByRole('link', { name: `Edit ${lookName} in Patterns`, exact: true });
const cueSections = (surface: ReturnType<Page['getByTestId']>) =>
  surface.getByRole('link', { name: `Update sections for ${lookName} in Patterns`, exact: true });

const originalCardLook = { id: 'card-only-harbour', label: 'Harbour', mode: 'combo', preset: 'ocean', patternId: 'ocean' };

async function attachPracticeCard(page: Page, project: Awaited<ReturnType<typeof seedSavedLookSectionChanges>>['project'], blank = false) {
  const { strips, patchBoard, wiring } = project.layout;
  const installed = prepareCardDeployment({
    projectId: project.id,
    projectName: project.name,
    projectRevision: 0,
    strips, patchBoard, wiring,
    standaloneController: { ...project.devices.standaloneController, looks: [], playlist: [], activeLookId: '' },
  }).runtimePackage.config;
  const outputs = installed.led.outputs;
  const { card } = createPracticeCard(blank ? cardState('factory-blank') : {
    ...cardState('playing'),
    projectId: project.id,
    projectName: project.name,
    projectFingerprint: installed.projectFingerprint,
    projectRevision: installed.projectRevision,
    pin: outputs[0].pin,
    pixels: outputs[0].pixels,
    patterns: [{ id: originalCardLook.id, label: originalCardLook.label }],
    currentIndex: 0,
    currentId: originalCardLook.id,
  }, { initialOutputs: blank ? undefined : outputs, timing: 'fast' });
  if (!blank) card.state.installedLooks = [originalCardLook];
  await card.install(page);
  const { cardId, firmwareVersion, buildId } = card.state;
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    if (window !== window.top) return;
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: cardId, firmwareVersion, buildId });
  const writes = () => card.requests.filter(
    request => request.method === 'POST' && /^\/api\/(?:config|wiring\/)/.test(request.path),
  );
  return { card, writes };
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?:lightweaver\.local|192\.168\.|10\.)/, route => route.abort());
});

for (const scenario of [
  { name: 'desktop mixed patterns', width: 1440, height: 1000, mixed: true },
  { name: 'phone all Fire', width: 390, height: 844, mixed: false },
]) {
  test.describe(scenario.name, () => {
    test.use({ viewport: { width: scenario.width, height: scenario.height }, isMobile: !scenario.mixed, hasTouch: !scenario.mixed });
    test('corrects a five-strip saved look where it blocks installation', async ({ page }) => {
      const fixture = await seedSavedLookSectionChanges(page, scenario);
      await page.goto('/#screen=pattern');
      const blocked = page.getByTestId('pattern-install-blockers');
      await expect(updateSections(blocked)).toBeVisible({ timeout: 4000 });
      await expect(page.getByTestId('stack-save-bar')).toHaveCount(0);
      await expect(page.getByText('Saved look needs section review.', { exact: true })).toHaveCount(0);
      const defaultPattern = fixture.patterns[4].replace(/^./, letter => letter.toUpperCase());
      await expect(updateSections(blocked)).toHaveAccessibleDescription(
        new RegExp(`Keeps matching settings.*New sections use ${defaultPattern}.*removed assignments`, 'i'),
      );
      const before = await readProject(page);

      if (scenario.mixed) {
        await updateSections(blocked).focus();
        await expect(updateSections(blocked)).toBeFocused();
        await page.keyboard.press('Enter');
      } else {
        const dismiss = page.getByTestId('dismiss-stack-install-warning');
        await dismiss.tap();
        await expect(dismiss).toHaveCount(0);
        await expect(updateSections(blocked)).toBeVisible();
        await updateSections(blocked).tap();
      }

      await expect(updateSections(blocked)).toHaveCount(0);
      await expect.poll(async () => {
        const saved = (await readProject(page)).devices.standaloneController.looks.find(look => look.id === lookId);
        return Object.keys(saved.sectionLooks).sort();
      }).toEqual(fixture.sectionIds.slice().sort());
      await page.reload();
      await expect(blocked).toHaveCount(0);
      const after = await readProject(page);
      expect(after.id).toBe(before.id);
      expect(after.layout.strips).toEqual(before.layout.strips);
      expect(normalizeWiring(after.layout.wiring)).toEqual(normalizeWiring(before.layout.wiring));
      expect(after.devices.standaloneController.playlist).toEqual(before.devices.standaloneController.playlist);
      const lookedUp = after.devices.standaloneController.looks.find(look => look.id === lookId);
      const originalLook = before.devices.standaloneController.looks.find(look => look.id === lookId);
      expect(lookedUp.label).toBe(lookName);
      expect(lookedUp.defaultLook).toMatchObject(originalLook.defaultLook);
      expect(lookedUp.sectionLooks[removedSectionId]).toBeUndefined();
      for (const [index, id] of fixture.sectionIds.entries()) {
        expect(lookedUp.sectionLooks[id]).toMatchObject({
          patternId: fixture.patterns[index],
          brightness: index === 4 ? fixture.defaultBrightness : fixture.savedBrightness,
        });
      }

      await page.getByRole('tab', { name: /Project stacks/ }).click();
      await page.getByRole('button', { name: `Edit ${lookName}`, exact: true }).click();
      const editor = page.getByTestId('stack-save-bar');
      await expect(editor).toBeVisible();
      const assignments = editor.getByRole('group', { name: 'Section assignments' });
      const sectionList = assignments.getByRole('list', { name: scenario.mixed ? 'Sections and patterns' : 'Fire sections' });
      await expect(sectionList.getByRole('button')).toHaveCount(5);
      if (!scenario.mixed) await expect(assignments.getByText('Fire', { exact: true })).toHaveCount(1);
      for (const [index, id] of fixture.sectionIds.entries()) {
        const section = sectionList.getByTestId(`stack-edit-section-${id}`);
        await expect(section).toContainText(sectionNames[index]);
        await expect(section).toHaveAccessibleName(`Edit ${sectionNames[index]}`);
        const patternName = fixture.patterns[index].replace(/^./, letter => letter.toUpperCase());
        await expect(section).toHaveAccessibleDescription(patternName);
        if (scenario.mixed) await expect(section.getByText(patternName, { exact: true })).toBeVisible();
        await expect(section).toBeEnabled();
      }
      await editor.getByTestId(`stack-edit-section-${fixture.sectionIds[4]}`).click();
      const lastSection = page.getByTestId(`section-target-${fixture.sectionIds[4]}`);
      await expect(lastSection).toHaveAttribute('aria-pressed', 'true');
      for (const [index, id] of fixture.sectionIds.entries()) {
        await expect(page.getByTestId(`section-pattern-${id}`)).toContainText(
          fixture.patterns[index].replace(/^./, letter => letter.toUpperCase()),
        );
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    });
  });
}

test('a real GPIO conflict still offers the wiring route on Patterns and Playlist', async ({ page }) => {
  await seedSavedLookSectionChanges(page, { mixed: true, gpioConflict: true });
  await page.goto('/#screen=playlist');
  await expect(cueSections(page.getByTestId(`playlist-row-${cueId}`))).toBeVisible();
  await editSections(page.getByTestId('playlist-install-blockers')).click();
  await updateSections(page.getByTestId('stack-review')).click();
  const patternHardware = page.getByTestId('hardware-configuration-warning');
  await expect(patternHardware).toContainText(/GPIO 5/);
  await expect(patternHardware.getByRole('button', { name: 'Fix wiring' })).toBeVisible();
  await page.getByTestId('stack-arrange-playlist').click();
  const playlistHardware = page.getByTestId('playlist-hardware-warning');
  await expect(playlistHardware).toContainText(/GPIO 5/);
  await playlistHardware.getByRole('button', { name: 'Fix wiring' }).click();
  await expect(page).toHaveURL(/#screen=layout&mode=draw$/);
});

test('Playlist links to the exact blocked look, and repair preserves its playlist and waits for an explicit install', async ({ page }) => {
  const { project, sectionIds } = await seedSavedLookSectionChanges(page, { mixed: true });
  const { card, writes } = await attachPracticeCard(page, project);

  await page.goto('/#screen=playlist');
  await expect(page.getByTestId('card-link-status')).toContainText('Connected');
  const install = page.getByRole('button', { name: 'Install playlist on card', exact: true });
  await expect(install).toBeDisabled();
  const blockers = page.getByTestId('playlist-install-blockers');
  const link = editSections(blockers);
  await expect(link).toHaveAttribute('href', `#screen=pattern&editStack=${lookId}`);
  await expect(blockers).toContainText(lookName);
  await expect(blockers.getByText('Fix wiring', { exact: true })).toHaveCount(0);
  const cue = page.getByTestId(`playlist-row-${cueId}`);
  await expect(cueSections(cue)).toBeVisible();
  await expect(cue.getByRole('button', { name: 'Live', exact: true })).toBeDisabled();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#screen=pattern$/);
  const correction = updateSections(page.getByTestId('stack-review'));
  await expect(correction).toBeFocused();
  await expect(page.getByTestId('look-name')).toHaveValue(lookName);
  expect(writes()).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(correction).toHaveCount(0);
  await expect.poll(async () => (
    Object.keys((await readProject(page)).devices.standaloneController.looks[0].sectionLooks).sort()
  )).toEqual(sectionIds.slice().sort());
  expect(writes()).toEqual([]);
  const playlist = page.getByTestId('stack-arrange-playlist');
  await expect(playlist).toHaveAttribute('href', '#screen=playlist');
  await playlist.click();
  await expect(page.getByTestId('playlist-install-blockers')).toHaveCount(0);
  await expect(cue).toContainText(lookName);
  await expect(install).toBeEnabled();
  expect(writes()).toEqual([]);

  // Same project and wiring; a normal Save has no extra click, but one that
  // would remove the card's other look must stop before sending configuration.
  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await page.getByTestId('pattern-install-on-card').click();
  const guard = page.getByTestId('look-loss-guard');
  await expect(guard).toBeVisible();
  await expect(guard.getByRole('button', { name: 'Replace anyway' })).toBeVisible();
  await expect(guard).toContainText(originalCardLook.id);
  expect(writes()).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/screen=playlist/);
  await expect(cue).toContainText(lookName);
  expect(writes()).toEqual([]);
  expect(card.state.patterns.map(pattern => pattern.id)).toEqual([originalCardLook.id]);
});

for (const variant of [
  { name: 'an installed card', blank: false, cardStatus: 'Connected', saveButton: 'layout-send-to-card' },
  { name: 'a factory-blank card', blank: true, cardStatus: 'Needs project', saveButton: 'blank-card-save' },
]) {
  test(`Card setup sends no configuration and links to the stale look when installing to ${variant.name}`, async ({ page }) => {
    const { project } = await seedSavedLookSectionChanges(page, { mixed: true });
    const { card, writes } = await attachPracticeCard(page, project, variant.blank);
    await page.goto('/#screen=card&section=setup&task=install-project');
    await expect(page.getByTestId('card-link-status')).toContainText(variant.cardStatus);
    await page.getByTestId(variant.saveButton).click();

    const warning = variant.blank
      ? page.getByTestId('blank-card-save-status')
      : page.locator('.la-card-push-banner').filter({ hasText: 'Update saved looks before installing.' });
    await expect(warning).toContainText('Update saved looks before installing.');
    const link = editSections(warning);
    await expect(link).toHaveAttribute('href', `#screen=pattern&editStack=${lookId}`);
    expect(writes()).toEqual([]);
    await link.click();
    await expect(updateSections(page.getByTestId('stack-review'))).toBeFocused();
    await expect(page.getByTestId('look-name')).toHaveValue(lookName);
    expect((await readProject(page)).devices.standaloneController.looks[0].sectionLooks).toHaveProperty(removedSectionId);
    expect(card.state.projectId).toBe(variant.blank ? '' : project.id);
    expect(writes()).toEqual([]);
  });
}
