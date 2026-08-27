# Pattern sampling join — Implementation Plan

> **For agentic workers:** Grok 4.6 wrote this plan and is the only model
> allowed to change it. Do **not** implement this plan as Grok 4.6.
> Implementers are **Composer 2.5** (layout/CSS) and **Grok 4.5** (JS, tests).
> After every phase, stop and return evidence to the 4.6 guide session.
> REQUIRED SUB-SKILL for implementers: `test-driven-development` on every
> behavior change. Do not use `subagent-driven-development` to spawn further
> agents — one implementer per phase, then a 4.6 review.

**Goal:** Patterns is the sampling surface (tap a look, lights change, sliders stay in reach). Pattern Lab is a depth door off that surface, not a second app you start over in.

**Architecture:** Keep both screens. Do not merge `lw-pattern.jsx` and `PatternLabScreen.jsx`. Share one current look, one native live-preview protocol for the 30 card-bank patterns, and a hash door both ways. The UI shift is structural, not a restyle: preview + Speed/Brightness/Hue stay on screen while the pattern grid scrolls.

**Tech Stack:** React, Vite, existing `pushLivePreviewToCard` / `recipeFromPattern` / `lookFromRecipe`, Playwright (`patterns-v3.spec.ts`, `tests/helpers/pattern-lab.ts`), Node unit tests.

---

## Agent contract — locked

| Role | Model (Cursor slug) | Allowed to |
|---|---|---|
| Guide | Grok 4.6 (`cursor-grok-4.6-high-fast` or this session) | Write/amend this plan. Review each phase. Decide when a contract question is real. **Not** write product CSS/JS for these tasks. |
| Layout | Composer 2.5 (`composer-2.5-fast`) | Phase 1 (and Phase 5 CSS). Sticky instrument chrome. Must not retouch live-preview, handoff, or recipe code. |
| Wiring | Grok 4.5 (`cursor-grok-4.5-high-fast`) | Phases 2–5 JS and tests. Must not invent a third preview protocol or expand firmware scalars. |

If an implementer hits a choice this plan does not name, **stop and ask 4.6**. Do not pick a clever default.

Verification per phase: one focused Playwright or Node test first (red), then the smallest code, then the same test green, then look at `http://127.0.0.1:4173/#screen=pattern` (and Lab) at **desktop and Pixel-width**. Do not run `launch:check`. Do not bump `VERSION`. Do not add an npm script (that maps to ALL_LANES).

---

## Why this exists

Two facts from the 2026-08-27 audit, both still true in source:

1. **Island.** Lab opens empty, never loads the project look, advertises “lights stay unchanged,” samples via a pixel-frame stream, and “Use in Project” only for the 30 native bank patterns — then stays on Lab. Patterns never links to Lab. Drafts, looks, and custom JS patterns are three stores. Patterns labels custom tiles “Custom Pattern Lab pattern,” which Lab never writes.

2. **Sliders are a hike.** On desktop `.pm-grid` is `1fr + 330px` with `align-items: start` and **no sticky aside**, so scrolling the 24-card grid (then Show more) takes Speed/Brightness/Hue off the top. On phone (`max-width: 900px`) the aside is `order: -1` and only `.pm-preview-pane` is sticky — the Color pane with the sliders scrolls away the moment you enter the grid. `PATTERN_PAGE = 24` in `lw-pattern.jsx`. That is the “scroll so far from patterns to sliders” bug.

This plan continues `lightweaver/todo/plans/patternlab-rebuild.md` remaining item (2) — auto-load current pattern — and does **not** take on that plan’s Phase 3 bake or Phase 4 living generators.

---

## Locked product shape

### Patterns (sampling)

Always on screen, one instrument strip:

- Mapped piece preview
- Hue, Brightness, Speed (existing testids `look-hue-slider`, `look-brightness-slider`, `look-speed-slider` — **do not rename**)
- The pattern grid scrolls **under or beside** that strip, never above it in document order on phone

