import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { cardState } from './harness/cardStates';
import { createPracticeCard } from './harness/practiceTiming';

const evidenceDirectory = process.env.LW_WIRING_EVIDENCE;
const studioHome = '/#screen=card&section=overview';

async function capture(page: Page, name: string, node: Locator) {
  if (!evidenceDirectory) return;
  mkdirSync(evidenceDirectory, { recursive: true });
  await node.evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: resolve(evidenceDirectory, `${name}-viewport.png`), scale: 'css' });
  await node.screenshot({ path: resolve(evidenceDirectory, `${name}.png`), scale: 'css' });
}

type FixtureOptions = { incomplete?: boolean, designCounts?: number[], outputOrder?: number[], differentProject?: boolean, cardCopy?: boolean };

async function boot(page: Page, planned: number[], counted: number[], configured: number[], options: FixtureOptions = {}) {
  const counts = [31, 37, 43, 49];
  const spec = {
    ...cardState('installed-match'),
    projectName: 'Four-output piece',
    pin: configured[0],
    pixels: counts.reduce((total, count) => total + count, 0),
  };
  const card = createPracticeCard(spec, {
    timing: 'real',
    initialOutputs: (options.outputOrder || configured.map((_, index) => index)).map(index => ({
      id: `out${index + 1}`, pin: configured[index], pixels: counts[index],
    })),
  }).card;
  if (options.incomplete) {
    // The card reports a total for four outputs but omits one output record.
    card.state.explicitOutputs = card.state.explicitOutputs.slice(0, -1);
  }
  await card.install(page);
  const identity = {
    id: card.state.cardId, firmwareVersion: card.state.firmwareVersion, buildId: card.state.buildId,
  };
  await page.addInitScript(({ planned, counted, counts, designCounts, spec, identity, differentProject, cardCopy }) => {
    const strips = planned.map((_, index) => ({
      id: `strip-${index + 1}`, name: `Strip ${index + 1}`,
      pathData: `M 20 ${20 + index * 50} L 200 ${20 + index * 50}`,
      pixelCount: designCounts[index], color: '#ffc080', x: 0, y: 0,
    }));
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, ...identity }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3, id: differentProject ? 'other-layout-fixture' : spec.projectId, name: spec.projectName,
      ...(cardCopy ? { origin: { kind: 'card-partial', cardId: identity.id, at: 1 } } : {}),
      portRoles: counted.map((pin, index) => ({ pin, role: 'strip', pixelCount: counts[index] })),
      layout: {
        starterPending: false, symmetryOfferDismissed: true, strips, viewBox: '0 0 240 240',
        wiring: {
          version: 1, locked: false, verified: cardCopy === true,
          outputs: planned.map((pin, index) => ({
            id: `out${index + 1}`, name: `Output ${index + 1}`, pin, runIds: [`run-${index + 1}`],
          })),
          runs: strips.map((strip, index) => ({
            id: `run-${index + 1}`, type: 'strip',
            source: { stripId: strip.id, from: 0, to: strip.pixelCount - 1 },
          })),
        },
      },
      devices: { standaloneController: { led: { colorOrder: 'GRB', psuAmps: 2, milliampsPerPixel: 60 } } },
    }));
  }, { planned, counted, counts, designCounts: options.designCounts || [38, 37, 43, 49], spec, identity, differentProject: options.differentProject, cardCopy: options.cardCopy });
  const statusResponse = page.waitForResponse(response =>
    response.ok() && new URL(response.url()).hostname === 'lightweaver.local'
    && new URL(response.url()).pathname === '/api/status');
  await page.goto(studioHome);
  const status = await (await statusResponse).json();
  expect(status.cardId).toBe(identity.id);
  await expect(page.getByTestId('card-link-status')).toHaveAccessibleName(/Connected|Lights off/i);
  return card;
}

async function expectPins(scope: ReturnType<Page['getByTestId']>, planned: string, counted: string, live: string) {
  await expect(scope.getByTestId('planned-pins')).toHaveText(planned);
  await expect(scope.getByTestId('last-counted-pins')).toHaveText(counted);
  await expect(scope.getByTestId('card-configured-pins')).toHaveText(live);
}

