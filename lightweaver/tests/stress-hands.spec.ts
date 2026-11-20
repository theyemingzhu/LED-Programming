// Impatient hands against a SIMULATED card. Never contacts a real device.
// Records, does not assert: every cell runs to the end and attaches a JSON
// record plus screenshots. Run with tests/stress-playwright.config.ts.
import { test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';
import { createDefaultProject } from '../src/lib/projectModel.js';
import { buildCardRuntimePackageFromProject } from '../src/lib/cardRuntimeProject.js';
import { cardProjectFingerprint } from '../src/lib/cardProjectResolver.js';
import { compileWiring } from '../src/lib/wiringCompiler.js';

const ALARM = /\b(fail(ed|ure)?|error|could ?n[o']t|cannot|can't|not sent|lost|refused|returned \d{3}|differs|different project|rolled back|roll(ed)?-?back|update available|not connected|disconnected|try again|offline|unreachable|json|http|timed? ?out|unexpected|reconnect|not reach|stuck|retry)\b/i;
const IDS = ['aurora', 'plasma', 'fire', 'ocean', 'ripple', 'lava', 'rainbow', 'sparkle', 'twinkle', 'meteor'];
const VIEWPORTS = [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }];

async function boot(page: Page, vp: { width: number; height: number }, hash = '/#screen=pattern') {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  const project: any = createDefaultProject();
  // The simulated card always reports WS2812B at 2000 mA; matching it keeps an
  // install from being classed as a rewire (harness limit, see report).
  project.devices.standaloneController.led.type = 'WS2812B';
  project.devices.standaloneController.led.maxMilliamps = 2000;
  const fp = cardProjectFingerprint(project);
  const c: any = (buildCardRuntimePackageFromProject({
    projectId: project.id, projectName: project.name, projectRevision: 0, projectFingerprint: fp,
    strips: project.layout.strips, patchBoard: project.layout.patchBoard,
    compiledWiring: compileWiring({ wiring: project.layout.wiring, strips: project.layout.strips, groups: project.layout.layerGroups }),
    standaloneController: project.devices.standaloneController }) as any).config;
  const card = createCardSimulator({
    ...cardState('installed-match'), projectId: project.id, projectName: project.name,
    projectFingerprint: fp, projectRevision: 0, pixels: 44, pin: 16,
    patterns: IDS.map(id => ({ id, label: id })), currentIndex: 0, currentId: 'aurora',
  });
  card.state.explicitOutputs = c.led.outputs.map((o: any) => ({ ...o }));
  card.state.installedZones = c.zones; card.state.installedLooks = c.looks;
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId, project, fp }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
    if (!localStorage.getItem('lw_autosave_v3')) {
      localStorage.setItem('lw_autosave_v3', JSON.stringify(project));
      localStorage.setItem('lw_project_lifecycle_v1', JSON.stringify({ version: 2, dirty: false, persistedDestination: 'browser',
        installation: { cardId: id, projectRevision: 0, projectFingerprint: fp, studioFingerprint: fp, verified: true } }));
    }
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID, project, fp });
  await page.goto(hash, { waitUntil: 'domcontentloaded' });
  const ms = await waitConnected(page, 20000);
  await page.waitForTimeout(2500);
  return { card, project, fp, firstConnectMs: ms };
}