Progressive disclosure (collapsed by default on phone): Design target / mix bar / Geometry / Advanced (Breathe, Drift, Hue shift).

Tap a tile still calls `scheduleBrowseLivePreview` → `pushLivePreviewToCard`. That path does not change.

New control on the instrument strip: **Sculpt in Lab** (`data-testid="open-pattern-lab"`). Goes to `#screen=pattern-lab&patternId=<current>`.

### Pattern Lab (depth)

- On mount, if there is no draft yet, load `standaloneController.defaultLook.patternId` (or the hash `patternId`) through `recipeFromPattern` + playback from the look. Never show the empty sculpture if the project already has a built-in look.
- Native-bank pattern (one of `CORE_CARD_PATTERN_BANK`): a Lab tile tap uses the **same** `pushLivePreviewToCard` look as Patterns. Frame-stream “Preview on Lights” stays for generators and non-bank library patterns only.
- Successful **Use in Project** (`live-on-card`) sets the controller look, then navigates to `#screen=pattern`. Stay on Lab only when the result is blocked.

### Rail

Lab stays in the rail until Phase 5 (the door must exist first). Phase 5 removes the rail item; Lab remains routable at `#screen=pattern-lab` the way Discovery is routable without a rail entry.

### Deliberately not doing

- Merging the two screens into one component
- Bake / Record to piece (still `patternlab-rebuild.md` Phase 3)
- Teaching firmware extra per-pattern params
- Changing the 1.2s worker watchdog (Adrian’s call, separate TODO)
- A third localStorage store
- Relabelling custom JS tiles until Lab actually writes `customPatterns` (it must not, in this plan)

---

## File map

| File | Who | Why |
|---|---|---|
| `lightweaver/src/v3/v3-screens.css` | Composer | Sticky instrument; phone order; do not restyle the whole Patterns mockup |
| `lightweaver/src/v3/lw-pattern.jsx` | Composer (markup order) then 4.5 (Sculpt button) | Move Hue/Brightness/Speed next to the preview pane; keep Advanced/Geometry out of the sticky strip |
| `lightweaver/src/lib/patternLabFromLook.js` | 4.5 | **New.** `recipeFromLook(look)` — inverse of `lookFromRecipe` in `patternLabHandoff.js`. Pure. |
| `lightweaver/src/lib/patternLabFromLook.test.js` | 4.5 | Unit tests for that helper |
| `lightweaver/src/pattern-lab/PatternLabScreen.jsx` | 4.5 | Auto-load; hash `patternId`; navigate home after handoff |
| `lightweaver/src/pattern-lab/PatternLabPreview.jsx` | 4.5 | Native-bank taps use look-preview, not frame stream |
| `lightweaver/src/v3/app.jsx` | 4.5 Phase 5 | Drop Lab from `STUDIO_SCREENS` rail list; keep it in `SCREEN_KEYS` |
| `lightweaver/tests/pattern-instrument-reach.spec.ts` | Composer writes the failing spec; both keep it green | Sliders remain in the viewport after scrolling the grid |
| `lightweaver/tests/pattern-lab-autoload.spec.ts` | 4.5 | Lab opens on the project look, not empty |
| `lightweaver/tests/pattern-lab-door.spec.ts` | 4.5 | Sculpt → Lab with that pattern; Use in Project → Patterns |
| `lightweaver/tests/helpers/pattern-lab.ts` | 4.5 | Only if existing helpers break; do not move mobile config |

Do not edit `firmware/`. Do not edit `lightweaver/package.json`.

---

## Phase 1 — Sliders stay in reach (Composer 2.5)

**Why first:** this is the complaint you can feel without any Lab wiring. Patterns stays usable even if later phases slip.

### Task 1.1: Failing reach spec

**Files:** Create `lightweaver/tests/pattern-instrument-reach.spec.ts`

- [ ] Write a Playwright spec that fails on current CSS:

```ts
import { test, expect } from './studioTest';

test('Speed stays on screen after scrolling the pattern grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  const speed = page.getByTestId('look-speed-slider');
  await expect(speed).toBeVisible();
  await page.locator('.pm-cards').evaluate((node) => { node.scrollIntoView({ block: 'end' }); });
  await page.mouse.wheel(0, 800);
  const box = await speed.boundingBox();
  expect(box, 'Speed slider must remain in the viewport').toBeTruthy();
  expect(box.y + box.height).toBeGreaterThan(0);
  expect(box.y).toBeLessThan(844);
});

test('desktop: Color pane stays while the grid scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#screen=pattern', { waitUntil: 'domcontentloaded' });
  await page.locator('.pm-cards').evaluate((node) => { node.scrollIntoView({ block: 'end' }); });
  await page.mouse.wheel(0, 1200);
  await expect(page.getByTestId('look-speed-slider')).toBeInViewport();
  await expect(page.getByTestId('look-brightness-slider')).toBeInViewport();
  await expect(page.getByTestId('look-hue-slider')).toBeInViewport();
});
```

- [ ] Run until red:

```bash
cd lightweaver && node scripts/lightweaver-dev.mjs focused tests/pattern-instrument-reach.spec.ts
```

Expected: FAIL because sliders have left the viewport.

### Task 1.2: Markup — instrument strip

**Files:** Modify `lightweaver/src/v3/lw-pattern.jsx` around the aside starting ~line 2232.

- [ ] Wrap the existing preview pane **and** the Hue / Saturation / Brightness / Speed controls in one parent:

```jsx
<aside className="pm-aside">
  <div className="pm-instrument" data-testid="pattern-instrument">
    {/* existing pm-preview-pane unchanged */}
    <div className="card pm-pane pm-tune-pane">
      {/* existing Hue input + Saturation + Brightness + Speed sliders
          keep every data-testid */}
    </div>
  </div>
  <div className="card pm-pane">
    {/* Save look / Reset / palette chips / Advanced details — not sticky */}
  </div>
  {/* Geometry pane stays here, not sticky */}
</aside>
```

Do not move Design target out of `pm-main` in this task (that is optional polish; sticky tune controls are the bar). Do not restyle cards.

### Task 1.3: CSS — sticky instrument

**Files:** Modify `lightweaver/src/v3/v3-screens.css` at `.pm-grid` (~722) and the `@media (max-width: 900px)` block (~906).

Desktop:

```css
.pm-aside {
  position: sticky;
  top: 12px;
  align-self: start;
  max-height: calc(100dvh - 96px);
  overflow: auto;
}
.pm-instrument { display: flex; flex-direction: column; gap: 10px; }
```

Phone (`max-width: 900px`): keep aside `order: -1`. Make **`.pm-instrument`** sticky, not only `.pm-preview-pane`:

```css
@media (max-width: 900px) {
  .pm-grid { grid-template-columns: minmax(0, 1fr); }
  .pm-aside { position: static; max-height: none; overflow: visible; order: -1; }
  .pm-instrument {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg);
    padding-bottom: 8px;
  }
  .pm-preview-pane { position: static; } /* stickiness moved to the parent */
}
```

The sticky stack must stay short: compact preview + four sliders. If it eats half the phone, shrink the piece preview height in this breakpoint only (do not change desktop preview).

- [ ] Re-run `tests/pattern-instrument-reach.spec.ts` — expected PASS.
- [ ] Re-run `tests/pattern-controls-live.spec.ts` and the Patterns cases in `tests/patterns-v3.spec.ts` that touch `look-*-slider` — expected still PASS.
- [ ] Open `/#screen=pattern` at 1280×800 and 390×844. Tap a card near the bottom of the first page, then move Speed. Both must be possible without scrolling the sliders back into view.

**4.6 review gate.** Do not start Phase 2 until the guide has seen the reach spec green and the two viewports.

---

## Phase 2 — Lab opens on the current look (Grok 4.5)

Absorbs remaining item (2) from `patternlab-rebuild.md`.