test('four moved outputs retain separate evidence and open the installer from Card Home and Wire', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = await boot(page, [15, 16, 17, 18], [15, 16, 38, 41], [15, 16, 38, 41]);
  const facts = page.getByTestId('fact-outputs');
  await expectPins(facts, 'GPIO 15, 16, 17, 18', 'GPIO 15, 16, 38, 41', 'GPIO 15, 16, 38, 41');
  await expect(facts.getByTestId('pin-mismatch-out3')).toContainText('Output 3 · GPIO 17');
  await expect(facts.getByTestId('pin-mismatch-out4')).toContainText('Output 4 · GPIO 18');
  await expect(facts.getByTestId('pin-mismatch-out1')).toContainText('Design: 38 LEDs · Last counted: 31 LEDs');
  await expect(facts.getByTestId('pin-mismatch-out2')).toHaveCount(0);
  await expect(facts.getByTestId('pin-mismatch-out3')).toContainText('Card config: GPIO 38');
  await expect(page.getByTestId('fact-lights')).toContainText('Last counted: 160');
  await expect(page.getByTestId('fact-lights')).toContainText('167');
  await expect(page.getByTestId('fact-color-order').getByRole('button', { name: 'Check colors' })).toBeVisible();
  await capture(page, 'card-home-desktop', facts);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'card-home-phone', facts);
  await page.setViewportSize({ width: 1440, height: 900 });
  await facts.getByRole('link', { name: 'Change wiring', exact: true }).press('Enter');
  await expect(page).toHaveURL(/#screen=discovery$/);
  await expect(page.getByRole('dialog', { name: 'Find my strips' })).toBeVisible();
  await page.goBack();
  await facts.getByRole('link', { name: 'Open Layout', exact: true }).click();

  const wire = page.getByTestId('layout-wire-tools');
  await expectPins(wire, 'GPIO 15, 16, 17, 18', 'GPIO 15, 16, 38, 41', 'GPIO 15, 16, 38, 41');
  await expect(wire.getByTestId('wire-capacity')).toHaveText('Design: 167 LEDs · Last counted: 160 LEDs');
  await expect(wire.getByTestId('pin-mismatch-out1')).toContainText('Design: 38 LEDs · Last counted: 31 LEDs');
  await expect(wire.getByTestId('wire-full-white')).toContainText('10.02 A');
  await expect(wire.getByRole('alert').filter({ hasText: /supply/i })).toBeVisible();
  await expect(wire.getByRole('button', { name: 'Use GPIO 38' })).toHaveCount(0);
  await expect(wire.getByRole('combobox', { name: 'Pin for LED output' })).toBeEnabled();
  await expect(wire.getByRole('link', { name: 'Replace GPIO 38' })).toHaveAttribute('href', '#screen=discovery&replace=38');
  await expect(wire.getByRole('link', { name: 'Replace GPIO 41' })).toHaveAttribute('href', '#screen=discovery&replace=41');
  const wireEvidence = wire.getByRole('region', { name: 'Wiring evidence' });
  await capture(page, 'wire-desktop', wireEvidence);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'wire-phone', wireEvidence);
  await page.setViewportSize({ width: 1440, height: 900 });
  await wire.getByRole('link', { name: 'Scan pins' }).click();
  await expect(page).toHaveURL(/#screen=discovery$/);
  await expect(page.getByRole('dialog', { name: 'Find my strips' })).toBeVisible();
  await page.goBack();
  await wire.getByRole('link', { name: 'Replace GPIO 38' }).press('Enter');
  await expect(page).toHaveURL(/#screen=discovery&replace=38$/);
  await expect(page.getByRole('heading', { name: 'Replace GPIO 38' })).toBeVisible();
  expect(card.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
});

test('same pin sets and totals still show swapped output IDs and per-pin count differences', async ({ page }) => {
  const card = await boot(page, [15, 16, 17, 18], [15, 16, 17, 18], [16, 15, 17, 18], {
    outputOrder: [2, 0, 3, 1], designCounts: [38, 30, 43, 49],
  });
  const facts = page.getByTestId('fact-outputs');
  await expectPins(facts, 'GPIO 15, 16, 17, 18', 'GPIO 15, 16, 17, 18', 'GPIO 17, 16, 18, 15');
  await expect(facts.getByTestId('pin-mismatch-out1')).toContainText('Card config: GPIO 16');
  await expect(facts.getByTestId('pin-mismatch-out2')).toContainText('Card config: GPIO 15');
  await expect(facts.getByTestId('pin-mismatch-out1')).toContainText('Design: 38 LEDs · Last counted: 31 LEDs');
  await expect(facts.getByTestId('pin-mismatch-out2')).toContainText('Design: 30 LEDs · Last counted: 37 LEDs');
  await expect(facts.getByTestId('pin-mismatch-out3')).toHaveCount(0);
  await expect(facts.getByTestId('pin-mismatch-out4')).toHaveCount(0);
  await facts.getByRole('link', { name: 'Open Layout' }).click();
  const wire = page.getByTestId('layout-wire-tools');
  await expect(wire.getByTestId('wire-capacity')).toHaveCount(0);
  await expect(wire.getByTestId('pin-mismatch-out1')).toContainText('Card config: GPIO 16');
  await expect(wire.getByRole('link', { name: 'Scan pins' })).toBeVisible();
  expect(card.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
});

test('a different installed project has a separate live pin list without per-output associations', async ({ page }) => {
  await boot(page, [15, 16, 17, 18], [15, 16, 17, 18], [15, 16, 38, 41], {
    designCounts: [31, 37, 43, 49], differentProject: true,
  });
  const facts = page.getByTestId('fact-outputs');
  await expectPins(facts, 'GPIO 15, 16, 17, 18', 'GPIO 15, 16, 17, 18', 'GPIO 15, 16, 38, 41');
  await expect(facts.getByRole('list', { name: 'Outputs to re-test' })).toHaveCount(0);
  await expect(facts.getByRole('link', { name: /Replace GPIO/ })).toHaveCount(0);
  await facts.getByRole('link', { name: 'Open Layout' }).click();
  const wire = page.getByTestId('layout-wire-tools');
  await expect(wire.getByTestId('card-configured-pins')).toHaveText('GPIO 15, 16, 38, 41');
  await expect(wire.getByRole('list', { name: 'Outputs to re-test' })).toHaveCount(0);
  await expect(wire.getByRole('link', { name: /Replace GPIO/ })).toHaveCount(0);
});

test('a card reconstruction keeps count and physical-check history unknown', async ({ page }) => {
  await boot(page, [15, 16, 17, 18], [15, 16, 17, 18], [15, 16, 17, 18], {
    designCounts: [31, 37, 43, 49], cardCopy: true,
  });
  const facts = page.getByTestId('fact-outputs');
  await expectPins(facts, 'GPIO 15, 16, 17, 18', 'Unknown', 'GPIO 15, 16, 17, 18');
  await expect(facts).not.toContainText('Verified in design');
  await expect(page.getByTestId('fact-lights')).toContainText('Last counted: unknown');
  await facts.getByRole('link', { name: 'Open Layout' }).click();
  const wire = page.getByTestId('layout-wire-tools');
  await expect(wire.getByTestId('last-counted-pins')).toHaveText('Unknown');
  await expect(wire.getByRole('link', { name: 'Scan pins' })).toBeVisible();
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('GPIO matches survive reordered outputs and incomplete or offline card evidence stays unknown', async ({ page }) => {
    const card = await boot(page, [18, 15, 17, 16], [15, 16, 18, 42], [42, 18, 15, 16], { incomplete: true, designCounts: [43, 31, 49, 37] });
    const facts = page.getByTestId('fact-outputs');
    await expectPins(facts, 'GPIO 18, 15, 17, 16', 'GPIO 15, 16, 18, 42', 'Unknown');
    await expect(facts.getByTestId('pin-mismatch-out3')).toContainText('Output 3 · GPIO 17');
    for (const exact of ['out1', 'out2', 'out4']) await expect(facts.getByTestId(`pin-mismatch-${exact}`)).toHaveCount(0);
    expect(await facts.evaluate(node => node.scrollWidth)).toBeLessThanOrEqual((await facts.boundingBox())!.width);
    await capture(page, 'card-home-phone-incomplete', facts);
    await facts.getByRole('link', { name: 'Open Layout', exact: true }).tap();

    const wire = page.getByTestId('layout-wire-tools');
    await expectPins(wire, 'GPIO 18, 15, 17, 16', 'GPIO 15, 16, 18, 42', 'Unknown');
    await expect(wire.getByRole('link', { name: 'Replace GPIO 42' })).toHaveCount(0);
    const evidence = wire.getByTestId('wiring-pin-evidence');
    expect(await evidence.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await capture(page, 'wire-phone-incomplete', wire.getByRole('region', { name: 'Wiring evidence' }));
    card.goOffline();
    await page.reload();
    await expect(wire.getByTestId('card-configured-pins')).toHaveText('Unknown');
    await wire.getByRole('link', { name: 'Scan pins' }).tap();
    await expect(page).toHaveURL(/#screen=discovery$/);
    await expect(page.getByTestId('card-setup-overlay')).toBeVisible();
    expect(card.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
  });
});
