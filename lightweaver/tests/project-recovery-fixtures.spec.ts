import { test, expect } from '@playwright/test';

// Persistence & recovery fixtures (defects B-1 / B-2).
//
// Each test seeds localStorage BEFORE the app loads with a stored-project
// fixture, then asserts the app boots to a working Layout screen and — for
// unrestorable payloads — that the raw payload survives in
// `lw_autosave_v3_quarantine` even after the 500 ms debounced autosave flush
// has overwritten the live keys (`lw_autosave_v3` + `_backup`).

const AUTOSAVE_KEY = 'lw_autosave_v3';
const AUTOSAVE_BACKUP_KEY = 'lw_autosave_v3_backup';
const QUARANTINE_KEY = 'lw_autosave_v3_quarantine';
const LEGACY_AUTOSAVE_KEY = 'lw_autosave_v1';
const LIFECYCLE_KEY = 'lw_project_lifecycle_v1';

// These fixtures are about what the app does with a stored project, so they
// deep-link to Layout. A bare `/` is the guided setup ladder for an owner who
// has not skipped it, and every test here clears localStorage first — see
// tests/workflow.spec.ts, which moved for the same reason.
const LAYOUT_ROUTE = '/#screen=layout';

const MALFORMED_SENTINEL = 'LW-SENTINEL-MALFORMED';
const FORWARD_SENTINEL = 'LW-SENTINEL-FORWARD';

async function seedStorage(page: any, entries: Record<string, string>) {
  await page.addInitScript((seed: Record<string, string>) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, entries);
}

async function expectWorkingLayoutScreen(page: any) {
  await expect(page.getByRole('button', { name: 'Import SVG' }).first()).toBeVisible();
  await expect(page.getByTestId('screen-error-fallback')).toHaveCount(0);
}

function readKey(page: any, key: string) {
  return page.evaluate((k: string) => localStorage.getItem(k) || '', key);
}

test('malformed autosave JSON is quarantined, not destroyed by the autosave flush', async ({ page }) => {
  const malformed = `{"version":3,"name":"${MALFORMED_SENTINEL}`; // unterminated JSON
  await seedStorage(page, { [AUTOSAVE_KEY]: malformed });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expectWorkingLayoutScreen(page);

  // The raw payload must land in quarantine…
  await expect.poll(() => readKey(page, QUARANTINE_KEY)).toContain(MALFORMED_SENTINEL);
  const record = JSON.parse(await readKey(page, QUARANTINE_KEY));
  expect(record.reason).toBe('parse-error');
  expect(record.payload).toBe(malformed);
  expect(record.at).toBeGreaterThan(0);

  // …and still be there well after the 500 ms debounced flush has run and
  // overwritten the live autosave keys with the default project.
  await page.waitForTimeout(2500);
  expect(await readKey(page, QUARANTINE_KEY)).toContain(MALFORMED_SENTINEL);
  const live = await readKey(page, AUTOSAVE_KEY);
  expect(live).not.toContain(MALFORMED_SENTINEL);
  expect(JSON.parse(live).version).toBe(3);
  expect(await readKey(page, AUTOSAVE_BACKUP_KEY)).not.toContain(MALFORMED_SENTINEL);
});

test('forward-version autosave is quarantined with its payload intact', async ({ page }) => {
  const forward = JSON.stringify({ version: 99, name: 'From the future', sentinel: FORWARD_SENTINEL });
  await seedStorage(page, { [AUTOSAVE_KEY]: forward, [AUTOSAVE_BACKUP_KEY]: forward });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expectWorkingLayoutScreen(page);

  await expect.poll(() => readKey(page, QUARANTINE_KEY)).toContain(FORWARD_SENTINEL);
  const record = JSON.parse(await readKey(page, QUARANTINE_KEY));
  expect(record.reason).toBe('unsupported-version');
  expect(JSON.parse(record.payload).version).toBe(99);

  // Prove the 500 ms flush did not destroy the quarantined copy.
  await page.waitForTimeout(2500);
  expect(await readKey(page, QUARANTINE_KEY)).toContain(FORWARD_SENTINEL);
  expect(await readKey(page, AUTOSAVE_KEY)).not.toContain(FORWARD_SENTINEL);
});