### Task 2.1: `recipeFromLook`

**Files:**
- Create `lightweaver/src/lib/patternLabFromLook.js`
- Create `lightweaver/src/lib/patternLabFromLook.test.js`

`lookFromRecipe` in `patternLabHandoff.js` already maps recipe → saved look (middle palette swatch → `customHue`, playback → brightness/speed). This helper is the inverse for **opening** Lab.

```js
import { recipeFromPattern } from './patternLabPatternAdapter.js';
import { isBuiltInPattern } from './patternRegistry.js';
import { cardColorToHex } from './cardVisualLook.js';

export function recipeFromLook(look = {}, context = {}) {
  const patternId = String(look.patternId || '').trim();
  if (!patternId || !isBuiltInPattern(patternId)) return null;
  const recipe = recipeFromPattern(patternId, context);
  const hex = cardColorToHex(look);
  return {
    ...recipe,
    playback: {
      ...recipe.playback,
      brightness: Number.isFinite(look.brightness) ? look.brightness : recipe.playback.brightness,
      speed: Number.isFinite(look.speed) ? look.speed : recipe.playback.speed,
    },
    palette: hex ? recipe.palette.map(() => hex) : recipe.palette,
  };
}
```

(If `cardColorToHex` needs the look object in a different shape, read `cardVisualLook.js` and match it — do not invent a second hex conversion.)

Unit tests (Node):

- aurora look → recipe `base.patternId === 'aurora'`
- unknown / custom id → `null` (Lab must not crash; empty state is then honest)
- brightness `0.4` and speed `2` survive onto `playback`
- a look with no `patternId` → `null`

```bash
cd lightweaver && node --test src/lib/patternLabFromLook.test.js
```

Red first: file missing. Then implement.

### Task 2.2: Mount load + hash

**Files:** `lightweaver/src/pattern-lab/PatternLabScreen.jsx` (the mount effect ~517 and `choosePattern` ~843)

On ready, **once**:

1. Read `patternId` from `URLSearchParams(window.location.hash.slice(1))` (same parse as `app.jsx`).
2. Else `project.standaloneController?.defaultLook`.
3. `const recipe = recipeFromLook(lookOr{ patternId })`.
4. If recipe and `!draft`, set source + draft the same way `choosePattern` does, **without** offering undo (there is no previous Lab work).
5. If null, keep today’s empty state.

Do not call `setPlaying(false)`. Do not auto-open the phone sheet to `full` on this load; peek is enough once a recipe exists. If the current `choosePattern` calls `settleSheetOnSculpt()`, using that on auto-load is OK.

### Task 2.3: Autoload spec

**Files:** Create `lightweaver/tests/pattern-lab-autoload.spec.ts`

Use `tests/helpers/pattern-lab.ts` for any sheet open. Assert:

- With a default project, `#screen=pattern-lab` shows `pattern-lab-draft-name` with a value (not the empty “Begin with a pattern” heading).
- `#screen=pattern-lab&patternId=fire` names Fire (or the library’s display name for `fire`).
- `#screen=pattern-lab&patternId=not-a-pattern` stays on the empty state (no crash).

```bash
cd lightweaver && node scripts/lightweaver-dev.mjs focused tests/pattern-lab-autoload.spec.ts
```

**4.6 review gate.**

---

## Phase 3 — Door both ways (Grok 4.5)

### Task 3.1: Sculpt in Lab

**Files:** `lightweaver/src/v3/lw-pattern.jsx` instrument strip.

Button next to Save look / on the instrument:

```jsx
<button
  type="button"
  className="btn"
  data-testid="open-pattern-lab"
  onClick={() => { window.location.hash = `#screen=pattern-lab&patternId=${encodeURIComponent(look.patternId || '')}`; }}
>
  Sculpt in Lab
