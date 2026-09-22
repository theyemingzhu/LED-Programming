// First-action manager — docs/journeys/first-action-manager.md
//
// Auto-detect the arrival, put that next step first, keep earlier LED work
// reachable. J01/J02 prove click paths. This file proves the first paint
// and that count / colour order stay a door after a project is loaded.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import {
  cardState,
  MATRIX_CARD_ID,
  MATRIX_BUILD_ID,
  MATRIX_FIRMWARE_VERSION,
  type CardStateSpec,
} from './harness/cardStates';

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

async function connectIfNeeded(page: Page, note: string) {
  if (CONNECTED.test(await linkState(page))) return;
  const find = page.getByTestId('setup-connect-card');
  if (await find.count()) await find.click();
  await waitConnectedUnaided(page, note);
}

async function seedKnownCard(page: Page, spec: CardStateSpec) {
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: spec.firmwareVersion, buildId: spec.buildId });
}

async function seedCompleteProject(page: Page, spec: CardStateSpec) {
  await page.addInitScript(({ id, firmwareVersion, buildId, project }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3,
      id: project.projectId,
      name: 'Matrix piece',
      layout: {
        starterPending: false,
        strips: [{ id: 'strip-1', pixels: project.pixels, pin: project.pin }],
        wiring: {
          verified: true,
          runs: [{ id: 'strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward' }],
        },
      },
      portRoles: [{ port: 'out1', role: 'strip', pin: project.pin, pixelCount: project.pixels }],
      devices: {
        standaloneController: {
          led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' },
        },
      },
    }));
    localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({
      version: 2,
      dirty: false,
      persistedDestination: null,
      installation: {
        cardId: id,
        projectRevision: project.projectRevision,
        projectFingerprint: project.projectFingerprint,
        studioFingerprint: project.projectFingerprint,
      },
    }));
  }, {
    id: MATRIX_CARD_ID,
    firmwareVersion: MATRIX_FIRMWARE_VERSION,
    buildId: MATRIX_BUILD_ID,
    project: {
      projectId: spec.projectId,
      projectRevision: spec.projectRevision,
      projectFingerprint: spec.projectFingerprint,
      pixels: spec.pixels,
      pin: spec.pin,
    },
  });
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
  expectOneFirstAction(report, /set up the card|plug in and find card|find my card/i, 'unplugged');
});

test('[FA-plugged-blank] a plugged-in empty card offers one-tap pairing before find the lights', async ({ page }) => {
  const spec = cardState('factory-blank');
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toHaveText(/pair this card/i, {
    timeout: CONNECT_BUDGET_MS,
  });
  const firstPaint = await captureStep(page, 'fa-plugged-blank-first');
  expectOneFirstAction(firstPaint, /pair this card/i, 'plugged-in unpaired card');

  await connectIfNeeded(page, 'FA-plugged-blank connect');
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-task', 'discover-lights', {
    timeout: CONNECT_BUDGET_MS,
  });
  const after = await captureStep(page, 'fa-plugged-blank-connected');
  expectOneFirstAction(after, /find and count the lights/i, 'plugged-in blank card');
});

test('[FA-plugged-loaded] a plugged-in loaded card pairs explicitly, then opens on that project', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toHaveText(/pair this card/i, {
    timeout: CONNECT_BUDGET_MS,
  });
  const firstPaint = await captureStep(page, 'fa-plugged-loaded-first');
  expectOneFirstAction(firstPaint, /pair this card/i, 'plugged-in unpaired card');

  await connectIfNeeded(page, 'FA-plugged-loaded connect');
  await expect.poll(async () => (await readFirstAction(page, 'poll')).journeyTask, {
    timeout: CONNECT_BUDGET_MS,
  }).not.toBe('connect-card');
  const after = await captureStep(page, 'fa-plugged-loaded-connected');

  expect(
    after.installed === 'Installed project matches' && /untitled/i.test(after.project),
    'Installed project matches is a lie while Studio is still on Untitled',
  ).toBe(false);
  expect(after.firstHeading).not.toMatch(/newer card release|update/i);
  expect(after.firstPrimary).toMatch(/use this card|load |open patterns/i);
  expect(after.primaryCount).toBe(1);

  // Back: LED count and colour order stay a door after the project is in play.
  await page.getByTestId('setup-identity-lights').click();
  const back = await captureStep(page, 'fa-plugged-loaded-back-to-lights');
  await expect(page.getByTestId('setup-lights-action')).toBeVisible();
  expect(
    back.reviewLightsVisible || /review|find|count|colour|color/i.test(back.firstPrimary + back.firstButton),
    'a loaded project must still open LED count / colour order',
  ).toBeTruthy();
  expect(back.primaryCount, 'going back to lights must not add a second primary').toBe(1);
  expect(back.firstPrimary).toMatch(/open patterns|use this card|load /i);

  expect(
    firstPaint.firstPrimary,
    'a loaded card that is already answering must not open on Find my card',
  ).toMatch(/use this card|load |open patterns/i);
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

test('[FA-wifi-saved] saved home Wi-Fi continues to the next unfinished step', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);
  await seedCompleteProject(page, spec);
  await card.install(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'FA-wifi-saved connect');
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-complete', 'true', {
    timeout: CONNECT_BUDGET_MS,
  });
  const report = await captureStep(page, 'fa-wifi-saved');
  expect(report.firstHeading).not.toMatch(/join the|setup network/i);
  expectOneFirstAction(report, /open patterns/i, 'Wi-Fi already saved');

  await page.getByTestId('setup-identity-lights').click();
  await expect(page.getByTestId('setup-lights-action')).toBeVisible();
  const back = await captureStep(page, 'fa-wifi-saved-back-to-lights');
  expectOneFirstAction(back, /open patterns/i, 'lights stay a door, not a second next step');
});

test('[FA-remembered] a remembered complete install still opens lights as a door, not as the next step', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);
  await seedCompleteProject(page, spec);
  await seedKnownCard(page, spec);
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await waitConnectedUnaided(page, 'FA-remembered connect');
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-complete', 'true', {
    timeout: CONNECT_BUDGET_MS,
  });
  const report = await captureStep(page, 'fa-remembered-complete');
  expect(report.heading).toMatch(/matrix piece|your lightweaver|lightweaver card/i);
  expect(report.firstHeading).not.toMatch(/newer card release|update/i);
  expectOneFirstAction(report, /open patterns/i, 'remembered complete install');
});
