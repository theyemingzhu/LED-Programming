# Lightweaver workboard

This is the compact cross-session source of truth. Only the primary agent edits
this file. Sub-agents return results, tests, commits, and blockers to the primary
agent, which integrates the evidence here. Keep entries short; detailed Bench and
Prove records belong in their session folders.

Status values: `queued`, `active`, `needs-eyes`, `blocked`, `done`.

## Sprint queue

2026-09-09: **PATTERN-EDIT-MANAGER implemented locally** — Slow color drift has
visual colors/reordering, locks, Pace, Character, three variations, Undo, rehearsal,
Keep/reopen and unsaved recovery. Patterns updates/renames retain identity; deletion
has Undo; full collections refuse new saves; Lab preserves native colors/sections.
Live preview follows native and streamed patterns; Piece/Strip keeps render geometry.
Checkpoint: 2,465 unit tests and production build passed. Recovered checkout: 19/19 integrated desktop browser scenarios and 5/5 Mobile Chrome
creative scenarios passed; desktop and 390px phone screens inspected directly.
Physical color/playback remains unverified. Journeys require Studio open; recording
and standalone minute fades are explicitly unsupported. No release or flash.
Recovery: another session stashed tracked work during release preparation. Recovered
exact snapshot 4896c040 plus all new files into isolated sibling led-pattern-creative,
branch codex/pattern-creative-reviewed, base51a7af3b. Preserve original stashes.
[Implementation and evidence](docs/plans/2026-09-09-pattern-editing-manager.md).

2026-09-05: **FLOW-BLUEPRINT handoff ready** — planning-only integration blueprint
with E01–E14 existing-code ledger, B0–B6 ownership/dependencies and J01–J14
acceptance scenarios. [Plan](docs/plans/2026-09-05-unified-card-journey.md) and
[root handoff](HANDOFF-FRESH-CHAT.md). Source inventory at `0af4b750`; reconcile
with current main before implementation. No product changes or hardware proof
from this planning task. Cheapest capable agents remain the default.

2026-09-05: **JOURNEY-01–09 locally verified; JOURNEY-10 machine setup verified, lights pending** — implemented the approved
[update-to-playback repair](docs/plans/2026-09-05-update-to-playback-repair.md)
on `codex/update-to-playback`, based on production build 1525. Exact card remains
on firmware 1524; no hardware mutation or release is part of this checkpoint.

