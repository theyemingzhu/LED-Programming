import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { cardProjectFingerprint } from '../src/lib/cardProjectResolver.js';
import { installHttpsStudio, installPracticeCardPopup, STUDIO_ORIGIN } from './harness/bridgeTransport';
import { CARD_HOSTS } from './harness/cardSimulator';
import { MATRIX_HOST } from './harness/cardStates';
import { createFirstFindWiringExercise } from './harness/firstFindWiringFixture';
import { isLoopbackHost, isPrivateHost } from './harness/networkGuard';
import { counts, newPins, oldPins } from './harness/replacementFixture';
import { guardRealCard } from './ux/journeyRecorder';

const cardPage = `${STUDIO_ORIGIN}/#screen=card&section=setup`;
const outageMs = 9_000;
const moves = [[38, 17], [41, 18]] as const;

async function setUpCard(page: Page) {
  await guardRealCard(page);
  await page.context().route(url => isPrivateHost(url.hostname) && !isLoopbackHost(url.hostname), route => route.abort('connectionrefused'));
  const { card, draft, fingerprint } = createFirstFindWiringExercise();
  await card.install(page);
  await page.addInitScript(draft => {
    if (sessionStorage.getItem('first-find-wiring-started')) return;
    sessionStorage.setItem('first-find-wiring-started', '1');
    localStorage.setItem('lw_autosave_v3', JSON.stringify(draft));
    localStorage.setItem('lw_port_roles_v1', JSON.stringify(draft.portRoles));
  }, draft);
  return { card, draft, fingerprint };
}

async function watchGestures(page: Page) {
  const actions: { at: number; kind: string; label: string; hash: string }[] = [];
  await page.exposeFunction('__recordFirstFindWiring', action => actions.push(action));
  await page.addInitScript(() => {
    const record = (kind: string, label: string) => {
      void (window as typeof window & { __recordFirstFindWiring: (action: unknown) => Promise<void> }).__recordFirstFindWiring({
        at: Date.now(), kind, label, hash: location.hash,
      });
    };
    document.addEventListener('click', event => {
      const control = (event.target as Element)?.closest('button, a[href]');
      if (!event.isTrusted || !control) return;
      record(event.detail === 0 ? 'keyboard' : (event as PointerEvent).pointerType,
        (control.getAttribute('aria-label') || control.textContent || '').trim());
    }, true);
    document.addEventListener('keydown', event => {
      if (event.isTrusted && event.key === 'Escape') record('keyboard', 'Escape');
    }, true);
  });
  return actions;
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}

const readStudio = (page: Page) => page.evaluate(() => ({
  project: JSON.parse(localStorage.getItem('lw_autosave_v3') || 'null'),
  identity: JSON.parse(localStorage.getItem('lw_card_identity_v1') || 'null'),
  journal: JSON.parse(localStorage.getItem('lw_card_link_journal_v1') || '[]'),
}));

