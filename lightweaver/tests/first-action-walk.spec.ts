// First-action manager — docs/journeys/first-action-manager.md
//
// Auto-detect the arrival, put that next step first, keep earlier LED work
// reachable. J01/J02 prove click paths. This file proves the first paint
// and that count / colour order stay a door after a project is loaded.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID } from './harness/cardStates';
import { bootSetUp } from './ux/journeySeed';

const CONNECT_BUDGET_MS = 15000;
const CONNECTED = /^connected-(direct|bridge)$/;
const SCREEN_DIR = '../.claude/ux-screens/first-action';
mkdirSync(SCREEN_DIR, { recursive: true });

type FirstActionReport = {
  step: string;
  heading: string;
  firstHeading: string;
  firstButton: string;
  firstPrimary: string;
  primaryCount: number;
  primaryLabels: string[];
  journeyTask: string;
  journeyComplete: string;
  project: string;
  installed: string;
  lightsPhaseOpen: boolean;
  reviewLightsVisible: boolean;
};

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  });
}

async function waitConnectedUnaided(page: Page, note: string) {
  await expect.poll(() => linkState(page), { timeout: CONNECT_BUDGET_MS, intervals: [250] })
    .toMatch(CONNECTED, { message: note } as never);
}

async function readFirstAction(page: Page, step: string): Promise<FirstActionReport> {
  return page.evaluate((stepId) => {
    const main = document.querySelector('.card-workspace-body') || document.body;
    const visible = (el: Element | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
    };
    const textOf = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const heading = textOf(document.querySelector('h1'));
    const firstHeading = [...main.querySelectorAll('h1, h2')]
      .find(el => visible(el) && textOf(el) && textOf(el) !== heading);
    const chromeButton = el => (
      el.classList.contains('lw-setup-phase-head')
      || el.classList.contains('lw-setup-identity-door')
      || el.classList.contains('lw-identity-name')
      || el.classList.contains('lw-status-update')
      || ['setup-identity-connection', 'setup-identity-lights', 'setup-project-name-edit', 'setup-optional-firmware'].includes(el.getAttribute('data-testid') || '')
    );
    const buttons = [...main.querySelectorAll('button, [role="button"]')]
      .filter(el => visible(el) && !chromeButton(el));
    const primaries = [...main.querySelectorAll('.btn.primary')].filter(el => visible(el));
    const identity = [...document.querySelectorAll('[data-testid="setup-identity-row"] > div')].map(div => ({
      label: textOf(div.querySelector('span')),
      value: textOf(div.querySelector('strong')),
    }));
    const journey = document.querySelector('[data-testid="setup-journey"]');
    const lightsPhase = document.querySelector('[data-testid="setup-phase-lights"]');
    const reviewLights = document.querySelector('[data-testid="setup-lights-action"]');
    return {
      step: stepId,
      heading,
      firstHeading: textOf(firstHeading || null),
      firstButton: textOf(buttons[0] || null),
      firstPrimary: textOf(primaries[0] || null),
      primaryCount: primaries.length,
      primaryLabels: primaries.map(textOf),
      journeyTask: journey?.getAttribute('data-journey-task') || '',
      journeyComplete: journey?.getAttribute('data-journey-complete') || '',
      project: identity.find(row => /project/i.test(row.label))?.value || '',
      installed: identity.find(row => /installed/i.test(row.label))?.value || '',
      lightsPhaseOpen: Boolean(lightsPhase && visible(lightsPhase)),
      reviewLightsVisible: Boolean(reviewLights && visible(reviewLights)),
    };
  }, step);
}