test('valid legacy v1 project migrates and opens', async ({ page }) => {
  const legacy = JSON.stringify({
    version: 1,
    name: 'Legacy Piece',
    strips: [{
      id: 'legacy-strip',
      name: 'Legacy strip',
      pathData: 'M 100 100 L 300 100',
      pixelCount: 20,
    }],
    showClips: [{ id: 'clip-1', track: 0, patternId: 'aurora', start: 0, end: 10 }],
  });
  await seedStorage(page, { [LEGACY_AUTOSAVE_KEY]: legacy });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expectWorkingLayoutScreen(page);

  await expect(page.locator('.crumb .proj')).toHaveText('Legacy Piece');
  await expect(page.locator('.la-strip-row')).toHaveCount(1);
  // Nothing to quarantine — the legacy payload restored.
  expect(await readKey(page, QUARANTINE_KEY)).toBe('');
});

test('valid v3 autosave restores without claiming Unsaved changes', async ({ page }) => {
  const project = JSON.stringify({ version: 3, id: 'lwproj-fixture-v3', name: 'Fixture V3' });
  await seedStorage(page, { [AUTOSAVE_KEY]: project, [AUTOSAVE_BACKUP_KEY]: project });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expectWorkingLayoutScreen(page);

  await expect(page.locator('.crumb .proj')).toHaveText('Fixture V3');
  // Restored work gets a brief event notice — never a passive false-dirty
  // lifecycle label in the project breadcrumb.
  await expect(page.getByTestId('workspace-notice')).toContainText('Restored from recovery copy');
  await expect(page.locator('.savechip')).toHaveCount(0);
  expect(await readKey(page, QUARANTINE_KEY)).toBe('');
});

test('a browser-saved project stays clean after reload without an ambient lifecycle notice', async ({ page }) => {
  const project = JSON.stringify({ version: 3, id: 'lwproj-fixture-saved', name: 'Saved Fixture' });
  await seedStorage(page, {
    [AUTOSAVE_KEY]: project,
    [LIFECYCLE_KEY]: JSON.stringify({ version: 1, dirty: false, persistedDestination: 'browser', installed: false }),
  });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expectWorkingLayoutScreen(page);

  await expect(page.locator('.crumb .proj')).toHaveText('Saved Fixture');
  await expect(page.locator('.savechip')).toHaveCount(0);
  await expect(page.getByTestId('workspace-notice')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_project_lifecycle_v1') || '{}').persistedDestination)).toBe('browser');
});

test('fresh boot is a clean New project and New project needs no discard confirm', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    (window as any).__lwConfirmCalls = 0;
    const originalConfirm = window.confirm;
    window.confirm = (...args: any[]) => {
      (window as any).__lwConfirmCalls += 1;
      return originalConfirm ? false : false;
    };
  });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expectWorkingLayoutScreen(page);

  await expect(page.locator('.savechip')).toHaveCount(0);
  await expect(page.getByTestId('workspace-notice')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lw_project_lifecycle_v1') || '{}').dirty)).toBe(false);

  // Wait past the first autosave flush: an untouched app must STILL be clean.
  await page.waitForTimeout(700);
  await expect(page.getByTestId('workspace-notice')).toHaveCount(0);

  await page.getByRole('button', { name: 'New project' }).click();
  // Neither the accessible replacement dialog nor window.confirm may fire on
  // an untouched app.
  await page.waitForTimeout(400);
  await expect(page.getByRole('dialog', { name: 'Replace current project?' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__lwConfirmCalls)).toBe(0);
  await expectWorkingLayoutScreen(page);
});

// ── Storage limits (defect C-1) ──────────────────────────────────────────
//
// A quota-exceeded (or private-mode-refused) `localStorage.setItem` throws
// synchronously and does not partially write, so the copy already stored
// under a key is untouched by a write attempt that fails. What must be true
// on top of that browser guarantee: Studio must not claim the failed edit
// was saved, and must give the owner an explicit way to keep the work
// (export) instead of silently losing it.

