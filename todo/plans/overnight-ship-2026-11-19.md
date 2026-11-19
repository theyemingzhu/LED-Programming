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