| ID | Outcome | Area / likely ownership | Status | Focused proof |
| --- | --- | --- | --- | --- |
| PATTERN-EDIT-VIS-001 | Exact native look entering Lab; Live preview native→Mandelbrot→Lotus→Stop; six-minute drift | Same physical hues/order and intended animation/restoration on the configured strip | Local `codex/pattern-creative-workflow`; automated mocks only | needs-eyes |
| WINDOWLESS-001 | Public Studio direct-LNA/local-origin transport, offline repository/PWA, and explicit project continuity | Studio source | done | 1,364 unit assertions + focused Chromium cold-offline pass |
| WINDOWLESS-002 | Card HTTP streaming, owner capability, atomic project storage, and embedded local Studio server | Firmware source | done | 4 focused contracts + generated-bundle PlatformIO pass |
| WINDOWLESS-003 | Card/PWA build targets, encrypted staging, release lanes, and integrated browser/artifact contracts | CI / release / browser tests | done | 8 tooling contracts + Pages staging + production/card builds |
| CONNECTION-001 | Show exact discovered-card identity and installed-versus-current firmware; turn direct-connect failures into evidence-based recovery | Studio source and focused browser contracts | done | 1,371 unit assertions + 29 Chromium connection/install scenarios + production build |
| CONNECTION-002 | Read the installed Lightweaver firmware identity directly and read-only from the USB card application partition | Studio USB installer and focused contracts | done | 19 focused assertions + 7 Chromium installer scenarios + production build |
| CONNECTION-003 | Replace the silent-card dead end with evidence-based network/firmware explanation and a same-tab USB check/update route | Studio connection center and installer plan | done | 15 focused assertions + 30 Chromium connection/install scenarios + production build |
| UPDATE-001 | Preserve Wi-Fi, projects, patterns, wiring, and settings through one USB bootstrap and subsequent signed A/B Wi-Fi updates | Studio, firmware, release tooling | done | Unit 1,392/1,392; Chromium 48/48; firmware 4/4; signed-release 29/29; Vite and PlatformIO builds |
| UPDATE-002 | Acknowledge the verification/restart phase immediately after a preserving USB write reaches the full signed byte count | Studio preserving updater and browser contract | done | 5 USB bootstrap assertions + 8 Chromium preserving-update scenarios + production build |
| UPDATE-003 | Start the first preserving Wi-Fi update with a valid exact-card authority, surface card refusal details, and place the compact update action under the build facts | Studio transport, preserving updater, and focused browser contract | done | Unit 23/23; Chromium 34/34; production build; desktop visual inspection |
| FOOTER-001 | Footer names the same USB-found / bench (`dev`) firmware the Install panel already printed | Studio footer + install screen | done | Unit 12/12; Chromium footer+install 18/18 |
| WIZARD-001 | After factory Wi-Fi save, Studio finds the card on home Wi-Fi and continues without a click | Studio commissioning + card bridge | done | Unit 74/74 flow+bridge; Chromium 8/8 commissioning auto-continue |
| WIRE-001 | Size, reel density, and LED count stay one loop; density is the fixed reel | Studio Layout strip editor | done | Unit 9/9; Chromium 6/6 density-loop; browser 60→1.00 m, 0.50 m→30, 144/m→72 |
| WIRE-002 | LED check lights immediately; Place lights uses counted length at reel density, not 256/0.13 m | Studio Test & Install + discovery layout | done | Unit 12/12 discoveryCommit; Chromium LED-check lights on open; 41 LEDs → countedStripLengthPx(41) |
| INSTALL-001 | Install screen names official firmware once and lets every setup step be opened | Studio installer + commissioning stepper | done | Unit firmware-plan + stage-nav; Chromium 9/9 install-update-plan including free 1–4 navigation |
| SETUP-COUNT-001 | Setup has an LED count field; 256 headroom is not treated as a counted strip | Studio Setup | done | Unit setupJourney 22/22; Chromium setup-led-count + setup-ladder 7/7; live Setup shows empty LED count on phase 2 |
| SETUP-COUNT-002 | Entering the count lights the strip and leaves Finding lights | Studio Setup + card lifecycle | done | Adrian: whole strip white after count+recover; Chromium setup-led-count 2/2 |
| CARD-IA-001 | One Card page owns check + project install; Layout is Wire only; footer is status | Studio Card + Layout + routing | done | Unit 2201/2201 + Vite build; focused Playwright through Tasks 3–7; live preview Card + Layout |
| CI-COST-001 | Stop duplicate advisory PR fan-outs, restore the browser gate to a true smoke check, retain broad coverage weekly/manual, and cap stalled jobs | CI / release policy | done | Policy 18/18; targeted browser gate green; YAML/JSON parse; 30-day audit projects ~65% fewer Test minutes |

## Active ownership

Repair batch integrated; no agents retain active ownership. Final ownership boundaries were:

- Studio agent (balanced model): `lightweaver/src/`, JOURNEY-01–04 and 10.
- Firmware agent: `firmware/lightweaver-controller/src/` and firmware tests, JOURNEY-05–08.
- Primary: `scripts/bench-check*`, `lightweaver/tests/`, integration and this board.

| Owner | IDs | Exact files / boundary | Started | Latest evidence |
| --- | --- | --- | --- | --- |
| None | — | — | — | CI-COST-001 release evidence is tracked in the completed-work table and Git history |

The primary assigns at most three sub-agents. Two active owners must never name
the same file or an inseparable behavior boundary.

## Visual-feedback queue

PATTERN-EDIT-VIS-001: needs-eyes — verify exact native hues entering Lab,
Mandelbrot/Lotus streaming and Stop, then six-minute drift on the configured strip.
Automated transport mocks do not satisfy physical proof.

