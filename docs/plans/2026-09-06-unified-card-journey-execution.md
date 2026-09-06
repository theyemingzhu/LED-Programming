# Unified card journey — execution plan for low-cost models

Companion to [the blueprint](2026-09-05-unified-card-journey.md). The blueprint
says *what* must be true. This document says *exactly what to do*, in tickets a
balanced or small model can run one at a time without redesigning anything.
The blueprint stays authoritative for contracts; this file is authoritative for
sequencing, file boundaries, commands and done-criteria.

Branch: `claude/lightweaver-audit-refinement-9a5034` (worktree
`.claude/worktrees/lightweaver-audit-refinement-9a5034`). Ship from here only
on an explicit shipping instruction (B6).

## 0. What is already done — do not redo

Verified and committed on this branch. A ticket that touches these files must
build on them, not around them.

| Commit | What it did | Proof |
| --- | --- | --- |
| `40e2c3c8` | B0 baseline record and blueprint holes H1–H8 (plan §B0) | — |
| `f3b760ae` | **B1** one shared journey decision: `src/lib/cardJourneyEvidence.js` (store keyed by card id + boot id, single-flight, stale after a hardware operation), `src/lib/setupJourneyInputs.js` (`assembleSetupJourney`, the only evidence→journey mapping), `src/hooks/useSetupJourney.js`; chip, shell router, Setup and Card Home consume it. `data-journey-task` / `data-journey-complete` on the chip and Setup root. **B2 slice:** `src/lib/cardReturnIntent.js` makes `resumeDestination` real. Simulator gained the firmware's wiring-test lifecycle. | unit 2282/2282; Chromium 244/0 unexpected |
| `f28d4999` | Three real defects found by the new stateful suite, fixed: duplicate `/api/control` after a lost reply (read-back before any resend: `readBackLivePreview`, `retryWhileTransient({ readBack })`); `adoptWiringFromCard` replacing open work; double-tap sending twice. `tests/journey-continuity.spec.ts` (J02, J02-negative, J05, J08 ×2, J13) added to `ci:browser-smoke`. `docs/journeys/acceptance-ledger.md` written. | unit 2285/2285; Chromium 259/0 unexpected; J05+J08 ×4 = 12/12 |

Real-card screens inspected on `lw-b0fe81f61b44` (192.168.18.70, firmware 1524,
Studio release 1548 available): desktop and phone Card Home agree with the
Patterns screen (setup complete, chip absent, one primary action, no horizontal
overflow at 375 px). No card write, flash or deploy was performed.

## 1. Rules every ticket obeys (paste into every brief)

1. **Files.** Edit only the files the ticket lists. Need another file? Stop and
   report it as a dependency. Never edit `LIGHTWEAVER_WORKBOARD.md` or this plan.
2. **Red first.** Add the regression named in the ticket, run it, see it fail
   for the stated reason, then change product code. Never make a red test green
   by deleting or loosening what it protects.
3. **Playwright.** Run with the Bash option `dangerouslyDisableSandbox: true`
   (Chromium cannot launch in the sandbox). Always
   `--project=chromium --workers=1 --reporter=json > <file>` and report
   `expected / unexpected / flaky / skipped` verbatim. A line-reporter tail is
   not a result. Do not start `npm run dev`; Playwright starts its own server on a
   checkout-derived port.
4. **The simulator is the card.** `lightweaver/tests/harness/cardSimulator.ts`
   is one stateful card: assert card facts on `card.state` / `card.requests` /
   `card.waitForPlaying`, screen facts on `data-testid` only, never on prose.
   Use `refuse`, `respondThenDrop`, `goOffline/goOnline`, `reboot`,
   `beginWiringTest`, `expireWiringProbation`. Never swap in a fresh "already
   successful" fixture mid-test.
5. **Shared decisions.** Never call `deriveSetupJourney` from a screen; use
   `useSetupJourney` / `assembleSetupJourney`. Never add a second store of the
   current screen (the URL hash is the only one). A write whose reply was lost
   is *verification pending*: read the card before any resend.
6. **Hardware.** Never mark a physical row passed from a mock. Never flash,
   sign, deploy, factory-erase, or run exhaustive Prove. Reads of the real card
   at 192.168.18.70 are allowed; writes need a Bench instruction from Adrian.