async function captureStep(page: Page, step: string): Promise<FirstActionReport> {
  const report = await readFirstAction(page, step);
  await page.screenshot({ path: `${SCREEN_DIR}/${step}.png`, fullPage: false });
  writeFileSync(`${SCREEN_DIR}/${step}.json`, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function expectOneFirstAction(report: FirstActionReport, allowed: RegExp, note: string) {
  expect(report.primaryCount, `${report.step}: ${note} — primary count`).toBe(1);
  expect(report.firstPrimary, `${report.step}: ${note} — primary label`).toMatch(allowed);
  expect(report.firstButton, `${report.step}: ${note} — first button must be that same action`).toMatch(allowed);
}

async function pairFromSetup(page: Page, note: string) {
  const pair = page.getByTestId('setup-connect-card');
  await expect(pair).toHaveText('Connect this card', { timeout: CONNECT_BUDGET_MS });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lw_card_identity_v1'))).toBeNull();
  await pair.click();
  await waitConnectedUnaided(page, note);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_card_identity_v1') || 'null')?.id))
    .toBe(MATRIX_CARD_ID);
}

async function expectInstalledPlayback(page: Page, card: CardSimulator) {
  const previousPattern = card.playingId();
  const targetPattern = card.state.patterns.find(pattern => pattern.id !== previousPattern)!;
  const writesBefore = card.requests.filter(request => request.method === 'POST').length;
  await page.getByRole('button', { name: 'Control installed project', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: / controls$/ });
  const pattern = drawer.getByRole('combobox', { name: 'Pattern', exact: true });
  await expect(pattern).toBeEnabled();
  await expect(pattern).toHaveValue(previousPattern);
  expect(card.requests.filter(request => request.method === 'POST')).toHaveLength(writesBefore);

  await pattern.selectOption(targetPattern.id);
  await card.waitForPlaying(targetPattern.id, 8000);
  await expect(pattern).toHaveValue(targetPattern.id);
  expect(card.requests.filter(request => request.method === 'POST').slice(writesBefore).map(request => request.path))
    .toEqual(['/api/control']);
  await drawer.getByRole('button', { name: 'Close card controls' }).click();
  await expect(drawer).toBeHidden();
}

async function dispatchCardLinkEvents(page: Page, events: Record<string, unknown>[]) {
  await page.evaluate(async (linkEvents) => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    const link = getSharedCardLink();
    for (const event of linkEvents) {
      link.dispatch(event);
    }
  }, events);
}

test('[FA-unplugged] no card answering: Find my card is first', async ({ page }) => {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  const report = await captureStep(page, 'fa-unplugged');
  expect(report.heading).toMatch(/start lightweaver|set up your lightweaver/i);
  expectOneFirstAction(report, /^Set up this card$/, 'unplugged');
  await expect(page.getByTestId('board-setup-connect')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Board Manager', exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Start', exact: true }).getByRole('button', { name: 'Set up this card', exact: true }).click();
  const installer = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(installer.getByTestId('installer-setup-progress')).toBeVisible();
  await expect(installer.getByRole('button', { name: 'Inspect card over USB' })).toBeVisible();
});

test('[FA-plugged-blank] a plugged-in empty card offers one-tap pairing before find the lights', async ({ page }) => {
  const spec = cardState('factory-blank');
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toHaveText(/connect this card/i, {
    timeout: CONNECT_BUDGET_MS,
  });
  const firstPaint = await captureStep(page, 'fa-plugged-blank-first');
  expectOneFirstAction(firstPaint, /connect this card/i, 'plugged-in unpaired card');

  await pairFromSetup(page, 'FA-plugged-blank connect');
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-task', 'discover-lights', {
    timeout: CONNECT_BUDGET_MS,
  });
  const after = await captureStep(page, 'fa-plugged-blank-connected');
  expectOneFirstAction(after, /find and count the lights/i, 'plugged-in blank card');
  await page.getByRole('button', { name: 'Find and count the lights', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Find my strips' })).toBeVisible();
});