| ID | Screen or hardware state | What Adrian must observe | Build / fixture | Status |
| --- | --- | --- | --- | --- |
| WINDOWLESS-VIS-001 | Direct Chrome/Edge local-network permission and exact-card control | Permission allow/deny/revoke, no auxiliary tab, correct lights and Stop | Real router + configured card | needs-eyes |
| WINDOWLESS-VIS-002 | Safari/iOS same-tab card-local Studio | Full routine flow on AP without internet, no auxiliary tab | iPhone/iPad + configured card | needs-eyes |
| WINDOWLESS-VIS-003 | Card serves embedded Studio while animating | First/repeated asset loads do not visibly stall animation; recovery page survives incompatibility | Real configured card | needs-eyes |
| UPDATE-VIS-001 | Preserving update in real Chrome/Edge | One USB bootstrap and later Wi-Fi update retain the exact card, project, Wi-Fi, settings, patterns, and visible light behavior | Configured card + real router | needs-eyes |
| UPDATE-VIS-002 | USB update after the full application byte count | Status changes to “Upload complete · checking the saved update,” then advances to restart/reconnect | Card `lw-b0fe81f61b44` + live Studio containing UPDATE-002 | needs-eyes |
| UPDATE-VIS-003 | First preserving Wi-Fi update action and refusal recovery | Compact action appears below build values; first start advances past owner pairing without HTTP 400 | Card `lw-b0fe81f61b44` + Studio containing UPDATE-003 | needs-eyes |
| FOOTER-VIS-001 | Install or update, after Find Connected Card on a bench USB card | Footer reads `Card firmware dev → 1446`, not `Card firmware unknown` | Branch `cursor/footer-knows-usb-firmware`; card `lw-b0fe8f1f61b44` | needs-eyes |
| CARD-IA-VIS-001 | Card Home on `main`, and per-section patterns on a real piece | Card Home: one status, one primary action, reads short enough. AND set the outer ring and inner ring to different patterns, press Install, confirm BOTH stick — that path silently discarded per-section looks from 2026-07-13 until 2026-08-31 | Shipped to `main` 2026-08-31 | needs-eyes |

Visual feedback does not pause independent automated work. The primary returns to
this queue when Adrian is available.

## Bench queue

| ID | Goal | Machine state | Human input still required | Session | Status |
| --- | --- | --- | --- | --- | --- |
| BENCH-001 | Restore and re-verify the GPIO 18 bench card after the destructive factory flash | Firmware 1.1.1 build 1198, boot `boot-0bb7a7d8-b0fe81f61b44`, reachable at `192.168.18.70` and USB; Wi-Fi recovered but card is blank with no project/output | Resolve prior 41-pixel RGB evidence versus frozen 44-pixel GRB job, then observe the lights | Prove session `2026-08-10-windowless-offline-studio` | blocked |
| BENCH-UPDATE-001 | Prove preserving USB bootstrap, signed A/B Wi-Fi update, rollback, and interruption recovery on a configured exact card | Automated implementation and simulated browser contracts are green; no firmware was signed, flashed, or power-cut in this Sprint | Configure a known fixture, preserve before/after hashes and project evidence, then observe USB, OTA, reboot, rollback, power-loss, Stop, and lights | Not started | needs-eyes |
| BENCH-UPDATE-002 | Prove visible phase acknowledgement after the preserving USB application write completes | Card `lw-b0fe81f61b44` successfully restarted on 1.1.5 Build 1239 with station Wi-Fi preserved; local fix changes the silent readback interval to an explicit verification status | After the code fix ships, repeat once and report the first label shown after the byte count completes | `docs/bench-sessions/2026-08-10-lw-b0fe81f61b44-usb-update-feedback.md` | needs-eyes |
| BENCH-UPDATE-003 | Prove the first preserving Wi-Fi update can acquire exact-card authority and begin | Card `lw-b0fe81f61b44` remains healthy on 1.1.5 Build 1239; first Studio authority used forbidden generation 0 and hid the returned error | After UPDATE-003 is live, press one card control, start the compact Wi-Fi update once, and report the first phase or exact visible refusal | `docs/bench-sessions/2026-08-10-lw-b0fe81f61b44-wifi-update-400.md` | needs-eyes |

## Prove readiness