</button>
```

Use `look.patternId` from the live preview look already in that function. Do not invent a `go()` if hash navigation is how this app already switches screens.

### Task 3.2: Use in Project comes back

**Files:** `lightweaver/src/pattern-lab/PatternLabScreen.jsx` `useInProjectPrimary` (~1321)

After `result.ok === true` and `result` is a look (not a blocked bake), set:

```js
window.location.hash = '#screen=pattern';
```

Keep the success `setMessage` for the blocked path. Do not auto-navigate on `bake-to-card` / `studio-only` (those still open runtime tools).

### Task 3.3: Door spec

**Files:** Create `lightweaver/tests/pattern-lab-door.spec.ts`

- Patterns → click `open-pattern-lab` → Lab draft is the selected pattern.
- Lab, native pattern, click the promoted Use in Project → hash contains `screen=pattern` and Patterns shows that look selected (`.pmcard.on` or the preview meta label).

Also delete or rewrite the Patterns copy `description: pattern.description || 'Custom Pattern Lab pattern.'` in `lw-pattern.jsx` (~857) to `Custom pattern` — it is a lie today.

**4.6 review gate.**

---

## Phase 4 — Lab sampling matches Patterns for native bank (Grok 4.5)

**Why this is last of the join, not first:** layout and the door can ship without touching the card stream. This phase is the remaining “hard to sample” fix.

### Task 4.1

When `CORE_CARD_PATTERN_BANK` contains `recipe.base.patternId` and there are no layers / evolution enabled:

- Lab tile tap should call the same look preview as Patterns (`pushLivePreviewToCard` with brightness/speed/hue from the recipe via `lookFromRecipe`).
- Do **not** start `createPatternLabPreviewSession` for that case.
- “Preview on Lights” remains for everything else (generators, non-bank library, bake-class recipes).

Reuse `lookFromRecipe` from `patternLabHandoff.js` if it is already exported; if it is file-private, export it rather than copy-paste.

Add or extend `tests/pattern-lab-live-preview.spec.ts` so a native aurora tap hits `/api` look preview (mock) and does **not** open a frame stream. If that spec’s restore assertion at line 73 is still red, fix the `restored` flag merge in `PatternLabPreview.jsx` `togglePhysicalPreview` catch (TODO already names this) in the same phase — it is the same file.

**4.6 review gate.** This is the only phase that may touch card live-control. If the mock card in the spec is wrong, fix the spec; do not weaken `pushLivePreviewToCard`.

---

## Phase 5 — Lab off the rail (Grok 4.5 + Composer CSS if the rail gaps)

Only after Phases 1–3 are on the branch.

**Files:** `lightweaver/src/v3/app.jsx`

- Keep `PatternLabScreen` lazy import.
- Remove `{ id: 'pattern-lab', ... }` from `STUDIO_SCREENS` (that array **is** the rail).
- Add `'pattern-lab'` to the extra keys next to `'discovery'` so `#screen=pattern-lab` still works (`SCREEN_KEYS` already appends `discovery` — same pattern).

Any spec that clicks a rail item labelled Pattern Lab must switch to `open-pattern-lab` or a direct hash. Grep `pattern-lab` in `lightweaver/tests` before editing.

**4.6 review gate.** Then checkpoint:

```bash
cd lightweaver && node scripts/lightweaver-dev.mjs checkpoint
```

---

## Out of scope until 4.6 reopens this plan

- Record to piece / bake UI (`patternlab-rebuild.md` Phase 3)
- Showing `sequenceAssets` on Patterns
- Worker watchdog timing
- Firmware native-parameter expansion

---

## Handoff to implementers

Start a **new** Cursor agent per phase:

1. Composer 2.5 — “Execute Phase 1 of `docs/superpowers/plans/2026-08-27-pattern-sampling-join.md`. Do not start Phase 2.”
2. Stop. 4.6 reviews the reach spec + both viewports.
3. Grok 4.5 — Phase 2 only.
4. Stop. 4.6 reviews autoload.
5. Grok 4.5 — Phase 3, then 4, then 5, each with a 4.6 stop between.

Do not batch all five into one Composer run. The rail removal without the door strands Lab.
