# Card Home — from "says it once" to effortless

Follow-on to `2026-08-30-card-one-action.md`. That plan fixed the **doors**
(one Card page, one install writer, Layout is Wire only) and its final pass
fixed the **status chorus** (Card Home no longer says "connected" three times).

This plan is about what the compression left standing. Written 2026-08-31 from
live evidence: three rendered states of Card Home captured from
`http://127.0.0.1:4173/#screen=card` on branch `card-one-action` at
`dad5bc31`, plus a full Chromium run of the six Card/Setup spec files.

**Do not start any of this without Adrian saying so.** Nothing here is a bug
that hurts an owner today; it is the difference between a screen that is
correct and a screen that is effortless.

---

## What is already right — do not undo it

- The identity row is the ONE status. Detected state now renders only for a
  diagnosis the row and the ladder do not carry (checking, blank, bench,
  answering-but-not-ready, found-unpaired, update-required, failure).
- The ladder carries exactly one active task.
- Hardware and Advanced are closed folds.
- Layout is the wiring plan with a single CTA back to the card.
- `CardPushControl` is still the only project writer. `CardInstallAction` is
  still the only project-write UI.
- The deterministic design scan (`npx impeccable`) reports zero findings across
  `lw-card.jsx`, `lw-setup.jsx`, `CardInstallAction.jsx`. There is no AI-slop
  tell to fix. The remaining problems are all about *choice*, not *looks*.

---

## Part 1 — Left behind by Tasks 1–7 (mechanical, cheap, do these first)

Three specs are red on `card-one-action` and were **already red at `a5bb834a`**,
before the compression pass. Measured on both revisions, same six failures. Three
of them assert UI that Tasks 1–7 deliberately deleted, so they are not flaky and
they are not a regression — they are unretired assertions.

- [ ] **`card-workspace.spec.ts:337`** — "wide desktop footer keeps card,
  firmware, Studio, and test controls in order" reads `.card-status-name` from
  the status bar and orders it against `.card-status-state`. Task 7 removed the
  card/project name from the footer on purpose (footer is the status word only),
  so `regions.name` is `undefined` and the assertion throws a TypeError. **Fix:**
  delete the `name` capture and the `name`/`state` ordering assertion; keep every
  other ordering assertion in that test unchanged.

- [ ] **`card-workspace.spec.ts:801` and `:938`** — both wait for a
  `Restore saved project` button on Card Home. That button lives in
  `CardCommissioningPanel.jsx`, which Card Home no longer renders. The suite now
  contradicts itself: `:712` asserts the same button has count 0. **Fix:** decide
  which behaviour is intended — almost certainly `:712` — and retarget `:801` and
  `:938` onto the Setup task that now owns resumable install work.

- [ ] **Determine the origin of the other three** before touching them:
  `:1157` (production project load, 60s timeout), `:2222` and `:2536` (HTTPS
  ambiguous WiFi handoff config counting). These are red on the branch; this
  session did **not** establish whether they are also Tasks 1–7 fallout or older.
  Run them against `main` first and say which.

**Why this is Part 1:** while these six sit red, no future session can tell a
real regression from the noise, and "focused Playwright was green" has already
been written down once about a revision where it was not.

---

## Part 2 — The status row is now the sole authority, so it has to speak facts

The compression made the identity row the only status. It is not yet written
like one. Live capture of a connected card whose project has drifted:

```
CARD        Gallery card
CONNECTION  Save to card
PROJECT     Untitled Project
INSTALLED   Project not installed
```

and of a card holding the open project at an older revision:

```
CARD        lw-ordinary-card
CONNECTION  Save to card
PROJECT     Ordinary gallery piece
INSTALLED   Same project — save to card to verify
```

- [ ] **`CONNECTION` must answer "is Studio talking to this card?"** It currently
  answers with an instruction ("Save to card"). Two of the four fields are then
  telling the owner to do the same thing, inside the row we just made the single
  source of truth — the chorus, rebuilt at smaller scale. Connection values
  should be states: Connected / Connecting / Found — pair / Not connected /
  Needs attention / Recovering.

- [ ] **`INSTALLED` must answer "is what the card holds the thing open here?"**
  Values are relationships, not errands: Matches / Older revision / Different
  project / Not installed / Temporary setup. The errand belongs to the ladder's
  active task, which already renders the button that performs it.