| Scope | Requested explicitly? | Development frozen? | Automated readiness | Hardware readiness | Status |
| --- | --- | --- | --- | --- | --- |
| Full Lightweaver | Yes — `Prove Lightweaver` | Frozen through closed run — `ce1b9b3` / Studio 1224 / firmware 1223 | Incomplete: unchanged exhaustive gate 347/348; two deterministic Pattern Lab checks red | Card `lw-b0fe81f61b44` is blank on build 1198; 41-pixel RGB versus 44-pixel GRB fixture conflict | blocked |

“Ship” does not change this table to authorized. Only the explicit Prove gate in
`docs/workflows/prove.md` does.

## Completed evidence

| ID | Outcome | Evidence | Revision / build | Completed |
| --- | --- | --- | --- | --- |
| CI-COST-001 | Advisory PR fan-outs removed; main/manual browser gate limited to release-critical workflows and strip discovery; former broad suite retained in weekly/manual exhaustive; every Tests job capped at 30 minutes | Policy 18/18; targeted browser gate, offline fallback, preserving update, and workflow/package parse green | Release history and live marker provide final shipment evidence | 2026-09-05 |
| WORKFLOW-001 | Proportional glitch/checkpoint/release workflow shipped | PR #96; live no-store marker | Studio build 1201; firmware release build 1198 | 2026-08-09 |
| WORKFLOW-002 | Inferred Sprint, guided Bench, and explicit Prove system implemented | Seven mode contracts plus resumable Bench/Prove templates | Branch `codex/three-mode-workflow` | 2026-08-09 |
| WINDOWLESS-001–003 | Windowless/offline Studio implemented across public PWA, card-local Studio, firmware, project storage, encrypted handoff, and release tooling | Unit 1,364/1,364; tooling 8/8; firmware 4/4; Chromium offline 1/1; Pages staging; Vite/card/PlatformIO builds | Local commit on `codex/windowless-offline-studio` | 2026-08-10 |
| PROVE-2026-08-10 | Full proof run closed `INCOMPLETE`; live bytes/signature/build graph pass, mandatory exhaustive and physical gates do not | `docs/prove-sessions/2026-08-10-windowless-offline-studio.md` | Studio 1224; firmware 1223; card actual 1198 | 2026-08-10 |
| CONNECTION-001 | Exact USB card identity and installed/current firmware comparison; evidence-based LAN, incompatible-firmware, and USB-loader recovery | Unit 1,371/1,371; Chromium connection 23/23; install/update 6/6; production build | Local Sprint checkpoint | 2026-08-10 |
| CONNECTION-002 | Direct USB application-partition firmware identity read, with strict Lightweaver envelope validation and no settings reads | Real signed v1.1.1/v1.1.3 image contracts; focused 19/19; Chromium 7/7; production build | Local Sprint checkpoint; real-card read remains Bench evidence | 2026-08-10 |
| CONNECTION-003 | No-response state explains that cause is unknown, offers USB firmware check/update, and recommends update when direct semver evidence proves it | Focused 15/15; Chromium connection/install 30/30; production build | Local Sprint checkpoint | 2026-08-10 |
| UPDATE-001 | Preserving firmware updates implemented: old cards get one app-only USB bootstrap; capable cards get signed inactive-slot Wi-Fi updates with exact-card/project correlation, rollback, bounded resume, and separated factory recovery | Unit 1,392/1,392; Chromium 48/48; firmware contracts 4/4; release contracts 29/29; Vite and ESP32-S3 PlatformIO builds | Local Sprint checkpoint; physical preservation and power-loss behavior remain Bench evidence | 2026-08-10 |
| UPDATE-003 | First preserving Wi-Fi update now uses a positive exact-card authority, accepts the exact blank-project head, surfaces the card's structured refusal, and places a quiet right-aligned action beneath the build values | Focused unit 23/23; Chromium preserving/connection 34/34; production build; desktop visual inspection | Local Sprint checkpoint; exact-card update retry remains Bench evidence | 2026-08-10 |

## Update rules

1. The primary adds or changes an entry when work is assigned, integrated,
   blocked, visually observed, or proven.
2. Keep exactly one active owner per file boundary.
3. Move detailed logs into a dated session file and link it; do not grow this
   board into a transcript.
