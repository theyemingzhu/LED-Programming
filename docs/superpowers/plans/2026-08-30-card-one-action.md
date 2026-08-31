# Card one-action workspace Implementation Plan

## 2026-08-30 audit deltas (read first — do not start over)

Tasks 1–7 are already committed on branch `card-one-action` at `a5bb834a`. The Test & Install tab is gone. Card Home already hosts `CardInstallAction`. Hardware no longer has a second Install. Footer visible copy is the status word only. `#screen=layout&mode=wire` already opens `#screen=card&section=setup&task=install-project`.

Do not re-extract `CardInstallAction`. Do not re-add ModeSwitch. Do not restore the Hardware install row. Do not bump VERSION, flash, or ship.

Checkpoint already run on that revision: 2201/2201 unit tests, Vite production build. Focused Playwright for the new specs was green in the building session.

**What is still owed (the next bounded pass):** Card Home still says “connected” / “Untitled Project” in too many places at once (setup header facts, the up-to-date banner, Detected state, matching-project panel, footer). Adrian confirmed the doors are right and asked whether that chorus still feels too long. Compress the Home story so one status and one primary action lead. Keep Hardware and Advanced as closed folds. Keep color-order try-on and card-address recovery. Then checkpoint + browser-verify at http://127.0.0.1:4173/#screen=card and stop.

**Resume:** checkout `card-one-action`. Do not branch off main.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Card page owns connect, LED check, and project install. Layout is only the wiring plan. Preferences stay in the top bar.

**Architecture:** Reuse the existing check and install widgets (`WiringBenchTest`, `StripColorOrderCheck`, `CardPushControl`). Do not invent a second write path. Split the existing `install-project` intent off firmware flash (`#screen=card&section=install`). Retire the Test & Install tab by treating `#screen=layout&mode=wire` as a Card entrance. Collapse Card’s three tabs into one Home with Hardware and Advanced folded underneath.

**Tech Stack:** React 18, Vite, Playwright, Node `node:test`, existing card-link / cardFlowEntry / setupJourney authorities.

**Rule:** Layout draws the plan. The Card is the only place that talks to hardware. Preferences are Studio, not the box.

**Do not:** merge Wire into Card; add a fourth Card tab; delete color-order try-on or the card-address recovery field; bump VERSION / flash / ship.

---

## File map

- Modify `lightweaver/src/lib/cardFlowEntry.js` — `install-project` routes to Card Home, not firmware.
- Modify `lightweaver/src/lib/cardFlowEntry.test.js` — golden table for that split.
- Modify `lightweaver/src/lib/studioRoute.js` — `#screen=layout&mode=wire` becomes Card.
- Modify `lightweaver/src/lib/studioRoute.test.js` — new reconcile contract.
- Modify `lightweaver/src/lib/layoutModeDeepLinks.test.js` — only `draw` remains a Layout mode.
- Modify `lightweaver/src/components/layout/hooks/useLayoutCanvasInteraction.js` — `LAYOUT_MODES` is `['draw']` only.
- Create `lightweaver/src/components/card/CardInstallAction.jsx` — extracted commissioning flow from `WireModePanel` (find-strips / finish-wire / LED check / color-order / `CardPushControl`).
- Modify `lightweaver/src/components/layout/modes/WireModePanel.jsx` — delete; Layout no longer hosts this panel.
- Modify `lightweaver/src/components/layout/shared/ModeSwitch.jsx` — delete after no remaining importer.
- Modify `lightweaver/src/components/LayoutScreen.jsx` — no mode switch; Wire CTA “Check and install on the card”.
- Modify `lightweaver/src/v3/lw-setup.jsx` — `install-project` task renders `CardInstallAction` in place; stop sending that button to firmware.
- Modify `lightweaver/src/v3/lw-card.jsx` — no Home / Hardware / Support tabs; Home always shows journey + install action + Hardware fold + Advanced fold; `section=install` and `section=workshop` stay full-body takeovers; `section=settings` opens the Hardware fold; `section=support` opens Advanced.
- Modify `lightweaver/src/v3/lw-settings.jsx` — `mode="card"` is the Hardware fold: keep address, color-order try-on, brightness, encoder, runtime, read-only outputs. Remove the Install on card / Flash chip / Open installer row.
- Modify `lightweaver/src/components/card/CardStatusControl.jsx` — footer shows status word only (Connected / Save to card / Connect…), not the project or card name.
- Modify `lightweaver/src/v3/app.jsx` — footer click contract unchanged (`cardSurfaceForLifecycle`).
- Tests listed per task below.

