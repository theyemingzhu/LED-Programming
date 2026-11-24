# Archive

- [x] Delete the 56 `archive/` branches moved there on 2026-11-24 _(band: agent-runnable)_ _(effort: quick)_
  Deleted 2026-11-24 on Adrian's word. Backup: `~/builds/backups/led-archive-branches-2026-11-24.bundle` (56 heads, verified); restore one with `git fetch <bundle> refs/remotes/origin/archive/<name>:refs/heads/<name>`.

- [x] Build the 9 simpler-journeys cuts proposed in PR #450 (52 → 41 phone presses) _(band: agent-runnable)_ _(effort: deep)_ → Plan: [simpler-journeys.md](plans/simpler-journeys.md)
  Shipped 2026-11-22 as #458 (live from Studio build 2623); re-measured on main 2026-11-24; #450 closed as superseded.
- [x] Fix and merge the Find my strips stack (#502 D11 + #497 D9 + #503 FS1 + FS3 v2) _(band: agent-runnable)_ _(effort: medium)_
  Done 2026-11-24 in one integration PR. Cause of the steady-13s red: the 15 s allowance covered only the staging write; every read before and inside the save was still capped at 6 s, so the save stopped at 20 s ("did not return independent firmware and project evidence"). While the card holds the temporary setup every save read now waits 15 s (`CARD_SLOW_READ_MS`). Both interruption-slow-stage profiles green.

- [x] Run every pull request's tests on GitHub (`Branch tests`, PR #465), rebuilt on main with the two smoke halves _(band: agent-runnable)_ _(effort: medium)_
  Shipped 2026-11-24.

- [x] Stop the bridge resending `/api/config` after a timeout and give Show, Recover lights and the wiring-test end the same restart wait the saves have _(band: agent-runnable)_ _(effort: medium)_ → Plan: [false-failures.md](plans/false-failures.md)
- [x] Rebuild Card Home as status, not steps: status row, always-editable facts grid, "still to do" list, one primary _(band: agent-runnable)_ _(effort: deep)_ → Plan: [card-home-status-not-steps.md](plans/archive/card-home-status-not-steps.md)
  Shipped 2026-09-11 in four PRs: #272 the cut, #274 status module + still-to-do + facts, #276 card-name heading + power editor in the Hardware fold. Live at Studio build 1830.

- [x] Card Home leftovers: the Project row opens the Projects panel directly (today it routes to Preferences); the ready banner's firmware sentence duplicates the Card release row; Checks & recovery as a quiet fold row; `card-state-matrix.md` gains the `not-ready` and `real-card-as-found` rows _(band: agent-runnable)_ _(effort: moderate)_
  Shipped 2026-09-11 (PR #278).

- [x] Shipping queue of 2026-11-24 morning: smoke split, card update 1.2.6 (#508, closing #490/#491/#505; #506 closed), Back to Layout (#510), lost-looks fix L1 (#512), Studio no-touch prompts (#509), docs PRs #513 and #460.
  All merged by 2026-11-24 (checked by the ship coordinator against GitHub).

- [x] Real-card check of `relative-look-tuning-default-boot`: PASS on every step, run 2026-11-24 with Adrian's "Yes, run it" (Save to card 200, read-back keeps sections, phone brightness keeps sections, boots into the saved default after a USB hard reset). Card left on signed 1.2.6. Setup-phone spec fix merged as #519.

- [x] Merge the crash-recorder queue and patch refresh (PR #518): queue/docs plus the Studio crash reader; no card change by itself _(band: agent-runnable)_ _(effort: quick)_ Done 2026-11-24: shipped as Studio 2896, firmware 1.2.7 build 2895.
- [x] Merge the phone top-bar fix (PR #520), then the card save body that leaves out card-default fields (PR #524, 3,895 to 3,084 bytes on the real project; do one real-card Save to card first), one per main run, after the 1.2.7 signer _(band: agent-runnable)_ _(effort: quick)_ Done 2026-11-24: shipped as Studio 2896, firmware 1.2.7 build 2895.
- [x] Send card update 1.2.7 with `npm run firmware:release` (crash recorder #522 + look-tuning + query-GET fix; rehearsed and compiled 2026-11-24, 38.3% of flash), bench-check the exact release commit, merge, prove live, then close #522 _(band: agent-runnable)_ _(effort: medium)_ Done 2026-11-24: shipped as Studio 2896, firmware 1.2.7 build 2895.

## Done 2026-11-24 (branch and card cleanup)
- [x] Recovered or archived every leftover worktree: clean ones removed, three unsaved pieces pushed as archive/claude/day-batch-5-timeout-spec, archive/codex/pre-sync-main-20261117 and archive/diag/d11-with-d9, the rest discarded on Adrian's word ("Yes, discard them"). Only main and archive/ remain on GitHub.
- [x] Real-card Save to card on Studio 2896 (PR #524): accepted on lw-b0fe81f61b44 with one strip changed to Ocean, 3,624 of 3,968 bytes; dial and button pins read back unchanged and a real next press registered. Original project restored byte-identical.
- [x] Card project limit: PR #524 shrank the six-look project from 3,895 to 3,084 bytes, so a one-strip change saves again.