4. Every interrupted Bench or Prove session records one and only one next step.
5. Completed entries name behavior and evidence, not agent activity.


## 2026-09-05 update-to-playback checkpoint

- Branch `codex/update-to-playback`; source based on production Studio 1525.
- Integrated checkpoint: **2258/2258 unit tests and production build passed**.
- Browser: **104/104** across card workspace, install/update plan and preserving update; includes normal AP handoff, blank station setup, retained project/readback, interrupted flow, stale identity and wrong-card cases.
- Firmware: 26 relevant scripts plus actual Wi-Fi storage/parser native test passed; ESP32-S3 build passed. New native test also runs after PlatformIO in CI.
- Diagnostics: six CLI fixtures pass; actual card correctly diagnosed as needing project setup rather than reflashing.
- Actual local preview: paired card `lw-b0fe81f61b44`, footer **1524 ✓**, phase 2 Find and verify lights. No project/firmware/credential mutation.
- **Needs eyes / release Bench:** signed preserving update, saved-network continuity through power cycle, card-page visual check, project restore and two patterns/Stop on the physical lights. No release or flash in this Sprint.
- See [repair evidence](docs/plans/2026-09-05-update-to-playback-repair.md) and [Bench resumption](docs/bench-sessions/2026-09-05-lw-b0fe81f61b44-update-to-playback.md).

## 2026-09-05 visual counting Sprint

COUNT-RULER-001 done locally — compact port confirmation, two color checks,
then direct count entry with orange every 5, red every 10, white every 50.
The ruler repeats through extended ranges; correction, add-strip, resume and
restart pause remain available. Technical text is collapsed into Details.

Evidence: regression red witnessed; 2,260 unit tests, 20 Chromium discovery
cases, production build passed. Browser tests inspect actual outgoing marker
frames. Complete 2,048-pixel-per-port marker test covers output offsets and
255/260/500/1000/2000 boundaries. Desktop and phone screenshots inspected;
count, continue and Stop visible without scrolling. No release or hardware
flash performed. Local preview remains http://127.0.0.1:9212/#screen=discovery.

COUNT-RULER-VIS-001 needs-eyes — observe actual orange/red/white markers and
brightness on the physical strip; automated frame proof cannot verify the
physical hues. Resume: open Count your lights and choose the connected port.

COUNT-RULER-002 done locally — user corrected palette: dim yellow between
markers, orange every 5, red every 10, pink every 50. Supersedes white/50
in COUNT-RULER-001. Focused 25 unit tests and browser outgoing-frame +
desktop/phone flow passed. Physical hues remain needs-eyes; not deployed.

COUNT-RULER-003 done locally — intervening yellow now uses the same channel
intensity as the orange/red markers (3C3C00); removed dim wording. Existing
current limits unchanged. Focused 25 unit tests and outgoing-frame/browser
check pass; phone screen inspected. Not deployed.


SETUP-CONSOLIDATE-001 — local repair, 2026-09-05. Direction stays editable
in Layout; placement advances to phase 4 without a duplicate direction gate.
Open Patterns starts the guarded project install. Removed the separate repeated
LED-check wizard and duplicate count entry; retained final card confirmation.
Added explicit recovery for an unrelated unfinished card candidate.

Bench evidence: lw-b0fe81f61b44 at 192.168.18.70 accepted and booted the
41-LED candidate on GPIO18, GRB, Aurora at brightness115 and approximately
74FPS. No physical observation received within the90-second test; confirmed
automatic restoration of prior known-good discovery setup. Permanent install
and visual playback remain unproven. No firmware flash or deployment.
Resume: Open Patterns in local9212 preview, start the final light test, then
confirm only after Adrian observes the physical strip.
Verification: 2,261 unit tests and production build passed; three focused
browser cases passed (automatic install, unfinished-test recovery, unverified
valid wiring). Actual phase4 screen has one Open Patterns action.
Remaining presentation issue: during card wiring probation, Setup temporarily
shows phase1/Needs attention while the final confirmation controls remain
available. Physical confirmation and permanent installation remain pending.

