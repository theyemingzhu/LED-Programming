# Lightweaver workboard

This is the compact cross-session source of truth. Only the primary agent edits
this file. Sub-agents return results, tests, commits, and blockers to the primary
agent, which integrates the evidence here. Keep entries short; detailed Bench and
Prove records belong in their session folders.

Status values: `queued`, `active`, `needs-eyes`, `blocked`, `done`.

## Sprint queue

2026-09-05: **JOURNEY-01–09 locally verified; JOURNEY-10 machine setup verified, lights pending** — implemented the approved
[update-to-playback repair](docs/plans/2026-09-05-update-to-playback-repair.md)
on `codex/update-to-playback`, based on production build 1525. Exact card remains
on firmware 1524; no hardware mutation or release is part of this checkpoint.

| ID | Outcome | Area / likely ownership | Status | Focused proof |
| --- | --- | --- | --- | --- |
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

## Active ownership

Repair batch integrated; no agents retain active ownership. Final ownership boundaries were:

- Studio agent (balanced model): `lightweaver/src/`, JOURNEY-01–04 and 10.
- Firmware agent: `firmware/lightweaver-controller/src/` and firmware tests, JOURNEY-05–08.
- Primary: `scripts/bench-check*`, `lightweaver/tests/`, integration and this board.

| Owner | IDs | Exact files / boundary | Started | Latest evidence |
| --- | --- | --- | --- | --- |
| None | — | — | — | CARD-IA-001 shipped to `main` 2026-08-31 with six defect fixes; per-section patterns and connect-recovery fixed alongside |

The primary assigns at most three sub-agents. Two active owners must never name
the same file or an inseparable behavior boundary.

## Visual-feedback queue

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
