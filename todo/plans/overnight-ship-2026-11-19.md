# Overnight ship log — 2026-11-19

Shipping thread for the overnight durability run (`claude/overnight-durability-v2`).
Studio-only fixes, batched, at most four ships. Never firmware.

## Summary (kept current)

**Live:** Studio build 2471 (PR #438): Card Home no longer calls an untouched starter "a draft that differs", and no longer offers to save that empty starter over a working card.
**Rejected:** 70f4a99b (Patterns refusal clears on reconnect) — also wiped refusals raised while the card was ready, so an unsent tap showed nothing.
**Needs Adrian:** 70f4a99b + 60d314dd together are now correct (reviewed) but held because 70f4a99b was rejected tonight; ship them as one change if you agree.

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