SETUP-REVISIT-001 — local follow-up, 2026-09-05. All four phase headings
are selectable, including completed setup; viewing an earlier phase retains
evidence-derived progress and never resets the card. Actual preview clicks
1→2→3→4 verified connection options, recount/review, Layout, and final install.
Known exact-card wiring probation now stays on the final confirmation phase.
Expired tests reconcile card state and clear stale confirmation controls.
Physical confirmation remains pending: owner readiness question unanswered;
no new hardware activation, confirmation, flash or deployment in this batch.
Final browser proof: setup phase navigation suite7/7 passed; staged
confirmation→Patterns, expired-test retry, and exact revision acknowledgement
3/3 passed. Existing hardware-operation completion now triggers an exact-card
wiring status reread; test identity says Testing lights and suppresses false
Recover guidance. This resolves the prior probation presentation limitation.
Final integrated checkpoint: 2,262 unit tests and production build passed.

STEP4-HANDOFF-001 — follow-up to the actual blocked card route. Root causes:
Open Patterns stopped at a staged installation behind a second Start light
test action; repeated same-hash clicks did nothing. Final controls were below
the phase rather than inside it. Confirmed readiness also was not published
to the shared link before Patterns could issue its first command.
Repair keeps a stable installation control in phase4 across phase review,
auto-activates each exact staged candidate once for explicit Patterns intent,
and publishes verified readiness before navigation. Bench record:
docs/bench-sessions/2026-09-05-step-four-to-patterns.md.
Verification: final2,262unit tests, production build,8install-flow browser
cases and7setup-ladder cases passed. Immediate pattern command and actual
expired-test Retry through new activation are covered. Local only.
Live repaired OpenPatterns automatically activated41LEDs and put final
confirmation inphase4. Timeout returned an actionableRetry. A real overlapping
operation refresh race was then corrected; overlap+expiry regressions2/2pass.
Visual confirmation is still pending; no permanent install or live pattern
change is claimed. Browser now offersRetry when the owner is ready.


STEP4-PLAYBACK-002 — 2026-09-05, supersedes the pending confirmation above.
Actual final confirmation failed because two background adoption paths could
replace the project while its candidate was testing; one also checked a
nonexistent live lifecycle dirty field. Guarded both paths and use live
lifecycle validation around async installation writes/readbacks.
User already reported the41-LED light test looked correct; carried that exact
confirmation through activation c199aa70f2ad0308. Card now known-good,41LEDs
onGPIO18, playback-ready with no probation. No new visual observation invented.
Patterns polling had silently canceled pending clicks. Same-card evidence
refreshes now preserve the send; real authority changes still invalidate it.
Removed redundant local-card toggle and made playback status acknowledgement-
based. Actual browser Rainbow→Ocean clicks matched independent card status
readbacks (brightness115,26FPS); actual screen inspected.
Resume: click patterns on local9212. No install repeat is required for playback.
Bench detail: docs/bench-sessions/2026-09-05-step-four-to-patterns.md.
Verification:9/9 install-flow browser tests,4/4 focused Patterns tests,
22 focused adoption/resume Node tests, final2,262 unit tests and production
build passed. Local repair only; not deployed.

SHIP-SETUP-003 — release integration2026-09-05. Fixed persistent count feedback,
normalized restored-project binding, interrupted USB-install recovery, coarse
touch targets, and exact old-bridge update guidance. Reconciled retired wizard
regressions with consolidated setup; physical command, rollback and lock
coverage remains in dedicated suites. Initial full release browser run had331
passes before obsolete wizard failures were stopped. Frozen affected/remaining
run passed268/269; last quiet-preview fixture corrected and focused green.
Final2,262 unit tests, production build, Pages staging and artifact verification
passed. Binary freshness awaits protected main signer (expected firmware-source
changes; no local signed artifacts or card flash). PR216 release gates pending.

## 2026-09-06 unified card journey — B0–B1 checkpoint