---

### Task 1: `install-project` is not firmware

**Files:**
- Modify: `lightweaver/src/lib/cardFlowEntry.js`
- Modify: `lightweaver/src/lib/cardFlowEntry.test.js`
- Modify: `lightweaver/src/v3/lw-setup.jsx` (the `taskId === 'install-project'` button only)
- Test: `node --test src/lib/cardFlowEntry.test.js` from `lightweaver/`

Today both `update-firmware` and `install-project` return `#screen=card&section=install` (USB/Wi-Fi firmware). That is the misdirect.

- [ ] **Step 1: Change the golden table first** (it must fail)

In `cardFlowEntry.test.js`, change only the `install-project` block:

```js
  'install-project': {
    ready: { action: 'route', hash: SETUP_TASK('install-project') },
    disconnected: { action: 'route', hash: SETUP_TASK('install-project') },
    needsProject: { action: 'route', hash: SETUP_TASK('install-project') },
  },
```

Leave `update-firmware` on `#screen=card&section=install`.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd lightweaver && node --test src/lib/cardFlowEntry.test.js
```

Expected: fail on `install-project` hashes still pointing at `section=install`.

- [ ] **Step 3: Split the switch**

In `cardFlowEntry.js` replace the combined case:

```js
    case 'update-firmware':
      return route('#screen=card&section=install');
    case 'install-project':
      return route(setupTaskRoute('install-project'));
```

- [ ] **Step 4: Stop Setup’s button from jumping to firmware**

In `lw-setup.jsx`, the `taskId === 'install-project'` branch currently does `go('#screen=card&section=install')`. Change it to stay on the setup task (the action will be inlined in Task 3). For this task only, make the button call `openCardFlow('install-project', { lifecycle: cardLifecycle, journey })` or set hash to `setupTaskRoute('install-project')` so it no longer opens the firmware screen.

- [ ] **Step 5: Re-run the unit test**

```bash
cd lightweaver && node --test src/lib/cardFlowEntry.test.js
```

Expected: pass.

- [ ] **Step 6: Commit** on branch `card-one-action`

```
fix: route install-project to Card Home, not firmware flash
```

---

### Task 2: Extract `CardInstallAction` (no IA change yet)

**Files:**
- Create: `lightweaver/src/components/card/CardInstallAction.jsx`
- Modify: `lightweaver/src/components/layout/modes/WireModePanel.jsx` to render that component for the commissioning `<section className="lww-flow">` block (everything from `cardNeedsStripDiscovery` through the ready `CardPushControl`)
- Do not delete ModeSwitch yet
- Test: existing `layout-send-to-card.spec.ts` and `layout-wire-install-slim.spec.ts` still pass against Test & Install

Move the commissioning state machine (`checkFlowOpen`, `colorCheckFirst`, find-strips / edit-in-wire / bench test / color-order / install) into `CardInstallAction`. Props it needs from today’s `WireModePanel`:

- `connected`, `cardHost`
- `wiring`, `compiledWiring`, `updateWiring`, `strips`, `patchBoard`
- `standaloneController`, `setStandaloneController`, `confirmedCardLook`
- `projectId`, `projectName`, `installController` (the controller object already passed to `CardPushControl`)
- `installGate`, `commissioningVerified`, `physicallyVerified`
- `cardNeedsStripDiscovery`, `mappingReady`, `adjustableRunIds`, `onAdjustBoundary`, `adjustableOutputIds`, `onAdjustOutput`
- `onEditInWire` — callback that sets Layout mode to `draw`

`CardPushControl` stays the only project-write implementation. Do not copy `pushDirect` from settings.

- [ ] **Step 1:** Create the component by moving the existing JSX, not rewriting the flow.
- [ ] **Step 2:** `WireModePanel` imports and renders it so Test & Install looks the same.
- [ ] **Step 3:** Focused proof:

```bash
cd lightweaver && node scripts/lightweaver-dev.mjs focused tests/layout-send-to-card.spec.ts
```

If the preview server is already up, use the project’s focused Playwright invocation from `docs/development-workflow.md`.

- [ ] **Step 4: Commit**

```
refactor: extract CardInstallAction from Test & Install
```

---

### Task 3: Card Home is where check + install happen

**Files:**
- Modify: `lightweaver/src/v3/lw-setup.jsx` — `install-project` task renders `<CardInstallAction … />` instead of a button that leaves the page
- Modify: `lightweaver/src/v3/lw-card.jsx` — Home always includes `CardInstallAction` under the journey (or only when the journey task is `install-project` / `test-and-save` / wiring is send-ready). Prefer always-visible on Home when a card is connected and the project is installable, so there is one place to look.
- Modify: `lightweaver/src/v3/lw-card.jsx` Home presentations — `primary: { label: 'Install on card', section: 'settings' }` becomes in-place (no jump to Hardware settings). Firmware-only actions keep `section: 'install'`.
- Test: add/adjust a Playwright spec that `#screen=card&section=setup&task=install-project` shows `data-testid="layout-send-to-card"` (the existing `CardPushControl` test id) or `data-testid="start-led-check"`, and does **not** show the firmware “Find your connected card” heading.