- [ ] **`CARD` should never fall back to a raw id when a name exists.** The
  second capture shows `lw-ordinary-card` where the first shows `Gallery card`.
  An owner does not know their card by its MAC-derived slug.

Owner: `exactCardName` / `installRelationship` / `identityStatus` in
`src/v3/lw-setup.jsx`. Unit-testable without a browser — these are pure
functions over the link state, so the golden table belongs in `node:test`, not
Playwright.

---

## Part 3 — One status is done; one primary action is not

This is the real remaining work and the reason Home still feels long.

Counted from the live capture of the unresolved-project state, the owner is
offered, top to bottom:

1. `Use this card's project`  (primary, in the ladder task)
2. `Import project file`
3. `Save this project to the card`
4. `Keep setting up the open project`
5. `Start LED check`  (primary, `CardInstallAction`)
6. `Load <project> — current Studio project`  (primary, Matching card project)
7. `Verify hardware` / `Recover lights` / `Color-order test`  (Checks & recovery)

Three of those are styled as the primary action. Six are live choices before the
folds. The status now speaks once; the *page* still asks the owner to arbitrate
between three surfaces that each believe they own the next step.

- [ ] **Decide who owns "the next action" and let only that surface render a
  primary button.** The ladder's active task is the obvious owner: it is the only
  one that knows which of the four phases the owner is in. `CardInstallAction`
  and the Matching-card-project panel would then render their controls as
  secondary until the ladder hands them the floor.

- [ ] **`CardInstallAction` needs to say which phase it belongs to.** In the
  live capture, `Start LED check` appears bare, immediately under phase 4's
  description, outside the ladder. It reads as phase 4's button and is not.
  Either move it inside the active phase, or give it a heading of its own.

- [ ] **Collapse the four-way choice in the unresolved-project task.** Four
  buttons at the first decision point of the whole product, three of which are
  irreversible in the owner's mind (adopt, import, overwrite). Recommend one,
  put the rest behind "Other ways to resolve this".

- [ ] **Consider moving `Checks & recovery` into the Hardware fold.** It is the
  same class of thing as everything already folded, and it renders three more
  buttons on the always-open part of the page. **Constraint that must be honored:
  the Patterns gate routes here for recovery** — see the comment above the panel
  in `lw-card.jsx`. If it folds, the Patterns gate must open the fold, or the
  one stated remedy becomes invisible again, which is the exact bug that comment
  exists to record.

---

## Part 4 — Smaller repetitions, worth one pass together

- [ ] **The Matching-card-project panel names the project three times** in one
  panel: the explanatory line, the button label, and the result status ("Exact
  match found: "…". Load it to save the current workspace and continue to
  Patterns"). Once is enough; the button label is the one that has to carry it.

- [ ] **The lede** ("Connect to the card, then Studio resumes whatever is still
  unfinished — lights, layout, or saving.") duplicates what phase 1 exists to
  say. It only renders while disconnected, so the cost is small, but it is the
  first sentence a new owner reads and it explains the ladder instead of letting
  the ladder work.

---

## Rails carried forward from the parent plan

Do not merge Wire into Card. Do not add a second install writer. Do not re-add
Card tabs. Preferences stay in the top bar. Keep color-order try-on and the
card-address recovery field. Do not bump VERSION, flash a card, or ship as part
of this work.

## How to verify any of it

```bash
cd "/Users/adrianrasmussen/Documents/Files/2 Areas/Coding/led/lightweaver" && npx playwright test tests/card-workspace.spec.ts tests/setup-ladder.spec.ts tests/setup-adopt-card-project.spec.ts tests/connect-simple.spec.ts tests/card-edit-handoff.spec.ts tests/card-install-action.spec.ts --project=chromium --workers=1 --reporter=json
```

Read `stats.unexpected` from the JSON. The number to beat is **6** until Part 1
lands, and **0** afterwards. A list-reporter tail hides failures — require the
JSON count.

Then checkpoint and look at it:

```bash
cd "/Users/adrianrasmussen/Documents/Files/2 Areas/Coding/led" && node scripts/lightweaver-dev.mjs checkpoint
```
