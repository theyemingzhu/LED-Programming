// Owner functions driven repeatedly against a SIMULATED card. Never contacts a
// real device. Records, does not assert: every step runs to the end and the
// run attaches JSON + screenshots. Run with tests/stress-owner-playwright.config.ts.
//
//   1 save a new look, then Save to card      4 playlist add x3, drag, remove, Save to card
//   2 change a saved look and save it again    5 pick a GPIO output and pick it back
//   3 delete a look this run created
import { test } from '@playwright/test';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import { createCardSimulator, type CardSimulator } from './harness/cardSimulator';
import { cardState, MATRIX_CARD_ID, MATRIX_BUILD_ID, MATRIX_FIRMWARE_VERSION } from './harness/cardStates';

const OUT_DIR = process.env.OWNER_OUT || '/private/tmp/claude-501/-Users-adrianrasmussen-Documents-Files-4-Coding-led--claude-worktrees-fable-prompt-rewrite-253dbc/3f140817-0f50-482c-9a33-5c5d5cea7df7/scratchpad';
const STEPS = Number(process.env.OWNER_STEPS || 50);
const ONLY_VP = process.env.OWNER_VP || '';
const VIEWPORTS = [{ id: 'desktop', width: 1440, height: 900 }, { id: 'phone', width: 390, height: 844 }];
const TILES = ['aurora', 'plasma', 'fire', 'ocean', 'ripple', 'lava', 'rainbow', 'sparkle', 'twinkle', 'meteor'];
const ALARM = /\b(fail(ed|ure)?|error|could ?n[o']t|cannot|can't|not sent|lost|refused|returned \d{3}|differs|different project|rolled back|roll(ed)?-?back|not connected|disconnected|try again|offline|unreachable|json|http|timed? ?out|unexpected|reconnect|not reach|stuck|retry|changed from another)\b/i;
const FN_NAMES: Record<number, string> = {
  1: 'save look + Save to card', 2: 'change saved look', 3: 'delete look', 4: 'playlist add/drag/remove/save', 5: 'GPIO pick and back',
};

// Mixed order: the owner's example first, then greedy fill so each function runs 10 times, never twice in a row.
function sequence(total: number): number[] {
  const head = [1, 4, 2, 1, 3, 4, 2, 5, 1, 3];
  const left: Record<number, number> = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 };
  const seq: number[] = [];
  for (const f of head.slice(0, total)) { seq.push(f); left[f]--; }
  let rot = 0;
  while (seq.length < total) {
    const last = seq[seq.length - 1];
    const order = [1, 2, 3, 4, 5].filter(f => f !== last && left[f] > 0).sort((a, b) => left[b] - left[a] || ((a + rot) % 5) - ((b + rot) % 5));
    if (!order.length) break;
    seq.push(order[0]); left[order[0]]--; rot++;
  }
  return seq;
}

