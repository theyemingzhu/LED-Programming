# Archive

- [x] Build the 9 simpler-journeys cuts proposed in PR #450 (52 → 41 phone presses) _(band: agent-runnable)_ _(effort: deep)_ → Plan: [simpler-journeys.md](plans/simpler-journeys.md)
  Shipped 2026-11-22 as #458 (live from Studio build 2623); re-measured on main 2026-11-24; #450 closed as superseded.

- [x] Run every pull request's tests on GitHub (`Branch tests`, PR #465), rebuilt on main with the two smoke halves _(band: agent-runnable)_ _(effort: medium)_
  Shipped 2026-11-24.

- [x] Stop the bridge resending `/api/config` after a timeout and give Show, Recover lights and the wiring-test end the same restart wait the saves have _(band: agent-runnable)_ _(effort: medium)_ → Plan: [false-failures.md](plans/false-failures.md)
- [x] Rebuild Card Home as status, not steps: status row, always-editable facts grid, "still to do" list, one primary _(band: agent-runnable)_ _(effort: deep)_ → Plan: [card-home-status-not-steps.md](plans/archive/card-home-status-not-steps.md)
  Shipped 2026-09-11 in four PRs: #272 the cut, #274 status module + still-to-do + facts, #276 card-name heading + power editor in the Hardware fold. Live at Studio build 1830.

- [x] Card Home leftovers: the Project row opens the Projects panel directly (today it routes to Preferences); the ready banner's firmware sentence duplicates the Card release row; Checks & recovery as a quiet fold row; `card-state-matrix.md` gains the `not-ready` and `real-card-as-found` rows _(band: agent-runnable)_ _(effort: moderate)_
  Shipped 2026-09-11 (PR #278).