FLOW-B0 done — baseline `aba1e6f5` (main `2747224f` + handoff docs) in the
isolated worktree branch `claude/lightweaver-audit-refinement-9a5034`. Delta
since the audit snapshot `0af4b750` touched no Studio or firmware source;
`codex/update-to-playback` is already in main (#216). Live Studio is build 1551
against local main count 1560. Full record and the blueprint's H1–H8 holes:
[plan](docs/plans/2026-09-05-unified-card-journey.md) §B0.

FLOW-B1 done locally, commit `f3b760ae` — one shared journey decision. New
`cardJourneyEvidence` store (card id + boot id keyed, single-flight, stale on
hardware-operation end), `setupJourneyInputs.assembleSetupJourney` as the only
evidence→journey mapping, `useSetupJourney` hook. Card Home, the Patterns/
Playlist chip and the shell's task router now decide from the same inputs;
Setup publishes its read so the card is read once. `resumeDestination` is
consumed through `cardReturnIntent` (Setup's completion button returns the
owner to the screen they left, one-use, never automatic). Simulator gained the
firmware's wiring-test lifecycle. Evidence: unit 2282/2282 (20 new, red
witnessed on the active-light-test agreement case); Chromium focused 244/0
unexpected/5 skipped; production build. Screens not yet inspected; no
hardware, flash or deploy.

FLOW-B5 done locally — `tests/journey-continuity.spec.ts` (J02, J02-negative,
J05, J08 ×2, J13) on one simulated card per test, now in `ci:browser-smoke`;
`docs/journeys/acceptance-ledger.md` maps J01–J14 to actual test titles with
per-row status. The suite surfaced three real defects, fixed in `f28d4999`
and scoped in `d4c404a8`: duplicate `/api/control` after a lost reply (read
the card back before any resend; transport failures only), silent replacement
of open work on first card read, and a double tap sending twice.
Checkpoint at `d4c404a8`: unit 2285/2285; Chromium batches 244/0, 259/0,
115+27/0 after the fix, windowless 1/1; production build. Real-card screens
(desktop + phone, read-only, card 1524) agree. Not deployed; no flash.

FLOW-PLAN done — `docs/plans/2026-09-06-unified-card-journey-execution.md`:
ticketed sequel for low-cost models (phases A–E, rules, brief template, B6
separate). Remaining tickets: J01 continuous test, playlist stub → simulator,
full-field read-back, update return-intent, optional-update copy, persistence
and version-skew cases, diagnostic trail, callback cleanup, doc reconciliation,
and the four Bench observations.

## 2026-09-06 autonomous fix run (director: Fable; fixers: Sonnet, Opus only for F2)

Executing docs/plans/2026-09-06-unified-card-journey-execution.md without
Adrian present. Merges land on this branch only; no push, deploy, flash.

