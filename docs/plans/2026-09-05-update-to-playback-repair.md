# Update to playback: diagnosis and repair plan

Status: implemented and locally verified on `codex/update-to-playback`; release and hardware playback proof remain outstanding.

## What the real card proves

On 2026-09-05, card `lw-b0fe81f61b44` answers at both `lightweaver.local` and `192.168.18.70`. It runs firmware **1.1.31 build 1524**, revision `ca337dada7795c15db88f58154591d399717654b`, boot `boot-44bdf529-b0fe81f61b44`. Public Studio displays **1525**, revision `ef5e1ed966517b3f5b5259a1984c7be0872d7701`; the live release marker agrees.

The firmware installation succeeded. Wi-Fi is configured and connected in station mode, with no pending transition or reported network error; the AP is off. The card is nevertheless factory-blank: empty project ID, no outputs, zero looks, no playable configuration. We cannot establish from this inspection when or how that configuration was erased.

The existing Edge installer showed step 3, promised automatic connection, offered the unavailable AP at `192.168.4.1`, and retained **1446 → 1524** in its footer. A reconnect opened the local bridge page, but this inspection did not achieve Studio acknowledgement. Closing that diagnostic popup may affect that particular retry; it does not explain the initially captured stuck state. Opening the footer subsequently led to setup describing the card as on its setup network, contrary to current API evidence.

See [bench record](../bench-sessions/2026-09-05-lw-b0fe81f61b44-update-to-playback.md) and [redacted API evidence](../bench-sessions/2026-09-05-update-connection-evidence.json).

## Findings and acceptance criteria

| ID | Evidence / problem | Required fix and focused acceptance |
| --- | --- | --- |
| JOURNEY-01 | `src/v3/lw-flash.jsx:914–922,1181–1246` retains preflash USB hardware evidence after installation. Actual footer retained 1446 while the card served 1524. | Invalidate old installation evidence at write completion; show restarting/verifying until fresh exact-card evidence arrives. Every surface then reports 1524. Do not label a write alone as verified success. |
| JOURNEY-02 | `src/components/card/CardCommissioningPanel.jsx:514–517,1187–1196` uses a one-attempt reconnect key and infers Wi-Fi success from AP unreachability. Actual UI remained stuck. | Bounded reconnect attempts, deadlines, cancellation and truthful network states. Feed current exact-card status into the existing commissioning acknowledgement. Blank readiness is already supported at `cardCommissioningFlow.js:424–445`; do not indiscriminately remove readiness checks. Test a failed first attempt, delayed join, changed address, and blank station card. |
| JOURNEY-03 | Reproduced: exact installed/release hash with missing numeric build displays `legacy →1524`, while update classification says `same`. `footerFirmwareStatus.js:88`; `usbFirmwareIdentity.js:22–25,80–87`. | Share consistent identity comparison; a signed exact revision match is current even when USB cannot supply its number. Unknown evidence remains unknown. |
| JOURNEY-04 | Reproduced silent AP observation: configured 20 ms settle waited 183 ms against a 180 ms overall timeout. `cardPostFlashNetwork.js:193–216` only evaluates settle after serial input. Real constants are 3 s / 25 s. | Independent settle timer; silent AP boot completes promptly, continuing station activity remains observable, cleanup and disconnect terminate. |
| JOURNEY-05 | `LightweaverFirmwareUpdate.cpp:658,705` requires command readiness for update grant/preflight. Blank cards fail this despite working Wi-Fi. Boot health also depends on a valid project (`main.cpp:504`, `LightweaverFirmwareBootHealth.h:84`). Code-confirmed; no update mutation attempted. | Define firmware-update readiness independently of playback readiness. Deliberately blank storage may update; corrupt/unreadable storage must remain distinct. Preserve authorization, integrity, rollback and probation guarantees. Test blank, configured and damaged-state eligibility and real preserving update. |
| JOURNEY-06 | Credentials are saved in NVS, but card form has blank password with autocomplete off (`LightweaverWeb.cpp:989`), blank submission replaces password (`LightweaverStorage.cpp:2384–2387`), and re-enter action clears credentials before reboot (`LightweaverWeb.cpp:831–834`). Studio has no credential prefill feature; clean install uses `eraseAll:true`. | Present “Use saved network” and “Change network.” Reusing saved credentials must not reveal them or overwrite them with an empty field. Default configured cards to preserving update. Factory erase remains explicit with a recovery record. Show saved SSID/configured state; do not return passwords through public APIs. Verify preserving update and power-cycle reconnect without password entry. |
| JOURNEY-07 | Card-page bare fetch (`LightweaverWeb.cpp:1138–1139`) is awaited inside a nominally bounded Wi-Fi poll (`1163–1169`). One hung request defeats the loop bound. | Per-request timeout plus total elapsed deadline; retry reads actual network state before resubmitting credentials. Test lost response after a successful save, unreachable card, and recovery. |
| JOURNEY-08 | Card-local build labels use compile-date `d.build`, not `buildNumber` (`LightweaverWeb.cpp:822,1238`). | Display the same numeric build across card setup, Studio and installed firmware evidence. |
| JOURNEY-09 | Executed `node scripts/bench-check.mjs --host 192.168.18.70`: empty but present `projectId` is misdiagnosed as old firmware requiring reflash. The tool prints compile date as version, checks obsolete port 9999, and can call a card usable despite failed firmware/light endpoints. | Diagnose schema absence separately from blank setup; show numeric build and exact card identity; distinguish reachable, update-ready and playback-ready. Never recommend reflash solely because a project is empty. Do not infer Studio availability from an unrelated local server. Add fixtures for blank, configured, incompatible and unreachable cards. |
| JOURNEY-10 | Actual card has no project, outputs or looks. A connection alone cannot produce project playback. | Resume from connection into the existing project/wiring installation flow; read back project identity, revision, outputs and pattern before declaring ready. Show patterns as playable only when supported by installed state. Test pattern A, pattern B, Stop, reconnect and reboot continuity. Physical result requires Adrian's observation. |