async function linkState(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getSharedCardLink } = await import('/src/lib/cardLink.js');
    return String(getSharedCardLink().getState()?.state || '');
  }).catch(() => 'evaluate-failed');
}
async function waitConnected(page: Page, ms: number): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (/^connected-/.test(await linkState(page))) return Date.now() - t0;
    await page.waitForTimeout(250);
  }
  return null;
}
async function alarms(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const alarm = new RegExp(source, 'i');
    const seen = new Set<string>();
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const st = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    for (const el of Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"]'))) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && visible(el)) seen.add(`alert: ${t.slice(0, 200)}`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!t || t.length > 200 || !el || !visible(el)) continue;
      if (el.closest('details:not([open])')) continue;
      if (alarm.test(t)) seen.add(`text: ${t}`);
    }
    return Array.from(seen);
  }, ALARM.source).catch(() => ['evaluate-failed']);
}
async function busy(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!t || t.length > 120 || !el || !/(…|\.\.\.)$/.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && !el.closest('details:not([open])')) out.add(t);
    }
    return Array.from(out);
  }).catch(() => ['evaluate-failed']);
}
async function storedLooks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    try {
      const p = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
      return (p.devices?.standaloneController?.looks || []).map((l: any) => String(l.label));
    } catch { return ['parse-failed']; }
  }).catch(() => ['evaluate-failed']);
}
async function railScreen(page: Page): Promise<string> {
  return page.evaluate(() => (document.querySelector('.rail-item[aria-current="page"]')?.getAttribute('aria-label') || 'none')).catch(() => 'evaluate-failed');
}
async function hashScreen(page: Page): Promise<string> {
  return page.evaluate(() => (location.hash.match(/screen=([a-z]+)/)?.[1] || '(none)') + '|' + location.hash).catch(() => 'evaluate-failed');
}
async function setRange(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).evaluate((node: HTMLInputElement, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(node, v);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
const tile = (page: Page, id: string) => page.locator(`.pm-cards .pmcard[data-pattern-id="${id}"]`);
async function selectedTiles(page: Page): Promise<string[]> {
  return page.locator('.pm-cards .pmcard').evaluateAll(els => els
    .filter(e => /\b(on|active|selected)\b/.test(e.className) || e.getAttribute('aria-pressed') === 'true')
    .map(e => e.getAttribute('data-pattern-id') || '')).catch(() => ['evaluate-failed']);
}
async function newLook(page: Page, name: string) {
  await page.getByTestId('stack-new').click({ timeout: 5000 });
  await page.getByTestId('look-name').fill(name, { timeout: 5000 });
}

const findings: any[] = [];
async function finish(info: TestInfo, page: Page, cell: string, record: any) {
  const shot = info.outputPath('final.png');
  await page.screenshot({ path: shot }).catch(() => {});
  const full = { cell, ...record, screenshot: shot };
  await info.attach('cell', { contentType: 'application/json', body: JSON.stringify(full, null, 1) });
  console.log('CELL ' + JSON.stringify(full));
  findings.push(full);
}

for (const vp of VIEWPORTS) {
  test(`1 double-click 10 tiles · ${vp.id}`, async ({ page }, info) => {
    const { card } = await boot(page, vp);
    const mismatches: any[] = []; const steps: any[] = [];
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i];
      const before = card.requests.filter(r => r.path === '/api/control' && r.method === 'POST').length;
      let err = '';
      try { await tile(page, id).dblclick({ timeout: 5000 }); } catch (e: any) { err = String(e.message).split('\n')[0]; }
      await page.waitForTimeout(1000);
      const posts = card.requests.filter(r => r.path === '/api/control' && r.method === 'POST').length - before;
      const playing = card.playingId();
      const selected = await selectedTiles(page);
      const step = { step: i + 1, tile: id, cardPlaying: playing, selectedOnScreen: selected, controlPosts: posts, err };
      steps.push(step);
      if (playing !== id || (selected.length && !selected.includes(id)) || err) mismatches.push(step);
      if (i === 4 || i === 9) await page.screenshot({ path: info.outputPath(`step${i + 1}.png`) });
    }
    await page.waitForTimeout(2000);
    await finish(info, page, `1 dblclick tiles · ${vp.id}`, { mismatches, steps, alarms: await alarms(page), busy: await busy(page), unhandled: card.unhandled });
  });

  test(`2 save look double-click · ${vp.id}`, async ({ page }, info) => {
    const { card } = await boot(page, vp);
    const before = await storedLooks(page);
    await tile(page, 'fire').click();
    await newLook(page, 'Dbl look');
    const btnLabel = await page.getByTestId('look-save-preset').textContent();
    await page.getByTestId('look-save-preset').dblclick({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const status1 = await page.getByTestId('look-save-status').textContent().catch(() => null);
    const afterDbl = await storedLooks(page);
    await page.getByRole('tab', { name: /Project stacks/ }).click().catch(() => {});
    await page.waitForTimeout(500);
    const tabLabel = await page.getByRole('tab', { name: /Project stacks/ }).textContent().catch(() => null);
    const cards = await page.getByTestId('project-stack-card').allTextContents().catch(() => []);
    await page.screenshot({ path: info.outputPath('stacks.png') });
    // Second round: a different look, double-click again.
    await page.getByRole('tab', { name: /Patterns/ }).first().click().catch(() => {});
    await tile(page, 'ocean').click().catch(() => {});
    await newLook(page, 'Dbl look two').catch(() => {});
    await page.getByTestId('look-save-preset').dblclick({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const afterSecond = await storedLooks(page);
    await page.getByRole('tab', { name: /Project stacks/ }).click().catch(() => {});
    const cards2 = await page.getByTestId('project-stack-card').allTextContents().catch(() => []);
    // Install and compare with the card.
    const inst = page.getByTitle('Install the current look on the card');
    const installEnabled = await inst.isEnabled().catch(() => null);
    await inst.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await finish(info, page, `2 save look dbl · ${vp.id}`, {
      before, btnLabel, status1, afterDbl, tabLabel, cardsOnScreen: cards.length, cardTitles: cards.map(t => t.slice(0, 40)),
      afterSecond, cardsOnScreenSecond: cards2.length, installEnabled,
      cardLooksAfterInstall: (card.state.installedLooks || []).map((l: any) => l.label),
      cardPatternsAfterInstall: card.state.patterns.map(p => p.id),
      posts: card.requests.filter(r => r.method === 'POST').map(r => r.path), alarms: await alarms(page), busy: await busy(page),
    });
  });

  for (const mode of ['reload', 'leave'] as const) {
    test(`${mode === 'reload' ? 3 : 4} install then ${mode} mid-save · ${vp.id}`, async ({ page }, info) => {
      const { card, fp } = await boot(page, vp);
      await tile(page, 'fire').click();
      await newLook(page, `Midsave ${mode}`);
      await page.getByTestId('look-save-preset').click();
      await page.waitForTimeout(800);
      const lookLabel = `Midsave ${mode}`;
      card.setReplyDelay(3000);
      const postsBefore = card.requests.filter(r => r.method === 'POST').length;
      const inst = page.getByTitle('Install the current look on the card');
      const enabled = await inst.isEnabled().catch(() => null);
      await inst.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(700);
      const midBusy = await busy(page);
      await page.screenshot({ path: info.outputPath('mid.png') });
      const t0 = Date.now();
      if (mode === 'reload') {
        await page.reload({ waitUntil: 'domcontentloaded' });
      } else {
        await page.locator('.rail-item[aria-label="Layout"]').click().catch(() => {});
        await page.waitForTimeout(300);
        await page.locator('.rail-item[aria-label="Patterns"]').click().catch(() => {});
      }
      const connectedMs = await waitConnected(page, 25000);
      // Let the held request land, then reset delay so the settle phase is clean.
      await page.waitForTimeout(5000);
      card.setReplyDelay(0);
      await page.waitForTimeout(15000);
      const settled = {
        link: await linkState(page), alarms: await alarms(page), busy: await busy(page),
        lifecycle: await page.getByTestId('project-lifecycle-label').textContent().catch(() => null),
        installEnabled: await inst.isEnabled().catch(() => null),
        installTitle: await inst.textContent().catch(() => null),
        screen: await railScreen(page), hash: await hashScreen(page),
      };
      const studio = await page.evaluate(async () => {
        const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
        const p = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
        return { fp: cardProjectFingerprint(p), looks: (p.devices?.standaloneController?.looks || []).map((l: any) => l.label),
          lifecycle: localStorage.getItem('lw_project_lifecycle_v1') };
      }).catch(() => null);
      const cardView = {
        projectId: card.state.projectId, fingerprint: card.state.projectFingerprint,
        installedLooks: (card.state.installedLooks || []).map((l: any) => l.label),
        wiringTransactionOpen: card.state.wiringTransactionOpen,
        postsDuring: card.requests.filter(r => r.method === 'POST').slice(postsBefore).map(r => r.path),
      };
      await finish(info, page, `${mode === 'reload' ? 3 : 4} install ${mode} mid-save · ${vp.id}`, {
        installEnabledBefore: enabled, midBusy, connectedMs, msSinceAction: Date.now() - t0, settled, studio,
        cardView, studioFpMatchesCard: studio?.fp === card.state.projectFingerprint, originalFp: fp,
        lookReachedCard: cardView.installedLooks.includes(lookLabel),
        unhandled: card.unhandled,
      });
    });
  }

  test(`5 back and forward · ${vp.id}`, async ({ page }, info) => {
    const { card } = await boot(page, vp, '/#screen=card');
    const rail = (name: string) => page.locator(`.rail-item[aria-label="${name}"]`);
    const log: any[] = []; const disagreements: any[] = [];
    const probe = async (label: string) => {
      const hs = await hashScreen(page); const rs = await railScreen(page);
      const hashName = hs.split('|')[0];
      const map: Record<string, string> = { card: 'Card', pattern: 'Patterns', patterns: 'Patterns', playlist: 'Playlist' };
      const entry = { label, hash: hs, rail: rs, patternsVisible: await page.locator('.pm').first().isVisible().catch(() => false) };
      log.push(entry);
      if (map[hashName] && map[hashName] !== rs) disagreements.push(entry);
      const pv = entry.patternsVisible; const wantsP = hashName === 'pattern' || hashName === 'patterns';
      if (pv !== wantsP) disagreements.push({ ...entry, note: 'patterns screen visibility vs url' });
    };
    await rail('Patterns').click(); await page.waitForTimeout(400);
    await rail('Playlist').click(); await page.waitForTimeout(400);
    await rail('Card').click(); await page.waitForTimeout(400);
    for (let i = 0; i < 10; i++) {
      await page.goBack().catch(() => {}); await page.waitForTimeout(350); await probe(`back${i + 1}`);
      await page.goBack().catch(() => {}); await page.waitForTimeout(350); await probe(`back${i + 1}b`);
      await page.goForward().catch(() => {}); await page.waitForTimeout(350); await probe(`fwd${i + 1}`);
      await page.goForward().catch(() => {}); await page.waitForTimeout(350); await probe(`fwd${i + 1}b`);
    }
    await page.waitForTimeout(2000);
    // Controls still responsive? Go to Patterns and tap.
    await rail('Patterns').click(); await page.waitForTimeout(800);
    await tile(page, 'rainbow').click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const tapWorked = card.playingId() === 'rainbow';
    await rail('Playlist').click(); await page.waitForTimeout(800);
    const playlistBtns = await page.locator('button:not([disabled])').count();
    await rail('Card').click(); await page.waitForTimeout(800);
    const cardBtns = await page.locator('button:not([disabled])').count();
    await finish(info, page, `5 back/fwd · ${vp.id}`, { disagreements, log, tapWorkedAfter: tapWorked, playlistBtns, cardBtns,
      link: await linkState(page), alarms: await alarms(page), busy: await busy(page) });
  });

  test(`6 mixed sequence x15 · ${vp.id}`, async ({ page }, info) => {
    test.setTimeout(420_000);
    const { card } = await boot(page, vp);
    const rounds: any[] = [];
    for (let n = 1; n <= 15; n++) {
      const id = IDS[n % IDS.length];
      const round: any = { n, tile: id };
      let t0 = Date.now();
      try {
        await tile(page, id).click({ timeout: 6000 });
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline && card.playingId() !== id) await page.waitForTimeout(25);
        round.tapToCardMs = card.playingId() === id ? Date.now() - t0 : null;
      } catch (e: any) { round.tapErr = String(e.message).split('\n')[0]; }
      const bval = (0.2 + (n % 7) * 0.1).toFixed(2); const sval = (0.5 + (n % 5) * 0.4).toFixed(2);
      t0 = Date.now();
      try {
        await setRange(page, 'look-brightness-slider', bval);
        await page.waitForTimeout(1200);
        const z: any = card.state.zoneControls.get('zone-all') || [...card.state.zoneControls.values()].pop();
        const zs = [...card.state.zoneControls.values()].map((x: any) => x.brightness);
        round.brightness = { set: bval, cardZones: zs, shown: await page.getByTestId('look-brightness-readout').textContent().catch(() => null) };
        await setRange(page, 'look-speed-slider', sval);
        await page.waitForTimeout(1200);
        round.speed = { set: sval, cardZones: [...card.state.zoneControls.values()].map((x: any) => x.speed), shown: await page.getByTestId('look-speed-readout').textContent().catch(() => null) };
        void z;
      } catch (e: any) { round.sliderErr = String(e.message).split('\n')[0]; }
      try {
        const before = (await storedLooks(page)).length;
        await newLook(page, `Mixed ${n}`);
        await page.getByTestId('look-save-preset').click({ timeout: 5000 });
        await page.waitForTimeout(800);
        round.lookSaved = { before, after: (await storedLooks(page)).length, status: await page.getByTestId('look-save-status').textContent().catch(() => null) };
      } catch (e: any) { round.saveErr = String(e.message).split('\n')[0]; }
      if (n % 5 === 0) {
        const r0 = Date.now();
        await page.reload({ waitUntil: 'domcontentloaded' });
        round.reconnectMs = await waitConnected(page, 20000);
        round.reloadTotalMs = Date.now() - r0;
        await page.waitForTimeout(2000);
        round.playingAfterReload = card.playingId();
        round.selectedAfterReload = await selectedTiles(page);
        round.looksAfterReload = (await storedLooks(page)).length;
        await page.screenshot({ path: info.outputPath(`reload${n}.png`) });
      }
      round.alarms = await alarms(page); round.busy = await busy(page); round.link = await linkState(page);
      round.controlPostsSoFar = card.requests.filter(r => r.path === '/api/control' && r.method === 'POST').length;
      round.totalRequests = card.requests.length;
      rounds.push(round);
    }
    await finish(info, page, `6 mixed x15 · ${vp.id}`, { rounds });
  });
}

// ── Follow-ups ───────────────────────────────────────────────────────────────
// 3h/4h: hold ONLY the config write's reply, so the POST is genuinely in flight
// (the blanket reply delay above stalls the pre-flight reads, so the write is
// never even sent before the reload).
for (const mode of ['reload', 'leave'] as const) {
  test(`3h-4h in-flight write held then ${mode} · desktop`, async ({ page }, info) => {
    const vp = VIEWPORTS[0];
    const { card, fp } = await boot(page, vp);
    await tile(page, 'fire').click();
    await newLook(page, `Held ${mode}`);
    await page.getByTestId('look-save-preset').click();
    await page.waitForTimeout(800);
    const release = card.holdNextReply('/api/config');
    const postsBefore = card.requests.filter(r => r.method === 'POST').length;
    const inst = page.getByTitle('Install the current look on the card');
    await inst.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const midBusy = await busy(page);
    const labelMid = await inst.textContent().catch(() => null);
    const postsMid = card.requests.filter(r => r.method === 'POST').slice(postsBefore).map(r => r.path);
    await page.screenshot({ path: info.outputPath('mid.png') });
    if (mode === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });
    else {
      await page.locator('.rail-item[aria-label="Layout"]').click().catch(() => {});
      await page.waitForTimeout(300);
      await page.locator('.rail-item[aria-label="Patterns"]').click().catch(() => {});
    }
    const connectedMs = await waitConnected(page, 25000);
    release();
    await page.waitForTimeout(20000);
    const studio = await page.evaluate(async () => {
      const { cardProjectFingerprint } = await import('/src/lib/cardProjectResolver.js');
      const p = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
      return { fp: cardProjectFingerprint(p), looks: (p.devices?.standaloneController?.looks || []).map((l: any) => l.label),
        lifecycle: localStorage.getItem('lw_project_lifecycle_v1') };
    }).catch(() => null);
    await finish(info, page, `3h-4h held write then ${mode}`, {
      midBusy, labelMid, postsMid, connectedMs, link: await linkState(page), alarms: await alarms(page), busy: await busy(page),
      lifecycle: await page.getByTestId('project-lifecycle-label').textContent().catch(() => null),
      installLabel: await inst.textContent().catch(() => null), installEnabled: await inst.isEnabled().catch(() => null),
      studio, studioFpMatchesCard: studio?.fp === card.state.projectFingerprint, originalFp: fp, cardFp: card.state.projectFingerprint,
      cardLooks: (card.state.installedLooks || []).map((l: any) => l.label), cardProject: card.state.projectId,
      postsAll: card.requests.filter(r => r.method === 'POST').slice(postsBefore).map(r => r.path),
    });
  });
}

test('7 does rail navigation make history entries · desktop', async ({ page }, info) => {
  const { } = await boot(page, VIEWPORTS[0], '/#screen=card');
  const rail = (name: string) => page.locator(`.rail-item[aria-label="${name}"]`);
  const h0 = await page.evaluate(() => history.length);
  await rail('Patterns').click(); await page.waitForTimeout(400);
  const h1 = await page.evaluate(() => history.length);
  await rail('Playlist').click(); await page.waitForTimeout(400);
  const h2 = await page.evaluate(() => history.length);
  await rail('Card').click(); await page.waitForTimeout(400);
  const h3 = await page.evaluate(() => history.length);
  const urlBefore = page.url();
  await page.goBack(); await page.waitForTimeout(600);
  const afterBack = { url: page.url(), rail: await railScreen(page) };
  await page.goBack(); await page.waitForTimeout(600);
  const afterBack2 = { url: page.url(), rail: await railScreen(page) };
  await finish(info, page, '7 history entries', { h0, h1, h2, h3, urlBefore, afterBack, afterBack2 });
});