Merged so far (all verified by the director's own runs, unit 2289/2289):
- B2 `a2d985b7` — optional-update banner copy is truthful (new pure
  `readyBannerFirmwareCopy`), regression in setup-adopt-card-project.
- B1 `f49c5ffe` — a finished preserving update returns the owner to the
  screen it interrupted (`preserving-update-continue`), regression in
  preserving-firmware-update.
- A3 `c364d777` — `tests/journey-edits.spec.ts` J06/J07 green 6/6 (repeat 3);
  simulator gained `/api/wiring/candidate`.
- A1 `4683cd55` — `tests/journey-j01.spec.ts` `[J01-partial]` 3/3; simulator
  gained beacon port + frame stream. **Found a real defect:** discovery
  passes `{ map }` while `discoveryCommit.js:142` reads `channelMap`, so a
  real discovery never records colour order and Setup can never leave
  "find lights" → ticket F1 (in progress).
- A4 `31355f49` — `tests/journey-ownership.spec.ts`: card swap green 3/3;
  **two-tabs red 3/3 deterministically**: same-wiring pushes from two tabs
  both write `/api/config` with no owner → ticket F2 (in progress, Opus).

In progress: F1 (fix-f1), F2 (fix-f2), C3 diagnostic trail (fix-c3).
Queued: C1 storage limits, A5 playlist stub → simulator, A6 full-field
read-back, C2 version skew, D1 callback cleanup, D2 doc reconciliation.
Physical rows (Phase E) stay pending until Adrian is at the bench.

Progress (same run, later): merged C3 `dc9dc0b3` diagnostic trail; F2
`263a6db0` cross-tab write lease (`cardWriteLease.js`, conflict id
`card-write-owner-conflict`, wiring-test button ids); C1 `661dc08b` quota-
limited saves surfaced + `projectCopyLabel`; C1b `80969642` + C1c `94328f22`
reconstructed card copies labelled "Card copy (partial — no artwork)" end to
end; C2 `82c277f6` freshness prompt deferred during hardware operations,
skew classifier confirmed correct, offline saved-project entry covered; D1
`7ba6599c` two prop callbacks retired (`onLoadOfferChange` kept, justified);
D2 `2a967491` docs reconciled; A5 `914e5337` playlist suite now runs on the
simulator and **found a real defect**: after a recovery reboot the live-
preview transport keeps a stale boot authority and reports "did not answer
in time" → ticket F3 (Opus, in progress). A6 full-field read-back in
progress. Journey specs (continuity, edits, ownership, J01) now run in
`ci:browser-smoke`. Unit 2348/2348 at `ba158c0b`.

Closing: F3 `46e4774f` (card-restarted named, one bounded transport
re-acquire) and A6 `084fd4b3` (full-field read-back, `journey-readback` in
the smoke lane) merged; all fifteen tickets plus five follow-up fixes landed
at `faf55185`. Unit 2361/2361; production build. Six follow-ups recorded
in the execution plan Phase F. Nothing pushed, deployed or flashed; Phase E
physical rows stay pending for Adrian.

Phase F (2026-09-07): F4 `e1ce1d15` J01 end to end (13 clicks); F5+F6
`5bb7b341` redundant-install gate + leased wiring confirm; F7 `6a92e8ff`;
F8 `8e17126a` bare URL routes a returning owner to the overview; F9
`89f1eacb` one transport vocabulary. Checkpoint: 30 suites 458/5/3 with the
three re-seeded fixtures green 126/0 afterwards; unit 2369/2369; build.
Remaining: Phase E bench observations; B6 shipment on instruction.
Final checkpoint at `faf55185`: 30 browser suites 451 expected / 5 skipped /
6 unexpected, all six green in isolation (five were the build number moving
under a mid-run docs commit, one the known contention case); windowless 2/0;
unit 2361/2361; build. Fixer worktrees `fix-*` under `.claude/worktrees` are
merged and safe to remove.

## 2026-09-07 ship status — MERGED, NOT DEPLOYED

PR #224 merged as `7126e7e1` (main commit count 1620 = the Studio build
number once it deploys). The post-merge Tests run (34068720822) failed in
`classify` with GitHub's annotation "The job was not started because recent
account payments have failed or your spending limit needs to be increased",
the same wall the previous three main pushes hit, so Deploy site is skipped
and led.mandalacodes.com still serves build 1551. Unblock: fix Billing &
plans on the GitHub account, then rerun the Tests workflow for `7126e7e1`;
the real deploy follows automatically. Superseded PR #223 closed; branches
swept (restore file `.claude/worktrees/restore-branches-2026-09-07.txt`).
Phase E bench observations remain pending.

## 2026-09-07 Phase E bench run (real card lw-b0fe81f61b44)

E1 patterns A/B/Stop passed. E2 power-cycle reconnect passed. E3 preserving
update 1524 → 1548 passed on the card (slot app1, everything kept) but Studio
stayed "Not connected" until the owner re-paired → F13 in progress; F11
(install screen waits for the link) and F12 (grant probe truthful) fixed and
merged (#227, main `7bcfec2a`, count 1626). E4 could not be run as written:
a LED-count change is a plain save-and-reboot on the firmware, and Studio
called that write "Push failed" with a Retry → F14 open (Studio read-back
after a config restart + simulator mirrors the firmware rule). Card now holds
42 px on a 41-LED strip (harmless; set 41 once F14 lands). Deploy still
blocked by GitHub Actions billing; live is build 1551. Plan Phase G has the
tickets and the corrected E4 script (rewire, not a count).

Closed the same night: F13 merged (#229, an updated card reconnects without
re-pairing) and F14 merged (#230, a count save that restarts the card is
verified by read-back, never "Push failed"). main `fb366c2f`, count 1634;
unit 2384/2384. Open: F15 (pre-existing playlist-footer chip label, fails on
main, outside the PR lane) and the E4 re-run with a rewire. Deploy still
blocked by GitHub Actions billing; live is build 1551.
