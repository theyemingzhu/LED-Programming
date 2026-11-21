# Code health: is the code's shape why fixes are slow? (2026-11-21)

Page: https://claude.ai/artifact/LTCvJEpRA3EXzzFyQLtYwb

Measurement only. No file under `lightweaver/src`, `firmware/` or `lightweaver/tests` was changed.
All counts were taken on `origin/main` at `13171cf4` (PR #452). Line numbers are from that revision and will drift.

## Verdict

Yes, in part. About **40%** of this week's slowness comes from the code's shape. One rule, "save the project to the card", lives in **6** places. Studio works out "is the card connected" in **8** ways and "does the card hold this project" in **7**. So the slow-card fix touched 12 files, and the next day another commit fixed 6 places the first one missed.

The rest has other causes:

- **About 30%**: test cards that did not behave like the real one. One answered instantly, and tests could reach the physical card.
- **About 20%**: many sessions landing at once.
- **About 10%**: a real firmware storage limit.

The code is not careless. Each copy is careful and well commented. There are simply too many copies. Merging the save path, the two card-state answers and the test fakes takes about 40 hours. After that, a fix like this week's would be made in one place, not four to twelve.

How the shares were estimated: they are a judgement from the counts below, not a stopwatch. Structure covers the multi-file and repeated fixes. Test realism covers the commits whose whole job was making fakes behave like the card. Sessions covers the reverts, the changes landed twice and the log commits.

| Cause | Share | Evidence |
|---|---|---|
| Code shape: one job in many places | ~40% | The slow-card rule took 12 files (`742ee685`), then 6 more the next day (`910c8109`). Button pins on adoption took 8 files (`9b4d43ed`). The "Save to card" wording took 5. The other-window guard took 4 (`421ccaf5`). 28 of 78 code commits had their lines rewritten within 7 days. |
| Test cards unlike the real card | ~30% | The simulator answered instantly, so restart and slow-reply faults only showed on the real card (`742ee685`, the false-failures plan). Tests reached the physical card by accident (`df618e33`, `69b017b8`). 31 specs each write their own fake card. |
| Many sessions at once | ~20% | Since Nov 14: 38 PRs merged and 2 whole-batch reverts on Nov 20 (#441, #446). 13 changes landed twice. 66 of 126 commits (52%) were logs, docs, CI or tests only. 15 branches were active. |
| The card itself | ~10% | The card refused saves with "nvs write failed" (the card-durability note). That is firmware storage, not Studio. |

## 1. Duplicated jobs: every path that reaches the card

**Save the project to the card.** These paths send the project with `/api/config`. One low-level sender, `pushConfigToCard` (`lib/cardPushClient.js`), is reached from 11 places: 6 call it directly and 5 get it as a default argument (`cardSectionSync.js` ×2, `cardSetupDeploy.js`, `applyLedCountToCard.js`, `CardCommissioningPanel.jsx`). Bench setup posts the config itself. The owner-facing "save the project" entry points are 6: Card Home, the footer, Patterns ×2, Playlist and Scene.

| Path | Where | What differs |
|---|---|---|
| Card Home / Setup "Save to card" | `components/layout/shared/CardPushControl.jsx:405` | The only path with the other-window lease (`:197`). Has its own restart wording (`:480`) and its own read-back. |
| Footer chip "Save to card" | `v3/app.jsx:1598`, via `lib/cardSectionSync.js` | Has no lease. Any error is swallowed (`catch {}`, `app.jsx:1612`), so the chip simply stays on "Save to card" with no reason given. |
| Patterns "Save look" | `v3/lw-pattern.jsx:2427` | Has its own overwrite check (`matchesCurrentCardProjectEvidence`), its own restart wording (`:2453`) and its own refusal wording. |
| Patterns split preview | `v3/lw-pattern.jsx:2959` | Same idea as Save look, with different error text. |
| Playlist install | `v3/lw-playlist.jsx:776` | Its error wording comes from `studioActionStatus.js`. |
| Scene install | `scene-expression/sceneExpressionInstall.js:66` | Has a head-conflict check. Verifies once, with no restart wait. |
| Production restore | `v3/lw-production.jsx:897` | Has its own run lease and read-back. |
| Live-control repair | `lib/cardLiveControl.js:1806` | n/a |
| Setup walk | `lib/cardSetupDeploy.js` (sender passed in) | Waits for the card to answer before saving (`waitForCardToAnswer`), with its own read-back. |
| Bench / temporary setup (own sender) | `lib/benchInstall.js` | Posts `/api/config` itself, with its own wait and its own refusal error. |

**The same rule, written several times:**

| Rule | Places |
|---|---|
| Wait through the card's restart after a save | 7 separate wait loops (`cardDeployment.js`, `cardSectionSync.js`, `cardSetupDeploy.js`, `benchInstall.js`, `cardLiveControl.js`, `CardPushControl.jsx`, `cardWiringSafety.js`). "Restarting the card…" is written in 5 screens (`CardPushControl`, `lw-pattern` ×2, `lw-setup`, `lw-card`). |
| Don't overwrite another window's change | 6 different guards (window lease, push-attempt check, project/layout mismatch errors, head-conflict, Patterns evidence check, restore fencing). Only Card Home has the window lease. |
| Word a refused save | About 7 variants. |
| Read back after saving | 6 mechanisms. The LED-count paths have none. |
| Retry a slow pre-save read | One helper now exists (`withCardReadRetry`, added this week). The sender's own identity check uses it (`cardPushClient.js:614`), and 3 screens wrap their own pre-save reads in it: Patterns, Playlist and LED count. The other paths' own pre-save reads do not use it. |

**Other actions:**

- **Tap a look.** Studio has one sender (`pushLivePreviewToCard`) with about 8 callers. Only Patterns (`retryWhileTransient`) and the control drawer (an uncertain-write read-back) handle a slow reply. Layout draw mode and Playlist do not retry.
- **Set LED count.** There are 3 paths. The footer path (`app.jsx` `saveLedCountToCard`) marks the project "installed, verified" with **no read-back**. The Setup stepper (`lw-setup.jsx`) also has no read-back. The discovery walk uses the bench or setup senders.
- **Set colour order / output.** There are 2 live paths (`CardFacts.jsx`, `StripColorOrderCheck.jsx`), each with its own handling. Pins change only through the save paths.
- **Rename.** This is Studio state only, set in 3 places (`app.jsx`, `lw-setup.jsx`, `lw-settings.jsx`). The new name reaches the card on the next save.
- **Update firmware.** Wi-Fi and USB updates live in `lw-flash.jsx`, plus `lw-production.jsx`. The window lease has a `firmware-update` label, but nothing takes it.
- **Recover lights.** The checked wrapper (`lib/cardRecoverLights.js`) has 7 callers. 3 callers skip it: `lw-setup.jsx`, `StripColorOrderCheck.jsx` and `WiringBenchTest.jsx`.

## 2. Gates: what can stop a save or change the status line

| Gate | Computed | Read by | Effect for the owner |
|---|---|---|---|
| Connected (transport) | `cardConnectionFlow.js:261` | `app.jsx`, `firmwareUpdatePlan.js` | Firmware line, bridge handling |
| Ready for commands | `cardConnectionFlow.js:266` | About 12 screens and helpers | Blocks saves, wiring and adoption. Sets the header label. |
| Ready for playback (looser) | `cardConnectionFlow.js:278` | Patterns, Layout draw mode | Looks keep working through a Wi-Fi blip |
| Readiness class (safe mode, blank, unexpected build…) | `cardReadiness.js:223-318` | All of the above | Refuses an unexpected build. Safe mode is never "blank". |
| Card lifecycle state (~20 states) | `cardLifecycle.js:238-284` | Footer chip, Setup tasks, control drawer, actions | The footer chip text and the next task |
| Holds this exact project (`exactProject`) | `cardLifecycle.js:224` | `app.jsx`, `lw-setup.jsx`, `cardSessionView.js` | "Save to card" versus "Installed" |
| Firmware update evidence (rolled back, blocked) | `cardLifecycle.js:238-248` plus `app.jsx:1126` | The lifecycle | Outranks everything: "Update rolled back" |
| Install gate | `cardInstallGate.js:78-116` | Patterns, Playlist, `cardAccess.js` | Blocks Install and shows the reason |
| Window lease (3 s) | `cardWriteLease.js` | Card Home only | "Another Studio tab is…" |
| Patterns edit permission (30 min) | `cardEditAuthorization.js` | Patterns | Drops Patterns back to project-only |
| Edit intent breaker | `cardEditIntent.js` | Card-to-Patterns auto-open | Stops the handoff loop |
| Live-control authority | `cardLiveControl.js:96-120` | Live streaming | Blocks streaming |
| Installation record | `projectLifecycle.js:40,112,195` | `app.jsx`, `lw-setup.jsx` | Lets the stored fingerprint stand in for a legacy card |
| Studio's own status polling | `hooks/useCardStatus.js` | Bridged into the link at `app.jsx:1297` | A second opinion on "connected" |

**Pairs that can disagree:**

1. **"Holds this project" in Setup versus the lifecycle.** Setup matched on the project id only, read from `/api/firmware-info`. The lifecycle needs id, fingerprint and revision, read from `/api/status`. The result was "Installed project matches" next to "Needs attention" (comment at `lw-setup.jsx:405-413`). It is patched now with an AND of the two, but there are still two answers.
2. **The installation record versus the lifecycle's legacy binding.** The same rule is written twice: once in `lw-setup.jsx:377` from a snapshot, once in `app.jsx:1240` / `cardLifecycle.js:219` from live data (THINKING 2026-08-19).
3. **The footer `LABELS` versus the identity row `CONNECTION_LABELS`.** These are two word tables for one state (`cardLifecycle.js:6`, `:78`).
4. **Ready for commands versus ready for playback.** This one is deliberate (`cardAccess.js` header), but Patterns can say ready while Card Home says checking.
5. **The session view versus the lifecycle on boot id.** Inferred: "Connected" can differ from the chip while a boot id is pending.
6. **Live-control's raw id compare versus the lifecycle's cleaned id.** Inferred: it can refuse a correctly installed card.
7. **Studio's own polling versus the card link.** There are two stores of "connected", reconciled by an effect.

**Count:** "is the card connected" is worked out in about **8** places. "Does the card hold this project" is worked out in about **7**.

## 3. One fact stored twice

| Fact | Copies | Reconciled by |
|---|---|---|
| Project lifecycle | A ref, the reducer state and a localStorage record (`ProjectContext.jsx:421,1036`) | An effect, plus reverification on reload (`app.jsx:1190`) |
| Project revision | `projectRevision`, `editedRevision`, `installation.projectRevision`, the lifecycle revision, the card's revision | A memo at `app.jsx:1228-1252`. No single owner. |
| Firmware recovery | React state (`app.jsx:1126`), the stored update session, `readiness.firmwareUpdate` | An effect at `app.jsx:1140-1185` |
| Card connected | `useCardStatus` state, the shared `cardLink` reducer | An effect (`reportDirectCardStatus`, `app.jsx:1297`) |
| Commissioning stage | Storage plus 4 mirrors (`lw-setup.jsx:147`, `CardCommissioningPanel.jsx`, `useSetupJourney.js`, `app.jsx:755`) | 4 separate storage/event listeners. This is the same class as THINKING 2026-08-31. |
| Card read on Setup | `cardState` and `resolution` in `lw-setup.jsx`, plus `cardLink.readiness` | An effect keyed on a recheck tick |
| Expected card identity | `lw_card_identity_v1` in storage, plus `cardLink.expectedCard` | Re-read in 5 places in `cardLink.js` |
| "An operation is running" | 3 refs in `app.jsx:753-755`, plus the freshness monitor flag | Effects and events |

## 4. Fix history (last 30 days, `origin/main`)

These counts leave out CSS, the generated firmware bundle, reverts and re-landed copies.

- 78 commits changed Studio or firmware code.
- 21 of them changed 3 or more code files.
- 28 of the 78 (**36%**) had their changed lines rewritten by another commit within 7 days. That makes 36 such pairs.
- 2 whole-batch reverts happened on Nov 20, and 13 changes landed twice because of them.
- The most re-touched file is `v3/lw-pattern.jsx`: it was in 26 commits and 10 re-touch pairs.

**The worst five:**

1. **Slow, healthy card (Nov 21).** The fix touched 12 code files (`742ee685`). The next day, 6 more places that wait on a restarting card were found and fixed (`910c8109`: Recover lights, Show, light test, bridge saves). `cardPushClient.js` was rewritten again by `a52b9327` the same day. One rule took 3 commits across 18 files.
2. **Playlist and mobile controls (Nov 17-19).** `121a09c2` touched 24 files. Then `c73e8c11` rewrote 92 of its lines the same day, followed by `fd35e284`, `12952ac0` and `585d98ba`. That is 4 rewrites of `lw-playlist.jsx` in 3 days.
3. **Resending a timed-out tap (Nov 20).** `b607b9ac` and `cf403c49` resent the tap. The same day, `b9b0dd45` and `b744ba5a` stopped some resends, in the same lines of `patternGate.js`. The decision was reversed within hours, and each half landed twice.
4. **A fresh browser picks up the card's project (Nov 20).** `3e7632b0` was followed the same day by `421ccaf5` (the other-window check), which rewrote its `CardPickup.jsx` lines. The Card Home version was reverted with batch #441 and landed again.
5. **Isolated preview frames (Nov 5-6).** `9158794c` was rewritten by `deb287d1` the same day and again by `16540cf3` the next day.

## 5. Size and reach

**The ten largest files** (lines, tests excluded):

| Lines | File |
|---|---|
| 3,615 | `v3/lw-pattern.jsx` |
| 2,820 | `lib/cardBridge.js` |
| 2,602 | `v3/lw-flash.jsx` |
| 2,602 | `v3/app.jsx` |
| 2,588 | `pattern-lab/PatternLabScreen.jsx` |
| 2,400 | `components/layout/modes/DrawModePanel.jsx` |
| 1,999 | `lib/patterns-library.js` |
| 1,985 | `state/CloudLibraryContext.jsx` |
| 1,908 | `components/card/StripDiscoveryPanel.jsx` |
| 1,897 | `lib/cardLink.js` |

Total Studio source is 121,476 lines. `src/lib` holds 282 modules, 58 of them named `card*`.

**The ten most-imported modules** (by `src` files):

| Importers | Module |
|---|---|
| 39 | `cardConnection.js` |
| 29 | `ProjectContext.jsx` |
| 26 | `cardPushClient.js` |
| 26 | `cardIdentity.js` |
| 25 | `cardBridge.js` |
| 19 | `cardLink.js` |
| 19 | `cardHardwareContract.js` |
| 19 | `cardWiringSafety.js` |
| 19 | `patchBoard.js` |
| 18 | `cardReadiness.js` |

**Unused modules.** 15 `src/lib` modules, about 3,300 lines, are imported only by their own tests or by `tests/project-frame-audit.mjs`, never by the app:

`aiPatternClient`, `aiPatternDraft`, `artworkSymmetry`, `backgroundOutput`, `colourReorder`, `liveRecorder`, `patternStudio`, `previewFallbackStrip`, `projectHandoff`, `responsivenessProbe`, `svgDomStub`, `svgSanitize`, `timelineLayout`, `wledBasicExport`, `wledInstallWizard`.

`svgSanitize` is named in comments in `svgFlatten.js`, so check before deleting it.

**Tests that repeat each other:**

- 31 browser specs each write their own fake card. Only 25 use the shared `tests/harness/cardSimulator.ts`.
- 17 files each build their own "ready card status" fixture. THINKING 2026-08-07 already found those fixtures missing `projectId`, which no real card does.
- 16 specs are about saving or installing, for example `slow-card-save`, `slow-card-save-card-layout`, `layout-send-to-card`, `layout-led-count-save`, `journey-count-save`, `card-install-action` and `universal-install`. They check the same save against different hand-made fakes.

## 6. Ranked cleanups

The order is by payback. "Wait" means another session is editing those files now: `lw-pattern.jsx`, `CardPushControl.jsx`, `app.jsx`, `lw-setup.jsx`, `lw-playlist.jsx` and `cardSimulator.ts`. Land those cleanups one at a time, after the open branches merge. Every cleanup is proven the same way: the listed specs pass unchanged on the practice card, in both Fast and Real-timing modes, and `npm run test:unit` passes. No assertion may be deleted or loosened.

1. **One save-to-card path: from 6 places to 1.** Make one `saveProjectToCard()` that does the window lease, the revision check, the restart wait, the read-back and the refusal wording. Card Home, the footer, Patterns (both saves), Playlist and Scene call it. The bench and setup senders stay separate, but use their wait and read-back.
   - **Owner sees no change:** the same buttons, words and timing.
   - **Proof:** `slow-card-save`, `slow-card-save-card-layout`, `stale-save-two-browsers`, `card-install-action`, `layout-send-to-card`, `client-pattern-save`, `universal-install`, plus the `cardDeployment` and `cardPushClient` unit tests.
   - **Size:** 14-18 h.
   - **One place instead of many:** this week's slow-card fix (18 files), the other-window guard (4), the refusal wording (7 variants), and the swallowed footer error.
   - **Timing:** wait.
2. **One answer to "does the card hold this project": from 7 to 1.** The lifecycle's `exactProject`, with the legacy stand-in, becomes the only answer. Setup, the session view and live control read it instead of matching ids themselves.
   - **Owner sees no change:** the same labels.
   - **Proof:** the `cardLifecycle` unit tests, `card-workspace`, `setup-adopt-card-project`, `card-state-matrix` and `starter-no-save-over-card`.
   - **Size:** 6-8 h.
   - **One place instead of many:** the "matches" next to "Needs attention" bug, and the 2026-08-19 legacy-fingerprint fix, which had to go into 4 functions.
   - **Timing:** wait (`lw-setup`, `app.jsx`).
3. **One answer to "is the card connected", and one word table: from 8 to 2.** The two deliberate answers stay: ready for commands, and ready for playback. Studio's own status polling feeds the card link instead of keeping its own copy. The footer and identity-row words come from one table.
   - **Owner sees no change:** the same words in the same places.
   - **Proof:** `card-link-state.mjs`, `connect-simple`, `card-state-matrix` and the `cardConnectionFlow` and `cardLifecycle` unit tests.
   - **Size:** 8-10 h.
   - **One place instead of many:** this week's "slow card reads Checking, not Not connected" fix, and the label fix that landed twice.
   - **Timing:** wait (`app.jsx`).
4. **One fake card for tests: from 31 hand-written fakes to 1.** Move each spec onto `cardSimulator` or the practice card. Make one ready-status fixture instead of 17.
   - **Owner sees no change:** nothing; this is tests only.
   - **Proof:** each moved spec passes with the same assertions, and fails on the old fake's known gap where there is one.
   - **Size:** 12-16 h, done one spec at a time.
   - **One place instead of many:** making the fake behave like a slow card, which happened this week in 31 fakes or not at all.
   - **Timing:** specs nobody is editing can move now. `cardSimulator.ts` waits for the false-failures branch.
5. **One commissioning store: from 5 copies to 1.** One `useCommissioningFlow()` hook replaces the 4 mirrors and their listeners.
   - **Owner sees no change:** the same Setup steps.
   - **Proof:** the `cardCommissioningFlow` unit tests, `setup-led-count`, `setup-card-reconstruction` and `strip-discovery`.
   - **Size:** 3-4 h.
   - **One place instead of many:** the 2026-08-31 "declining the light check stranded the owner" class of bug.
   - **Timing:** wait.
6. **LED count and Recover lights each go through one checked helper.** LED count has 3 paths, which become 1, and the new path reads the card back. The 3 Recover lights callers that skip the checked wrapper are routed through it.
   - **Owner sees no change:** the same, except the footer stops calling an unchecked count "verified".
   - **Proof:** `layout-led-count-save`, `journey-count-save`, `setup-led-count` and the `cardRecoverLights` unit tests.
   - **Size:** 3-4 h.
   - **One place instead of many:** count-save fixes (3 paths) and the "Recover lights waits for a restarting card" fix (`910c8109`).
   - **Timing:** wait (`app.jsx`, `lw-setup`).
7. **Delete the 15 unused `src/lib` modules, about 3,300 lines.** `src/lib` goes from 282 modules to 267.
   - **Owner sees no change:** nothing.
   - **Proof:** `npm run build` and `npm run test:unit`, with only the deleted modules' own tests gone.
   - **Size:** 1-2 h.
   - **One place instead of many:** nothing directly. It means less to search through and fewer wrong turns.
   - **Timing:** safe now. No session is editing these modules.

**Total: about 47-62 hours.** Cleanups 1-3 are about 30-36 hours and carry most of the payback.

**Not recommended: splitting `lw-pattern.jsx` just because it is big.** Size alone is not the cause. It shrinks by itself when cleanup 1 removes its own save code.

## 7. Done on 2026-11-21: unused helpers deleted

There were 15 candidates. 9 were deleted, with their own tests, the matching blocks in `tests/project-frame-audit.mjs`, and `tests/preview-fallback-strip.mjs` (also dropped from `test:core`):

`aiPatternClient`, `aiPatternDraft`, `backgroundOutput`, `colourReorder`, `liveRecorder`, `patternStudio`, `previewFallbackStrip`, `projectHandoff`, `timelineLayout`.

6 were kept on purpose:

| Kept | Why |
|---|---|
| `svgDomStub` | A test helper used by 4 other test files. It belongs in `tests/`, not `src/lib`. |
| `responsivenessProbe` | A measuring tool used by 2 other test files. |
| `svgSanitize` | The SVG cleaner that `svgFlatten.js` says should run on every imported artwork. It was **never wired in**. This is unfinished security work, not dead code. It goes in TODO, not the bin. |
| `artworkSymmetry` | Named in the queued Symmetry-mode TODO and in `todo/plans/symmetry-sides.md`. |
| `wledBasicExport`, `wledInstallWizard` | CLAUDE.md marks WLED as a deferred lane that is kept for later. |

Everything deleted can be recovered from git at the commit before this one.

## 8. Streamlining plan: from many copies to one of each

**Target:** every card action lives in exactly one place, and every card fact is worked out once. A fix to "how Studio talks to the card" should then touch 1 file plus its test, not 4 to 18.

| Phase | What | Before → after | Size | When |
|---|---|---|---|---|
| 0 | Delete the unused helpers | 282 → 273 lib modules | done | now |
| 1 | **Retired the frozen old Studio (`src-v3/`), 2026-11-21.** Removed 104 files (33,072 lines), the `?v=3` switch, the `legacy-v3` pattern dialect, and the browser spec that only tested the old Studio. Three tests that also checked the old copy now check only `src`. The known-escape count in the manual pattern-boundary security probe fell from 21 to 15, because the old compiler's 6 are gone and the rest are unchanged. | done | done |
| 2 | **One card-command module** (`src/lib/card/commands.js`): `saveProject`, `setLedCount`, `tapLook`, `recoverLights`, `setColourOrder`. Each command does the same 6 steps in one place: lease, pre-read with retry, send, wait through the restart, read back, plain words for the result. Every screen calls these. Cleanups 1 and 6. | 6 save paths, 3 count paths, 7 restart waits → 1 each | 18-22 h | after the false-failures and simpler-journeys branches merge |
| 3 | **One card-state snapshot** (`src/lib/card/state.js`): connected, ready for looks, holds this project, update evidence and setup step, worked out once from the link and the stored records, with one word table. Screens read it and never recompute. Cleanups 2, 3 and 5. | 15 separate answers → 1 snapshot. 8 facts stored twice → 0. | 16-20 h | after phase 2 |
| 4 | **One fake card** for every test (cleanup 4) | 31 fakes → 1 | 12-16 h | specs can move now, one at a time |
| 5 | **Shrink the big screens**. This is mostly a result of phases 2-3, because each screen loses its own copy of the card code. Then split what is left by job. | `lw-pattern.jsx` 3,615 → under 2,000 lines | 6-8 h | last |

**Result if all of it lands:** Studio goes from about 154,500 lines (121,476 in `src`, plus 33,072 in `src-v3`) to roughly 115,000. Each card job lives in one place instead of up to 7. The whole plan is about 55-70 hours.

### Which agent does the work

- **Phases 2 and 3 need an Opus session.** It owns `src/lib/card/` for the whole job. The hard part is judgment, not typing. For example, Card Home has the window lock and the footer doesn't, Scene doesn't wait through the restart, and the footer's error is thrown away. For each such difference the session has to decide whether it is a bug or on purpose. Opus designs the module, then moves the first screen (Card Home) across itself.
- **The remaining screens move on Sonnet**, one screen per step, each step in its own worktree and landed before the next starts. They copy the pattern the first screen set. This is the same split that `todo/plans/symmetry-sides.md` used.
- **Phases 1 and 4 are Sonnet work.** They are mechanical, and the tests already define what "correct" means.
- **Only one session writes card code at a time.** Two sessions editing the save path at once is half of how this week went. Other sessions working on screens call the card module and never change it.
- A Fable review runs at the end only if Adrian asks for one.

## 9. Keeping it healthy

The rules below are checked by CI, so nobody has to remember them. Each check is a few seconds of plain Node script, with no metered service.

1. **One sender rule.** A test fails if any file outside `src/lib/card/` calls `pushConfigToCard`, posts to `/api/config` or `/api/control`, or calls `recoverCardLights` directly. A new screen cannot grow its own save path without CI going red.
2. **One answer rule.** A test fails if any file outside `src/lib/card/state.js` calls `deriveCardLifecycle`, `isCardLinkConnected` or `installationMatch`-style comparisons.
3. **A counts file that only goes down.** `lightweaver/code-health.json` records today's numbers:
   - save paths
   - fakes in tests
   - files over 2,000 lines
   - lib modules only tests import
   - the size of the five largest files

   CI recomputes them on every PR. A PR may lower a number, which updates the file, but never raise one. Raising one needs an explicit entry in the file saying why.
4. **New tests use the shared fake card.** A spec that defines its own `/api/status` reply fails the check, unless it is on the shrinking allowlist from rule 3.
5. **The "three files" stop.** Add to CLAUDE.md: when a fix for one rule needs the same change in 3 or more files, first move that rule into one place, then fix it there. This is what would have stopped this week's 12-file-then-6-file fix.
6. **Re-measure once a month.** The measuring scripts from this report become `npm run health`. It prints this report's numbers, so drift shows up as a number, not a feeling.

Rules 1-4 can only be switched on after phases 2 and 4 land. Until then they would fail on today's code. Rules 3 and 6 can go in now, with today's numbers as the starting line.

### Found while doing this (not fixed here)

Since #452, the derived Playwright configs (`tests/*-playwright.config.ts`) spread the base config, so its `globalTeardown: './tests/harness/networkGuard.ts'` resolves under `tests/tests/` and every one of those lanes fails before running a test. Running a spec through the base config works. The fix is to make the teardown path absolute in `playwright.config.ts`.
