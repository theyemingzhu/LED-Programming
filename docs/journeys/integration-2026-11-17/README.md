# Integrated workflow review — 2026-11-17

Manager-owned evidence for the shared candidate at
`/Users/adrianrasmussen/.codex/worktrees/27e4/led`.
Baseline `a73e56e12c9947499f422b56d3679e2604b581f2` plus uncommitted scoped changes.
Unrelated CLAUDE.md/branch policy edits are not part of this product increment.
Nothing is deployed. Firmware relative-controls/default-boot implementation has
been integrated locally and compiled with the pinned toolchain; physical acceptance
is still pending. The complete firmware core rerun passed.

## Final result: ready for local UI review

### Mobile refinement integrated after initial acceptance

Adrian's UI-chat-requested refinement is now integrated in the shared candidate.
Five files match the reviewed isolated patch. Phone artwork preview moves 58px
higher at 390px; section names wrap readably. Playlist rows shrink from 152px to
105px with 44px core targets. Secondary card tools and row editing/section review
remain available in existing action menus; section review opens a focused dialog.
No firmware or hardware behavior changed.

Manager final affected checks: 17 Playlist/density browser cases and 5 Card tools,
color-shift authority and toolbar cases passed. Production Studio build passed;
scoped whitespace check passed. Logs: `/tmp/lw-manager-mobile-20261117.log`,
`/tmp/lw-manager-mobile-tools-20261117.log`,
`/tmp/lw-manager-mobile-build-20261117.log`. Source manifest includes this refresh.

![Updated phone Looks comparison](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e7ec-e0fa-7291-a0b9-a13fc1028f18/impeccable/looks-390-comparison.png)

![Updated phone Playlist comparison](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e7ec-e0fa-7291-a0b9-a13fc1028f18/impeccable/playlist-390-comparison.png)


Follow-up: the Readiness owner ran a fresh complete `npm run test:core` on the
shared checkout and reported exit 0, including relative tuning and factory-bin
freshness. Manager inspected the completed log tail:
`/tmp/lw-combined-core-rerun-20261117.log`. No additional fixes or device writes.
This closes the prior split prefix/tail verification gap; it does not prove
physical playback or deployment.

All six scoped implementation streams are integrated. Final source/test inventory
is saved in [source-manifest.json](source-manifest.json) and matches the fixed
candidate. No deployment or physical pass is claimed.

- Combined model suite: 3,130 passed; final Player model suite: 8 passed.
- Final affected browser batch: 124 passed; complete Card Facts batch: 17 passed.
  Earlier unaffected passes retained. Across all batches, 248 unique test titles
  passed; repeated cases are not counted twice in that figure.
- Studio production build, Player production build and Player artifact verification
  passed. Pinned ESP32-S3 compile passed (worker evidence below).
- Source checks passed through the initial prefix and the corrected 34-command
  tail. The clock assertion now checks authored speed multiplied by relative
  speed and its use in per-zone integration. Manager reran that corrected test.
- One initial HTTPS harness response-disposal error passed three repeats unchanged.
  This remains known test intermittency, not a hidden clean first run.
- Physical confirmation updated: GPIO 18 / 41 LEDs and an observer are confirmed.
  Exact legacy restore coverage or a spare card is still needed; a second strip
  is required for two-GPIO acceptance. No card writes were made.

The following sections preserve the chronology and scoped evidence. Earlier
“pending” descriptions are superseded by this final result.

## Recorded checks

- Combined Studio model suite on the shared settled model snapshot: 3,130 passed,
  zero failures. `/tmp/lightweaver-manager-unit-20261117.log`.
- Manager copied a fixed candidate to
  `/tmp/lightweaver-manager-integration-20261117`, with per-file SHA-256 inventory
  in `manager-snapshot-manifest.json`. Final CardFacts source was included before
  tests. Vite cache/ports/output directories are isolated; dependency installation
  is shared read-only. No test contacts the bench card intentionally.
