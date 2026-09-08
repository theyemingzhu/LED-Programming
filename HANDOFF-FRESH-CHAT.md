# Handoff to fresh chat — unified Lightweaver journey, round 2

Round 1 (2026-09-05 → 09-08) is closed: B0–B5 built, J01–J14 in the smoke lane,
Phase E bench run done, F1–F14 fixed, everything merged and live (Studio build
1650, firmware release 1548). It was conducted by Fable directing cheap agents.
This block hands the same shape to the next conductor, with what round 1 learned
baked in. Open a new task in this repository and paste it.

```
Conduct round 2 of the unified Lightweaver card journey. Adrian still hits
glitches using it; the job is to find each one on the real card, root-cause it,
fix it with the cheapest capable agent, prove it, and ship it.

Read in order:
1. CLAUDE.md (shipment vocabulary, firmware loop, branch rules) and
   LIGHTWEAVER_WORKBOARD.md, newest entries first.
2. docs/plans/2026-09-06-unified-card-journey-execution.md — §0 done table,
   §1 rules (all nine still hold), Phase G (F15 open), Phase E script.
3. docs/journeys/acceptance-ledger.md — every row still "physical pending".
4. TODO.md ## Follow-ups and ## Soon.

Starting state: main is what GitHub shows; live Studio build must equal
`git rev-list --count origin/main`. Bench card lw-b0fe81f61b44 at 192.168.18.70,
firmware 1548, holding 42 px on a 41-LED strip (set back to 41 in Layout).
Dev Studio: localhost:9999 from a worktree on main.

Role: conductor. Fable (you) directs and decides; agents do. Sonnet for Studio
source and test fixes, Haiku for read-only checks, docs, sweeps and content
proofs, Opus only for transport/identity/firmware-contract work. Adrian is not
at the computer except during Phase A; never wait on an approval prompt —
verify and commit an agent's work yourself if it stalls.

Agent briefs must carry: an explicit worktree path YOU created from the
working branch (harness worktrees base on main and agents correctly stop);
node_modules symlinks for lightweaver/ and led-art-mapper/app/; `env -u GH_HOST
gh`; sandbox off for git push, fetch and Playwright; Playwright JSON stats with
`unexpected: 0` quoted verbatim; helper scripts written to files, never inline
`node -e`; no `git stash`, no force-push, no checkout over files they did not
write. Never two Playwright runs against one worktree's server.

Phase A — bench intake (Adrian present, one observation at a time). First the
E4 re-run as written in the plan: a REWIRE (change the GPIO), not a count
change. Then a free owner pass: Adrian uses Studio and the card as an owner
would and reports each glitch as it happens. Record each as F16, F17… with
screen, expected, observed, and a root cause found in code BEFORE any fix is
briefed. Never mark hardware proof passed from a mock.

Phase B — fix round. One ticket per defect, one PR per ticket, regression red
first, the simulator mirrors the firmware rule (a count-only change is save and
reboot, a rewire is a staged light test; a lost reply is verification pending,
read the card back before any resend). Before EVERY merge run the two gates
pull requests do not run: `cd lightweaver && npm run test:core:source && npm
run test:production-jobs && node tests/pages-staging.mjs` and `npm run
ci:firmware-sensitive` — three merges went red on main in round 1 because
they only run after a merge. Commit docs at the end of a checkpoint, not in
the middle (a commit moves the build number the footer tests compare).

Phase C — known open work, after Phase B or when blocked on Adrian: F15
(playlist-footer chip label, `tests/layout-led-count-save.spec.ts`); the
main-only gates onto the PR lane (TODO ## Follow-ups); the remaining
notice-layer sites (#222 follow-up); the eight long-red browser specs;
connection-center-quality back in the merge gate.

Phase D — ship. "Ship it to main" per CLAUDE.md: merge one stream at a time,
wait for Tests on the final revision (an earlier run cancelled by a later
merge is not evidence — rerun it), prove live by the build number in
/studio-release.json, then sweep: delete merged branches and clean worktrees
with a restore file written first. A firmware release only if firmware/**
changed or Adrian asks; bump VERSION then.

Do not: deploy or sign firmware unasked, flash or factory-erase a card,
invoke exhaustive Prove, add Pi runtime work, or widen scope past the
defects found. Report in Done / Needs you form with Studio and firmware
build numbers, acceptance evidence per ticket, and one next step.
```

---

## Context for after

Round 1 record: `docs/plans/2026-09-06-unified-card-journey-execution.md`
(tickets, rules, Phase E results), `docs/journeys/acceptance-ledger.md`
(J01–J14 with test names), workboard entries 2026-09-06/07/08. Restore files
for every branch deleted in the sweeps sit in `.claude/worktrees/`.
