# Practice card — build log and decisions

Brief (from the coordinating session, Adrian's words): "build the permanent practice card also, let's have two different modes and we can use the practice card in different modes simultaneously. One is for speed to run everything through as quick as possible. The other is to try to replicate the card as close as possible with the speed checks."

## Steps
1. Docs rule "Which card to test against" in CLAUDE.md + docs/practice-card.md — own PR.
2. Timing profiles `fast` / `real`, numbers cited from real-card traces.
3. Local practice-card page + `lw practice`.
4. Contract check: read-only replay against physical card vs Real-timing.
5. One Real-timing run of the matrix; list reds for the coordinator.

## Decisions
- D1: Step 1 ships alone as docs-only so agents learn the rule today; it names files that land in step 2 and says so.
- D2: Timing lives in a NEW layer (`tests/harness/practiceTiming.ts`) in front of the unchanged simulator, not inside `cardSimulator.ts`. Reason: the false-failures session (local_44c97881) is editing `cardSimulator.ts` and had pushed nothing when this started; a layer registered after `card.install` sees every request first (Playwright runs the newest route first) and hands on with `fallback()`, so no simulator restructure is needed. Once false-failures lands, its silence/delay options can be driven from the profile.
- D3: A silent card never answers; the request is held until the silence ends (then answered late) — matching the traces, where Studio's own 0.6–3 s deadlines abort and polls that do get through take up to 9.7 s.
- D4: Traces copied into `lightweaver/tests/harness/traces/` (JSON + serial log, no screenshots) so profile citations survive the scratchpad being cleared. Checked: no secrets (card id, LAN IP, AP name only).
- D5: Spontaneous silences are seeded (`seed`, `LW_PRACTICE_SEED`) and wall-clock scheduled, about one a minute. Focused tests turn them off with `overrides`.
- D6: Studio drops the port of a card address (`src/lib/cardIdentity.js` normalizeHost uses `.hostname`) and port 80 here is the i64os Caddy proxy (unprivileged port 80 on 127.0.0.1 is refused). So Studio reaches a practice card through its own Playwright-launched window that routes every card address to the practice card (`scripts/practice-studio.mjs`). Not changed: Caddy (i64os infra) and `src/` (lightweaver-app agent's). Side benefit: that window can never reach the physical card.
- D7: The page's restart puts the playing look back (the real card boots into its start-up look, serial log "Starting look: Fire"); the simulator's own `reboot()` models a power cut to dark and is left as is.
- D8: `npm ci` was held by the blast-radius guard (it empties node_modules, which held 0 packages); used `npm install` instead, which deletes nothing. lockfile unchanged.
- D9: The contract check compares SHAPES (field paths and types, not values) and median TIMINGS per path (drift when > 40 ms AND > 50%). Spontaneous silences are off on the practice side during the run; real-card silences are counted, not compared. It refuses any method except GET.
- D10: Step 5 used a temporary, uncommitted 6-line hook in `cardSimulator.ts install()` (applies Real-timing when `LW_PRACTICE_TIMING=real`) so 37 existing spec files ran in Real-timing unedited. Not committed, to stay clear of the false-failures session's edits; the permanent run-wide switch for direct `createCardSimulator` callers lands after that session merges.

## Contract check, first run (2026-11-21, physical card 192.168.18.70)
All 16 requests answered. Timing within tolerance except `/api/zones` (card 40 ms, practice 118 ms; the profile's 110 came from save-trace-NOSAVE on a less settled card). Shape drift is large: the simulator lacks 36 status fields (capabilities.clientPlaylist, symmetrySides, recipeCapabilities…), 73 firmware-info fields, 27 patterns fields (startupPatternId, playlist, per-pattern presets); it adds `piece.id` to status, 45 fields to firmware-info and 12 candidate fields to wiring/status. These are simulator BEHAVIOUR gaps (cardSimulator.ts), logged as follow-ups, not fixed here.

## Follow-ups (not done here)
- Practice-card shape drift above: bring `statusBody`/firmware-info/patterns in `cardSimulator.ts` up to the real card, after the false-failures session lands.
- Studio keeps only the hostname of a card address (`cardIdentity.js` normalizeHost); keeping the port would let a normal tab use `?cardHost=127.0.0.1:7101`. lightweaver-app agent's call.
- Make `LW_PRACTICE_TIMING=real` apply to direct `createCardSimulator` callers permanently (the D10 hook), after false-failures merges.
- Bridge lane under Real-timing: `createPracticeCard` times the bridge relay, the D10 hook does not.