const OBSERVER = `(() => {
  const SEL = '[role="alert"],[role="status"],[aria-live="assertive"],[data-testid*="status"],[data-testid*="notice"],[data-testid*="error"],[data-testid*="conflict"],[data-testid*="feedback"],.toast,[data-testid*="banner"]';
  window.__seen = new Set();
  let queued = false;
  const scan = () => {
    queued = false;
    try {
      document.querySelectorAll(SEL).forEach(el => {
        const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!t || t.length > 260) return;
        const r = el.getBoundingClientRect();
        const live = el.closest('[aria-live],[role=status],[role=alert]');
        if (r.width === 0 && r.height === 0 && !live) return;
        window.__seen.add((el.getAttribute('data-testid') || el.getAttribute('role') || el.className || el.tagName) + ' :: ' + t);
      });
    } catch (e) {}
  };
  const start = () => {
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } })
      .observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    scan();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function newWindow(browser: Browser, card: CardSimulator, vp: { width: number; height: number }, withObserver = true) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const consoleErrors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 200)));
  await card.install(page);
  await page.addInitScript(({ id, firmwareVersion, buildId }) => {
    localStorage.setItem('lw_card_identity_v1', JSON.stringify({ version: 1, id, firmwareVersion, buildId }));
    localStorage.setItem('lw_card_host', 'lightweaver.local');
    localStorage.setItem('lw_chip_card_host', 'lightweaver.local');
  }, { id: MATRIX_CARD_ID, firmwareVersion: MATRIX_FIRMWARE_VERSION, buildId: MATRIX_BUILD_ID });
  if (withObserver) await page.addInitScript(OBSERVER);
  return { ctx, page, consoleErrors };
}
async function openPatterns(page: Page) {
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const id = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}')?.id || ''; } catch { return ''; } }).catch(() => '');
    if (id === 'lwproj-matrix-piece') break;
    await sleep(250);
  }
  await page.getByTestId('pattern-install-on-card').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return Date.now() - t0;
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

// ── Reading state ────────────────────────────────────────────────────────────
async function studioState(page: Page) {
  return page.evaluate(() => {
    const sig = (o: any) => { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); };
    try {
      const p = JSON.parse(localStorage.getItem('lw_autosave_v3') || '{}');
      const c = p.devices?.standaloneController || {};
      const life = JSON.parse(localStorage.getItem('lw_project_lifecycle_v1') || '{}');
      return {
        id: p.id,
        looks: (c.looks || []).map((l: any) => ({ id: l.id, label: l.label, sig: sig({ d: l.defaultLook, s: l.sectionLooks }) })),
        playlist: (c.playlist || []).map((e: any) => ({ id: e.id, type: e.type, ref: e.lookId || e.patternId || '', label: e.label })),
        pins: (p.layout?.wiring?.outputs || []).map((o: any) => o.pin),
        dirty: life.dirty, installedFp: life.installation?.projectFingerprint ? String(life.installation.projectFingerprint).slice(0, 8) : '',
      };
    } catch (e) { return { parseError: String(e) } as any; }
  }).catch(() => ({ evalFailed: true } as any));
}
function cardSnap(card: CardSimulator) {
  const s: any = card.state;
  return {
    playing: card.playingId(), fp: String(s.projectFingerprint || '').slice(0, 8), project: s.projectId,
    pin: s.pin, pixels: s.pixels, outputs: (s.explicitOutputs || []).map((o: any) => o.pin),
    looks: (s.installedLooks || s.patterns || []).map((l: any) => ({ id: l.id, label: l.label })),
    playlistEntries: (s.playlistEntries || []).map((e: any) => e.patternId), playlistEnabled: s.playlistEnabled,
  };
}
const configPosts = (card: CardSimulator) => card.requests.filter(r => r.path === '/api/config' && r.method === 'POST');
const allPosts = (card: CardSimulator) => card.requests.filter(r => r.method === 'POST').length;

async function seenMessages(page: Page, reset = false): Promise<string[]> {
  return page.evaluate((r) => { const a = Array.from((window as any).__seen || []) as string[]; if (r) (window as any).__seen = new Set(); return a; }, reset).catch(() => ['evaluate-failed']);
}
async function alarms(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const alarm = new RegExp(source, 'i');
    const seen = new Set<string>();
    const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const st = getComputedStyle(el as HTMLElement); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
    for (const el of Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"]'))) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && visible(el)) seen.add(`alert: ${t.slice(0, 200)}`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim(); const el = n.parentElement;
      if (!t || t.length > 200 || !el || !visible(el) || el.closest('details:not([open])')) continue;
      if (alarm.test(t)) seen.add(`text: ${t}`);
    }
    return Array.from(seen);
  }, ALARM.source).catch(() => ['evaluate-failed']);
}
async function busy(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    document.querySelectorAll('[aria-busy="true"]').forEach(e => out.add('aria-busy: ' + ((e as HTMLElement).getAttribute('data-testid') || (e.textContent || '').trim().slice(0, 40))));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim(); const el = n.parentElement;
      if (!t || t.length > 120 || !el || !/(…|\.\.\.)$/.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && !el.closest('details:not([open])')) out.add(t);
    }
    return Array.from(out);
  }).catch(() => ['evaluate-failed']);
}
async function texts(page: Page, testId: string) { return page.getByTestId(testId).first().textContent({ timeout: 500 }).then(t => (t || '').replace(/\s+/g, ' ').trim()).catch(() => null); }

// ── Navigation ───────────────────────────────────────────────────────────────
async function go(page: Page, screen: 'Patterns' | 'Playlist' | 'Layout') {
  if (screen === 'Layout') {
    await page.evaluate(() => { window.location.hash = '#screen=layout&mode=draw'; });
    await page.locator('[data-strip-id]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    return;
  }
  const rail = page.locator(`.rail-item[aria-label="${screen}"]`);
  if (await rail.count()) await rail.first().click({ timeout: 5000 }).catch(() => {});
  else await page.evaluate(h => { window.location.hash = h; }, screen === 'Patterns' ? '#screen=pattern' : '#screen=playlist');
  if (screen === 'Patterns') await page.getByTestId('pattern-install-on-card').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  else await page.locator('.pl-workspace').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(200);
}
async function setRangeFrac(page: Page, testId: string, frac: number) {
  return page.getByTestId(testId).first().evaluate((node: HTMLInputElement, f) => {
    const lo = Number(node.min), hi = Number(node.max); const v = String(Math.round(lo + (hi - lo) * f));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(node, v);
    node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true }));
    return v;
  }, frac, { timeout: 5000 } as any);
}
async function setRange(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).first().evaluate((node: HTMLInputElement, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(node, v);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, value, { timeout: 5000 } as any);
}

// Press, then wait for the effect. If it does not land, press again and count it.
async function pressUntil(rec: any, key: string, press: () => Promise<any>, effect: () => Promise<boolean>, opts: { wait?: number; max?: number } = {}) {
  const wait = opts.wait ?? 6000; const max = opts.max ?? 3;
  const t0 = Date.now(); let presses = 0; let ok = false; let err = '';
  for (let i = 0; i < max && !ok; i++) {
    presses++;
    const c0 = Date.now();
    try { await press(); } catch (e: any) { err = String(e.message).split('\n')[0]; }
    const clickMs = Date.now() - c0;
    if (i === 0) rec[`${key}ClickMs`] = clickMs;
    const d = Date.now() + wait;
    while (Date.now() < d) { if (await effect().catch(() => false)) { ok = true; break; } await sleep(100); }
  }
  rec[key] = { presses, ok, ms: ok ? Date.now() - t0 : null, err: err || undefined };
  return ok;
}

// ── The five functions ───────────────────────────────────────────────────────
type Ctx = { page: Page; card: CardSimulator; n: number; made: string[]; shot: (name: string) => Promise<void>; };

async function installOnPatterns(c: Ctx, rec: any, key: string, expectLabels: string[]) {
  const { page, card } = c;
  const before = card.state.projectFingerprint; const posts0 = configPosts(card).length;
  const btn = page.getByTestId('pattern-install-on-card');
  const t0 = Date.now();
  await pressUntil(rec, key, () => btn.click({ timeout: 10000 }),
    async () => card.state.projectFingerprint !== before, { wait: 8000 });
  const ok = rec[key].ok;
  const d = Date.now() + 20000;
  while (Date.now() < d) {
    const bz = await btn.getAttribute('aria-busy').catch(() => null);
    const label = (await btn.textContent().catch(() => '') || '').trim();
    if (bz !== 'true' && !/Sending|Saving|…/.test(label)) break;
    await sleep(100);
  }
  rec[`${key}ScreenIdleMs`] = Date.now() - t0;
  rec[`${key}ConfigPosts`] = configPosts(card).length - posts0;
  rec[`${key}ButtonText`] = (await btn.textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim();
  rec[`${key}Lifecycle`] = await texts(page, 'project-lifecycle-label');
  return ok;
}

async function fn1(c: Ctx, rec: any) {
  const { page, card, n } = c; const label = `Stress-${n}`;
  await go(page, 'Patterns');
  await page.getByRole('tab', { name: 'Patterns', exact: true }).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(150);
  await page.locator(`.pm-cards .pmcard[data-pattern-id="${TILES[n % TILES.length]}"]`).first().click({ timeout: 6000 }).catch(e => { rec.tileErr = String(e.message).split('\n')[0]; });
  await page.waitForTimeout(250);
  await page.getByTestId('stack-new').click({ timeout: 6000 }).catch(e => { rec.newErr = String(e.message).split('\n')[0]; });
  await page.getByTestId('look-name').fill(label, { timeout: 5000 }).catch(e => { rec.nameErr = String(e.message).split('\n')[0]; });
  const countBefore = (await studioState(page)).looks?.length;
  await pressUntil(rec, 'saveLook', () => page.getByTestId('look-save-preset').click({ timeout: 8000 }),
    async () => (await studioState(page)).looks?.some((l: any) => l.label === label));
  rec.lookStatus = await texts(page, 'look-save-status');
  const afterSave = await studioState(page);
  rec.looksBeforeAfter = [countBefore, afterSave.looks?.length];
  rec.dupLooksForLabel = afterSave.looks?.filter((l: any) => l.label === label).length;
  // time until the status line says it is saved
  const d = Date.now() + 8000; const s0 = Date.now();
  while (Date.now() < d && !/^Saved in/.test(await texts(page, 'look-save-status') || '')) await sleep(100);
  rec.saveLookStatusMs = Date.now() - s0; rec.saveLookStatusText = await texts(page, 'look-save-status');
  c.made.push(label);
  await installOnPatterns(c, rec, 'saveToCard', [label]);
  const lp: any = configPosts(card).slice(-1)[0]?.body;
  rec.lastConfigPost = lp ? { looks: (lp.looks || lp.patterns || []).map((l: any) => ({ id: l.id, label: l.label, patternId: l.patternId })), startup: lp.startupPatternId, playlist: lp.playlist ? (lp.playlist.entries || []).length : null } : null;
}

async function openLookEditor(c: Ctx, rec: any, label: string) {
  const { page } = c;
  await go(page, 'Patterns');
  await page.getByRole('tab', { name: /Project stacks/ }).first().click({ timeout: 5000 }).catch(e => { rec.stacksTabErr = String(e.message).split('\n')[0]; });
  await page.waitForTimeout(250);
  const edit = page.getByRole('button', { name: `Edit ${label}`, exact: true });
  const present = await edit.count();
  if (!present) { rec.editorMissing = `no Edit button for ${label}`; return false; }
  await pressUntil(rec, 'openEditor', () => edit.first().click({ timeout: 6000 }), async () => (await page.getByTestId('look-delete').count()) > 0, { wait: 3000 });
  return true;
}
async function ensureMade(c: Ctx, rec: any) {
  // Precondition (setup, not scored): a look this run created.
  const st = await studioState(c.page);
  const have = c.made.filter(l => st.looks?.some((x: any) => x.label === l));
  if (have.length) return have[have.length - 1];
  rec.setup = 'created a look first (none existed)';
  const label = `Stress-pre-${c.n}`;
  await go(c.page, 'Patterns');
  await c.page.getByRole('tab', { name: 'Patterns', exact: true }).first().click({ timeout: 4000 }).catch(() => {});
  await c.page.getByTestId('stack-new').click({ timeout: 6000 }).catch(() => {});
  await c.page.getByTestId('look-name').fill(label).catch(() => {});
  await c.page.getByTestId('look-save-preset').click({ timeout: 6000 }).catch(() => {});
  await c.page.waitForTimeout(1500);
  c.made.push(label);
  return label;
}

async function fn2(c: Ctx, rec: any) {
  const { page, card, n } = c;
  const T = (m: string) => console.log('  fn2 ' + m);
  T('start');
  const label = await ensureMade(c, rec); rec.target = label;
  T('ensureMade done ' + label);
  if (!await openLookEditor(c, rec, label)) return;
  T('editor open');
  const before = (await studioState(page)).looks.find((l: any) => l.label === label);
  const which = n % 2 ? 'hue' : 'speed'; const frac = 0.1 + ((n * 37) % 80) / 100;
  rec.changed = { which, frac, set: await setRangeFrac(page, which === 'hue' ? 'look-hue-slider' : 'look-speed-slider', frac).catch(e => { rec.sliderErr = String(e.message).split('\n')[0]; return null; }) };
  rec.readoutAfterSlide = await texts(page, which === 'hue' ? 'look-hue-readout' : 'look-speed-readout');
  T('slider set');
  await page.waitForTimeout(300);
  rec.editorStatusBeforeSave = await texts(page, 'look-save-status'); rec.saveButtonText = await texts(page, 'look-save-preset');
  const posts0 = allPosts(card);
  await pressUntil(rec, 'saveChanges', () => page.getByTestId('look-save-preset').click({ timeout: 8000 }),
    async () => { const l = (await studioState(page)).looks.find((x: any) => x.label === label); return !!l && l.sig !== before?.sig; });
  const s0 = Date.now(); while (Date.now() - s0 < 6000 && !/^Saved in/.test(await texts(page, 'look-save-status') || '')) await sleep(100);
  rec.saveStatusMs = Date.now() - s0; rec.lookStatus = await texts(page, 'look-save-status');
  const after = (await studioState(page)).looks.find((l: any) => l.label === label);
  rec.sigChanged = !!after && after.sig !== before?.sig; rec.cardPostsDuringSave = allPosts(card) - posts0;
}

async function fn3(c: Ctx, rec: any) {
  const { page } = c;
  const label = await ensureMade(c, rec); rec.target = label;
  if (!await openLookEditor(c, rec, label)) return;
  const before = await studioState(page);
  const id = before.looks.find((l: any) => l.label === label)?.id; rec.targetId = id;
  await page.getByTestId('stack-more-actions').first().click({ timeout: 5000 }).catch(e => { rec.moreActionsErr = String(e.message).split('\n')[0]; });
  await page.waitForTimeout(150);
  rec.deleteButtonText = await texts(page, 'look-delete');
  await pressUntil(rec, 'deleteLook', () => page.getByTestId('look-delete').click({ timeout: 8000 }),
    async () => !(await studioState(page)).looks.some((l: any) => l.id === id), { wait: 5000 });
  if (!rec.deleteLook.ok) {
    await c.shot('delete-failed');
    rec.deleteButtonDiag = await page.getByTestId('look-delete').first().evaluate((el: HTMLElement) => {
      const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { disabled: (el as HTMLButtonElement).disabled, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], topElement: top ? (top.tagName + '.' + String(top.className).slice(0, 60) + ' "' + (top.textContent || '').trim().slice(0, 50) + '"') : null, vh: innerHeight };
    }).catch((e: any) => 'diag failed: ' + String(e.message).split('\n')[0]);
  }
  const s0 = Date.now(); while (Date.now() - s0 < 6000 && !/Deleted from/.test(await texts(page, 'look-save-status') || '')) await sleep(100);
  rec.deleteStatusMs = Date.now() - s0; rec.lookStatus = await texts(page, 'look-save-status');
  rec.undoOffered = (await page.getByTestId('look-delete-undo').count()) > 0;
  const after = await studioState(page);
  rec.looksBeforeAfter = [before.looks.length, after.looks.length];
  rec.playlistDanglingRefs = after.playlist.filter((e: any) => e.type === 'combo' && !after.looks.some((l: any) => l.id === e.ref)).map((e: any) => e.label);
  c.made = c.made.filter(l => l !== label);
  // Is the deleted look gone from the on-screen shelf?
  await page.getByRole('tab', { name: /Project stacks/ }).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(250);
  rec.shelfStillShows = (await page.getByRole('button', { name: `Select ${label}`, exact: true }).count()) > 0;
}

async function plRows(page: Page) {
  return page.locator('.pl-row').evaluateAll(els => els.map(e => ({ tid: e.getAttribute('data-testid') || '', label: ((e.querySelector('.pl-copy strong')?.childNodes[0]?.textContent) || '').trim() })));
}
async function fn4(c: Ctx, rec: any) {
  const { page, card } = c;
  await go(page, 'Playlist');
  // Setup (scored for time only): empty the dial order so each run starts from nothing.
  const s0 = Date.now(); let guard = 0;
  while ((await page.locator('.pl-row').count()) > 0 && guard++ < 40) {
    const row = page.locator('.pl-row').first();
    await row.getByRole('button', { name: /^More actions for / }).click({ timeout: 4000 }).catch(() => {});
    await page.getByRole('menuitem', { name: /^Remove / }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(80);
  }
  rec.clearedMs = Date.now() - s0; rec.leftAfterClear = await page.locator('.pl-row').count();
  // Add three looks: saved looks first (checkboxes + Add selected), top up with patterns.
  await page.getByRole('tab', { name: /Project stacks/ }).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(200);
  const boxes = page.locator('.pl-stack-card input[type="checkbox"]:not(:disabled)');
  const avail = await boxes.count(); const pick = Math.min(3, avail); rec.addedFromLooks = pick; rec.looksAvailable = avail;
  for (let i = 0; i < pick; i++) await boxes.nth(i).check({ timeout: 4000 }).catch(() => {});
  if (pick) await pressUntil(rec, 'addSelected', () => page.getByRole('button', { name: 'Add selected' }).click({ timeout: 6000 }),
    async () => (await page.locator('.pl-row').count()) >= pick, { wait: 4000 });
  if (pick < 3) {
    await page.getByRole('tab', { name: 'Patterns', exact: true }).first().click({ timeout: 4000 }).catch(() => {});
    for (let i = pick; i < 3; i++) {
      const before = await page.locator('.pl-row').count();
      const tile = page.locator('.pl-pattern-tile:not(.is-added)').nth(i - pick);
      await pressUntil(rec, `addPattern${i}`, () => tile.click({ timeout: 5000 }), async () => (await page.locator('.pl-row').count()) > before, { wait: 3000 });
    }
  }
  let rows = await plRows(page); rec.rowsAfterAdd = rows.map(r => r.label);
  rec.addedCountOk = rows.length === 3;
  // Reorder by drag: last row's grip onto the first row.
  if (rows.length >= 2) {
    const orderBefore = rows.map(r => r.label);
    const lastGrip = page.locator('.pl-row').last().getByRole('button', { name: /^Reorder / });
    const firstRow = page.locator('.pl-row').first();
    await lastGrip.scrollIntoViewIfNeeded().catch(() => {});
    const d0 = Date.now(); let presses = 0; let dragOk = false; const want = [orderBefore[orderBefore.length - 1], ...orderBefore.slice(0, -1)];
    for (let i = 0; i < 2 && !dragOk; i++) {
      presses++;
      await lastGrip.dragTo(firstRow, { timeout: 6000, targetPosition: { x: 60, y: 8 } }).catch(e => { rec.dragErr = String(e.message).split('\n')[0]; });
      const dl = Date.now() + 2500;
      while (Date.now() < dl) { if (JSON.stringify((await plRows(page)).map(r => r.label)) === JSON.stringify(want)) { dragOk = true; break; } await sleep(100); }
    }
    rec.drag = { presses, ok: dragOk, ms: dragOk ? Date.now() - d0 : null, orderBefore, want };
    if (!dragOk) {
      // Fall back to the keyboard so the rest of the step still means something.
      const grip = page.locator('.pl-row').last().getByRole('button', { name: /^Reorder / });
      await grip.focus().catch(() => {}); await page.keyboard.press('Home').catch(() => {}); await page.waitForTimeout(400);
      rec.dragFallbackKeyboardOk = JSON.stringify((await plRows(page)).map(r => r.label)) === JSON.stringify(want);
    }
    rec.reorderStatus = await texts(page, 'playlist-reorder-status');
  }
  rows = await plRows(page); rec.rowsAfterDrag = rows.map(r => r.label);
  // Remove one (the middle row).
  if (rows.length >= 2) {
    const mid = Math.floor(rows.length / 2); const removed = rows[mid].label;
    const row = page.locator('.pl-row').nth(mid);
    await pressUntil(rec, 'removeOne', async () => {
      await row.getByRole('button', { name: /^More actions for / }).click({ timeout: 5000 });
      await page.getByRole('menuitem', { name: /^Remove / }).first().click({ timeout: 5000 });
    }, async () => (await page.locator('.pl-row').count()) === rows.length - 1, { wait: 3000 });
    rec.removed = removed;
  }
  rows = await plRows(page); const expected = rows.map(r => r.label); rec.rowsBeforeSave = expected;
  const st = await studioState(page); rec.studioPlaylist = st.playlist.map((e: any) => e.label);
  // Save to card (the Playlist screen's own Install button).
  const before = card.state.projectFingerprint; const cardLooksBefore = cardSnap(card).looks.map((l: any) => l.label).join('|');
  const posts0 = configPosts(card).length; const t0 = Date.now();
  const btn = page.getByRole('button', { name: /Install playlist on card|Sending/ }).first();
  rec.installEnabled = await btn.isEnabled().catch(() => null);
  await pressUntil(rec, 'saveToCard', () => btn.click({ timeout: 10000 }),
    async () => configPosts(card).length > posts0 || card.state.projectFingerprint !== before, { wait: 8000 });
  const sd = Date.now() + 15000;
  while (Date.now() < sd) { const lb = (await btn.getAttribute('aria-label').catch(() => '')) || ''; if (!/Sending/.test(lb)) break; await sleep(100); }
  rec.saveToCardScreenIdleMs = Date.now() - t0;
  rec.playlistSaveStatus = await texts(page, 'playlist-project-save-status');
  rec.cardPlaylistStatus = await texts(page, 'playlist-card-status') || await texts(page, 'playlist-card-transport-status');
  const lastPost: any = configPosts(card).slice(-1)[0]?.body;
  rec.lastConfigPost = lastPost ? { looks: (lastPost.looks || lastPost.patterns || []).map((l: any) => l.label || l.id), playlist: lastPost.playlist ? (lastPost.playlist.entries || []).map((e: any) => e.patternId) : null, startup: lastPost.startupPatternId } : null;
  rec.configPosts = configPosts(card).length - posts0;
}

async function fn5(c: Ctx, rec: any) {
  const { page, card } = c;
  await go(page, 'Layout');
  const row = page.locator('[data-strip-id]').first();
  const sel = page.getByLabel('GPIO output').first();
  if (!await sel.isVisible().catch(() => false)) await row.locator('.la-strip-row').first().click({ timeout: 5000 }).catch(e => { rec.expandErr = String(e.message).split('\n')[0]; });
  await sel.waitFor({ state: 'visible', timeout: 4000 }).catch(() => { rec.selectMissing = true; });
  const startPin = Number(await sel.inputValue().catch(() => '0')); rec.startPin = startPin;
  const other = startPin === 17 ? '16' : '17'; const posts0 = allPosts(card);
  const header = async () => (await page.locator('body').innerText().catch(() => '')).match(/GPIO\s+(\d+)/)?.[1] || '';
  await pressUntil(rec, 'pickOther', () => sel.selectOption(other, { timeout: 6000 }), async () => {
    const st = await studioState(page); return st.pins?.[0] === Number(other);
  }, { wait: 4000 });
  rec.afterPick = { selectShows: await sel.inputValue().catch(() => ''), stored: (await studioState(page)).pins, headerGpio: await header(), cardPin: card.state.pin, status: await texts(page, 'project-lifecycle-label') };
  await page.waitForTimeout(500);
  await pressUntil(rec, 'pickBack', () => sel.selectOption(String(startPin), { timeout: 6000 }), async () => {
    const st = await studioState(page); return st.pins?.[0] === startPin;
  }, { wait: 4000 });
  await page.waitForTimeout(400);
  rec.afterBack = { selectShows: await sel.inputValue().catch(() => ''), stored: (await studioState(page)).pins, headerGpio: await header(), cardPin: card.state.pin, cardOutputs: cardSnap(card).outputs, status: await texts(page, 'project-lifecycle-label') };
  rec.cardPostsDuringPicks = allPosts(card) - posts0;
}

// ── Snapshots of what Studio SHOWS (for the reload comparison and window B) ──
async function viewSnapshot(page: Page) {
  const out: any = {};
  try {
    await go(page, 'Patterns');
    await page.getByRole('tab', { name: /Project stacks/ }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    out.shelf = await page.locator('[data-testid="project-stack-card"] strong').allTextContents().catch(() => []);
    await go(page, 'Playlist');
    out.playlist = (await plRows(page)).map(r => r.label);
    await go(page, 'Layout');
    out.gpio = await page.getByLabel('GPIO output').first().inputValue().catch(async () => {
      const row = page.locator('[data-strip-id]').first(); await row.locator('.la-strip-row').first().click().catch(() => {});
      return page.getByLabel('GPIO output').first().inputValue().catch(() => 'n/a');
    });
  } catch (e: any) { out.err = String(e.message).split('\n')[0]; }
  return out;
}

const FNS: Record<number, (c: Ctx, rec: any) => Promise<void>> = { 1: fn1, 2: fn2, 3: fn3, 4: fn4, 5: fn5 };

for (const vp of VIEWPORTS) {
  if (ONLY_VP && ONLY_VP !== vp.id) continue;
  test(`owner functions x${STEPS} · ${vp.id}`, async ({ browser }, info: TestInfo) => {
    test.setTimeout(1_500_000);
    const card = createCardSimulator(cardState('playing'));
    if (process.env.OWNER_EXPLICIT !== '0') (card.state as any).explicitOutputs = [{ id: 'out1', pin: card.state.pin, pixels: card.state.pixels, segments: [{ id: 'run-strip-1', count: card.state.pixels, direction: 'forward' }] }];
    const A = await newWindow(browser, card, vp);
    const page = A.page;
    const bootMs = await openPatterns(page);
    const seq = process.env.OWNER_SEQ ? process.env.OWNER_SEQ.split(',').map(Number) : sequence(STEPS);
    const steps: any[] = []; const made: string[] = [];
    const log = (m: string) => console.log(`[${vp.id}] ${m}`);
    log(`boot ${bootMs}ms; sequence ${seq.join(',')}`);
    const flush = () => {
      const file = `${OUT_DIR}/owner-stress-${vp.id}.json`;
      try { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ viewport: vp, bootMs, seq, steps, bCheck }, null, 1)); } catch {}
    };
    let bCheck: any = null;
    const perFn: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (let i = 0; i < seq.length; i++) {
      const f = seq[i]; perFn[f]++;
      const rec: any = { step: i + 1, fn: f, name: FN_NAMES[f], iter: perFn[f], viewport: vp.id };
      const cardBefore = cardSnap(card); const studioBefore = await studioState(page);
      await seenMessages(page, true); A.consoleErrors.length = 0; rec.lifecycleBefore = await texts(page, 'project-lifecycle-label');
      const unhandled0 = card.unhandled.length; const t0 = Date.now();
      try { await Promise.race([FNS[f]({ page, card, n: i + 1, made, shot: async (nm: string) => { await page.screenshot({ path: info.outputPath(`step${String(i + 1).padStart(2, '0')}-${nm}.png`) }).catch(() => {}); } }, rec), new Promise((_, rej) => setTimeout(() => rej(new Error('STEP HUNG over 100s')), 100000))]); } catch (e: any) { rec.stepException = String(e.message).split('\n')[0]; }
      rec.totalMs = Date.now() - t0;
      await page.waitForTimeout(1200);
      rec.studioAfter = await studioState(page); rec.cardAfter = cardSnap(card); rec.cardBefore = cardBefore;
      rec.cardChanged = JSON.stringify(cardBefore) !== JSON.stringify(rec.cardAfter);
      // Agreement: looks (by label), playlist order (by label), pins.
      const studioLabels = (rec.studioAfter.looks || []).map((l: any) => l.label).sort().join('|');
      const cardLabels = rec.cardAfter.looks.map((l: any) => l.label).sort().join('|');
      rec.agree = {
        looksByLabel: studioLabels === cardLabels,
        pins: JSON.stringify(rec.studioAfter.pins) === JSON.stringify(rec.cardAfter.outputs.length ? rec.cardAfter.outputs : [rec.cardAfter.pin]),
      };
      rec.studioLooksOnly = (rec.studioAfter.looks || []).map((l: any) => l.label).filter((l: string) => !rec.cardAfter.looks.some((x: any) => x.label === l));
      rec.cardLooksOnly = rec.cardAfter.looks.map((l: any) => l.label).filter((l: string) => !(rec.studioAfter.looks || []).some((x: any) => x.label === l));
      rec.messages = await seenMessages(page, false);
      rec.alarmsVisible = await alarms(page); rec.busyAtEnd = await busy(page);
      rec.consoleErrors = [...A.consoleErrors]; rec.unhandledNew = card.unhandled.slice(unhandled0);
      rec.lifecycleLabel = await texts(page, 'project-lifecycle-label');
      if (process.env.OWNER_LIFE && (f === 1 || f === 4)) {
        rec.lifecycleOverTime = [rec.lifecycleLabel];
        for (const w of [2000, 3000, 4000]) { await page.waitForTimeout(w); rec.lifecycleOverTime.push(await texts(page, 'project-lifecycle-label')); }
      }
      rec.link = await linkState(page);

      // Reload A every third step; compare what Studio shows before and after.
      if ((i + 1) % 3 === 0) {
        const snapBefore = await viewSnapshot(page); const stBefore = await studioState(page);
        const r0 = Date.now();
        await page.reload({ waitUntil: 'domcontentloaded' });
        const connMs = await waitConnected(page, 25000);
        await page.waitForTimeout(2500);
        const stAfter = await studioState(page); const snapAfter = await viewSnapshot(page);
        const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
        rec.reload = {
          connectedMs: connMs, totalMs: Date.now() - r0, snapBefore, snapAfter,
          viewSame: same(snapBefore, snapAfter), storageSame: same(stBefore.looks, stAfter.looks) && same(stBefore.playlist, stAfter.playlist) && same(stBefore.pins, stAfter.pins),
          looksLost: (stBefore.looks || []).filter((l: any) => !(stAfter.looks || []).some((x: any) => x.id === l.id)).map((l: any) => l.label),
          looksGained: (stAfter.looks || []).filter((l: any) => !(stBefore.looks || []).some((x: any) => x.id === l.id)).map((l: any) => l.label),
          playlistBefore: stBefore.playlist.map((e: any) => e.label), playlistAfter: stAfter.playlist.map((e: any) => e.label),
          cardAfterReload: cardSnap(card), alarms: await alarms(page),
        };
      }

      // Window B, once, in the middle.
      if (i + 1 === Math.floor(seq.length / 2) && !bCheck) {
        const B = await newWindow(browser, card, vp);
        const b0 = Date.now(); const bBoot = await openPatterns(B.page).catch(() => null);
        const bState = await studioState(B.page); const bSnap = await viewSnapshot(B.page);
        await B.page.screenshot({ path: info.outputPath(`B-window-step${i + 1}.png`) }).catch(() => {});
        const cs = cardSnap(card); const aState = await studioState(page);
        bCheck = {
          atStep: i + 1, bootMs: bBoot, totalMs: Date.now() - b0,
          bLooks: (bState.looks || []).map((l: any) => l.label), aLooks: (aState.looks || []).map((l: any) => l.label),
          cardLooks: cs.looks.map((l: any) => l.label), cardPlaylistEntries: cs.playlistEntries,
          bShelf: bSnap.shelf, bPlaylistOnScreen: bSnap.playlist, bPlaylistStored: (bState.playlist || []).map((e: any) => e.label), aPlaylistStored: (aState.playlist || []).map((e: any) => e.label),
          cardInstalledLooksRaw: JSON.stringify(((card.state as any).installedLooks || []).map((l: any) => ({ id: l.id, label: l.label, keys: Object.keys(l).join(',') }))).slice(0, 600), bStoredLooksRaw: JSON.stringify(bState.looks || []).slice(0, 300),
          bPins: bState.pins, cardOutputs: cs.outputs, cardPin: cs.pin, bMessages: await seenMessages(B.page), bConsole: B.consoleErrors,
          bLooksEqualCard: [...(bState.looks || []).map((l: any) => l.label)].sort().join('|') === cs.looks.map((l: any) => l.label).sort().join('|'),
          bLooksEqualA: [...(bState.looks || []).map((l: any) => l.label)].sort().join('|') === [...(aState.looks || []).map((l: any) => l.label)].sort().join('|'),
          bPlaylistEqualA: JSON.stringify((bState.playlist || []).map((e: any) => e.label)) === JSON.stringify((aState.playlist || []).map((e: any) => e.label)),
        };
        await B.ctx.close();
        log(`B check: ${JSON.stringify({ eqCard: bCheck.bLooksEqualCard, eqA: bCheck.bLooksEqualA, plEqA: bCheck.bPlaylistEqualA })}`);
      }

      const flagged = rec.stepException || rec.alarmsVisible.length || rec.busyAtEnd.length
        || Object.values(rec).some((v: any) => v && typeof v === 'object' && !Array.isArray(v) && 'presses' in v && (v.presses > 1 || v.ok === false))
        || (rec.reload && (!rec.reload.viewSame || !rec.reload.storageSame));
      rec.flagged = !!flagged;
      if (flagged || rec.iter === 1 || rec.iter === 5 || rec.iter === 10) await page.screenshot({ path: info.outputPath(`step${String(i + 1).padStart(2, '0')}-f${f}${flagged ? '-FLAG' : ''}.png`) }).catch(() => {});
      steps.push(rec); flush();
      log(`step ${i + 1} f${f}#${rec.iter} ${rec.totalMs}ms ${flagged ? 'FLAGGED' : 'ok'} ${rec.stepException || ''}`);
    }
    await info.attach('owner-stress', { contentType: 'application/json', body: JSON.stringify({ viewport: vp, bootMs, seq, steps, bCheck }, null, 1) });
    flush();
    await A.ctx.close();
  });
}