7. **Scripts.** Multi-line edit scripts go in a file under the scratchpad and
   run by path (`node "$S/patch-x.mjs" <file>`). Inline `node -e`/heredoc
   scripts containing words like `key` trip the secret gate.
8. **Git.** No `git stash`. Commit only what the ticket verified, with a truthful
   `feat/fix/test/docs` message that names the counts.
9. **Return packet** (exact): `Outcome / Files / Focused proof / Screen proof /
   Risks / Integration note`. Count every claim; if you did not run it, say
   "not run".

Baseline commands (from `lightweaver/`):

```bash
cd "/Users/adrianrasmussen/Documents/Files/2 Areas/Coding/led/.claude/worktrees/lightweaver-audit-refinement-9a5034/lightweaver" && npm run test:unit
```

```bash
cd "/Users/adrianrasmussen/Documents/Files/2 Areas/Coding/led/.claude/worktrees/lightweaver-audit-refinement-9a5034/lightweaver" && npx playwright test tests/journey-continuity.spec.ts tests/card-state-matrix.spec.ts --project=chromium --workers=1 --reporter=json > "$TMPDIR/journey.json"; node -e "console.log(JSON.stringify(require(process.env.TMPDIR+'/journey.json').stats))"
```

## 2. Tickets, in order

Model tier: **S** = small/balanced (Haiku/Sonnet-class) is enough; **M** = balanced
(Sonnet-class) recommended; **D** = deeper model only if the ticket says so.
One ticket at a time per file boundary. Tickets in the same phase with disjoint
files may run in parallel (max three).

### Phase A — close the journey tests (B5 remainder)

**A1 · J01 continuous test — blank card to saved playback** · tier M · files:
`lightweaver/tests/journey-continuity.spec.ts`, `lightweaver/tests/harness/cardSimulator.ts`,
`lightweaver/tests/harness/cardStates.ts`

1. Read `src/lib/stripDiscovery.js`, `src/lib/cardWiringSafety.js`
   (`discoverCardWiring`, `stageCardWiringCandidate`) and
   `src/components/card/StripDiscoveryPanel.jsx` to list every card endpoint the
   discovery → count → place → test → confirm → save path calls. Compare with the
   simulator's `respond()` switch; add the missing ones (`/api/wiring/discover`,
   `/api/wiring/candidate`, beacon markers) answering the way
   `firmware/lightweaver-controller/src/LightweaverWeb.cpp` does.
2. Write `[J01]`: `factory-blank` card, `fresh` browser, open `/`; drive the
   real screens by test ids (Setup ladder → discovery → count entry → Layout
   placement → "Open Patterns" install → wiring activate → confirm) with
   `card.state` assertions at each step (outputs, pixels, `wiringTestActive`,
   `projectId`), then click a pattern and `card.waitForPlaying`. Count deliberate
   clicks; assert no `role="alert"`.
3. Done when J01 passes 3/3 with `--repeat-each 3`, `card.unhandled` is empty,
   and the ledger row J01 says `automated passed` with the test title.

**A2 · Matrix assertion hardening** · tier S · files:
`lightweaver/tests/card-state-matrix.spec.ts`

1. In the `other-project-open` cells, replace the raw-localStorage read with the
   open project as Studio holds it: `page.evaluate` importing
   `/src/state/ProjectContext.jsx` is not possible; instead read
   `document.querySelector('[data-testid="setup-identity-row"]')` Project field
   AND the autosave id, and assert both name `Open work`.
2. Done when the matrix suite is green (`expected` unchanged, `unexpected: 0`).

**A3 · J06/J07 edit-while-changing and temporary test** · tier M · files:
`lightweaver/tests/journey-continuity.spec.ts`

1. `[J06]` — `installed-match` card, open Patterns, change a look, click Install,
   `card.respondThenDrop('/api/config')` once; assert the card holds the new
   revision exactly once (count `/api/config` posts) and the Studio draft made
   *after* the click survives (edit a second look during verification, assert it
   is still the draft after settle). Existing coverage to mirror:
   `tests/patterns-v3.spec.ts:661,684,735`.