test('a storage-quota write does not claim the edit as saved, offers export, and leaves the previous copy intact', async ({ page }) => {
  const EDIT_SENTINEL = 'LW-SENTINEL-QUOTA-EDIT';
  const seedProject = JSON.stringify({ version: 3, id: 'lwproj-quota-fixture', name: 'Good Copy' });
  await seedStorage(page, { [AUTOSAVE_KEY]: seedProject, [AUTOSAVE_BACKUP_KEY]: seedProject });

  // Throw once — specifically on the write that would persist OUR edit (the
  // one containing the sentinel) — so a legitimate, unrelated flush (e.g. the
  // boot-time re-save of the restored project) is never the thing quota
  // blocks in this test.
  await page.addInitScript(({ key, sentinel }: { key: string; sentinel: string }) => {
    const realSetItem = Storage.prototype.setItem;
    let thrown = false;
    Storage.prototype.setItem = function patchedSetItem(this: Storage, k: string, v: string) {
      if (k === key && !thrown && typeof v === 'string' && v.includes(sentinel)) {
        thrown = true;
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return realSetItem.call(this, k, v);
    };
  }, { key: AUTOSAVE_KEY, sentinel: EDIT_SENTINEL });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expectWorkingLayoutScreen(page);
  await expect(page.locator('.crumb .proj')).toHaveText('Good Copy');

  // Let the boot-time flush land first, so "the previous good copy" below is
  // compared against Studio's own normalized snapshot, not the hand-written
  // fixture (the app re-serializes with its full field set on first flush).
  await page.waitForTimeout(700);
  const goodCopyBeforeEdit = await readKey(page, AUTOSAVE_KEY);
  expect(goodCopyBeforeEdit).not.toContain(EDIT_SENTINEL);

  // Edit the project — renaming is the lightest real edit available on this
  // screen — which the debounced autosave then tries, and fails, to persist.
  await page.getByTestId('project-name-edit').click();
  await page.getByTestId('project-name-input').fill(EDIT_SENTINEL);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);

  // The edit is still live in the open workspace…
  await expect(page.locator('.crumb .proj')).toHaveText(EDIT_SENTINEL);

  // …but Studio never claims it was saved, and offers an explicit way out.
  await page.getByTestId('topbar-projects').click();
  await expect(page.getByTestId('projects-panel')).toBeVisible();
  await expect(page.getByTestId('project-save-limited')).toBeVisible();
  await expect(page.getByTestId('project-save-limited')).toContainText('Export to computer');

  // The previous good copy — primary AND backup slot — is exactly what it
  // was before the failed write attempt; the failed edit never reached
  // storage.
  expect(await readKey(page, AUTOSAVE_KEY)).toBe(goodCopyBeforeEdit);
  expect(await readKey(page, AUTOSAVE_KEY)).not.toContain(EDIT_SENTINEL);
  expect(await readKey(page, AUTOSAVE_BACKUP_KEY)).not.toContain(EDIT_SENTINEL);
});

test('an unknown newer schema (version 99) is quarantined and Studio opens a default project, not the sentinel data', async ({ page }) => {
  const FUTURE_SENTINEL = 'LW-SENTINEL-FUTURE-SCHEMA';
  const future = JSON.stringify({ version: 99, name: FUTURE_SENTINEL, sentinel: FUTURE_SENTINEL });
  await seedStorage(page, { [AUTOSAVE_KEY]: future });

  await page.goto(LAYOUT_ROUTE, { waitUntil: 'domcontentloaded' });
  await expectWorkingLayoutScreen(page);

  // The raw, unrestorable payload survives in quarantine…
  await expect.poll(() => readKey(page, QUARANTINE_KEY)).toContain(FUTURE_SENTINEL);
  const record = JSON.parse(await readKey(page, QUARANTINE_KEY));
  expect(record.reason).toBe('unsupported-version');
  expect(JSON.parse(record.payload).version).toBe(99);

  // …Studio opened a default project instead of the unreadable sentinel
  // data — never named after it, and warned that it could not be opened…
  await expect(page.locator('.crumb .proj')).toHaveText('Untitled Project');
  await expect(page.locator('.crumb .proj')).not.toHaveText(FUTURE_SENTINEL);
  await page.getByTestId('topbar-projects').click();
  await expect(page.getByTestId('autosave-quarantine')).toBeVisible();

  // …and the 500 ms debounced flush did not destroy the quarantined bytes.
  await page.waitForTimeout(2500);
  expect(await readKey(page, QUARANTINE_KEY)).toContain(FUTURE_SENTINEL);
  expect(await readKey(page, AUTOSAVE_KEY)).not.toContain(FUTURE_SENTINEL);
});
