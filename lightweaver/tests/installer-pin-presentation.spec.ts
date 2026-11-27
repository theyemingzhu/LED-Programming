import { expect, test, type Locator, type Page } from '@playwright/test';
import { draftBoard, REFERENCE_BOARDS } from '../src/lib/boardProfiles.js';
import { DEFAULT_CARD_CONTROLS } from '../src/lib/cardRuntimeContract.js';
import { cardState, MATRIX_PROJECT_ID } from './harness/cardStates';
import { createCardSimulator } from './harness/cardSimulator';

const CARD_ID = 'lw-d15c0ae00001';

async function openScan(page: Page, {
  profile = false, counted = [] as number[], installed = false, extraDeclared = [] as number[], preferredPin = null as number | null,
  lastCount = 41,
} = {}) {
  const card = installed
    ? createCardSimulator({ ...cardState('installed-match'), pixels: 41 * counted.length }, {
      cardId: CARD_ID,
      initialOutputs: counted.map((pin, index) => ({ id: `out${index + 1}`, pin, pixels: 41 })),
      outputTopology: { maxOutputs: 4, outputPins: [15, 16, 17, 18, 21, 38, 40, 41], sequenceVersion: 1, experimental: false },
    })
    : createCardSimulator(cardState('factory-blank'), { cardId: CARD_ID });
  const board = draftBoard(REFERENCE_BOARDS[0]);
  board.name = 'Practice board';
  board.revision = 1;
  board.groups = board.groups.map(group => ({
    ...group,
    pins: group.pins.map(pin => pin.gpio === 17 ? { ...pin, role: 'control', detail: 'External control' }
      : pin.gpio === 21 ? { ...pin, role: 'led' } : pin),
  }));
  await page.addInitScript(({ board, profile, counted, installed, extraDeclared, cardId, projectId, lastCount }) => {
    if (profile) localStorage.setItem('lw-board-profiles-v1', JSON.stringify({
      profiles: [board], confirmations: { [cardId]: { id: board.id, revision: board.revision } },
    }));
    const roles = [...counted, ...extraDeclared].map(pin => ({ pin, role: 'strip', pixelCount: lastCount }));
    if (roles.length) localStorage.setItem('lw_port_roles_v1', JSON.stringify(roles));
    if (installed) localStorage.setItem('lw_autosave_v3', JSON.stringify({
      version: 3, id: projectId, name: 'Matrix piece', portRoles: roles,
    }));
  }, { board, profile, counted, installed, extraDeclared, cardId: CARD_ID, projectId: MATRIX_PROJECT_ID, lastCount });
  if (installed) (card.state as { firmwareControls?: unknown }).firmwareControls = DEFAULT_CARD_CONTROLS;
  await card.install(page);
  await page.goto('/#screen=card&section=setup');
  await page.getByRole('button', { name: 'Connect this card', exact: true }).click();
  if (installed) {
    await expect(page.getByTestId('card-installed-home')).toBeVisible();
    await page.evaluate(pin => {
      window.location.hash = pin === null ? 'screen=discovery' : `screen=discovery&installer=1&pin=${pin}`;
    }, preferredPin);
  } else {
    await page.getByTestId('setup-lights-action').click();
  }
  await expect(page.getByTestId('discovery-plan')).toBeVisible();
  if (!installed && !counted.length) await expect(page.getByTestId('discovery-sweep-pin')).toHaveText(/^Testing GPIO \d+$/);
  return card;
}

async function expectReachable(target: Locator) {
  await expect(target).toBeEnabled();
  await expect(target).toBeInViewport({ ratio: 1 });
  await target.click({ trial: true });
}

async function expectPinTextInsideRows(rows: Locator) {
  const clipped = await rows.evaluateAll(buttons => buttons.flatMap(button => {
    const bounds = button.getBoundingClientRect();
    return [...button.querySelectorAll('strong, small')].filter(label => {
      const text = document.createRange();
      text.selectNodeContents(label);
      const lines = [...text.getClientRects()];
      return !lines.length || lines.some(rect => rect.left < bounds.left || rect.right > bounds.right
        || rect.top < bounds.top || rect.bottom > bounds.bottom);
    }).map(label => label.textContent);
  }));
  expect(clipped).toEqual([]);
}