`onEditInWire` from Card must `go('#screen=layout&mode=draw')` (Wire, the drawing mode).

- [ ] **Step 1:** Wire `CardInstallAction` onto Card Home with the same project/wiring props Setup/Card already have access to via `useProject()`.
- [ ] **Step 2:** Write the focused Playwright assertion above (new file `lightweaver/tests/card-install-action.spec.ts` is fine).
- [ ] **Step 3:** Run that spec; then commit

```
feat: run LED check and project install on Card Home
```

---

### Task 4: Delete the Test & Install tab

**Files:**
- Modify: `lightweaver/src/lib/studioRoute.js` — when `screen=layout` and `mode=wire`, `studioViewFromHash` returns `'card'`. `canonicalStudioHash` then yields `#screen=card&section=setup&task=install-project` (delete `mode`).
- Modify: `lightweaver/src/lib/studioRoute.test.js` — `reconcile('#screen=layout&mode=wire')` equals that Card hash. Keep `mode=draw` as Layout.
- Modify: `lightweaver/src/components/layout/hooks/useLayoutCanvasInteraction.js` — `LAYOUT_MODES = ['draw']`. Keyboard `2` must not open a second layout mode.
- Delete or stop importing: `ModeSwitch.jsx`, `WireModePanel.jsx` (after Task 2 extraction, the panel should be unused).
- Modify: `LayoutScreen.jsx` — remove the mode switch; at the top of the Wire inspector, one button: “Check and install on the card” → `openCardFlow('install-project')` or hash `#screen=card&section=setup&task=install-project`.
- Move plan-only advanced tools that still belong in Wire (split, cable jump, skipped LEDs, assembly map) into `DrawModePanel` or a Wire disclosure. Chipset, power amps, control GPIOs move to the Card Hardware fold in Task 5 — do not leave them only on a deleted panel.
- Update: `layout-mode-switch.spec.ts` (delete or rewrite: no Test & Install tab; `mode=wire` lands on Card).
- Update: `layoutModeDeepLinks.test.js` — ModeSwitch gone; only `draw` is a Layout mode; remaining `mode=wire` strings in app source must be the Card redirect, not a Layout mode key.
- Update: every Playwright helper that clicks `layout-mode-wire` or expects `layout-wire-panel` on Layout — they now open Card (`card-install-action` / send-to-card / start-led-check).

Known specs that assume the tab (rewrite, do not skip):

- `tests/layout-mode-switch.spec.ts`
- `tests/layout-wire-install-slim.spec.ts`
- `tests/layout-send-to-card.spec.ts`
- `tests/wiring-workspace.spec.ts`
- `tests/wire-card-capacity.spec.ts`
- `src/lib/layoutModeDeepLinks.test.js`
- `src/lib/studioRoute.test.js`

- [ ] **Step 1:** Unit tests for the hash redirect (fail, then implement `studioRoute.js`).
- [ ] **Step 2:** Remove the switch and panel; add the Wire CTA.
- [ ] **Step 3:** Update the Playwright list so focused runs pass.
- [ ] **Step 4: Commit**

```
feat: retire Test & Install tab; old mode=wire opens Card
```

---

### Task 5: One Card page — tabs become folds

