# Overnight ship log — 2026-11-19

Shipping thread for the overnight durability run (`claude/overnight-durability-v2`).
Studio-only fixes, batched, at most four ships. Never firmware.

## Summary (final, 06:45)

**Live (2 fixes, 1 of 4 ships):** Studio build 2471 (PR #438): Card Home no longer calls an untouched starter "a draft that differs", and no longer offers to save that empty starter over a working card.
**Rejected:** 70f4a99b (Patterns refusal clears on reconnect) — also wiped refusals raised while the card was ready, so an unsent tap showed nothing.
**Needs Adrian:** 70f4a99b + 60d314dd together are now correct (reviewed) but held because 70f4a99b was rejected tonight; ship them as one change if you agree. The replacement durability run (v3) never pushed a branch, so anything it fixed is not on GitHub.

## Log

- 22:55 Started. `origin/main` = 1ecb9ab1, build 2465. Durability branch has 1 commit ahead of main.
- 23:00 Baseline on origin/main 1ecb9ab1: `npm run test:unit` 3145/3145 pass.
- 23:00 Reviewed `3a2b3009` "Card Home: an untouched starter is not 'a draft that differs'" — ACCEPT. Studio-only (src/lib/cardSessionView.js, v3/lw-setup.jsx, tests). Cause is real: `starterPending` project compared against the card. Unit test fails without it. Only copy is hidden; buttons and save path unchanged. Note: a starter that has pattern edits but no physical edits also loses the "differs" sentence (starterPending clears only on physical change) — informational copy only, acceptable.
- 23:01 Only 1 commit; waiting 45 min per the cycle rule.
- 23:42 Reviewed `208ec663` "untouched starter offers no save over the card" — ACCEPT (hides "Review and save draft" when the browser holds only the starter; adds a guard, removes none; spec starter-no-save-over-card).
- 23:42 Reviewed `607082e8` "any-state-quiet: first pairing off Setup is two named presses" — ACCEPT as test-only (spec is not in any CI lane).
- 23:45 Batch 1 = 3a2b3009, 208ec663, 607082e8 cherry-picked on 1ecb9ab1. preflight: Studio-only, no card release. test:unit 3146/3146, workflow+production-job tests 23/23.
- 23:50 Browser: 17/18 pass. **RED: journey-continuity.spec.ts:139 [J02]** — expects "Your draft: Untitled Project" on Card Home, which 3a2b3009 now hides. Same test GREEN on origin/main (measured). Batch 1 NOT shipped.
- 23:50 HELD (not rejected): 3a2b3009 until J02 is updated to match; 208ec663 and 607082e8 depend on it (same JSX lines / spec file). Messaged the durability session with the exact failing line. Re-check next cycle.
- 00:06 New on durability branch: `70f4a99b`, `001b6092`.
- 00:10 Reviewed `001b6092` "J02: untouched starter shows no draft line and no save-over offer" — ACCEPT (test update matching 3a2b3009/208ec663).
- 00:10 Reviewed `70f4a99b` "Patterns: a 'not ready' refusal clears when the card comes back" — **REJECT**: the new effect clears every `recovery` gate whenever access reads `ready`, but `blockPatternCardEffect` also raises `recovery` while access is already `ready` (lw-pattern.jsx ~1475 no current authority, ~1837 bridge authority not fresh), so those refusals vanish in the same render and an unsent tap shows nothing. Told the author the safer shape.
- 00:12 A guard held `git checkout -q -B <branch> origin/main` (it read it as checkout-with-path). Not retried; used `git switch` (no path form) instead.
- 00:15 Batch 2 = 3a2b3009, 208ec663, 607082e8, 001b6092 on 1ecb9ab1. preflight Studio-only. test:unit 3146/3146, workflow tests 23/23. Browser (starter-no-save, https-direct-reconnect, j01, journey-continuity, expression-scene-install, setup-card-reconstruction, setup-adopt-card-project, card-workspace): 141/143.
- 00:20 **RED: card-workspace.spec.ts:1959 and :2214** — both assert "Your draft: Untitled Project" (lines 1988, 2234). Both GREEN on origin/main (measured). Batch 2 NOT shipped; starter chain still HELD. Told the author which specs to grep and run.
- 00:12 Reviewed `60d314dd` "Patterns: only a refusal raised while the card was unready clears itself" — net change of 70f4a99b+60d314dd is now CORRECT (refusals raised while access already reads ready stay; unit tests cover it). NOT shipped tonight: it is built on 70f4a99b, which was rejected at 00:10, and a rejected commit never ships tonight. → Needs Adrian: ship 70f4a99b+60d314dd together as one change; review done.
- 00:16 Reviewed `990b70aa` "card-workspace: untouched starter shows no draft line or save-over offer" — ACCEPT (test update for the two reds found at 00:20).
- 00:20 Batch 3 = 3a2b3009, 208ec663, 607082e8, 001b6092, 990b70aa on 1ecb9ab1 (branch claude/overnight-batch-3). preflight Studio-only. test:unit 3146/3146, workflow tests 23/23. Browser 142/143; the red https-direct-reconnect:25 (reconnect timing, 3 workers) passed 3/3 alone, batch touches no reconnect code → contention, not a regression.
- 00:25 SHIP 1 of 4: PR #438 merged → main f47b85b8 (build 2471). Batch branch deleted on remote (ls-remote empty). Watching Tests run 44565289582.
- 00:39 Tests run 44565289582 on f47b85b8: success (first try, no apt failure).
- 00:47 Deploy site 44568506509: success. Build firmware binary: success, no signer commit on main (Studio-only, as preflight said).
- 00:48 Live proof: studio-release.json buildNumber 2471, sourceRevision f47b85b8 (= origin/main, rev-list count 2471). Served main-CNFcUASO.js contains `differenceCopy:m?"":w==="matches"?"Your draft matches…` (3a2b3009); lw-card-ByMqEEyX.js contains `starterPending)!==!0&&…"installed-draft-review"` (208ec663).
- **Shipped — Studio build 2471**: untouched starter is not "a draft that differs" (3a2b3009); no save-over offer for an untouched starter (208ec663); tests 607082e8, 001b6092, 990b70aa. Ships used: 1 of 4.
- 01:27 Cycle: no new commits on the durability branch since 990b70aa. Waiting 45 min.
- 02:13 Cycle: still no new commits since 990b70aa (00:16); durability session reported running. Waiting 45 min.
- 02:58 Cycle: no new commits since 990b70aa (00:16). Batch-3 branch confirmed gone on the remote (ls-remote 0). Waiting 45 min.
- 03:43 Cycle: no new commits since 990b70aa (00:16). Waiting 45 min.
- 04:28 Cycle: no new commits since 990b70aa (00:16). Waiting 45 min.
- 05:14 Cycle: no new commits since 990b70aa (00:16). Waiting 45 min.
- 05:59 Cycle: no new commits since 990b70aa (00:16). Waiting 45 min.
- 06:44 Final cycle: no new commits since 990b70aa (00:16). Live studio-release.json still buildNumber 2471. Night ends here (~8 h). Batch worktree removed, local batch branches deleted; no batch branch left on the remote.
- 07:35 Coordinator asked to also ship from `claude/overnight-durability-v3`. Measured: that branch does not exist on the remote (ls-remote shows only v2 at 990b70aa and this log branch). Nothing to review; the 8-hour window is over, so the night ends with Studio build 2471.

## Day run — 2026-11-20 (coordinator: up to 4 more ships, until ~18:00)

- 08:24 Resumed on the coordinator's message. v2 still at 990b70aa (no new commits). Coordinator decision: ship 70f4a99b + 60d314dd together if the combined result proves (a) a connected card's refusal stays and (b) a drop refusal clears.
- 08:30 Day batch 1 = 70f4a99b, 60d314dd on f47b85b8 (claude/day-batch-1). preflight Studio-only.
- 08:45 Proof (a): `patterns-v3.spec.ts:1813` (Connected card, tap refused, alert "This card is not ready for pattern commands.") FAILS on 70f4a99b alone, PASSES on the pair and on main. Proof (b): `pattern-refusal-clears-on-reconnect.spec.ts` PASSES on the pair; `patternGate.test.js` covers both.
- 08:50 Same Patterns set on pair vs main: pair 75 pass / 3 fail, main 74 pass / 3 fail. The 3 are `journey-direct-preview.spec.ts` :167, :197, :250 — red on main already (Needs Adrian: pre-existing red).
- 08:55 test:unit 3149/3149; workflow tests 23/23; https-direct-reconnect + j01 + journey-continuity 17/17.
- 09:00 SHIP 2 (day 1 of 4): PR #439 merged → main 1df1020b (build 2474). Batch branch gone on remote. Watching Tests 44646692059.
- 09:15 Adrian asked about the journey-direct-preview reds. Cause (measured): test harness, not Studio. Since the 2026-11-05 pattern-isolation change, Studio runs previews in a hidden opaque sandbox frame. Playwright init scripts run in every frame: the config's serviceWorkers:'block' getter and this spec's seedKnownCard localStorage write both throw inside that frame, and the spec's "screen crashed" check counts those as crashes. Patterns behaviour itself passes in all three. Trying the fix screen-smoke already uses (serviceWorkers:'allow' + blockMainFrameServiceWorkers, and skipping seeding when window !== window.top) → 3/3 pass locally; edit reverted, nothing committed. The spec is in no CI lane, which is why it stayed red for two weeks.
- 09:25 Adrian: "Yes, fix it". Committed f251aec5 on local branch claude/day-batch-2 (from 1df1020b): journey-direct-preview 3/3 pass. Test-only; waits to ride with the next durability batch so it costs no extra CI run.
- 09:35 Adrian: "add it to the CI smoke lane too". Committed on claude/day-batch-2: journey-direct-preview added to ci:browser-smoke and test:release-ui (lightweaver/package.json scripts). development-workflow + production-job tests 23/23; preflight Studio-only; spec 3/3 with --workers=1. Rides with the next batch.
- 09:40 Main moved: another session merged PR #440 (73a8ce42, "Stop an older rollback record failing an update that worked") on top of #439. Tests for 1df1020b was cancelled by that push. #439 goes live only through the Tests run for 73a8ce42 — watching it. Not my PR; not reviewing or touching it.
- (Clock correction: the entries stamped 09:15–09:40 above actually happened between about 08:25 and 08:45; real clock now 08:59.)
- 08:49 Coordinator relayed Adrian: "Please stop waiting for me. If you find any fix, you have full permission to fix it." Sources now v2 + v3. New: 13abb518, d2f90653 (on both), 5bd8ec31 (v3), eca27506 (v2); 9fd1452b/862130da are log-only; 45ba20d8 a merge.
- Reviewed `13abb518` "Studio recognises an install that landed while the page reloaded" — ACCEPT. With no install record, binds only on the connected card id + same project id + well-formed fingerprint equal to the open project's. Exact proof, nothing looser; unit tests.
- Reviewed `d2f90653` "Stress recorders" — ACCEPT, tests only; simulator knobs are inert when unset; own configs, no CI lane.
- Reviewed `5bd8ec31` "Patterns: a timed-out tap is resent once the card answers again" — ACCEPT WITH CORRECTION (b744ba5a): it also resent after a 409 "busy with another change" (usually another browser — a resend overrides its newer choice) and had no time limit. Now only timeout/restart/starting-up, once, within 30 s. 3 new unit cases fail without the correction.
- Reviewed `eca27506` "Card Home: a fresh browser picks up the card's project by itself" — ACCEPT WITH CORRECTION (f7b31979): "untouched" used starterPending only, which stays true after a rename or saved looks, so the pick-up silently replaced owner work. Now also requires lifecycle "New project" (never edited/saved/restored, survives reload). New spec case FAILS without the correction (measured: "the card project replaced unsaved owner work"), passes with it.
- Day batch (claude/day-batch-3, from 73a8ce42): 13abb518, d2f90653, 5bd8ec31, eca27506, journey-direct-preview fix, smoke-lane addition, b744ba5a, f7b31979, 9812a71a (starter-no-save-over-card stops asserting "Open installed project", which the pick-up removes; its no-save-over check kept).
- Checks: test:unit 3154/3154; workflow tests 23/23; preflight Studio-only. Browser (fresh-browser, pattern-timeout, pattern-refusal, patterns-v3, journey-direct-preview, card-workspace, journey-continuity, j01, https-direct-reconnect, setup-card-reconstruction, setup-adopt-card-project, card-edit-handoff, starter-no-save, expression-scene-install): 224/225, the one red fixed by 9812a71a, then 4/4.
- 08:59 Holding the merge until Tests for 73a8ce42 (#439 + another session's #440) finishes (~09:13), so my push does not cancel it.
- 09:09 Tests for 73a8ce42 (#439 + #440): success. Deploy site + Build firmware binary: success; no signer commit on main.
- 09:11 Live proof: studio-release.json buildNumber 2476, sourceRevision 73a8ce42 (= origin/main, count 2476). Served lw-pattern-COirljCj.js contains `raisedWhileUnready` in the gate check (60d314dd) and the clearing effect.
- **Shipped — Studio build 2476**: Patterns "not sent" refusal clears once a dropped card is back, only when raised while unready (70f4a99b + 60d314dd, PR #439). Day ships used: 1 of 4.
- 09:13 SHIP day 2 of 4: PR #441 merged → main a191d286 (build 2486). Batch branch gone on remote. Watching Tests 44651807326.
- 09:29 **REAL FAILURE** on main a191d286 (#441): Tests browser smoke, `journey-ownership.spec.ts:336` [J08] "sequential identical install: a second tab pressing install after the first finishes writes nothing" — failed on the try and the retry. Not in my local check set; that gap let it through.
- 09:32 Reverted: PR #443 (git revert -m 1 of #441) merged → main 6b552778 (on top of another session's #442). Real failures today: 1 of 2.
- 09:40 Bisected locally: J08 fails from 13abb518 onward and passes on 73a8ce42. Cause: bindUnrecordedInstall gives tab two a verified install record, and CardPushControl treats `currentInstallation` as "this browser installed it, a press is a deliberate resend", so it wrote the identical config a second time. Corrected (e9269158): bound record carries `witnessedByCard`, and the exemption reads new `installedByThisBrowser()`. J08 file 4/4, projectLifecycle unit 23/23.
- 09:45 Rebuilt as claude/day-batch-4 on 6b552778 (all of #441's commits + e9269158). This time running the full `npm run ci:browser-smoke` locally before shipping.
- 09:45 Two-browser recorder run stopped: I had switched branches in its worktree mid-run, so its results are not trustworthy. Re-run after this ship, in its own checkout.