for (const width of [1440, 390]) {
  test.describe(`pin scan at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width === 390, hasTouch: width === 390 });

    test('an exact board scan exposes the question and safety controls above the pinout', async ({ page }) => {
      const card = await openScan(page, { profile: true });
      const overlay = page.getByTestId('card-setup-overlay');
      const pins = overlay.getByRole('group', { name: 'Eligible LED pins' });
      await expect(pins.getByRole('button').first()).toContainText('GPIO 21');
      await expect(pins.getByRole('button', { name: /GPIO 17/ })).toHaveCount(0);
      await expectReachable(overlay.getByTestId('discovery-sweep-mine'));
      if (process.env.LW_SCAN_SHOTS) await page.screenshot({ animations: 'disabled', path: `${process.env.LW_SCAN_SHOTS}/after-sweep-${width}.png` });

      const pin = pins.getByRole('button', { name: 'GPIO 18', exact: true });
      await pin.press('Enter');
      await expect.poll(() => card.state.beaconPinned).toBe(18);
      const question = overlay.getByRole('heading', { name: 'Did the strip on GPIO 18 light up?' });
      await expect(question).toBeFocused();
      const power = overlay.getByRole('note');
      await expect(power).toContainText('capped at 2000 mA');
      await expect(power).toContainText('It survives restart until you save your project.');
      await expect(power).toContainText('Set the supply rating before installing.');
      expect((await power.textContent())?.match(/2000 mA/g)).toHaveLength(1);
      const yes = overlay.getByRole('button', { name: 'Yes', exact: true });
      await expectReachable(yes);
      expect((await yes.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await expectReachable(overlay.getByRole('button', { name: 'Try another pin' }));
      const stop = overlay.getByRole('button', { name: 'Stop lights', exact: true });
      await expectReachable(stop);
      await yes.focus();
      await page.keyboard.press('Tab');
      await expect(overlay.getByRole('button', { name: 'Try another pin' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(overlay.getByRole('button', { name: 'Full pinout' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
      expect(await overlay.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(card.requests.filter(request => request.path === '/api/config' && request.method === 'POST')).toEqual([]);
      if (process.env.LW_SCAN_SHOTS) await page.screenshot({ animations: 'disabled', path: `${process.env.LW_SCAN_SHOTS}/after-probe-${width}.png` });

      await overlay.getByRole('button', { name: 'Full pinout' }).press('Enter');
      const back = overlay.getByRole('button', { name: 'Back to strip check' });
      await expect(back).toBeFocused();
      await expect(overlay.getByTestId('discovery-pin-map').locator('[data-pin="17"]')).toContainText('External control');
      await expect(overlay.getByTestId('discovery-probe-17')).toHaveCount(0);
      await expectReachable(overlay.getByRole('button', { name: 'Stop lights', exact: true }));
      await back.press('Enter');
      await expect(overlay.getByRole('button', { name: 'Full pinout' })).toBeFocused();
      await overlay.getByRole('button', { name: 'Try another pin' }).press('Enter');
      await expect(overlay.getByRole('heading', { name: 'Pick the LED pin.' })).toBeFocused();
    });
    test('a full installed card puts move guidance ahead of the pinout and leaves Stop lights reachable', async ({ page }) => {
      const card = await openScan(page, { counted: [15, 16, 17, 18], installed: true, lastCount: 1024 });
      const overlay = page.getByTestId('card-setup-overlay');
      const pins = overlay.getByRole('group', { name: 'Eligible LED pins' });
      const slots = overlay.getByTestId('replacement-slots');
      const rows = slots.getByRole('listitem');
      const testPin = slots.getByRole('button', { name: 'Test GPIO 15', exact: true });
      const replace = slots.getByRole('button', { name: 'Replace GPIO 15', exact: true });
      const spareHeading = overlay.getByRole('heading', { name: 'Spare pins for a move', exact: true });
      await expect(spareHeading).toBeVisible();
      await expect(overlay.getByText('Board model unconfirmed', { exact: true })).toHaveCount(1);
      await expect(rows).toHaveCount(4);
      await expect(rows.first()).toContainText('Last counted: 1024');
      await expect(pins.getByTestId('discovery-probe-15')).toHaveCount(0);
      await expectPinTextInsideRows(rows);
      if (process.env.LW_SCAN_SHOTS) await page.screenshot({ animations: 'disabled', path: `${process.env.LW_SCAN_SHOTS}/assigned-pins-${width}.png` });
      if (width === 390) {
        await page.setViewportSize({ width: 320, height: 720 });
        const heading = await spareHeading.boundingBox();
        const pinout = await overlay.getByRole('button', { name: 'Full pinout' }).boundingBox();
        expect(pinout!.x).toBeGreaterThan(heading!.x + heading!.width);
        expect(pinout!.y + pinout!.height / 2).toBeCloseTo(heading!.y + heading!.height / 2, 0);
        await expectPinTextInsideRows(rows);
        await expectReachable(overlay.getByRole('button', { name: 'Stop lights', exact: true }));
        if (process.env.LW_SCAN_SHOTS) await page.screenshot({ animations: 'disabled', path: `${process.env.LW_SCAN_SHOTS}/assigned-pins-320.png` });
        await page.setViewportSize({ width, height: 480 });
      }

      const minimize = overlay.getByRole('button', { name: 'Minimize', exact: true });
      await minimize.focus();
      await page.keyboard.press('Tab');
      await expect(overlay.getByRole('button', { name: 'Close light check' })).toBeFocused();
      await replace.press('Enter');
      await overlay.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
      await expect(replace).toBeFocused();

      await testPin.press('Enter');
      await expect(overlay.getByRole('heading', { name: 'Did the strip on GPIO 15 light up?' })).toBeFocused();
      await expectReachable(overlay.getByRole('button', { name: 'Yes', exact: true }));
      await expectReachable(overlay.getByRole('button', { name: 'Stop lights', exact: true }));
      await overlay.getByRole('button', { name: 'Try another pin' }).press('Enter');
      if (width === 390) await page.setViewportSize({ width, height: 844 });
      await pins.getByRole('button', { name: 'GPIO 21', exact: true }).click();
      const notice = overlay.getByTestId('discovery-output-limit');
      await expect(notice).toContainText('All 4 output slots are in use');
      await expect(notice).toContainText('choose Replace next to its assigned pin');
      await expect(notice).not.toContainText('second card');
      await expect(overlay.getByRole('heading', { name: 'Move a strip to GPIO 21' })).toBeVisible();
      await expect(overlay.getByText('This pin has not been tested.')).toBeVisible();
      expect(card.state.beaconPinned).not.toBe(21);
      await expect(overlay.getByTestId('discovery-probe-busy')).toBeHidden();
      await expect(overlay.getByTestId('discovery-start')).toHaveCount(0);
      const stop = overlay.getByRole('button', { name: 'Stop lights', exact: true });
      await expectReachable(stop);
      if (process.env.LW_SCAN_SHOTS) await page.screenshot({ animations: 'disabled', path: `${process.env.LW_SCAN_SHOTS}/after-full-${width}.png` });
      await stop.press('Enter');
      await expect(overlay.getByRole('status').filter({ hasText: 'blackout confirmed by the card' })).toBeVisible();
      await expect.poll(() => card.state.currentId).toBe('blackout');
      expect(card.requests.filter(request => request.path === '/api/config' && request.method === 'POST')).toEqual([]);
    });

  });
}


test('an unknown board shows a reference and never treats saved counts as fresh observations', async ({ page }) => {
  const card = await openScan(page, { counted: [18] });
  const overlay = page.getByTestId('card-setup-overlay');
  await expect(overlay.getByText('Board model unconfirmed · Eligible LED pins')).toBeVisible();
  const pins = overlay.getByRole('group', { name: 'Eligible LED pins' });
  await expect(pins.getByRole('button').first()).toHaveText(/GPIO 18.*Last counted: 41/);
  await expect(pins.getByTestId('discovery-probe-4')).toHaveCount(0);
  await expect(overlay.getByText('Visually confirmed', { exact: true })).toHaveCount(0);
  await overlay.getByRole('button', { name: 'Full pinout' }).click();
  await expect(overlay.getByText('Reference pinout', { exact: true })).toBeVisible();
  await expect.poll(() => card.requests.some(request => request.path === '/api/firmware-info' && request.method === 'GET')).toBe(true);
  await expect(overlay.getByText('Board model unconfirmed. Match the labels on your board.')).toBeVisible();
  await expect(overlay.getByTestId('discovery-probe-4')).toHaveCount(0);
  expect(card.requests.filter(request => request.path === '/api/config' && request.method === 'POST')).toEqual([]);
});


test('an installer pin hint on a full card offers a move without testing the pin', async ({ page }) => {
  const counted = [15, 16, 17, 18];
  const card = await openScan(page, { counted, installed: true, preferredPin: 21 });
  const notice = page.getByTestId('discovery-output-limit');
  await expect(notice).toContainText('All 4 output slots are in use');
  await expect(page.getByTestId('discovery-start')).toHaveCount(0);
  expect(card.state.beaconPinned).not.toBe(21);
});

test('five declared outputs on a full installed card retain the capacity warning', async ({ page }) => {
  const card = await openScan(page, { counted: [15, 16, 17, 18], installed: true, extraDeclared: [21] });
  const overlay = page.getByTestId('card-setup-overlay');
  await overlay.getByTestId('discovery-probe-21').click();
  await expect(overlay.getByTestId('discovery-output-limit')).toContainText('use a second card for the rest');
  await expect(overlay.getByTestId('discovery-start')).toBeDisabled();
  expect(card.requests.filter(request => request.path === '/api/config' && request.method === 'POST')).toEqual([]);
});
