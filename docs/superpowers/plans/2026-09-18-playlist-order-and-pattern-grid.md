# Playlist Order and Pattern Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a consistent Playlist sequencer with decimal-minute Length editing and a stable, accessible Pattern Pool tile grid without changing the persisted/card `dwellSeconds` contract.

**Architecture:** Keep card/runtime data in integer seconds and add a small browser-side formatting/parsing boundary for the minute UI. Keep `PlaylistScreen` as the interaction owner, add one open-row menu state, and render the canonical pattern bank rather than filtering selected patterns out. Limit presentation work to the two Playlist stylesheets and preserve all existing card operations.

**Tech Stack:** React 18, CSS Grid/Flexbox, Node test runner, Playwright, Vite.

---

## File map

- Create `lightweaver/src/lib/playlistDuration.js`: pure seconds/minutes display and commit helpers.
- Create `lightweaver/src/lib/playlistDuration.test.js`: conversion, bounds, legacy-format, and invalid-draft unit coverage.
- Modify `lightweaver/src/v3/lw-playlist.jsx`: Length draft/commit UI, row overflow menu, stable bank rendering, semantic section headings, and loop explanation.
- Modify `lightweaver/src/styles/v3-playlist-console.css`: row/pool visual system, contrast, selected/add states, and responsive layout.
- Modify `lightweaver/src/styles/v3-playlist-extra.css`: menu positioning and phone/coarse-pointer behavior that is live-only rather than inherited mock styling.
- Modify `lightweaver/tests/playlist-timed.spec.ts`: decimal-minute UI to exact seconds-card contract.
- Modify `lightweaver/tests/playlist-storage.spec.ts`: row control/menu/reorder regression coverage.
- Modify `lightweaver/tests/patterns-playlist-compact.spec.ts`: stable pool order/selected state and 390px layout.

### Task 1: Duration boundary

**Files:**
- Create: `lightweaver/src/lib/playlistDuration.js`
- Create: `lightweaver/src/lib/playlistDuration.test.js`

- [ ] **Step 1: Write failing unit tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPlaylistLengthMinutes, parsePlaylistLengthMinutes } from './playlistDuration.js';

test('formats stored seconds as compact decimal minutes', () => {
  assert.equal(formatPlaylistLengthMinutes(30), '0.5');
  assert.equal(formatPlaylistLengthMinutes(90), '1.5');
  assert.equal(formatPlaylistLengthMinutes(37), '0.62');
});

test('parses decimal minutes to bounded integer seconds', () => {
  assert.deepEqual(parsePlaylistLengthMinutes('1.5'), { ok: true, seconds: 90 });
  assert.deepEqual(parsePlaylistLengthMinutes('0.02'), { ok: true, seconds: 1 });
  assert.deepEqual(parsePlaylistLengthMinutes('60'), { ok: true, seconds: 3600 });
  assert.deepEqual(parsePlaylistLengthMinutes(''), { ok: false });
  assert.deepEqual(parsePlaylistLengthMinutes('not-a-number'), { ok: false });
});
```

- [ ] **Step 2: Witness red**

Run: `cd lightweaver && node --test src/lib/playlistDuration.test.js`

Expected: FAIL because `playlistDuration.js` does not exist.

- [ ] **Step 3: Implement the pure conversion boundary**

```js
const MIN_SECONDS = 1;
const MAX_SECONDS = 3600;

export function formatPlaylistLengthMinutes(seconds) {
  const bounded = Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Math.round(Number(seconds) || 30)));
  return String(Number((bounded / 60).toFixed(2)));
}

