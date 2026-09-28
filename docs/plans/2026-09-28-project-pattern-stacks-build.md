# Project pattern stacks implementation plan

> Workers use subagent-driven-development under the project's proportional,
> parallel ownership rules. The primary owns integration and one combined review.

**Goal:** Build project-owned complete section arrangements, reliable saving,
and a separate playlist selector that supports ten distinct stacks.

**Architecture:** Reuse `devices.standaloneController.looks` and playlist combo
references. Add a browser-side `projectStacks.js` domain helper, then integrate
it into the existing Patterns and Playlist screens. Preserve compiled wiring,
the card contract and the compact 20px preview from main build 2228.

**Stack:** React, Vite, existing Node unit tests, Playwright Chromium.

**Approved design:** `2026-09-28-project-pattern-stacks-proposal.md`.
**Authorization:** Adrian approved planning and building on 2026-09-28. No release,
flashing or exhaustive Prove run requested.
**Checkout:** `/Users/adrianrasmussen/.codex/worktrees/project-pattern-stacks/led`
**Branch/base:** `codex/project-pattern-stacks` / `6dbffe67` (main2228).

## Shared contracts

- A stack snapshots all section drafts and their supported visual settings.
- Stable look IDs are independent of labels. Update retains identity and list
  position; Duplicate/Save as new produces a new identity and independent data.
- Playlist entries reference IDs. Only explicit stack saving updates references'
  content; each occurrence retains its own duration/order/enabled state.
- Save & add calculates a single resulting controller snapshot. Never call an
  add handler that reads the pre-save render's `savedLooks`.
- `projectOnly` retains its existing card-ineligible meaning.
- Reject over-capacity imports/additions before normalization can discard data.
- A mismatched section set requires explicit review/repair before installation.
- Preserve project/stack-specific recoverable drafts, but do not confuse draft
  storage success with successful durable project saving.

## Ownership and sequence

### A — Data, persistence and export (stack_storage_proposal, Astra medium)

Own `lightweaver/src/lib/projectStacks.js`, its tests, `sectionLookModel.js` and
tests, `patternEditSession.js` and tests; bounded changes to `cardPlaylist.js`,
`cardRuntimeProject.js` and relevant persistence helpers/tests as necessary.
No UI files or shared workboard.

- [x] Publish exact helper return shapes to both UI owners before integration.
  Required operations: summarize/review/repair a stack; unique naming and IDs;
  independent duplicate/rename; atomic multi-add to playlist.
- [x] Add focused failing tests for ten complete four-section snapshots, unique
  identity, stable update position, copy isolation and duplicate names.
- [x] Implement the domain helpers using existing normalization and combo
  factories; preflight limits before calling any truncating normalizer.
- [x] Cover deleted/new/renamed/reordered/split sections, unsupported IDs,
  repeated playlist references, draft storage failure and excess imports.
- [x] Verify the ten-stack save/reopen/export/import and runtime package with
  exact expected section pattern IDs, settings, Off state and lengths.
- [x] Run owned Node tests red then green. Report actual payload constraints.

### B — Patterns editor and project shelf (stack_picker_proposal, Sol medium)

Own `lightweaver/src/v3/lw-pattern.jsx`, new
`components/patterns/ProjectStackSummary.jsx`, new `styles/project-stacks.css`,
and `tests/project-stacks-patterns.spec.ts` plus bounded existing Patterns tests.
Import styles locally; do not change the shared global style entry point.

- [x] Add focused browser regression before changing behavior; primary executes
  the red run in the single test-server window.
- [x] Separate Patterns and Project stacks inputs before search/category filters.
- [x] Add the persistent name/Save stack/Save & add controls and whole-stack
  summary; retain 20px top preview and existing section/live-command behavior.
- [x] Add Update, Save as new, Revert, Duplicate, Rename, Delete/Undo and visible
  playlist-use count. Keep asynchronous save feedback tied to the intended save.
- [x] Restore per-project/per-stack drafts through navigation/reload without
  silently overwriting the saved arrangement or losing another stack's draft.
- [x] Implement selected-section settings copy with undo, explicit layout review
  and repair, clear card-ineligible status, stable search/list order and counts.
- [x] Verify normal and quota/error save flows, draft switching, ten-item shelf,
  desktop and 390px phone layout. Parent runs browser tests serially.

### C — Playlist picker and stack rows (stack_playlist_build, Sol medium)

Own `lightweaver/src/v3/lw-playlist.jsx`, new
`styles/project-stacks-playlist.css`, `tests/project-stacks-playlist.spec.ts`,
and bounded existing Playlist-only tests. Reuse B's summary component if useful;
B is its sole editor. No shared model writes.

- [x] Add focused regression and obtain the primary's red execution window.
- [x] Add Project stacks/Patterns source tabs, default to stacks when available,
  preserve selected source, stable count, summaries and compatibility state.
- [x] Implement select-many/Add selected with preflight, stable order, existing
  entry deduplication and clear refusal. Preserve deliberate row duplication.
- [x] Add Stack badge, section count, expandable exact assignments and Edit stack
  navigation to combo rows without changing Length/reorder/live controls.
- [x] Verify source deletion differs from row removal, updates follow IDs and
  playlist repeated entries retain their independent timing.
- [x] Check desktop/phone and export package entry order. No card mutations.

### D — Integration and delivery (primary)

