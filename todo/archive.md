# Archive

- [x] Fix and merge the Find my strips stack (#502 D11 + #497 D9 + #503 FS1 + FS3 v2) _(band: agent-runnable)_ _(effort: medium)_
  Done 2026-11-24 in one integration PR. Cause of the steady-13s red: the 15 s allowance covered only the staging write; every read before and inside the save was still capped at 6 s, so the save stopped at 20 s ("did not return independent firmware and project evidence"). While the card holds the temporary setup every save read now waits 15 s (`CARD_SLOW_READ_MS`). Both interruption-slow-stage profiles green.

- [x] Run every pull request's tests on GitHub (`Branch tests`, PR #465), rebuilt on main with the two smoke halves _(band: agent-runnable)_ _(effort: medium)_
  Shipped 2026-11-24.

- [x] Stop the bridge resending `/api/config` after a timeout and give Show, Recover lights and the wiring-test end the same restart wait the saves have _(band: agent-runnable)_ _(effort: medium)_ → Plan: [false-failures.md](plans/false-failures.md)
- [x] Rebuild Card Home as status, not steps: status row, always-editable facts grid, "still to do" list, one primary _(band: agent-runnable)_ _(effort: deep)_ → Plan: [card-home-status-not-steps.md](plans/archive/card-home-status-not-steps.md)
  Shipped 2026-09-11 in four PRs: #272 the cut, #274 status module + still-to-do + facts, #276 card-name heading + power editor in the Hardware fold. Live at Studio build 1830.

- [x] Card Home leftovers: the Project row opens the Projects panel directly (today it routes to Preferences); the ready banner's firmware sentence duplicates the Card release row; Checks & recovery as a quiet fold row; `card-state-matrix.md` gains the `not-ready` and `real-card-as-found` rows _(band: agent-runnable)_ _(effort: moderate)_
  Shipped 2026-09-11 (PR #278).