2. `[J07]` — `card.beginWiringTest()`, then `card.expireWiringProbation()`;
   assert Card Home returns to a non-`confirm-visible-lights` task and the
   project draft is untouched; then confirm path: start test via Setup, confirm,
   assert `card.state.wiringTestActive === false` and `pixels` promoted.
3. Done when both pass 3/3; ledger rows J06/J07 updated.

**A4 · J08 two tabs and card swap** · tier M · files:
`lightweaver/tests/journey-continuity.spec.ts`

1. Two tabs: `context.newPage()` on the same simulator; start an install in tab
   one, attempt one in tab two; assert one `/api/config` writer and that tab two
   shows the ownership explanation (find the existing test id in
   `CardInstallAction.jsx` / `CardPushControl.jsx` — report it if none exists).
2. Card swap: after connect, `createCardSimulator(spec, { cardId: 'lw-other' })`
   on the same hosts; assert lifecycle `wrong-card`, no write, progress kept
   (autosave id unchanged).
3. Done when both pass 3/3; ledger J08 updated.

### Phase B — firmware maintenance completion (B2 remainder)

**B1 · Return to the interrupted task after an update** · tier M · files:
`lightweaver/src/v3/lw-flash.jsx`, `lightweaver/src/components/card/CardCommissioningPanel.jsx`,
`lightweaver/src/components/card/CardConnectionCenter.jsx`, `lightweaver/src/v3/app.jsx`
(only the update-entry callbacks), colocated tests, `lightweaver/tests/preserving-firmware-update.spec.ts`

1. Every entry to an update (footer firmware chip, Setup `setup-update-card`,
   Connection Center update action, Install screen) calls
   `rememberCardReturnIntent({ hash: location.hash, cardId })` before routing.
2. When `firmwareUpdateRecovery` reports `reconnected` with the exact target
   build, the panel's single continue button resolves its destination with
   `cardReturnDestination({ cardId, resumeDestination })` and labels it.
3. Regression: extend `preserving-firmware-update.spec.ts` — start the update
   from `#screen=playlist`, simulate reboot + verify, assert the continue button
   reads "Back to Playlist" and lands on `#screen=playlist`. Red first.
4. Done when that spec is green with `unexpected: 0` and unit ≥ 2285 pass.

**B2 · Truthful optional-update copy** · tier S · files: `lightweaver/src/v3/lw-setup.jsx`,
`lightweaver/src/lib/footerFirmwareStatus.js` (+ tests)

1. Setup's ready banner says "This card's software is behind — update before
   relying on it" for an *optional* newer release (real card 1524 vs 1548 while
   fully playable). Split the copy by `classifyFooterFirmwareStatus` outcome:
   optional → "A newer card release (1548) is available. Playback keeps working;
   update when convenient." required → keep the current wording.
2. Regression in `tests/setup-ladder.spec.ts` or a colocated unit test on the
   classifier. Done when green and the phone screenshot shows the new line.

**B3 · Update transport variants stay honest** · tier S · files:
`lightweaver/tests/install-update-plan.spec.ts`

1. Run the suite; for J04's seven variants (current, optional, required,
   unsupported USB, release unavailable, blank, damaged storage) map each to an
   existing test title in the ledger. Add the missing variant tests only where
   the fixture already exists in `tests/fixtures`. Done when the ledger J04 row
   lists seven titles and the suite is green.

### Phase C — persistence and environments (B4 remainder)

**C1 · Storage limits and partial backups** · tier M · files:
`lightweaver/tests/project-recovery-fixtures.spec.ts`, `lightweaver/src/lib/projectStorage.js` (+ test)

1. Add browser cases: quota exceeded (`page.addInitScript` overriding
   `localStorage.setItem` to throw once) → "Saved" is not claimed, export is
   offered, existing copy intact; unknown newer schema → raw payload quarantined,
   good copy kept. Reuse `quarantineAutosavePayload`.
2. Label check: a project reconstructed from `/api/status` must render "Card
   copy (partial — no artwork)" not "Backup". Find the string in
   `src/components/projects/`; add a unit test on the label function.