for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]] as const) {
  const phone = device === 'phone';
  test.describe(device, () => {
    test.use({ viewport, isMobile: phone, hasTouch: phone,
      ...(phone && { deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36' }),
    });

    test('one Find and Pair lead to two verified wiring moves and reopened readback', async ({ page, baseURL }, info) => {
      test.setTimeout(145_000);
      const { card, draft, fingerprint } = await setUpCard(page);
      const context = page.context();
      const gestures = await watchGestures(page);
      const lengths = () => card.state.explicitOutputs?.map(output => [output.pin, output.pixels]);
      const writes = () => card.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method));
      const tabWalks: { label: string; tabs: number; direction: string }[] = [];
      const focusSamples: { stage: string; tag: string; label: string; region: string }[] = [];
      const input = async (target: Locator, { beforeActivation, reverse = false }: {
        beforeActivation?: () => void; reverse?: boolean;
      } = {}) => {
        await expect(target).toBeVisible();
        await expect(target).toBeEnabled();
        if (phone) {
          await target.scrollIntoViewIfNeeded();
          beforeActivation?.();
          await target.tap();
          return;
        }
        const label = await target.getAttribute('aria-label') || (await target.innerText()).trim();
        const direction = reverse ? 'Shift+Tab' : 'Tab';
        let tabs = 0;
        while (tabs < 110 && !(await target.evaluate(element => element === document.activeElement))) {
          await page.keyboard.press(direction);
          tabs += 1;
        }
        tabWalks.push({ label, tabs, direction });
        await expect(target, `${label} should be reachable with ${direction}`).toBeFocused({ timeout: 1_000 });
        beforeActivation?.();
        await page.keyboard.press('Enter');
      };
      const sampleFocus = async (stage: string) => {
        if (phone) return;
        const focused = await page.evaluate(() => {
          const active = document.activeElement;
          return {
            tag: active?.tagName || '',
            label: active && active !== document.body
              ? (active.getAttribute('aria-label') || active.textContent || '').trim().slice(0, 120) : '',
            region: active?.closest('[role=dialog]')?.getAttribute('aria-labelledby') || '',
          };
        });
        focusSamples.push({ stage, ...focused });
      };
      const dismiss = async (dialog: Locator, label: string) => {
        if (phone) await input(dialog.getByRole('button', { name: label, exact: true }));
        else await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await sampleFocus(`after ${label}`);
      };
      const connection = page.getByRole('dialog', { name: 'Connect Lightweaver', exact: true });
      const expectConnectionFocus = () => expect.poll(() => connection.evaluate(element =>
        element.contains(document.activeElement)), { timeout: 3_000 }).toBe(true);
      const installed = page.getByRole('region', { name: 'Installed project' });
      const overlay = page.getByRole('dialog', { name: 'Find my strips', exact: true });
      const slots = overlay.getByTestId('replacement-slots');
      const steps: { label: string; at: number; bootId: string; pins?: (number | undefined)[][] }[] = [];
      const mark = (label: string) => steps.push({ label, at: Date.now(), bootId: card.state.bootId, pins: lengths() });
      const openChooser = async () => {
        await input(page.getByTestId('setup-identity-lights'));
        await input(page.getByTestId('setup-lights-action'));
        await expect(slots.getByRole('listitem')).toHaveCount(4);
      };
      const bridge = await installPracticeCardPopup(page, card, { hosts: CARD_HOSTS, shouldServe: () => false });
      let searchAt = 0;
      let failureAt = 0;
      const probes: { at: number; host: string; available: boolean }[] = [];
      for (const host of CARD_HOSTS) {
        await page.route(`http://${host}/api/status`, async route => {
          if (route.request().method() !== 'GET') return route.fallback();
          if (!searchAt) return route.abort('connectionrefused');
          failureAt ||= Date.now();
          const at = Date.now();
          const available = host !== '192.168.4.1' && at - failureAt >= outageMs;
          probes.push({ at, host, available });
          return available ? route.fallback() : route.abort('connectionrefused');
        });
      }
      await installHttpsStudio(page, baseURL!);
      try {
        await page.goto(cardPage, { waitUntil: 'domcontentloaded' });
        const openedAt = await page.evaluate(() => performance.timeOrigin);
        const before = await readStudio(page);
        expect(before.identity).toBeNull();
        expect(before.project?.id).toBe(draft.id);
        expect(cardProjectFingerprint(before.project)).toBe(fingerprint);
        expect(lengths()).toEqual(oldPins.map((pin, index) => [pin, counts[index]]));

        await input(page.getByRole('button', { name: 'Set up this card', exact: true }));
        await expect(connection).toBeVisible();
        await input(connection.getByRole('button', { name: 'Find card already on Wi-Fi', exact: true }), {
          beforeActivation: () => { searchAt = Date.now(); },
        });
        await expect.poll(() => probes.length).toBeGreaterThan(0);
        expect(probes[0].available).toBe(false);
        await expect(connection.getByRole('button', { name: /Try again|Retry/i })).toHaveCount(0);
        const pair = connection.getByRole('button', { name: 'Connect this card', exact: true });
        await expect(pair).toBeVisible({ timeout: 42_000 });
        mark('found');
        const identity = connection.locator('[data-action-id="pair-local-card"]');
        await expect(identity.getByText(card.state.cardId, { exact: true })).toBeVisible();
        await expect(identity).toContainText(MATRIX_HOST);
        expect((await readStudio(page)).identity).toBeNull();
        expect(probes.some(probe => probe.available && probe.at - failureAt >= outageMs)).toBe(true);
        expect(bridge.navigations.some(navigation => !navigation.served)).toBe(true);
        expect(writes()).toEqual([]);
        if (!phone) {
          await expectConnectionFocus();
          await sampleFocus('after Find');
        }
        await screenshot(page, info, '01-found-unpaired');

        await input(pair);
        await expect(connection.getByTestId('direct-card-identity')).toContainText(card.state.cardId);
        await expect.poll(async () => (await readStudio(page)).identity?.id).toBe(card.state.cardId);
        mark('paired');
        if (!phone) {
          await expectConnectionFocus();
          await sampleFocus('after Pair');
        }
        await dismiss(connection, 'Close connection center');
        if (!phone) await expect(page.locator(':focus')).toHaveAccessibleName('Set up this card');
        await expect(installed.getByTestId('card-draft-difference')).toContainText('Your draft matches the installed project.');
        await input(installed.getByRole('button', { name: 'Control installed project', exact: true }));
        const controls = page.getByRole('dialog', { name: /controls$/ });
        await expect(controls).toContainText('Connected on local network');
        await expect(controls.getByRole('button', { name: 'Next pattern', exact: true })).toBeEnabled();
        await screenshot(page, info, '02-installed-controls');
        await dismiss(controls, 'Close card controls');
        if (!phone) await expect(installed.getByRole('button', { name: 'Control installed project', exact: true })).toBeFocused();
        expect(writes()).toEqual([]);

        await openChooser();
        for (const pin of oldPins) await expect(slots.getByRole('button', { name: `Replace GPIO ${pin}`, exact: true })).toBeEnabled();
        await screenshot(page, info, '03-original-outputs');
        const expected = [...oldPins];
        for (const [from, to] of moves) {
          const availablePin = overlay.getByTestId('discovery-pin-map').getByRole('button', { name: `GPIO ${to}`, exact: true });
          await input(availablePin);
          await expect(overlay.getByRole('heading', { name: `Move a strip to GPIO ${to}`, exact: true })).toBeFocused();
          await input(slots.getByRole('button', { name: `Replace GPIO ${from}`, exact: true }), { reverse: true });
          await expect(overlay.getByRole('combobox', { name: 'New pin' })).toHaveValue(String(to));
          await expect(overlay.getByText(`Keeps the card’s ${counts[oldPins.indexOf(from)]}-LED setting.`, { exact: true })).toBeVisible();
          await input(overlay.getByRole('button', { name: 'Test replacement', exact: true }));
          const keep = overlay.getByRole('button', { name: 'Keep this pin', exact: true });
          await expect(keep, await overlay.getByTestId('replacement-flow').innerText()).toBeEnabled({ timeout: 45_000 });
          await expect(overlay.getByText(`Check those lights on the strip you moved to GPIO ${to}.`, { exact: false })).toBeVisible();
          expect(card.state.wiringTestActive).toBe(true);
          expected[oldPins.indexOf(from)] = to;
          expect(lengths()).toEqual(expected.map((pin, index) => [pin, counts[index]]));
          mark(`testing-${from}-to-${to}`);
          await screenshot(page, info, `04-test-gpio-${to}`);
          await input(keep);
          await expect(slots.getByTestId('replacement-status')).toHaveText(`GPIO ${to} saved and verified on the card.`, { timeout: 45_000 });
          await expect(slots.getByRole('heading', { name: 'Configured pins' })).toBeFocused();
          await expect(slots.getByRole('listitem')).toHaveCount(4);
          await expect(slots.getByRole('button', { name: `Replace GPIO ${from}`, exact: true })).toHaveCount(0);
          await expect(slots.getByRole('button', { name: `Replace GPIO ${to}`, exact: true })).toBeEnabled();
          mark(`saved-gpio-${to}`);
        }
        expect(card.state.projectId).toBe(draft.id);
        expect(card.state.wiringTestActive).toBe(false);
        expect(card.state.wiringTransactionOpen).toBe(false);
        expect(writes().map(request => request.path)).toEqual(moves.flatMap(() => [
          '/api/wiring/candidate', '/api/wiring/activate', '/api/wiring/confirm',
        ]));
        await screenshot(page, info, '05-two-replacements-saved');

        await input(overlay.getByRole('button', { name: 'Close light check', exact: true }));
        await expect(overlay).toBeHidden();
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(openedAt);
        const reopeningAt = Date.now();
        const freshRead = page.waitForResponse(async response => {
          if (!response.ok() || new URL(response.url()).pathname !== '/api/status'
            || response.request().timing().startTime < reopeningAt) return false;
          const status = await response.json().catch(() => null);
          return status?.cardId === card.state.cardId && status?.bootId === card.state.bootId;
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        expect(page.context()).toBe(context);
        expect(await page.evaluate(() => performance.timeOrigin)).toBeGreaterThan(openedAt);
        await expect(page.getByTestId('setup-identity-connection')).toContainText('Connected');
        const readback = await (await freshRead).json();
        expect(readback.projectId).toBe(draft.id);
        expect(readback.outputs.map(({ pin, pixels }: { pin: number; pixels: number }) => [pin, pixels]))
          .toEqual(newPins.map((pin, index) => [pin, counts[index]]));
        await openChooser();
        for (const [index, pin] of newPins.entries()) {
          const row = slots.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Replace GPIO ${pin}`, exact: true }) });
          await expect(row).toContainText(`Last counted: ${counts[index]}`);
          await expect(row.getByRole('button', { name: `Test GPIO ${pin}`, exact: true })).toBeEnabled();
        }
        for (const [pin] of moves) {
          await expect(slots.getByRole('button', { name: `Replace GPIO ${pin}`, exact: true })).toHaveCount(0);
          await expect(slots.getByRole('button', { name: `Test GPIO ${pin}`, exact: true })).toHaveCount(0);
        }
        await screenshot(page, info, '06-reopened-live-outputs');
        const reopened = await readStudio(page);
        expect(reopened.identity.id).toBe(card.state.cardId);
        expect(reopened.project.id).toBe(draft.id);
        expect(reopened.project.layout.wiring.outputs.map((output: { pin: number }) => output.pin)).toEqual(newPins);
        expect(lengths()).toEqual(newPins.map((pin, index) => [pin, counts[index]]));
        expect(writes()).toHaveLength(6);
        mark('reopened-verified');

        expect(gestures.filter(action => action.label === 'Find card already on Wi-Fi')).toHaveLength(1);
        expect(gestures.filter(action => action.label === 'Connect this card')).toHaveLength(1);
        expect(gestures.filter(action => action.label === 'Test replacement')).toHaveLength(2);
        expect(gestures.filter(action => action.label === 'Keep this pin')).toHaveLength(2);
        expect([...new Set(gestures.map(action => action.kind))]).toEqual([phone ? 'touch' : 'keyboard']);
      } finally {
        const path = info.outputPath('journey.json');
        const evidence = {
          device, viewport, cardId: card.state.cardId, project: draft.id, fingerprint, searchAt, failureAt,
          probes, bridgeNavigations: bridge.navigations, gestures, tabWalks, focusSamples, steps, writes: writes().map(({ path, at }) => ({ path, at })),
          studio: await readStudio(page).then(({ identity, journal, project }) => ({
            identity, journal, draftPins: project?.layout?.wiring?.outputs?.map((output: { pin: number }) => output.pin),
            draftRoles: project?.portRoles?.filter((role: { role: string }) => role.role === 'strip'),
          })).catch(() => null),
        };
        await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
        await info.attach('sequential-journey', { path, contentType: 'application/json' });
        console.log(`[first-find-wiring] ${device}: ${JSON.stringify({ searchAt, failureAt, steps, gestures, tabWalks, focusSamples, writes: evidence.writes })}`);
      }
    });
  });
}