test('[FA-plugged-loaded] a plugged-in loaded card pairs explicitly, then opens on that project', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toHaveText(/connect this card/i, {
    timeout: CONNECT_BUDGET_MS,
  });
  const firstPaint = await captureStep(page, 'fa-plugged-loaded-first');
  expectOneFirstAction(firstPaint, /connect this card/i, 'plugged-in unpaired card');

  await pairFromSetup(page, 'FA-plugged-loaded connect');
  const home = page.getByTestId('card-installed-home');
  await expect(home).toContainText(spec.projectName);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}').name))
    .toBe(spec.projectName);
  const after = await captureStep(page, 'fa-plugged-loaded-connected');
  expect(after.firstHeading).not.toMatch(/newer card release|update/i);
  expectOneFirstAction(after, /^Control installed project$/, 'paired loaded card');

  await expectInstalledPlayback(page, card);
  await page.getByTestId('setup-identity-lights').click();
  await expect(page.getByTestId('setup-lights-action')).toBeFocused();
  const back = await captureStep(page, 'fa-plugged-loaded-back-to-lights');
  expect(back.reviewLightsVisible).toBe(true);
  expectOneFirstAction(back, /^Control installed project$/, 'lights stay a door');

  const boardSetup = page.getByTestId('board-setup-connect');
  await expect(boardSetup).toHaveAccessibleName('Set up this card');
  await expect(boardSetup).not.toHaveClass(/\bprimary\b/);
  await boardSetup.click();
  const installer = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  await expect(installer.getByTestId('installer-setup-progress')).toBeVisible();
  await expect(page.getByRole('dialog', { name: / controls$/ })).toHaveCount(0);
});

test('[FA-outdated] an outdated card puts Update first', async ({ page }) => {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toBeVisible({ timeout: CONNECT_BUDGET_MS });
  await dispatchCardLinkEvents(page, [{
    type: 'bridge-lost',
    reason: 'firmware-too-old',
    host: 'lightweaver.local',
  }]);
  await expect(page.getByRole('button', { name: /install or update firmware/i })).toBeVisible({
    timeout: CONNECT_BUDGET_MS,
  });
  const report = await captureStep(page, 'fa-outdated');
  expectOneFirstAction(report, /install or update firmware|update the card|update card/i, 'outdated card');
});

test('[FA-post-update-wifi] after an update, join the Lightweaver network first', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lw_chip_card_host', '192.168.4.1');
    localStorage.setItem('lw_card_host', '192.168.4.1');
  });
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-task', 'configure-wifi', {
    timeout: CONNECT_BUDGET_MS,
  });
  const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
  if (await dialog.isVisible().catch(() => false)) {
    const report = await captureStep(page, 'fa-post-update-wifi');
    expect(report.firstPrimary + report.firstButton + report.firstHeading).toMatch(
      /join|setup network|continue|lightweaver/i,
    );
    expect(report.firstPrimary).not.toMatch(/find and count the lights|open patterns/i);
    return;
  }
  const report = await captureStep(page, 'fa-post-update-wifi');
  expect(
    report.firstPrimary,
    'just-updated, not on home Wi-Fi: first action is join the setup network, not find lights',
  ).toMatch(/wifi|wi-fi|join|setup network|continue wi-fi/i);
});

test('[FA-resume-usb-wifi] saved exact preserving update opens its USB resume action from Card Home', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lw_chip_card_host', '192.168.4.1');
    localStorage.setItem('lw_card_host', '192.168.4.1');
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id: 'lw-aabbccddeeff' }));
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => ({}) } });
  });
  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  const manifest = await page.evaluate(async () => (await (await fetch('/firmware/release-manifest.json')).json()));
  await page.evaluate(release => {
    sessionStorage.setItem('lw_firmware_update_session_v1', JSON.stringify({
      version: 1, mode: 'usb', phase: 'restarting', cardId: 'lw-aabbccddeeff',
      previousBootId: 'boot-before-update', expectedProjectHead: '', expectedProjectFingerprint: '',
      targetFirmwareVersion: release.firmwareVersion, targetBuildId: release.buildId,
      targetBuildNumber: release.buildNumber, ticketSha256: 'a'.repeat(64), acknowledgedBytes: 0,
    }));
  }, manifest);
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-task', 'configure-wifi', {
    timeout: CONNECT_BUDGET_MS,
  });
  await page.getByRole('button', { name: 'Continue Wi-Fi setup', exact: true }).click();
  await expect(page).toHaveURL(/#screen=card&section=install$/);
  await expect(page.getByTestId('preserving-usb-wifi-resume')).toBeVisible();

  await page.goto('/#screen=card&section=overview', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const key = 'lw_firmware_update_session_v1';
    const saved = JSON.parse(sessionStorage.getItem(key) || '{}');
    sessionStorage.setItem(key, JSON.stringify({ ...saved, targetBuildId: 'b'.repeat(40) }));
  });
  await page.getByRole('button', { name: 'Continue Wi-Fi setup', exact: true }).click();
  await expect(page).toHaveURL(/#screen=card&section=overview$/);
  await expect(page.getByRole('dialog', { name: 'Connect Lightweaver' })).toBeVisible();
});