export function parsePlaylistLengthMinutes(value) {
  if (String(value).trim() === '') return { ok: false };
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return { ok: false };
  return {
    ok: true,
    seconds: Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Math.round(minutes * 60))),
  };
}
```

- [ ] **Step 4: Run the unit test green**

Run: `cd lightweaver && node --test src/lib/playlistDuration.test.js`

Expected: all tests PASS.

### Task 2: Lock the new browser contract

**Files:**
- Modify: `lightweaver/tests/playlist-timed.spec.ts`
- Modify: `lightweaver/tests/playlist-storage.spec.ts`
- Modify: `lightweaver/tests/patterns-playlist-compact.spec.ts`

- [ ] **Step 1: Change timed-playlist expectations to decimal minutes**

Update the desktop and 390px test loop so the 30-second fixture expects `0.5`, fills `1.5`, blurs or presses Enter, and still asserts the `/api/config` payload contains `{ dwellSeconds: 90 }`. Also assert the visible explanatory sentence includes `loops for its Length` and `next`.

- [ ] **Step 2: Add row-menu assertions**

Replace the current four-direct-button assertion with:

```ts
await expect(auroraRow.getByRole('button', { name: 'Live', exact: true })).toBeVisible();
const more = auroraRow.getByRole('button', { name: 'More actions for Aurora' });
await expect(more).toBeVisible();
await more.click();
await expect(page.getByRole('menuitem', { name: 'Duplicate Aurora' })).toBeVisible();
await expect(page.getByRole('menuitem', { name: 'Remove Aurora' })).toBeVisible();
await page.keyboard.press('Escape');
await expect(page.getByRole('menuitem', { name: 'Remove Aurora' })).toHaveCount(0);
```

Retain the existing reorder dimensions, descriptions, keyboard movement, touch drag, and removal-result checks by opening the overflow menu before invoking Remove.

- [ ] **Step 3: Add stable Pattern Pool assertions**

In `patterns-playlist-compact.spec.ts`, assert:

```ts
const tiles = page.locator('.pl-pattern-tile');
await expect(tiles).toHaveCount(CARD_PATTERN_BANK.length);
await expect(tiles.nth(0)).toContainText(CARD_PATTERN_BANK[0].label);
await expect(tiles.nth(1)).toContainText(CARD_PATTERN_BANK[1].label);
const aurora = page.getByRole('button', { name: /Aurora.*already in playlist/i });
await expect(aurora).toHaveAttribute('aria-pressed', 'true');
await expect(page.locator('.pl-pattern-tile .pl-chip-add')).toHaveCount(0);
```

Click one unselected tile and assert tile count/order stay unchanged while its `aria-pressed` becomes `true`.

- [ ] **Step 4: Witness focused red**

Run:

```bash
cd lightweaver
npx playwright test tests/playlist-timed.spec.ts tests/playlist-storage.spec.ts tests/patterns-playlist-compact.spec.ts --project=chromium --workers=1
```

Expected: FAIL on Dwell/seconds copy, direct Copy/Remove buttons, filtered pool size, and absent selected tile state.

### Task 3: Implement Playlist interactions

**Files:**
- Modify: `lightweaver/src/v3/lw-playlist.jsx`

- [ ] **Step 1: Wire minute drafts without mutating untouched data**

Import the duration helpers. Add `lengthDrafts` state keyed by playlist item id, derive each input value from the draft or `formatPlaylistLengthMinutes(item.dwellSeconds)`, and implement commit/cancel handlers:

```js
const commitItemLengthMinutes = (itemId, draft) => {
  const parsed = parsePlaylistLengthMinutes(draft);
  if (!parsed.ok) {
    setLengthDrafts((current) => omitKey(current, itemId));
    return;
  }
  setItemDwellSeconds(itemId, parsed.seconds);
  setLengthDrafts((current) => omitKey(current, itemId));
};
```

The input uses `inputMode="decimal"`, `min="0.02"`, `max="60"`, `step="0.1"`, minute labels, Enter commit, Escape restore, and blur commit.

- [ ] **Step 2: Add one accessible row overflow menu**

Add `openRowMenuId` state plus refs/effects for Escape, outside-click dismissal, and trigger focus return. Keep Live visible; move duplicate and remove into a positioned `role="menu"` attached to a `More actions for …` button. Use existing icons where available, explicit text labels, `role="menuitem"`, and close before executing either action.

- [ ] **Step 3: Render stable canonical Pattern Pool tiles**

Replace the filtered `pool` with a canonical mapped bank carrying `added` state:

```js
const patternTiles = DEFAULT_CARD_PATTERN_BANK.map((pattern) => ({
  ...realPatternShape(pattern.id),
  added: playlistContainsPattern(playlist, pattern.id),
}));
```

Render every tile as a whole button with `aria-pressed`, an explicit Add/Preview accessible label, palette sample, name, and a text state node that reads `Added` when selected and `Add` for hover/focus styling otherwise. Do not render `I.plus`.

- [ ] **Step 4: Clarify semantics and landmarks**

Add one visible sentence near timing: `Each look loops for its Length, then fades to the next.` Convert major section titles to `h2` elements while retaining their existing classes, and update header counts to total patterns plus selected count.

- [ ] **Step 5: Run focused browser tests**

Run the Task 2 Playwright command.

Expected: interaction assertions pass; remaining failures are presentation measurements handled in Task 4.

### Task 4: Implement the consistent visual system

**Files:**
- Modify: `lightweaver/src/styles/v3-playlist-console.css`
- Modify: `lightweaver/src/styles/v3-playlist-extra.css`

- [ ] **Step 1: Normalize desktop rows**

Define a strict row grid and shared control token values locally:

```css
.pm .pl-row {
  grid-template-columns: 64px 44px minmax(140px, 1fr) 124px 52px 36px;
  gap: 10px;
  min-height: 60px;
}
.pm .pl-grip,
.pm .pl-row .plbtn,
.pm .pl-dwell-input {
  height: 36px;
  border-radius: var(--r-md);
}
```

Replace the ordinal disc with flat tabular text, align Length/input/unit, and ensure Live plus overflow occupy fixed positions.

- [ ] **Step 2: Style the overflow menu**

Position the menu from a relative action wrapper, use the existing elevated panel/border/shadow tokens, make menu items at least 36px high, give Remove danger treatment only on hover/focus, and keep z-index above adjacent rows.

- [ ] **Step 3: Replace pills with an equal-card grid**

```css
.pl-pool.pl-pool {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.pl-pattern-tile {
  min-width: 0;
  min-height: 52px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  grid-template-rows: auto auto;
}
```

Use fixed card geometry, two-line ellipsis for long labels, accent border/background only for selected/focus state, and reveal `.pl-pattern-action` on hover/focus while keeping selected `Added` visible.

- [ ] **Step 4: Make the phone layout deliberate**

At `max-width: 640px`, stack each row into identity and action bands, set every row action/input to 44px minimum height, keep a two-column pattern grid where it fits, and prevent horizontal overflow. Raise essential secondary text to the next existing contrast token and remove the 8.5px essential label size.

- [ ] **Step 5: Re-run focused browser tests**

Run the Task 2 Playwright command.

Expected: all focused tests PASS at desktop and 390px.

### Task 5: Screen proof and proportional checkpoint

**Files:**
- Modify only if a focused defect is found in the files above.

- [ ] **Step 1: Run unit and production build proof**

```bash
cd lightweaver
node --test src/lib/playlistDuration.test.js src/lib/cardPlaylist.test.js
npm run build
```

Expected: all unit tests pass and Vite production build exits 0.

- [ ] **Step 2: Inspect actual desktop and phone screens**

Inspect `http://127.0.0.1:4173/#screen=playlist` at the normal desktop viewport and `390×844`. Confirm row alignment, open/closed overflow states, tile selected/add states, no repeated pluses, no horizontal overflow, and at least 44px phone controls. Capture screenshots as evidence without changing card or firmware state.

- [ ] **Step 3: Run the one integrated checkpoint**

Run: `cd lightweaver && node scripts/lightweaver-dev.mjs checkpoint`

Expected: the proportional checkpoint completes successfully. Do not invoke `launch:check`, deployment, release signing, firmware build, or flashing.

- [ ] **Step 4: Run the final mechanical detector once**

Run:

```bash
node /Users/adrianrasmussen/.agents/skills/impeccable/scripts/detect.mjs --json \
  lightweaver/src/v3/lw-playlist.jsx
```

Expected: no new blocking design-pattern findings; review any output for false positives.

- [ ] **Step 5: Review and commit the coherent batch**

```bash
git diff --check
git status --short
git add docs/superpowers/specs/2026-09-18-playlist-order-and-pattern-grid-design.md \
  docs/superpowers/plans/2026-09-18-playlist-order-and-pattern-grid.md \
  lightweaver/src/lib/playlistDuration.js \
  lightweaver/src/lib/playlistDuration.test.js \
  lightweaver/src/v3/lw-playlist.jsx \
  lightweaver/src/styles/v3-playlist-console.css \
  lightweaver/src/styles/v3-playlist-extra.css \
  lightweaver/tests/playlist-timed.spec.ts \
  lightweaver/tests/playlist-storage.spec.ts \
  lightweaver/tests/patterns-playlist-compact.spec.ts
git commit -m "feat: refine playlist composition controls"
```

Expected: one local commit; nothing pushed or deployed.