- Studio production build of this snapshot passed.
  `/tmp/lightweaver-manager-build-20261117.log`.
- First combined browser batch: 43 passed, four stale CardFacts copy assertions
  failed, one interrupted, 111 not run under fail-fast. Every failure expected
  Setup complete where the inspected branch renders Installed project. Owner is
  running and correcting the full direct spec without weakening behavior checks.
  `/tmp/lightweaver-manager-browser-20261117.log`.
- Remaining-case batch: 103 passed, one failed in HTTPS test harness with
  `Fetch response has been disposed` at bridgeTransport.ts:36. No product
  assertion failed in that case. Isolated repeat diagnosis is running.
  `/tmp/lightweaver-manager-browser-remaining-20261117.log`.

This snapshot predates the final spatial Patterns preview and new firmware/client
relative controls. Affected checks/builds must be refreshed for those exact changes.
Do not present these passes as proof of the later native increment.

## Covered combined browser surfaces

Three-GPIO saved looks/playlist, saved-look editing and mixed mirroring, Undo cues,
SVG/DIY layout and run separation, Card facts and resume, preserving updates,
Show/scene handoff, safe concurrent editing/card identity, readback and recovery.
Client relative controls and physical hardware are separate remaining checks.

## Physical evidence

Adrian separately authorized the Layout chat to test saved looks/splits on the card.
It is the sole bench owner. It has the frozen Studio path, must identify/read back
current firmware and preserve recoverable card content, and must not flash mutable
in-progress relative-control firmware. Until its report, no physical pass is claimed.

Bench preflight found card firmware 1.2.3/build 2407 and GPIO 18 / 41 LEDs,
with a legacy internal-flash project. Two-GPIO packages compiled and 16 host
checks passed, but wiring/observation and exact restoration remain unresolved.
No real-card writes were made; no physical pass is claimed.

## Final candidate refresh

Frozen editor and firmware/Player files were copied into the same isolated
candidate. `manager-final-refresh.json` records their hashes. Manager compared
all original-plus-refreshed source/test hashes with the shared workspace and
found no unrecorded divergence at this checkpoint.

- Final Studio production build passed.
- Final Player production build/staging verification passed. The displayed local
  build derives from baseline Git history; it is not a published release receipt.
- Complete Card Facts browser spec: 17 passed in the combined candidate.
- The intermittent HTTPS harness case passed three isolated repeats unchanged.
  Its first-run response-disposal error remains recorded rather than erased.
- Firmware owner reports pinned ESP32-S3 compilation passed. Unflashed binary
  SHA-256: `0697dc55ff4c37b298fa799169d2f9ec990124792e44ce8cd60880f9b44e8087`.
- Manager registered the new native tuning test in `test:core`, so CI source
  lanes execute it. Broader source run found one old animation-clock assertion
  expecting raw zone speed; owner is correcting it to verify effective relative
  speed and checking subsequent contracts. Product changes are frozen.

## Visual review

These are real browser captures of the local implementation with test projects,
not design mockups or evidence of physical LEDs. The UI fixtures use simulated
card connections. The final combined browser run covers the changed screens.

Artwork-shaped preview with connected section assignments:

![Spatial Patterns preview](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e7ec-e0fa-7291-a0b9-a13fc1028f18/spatial-preview/after-piece-desktop.png)

Playlist phone before/after: clearer titles and less repeated information:

![Playlist comparison](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e7ec-e0fa-7291-a0b9-a13fc1028f18/playlist-compact-undo/comparison-rows-390.png)

Customer relative tuning and explicit saving:

![Customer tuning](/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e7ec-ce4e-7a01-8718-4074cc4b3c7f/player/relative-tuning-phone.png)

The broader shell still needs a focused visual pass: phone toolbar/footer space,
consistent look terminology, and clearer secondary navigation. This increment
keeps existing capabilities and does not claim the entire app redesign is finished.
The ordered, reversible journey and remaining scope live in
[owner-workflow.md](../owner-workflow.md).