test('[FA-wifi-saved] saved home Wi-Fi continues to the next unfinished step', async ({ page }) => {
  const card = await bootSetUp(page);
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.getByRole('button', { name: 'Save in browser' }).click();
  await expect(page.getByTestId('workspace-notice')).toContainText('saved in browser library');
  const savedFingerprint = await page.evaluate(async projectId => {
    const { listProjectLibraryRecords } = await import('/src/lib/projectStorage.js');
    const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
    const records = await listProjectLibraryRecords();
    return cardProjectFingerprint(records.find(record => record.project.id === projectId)?.project);
  }, card.state.projectId);
  expect(savedFingerprint).toBe(card.state.projectFingerprint);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'FA-wifi-saved connect');
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-complete', 'true');
  const report = await captureStep(page, 'fa-wifi-saved');
  expect(report.firstHeading).not.toMatch(/join the|setup network/i);
  expectOneFirstAction(report, /^Control installed project$/, 'Wi-Fi already saved');

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const projects = page.getByRole('dialog', { name: 'Projects' });
  await projects.getByRole('button', { name: `Open ${card.state.projectName}`, exact: true }).click();
  await expect(projects).toBeHidden();
  await expect(page.getByTestId('card-installed-home')).toContainText('Your draft matches the installed project.');
  await expectInstalledPlayback(page, card);

  await page.getByTestId('setup-identity-lights').click();
  await expect(page.getByTestId('setup-lights-action')).toBeFocused();
  const back = await captureStep(page, 'fa-wifi-saved-back-to-lights');
  expectOneFirstAction(back, /^Control installed project$/, 'lights stay a door');
});

test('[FA-remembered] a remembered complete install still opens lights as a door, not as the next step', async ({ page }) => {
  const card = await bootSetUp(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'FA-remembered connect');
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-complete', 'true');
  const report = await captureStep(page, 'fa-remembered-complete');
  expect(report.heading).toMatch(/matrix piece|your lightweaver|lightweaver card/i);
  expect(report.firstHeading).not.toMatch(/newer card release|update/i);
  expectOneFirstAction(report, /^Control installed project$/, 'remembered complete install');
  await expectInstalledPlayback(page, card);
});

test('installed control leaves the footer’s pending draft save alone', async ({ page }) => {
  const card = await bootSetUp(page);
  await expect(page.getByTestId('card-link-status')).toHaveAttribute('data-lifecycle-state', 'ready');
  await page.getByTestId('setup-project-name-edit').click();
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Unsaved matrix draft');
  await page.getByRole('textbox', { name: 'Project name', exact: true }).press('Enter');
  const footer = page.getByTestId('card-link-status');
  await expect(footer).toHaveAttribute('data-lifecycle-state', 'content-mismatch');
  await expect(footer).toHaveAccessibleName(/Save to card/);

  await expectInstalledPlayback(page, card);
  await expect(footer).toHaveAccessibleName(/Save to card/);
  await expect(page.getByTestId('setup-project-name-edit')).toContainText('Unsaved matrix draft');
  expect(card.state.projectName).toBe('Matrix piece');
});

for (const differentProject of [false, true]) {
  test(`connection dialog names ${differentProject ? 'a different project' : 'a different revision of the same project'}`, async ({ page }) => {
    const card = await bootSetUp(page);
    await expect(page.getByTestId('card-link-status')).toHaveAttribute('data-lifecycle-state', 'ready');
    card.state.projectRevision += 1;
    if (differentProject) card.state.projectId = 'other-installed-piece';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('card-link-status')).toHaveAttribute('data-lifecycle-state', 'project-mismatch');
    await page.getByTestId('board-setup-connect').click();
    const dialog = page.getByRole('dialog', { name: 'Connect Lightweaver' });
    await expect(dialog.getByRole('heading', { name: 'Card connected', exact: true })).toBeVisible();
    await expect(dialog).toContainText(differentProject
      ? 'This card holds a different project from the one open in Studio.'
      : 'This card holds the same project at a different revision.');
  });
}