- [x] Read current main and preserve unrelated source/workboard changes.
- [x] Create one managed checkout and one branch; assign disjoint file ownership.
- [x] Review helper interfaces and resolve cross-screen behavior centrally.
- [x] Run focused browser files serially through the checkout's test runner.
  No worker launches a server. Do not replace the owner's active 4173 preview.
- [x] Review combined diff once for approved behavior, state races, silent data
  loss, mapping identity, mobile controls and regressions in existing workflows.
- [x] Run one integrated checkpoint (`node scripts/lightweaver-dev.mjs checkpoint`)
  and relevant existing browser journeys; repair demonstrated failures narrowly.
- [x] Inspect the actual rendered desktop/phone screens using an isolated fixture
  on the same test surface. Leave a reviewable artifact without altering owner data.
- [x] Commit the coherent changes and record exact artifact/test/screen evidence
  in the workboard. Report local verification separately from deployment/hardware.

## Verification commands

From `lightweaver/`, data owner runs the specific owned tests, including:

```sh
node --test src/lib/projectStacks.test.js src/lib/sectionLookModel.test.js src/lib/patternEditSession.test.js
```

Primary runs the browser feature journey from repository root:

```sh
node scripts/lightweaver-dev.mjs focused tests/project-stacks-patterns.spec.ts tests/project-stacks-playlist.spec.ts
node scripts/lightweaver-dev.mjs checkpoint
```

Expected acceptance is ten distinct arrangements round-tripping unchanged,
one combo per playlist occurrence, explicit limit/mapping errors, truthful save
feedback and usable desktop/phone surfaces. Existing compound-look persistence,
three-GPIO playlist journey and compact-preview checks remain relevant regression
coverage. Actual LED appearance is not established by these software tests.

## Time and scope control

Target first integrated result in roughly 30–45 minutes; assess progress at
20 minutes. No extra review agents, new backend, Pi integration, firmware capacity
expansion, global library, nested stacks or musical synchronization. Any actual
card/storage gap is reported with measured evidence before expanding scope.

## Measured integration findings

2026-09-28: domain/persistence focused suite passes 101 tests. The representative
ten-stack fixture uses four 20-LED sections with distinct supported appearances.
Project storage, reopen, copy, migration and runtime compilation retain all ten.
Existing card storage preflight rejects the compacted 7,243-byte payload against
3,968 bytes. Only referenced playlist stacks install; unreferenced saved stacks
remain in the project. A near-identical measurement fits four selected stacks
(3,950 bytes), while five require 4,507 bytes. These are fixture-specific values,
not a universal four-stack promise. Existing default-value compaction is already
applied; removing labels alone cannot make ten fit.

Studio implementation is complete with clear capacity refusal and no discarded
content. Firmware capacity expansion is a separate pending scope decision. No
firmware changes, deployment, card writes or physical LED proof were performed.

## Completed build and acceptance evidence

The integrated Studio supports a separate searchable Project stacks shelf; full
section snapshots; Update, Save as new, Duplicate, Rename, Revert and Delete/Undo;
selected-section copy with Undo; recoverable per-stack drafts; explicit mapping
review; verified browser-save receipts and retry; separate playlist source tabs;
ordered atomic multi-add; section previews/details and edit links. Playlist edits
flush to browser storage before reporting saved. An unrelated stack's rename or
delete cannot clear the currently edited stack's draft.

Desktop save controls occupy the side column; phone controls wrap above the
library. At 1440x800 with twelve sections, the pattern grid retains 300px visible
height. The compact animated preview and physical wiring behavior are preserved.

Verification completed 2026-09-28:

- Full integrated checkpoint: **2,869/2,869 unit tests PASS**, production build PASS.
  `/tmp/lightweaver-stacks-checkpoint-final.log`.
- **97 distinct relevant Chromium browser checks covered and passing** across
  the focused cohorts and demonstrated-failure reruns. Feature cohort: 15 stack
  tests, three-GPIO journey; existing coverage: 65 Patterns, four workspace, three
  continuity and nine compact-interface tests. No failures remain unresolved.
- Final source changes: eight focused laptop/save/draft/storage/old-import checks
  PASS in `/tmp/lightweaver-stacks-last-checks.log`; earlier passing coverage in
  `/tmp/lightweaver-stacks-browser-complete.log`,
  `/tmp/lightweaver-stacks-browser-final-features.log`,
  `/tmp/lightweaver-stacks-patterns-regression-final.log`, and
  `/tmp/lightweaver-stacks-density-final.log`. These historical logs also retain
  the failures that the final focused runs repaired.
- Final production build PASS: `/tmp/lightweaver-stacks-production-build-final.log`.
  Existing large-chunk advisory remains; no compilation errors.
- Actual in-app browser inspection on desktop and 390px phone with an isolated
  ten-stack, four-section fixture. Final review image:
  `/tmp/lightweaver-project-stacks-review.png`. Owner project/card untouched.
- Local review surface: `http://127.0.0.1:9220/#screen=pattern`. Its footer retains
  the main2228 base marker; this development checkout is not a deployed release.

The browser file-import tool unexpectedly stalled about 44 minutes; implementation
and verification resumed without repeating that operation. Scope stayed Studio-only.
Next delivery action is an explicitly authorized integration/release. A ten-stack
card installation also needs a separately approved capacity change and hardware
verification; saving ten project stacks is already verified.
