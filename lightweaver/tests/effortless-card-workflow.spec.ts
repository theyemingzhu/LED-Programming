import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createCardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

const READY = /^connected-(direct|bridge)$/;

async function firstAction(page: Page) {
  return page.evaluate(() => {
    const journey = document.querySelector('[data-testid="setup-journey"]');
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
    };
    const heading = [...journey.querySelectorAll('h2')].find(visible);
    const primary = [...journey.querySelectorAll('button.btn.primary')].find(visible);
    const identity = journey.querySelector('[data-testid="setup-identity-row"]');
    return {
      heading: heading?.textContent?.trim() || '',
      primary: primary?.textContent?.trim() || '',
      headingTop: heading?.getBoundingClientRect().top ?? Infinity,
      primaryTop: primary?.getBoundingClientRect().top ?? Infinity,
      identityTop: identity?.getBoundingClientRect().top ?? Infinity,
      primaryCount: [...journey.querySelectorAll('button.btn.primary')].filter(visible).length,
    };
  });
}

test('the next Card action leads an unplugged first visit', async ({ page }) => {
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('setup-connect-card')).toBeVisible();

  const action = await firstAction(page);
  expect(action.heading).toBe('Find my card');
  expect(action.primary).toBe('Find my card');
  expect(action.primaryCount).toBe(1);
  expect(action.headingTop).toBeLessThan(action.identityTop);
  expect(action.primaryTop).toBeLessThan(action.identityTop);
});

test('a completed Card leads with play while light count and colour stay openable', async ({ page }) => {
  const spec = cardState('installed-match');
  const card = createCardSimulator(spec);
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
        wiring: { verified: true, runs: [{ id: 'strip-1', type: 'strip', verified: true, physicalDirection: 'source-forward' }] },
      },
      portRoles: [{ port: 'out1', role: 'strip', pin: project.pin, pixelCount: project.pixels }],
      devices: { standaloneController: { led: { colorOrder: 'GRB', colorOrderConfirmed: true, confirmedColorOrder: 'GRB' } } },
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
  await card.install(page);
  await page.goto('/#screen=card&section=setup', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return getSharedCardLink().getState()?.state || '';
  }), { timeout: 15000 }).toMatch(READY);
  await expect(page.getByTestId('setup-journey')).toHaveAttribute('data-journey-complete', 'true');

  const action = await firstAction(page);
  expect(action.heading).toBe('Open Patterns');
  expect(action.primary).toBe('Open Patterns');
  expect(action.primaryCount).toBe(1);
  expect(action.headingTop).toBeLessThan(action.identityTop);
  expect(action.primaryTop).toBeLessThan(action.identityTop);

  await page.getByTestId('setup-phase-lights').locator('.lw-setup-phase-head').click();
  await expect(page.getByTestId('setup-lights-action')).toBeVisible();
  await expect(page.getByTestId('setup-active-task').getByText(/light count/i)).toBeVisible();
  expect((await firstAction(page)).primary).toBe('Open Patterns');
});
