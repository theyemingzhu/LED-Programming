# Overnight ship log — 2026-11-19

Shipping thread for the overnight durability run (`claude/overnight-durability-v2`).
Studio-only fixes, batched, at most four ships. Never firmware.

## Summary (kept current)

**Live:** nothing yet.
**Rejected:** nothing yet.
**Needs Adrian:** nothing yet.

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