Source references are relative to `lightweaver/` for Studio and `firmware/lightweaver-controller/src/` for firmware. Agents checked relevant findings against `origin/main`; current working branch is older (`card-one-action`, build 1476), so repairs must be based on a current isolated checkout rather than resetting this workspace or editing stale files.

## Agent implementation plan

Use three end-to-end owners, with the primary as sole integrator and workboard editor:

1. **Studio agent — JOURNEY-01–04 and browser side of 10.** Own `lightweaver/src/`: installer evidence, postflash observer, commissioning, connection propagation, footer and project continuation; colocated unit tests. This is one stream because these behaviors share connection state. Deliver a demonstrated stale-evidence/reconnect reproduction turned green and the actual screen inspection.
2. **Firmware agent — JOURNEY-05–08 and firmware side of 10.** Own `firmware/lightweaver-controller/src/` and firmware-specific tests. Deliver saved-network semantics, bounded setup requests, accurate build labels and a safe blank-card update contract. Agree wire contracts with Studio before either implementation assumes new fields. Do not split overlapping `main.cpp`/Web/Storage ownership.
3. **Diagnostics/journey agent — JOURNEY-09 and browser integration tests.** Own `scripts/bench-check.mjs`, its tests and dedicated `lightweaver/tests/` journey specs. Start independently with diagnostic fixtures and a production-shaped blank-card scenario; integrate agreed firmware/Studio behavior afterward. No edits to the other owners' source or the workboard. Deliver a test that fails if an updated blank station card is sent back to AP setup or offered another unnecessary flash.

The primary records the current card evidence, integrates one coherent batch, and manages hardware testing. Preserve unrelated working changes. Each owner first adds a focused failing reproduction at the real seam, then the smallest fix. Run one integrated checkpoint, relevant browser journey, firmware contracts and firmware build. Do not invoke the exhaustive Prove workflow for this repair.

## Required end-to-end outcome

Starting with this exact card: recognize installed firmware → reuse saved Wi-Fi → connect → install the intended project/wiring → verify project readback → play two different patterns → Stop → reconnect after power cycle. For an older configured card, add preserving update and verify Wi-Fi/project/settings continuity. For blank or damaged states, offer the state-appropriate safe path with a concrete reason; never silently factory-erase.

No unbounded “Connecting,” “Saving,” or “will continue” state. Each wait ends in verified progress or a specific retry/recovery action. Browser USB selection and operating-system network permissions may still require a user gesture; the application should keep all subsequent steps automatic where supported.

Completion requires real-card evidence, not only mocks. Capture before/after card/build/boot/project identities, configuration and outputs. After the machine checks, ask one physical observation at a time. A shipping request follows the existing merge, signer, deploy and live-proof workflow and names both build numbers.

## Verification and remaining uncertainty

The Studio audit ran 86 focused existing tests successfully and separately reproduced the missing-number footer and silent-serial timing defects. The live bench diagnostic failed as described. No application or firmware implementation was changed, no firmware was flashed, no credentials were changed, and no physical playback was claimed.

The precise transport event that prevented the original Edge handoff remains unisolated; source defects above are actionable but are not a substitute for capturing that event. A local bridge popup displayed Aurora despite the blank API state, while fresh HTTP root returned the setup page; stale page state is possible and needs reproduction before assigning a firmware cause. No broad claim that every possible hardware fault has been discovered is warranted.


## Implementation evidence — 2026-09-05

- Firmware changes compile for ESP32-S3: RAM 201080/327680, application 2170941/6553600. Twenty-six relevant firmware scripts and the additional native test of the actual Wi-Fi parser/storage function passed. New firmware remains unsigned and unflashed.
- Diagnostics: six CLI fixture scenarios pass; the real card now reports “needs setup,” firmware 1.1.31 build 1524, rather than a reflash recommendation. Source-only CI includes these regressions and the three new firmware contracts.
- Initial installer/preserving browser batch: 24/24 passed, including explicit blank update readiness. New setup checks cover unreachable-AP copy and a blank station-card transition. The fixture must include the real `runtimeSource: defaults`; without it, the readiness classifier correctly refuses to assume blank storage.
- Actual local preview screen: pairing the card advances to phase 2, reports current firmware 1524, and directs the owner to find strips/load a project. No config or pattern was installed during this observation.
- Final integrated checkpoint and updated browser regression results are recorded in the workboard when complete.


Final integrated verification: **2258/2258 unit tests**, production Vite build,
**104/104 browser cases**, 26 firmware scripts plus native storage-parser test,
and ESP32-S3 compilation passed. The native parser test runs after PlatformIO
in CI. Physical update/restart/playback checks remain pending; this is a local
checkpoint, not a deployed release.

The balanced Studio workstream handled the bulk fixes; the stronger agent
finished the persistence and timeout seams. Firmware remained with the stronger
agent. Primary integrated diagnostics and browser regression coverage.
