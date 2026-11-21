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

## False-failures options (reported 2026-11-21, branch claude/false-failures @ 742ee685, not merged)
setRestartSilence(ms) / restartAfterSaveMs, silenceFor(ms), answerAfter(path, ms, times), isRestarting(), setReplyDelay(ms), card.relayBridge. Plan once it is on main: the `real` profile drives these (restartAfterSaveMs = REAL_PROFILE.restartSilenceMs, spontaneous silences via silenceFor, per-path latency via answerAfter) instead of the route layer duplicating them; `createPracticeCard` times the bridge through relayBridge. Until then the layer stays as built, so this branch does not depend on an unmerged one.

## Incident 2026-11-21: Step 5 runs reached the physical card
The spec list was written to the sandbox TMPDIR and read from the unsandboxed one, so it was empty and `playwright test` ran the whole default suite twice, including tests/live-*.spec.ts. Those reset the physical card to the bench discovery project, installed and restarted it, and wiped its looks and sections. Fixed at the harness by PR #452 (tests/harness/networkGuard.ts): live specs not collected, every browser/Node request to a local-network address refused, a refused write fails the run; off only with LW_ALLOW_PHYSICAL_CARD=1. The guard then caught one real leak (strip-discovery's frame-stream WebSocket), fixed in the same PR.
- D11: Any batch run from now names its files in the command itself (never a list read from a temp file), and runs only with the guard on main.
- Step 5 (Real-timing run of the 37 simulator specs) is NOT done yet; it reruns with the guard in place.

## Queued after the Real-timing run (2026-11-21)
- Bench-discovery card state (asked by false-failures, local_44c97881): build it from the durability session's real read-back, branch claude/staged-candidate-never-activated @ 7d7ed0bd, lightweaver/tests/fixtures/real-card-bench-2026-11-21/ (status, firmware-info, wiring_status, zones, patterns). Facts: lightweaver-bench-discovery-v1 rev 1, fp d93ebe18ab7780b1, provisionalSetup, output bench-18 GPIO 18 256 px segment bench-18-full, GRB, 2000 mA, look bench-warm (warm-white 0.25, zone bench-full), fw 1.2.4/2464, firmwareUpdate rolled-back. No new card read needed. Own small PR.
- Simulator gap (reported by durability, local_7fc32bf5): /api/config carrying a new looks list leaves installedLooks unchanged, so a second window re-adopts the old list. Real-card behaviour to confirm from firmware source before changing cardSimulator.ts.

## Step 5 result (2026-11-21, guard on)
41 simulator spec files, 399 tests under Real-timing: 353 pass. 15 tests red ONLY under Real-timing (confirmed by a Fast re-run of the same files on the same code); 4 more red in both modes. List handed to the coordinator in the shared notes folder (practice-realtiming-reds-2026-11-21.md). Not fixed here. Caveat: slow-card-save-card-layout adds its own restartAfterSaveMs, so under Real-timing it gets two restarts — when the profile drives the false-failures options (see above) this double count goes away.

## Bench-discovery state (2026-11-21)
Added `tests/harness/benchDiscoveryCard.ts` (`BENCH_DISCOVERY_STATE`, `createBenchDiscoveryCard`, `createBenchDiscoveryPracticeCard`) from the durability session's real read-back, copied to `tests/harness/traces/real-card-bench-2026-11-21/`. Checked by `tests/bench-discovery-card.spec.ts`. Not in CARD_STATES (would add matrix cells). Also in the practice page's state picker.
- Follow-up: the simulator's /api/firmware-info adds a top-level `projectId` the real card does not send (it names the project as `piece.id` only). Simulator-wide; fix with the other shape drift.