**C2 · Version skew and offline entry** · tier M · files:
`lightweaver/tests/windowless-offline-studio.spec.ts`, `lightweaver/src/lib/studioFreshness.js` (+ test)

1. A new Studio release arriving mid-operation (`lw-hardware-operation-active`
   true) defers the refresh prompt; assert with the freshness monitor's existing
   test seam; the operation's draft survives; after the operation the prompt
   appears once.
2. Cached old Studio + newer card (`buildNumber` ahead): controls stay usable,
   unsupported actions explain themselves; no setup restart.

**C3 · Diagnostic trail (blueprint H8)** · tier S · files:
`lightweaver/src/lib/cardLinkJournal.js`, `lightweaver/src/hooks/useSetupJourney.js`, tests

1. When the assembled journey's `taskId` changes, append one journal line:
   step, task, card id, boot id, reason (`evidence-fresh`, `hardware-op-ended`,
   `link-changed`). No project contents, no credentials, no hosts beyond the
   card id. Bounded to the journal's existing cap.
2. Unit test on the pure "did it change" helper; a browser check that the
   support panel's connection log shows the line.

### Phase D — consolidation cleanups (blueprint H3)

**D1 · Retire the prop-callback channel** · tier M · files: `lightweaver/src/v3/lw-card.jsx`,
`lightweaver/src/v3/lw-setup.jsx`

1. Remove `onWiringTestActiveChange` (Card Home already reads the shared
   journey). Keep `onPrimaryActionChange` and `onLoadOfferChange` unless a
   shared-journey field can replace each without a second store; if it can,
   derive `ladderOwnsPrimary` in `setupJourneyInputs.js` and expose it.
2. Run `tests/card-workspace.spec.ts`, `tests/setup-ladder.spec.ts`,
   `tests/journey-continuity.spec.ts`; `unexpected: 0`.

**D2 · Instruction reconciliation** · tier S · files: `docs/lightweaver-customer-runtime.md`,
`docs/roadmap.md`, `TODO.md`

1. Grep both docs for "USB only", "auxiliary window", "second tab", "factory
   image" and correct every sentence that contradicts the blueprint's default
   experience table (preserving Wi-Fi update for capable cards; card-local
   same-tab path; factory erase never automatic). Quote the old and new sentence
   in the return packet.

### Phase E — Bench proof (Adrian's eyes, one observation at a time)

Not a model ticket. The primary asks these in order, each as one question, on
card `lw-b0fe81f61b44` at 192.168.18.70:

1. Patterns A → B → Stop from the phone: does the strip change each time?
2. Power-cycle the card: does Studio reconnect and Card Home still read
   "Installed project matches" with no click?
3. Preserving Wi-Fi update 1524 → 1548 (only with an explicit Bench
   instruction): after restart, footer reads 1548, Wi-Fi and the 41-LED
   project retained, patterns play.
4. Start a light test from Setup, wait 90 s without confirming: does the card
   restore the previous lights on its own, and does every screen drop the
   "confirm" task?

Each answer is recorded in `docs/bench-sessions/` and flips the matching ledger
row from `physical pending` to `passed` or `blocked`.

## 3. Acceptance ledger mapping

`docs/journeys/acceptance-ledger.md` is the single status table. A ticket is
complete only when its J rows are updated with the actual test titles and the
JSON counts from the run that proved them. Rows never move to `passed` on the
strength of a suite that was not executed in that ticket's session.

## 4. Conductor brief template

```
You are the <Studio | test/docs | firmware> owner for ticket <ID> in
docs/plans/2026-09-06-unified-card-journey-execution.md. Work only in
<worktree path>. Read §1 rules and ticket <ID>. Files you may edit: <list>.
Regression first (red), then the smallest fix, then the ticket's commands.
Return the packet in §1 rule 9 with verbatim JSON counts. Do not commit.
```

## 5. Shipment (B6) — separate instruction

When Adrian says ship: rebase onto `origin/main`, rerun `test:unit` and
`ci:browser-smoke`, push, PR, merge, wait for the real deploy, prove
`/studio-release.json` and report both build numbers. The branch currently
carries nine unshipped `main` commits ahead of live build 1551 plus this work;
the report must name the exact Studio build that goes live.