**Files:**
- Modify: `lightweaver/src/v3/lw-card.jsx` — stop rendering `card-section-tabs` / mobile section select. Home is the page. `section=install` still mounts `AutomaticInstallScreen`. `section=workshop` still mounts `ProductionScreen`. `section=preferences` is not a Card page (top bar already opens it; if this hash arrives, render Home or send the existing top-bar preferences handler — do not grow a fourth tab).
- `section=settings` and `section=support` stay in the URL vocabulary (`CARD_SECTION_KEYS`) so old links work: they render Home with the matching `<details>` open (`data-testid="card-hardware-fold"` / `data-testid="card-advanced-fold"`).
- Hardware fold content = today’s `SettingsScreen embedded mode="card"` minus the Install row (Task 6).
- Advanced fold content = today’s `CardSupport` tool grid (technician, GPIO guide, JSON, recovery, deployment check, batch).
- Color-order deep link `#screen=card&section=settings&tool=color-order` still auto-starts `StripColorOrderCheck` inside the Hardware fold.

- [ ] **Step 1:** Hide the tab bar; keep section hashes working as folds/takeovers.
- [ ] **Step 2:** Update `tests/card-workspace.spec.ts` and `tests/screen-smoke.spec.ts` that click “Hardware settings” / “Advanced & Support” as tabs — they now open the folds or still reach the same tools.
- [ ] **Step 3: Commit**

```
feat: Card is one page; hardware and advanced fold underneath
```

---

### Task 6: One Install on card button

**Files:**
- Modify: `lightweaver/src/v3/lw-settings.jsx` — remove the “Install on card” / “Open card installer” / “Flash chip” / “Installer guide” action row. Keep Card address (recovery IP). Keep color-order try-on. Keep “Save project to this card” (gesture-confirmed project copy — different job; leave it in Hardware with its existing hint).
- Rewrite: `lightweaver/tests/one-owner-per-question.spec.ts` — the 2026 comment said deleting Hardware Install was withdrawn. This plan deletes it because Card Home now *is* that install. The spec must now assert: Hardware fold has no “Install on card” primary, Card Home / `CardInstallAction` does; address + color-order remain.

- [ ] **Step 1:** Fail the rewritten spec, then remove the settings install row.
- [ ] **Step 2: Commit**

```
fix: Hardware settings no longer offers a second project install
```

---

### Task 7: Footer pill is status, not a second Card

**Files:**
- Modify: `lightweaver/src/components/card/CardStatusControl.jsx`
- Modify: footer-related Playwright (`tests/footer-build-status.spec.ts`, `tests/connect-simple.spec.ts`, `tests/card-control-drawer.spec.ts`) only if they assert the name text.

Visible copy:

- Connected → green dot + `Connected` (no project name, no card name)
- Needs save → `Save to card` (existing `cardFooterNeedsSave` / mismatch states)
- Otherwise → `Connect` or the existing lifecycle label (`Checking card`, etc.)

`aria-label` may still include the card name for accessibility. Click routing stays `cardSurfaceForLifecycle` (control drawer / Setup / Connection Center). Do not move connection into a new widget.

- [ ] **Step 1:** Change the visible name span: when connected, do not render `link.card?.name`.
- [ ] **Step 2:** Update any spec that expects “Untitled Project” or the card name in `data-testid="card-link-status"`.
- [ ] **Step 3: Commit**

```
fix: footer connection chip shows status only
```

---

### Task 8: Checkpoint

From `lightweaver/`:

```bash
node --test src/lib/cardFlowEntry.test.js src/lib/studioRoute.test.js src/lib/layoutModeDeepLinks.test.js
node scripts/lightweaver-dev.mjs focused tests/card-install-action.spec.ts
node scripts/lightweaver-dev.mjs focused tests/one-owner-per-question.spec.ts
node scripts/lightweaver-dev.mjs checkpoint
```

Add one relevant Playwright file to the checkpoint if `checkpoint` does not already include the card/layout specs you changed.

Fix whatever the checkpoint names. Do not run launch:check, do not ship.

Inspect Card Home, Wire, and the footer on `http://127.0.0.1:4173/` (or the stable preview). Queue anything that needs Adrian’s eyes on the workboard visual-feedback list.

---

## Acceptance (the product)

1. Layout has one workspace: Wire. No Test & Install tab.
2. Card has no Home / Hardware settings / Advanced & Support tab bar.
3. Checking lights and installing the project happens on the Card, once, via `CardPushControl`.
4. Firmware update still uses `#screen=card&section=install`.
5. Preferences still open from the top bar only.
6. Footer does not repeat the project name.
7. `#screen=layout&mode=wire` opens Card install, not a missing tab.
8. Color-order try-on and card-address recovery still exist under Card Hardware.

## Out of scope

Firmware, Bench flashing, Preferences content redesign, Workshop/batch production rewrite, Connection Center internals (except that footer still opens it).
