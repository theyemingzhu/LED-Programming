# Lightweaver workboard

This is the compact cross-session source of truth. Only the primary agent edits
this file. Sub-agents return results, tests, commits, and blockers to the primary
agent, which integrates the evidence here. Keep entries short; detailed Bench and
Prove records belong in their session folders.

Status values: `queued`, `active`, `needs-eyes`, `blocked`, `done`.

## Current customer setup — 2026-09-24 (active: project and light setup)

User granted permission to perform the diagnostics/actions needed to finish,
explicitly resolving the pending Windows read-only network inspection exception.
Gallery connection is verified. Priority is actual project/pattern installation
and playback, with the reproduced navigation defect shipping independently.

BREAKTHROUGH 2026-09-24 04:57 Windows time: card2088 joined Pillaroflight,
DHCP192.168.18.22. Root compared working Windows profile with supplied card entry:
one-character credential mismatch. Corrected masked local card form; success
message confirms connected address. No firmware/security/router changes needed.
Never record the credential. Studio subsequently verified exact card
lw-301bd5a172e0 / firmware2088 on gallery192.168.18.22 and reached Step2of3,
Find and verify the lights. Card has no installed project, saved output, or LED
count. Discovery modal opened; no GPIO selected and no physical light proof.
Artwork/output/count clarification pending while independent software work proceeds.
Navigation packet80b0c797 shipped as Studio2111 / firmware2088, PR336,
terminal main697ea205. Manual deploy35997113003 succeeded; strict63-file Studio
and8-file signed-firmware live graph proof passed. Two focused browser tests/build
passed; exact-main broad CI35997069849 in progress at last check. Actual remote
retest blocked by Chrome debugger attachment failure; native pointer fallback
returns noWindowsAvailable. Gallery setup proof above was earned on2109.
Interface agent correcting a separately observed misleading discovery toast:
factory current cap is100mA, not hard-coded1500mA. No power limits change.
Root approvede218bf0c after source/test review and local100mA screenshot;
two focused browser regressions red-to-green and production build passed.
Copy packet mergedPR337 atf7ab6d86; Studio2113 deployed via35997984179,
canonical no-cache marker confirms exact revision/build. Strict63-file Studio
and8-file firmware graph proof passed; firmware remains2088. Browser reconnection requested
asynchronously; artwork/output/count question also remains pending.
Broader2111 CI exposed one stale fresh-install fallback assertion. Test-only
correction PR338 merged61cf006f after focused1/1PASS: actual Wi-Fi-page URL,
USB/SSID retained, no false stage advance, no credential submission. Final
manual deployment35998892107 succeeded, canonical no-cache marker61cf006f,
Studio2115 / signedfirmware2088. Exact clean build/stage passed; strict terminal
63-file Studio /8-file signedfirmware graph proof PASS. Exact-main broad Tests
35998845487 in progress at final check; corrected focused regressionPASS.
No product or firmware source changed in this last merge.
Fresh remote attachment retry still returnsDebugger unattached; no further card
mutations. Resume at Projects after remote reconnection and artwork/output/count
are known; no physical acceptance or customer-ready claim is supported yet.
This supersedes historical handshake/permission blockers below.

Windows successfully joined Pillaroflight using its existing saved profile.
Active properties: WPA2-Personal, 5GHz channel149, DHCP192.168.18.12,
gateway192.168.18.1. Earlier disconnected saved-profile dialog showed WPA3/AES;
that is not evidence of active AP security. Card2088 supports WPA3-SAE/PMF;
exact pinned-stack audit found no proven missing security switch. Root next
tests card setup AP while preserving Ethernet/Tailscale. No credential revealed.
Direct setupAP connection succeeded; Studio HTTP and local bridge verify2088.
Card own HTTP Wi-Fi form scanned Pillaroflight and one controlled supplied-key
submission returned the same security-handshake failure. Router192.168.18.1
identifies HuaweiEG8041V5 and needs admin login (no login attempted). Windows
netsh read-only BSSID scan requires location permission; no permission bypass.
Interface agent fixing reproduced AP Wi-Fi navigation loop: USB fallback returns
installer, connected overview Continue Wi-Fi setup opens verified popover instead
of actual `/?wifiSetup=1` card page. Root reached actual card page separately.

Live Studio2109 / signed firmware2088. Exact main2d95b9ad, manual production
deploy35965227235 and strict63-file Studio/8-file firmware live proof pass;
broad2109 CI35965180922 succeeded;2107 CI35962347124 succeeded.
Actual Interstellar paired COM3 hello proves card lw-301bd5a172e0 runs2088;
USB scan now WORKS and lists Pillaroflight. One actual join returned the card's
generic connection_failed after about20–30s, not a USB timeout. No gallery
connection or light proof yet. Fresh2105 join captured association stage,
driverReason15, card note station association timed out (WPA4-way handshake
timeout per Espressif, not unique evidence of wrong password). USB reconnect
then returned attempt_mismatch again without another credential submission.
Saved-attempt recovery was corrected and proven on2107 as recorded below.

Root approved Studio-only USB pacing70e4c59f and footer USB proof7ca20d76.
Pacing reproduces pinned256B receive-queue overflow (hello fits, scan loses data)
and fixes it with64B writes/20ms gaps;20 focused tests and build pass. Combined
35 units/build and3 recovery browser cases pass after updating the serial mock
to buffer newline-delimited frames. PR331 merged71c80fdf, Studio2101; manual
deploy35959035259 succeeded with strict live graph proof. No firmware/flash/signing.
Packet2aed5b86 merged PR332 and live2103: exposes existing safe failureStage/
driverReason/allowlisted lastError in Connection details;22unit/1browser/build pass.
Firmware USB reason0 can mask association/IP/STA_STOP failures;
do not infer wrong password. Fallback192.168.4.1 and lightweaver.local unreachable;
its retry popup steals focus from USB chooser, reproduced again on2103. Approved
6c8c7610 marks background preserving recovery explicitly and permits only reuse
of already-open same-host popup without navigation/focus; explicit user Connect
unchanged.44focused tests/standard build passed before deployment.
Popup fix now live2105 and proven on actual Interstellar: Install no longer opens
popup; normal COM3 chooser and exact2088 hello work. The2105 form showed
attempt_mismatch after read-only Reconnect following fresh reason15 failure.
Saved-attempt source diagnosis completed; firmware review found
no credential-buffer/config defect explaining handshake15, so no speculative
firmware/security changes. Requested explicit permission for read-only Windows
network properties, an exception to user's public-Studio-only boundary; pending.
UI manager completed the navigation-only fix, live and proven on2107;
false-update service-worker protocol work deferred. No function removals.
Completed Studio-only batch: navigation e39d1daa (11 units/1 browser/build)
and same-session read-only attempt check58efbb7a (3 browser cases/build).
Combined8-file integration passed11 units/2 focused browser cases/build;
PR334 merged b89a013b; manual deploy35962374552/live graph pass. Actual2107
Card overview Continue Wi-Fi setup reaches Install resume; COM3 verifies2088.
One fresh controlled join on2107 again returned driver15/association timeout.
Actual Check current attempt retained the same failure/details without chooser,
USB reconnect or attempt_mismatch. Root left exact2088 USB session open.
No more blind credential retries; Windows read-only permission still pending.
Follow-up: same-session status remains stable after several minutes. Exact2088
source confirms USB scans reject Joining during15s auto-retry, then permit10s
SetupAp gap; current Studio aborts at firstbusy. UI manager owns bounded20s
busy-retry picker fix plus repeated-copy reduction in lw-flash, preserving all
controls/identity guards; no firmware change. Frozen41c44b6a approved (3files;
4focused browser cases,2final timing cases,build,actual local screenshot pass).
PR335 merged2d95b9ad, Studio2109 deployed and strictly proven live. Actual
Interstellar COM3 verifies2088; compactform inspected; ONE scan click returned
Pillaroflight in picker and selecting it populatedSSID. No credentials resent.
Public Studio setup remains blocked by prior WPA handshake15, pending permission
to inspect Windows connection details. No extra cosmetic work queued ahead of
this blocker; no network/security changes or further blind join retries.
Serial reopening can reproduce attempt loss in the
regression model, but has not been proven to reboot this physical card.
Use the supplied credential only in the masked form; never persist it in records.
Remote computer remains wired/Tailscale; no OS network changes or physical button.
Artwork/wiring inputs and physical LED observations remain unverified.
Blocked audit: same pending Windows read-only permission across three consecutive
goal turns. Authorized independent fixes completed and actual picker proven.
Final CI snapshot35965180922: source/cloud/firmware pass, browser still running.
Resume only after permission or new network evidence: inspect Windows Wi-Fi
connection properties read-only, without changing Ethernet, Tailscale or security;
then check that same CI run and continue the actual card journey. Do not claim
gallery join, installed artwork/patterns, physical playback or recovery proven.

Entries below retain historical evidence; this section takes precedence for
current state.

## Current expression integration status — 2026-09-23

**Implementation and release: done. Shipped — Studio build 2048, firmware build
1939.** [PR313](https://github.com/theyemingzhu/LED-Programming/pull/313) merged
as `f039ff8eb9014df19bb7287d2e2ca85d4f2bcbb4`. Credentialed deployment and
independent live verification passed; details are in the release completion entry
below. Lab and Show share editable scenes, ordered steps, named Layout targets,
temporary rehearsal, and verified native-card installation.

**Acceptance: needs-eyes.** Physical mapping, rehearsal restoration, offline
power-cycle playback, edit/reinstall, and unassisted novice use remain unobserved.
On a configured card, create two native cut steps for three named sections, try
and stop rehearsal, install, close Studio and power-cycle, then reopen and edit
one color and reinstall. Repeat with the mandala layout. Do not factory-flash
the card for this check. Watch a first-time user complete the same workflow
without coaching before marking novice acceptance done.

Native delivery supports exact built-in card controls and timed cuts. Richer
transitions, continuous motion across multiple strips, and recorded 4096-pixel
SD playback are outside this delivered slice. The legacy preview preference
fixture remains nonblocking test maintenance, documented in PR313.

Cleanup: no remaining sub-agents or preview/test processes belonging to this
release were found. Removed the disposable local test-run marker. Release logs
and build evidence remain available. Completion notes are committed locally;
no production deployment is needed for this documentation cleanup. Branches,
worktrees, and task history remain available for the pending acceptance checks.

## Sprint queue

### 2026-09-23 Fresh-install USB Wi-Fi (pushed, draft PR315)

Branch `codex/usb-wifi-setup` from main `f039ff8e`; installer summary `e711fd1d`
was not in main and is integrated as `94d74e33`. Exact-card USB setup now has
ephemeral credentials, honest join errors, retry and AP fallback. USB association
leads into the existing station-origin bridge acknowledgement; ordinary reconnect
can no longer replace an active exact-card handoff with a fallback hostname.
Final checkpoint: 2,653 unit tests and production build pass. Full source core
contracts pass; firmware compiles; native production parser/dispatcher and
existing Wi-Fi/persistence contracts pass. Browser: 10/10 new USB flows and
33/33 existing installer/preserving scenarios pass. Desktop, failure, verified
station and 390px screens inspected. Evidence `/tmp/lw-usb-wifi-*.log` and
`/tmp/lightweaver-usb-wifi-*.png`. Feature commit `1845ec97`; original task's
preserving-update refinement `3ec27b8b` integrated cleanly as `3efe0af8`.
Final combined branch: all 43 browser cases and 2,653 unit/build checkpoint pass.
[Draft PR315](https://github.com/theyemingzhu/LED-Programming/pull/315) is reviewable;
not merged, deployed or shipped. Published firmware does not yet include USB
provisioning. Version bump/signing remain release-boundary work.
No merge, signing, deployment or physical flash authorized. Bench observations
remain unperformed; see [USB Wi-Fi setup](docs/usb-wifi-setup.md).
Port 4173 belongs to another active checkout; this task uses its existing
workspace-derived Playwright port 9253 to avoid testing another task's source;
the test server is stopped.

Production-readiness follow-up: initial frozen audit `d6e79db7` closed
INCOMPLETE after finding lost-reply/reload recovery could strand a joined card.
Recovery and firmware version 1.1.40 preparation are committed as `88967d1b`.
Focused proof: 71 Studio units, 11 USB browser cases, a subsequent timeout/reopen
case, firmware compile, 18 native firmware tests, and the production USB
dispatcher recovery contract pass. Main's visible card Wi-Fi guidance is
integrated. The separate shipping task owns
merge, protected signing, deployment, and live proof; this task owns readiness.
The connected card is a configured fixture, not an authorized blank/spare.
Fresh-install physical proof remains unperformed. Current scope is the canonical
`led.mandalacodes.com` origin; custom client domains need separate trust design.

Final source candidate is pushed as `4c1c50a3`, Studio build 2063, firmware source
version 1.1.40. Additional fixes clear a stale failure after successful Wi-Fi
retry, route Change wiring to the actual Specs controls, and remove a React
warning exposed by that route. The preceding frozen candidate passed 2,656
units, 149 project tests, 73 cloud browser cases, 27 mapper tests, 385 browser
regressions, and 68 production cases. Release UI passed 382/384 before exposing
the warning; both failures and both wiring regressions passed on the final fix.
Final build, Pages staging, and exact 63-file build graph verification pass.
Exact final CI passed at Actions run `35835336821`; the shipping task independently
confirmed it and owns the PR315 merge and release sequence.
Published factory freshness still fails until protected signing. Local Prove
remains INCOMPLETE: full post-signer launch, exact live deployment, and physical
blank-card acceptance are still required. Evidence records under
`docs/prove-sessions/2026-09-23-*` retain failed/interrupted runs and retries.

Software release proof completed on signed main
`2463533c80e0ea225f1ef5eeb7fed880bf8c427f`: Studio build 2065, firmware build 2064
(version 1.1.40). Production deploy `35837712629` succeeded. The full terminal
`node scripts/lightweaver-dev.mjs release` passed, including all 384 release UI
cases and signed factory freshness. Strict `PROD_CHECK_REQUIRED=1 npm run
check:prod` passed against the live no-store revision and all 63 Studio files;
the staged and live firmware graphs each passed 8/8 exact-file verification.
Independent public desktop/narrow checks passed wiring and Wi-Fi input access,
local save/reload, and layout inspection. Temporary gate server stopped and
isolated checkout tracked files remained clean. Evidence:
`/tmp/lw-terminal-release-2463533c-*.log` and
`/tmp/lw-terminal-prove-2026-09-23.md`.
Physical fresh-install/card-and-light acceptance remains BLOCKED pending an
identified blank/spare card or verified recovery path and human observation;
the configured fixture was not reset or flashed. Overall Prove is INCOMPLETE
for that physical gate, despite completed software shipment checks.

### 2026-09-23 End-to-end connection and usability (Bench + bounded Sprint, active)

**Current continuation — 2026-09-24:** PR324 is pushed at `aa6b9112`, not
merged or deployed. Exact-head runs35947100240 and35947595514 failed browser
assertions for intentionally revised copy; the second passed all14 fresh USB
Wi-Fi cases but found the stale factory-card heading assertion. Release owner
is correcting that assertion, integrating the reviewed six-line mapper Flash
phone width/wrapping fix, and running the affected browser lane before redispatch.
It owns the sole preview until handoff. Source/firmware/production lanes passed;
no final all-lane success is claimed. Production recovery needs its error-state
visual check; mapper Flash needs390px/desktop proof after the width correction.
Other compact CSS surfaces have rendered proof. The visible Interface Manager
has been reopened for Adrian's screenshot feedback; its separate connection-modal
copy changes remain outside this frozen release.

Final two-file correction is now committed/pushed as `e74ce51c` (branch
build2086); exact-head Tests35948524571 dispatched while local browser smoke
session47051 continues. Earlier local groups passed14 USB Wi-Fi,7 Card/workflow,
and4 HTTPS hardware cases. Neither full local success nor remote CI success is
claimed yet. Parallel dispatch shortens the release path; visual gates still
precede merge. All other source remains frozen.

Local browser smoke now PASS103/103. Production Safe recovery390px focused case
PASS1/1; root viewed `/private/tmp/lightweaver-production-safe-recovery-390.png`
and confirmed readable text and visible Reconnect/Export controls without
clipping. Preview released to visible Interface Manager for only mapper Flash
390px/desktop proof. Remote CI35948524571 independently verified in progress on
exact `e74ce51c0c938840e1efa0293b1da3520262df25`; no merge or deploy yet.

CI35948524571 is now independently confirmed SUCCESS for all selected lanes on
e74ce51c. User then clarified in the visible Interface Manager task that the old
mapper is not their v3 interface and must stop consuming this work. Primary
removed legacy mapper visuals as a release gate and instructed release owner to
restore only `led-art-mapper/app/styles.css` to PR base708ef309, excluding all
legacy cosmetic edits. Studio v3 compact CSS and recovery changes remain. No
legacy source deletion or capability reduction is included. The manager later
returned passing phone/desktop header-containment proof, but that patch is not
being integrated. Legacy retirement stays a separate user-directed follow-up.
Final delta is scope reduction; prior full CI evidence remains tied truthfully
to e74ce51c, with exact merged-main selected checks/sign/deploy/live proof still
required. Proceed to real public Studio/card journey after release.

PR324 is now independently verified MERGED at
`1fa7835ca950d11592d9662988451fae13799ab4`, final reviewed branch
`a1fc97ce0827f64ba68a4cac45092697e3bf2067` (branch build2087). The final
branch commit only restores mapper CSS to base, confirmed by root; mapper build
passes and the cumulative PR has no mapper path. Post-merge Tests, protected
signing, real production deployment and terminal live proof remain outstanding.
This is merged, not deployed or shipped. Actual card remains unupdated.

Exact-main Tests35949487223 on1fa7835c remains active; source/firmware/cloud/
production pass, browser smoke is still running. A bounded preflight caught
the second factory-card old-copy assertion at card-workspace:1778 outside the
103-case CI selection. Corrective draft PR325 is prepared at9a629245 with focused
RED then GREEN proof and no product change; existing behavior guards remain.
Hold its merge until protected signer finishes to avoid invalidating that run,
then integrate the test-only delta and run terminal release proof on exact main.
Logs `/private/tmp/lw-factory-setup-copy-smoke-{red,green}.log`.

Exact-main Tests35949487223 now SUCCESS across all selected lanes on product
merge1fa7835c (main build2088). Protected signer35950179007 has started for that
source. PR325 remains unmerged until signing finishes. Root reviewed its exact
one-assertion diff and authorized release owner to integrate it at that safe
point, then complete final gates/deployment/live proof without another approval.

**Actual remote progress — 2026-09-24 about03:20–03:22UTC:** protected signer
35950179007 and real deploy35950631424 succeeded. Live Studio2089 at4d97d9bc,
signed firmware1.1.44/build2088/source1fa7835c. Interstellar refreshed from2081
through2083 to2089 using only public Studio in Chrome. Normal USB chooser paired
JTAG/serial COM3; new scan freshly proved exact lw-301bd5a172e0, ESP32-S3 16MB,
active signed1.1.42/build2070 and exposed preserving update. Root confirmed the
browser-read card ID (no physical BOOT claim) and started preserving update.
UI reached100%,2.18MB/2.18MB acknowledged, then failed with
`Invalid head of packet (0x45): Possible serial noise or corruption`.
POST-WRITE INSTALLED BUILD IS UNKNOWN; old2070 label is stale, not evidence.
No factory erase or blind repeat was attempted. USB safety owner investigates
readback/reset and existing public runtime-resume route before any further write.

Test-only PR325 merged at23df4503; true commit count2091, correcting earlier2090
estimate. Selected source/browser CI35950871790 passed; real deploy35951613078
succeeded with exact HTTP200/no-store live marker. Deployed Studio2091,
firmware2088. The baseline terminal release gate was deliberately stopped
(session85190, exit130) to free the sole browser server for urgent recovery
regressions. Its partial log `/private/tmp/lw-terminal-1-1-44-23df4503-release.log`
is INCOMPLETE/superseded, never a full pass.
Software evidence is separate from failed actual-card verification. Queued
interrupted scan visibility fix has a witnessed red/green4-case patch at
`/private/tmp/lw-interrupted-usb-scan.patch`, not integrated and not blocking
current hardware diagnosis. A bounded browser recovery correction is being
prepared against the existing signed firmware2088; no new signing cycle.

Actual error source diagnosis:100% means compressed-block ACK, before esptool
flash finish/MD5 and wrapper full SHA readback.0x45 is a non-SLIP first byte
(possibly ASCII E, cause unproven). Runner currently disconnects without app
reset on post-write failure and incorrectly suggests repeating. Saved session
remains `sending`, which existing runtime resume rejects. Bounded browser-only
follow-up is now assigned in isolation: USB owner handles best-effort software
reset, verification-unknown classification and tests; app owner exposes exact
target runtime USB verification from saved sending/unknown session, with no
credential send or reflash and no success until exact fresh card/build/boot
proof. No firmware/protocol change or new signing is authorized for this fix.
Root alone controls Interstellar; current error screen is preserved for recovery.

Primary reviewed the in-progress recovery and caught a real-session blocker:
ROM-only inspection has no previous boot ID. Recovery now accepts that absence
while still requiring fresh exact MAC/hardware and a nonempty runtime boot ID,
signed target version/build ID/build number. If an earlier boot ID exists, it
must differ. Wrong card/hardware cannot authorize app reset or continuation.
Focused regressions are in progress. User explicitly prioritizes actual setup
and working fixes ahead of serial release/signing waits. Queued compact UI and
legacy retirement packets remain outside this urgent correction.

Urgent focused recovery cases passed6/6: legacy saved-sending ROM reset to exact
target hello, same-page error blocks repeat, wrong ROM card, old build, stale
boot, and missing hello. Production build passed. Two older browser expectations
are being aligned with keeping unverified/ineligible outcomes on the preserving
panel. Root review also required a busy guard and suppression of the already-open
confirmation action after failure. Full target hello proves a running target,
not completion of the earlier failed host MD5/SHA readback. Physical card remains
unknown until the corrected public action is live and actually used.

Release-path correction: canonical candidate embedded bundle changed, but the
release owner reread `firmwareBundleOnly`, `build-firmware.yml`, and
`deploy-site.yml` and confirmed Studio-only drift ALREADY supports firmware
tests with signer skipped and direct Studio deploy. Earlier assertion that
new signing was mandatory was incorrect. Primary stopped unnecessary public-only
refactoring and authorized immediate four-file integration through this existing
path, keeping signed firmware2088 artifacts unchanged. Exact actual-session
empty previousBootId/reload recovery passed; all6 new cases and two affected
legacy outcomes pass. No new firmware version or signing cycle is needed.

PR326 merged at41031a3b2bc8c005b83da5bf66d5b6a6dcd482fb, Studio2093.
Exact merged-source Tests35952964709 is live (source/browser/cloud/firmware
test lanes, production/artifact skipped). Redundant manual all-lane run
35952865335 was cancelled: repo policy intentionally uses local PR proof and
one merged-source gate. Firmware VERSION/source/published artifacts are unchanged
from2091, retaining signed2088. Final terminal gate runs concurrently as
session45624, log `/private/tmp/lw-terminal-1-1-44-41031a3b-release.log`, sole local
preview owner. Neither signing nor this long terminal proof may delay testing
the actual public recovery once selected CI and real deployment finish.

2093 exact-main CI failed only J07 in journey-edits.spec.ts:77/78 final journey
cases passed; baseline project.id was undefined before async initial adoption,
then populated after reload. Source/cloud/firmware tests passed.2093 NOT DEPLOYED;
public and actual remote remain2091, card firmware unknown. The terminal gate45624
was deliberately stopped(exit130), partial log INCOMPLETE, preview freed. Root
reviewed the4-line test-only wait for initial persisted ID before baseline;
unchanged id/layout invariants and real confirm path remain. Focused J07 passed
1/1 in8.2s after exact CI red3 retries. Release owner integrates that test-only
correction through one selected main gate; no new terminal gate before actual
card recovery and no firmware signing.

**User-authorized order change:** after6.5h without connection, Adrian explicitly
asked to do the work and prove it afterward rather than wait for GitHub browser
tests. Existing manual Deploy site path supports exact-main publication with
signature/artifact checks and live proof while broader browser proof remains
outstanding. Root authorized source=manual revision72320ad8a2161d89fbed41e7d97345f83c7dbd96,
Studio2095, deploy35954781268. No workflow/security/signature change and no new
firmware signing. Exact2095 source/build passed; browser FAILED only later
preserving-firmware-update.spec.ts:610 strict selector finding2 status elements
(earlier journey78/78 including correctedJ07 passed). Worker wifi_stability_review
owns isolated test-only selector correction; release owner solely deploy/live
proof. Keep main fixed until2095 publish/actual recovery, never call CI green or
overall Shipped until remaining proof completed. Physical card still unknown.

**Actual2095 recovery attempt:** manual deploy35954781268 succeeded with exact
no-store marker72320ad8/Studio2095 and signed firmware2088 unchanged. Root
refreshed public Studio on Interstellar, observed "Not verified after USB
transfer" + "Check running firmware over USB", selected paired COM3 via normal
Chrome chooser. Recovery ended with "The card did not answer over USB in time"
and result remains unknown. No firmware/credential resend, erase, BOOT press,
remote shell or direct private API was used. Current screen Needs attention,
firmwareunknown/latest2088, Studio2095. CUA click+AX batching sometimes timed out;
fresh screenshots showed whether actions dispatched, individual clicks worked.
JS owner investigates single hello3s after reset vs boot timing; firmware owner
independently checks startup/reset/USB transport. PR328 isolated selector fix
6b1c0458 (focused1/1) remains open/unmerged. Main stays2095 during diagnosis.

Firmware read-only review found plausible startup race: USB115200/CDC enabled,
but hello reader starts in loop only after max2sSerialwait+200ms+storage/AP/output
setup; reset helper waits700ms. No evidence yet of actual boot success/failure.
Bounded recovery-only JS fix809c5e69 in /private/tmp/lw-usb-hello-retry now retries
read-only hello on same freshly MAC-verified port within shared12s open budget,
new IDs per request, wrong identity immediate reject, old responses ignored.
Busy button says Checking card. Root reviewed/accepted;18unit/7browser/build
pass. Release owner authorized integrate with PR328 selector fix and MANUAL
exact-main deploy immediately, no generic browser gate wait/new signing.
If actual retry still fails, public Studio has no serial boot-log reader;
existing technician Log is operation-only and Flash must not be used as a
diagnostic. No extra reflash/credential writes authorized by a timeout alone.

**2026-09-24 current recovery checkpoint:** Deployed Studio build 2097,
signed firmware build 2088 (1.1.44), exact main
`c1a9bbd2d6bb97fe3d21d74f724c3b5bd5d7db93`. PR329 includes bounded hello
retries and the PR328 selector correction; manual deploy35956003864 succeeded,
and the release owner verified the strict no-store marker. Broad Tests35955977794
continues independently; not a hardware proof. The actual card remains UNKNOWN
after the 2095 hello timeout. Interstellar video froze, then the original CRD tab
went blank; a fresh tab to the same authorized session now shows Connecting.
No 2097 hardware recovery has run. Resume with public Studio refresh and paired
COM3 Check running firmware over USB; require exact target hello before setup.
While remote access recovers, approved the prepared compact UI/password toggle/
shorter guidance batch6f2fc43d for integration on2097, preserving all USB recovery
behavior. Focused local verification and manual deploy precede broad CI per
Adrian's explicit requested order. No new firmware, signing or flash in UI batch.

**UI checkpoint deployed:** PR330 merged as
`4165985d7704ad07ee9dac4189cf98fa54d53a31`, Studio build2099; signed firmware
build2088 unchanged. Manual deploy35957088116 succeeded and independent no-store
marker matches exact main2099. Combined52 focused units,16 Chromium cases and
build passed; all10 intended source/test files integrated without conflict.
Compact controls, password Show/Hide and collapsible Wi-Fi guidance preserve all
actions and2097 recovery. Live staged-file graph verification remains pending.
CRD recovery tab941833385 and original941833116 (Chrome browser2 after runtime
reset) still show blank content; fresh tab briefly reached Connecting. Browser
control attachment times out, native Chrome remains responsive. Host-list page
also blank, so host availability is unverified. Asked Adrian whether his visible
screen shows desktop/blank/error; independent software work continued. No actual
card recovery2097/2099 attempted. Goal remains incomplete, not client-ready.

Independent2099 live proof completed: clean detached4165985d build/staging plus
`PROD_CHECK_REQUIRED=1 npm run check:prod` passed all63 deployed Studio files,
strict no-store release marker, signed firmware image and production/cache/auth
probes. Logs `/private/tmp/lw-studio-2099-{build,stage,strict-prod}.log`.
Prior2097 Tests35955977794 finished SUCCESS. Current2099 Tests35957062442 has
source/cloud/firmware/classify PASS; browser smoke remains running. No full local
terminal gate restarted. Revalidated remote session still blank on2026-09-24;
read-only USB check and subsequent actual-artwork acceptance remain unperformed.

**Actual card progress, 2026-09-24:** Interstellar recovered. Public Studio2099
Resume Wi-Fi setup with USB + paired COM3 returned exact target2088 runtime hello
and opened Connect updated card to Wi-Fi. This proves the target app runs; it does
not retroactively prove the failed host flash readback. Card network still
unverified. Scan timed out; Retry USB setup immediately verified the same runtime.
Entered intended SSID and user-supplied password only in masked public setup form;
Join Wi-Fi over USB also timed out. Retrying without credential resend returned
attempt_mismatch. No additional firmware write, erase, physical button or OS
network change. Password excluded from records.

Concrete transport defect found by Sol investigator: pinned ESP32-S3 HWCDC RX
queue defaults256 bytes and drops excess burst bytes; firmware consumes256 per
loop, with no RX-buffer enlargement. Hello about109B fits, authenticated setup
commands315–330B or longer do not reliably fit. Assigned Studio-only paced64B
chunks with overflow regression, original deadlines, stopped writes on timeout,
and no credential resend. Separate footer regression proves preserving USB hello
was omitted from firmware evidence bus; fix labels USB verification without LAN
Connected claim. Combine focused fixes, manually deploy, then retry actual card.
Exact2099 Tests35957062442 completed SUCCESS; independent63-file live proof PASS.

Next-batch UI manager has isolated commits94367df1 (compact actions/modal) and
97a7dd3b (USB Wi-Fi Show/Hide) on codex/v3-compact-actions in worktrees/v3-compact-actions/led.
Show/Hide focused red/green and3 impacted browser/privacy/narrow checks pass,
provisioning Node15/15/build pass;390px screenshot inspected by manager. No
push/deploy; full spec deferred while2093 gate owns preview. These changes must
not delay actual recovery and must be merged against updated lw-flash carefully.

Fresh remote screenshot confirms Studio2081, Not connected, interrupted Step2,
and the old card window's static “Connection active” text. No remote mutation,
card update, project transfer, or physical light proof was performed. Next
machine step: finish PR324 release/live proof, then refresh public Studio on
Interstellar and resume the exact-card preserving USB journey. Artwork/wiring
and private credential entry remain unresolved inputs; do not guess them.

Source-verified retry sequence: interrupted Step2 → Connect card → Find connected
card opens the normal browser chooser and runs signed identity/partition/OTA
reads (serial reset may temporarily stop the setup AP). Only fresh exact-card
and active2070 proof can expose Update once over USB; Start preserving update
is the first app flash mutation. Resume with USB instead expects the interrupted
target build already installed and will not update an old2070 card. Reconnect
over Wi-Fi is only the normal LAN/card-page connection handler, no USB/flash or
credential send. These are source facts, not yet actual-card verification.

**Latest state — 2026-09-24:** Studio build2083 is DEPLOYED at708ef309 via
real deploy35941330276; no-store marker verified. Signed firmware build2074
remains published. Final2083 release gate FAILED386/387 on restoration fixture
ordering; focused unchanged case passes, fixture stabilization is in progress.
NOT SHIPPED. Actual card remains build2070 until proven updated. Latest remote
Studio was2081, disconnected; Windows radio On but not associated with card AP.
Automatic approval review rejected AP Connect and later USB reconnect/inspect;
no retry or alternate access was attempted. Do not bypass rejected actions.

Public customer entry is ONLY https://led.mandalacodes.com. All source, builds,
tests and deployment work occur on this Mac. Remote desktop is customer UI and
normal browser permission dialogs only: no remote shell, DevTools, direct card
HTTP diagnostics, or private owner/Project Library login. User cannot physically
press the card. No physical confirmation may be fabricated.

Visible screenshot task **Lightweaver Interface Manager** is open at
`01a0d108-67fc-7c90-a77e-c4ce74074bc2`, isolated checkout35f3; it coordinates
screenshots with root, which remains sole integrator. Compact Card Home routing,
paired Wi-Fi wording and setup guidance are under focused verification, preserving
recovery capabilities/history. Independent local read-only USB research targets
signed2070 identity parser drift and a truthful remote preserving-update path.
No update, project transfer, playback or physical light proof has occurred.
Earlier chronological access instructions below are superseded by this boundary.

**Current coherent browser batch (active):** Card Home Update opens preserving
update instead of stale Wi-Fi step; paired Wi-Fi wording; blank-card Continue
setup with retained secondary checks and history; clear interrupted recovery
USB/LAN hierarchy; truthful USB exact-device consent distinct from Wi-Fi BOOT
authorization. Studio builder owns source/UI tests. Release owner stabilized
restore fixture ordering before the final valid-card event; focused case passes.
USB researcher owns only identity library/tests: installed2070 signed app hash
`a2c68e32af9534b5947560faf5d0f4c1b85a6a39cf78fc9a140c017510b793fd`
verified against signed historical ticket; old parser fails actual binary layout.
Approved exact signed-image recognition with bounded progress/cancel, preserving
legacy behavior and every bootstrap safety guard. USB protocol is unchanged; the bridge-copy correction is included below.
One integrated checkpoint/release after this batch; no cosmetic-only release now.

USB safety library packet is locally verified (48 focused tests): signed2070
full app and source partition hashes plus stable app0 OTA-selector evidence are
required before reporting current firmware. Bootstrap rechecks selector bytes
immediately before writing. Higher-sequence NEW/PENDING/unknown selectors cannot
fall back to older app0; app1/ambiguous/mutated evidence rejects writes. Scanner
and bootstrap limit serial packet inactivity to5s and restore loader settings;
UI must discard/release failed inspections. Total time can still exceed nominal
scan budget while packets continue arriving; this is not a hard wall-clock abort.
UI wiring and post-preserving-update USB Wi-Fi continuation remain in progress.

Tentative canonical build proved embedded card Studio bytes changed, so this is
now a firmware-sensitive release batch. Release owner will bump1.1.43→1.1.44 once
at final freeze, then compile/contracts/sign/deploy/live proof. One firmware-owner
copy fix is integrated: card bridge window says “Keep this card window open while
using Studio,” no false Connection active claim. Focused blank-card surface check
passes. Independent compact-button CSS from visible manager35f3 has been applied locally
(eight disjoint CSS files). Its final integrated visual gate remains pending and
must not delay the critical actual-card recovery release.

Preserving USB Wi-Fi continuation: distinct context reuses exact card/build/boot
USB hello and checks explicit fresh-install eligibility; it does not run destructive
completeCardInstall. Credential-free attempt record is bound to the same saved
USB update session (32 focused library tests pass). New continuation browser
checks4/4 pass: join, ineligible hello, wrong card, reload without credential resend.
Scanner failure/unproven browser checks3/3 pass. Final app source is FROZEN: final focused browser8/8, route/setup43/43,
production build and diff check pass. Bounded integration review closed after
fixing eligibility-before-reconciliation (a successful join makes NEW provisioning
ineligible; saved exact attempt must still be recoverable without another send).
Desktop/narrow app visuals pass. Visible manager now owns sole preview for the
eight CSS files' remaining integrated visual gate; source changes require a real
failure. Release owner then owns final canonical/version1.1.44 boundary, checkpoint,
CI/PR/merge/signer/deploy/strict live proof. Source is uncommitted, not deployed;
actual public/physical state remains unchanged.

Release checkpoint: VERSION1.1.44 and version policy pass. Integrated checkpoint
passes2681/2681 units plus production build; log
`/private/tmp/lw-1-1-44-integrated-checkpoint.log`. Final canonical embedded bundle
SHA `1ed1fd396bce2b4fe89e3d38bb01920d00dd743f177426f463b0adfdbaab1471`
(size846142) differs the signed baseline, confirming firmware/signing lane.
Visible manager owns final integrated CSS visual gate; release owner is authorized
to commit/push/PR and execute the existing release chain when that gate passes.
No repeated checkpoint unless source changes.

Committed and pushed `69bf1f1ac69e97fff223404e6688615ae01e2401` (branch build2084),
36 intended product/version/test files. [Draft PR324](https://github.com/theyemingzhu/LED-Programming/pull/324)
is attached and mergeable; exact-head Tests run35947100240 is independently
confirmed IN_PROGRESS at that SHA. Manual dispatch selected source, browser,
cloud, production, and firmware jobs. Final CSS visuals are pending; no merge,
signing, deploy or hardware write yet. Root workboard and untracked evidence docs
are intentionally excluded from this product commit.

Asked the user which artwork/project and verified wiring plan to use: remote
Untitled Project is empty. This missing setup input does not block code fixes,
but must not be replaced by guessed geometry, pixel count, or GPIO pins.

User authorizes autonomous live Interstellar control, focused fixes, compact UI,
and shipment. Primary manages/integrates; Sol builders own source. Sole real
machine operator: interstellar_bench_control. Detailed evidence belongs in
`docs/bench-sessions/2026-09-23-configured-card-wifi-handshake.md` (untracked).

**Remote-only constraint:** user explicitly cannot reach or press buttons on the
card. Never request BOOT/control press or falsely confirm it. Private owner
sign-in was explicitly rejected as a customer path and is abandoned. Earlier
physical-button and owner-login suggestions are withdrawn. Physical visual
output cannot be assumed from remote telemetry; report the exact proof available.

**Actual card:** lw-301bd5a172e0, firmware2070/v1.1.42. Temporary Windows 2.4GHz
WPA2 hotspot proved exact-card station join and DHCP. Hotspot is OFF and its saved
settings unchanged. Windows subsequently joined saved Pillaroflight on actual
2.4GHz/channel4/WPA2-Personal/802.11n using supported temporary Preferred Band;
no password read or re-entry, cipher not exposed. Original No Preference restored;
Windows rejoined card AP and exact HTTP confirmed the same bf1a24d5 boot/build2070,
blank network/project. Gallery join remains unresolved; a strong picker signal and
reason15 handshake failure do not prove a wrong password or router cipher cause.
Temporary test settings were cleared with a guarded Wi-Fi-only reset, preserving
project/pattern data. Card has an empty project and no saved Wi-Fi credentials.

A subsequent Studio USB inspection left the card in ROM loader when entering
Step3. Supported 'Restart card for Wi-Fi connection' recovered runtime/AP.
Latest exact HTTP: boot-bf1a24d5-301bd5a172e0, build2070, setup-ap active,
configured=false, empty SSID/project. Windows rejoined Lightweaver-72E0;
192.168.4.1 shows Pillaroflight selected/password blank. Ethernet/Tailscale intact.
No firmware flash or project write occurred. Do not repeat old Studio's broken
USB→Step3 path before release. No physical LED proof has been observed.

**Credential boundary:** auto-review REJECTED saved Windows password extraction
before execution because specific user consent is required. No secret was read
or exposed. Explicit local-only reuse question remains pending; no indirect
extraction or workaround. Gallery completion needs that consent or direct entry.

**Software:** branch codex/bench-connection-recovery, PR319, source821ab0f0,
build2072/version1.1.43. Compact Studio/card controls, persistent status observation,
lost-response explicit retry, and AP-client recovery protection passed focused
regressions, ESP32-S3 compile and desktop/narrow visuals. Integrated checkpoint:
2,657 units + build pass. Exact-head Tests35877641611 passed before follow-up.

**Integrated actual-journey follow-up:** Studio owner studio_reconnect_authority
fixed USB release before Step3, pending-Find navigation, stale saved-origin remount,
and stale-link acknowledgement using exact-card session/fresh bridge authority.
An introduced effect feedback loop was caught in mocked-browser testing and fixed;
never claim its ~1,100 open attempts/sec were observed in production. Corrected
popup fixture records blocked attempts. Four focused browser cases + 60 flow units
pass, including valid handoff with one automatic open. Closed WindowProxy handling
now uses live hasCardBridge(); impacted browser cases2/2 and bridge contract pass.
Final bounded review CLOSED with no remaining P1/P2. Source frozen, eight owned
product files (including card-bridge-handoff.mjs), committed/pushed as6ff4c703.
Exact-head Tests35883573522 passed. PR319 MERGED at6074a6d90d90434a8eacbf8ffaf6d06f0deeedaf,
source build2074. Exact-main Tests35884865279 and protected signer35886059681
PASSED. Signed terminal main e2823075f47157cf8bb55216733d308c548760d9 has Studio2075;
signed firmware1.1.43/build2074/buildId6074a6d9. Exact signed deploy35886846166
PASSED; independent no-cache markers confirm those exact live revisions/builds.
Deployed, NOT YET SHIPPED. Initial terminal gate stopped at ai-pattern-server.mjs
empty JSON; focused escalated check passed, sandboxed reproduction showed listen
EPERM. Failure log retained. Controlled retry passed 2,659 units and preceding
browser lanes, then was intentionally stopped at 108/387 final release UI cases
to integrate the actual-card blocker below. Exit130 is interruption, not failure;
278 cases remain unrun. Owned port9483 preview stopped. Final terminal gate/live
graph proof must run against the corrected final revision. Keep workboard and
untracked Bench/Prove records out of product commits.

Single next step: fix and verify the factory-card preserving-update entry on
branch codex/factory-card-preserving-update (base e2823075), then ship the coherent
browser correction and resume the supported preserving update. Firmware2074
remains unchanged. Sole operator requires fresh identity/config preflight,
signed artifacts, and no erase/project writes.
Actual Studio2075 Step3 USB release PASSED: AP returned on new boot
boot-8cca7dee-301bd5a172e0, still firmware2070, same empty config/project. Settled
USB firmware scan showed Unknown, so destructive install was avoided. Explicit
Connection details host192.168.4.1 + card-page fallback now shows connection active
and Studio 'Found — pair'. Exact fresh factory status reports commandReady=false
but firmwareUpdateReady=true and network update capability version1. Studio
incorrectly hides preserving update behind ordinary command readiness. Owner
studio_reconnect_authority fixes the narrow factory exception and acquires fresh
existing connectCardTransport authority on Start, pinned to host/card/boot/build;
wifi_stability_review reviews. Bridge identity alone cannot authorize direct OTA.
Four-file browser packet is frozen and bounded review passed with no P1/P2.
Focused planner units21/21, browser3/3 including existing F40 behavior, and narrow
direct-failure1/1 pass; desktop and 390x844 fallback visual inspected without
horizontal overflow. release_readiness owns checkpoint, integration and final
shipment proof. Checkpoint2,661 units + production build passed. Product commit
0b371b02 merged through PR320 as dbd164e7ecc5efd757a92ece33d68117f2050e77
(Studio2077). Exact-main Tests35892355577 PASSED; real deploy35893490668 PASSED.
Independent no-cache canonical marker confirms exact dbd164e7/Studio2077 and
signed firmware1.1.43/build2074/buildId6074a6d9. DEPLOYED, not yet SHIPPED:
sole terminal gate runs detached at dbd164e7; strict staged/live graph proof
pending. Operator now retries supported preserving update on actual card,
starting from recorded boot8cca/build2070/blank config. No factory erase or USB
Unknown override is authorized. Actual2077 retry remains BLOCKED before writes:
Card overview says Found — pair / Card release Unknown, though HTTP confirms
installed build2070. No Pair action is visible. Root cause: working-card setup
guidance in nextCardConnectionAction shadows found-unpaired's existing pairing
action; Continue only opens the card page, leaving card/readiness absent. The
factory OTA selector correctly rejects that state. wifi_stability_review now
acts as app owner for the narrow action-order correction and actual-state
regression; no selector relaxation. Release owner stops obsolete full gate with
partial evidence retained, prepares follow-up branch at2077. Operator stops
safely with AP/bridge intact pending corrected build. No physical update.
Follow-up branch codex/factory-card-pairing-recovery is based on dbd164e7.
Narrow pairing precedence fix: unit regression witnessed red then green33/33;
Chromium actual-state journey Found — pair → Connect → persisted exact card →
preserving Update Lightweaver panel passed1/1. Existing pairing freshly checks
card/host/lifecycle; selector/firmware/USB unchanged. Root approved frozen
three-file packet for release. Checkpoint2,662 units + build passed. Product
e40d9531 merged via PR321 as f81b635448ea814e6b3daa486f71cfe8835accf2
(Studio2079); exact-main Tests35894982943 PASSED. Real deploy35896122188 PASSED;
independent no-cache marker confirms exact f81b6354/Studio2079, signed firmware
unchanged1.1.43/build2074/buildId6074a6d9. DEPLOYED, not yet SHIPPED. Sole terminal
gate running detached f81b6354, log
`/private/tmp/lw-terminal-1-1-43-f81b6354-release.log`; strict graph proof pending.
Actual2079 retry still no physical update: exact HTTP boot8cca/build2070/APactive,
blank Wi-Fi/project. Studio settled Needs attention → Update this Lightweaver
card / Update card, overview installed release Unknown. Auto-review rejected
explicit card-page fallback click twice, including fresh screenshot retry,
citing unverifiable target/current dialog/update prerequisites. No workaround;
root asked specific approval for the visible fallback connect at192.168.4.1.
No reply yet. Operator stopped mutations with AP/bridge intact. Reviewer performs
read-only diagnosis of real factory pairing/readiness state; no new source edits.
Read-only Card Home → Advanced → Connection log obtained safely. Actual2079:
17:36:09 connecting(15s),17:36:24 disconnected/no-answer(5s),17:36:29
disconnected/identity-missing. Earlier17:12:33 found-unpaired/evidence-fresh.
Log visible in Innerstellar CRD tab941833116; source reviewer traces that precise
event order. No new writes. Final gate continues independently, no failure yet;
groups73/38/11/3/6/45/116 passed, active127 at99/127 at last report. Physical
firmware stays2070. Source maps15s no-answer then5s retry to bridge status:
applyAuthoritativeBridgeStatus emits identity-missing when persisted pairing is
absent, even with valid card status. This can misleadingly offer firmware Update.
Live absent-pairing remains unproven, but the independent source defect is clear.
Root authorized narrow browser correction: valid current full status without
pairing stays discovered/unpaired and requires explicit Connect; invalid/stale/
wrong identity rejected, no implicit pairing/control/update. Acting app owner
wifi_stability_review must witness regression red/green before release owner
stops superseded2079 gate or ships follow-up. No firmware change. Frozen two-file
bridge packet on codex/bridge-unpaired-recovery passed107/107 focused tests;
actual postMessage retry regression red→green, explicit Pair revalidates/persists,
stable factory status opens preserving eligibility, malformed/unsupported replies
remain rejected. Root reviewed/approved full-identity/contract/boot/current-bridge
guards and no auto-pair/authority grant. Release owner integrates.
Superseded2079 gate stopped exit130 after2,662 units and247/387 release UI cases
passed (1 interrupted,139 unrun); port9483 closed, partial log retained.
PR322 (two bridge files) MERGED as69369d07fce778bffda4a0b7adc365aecc72f668,
Studio2081. Checkpoint2,664 units + production build passed. Exact-main
Tests35899150736 PASSED. Real deploy35900287957 PASSED. Independent no-cache
canonical marker confirms69369d07/Studio2081 and signed firmware1.1.43/build2074/
buildId6074a6d9. DEPLOYED, not yet SHIPPED; final gate/strict graphs pending.
isolated final checkout at69369d07 now running sole final gate:
`/private/tmp/lw-terminal-1-1-43-69369d07-release.log`. Durable release resume
state: `/private/tmp/lw-final-release-2081-state.md`. All selected main lanes green.
Operator must not use a different route to bypass rejected fallback connection;
actual retry awaits pending specific approval. Usage meter100%, ordinaryUsageAllowed=true;
continue while allowed, no reset credit used/authorized. Actual card2070/unupdated.
User subsequently restored usage (tool reports0%) and requested status. Recovered
final log:2664 units and all earlier browser lanes passed; releaseUI386/387 passed,
one failure screen-smoke.spec.ts:1096 expects old Finish card setup instead of
reviewed Pair this Lightweaver card. Gate exited1 before build/stage/strict graphs.
Acting app owner wifi_stability_review corrects only proven stale assertion,
retaining no-silent-pair safety checks; correction frozen with focused red→green
and6/6related browser cases. Root approved; release_readiness coordinates final
test-only integration and required proof. No production source/firmware change.
User then reported remote Studio2079/firmware2074 and asked whether we were
watching/working. Clarified published2081 is not confirmed loaded in remote app.
Fresh read-only operator check: Connection log/Needs attention; last event
identity-missing17:36:29; card-page bridge Connection active. Sharing banner
obscures build labels, so user2079 reading matches last independently verified
remote version. No reconnect performed; pending approval unchanged. Root then
authorized independent public Studio refresh only to verify loaded build after
user's version concern; no Connect/Pair/fallback/update/card write. This is not
a workaround for the rejected connection action; operator stops if refresh itself
is rejected. Final test-only PR323 merged708ef309cf20eb7ae649e86e9cb4b0fcf9e49657,
Studio2083. Exact-main Tests35940568813 source passed/browser running. Sole final
gate clean detached708ef309 log `/private/tmp/lw-terminal-1-1-43-708ef309-release.log`;
durable state `/private/tmp/lw-final-release-2083-state.md`.
Operator's safe public-app-only refresh succeeded: beforevisibleStudio2079,
aftervisibleStudio2081/Not connected/Card firmware unknown · latest2074. Card-page
PWA remains Connection active. No Connect/Pair/fallback/update/network/USB action.
Final2083 first local gate hit known sandbox listenEPERM in ai-pattern-server;
source/CI unaffected. Release owner performs one escalated environment-correct
rerun with first failure log retained, no source patch.
User clarified explicit goal: use remote desktop end-to-end for a nontechnical
client from opening Studio through art configuration/pattern loading and actual
art playback, preserving function and fixing observed usability defects with
primarily Sol agents. Root created active goal (no token budget). This is Bench
plus bounded fixes, not exhaustive Prove. Operator renewed for supported
reconnect/Pair/preserving update, then read-only inventory of existing projects/
artwork/LED settings; no arbitrary pin/count/default project writes. Exact public
2083 marker708ef309 verified, signed firmware1.1.43/build2074 unchanged. Final
software proof continues independently; physical outcomes must be observed.
Actual breakthrough after renewed authorization: supported fallback → Found—pair →
explicit Connect succeeded on visibleStudio2081. CardHome now Connected, installed
2070→target2074, Needs project; project Untitled Project not installed, Outputs
None yet, Lights Not counted, RGB not confirmed, artwork Not drawn. No cardwrite.
Observed next blockers: Update card CTA resumes persisted Step3 galleryWiFi
instead preserving update; Still to do says Connect to your card / Finish WiFi
despite Connected on setup AP; blank-card Health/Recover lights wording confusing.
Operator truthfully confirms onLightweaver72E0, doesnotguessgallerypassword or
writearbitraryproject/pins/counts. wifi_stability_review owns source diagnosis/
supportedroute guidance and coherent UXfixbatch; release2083 proof continues.
Supported Step2 Install safely does expose exact preserving Update Lightweaver:
installed1.1.42/2070 → signed1.1.43/2074, exactcard lw-301bd5a172e0, keepssettings.
Update preflight requires truthful BOOT/control confirmation or owner software
authorization. Operator opened supported owner sign-in; Cloudflare Access
Lightweaver Project Library has empty Email/Send login code, no session. Root
asked owner email or brief actual button press; no answer yet, checkbox untouched.
No flash. Operator independently inventories existing projects/artwork/patterns/
LED settings, without arbitrary defaults. Gallery password extraction remains
separately unapproved.
Approved bounded UX batch on codex/card-home-update-intent (base708ef309): Card
release Update CTA explicit intent selects Step2 only, ordinary resume unchanged;
active configure-wifi task label becomes Set up card Wi-Fi; verified blank card
Health uses normal setup wording/compact Continue setup instead of guaranteed-
failing Verify/Recover actions. Configured recovery/authority guards unchanged.
Acting app owner wifi_stability_review builds focused tests + desktop/narrow
visuals. Baseline2083 gate continues to completion in isolated checkout.
Superseded2077 gate interrupted exit130 after
earlier lanes passed and10/116 of active browser lane, log retained; port9483
closed. Account99% weekly used; do not consume reset credits without consent.
Manual dispatch35891796789 failed conservatively at firmware publishability
because event.before was absent; do not call it passed. Repository policy uses
local PR evidence plus exact merged-source main gate. Signed firmware2074 stays
unchanged. Physical OTA still unproven.
Operator found no direct Connect action in Finish card setup; Continue only
produces Found — pair, with no permission prompt. Direct fetch remains untested,
not failed. Historical stale
station flow caused another retarget before that correction; source cause beyond
old flow timing remains unproven, no follow-up source edit. Gallery password step
remains separately blocked; no completed physical update or end-to-end gallery
connection may yet be claimed.

### 2026-09-23 Live Wi-Fi handshake diagnosis (Bench, active)

User screenshot and fresh Windows-side reads at 12:19 UTC confirm the actual card
now runs firmware1.1.42/build2070, with a new boot and matching prior card identity.
This was owner-installed, not flashed by this task. Setup AP is active; no station
IP; latest observed failureStage=association, failureReason=handshake_incomplete,
driverReason=15 (four-way security handshake timeout), attemptCount4/generation2.
Screenshot's earlier generic failure may differ from later retry status; the card
page stops polling after 67.5s while firmware retries continue. User privately
verified Show password matches exactly and cannot access router security settings.
Password source path has no trimming/case change for valid nonempty input. No
root cause is proven; do not blame password or router from reason15 alone.
User confirms Windows has Tailscale and direct wired connection. Sol performs
bounded read-only adapter/routing/security-metadata diagnosis; no network changes,
card writes, profile keys/password reads, reset or flash. Prior Windows nearby
query lacked target metadata; verifying query validity and safe metadata fallback.
Windows routes verified: direct card AP Wi-Fi, separate wired gateway and Tailscale;
no overlap explains card-level handshake failure. The earlier netsh target-not-seen
result was invalid: command exited1 due to Windows Location permission denial.
Saved target profile metadata says WPA3-Personal/GCMP-256 (historical, not current
BSSID proof). Pinned ESP32-S3 SDK explicitly disables CONFIG_ESP_WIFI_GCMP_SUPPORT;
WPA3 SAE itself is enabled. Cipher compatibility is a concrete hypothesis, not a
proven live cause. Windows read-only WinRT checks confirm hotspot is Off and supports
2.4GHz/WPA2 over the wired profile. A concrete temporary hotspot test is prepared:
stage while Off, submit temporary credentials to exact card before switching the
PC Wi-Fi radio, enable hotspot, identify WinRT client and verify exact card status;
do not acknowledge handoff, stop hotspot within five minutes, reconnect setup AP,
owner restores original gallery password. It overwrites saved card Wi-Fi details;
The later autonomous-control instruction authorizes this bounded diagnostic with
the now-confirmed populated original form as recovery. Operator owns execution;
Historical plan above is superseded by the end-to-end entry: hotspot join/DHCP
passed, restoration form was lost, and Wi-Fi-only cleanup is being verified.
Fresh Windows UI reports WPA2-Personal on 5GHz/channel149; this does not prove
the card's 2.4GHz security mode, and weakens the historical GCMP hypothesis.
Gallery root cause remains unproven; no SDK migration is justified by this test.

### 2026-09-23 Wi-Fi diagnostics and picker stability (software shipped)

Adrian approved implementing a more stable setup flow after the explanation of
the existing network picker and ambiguous association timeout. Primary remains
manager and sole integrator. Sol/high owns firmware attempt/phase/reason design,
implementation and card-page picker in firmware source/tests. Studio Sol owns
bounded USB picker/pre-entry and setup guidance in Studio source/tests, preserving
exact-card authority. Release Sol prepares the integration branch and later runs
one coherent checkpoint; no overlapping source owners. Designs return before
edits so retry, stale-event and success semantics are explicit. Preserve existing
interfaces and secrets; no hardware writes, factory erase or network changes.
Target: useful verified implementation in 20–30 minutes before release work.
Branch `codex/wifi-stability-diagnostics` starts at exact signed main `356a979d`.
Approved firmware design keeps submission generation authority, fences deliberate
station stops before new attempts, distinguishes association from address wait,
preserves real reasons across retries, and clears failures on new credentials or
verified success. Driver reasons remain observations, never a guaranteed password
diagnosis. Existing status fields remain; diagnostics are optional additions.
Studio clarification is complete: relevant USB browser suite 13/13 and actual
desktop/narrow visuals pass, without protocol/authority changes. Initial firmware
policy red/green and ESP32-S3 compile pass; firmware final visual/race checks remain.
Firmware seven focused contracts/native behavior and generated 1440/390 card-page
visuals pass. Independent Sol/high review found two bounded edges, both fixed with
red/green regressions: stale Rescan responses/poll chains and stale failure stage
on a new accepted USB attempt/stop timeout. Reviewer verified fixes and reports no
remaining P1/P2 findings. New diagnostics harness is wired into core CI. Final
ESP32-S3 compile and seven firmware checks pass. The one integrated checkpoint
passed all 2,657 units and production build; no skips/failures. At the 20-minute review,
both implementations were working; remaining work was bounded integration proof.
Release preparation is authorized under Adrian's standing instruction to ship
completed work: version 1.1.42, one product commit and ready PR, exact-branch CI,
then manager merge decision and protected signer/deploy/terminal release proof.
PR318 (14 product/version/test files) merged after exact-branch Tests35852871330
passed. Merge `64b1f5da6725d472d54e59cfa8352c8b0bf864d9`, source build2070;
main Tests35853914460 passed. Protected signer35854844095 passed, producing
terminal `317c9071714a296a6c366c11b19738f2f4df16c9`: Studio build2071,
firmware1.1.42/build2070/source64b1f5da. **Shipped — Studio build2071,
firmware build2070.** Real deploy35855430297 succeeded. Full terminal release
gate passed in 27m20s: 2,657 units, 911 browser cases, new native diagnostics,
build/staging and signed factory freshness. Strict required production check
passed exact terminal main, all 63 Studio files and staged/live firmware graphs
(8 files each). Independent public desktop/narrow visuals passed, including new
network guidance and local project save/reload. Detached release checkout clean;
owned test server9392 stopped. Evidence `/tmp/lw-terminal-1-1-42-release-evidence.md`.
Single resumption step: restore the exact physical card connection, use the normal
owner-authorized preserving updater, then observe real join/retry behavior.
Physical ESP32 event timing, AP continuity and DHCP behavior remain Bench
evidence, not inferred from host tests; no real card has been updated.

### 2026-09-23 Windows card Wi-Fi feedback (Bench, pending card access)

Adrian's real card page on the Windows machine reports firmware build 1939,
while the screenshot shows Studio build 2065. The last successful read-only
status confirmed saved credentials and an association timeout, with no station
address. A later SSH check failed before status; current join state is unknown.
This older AP path exposes no authentication-specific reason, so the
password has not been proven wrong. This is not the Mac's configured fixture.
No card was reset or flashed and no network settings were changed.

Branch `codex/card-wifi-feedback` starts from signed main `2463533c`. The bounded
follow-up adds card-page Show/Hide password, waits for confirmed card Wi-Fi join
before instructing a computer network switch, and offers explicit reconnect
through existing exact-card verification. Narrow setup-panel clipping is fixed.
Checkpoint: 2,657 units and production build pass; focused firmware contract,
ESP32-S3 compile, 58 flow units, three related browser cases and desktop/narrow
visual inspections pass. PR317 merged as `a28685f6`; protected signer produced
terminal `356a979d46e1df92d02be4346482a32da49c9bd4`. Real deployment 35847230523
succeeded. **Shipped — Studio build 2068, firmware build 2067 (1.1.41).**
Full terminal release gate passed in 27m29s: 2,657 units and 911 browser cases.
Strict required production check passed, with all 63 Studio files and staged/live
firmware graphs (8 files each) verified against exact terminal main `356a979d`.
Independent public desktop/narrow browser acceptance passed. Isolated checkout
is clean and its owned test server stopped. Evidence:
`/tmp/lw-terminal-1-1-41-release-evidence.md`. New firmware is not installed on
the observed card; physical acceptance and its current join state remain unproven.
This task owns the follow-up release; the prior shipping task is closed.
Single resumption step: restore the exact Windows card connection, then use the
normal owner-authorized application-only preserving updater after fresh preflight.
Physical BOOT/control availability was asked; answer pending. No update writes
or authorization bypasses are permitted while that normal authorization is absent.
The signed public 1.1.41 application-only package passed the official manifest,
ticket/signature and image-hash verifier. It is compatible with the previously
observed API/schema/updater versions, subject to fresh live preflight. A single
later Windows read reached the computer but not the card status endpoints; restore
the exact card route before any update. No further connection polling is active.

### 2026-09-23 Card Wi-Fi handoff clarity (done locally)
After joining the Lightweaver hotspot, Studio now gives three short setup steps
and opens the card's visible Wi-Fi form in its tracked tab. The local IP and
browser “Not secure” label are explained below the action. Eight focused browser
cases passed; the revised step was inspected at desktop width. This is a local
Sprint fix, with no firmware or deployment change.

2026-09-20: **FIRST-ACTION-MANAGER on current main** — auto-detect arrivals,
one first action, Lights stay a door. Pattern Lab already on origin/main;
this stream does not rewind it. Ledger:
[docs/journeys/first-action-manager.md](docs/journeys/first-action-manager.md).
Walk 7/7 + J01 proved on this branch against current Card Home.

### 2026-09-18 Task-tree management (active)
Primary task `01a0b4e5-e6cd-7392-abab-2a844e015792` owns the LED task tree.
Completed leaves are archived only after integration or explicit supersession.
The prior paused release heartbeat is now the active, quiet task-tree heartbeat.
Current live baseline: origin/main `9b6975c1`, Studio build 1940, firmware build
1939 (v1.1.39). Only open release leaf: playlist refinement task
`01a0b385-561a-7813-8110-de275dd26dd6`, Sol/medium, integrating verified local
commit `6a6777ff` onto current main and returning a PR-ready branch. Primary owns
merge, deployment, live proof, workboard state, and final task closure.

### 2026-09-18 Compact strip inspector (shipped)
Approved compact inspector implemented on codex/compact-strip-inspector:
inline values/units, counts-only division fields, and selected-strip facts in
Specs. Integrated de885d4d, preserving connected families, calibrated SVG counts,
and sticky headers. Real Studio inspected; evidence docs/ux/compact-inspector/.
Verification: 2,548 unit tests; production build; 61/63 focused browser checks,
then both failures corrected and green (2/2): relocated first-light active style
and updated connected-child GPIO selector. Final production rebuild passed.
No firmware or card changes. Integrated through PR297 and shipped; subsequently
superseded by the fully proven Studio build 1940 release. Task archived.

### 2026-09-18 Public worker readiness (shipped)
User explicitly requested another managed task: workers must complete the workflow
from led.mandalacodes.com without developer/local project files. Audit as fresh
worker, fix concrete self-contained-site gaps, test onboarding/assets/project
access/SVG layout/counts/splits/patterns/save-reopen/card handoff, and distinguish
public proof from local/hardware proof. Current root remains sole director.
Routing: public worker readiness implementation | gpt-5.6-sol / high | end-to-end
browser/assets/persistence diagnosis, bounded to worker URL workflow | fresh
browser evidence + focused regression per fix | return cross-boundary decisions.
Create tool must use configured default per tool rule; initial task is standby,
then send_message selects Sol/high with the actual assignment before work starts.
Active task01a0b25c-cef7-79f0-adff-d84049fc8092, Sol/high assignment sent and
active progress verified. Initial placeholder01a0b24f-a920-7350-955c-1aecd93cfa24
archived unused (task-list summary cache hid it; session index resolved id).
Worker must isolate from exact013bc63e, covering count-first and connected editor.
Director remains here. Release candidate returns to director before merge/deploy.
Completed through PR298. Novice setup is USB-first; captive-portal hostnames are
rejected and the card/Studio Wi-Fi handoff is explicit. Tests, signed firmware,
credentialed deployment and strict live graph/binary proof passed. Shipped:
Studio build 1940, firmware build 1939 (v1.1.39). The photographed build-1912
card still requires one physical USB update; no card was flashed here. Task
archived after live proof. Cost unknown.


### 2026-09-18 Connected section editor (shipped)
Manager playbook v6; approved direction 1. Parent strip remains visible with a
segmented bar and child sections. Add/move/remove splits, select/rename/edit
pattern, explicit count correction, parent GPIO plus section override. Boundary
edits conserve the parent total; actual count correction changes total/scale.
Keep current flat strips as runtime/pattern targets; additive browser-only family
metadata preserves original path and sibling identities through save/undo. Never
infer old split families from names. Stable IDs/look assignments survive boundary
edits; merge retains chosen section look with visible explanation. Re-slice original
geometry to avoid cumulative approximation. Reject locked/multi-run/stale geometry
operations rather than silently overwriting unrelated edits. No firmware/deploy.
Dispatch: connected editor implementation | gpt-5.6-sol / high | bounded but
interacting geometry, history and identity invariants need sustained reasoning |
focused pure regressions + working UI | return unresolved identity/geometry risk.
Dispatch: connected editor browser acceptance | gpt-5.6-terra / medium | independent
black-box test/screen ownership | boundaries, count correction, merge, undo/reload,
GPIO and section selection on desktop/phone | return behavior or usability gap.
Primary owns decisions/integration/board. Workers own src and tests respectively.
Cost unknown. Completed: parent/compact children editor first; exact or dragged
boundaries conserve total; count correction changes total/scale; canonical pattern
and parent/child GPIO; merge; persistent family/undo. Original path retained;
unrelated advanced wiring runs/seams remain unchanged. Both split entry points
create connected sections. Keyboard boundary commit supported.
Evidence: integrated 2,546/2,546 units + production build; focused helpers9/9;
final browser7/7 (new3 + legacy split4). Desktop/phone inspected, parent header
clears sticky installation bar. Screens /tmp/lightweaver-connected-editor/.
Integrated through PR297 and shipped. Later Studio build 1940 live proof includes
the change. No card writes were performed. Task archived.


### 2026-09-18 SVG count-first layout (shipped)
Manager skill + playbook v6 loaded; this board is the job record. Scope: imported
layers selectable as LED paths, existing output assignment and splitting usable,
exact per-layer or whole-layout counts drive physical scale without distorting
artwork proportions. Browser only; no release or card writes authorized.
Director contract: retain SVG coordinates; resize physical interpretation via
pxPerMm. Whole total distributes integer counts proportionally with exact sum;
per-path edits preserve other counts and recompute total/scale. Reject invalid or
unrepresentable totals. Preserve source attribution after split, count overrides,
undo and project round-trip. Reuse existing wiring and pattern-section contracts.
Dispatch: Studio implementation | gpt-5.6-sol / medium | bounded feature across
existing Layout components; worker owns lightweaver/src only | focused unit red/
green and UI integration | return ambiguous persistence/geometry contract.
Dispatch: browser acceptance | gpt-5.6-terra / medium | independent black-box
SVG workflow tests in lightweaver/tests only | import/count/split/output/reload
regressions, actual screen after integration | return missing affordance/contract.
Primary owns integration and board. Cost unknown.
Done locally: named imported strips; exact total allocation and individual count
calibration; SVG coordinates unchanged; GPIO/split/undo/reload preserved. Legacy
imports supported; explicit unchanged counts pinned; rejected edits keep state.
Final evidence: 2,537/2,537 unit tests, production build, three new SVG browser
cases plus three existing count/split checks pass. Desktop and phone inspected.
Browser coverage commit f49b3ec2; implementation integrated in following commit.
Integrated through PR297 and shipped. Later Studio build 1940 live proof includes
the change. No hardware writes were performed. Task archived.


### 2026-09-16 Managed completion (shipped)
PR296 merged and shipped as Studio build 1913 / firmware build 1912 (v1.1.38),
then superseded by later proven releases. Exhaustive run 35043560719 and strict
production graph/firmware proof passed. Completed workers were archived. Physical
4,096-pixel throughput/playback/restart/hue proof remains a Bench observation;
no card was flashed.
Mobile fixture repair cd48fb59 integrated: wait for project autosave identity
before reload; reopen controls after phone resize. Exact recovery assertions kept.
Worker: focused mobile10/10, desktop6/6, mobile6/6. Resume remaining mobile,
production, unit, release UI and build/stage/verify with HEAD fixed.
Log:/tmp/lightweaver-managed-release-final.log; exit in corresponding .exit.

Release resume166aa167 passed desktop regression groups then failed1/41mobile
checks: pattern-lab-creative-flow.spec73 unkept color edit reload, line80.
Same pixel task Sol/medium assigned focused recovery diagnosis/repair.
Live remains Studio1888/published firmware1819; PR296 draft, unmerged.

Compatibility regression repaired08520baa→9dfbb3cb: authoring guard blocked
validated simplification recovery. Only simplify now enabled; mutations stay
disabled. Focused red→green,6browser+46unit,actual screen verified by worker.
Resume release from ci:browser-regression through production/unit/releaseUI/
build/stage/verify; prior source/cloud/mapper/packaging gates passed unchanged.
Logs:/tmp/lightweaver-managed-release-resume.log and.exit. Keep HEAD fixed.

Combined launch:source at dbb3b000 stopped on pattern-lab-compatibility.spec45
(Create simplified variant missing),114 adjacent passes. Same pixel task
Sol/medium owns bounded diagnosis/repair; source immutability/target authority
must stay enforced. Full gate will resume after focused red/green; no shipment.

V3 complete:bbad9841+6d0c58ab integrated; native recipe readback omission fixed.
4096 real cubic18spans/1519B/173ticks, mixed24spans/1609B/187ticks.
Worker proof:2532unit+build,70focused units,9browser,18native incl all65536
elapsed phases,shared fixtures,ESP32 RAM68.3%/flash33.7%; actual screens seen.
Authored geometry unchanged;<=1RGB bound is pre-output-calibration only.
Final combined launch:source starts here; signed-artifact freshness proof follows
protected signer at terminal main. No physical card was flashed or observed.

Director decision: approve explicitly versioned bounded-affine runtime derivative
under original<=1 RGB renderer parity; authored geometry stays unchanged.
194Q0.16 circular phase ticks bound max-depth0.42/channel255 error to0.99599.
Measured4096 cubic18spans/1512B, mixed23spans/1585B. Preserve exactv1/v2;
new format requires explicit capability. No persistence migration. Same allotted
Sol/medium implements/validates; retain legacy configs and readback without
repeated approximation. New question only returns to director if numerical
proof, geometry, storage or rollback boundary fails. Real FPS remains unproven.

4096 implementation7fc8974a integrated for combined validation; source proof:
2528unit+build,10browser,15native,shared fixtures,ESP32 RAM68.3%/flash33.7%.
Important limitation: real4096 cubic SVG rejects (>64 exact affine spans).
Do not treat straight-only result as unconditional artwork acceptance. Same
allotted task Sol/high now performs bounded read-only assessment: exact codec
versus existing-repository phase artifact, and bounded rendered-channel error
within original1RGB tolerance. Stop at measured recommendation; director decides
contract, then medium implementation. No storage migration authorized by inference.

Required installation count confirmed by Adrian:4,096 physical pixels.
Acceptance includes full save/install/readback, exact physical phase, and
honest geometry limits; real hardware throughput remains an observed gate.
Manager Playbook v6 / Build a scoped feature recipe v5; Adrian authorizes
continuing allotted tasks through completion and shipment. One director here.
Pixel expansion: task01a0a737-fa0f-76f1-ba52-29673578f64a exists in83d2;
interrupted, not absent. Resume preserved work with gpt-5.6-sol / medium:
finish existing bounded lossless-span contract, verify1024/4096 real-browser
paths, units/shared native fixtures/compile; return specific architecture gaps.
Release gate repair: existing UI task01a09d6c-3b60-7f41-87b7-ee32822acc2c,
gpt-5.6-sol / medium; diagnose three exact browser failures from35031272027,
preserve actual readback/latest-preview/no-config-write behavior. Distinct tree
and test-only ownership independent of pixel firmware/compiler.
Release-gate repair complete:0d8f868e integrated as4f748858. Main run had380
passes/3 failures; all three were stale owner/fixture/selector assumptions.
Worker red→3green +9 repeated +4 adjacent passed. Primary integrated3/3 pass
(8.8s), preserving same-card readback/latest-preview/no-config-write checks.
No product-source changes; UI repair task safe to archive. No extra frontier
workers. Primary owns integration, release, workboard. Cost unknown.

### 2026-09-16 Release cleanup (shipped; blocker resolved)
User authorized reviewing LED tasks and pushing/merging completed work, closing
completed tasks, and reporting remaining blockers. Source base origin/main
18479a01, live Studio1888 / published firmware1819 (1.1.37).
Integrated division count40e96624, artwork Lab69eed773, native journeysd9fcc031
and29374eaa on codex/september-release-cleanup. Selected-section authority is
retained; native journeys stay whole-piece/capability gated. Firmware1.1.38
prepared for the protected signer. Combined checkpoint2511 units+build passed.
Pushed as draft PR296. Combined42 browser tests, firmware-sensitive contracts,
native13 tests/shared samples and ESP32 compile passed (68.3% RAM,33.6% flash).
Adrian requires more than256 physical pixels; capped Color Journeys must not
merge. Separate capacity-expansion task queued from this integrated branch.
Local broad release UI diagnosis stopped when capacity became a prerequisite;
partial passes are not a full gate. Release remains pending: latest exhaustive
main check was cancelled; fresh
exact-main run35031272027 started. No hardware commands or flashes authorized
by this cleanup; physical journey continuity/restart/hue remain needs-eyes.
Four completed tasks archived: Improve pattern lab workflow, LED control
architecture redesign, LED strip multi-pattern management, Verify Checks-panel
transport forwarding on live HTTPS card. Their physical follow-ups remain here.
Original root checkout's dirty product files match recovered4896c040 already
contained in main; three other tracked differences are generated/review dates.
Recovery checkout, stashes and archive refs preserved. Old round2 F41 branches
are explicitly superseded/decision-pending in TODO.md, not ready-to-merge work.

### 2026-09-15 Layout release (shipped)
User authorizes going live. Primary owns exact revision release and live proof.
Sol medium owns bounded diagnosis of existing exhaustive Patterns regression
at1509: stale test exercised direct transport instead of pending bridge.
Existing bridge helper now establishes intended transport; focused and adjacent
checks pass, plus5 repeat passes. No production transport change. Prior main
exhaustive run34799265254 failed. PR295 holds the release. Core/project checks
and71 cloud browser checks passed; continuing remaining launch stages after
installing missing pinned mapper dependencies. Studio-only bundle exception
permits direct site deploy and keeps firmware unchanged.

### 2026-09-14 Layout specifications (done locally)
Move wire plan/build information out of the default layout inspector into an
on-demand Specs surface with reduced inset and full available width. Keep
functional hardware/build controls reachable and meaningful errors available.
Owner: Sol medium, bounded UI relocation and focused regressions; routine UI
work requires no frontier worker. Primary verified desktop/390px phone and
Escape focus return; production build passed. Resumed after interrupted
verification with Sol medium assigned only the remaining stale test repairs.
Four Specs/build-summary tests passed on resumption. No deployment or hardware
actions. All three isolated wiring/checklist repairs passed (8.3s); reserved
address behavior remains explicitly checked. Seven focused checks passed on
resumption. Prior related suites supplied the remaining regression evidence.
Ready locally; deployment remains a separate release step.

### 2026-09-14 LED visibility (done locally)
Larger outlined LED dots remain screen-sized at Fit and 17% zoom; selected
strip ribbon uses muted paint blue-gray. Divided-section colors and geometry
are preserved. Sol medium handled the bounded canvas fix; primary integrated.
Focused regression witnessed red (1.291px radius) then green. Six existing
selection/identity browser tests passed. Primary inspected the actual 17%
preview and confirmed clear dots across all four sections. No deployment or
hardware changes.


### 2026-09-14 Layout interface typography (done locally)

User wants Illustrator-like editor chrome: compact interface labels/buttons,
consistent sans-serif typography, no always-visible explanatory paragraphs.
Sol medium owns bounded Layout presentation changes; reason: routine UI/CSS
implementation, no card protocol or state-machine changes. Primary owns combined
screen review and checkpoint. Scope: Layout idle install action/help, strip
caption presentation, inspector typography; active warnings/confirmations stay
reachable and legible. No release or hardware commands authorized.
Implemented compact Install on card +on-demand info for both change types;
removed permanent strip captions; UI sans labels/normal casing/tracking, tabular
numeric values, matching canvas label typography. Card handlers/state unchanged.
Regression red witnessed on old install copy. Combined browser:53/53 pass;
unit2484/2484 +production build pass. Desktop and390px phone screens inspected.
One Sol-medium worker, primary integrated review. Resumption: review local4173;
not pushed/deployed.


### 2026-09-14 Layout clarity — managed Sprint (done locally)

Manager recipe: Build a scoped feature v1; Manager Playbook v2. Baseline
`1b7ce23a` (origin/main at start). Scope: on-demand Divide, distinct canvas
section colors, compact Strip-number labels, cleaner inspector, consolidated
wiring/reference disclosures. Preserve geometry, LED totals, custom names,
persistence and card contracts. User asked for separate tasks; three isolated
implementation tasks running:
- Compact editor: `01a09d6d-d6d8-7641-a1da-5b8d559264cb`.
- Canvas identity: `01a09d6d-d6d5-7c91-81f5-2557a75801df`.
- Wiring panels: `01a09d6d-d6d5-7c91-81f5-253cce521f7d`.
Each owns distinct files; canvas owner additionally handles generated names in
useLayoutState/discoveryCommit and selection-visibility compatibility.
Initial dispatch incorrectly used host default: Astra medium for all three tasks.
User corrected routing: manager must select appropriate economical workers.
Remaining canvas task explicitly switched to Sol medium; further bounded fixes
use Sol medium. Astra remains manager/integrator. Measured cost unavailable.
Primary integrates, reviews and runs one checkpoint and real-screen inspection.
Pending user preferences: wiring consolidation vs hiding; local preview vs release.
Default endpoint is verified local preview; no release/hardware authorization yet.
Acceptance: 41→11/10/10/10, four visible colors/names, collapsed Divide after action,
no overlapping labels at17%/fit, useful wiring functions reachable, desktop/mobile
no overflow, relevant focused browser tests and unit/build checkpoint pass.
Integrated commits: 5ecbb14d +265b3a59 (wiring), b802d013 (inspector),
f27fd2d2 +c94f6628 (canvas/identity +single selection). Generated project-title
names divide to Strip1..N; custom names retained. Division preserves41 LEDs,
validates proposed wiring before mutation, and one Undo restores the source.
Numeric color normalization prevents duplicate amber after restoration.
Actual combined desktop17% and390px phone screens inspected. Divider closes,
first strip remains editable, no automatic Group/Combine panel, compact colored
labels have no leader lines/duplicate badge. Build summary retains order/power.
Checkpoint:2484/2484 unit tests +production build passed; final hook-only
selection follow-up built successfully. Integrated browser evidence:66 passing cases before final selection follow-up;
52/52 final batch passed, including9 repeated division cases (109 unique total).
The interrupted first batch was resumed by remaining suites plus affected tests;
no browser failures remain. Final production build passed.
Manager routing repair persisted in job-manager SKILL.md, Playbookv3, build
recipev2 and guidev2; skill validator passed. Follow-up actual model verified:
Sol medium. Initial three Astra-medium dispatches were a manager mistake.
No deployment, signing, card commands or flashing. User shipping preference
unanswered; verified local preview remains the endpoint.
Resumption: review http://localhost:4173/#screen=layout; release only on explicit
shipping instruction. UI batch is committed locally, not pushed/deployed.



2026-09-09 color-picker follow-up: Adrian reports choosing pure red while strip
looks fuchsia/behind. Reproduced journey-phase cause: editing a stop retained the
current fade time (red→violet at90s yielded RGB147,56,147). Picker edits now seek
the edited stop's start, preserving playing/paused state and saved hold/fade timing.
Actual emitted-frame browser regression confirms pure-red bytes after editing a
noncurrent stop;11 focused browser scenarios + production build passed. User's
physical recheck remains unobserved; no channel-order/firmware changes.

2026-09-09 follow-up: compact desktop Lab actions, preserved mobile44px targets;
actual screen inspected. Fixed imported-look color pipeline: Lab now applies
Patterns hue/saturation/Drift/Breathe exactly once and preserves the source palette.
Checkpoint2,466/2,466 units + build;13 focused browser checks passed. Native and
streamed output share RGB decode/calibration in installed firmware f25430dc.
Adrian's physical Rosewater journey hue mismatch is NOT yet resolved/proven:
project gamma is off, no channel-order mutation found, card direct read timed out.
Pending observation: physical strip hue when Lab preview is pink/red. Do not
claim that imported-look modifier repair proves this separate journey symptom.

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

2026-09-10: **PATTERN-COLOR-LIVE-001 implemented locally** — Patterns now sends
the persistent Studio strip profile with every native live preview through a new
nonpersistent firmware `outputCalibration` contract. Slider updates no longer wait
80ms, and the hue marker shows the selected design color while calibration remains
physical-output-only. The card validates gains, preserves saved gamma/FastLED
correction, and rolls calibration back if pattern activation fails. Studio unit
19/19 + focused Chromium1/1 + build; firmware parser7/7 + ESP32-S3 build. Current
card firmware1548 lacks the new field, so physical proof awaits a signed preserving
firmware build; no flash or release occurred.

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
| FIRST-ACTION-001 | Every arrival auto-detects; one first action; Lights stay a secondary door | Studio Card Home / setup journey | active | Walk 7/7 + J01 on current main. Unplugged is Plug in and find card; post-update is Continue Wi-Fi; Lights is a secondary identity door |
| PATTERN-EDIT-VIS-001 | Exact native look entering Lab; Live preview native→Mandelbrot→Lotus→Stop; six-minute drift | Same physical hues/order and intended animation/restoration on the configured strip | on origin/main; physical strip still needs-eyes | Do not replay the stale `codex/pattern-creative-workflow` tree — it is 151 commits behind |
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

2026-09-09 held-primary test complete: Adrian confirmed red, green, and blue.
Channel permutation is not supported by these observations. Now holding #ffff00
at 0s; outgoing first pixel747400, WebSocket buffer0, picker→send14.7ms.
Same card lw-b0fe81f61b44 / firmware1548 / boot-deccfe4b-b0fe81f61b44.
Adrian confirms held yellow is a little greenish; settled mixed-color match fails.
Calibration authorized; no card change applied: firmware1548 only supports full
config replacement, and installed legacy project has no repository head to back up.
Green90% was much closer but still slightly green by Adrian's observation.
Reversible Studio preview now active at green85%, red/blue100%; recipe remains
#ffff00 and outgoing frame is746300 with WebSocket buffer0. Initial load is
neutral and Reset returns neutral. Next: Adrian judges this single comparison.
Green90% was closer; green85% remained green. Now auditioning green75%, outgoing
first pixel745700. Awaiting one visual judgment before moving it again.
At green75% the strip approximately matches the UI, but Adrian calls both too
green. Testing warmer source #ffd000 with same calibration; outgoing744700.
Warm #ffd000 was still slightly green at75%; Adrian requested green72%. Now
auditioning72%, outgoing744400, awaiting one visual judgment.
Green72% remained green; now auditioning69%, outgoing744100.
Green62% makes the physical strip a good yellow. Hardware gain no longer tints
the canvas. Now validating global balance with white; outgoing744874.
White was slightly blue at green62% / blue100%. Added preview-only blue balance;
now auditioning blue90%, outgoing white744868.
White remained slightly blue at90%; now auditioning blue85%, outgoing744863.
On2026-09-10 resume, Lab recovery had reset temporary calibration and resumed
the journey, invalidating attribution of the latest “still too blue” report.
Re-established held white at green62% / blue75%, outgoing744857; awaiting eyes.
Research found no universal WS2812B white: D65 is about6500K and often looks
blue in a warm room, while FastLED's TypicalLEDStrip is an empirical starting
ratio rather than measured color accuracy. Targeting a neutral gallery white
around4500-5000K; now auditioning green62% / blue65%, outgoing74484B.
Adrian reports that profile looks pretty good. Studio now persists red100% /
green62% / blue65% in browser storage and applies it once to Pattern Lab card
frames and shared creative WLED/USB frames while leaving canvases, recipes, and
diagnostic streams unchanged. Unit6/6, focused Chromium1/1, production build
pass. Native Patterns commands rendered by firmware1548 still use the card's saved
neutral calibration. A source fix now carries the profile as a temporary native
preview field without altering the legacy project, but it needs a signed preserving
firmware build before physical proof.
Session: docs/bench-sessions/2026-09-09-lab-mixed-colors.md.

2026-09-09 primary-color observation: Adrian confirms held #00ff00 is physically
GREEN (red previously confirmed). Now holding #0000ff for blue observation.
No channel-order changes warranted; mixed-color brightness/temporal behavior
remains unresolved. Original owner color #ff6600 to restore after diagnostics.

2026-09-09 primary-color observation: Adrian confirms held #ff0000 is physically
RED. Simple red/green swap now unlikely. Changed diagnostic swatch to #00ff00,
held at0s, Live remains on. Next single observation: does strip show green?
Restore original #ff6600 after diagnostic sequence. No calibration change.

2026-09-09 active timing trace Bench: previous tint/fade fixes did not satisfy
Adrian. Temporary DEV-only picker/worker/preview/WebSocket logs enabled in source.
Measured active orange edit picker2590700.5→worker2590705.7→preview2590709.4→
WS2590762ms, bufferedAmount0. One TCP WS connection; no proven long browser queue.
Now HOLDING PURE RED #ff0000 for decisive physical channel test; previous owner
color #ff6600 (orange) should restore after diagnosis. Trace publishes116,0,0 /
hex740000. No output-calibration changes. Ask which actual color pure red produces;
orange→yellow-green and violet→blue may be red/green exchange, not proven yet.
Do not claim tint changes solve physical mapping. Keep temporary trace until this
observation, then remove tracing or gate explicitly before final code commit.

2026-09-09 purple Bench continuation: user says held bright purple looks mostly
blue and flickers purple/blue. Browser holds color1 #4400ff at0s, Live on. Card
lw-b0fe81f61b44 reports neutral RGB/gammaoff/calibration1 and brightness15/255,
ditheringtrue. No changing journey phase; temporal dithering is a hypothesis for
flicker, not yet experimentally confirmed. Changed only current color1 via visible
picker to #8000ff (more red, same blue), held for comparison. No Keep/save/card
calibration or firmware mutation. Next observation: is this purple closer?

2026-09-09 color hold Bench: card lw-b0fe81f61b44 at192.168.18.70,
firmware1548; user yellow #fff700 looked green. DOM clock53.9s revealed fade
past30s hold toward teal. Color audition now pauses at stop start and existing
transport says Resume journey. Opening unchanged swatch also holds; transient only.
Primary clicked current yellow swatch, dismissed picker, resumed Live preview after
HMR; browser clock0 and card wled-realtime active. Read-only card evidence: RGB,
gammaoff, calibration1/1/1, external brightness15/255. No calibration/firmware edits.
11 focused browser checks + build pass. Pending one observation: does held yellow
still look greenish? Resume there; do not claim physical match without Adrian.

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

Connected editor final local commits:52718052 +013bc63e; latter fixes sticky
parent summary on desktop/phone. Final browser7/7, header clearance asserted.

Public-worker candidate2fe3dbae integrated locally as5854cc34. Fresh start paths,
count/split guidance, card-page recovery and JSON browser-save readback fixed.
Worker proof:9browser,42storage,2,547unit+build. Public still Studio1913/firmware1912.
Not worker-ready yet: actual online artwork/project access unresolved; user asked
for project/artwork list and worker sign-in emails. Same task Sol/medium tracing
existing library tenant/sharing semantics read-only before any new access design.
No deployment. Resume: integrate access findings + user project/identity inputs,
then prepare exact release candidate; do not call local fixes self-contained live.

Public access followup: native worker role sees/edits all official projects;
scoped assignments use customer accounts/drafts. Native login followed by library
fetch can hit Cloudflare Access redirect with no visible handoff despite existing
signIn action. Same task Sol/medium authorized bounded UI handoff fix + targeted
regression; preserve both auth gates/no role/policy/account changes. User project
and identity inputs still pending for actual file-free assigned-work proof.

Secure-library handoff60ec9b07 integrated as664c1c28. Explicit Access-required
action preserves native identity, flushes recovery autosave, uses existing safe
return navigation; no automatic redirect loop, ordinary503 stays retry. Worker
proof:36cloud-client units,5focused browser, final2,548unit+build. No account,
policy/private-asset or hardware mutations; still not deployed. Actual projects/
worker identities pending user input. Root branch preserves integrated candidate.

## 2026-09-22 Pattern Lab / Show integration research

Manager playbook v6; Sprint discovery requested, no implementation/release/card
mutation authorized by this research brief. Outcome: source-grounded operator
workflow, current delivery/editing gaps, and recommended integrated product slice.
Primary owns synthesis and board. Independent dispatches (available catalog
checked against collaboration tool):
- Lab authoring/handoff audit | gpt-5.6-sol / medium | bounded source tracing across
  existing UI/helpers | cited current paths and editing/persistence gaps | return
  uncertain cross-runtime semantics to primary.
- Show/card playback audit | gpt-5.6-sol / high | interacting export/runtime and
  persistence contracts | cited actual standalone capabilities and limits | return
  architecture decisions to primary.
Cost unknown. Resumption: integrate research into one operator-focused brief.

Primary evidence:50/50 focused Node tests;12/12 Chromium native-journey and
look-roundtrip cases, including4096 pixels, passed. Actual Show Modes/Voices UI
and rendered Lab fixture inspected. Found separate Show browser persistence with
ambiguous global Save to card; native journeys supported despite stale docs;
LWSEQ bake hard limit1024 source pixels prevents universal4096-pixel fallback.
Recommendation recorded in docs/plans/2026-09-22-pattern-lab-show-integration.md:
finish one named native scene's create/install/reboot/edit/update lifecycle;
portable Show authoring next; shared renderer contract and recorded delivery
separately scoped. No product source edits, deployment, flash or physical output
commands. Physical playback/parity/SD proof remains unperformed. Resumption:
select first scene lifecycle implementation from the brief; default assumption
is standalone installation pending owner's workflow preference. Cost unknown.
Worker source audits complete in sibling2026-09-22 Lab and Show/card research
files. Accepted after primary source checks:Show has no Lab picker/handoff;
normal installer ignores baked sequenceAssets; native looks need Playlist
inclusion; SD package is one-look and takes boot precedence over flash. Source
fidelity gap:Lab Movement changes preview geometry but ordinary native handoff
omits it; reproduce/repair or capability-gate before claiming exact preview.
Worker also reports34 focused tests and two firmware contracts passed; these
are supplemental, separate from primary50+12 counts. No physical proof inferred.

2026-09-22 owner design correction:novice usability must be communicated by
button hierarchy,title bars,location and continuous transitions,not long copy.
Added authoritative design requirements to the integration brief. Next design
artifact is one connected first-use scene journey,including phone and failure
states; no mandatory Playlist detour for installing one scene. Acceptance
requires unprompted novice task completion,not merely automated click success.

Owner scope clarification:creative object includes multi-step pattern/color
expression AND Layout-linked multi-strip/section/group targeting. Added where/
when/what interaction contract and three-section/mandala examples to brief.
Stable Layout identities; simultaneous per-area behavior distinct from time
steps; continuous-across-selection versus repeated-per-section explicit.
Runtime support remains to be scoped/proven; this records design requirements.

## 2026-09-22 managed implementation launch

Owner requests separate tasks with appropriate model/effort. One manager remains
in this task (01a0c8ad-20b4-76f2-a866-b218f5ff7e46). Stage1 delivers a clickable
novice journey plus integration contracts before shared production edits.
Authoritative direction:docs/plans/2026-09-22-pattern-lab-show-integration.md.
Dispatch choices (host catalog inspected):
- Connected expression editor prototype | gpt-5.6-sol / high | interacting
  spatial/temporal controls and novice UX | working desktop/phone prototype,
  actual screen evidence | return unresolved shared interaction decisions.
- Layout targeting adapter | gpt-5.6-terra / medium | bounded existing identity
  mapping, pure module and fixtures | split-strip/mandala/change tests | return
  ambiguous identity semantics; no speculative migrations.
- Playback delivery contract | gpt-5.6-sol / high | firmware/persistence boundary
  needs careful feasibility decisions | concrete supported matrix and exact
  smallest implementation contract from existing research | return protocol or
  backend expansion decisions; no firmware edits in this stage.
Separate task worktrees; no overlapping file ownership. App prototype owns only
prototype directory, adapter only new pure targeting module/tests, contract only
its plan file. Only primary edits this board, settles contracts and integrates.
New tasks bootstrap without substantive work, then receive explicit model/effort
via follow-up before assignment; creation API uses default model by contract.
Next stage:manager reconciles evidence, then dispatches production integration;
no deploy, firmware flash, exhaustive Prove or new backend architecture implied.
Cost unknown. Workers report completion back to manager task for continuation.

Dispatch state:Layout targeting bridge01a0c8c1-29d6-7e63-ace7-92cced55d8e6
runs Terra/medium in a59c; scene playback contract
01a0c8c1-29d5-7861-8f89-972ba2eb2b94 runs Sol/high in bcf5. Model/effort
verified from local runtime state after explicit follow-up. Both active by
wait_threads snapshot; instructed to report completion to manager task.
Prototype creation remains client-new-thread:9260027e-9fcf-497c-8dc5-bb36a6803836,
worktree6e8d exists but no runnable task ID yet. Do not duplicate. Intended
Sol/high assignment saved with other exact briefs in
 docs/plans/2026-09-22-expression-worker-briefs.json.
Resumption:resolve prototype task setup, send saved assignment with explicit
Sol/high, then inspect returned adapter/runtime evidence for integration.

Adapter review found a real missing-coverage defect:compileWiring can succeed
for source range0..1 of a3-pixel strip; continuous selection returned ok:true
with source3/physical2. Return bounded regression/fix to Terra before integration.
Prototype setup recovery:original pending task never obtained a runnable ID or
substantive brief. Reuse its6e8d checkout via projectless task
01a0c8c8-d081-7463-8ec7-582e36b29b30; Sol/high per existing selection. Do not
start work in original placeholder if it later materializes. No duplicate
worktree or product implementation was started.

Targeting adapter accepted/integrated as7c7af17c+4bbf92bd after partial-route
regression correction. Primary rerun25/25 focused tests green. Prototype task
instructed to consume same adapter via54f8c452+ffcf2da, not duplicate semantics.
Continuous requires exact selected-source coverage; repeated groups remain one
explicit domain. No production editor consumer or hardware change yet.

Playback contract6d9e45c2 reviewed but not yet integrated. Returned bounded
reconciliation:reuse accepted target IDs/adapter; separate current child-strip
sectionFamilies from legacy PatchBoard subranges; missing references preserve
editable source and block compile only; verify dwell/transition clock semantics;
prefer existing identity/readback before proposing new firmware hash fields.
P0 remains pure compiler/resolution,not shared schema/wiring/firmware rewrite.
Prototype informed of real transition limitation; creative prototype remains
rich and explicitly simulated. Sol/high contract correction bounded10min.

Playback contract62b9530f accepted after reconciliation; integrated locally.
P0 execution dispatch:scene source resolver/native compiler | gpt-5.6-sol /
medium | settled contract, bounded pure modules and deterministic fixture tests |
independent field inheritance + honest eligibility +4096 native fixture |
return semantic ambiguity or existing-packager incompatibility to manager.
Reuse playback task; own only new sceneExpression{,Native}.js and their tests,
plus compiler result doc. Existing targeting adapter stays unchanged. No shared
schema, UI, wiring, firmware, deployment or card mutation. Prototype remains
independent; manager integrates once both deliverables are ready. Cost unknown.

Prototypeb82543f reviewed:desktop+phone screenshots and source. Not accepted
for integration yet. Concrete issues:applyToSelection collapses mixed pattern/
palette state from first member on unrelated field edits; playbackAt counts
transition duration but renderColors never blends/implements transition; phone
steps are below entire long inspector; selectTarget only single area so explicit
multiple-member repeat selection cannot be exercised. Return bounded fixes to
same worker Sol/medium with behavior tests and one desktop/phone correction pass.
No generic polish loop. Prototype remains isolated and hardware simulated.

Prototype correction1bf6c15 accepted and integrated with originalb82543f0 as
19e5d96b+6616ca1a. Primary inspected corrected desktop/phone screens and reran
31/31 prototype+targeting+wiring tests. Independent field edits preserve mixed
patterns/palettes; real preview blending; touch multi-selection; phone timeline
immediately below canvas. This is an isolated prototype, not production/card
integration; hardware remains explicitly simulated.

Compiler4d4a8047 primary review reproduced two blockers:3-source/2-physical
partial route returns compile ok; JSON __proto__ assignment mutates Object
prototype through dotted-path setter. Same Sol/medium worker owns bounded
correction with exact-once wiring coverage and safe segmented field paths;
regressions must include duplicate coverage, dangerous/dotted extension keys,
normal nested inheritance and no prototype mutation. Also tighten native
movement field fidelity. No escalation/model change or architecture expansion.
Resumption:accept compiler correction, integrate only its new modules/tests,
then dispatch production source/editor/card handoff using shared contract.
No push, deployment, flash, or physical playback proof. Cost unknown.

Compiler correction6e664940 accepted/integrated with4d4a8047 as09766494+
1e77abcd. Manager checked safe own-property segment writes and exact coverage
validation. Integrated checkpoint passed2,589/2,589 unit tests and production
build (log /tmp/lightweaver-expression-checkpoint.log). Prototype regressions31/31
passed separately. Prior focused card/firmware contracts passed at worker; no
firmware changes. Native cut-only support remains distinct from rich preview.

P1 connected authoring dispatch decisions:save editable scenes additively in
project.expressionScenes={version:1,activeSceneId:null,scenes:[]}; no project
major-version change, firmware or backend migration. Canonical entries use
normalizeSceneExpression. Missing Layout refs remain source; invalid/future
scene data must be preserved or explicitly rejected,never silently dropped.
- Project scene persistence | Sol/medium | established envelope/context patterns
  with bounded new collection contract | save/reopen/hash/old-project regression
  and source authority tests | return any existing-repository incompatibility.
  Own projectModel.js,ProjectContext.jsx,new sceneExpressionProject helpers/tests.
- Production scene editor | Sol/medium | accepted prototype and canonical source
  fix the interaction contract | real Layout create/edit/reorder/save/reopen on
  desktop/phone, independent pattern/color tests | return unsupported preview
  semantics rather than approximate silently. Own scene-expression components,
  PatternLabScreen,v3 app/entry surfaces and focused browser spec; no overlap
  with persistence worker. Existing tasks reused; no extra director.
Both start clean branches from integrated1e77abcd in their existing worktrees.
Common context API expressionScenes,setExpressionScenes. UI consumes defaults
when unavailable; finish integration after persistence lands. Save uses existing
guarded project-save action,with truthful outcome; autosave is recovery only.
Card installation is next bounded integration after connected source works;
no pretend On card state, no real card networking, no deployment. Cost unknown.

P1 source persistencecacdc032 accepted/integrated as9752a2bb. Primary reviewed
projectModel and Provider apply/serialize/dirty paths and reran98/98 focused
source/model/repository/storage/lifecycle tests. Future/malformed JSON-safe
collections remain opaque and hashed; inspector explicitly marks noneditable;
updates reject instead of discarding data. Missing Layout refs remain editable.
UI worker received exact commit plus Provider functional-update/project-switch
browser cases (still required; helper tests are not Provider browser proof).
Worker dependency build block is local to its empty dependency target; manager
node_modules is populated and earlier checkpoint passed. No package changes.
Resumption:integrate UI worker's real-project scene journey, verify provider
switch/save/reload on actual screen, then bind selected playback through exact
source+runtime installation authority without making UI selection an install.

Production editore2c7dd96 not yet accepted. Primary source/screens review found
native preview huePalette invents HSL colors and omits modifiers; Play never
advances steps; canonical assignments:[] crashes; unsupported status claims
Saved prematurely; palette inputs misrepresent HSL values and truncate >3;
fixtures duplicate identical circle geometry without valid wiring; no saved
scene picker/New action. Returned same worker Sol/medium for one bounded
correction using existing patternPiecePreview/previewColorModifiers and real
step clock. Require valid wiring/native success, distinct3-section/mandala
geometry, sparse-source reopen and desktop timeline visible at1280x720.
No integration of this UI commit until behavior evidence meets original scope.

UIe2c7dd96+679cac0c integrated as07e1dcf6+85141717 after source and actual
screen review; primary39/39 focused tests pass. Screens now distinct3-section
and mandala, native compile success, desktop timeline visible. Worker8/8
browser cases+build pass. Remaining bounded source-edge corrections:once-mode
clock currently repeats; unavailable transition/continuous/movement source must
not silently animate as native cuts/repeats; inherited controls must resolve the
selected area's state rather than always first strip. Same UI owner completes
these before final integrated checkpoint. No hardware proof claimed.

Next independent delivery helper:Sol/medium, same playback/source task. Own
new sceneExpressionDelivery.js+tests only. Manager contract:editing selection
activeSceneId never implies playback. Optional expressionScenes.playbackSceneId
records explicit intended card program; absent/null retains ordinary controller
behavior. Existing normalizer preserves this additive field, no schema major or
firmware changes. Prepare immutable source snapshot+envelope+native program from
one selected scene; legacy saved looks remain in editable source, card program
is explicitly the selected scene's steps (replacement preview required in UI).
Use existing source hash,project revision/fingerprint and exact-card runtime+
look/zone readiness evidence. Require owner pairing/known-good wiring/current
install gate; source failure must prevent runtime mutation. Source-success/runtime
failure stays saved-not-installed; lost reply must reconcile actual readback.
Callbacks/injected operations for bounded tests; no new network client or live
card action. UI consumes helper only after manager integration; same UI worker
retains sole app.jsx ownership. Return identity/gate gap before architecture
expansion. Cost unknown.

Source-edge232dee76 integrated asc5d31af1;primary35units pass. Root browser
suite8/9 pass; final mandala fixture missing Petal ring after live-localStorage
seed/reload. Same UI worker diagnoses fixture/autosave race without weakening
real target assertions (root log /tmp/lightweaver-expression-lifecycle.log).

Final pre-delivery semantic check found repeat-instance gap:adapter explicitly
makes group/all/family one domain, but native/preview flattened pattern to each
member strip. Playback worker owns bounded compiler rejection+paired tests;UI
worker owns matching preview gate and explicit Repeat per section action to
expand stable leaf IDs only by user intent. Color-only grouped field patches
remain allowed; new native scene uses per-strip defaults. No adapter/schema or
firmware reinterpretation. Avoid claiming group-wide motion when rendering
independent copies. Also tighten preview movement params object check.

Group repeat compiler gatebf3e99d2 accepted/integrated;primary8/8 native tests
pass. Explicit leaf repeat accepts, multi-strip group pattern rejects, grouped
color-only patch accepts. UI worker received exact commit for its explicit
Repeat per section action and acceptance fixture. Delivery helper continues
independently in same playback task; no extra model/effort escalation.

UI group correction897f2478 integrated as5987b779;primary38/38 focused tests
pass. Mandala fixture failure diagnosed as live autosave overwriting direct
localStorage seeding; staged sessionStorage+before-boot init removes that race.
Integrated browser suite and authoring checkpoint now running (logs
/tmp/lightweaver-expression-lifecycle-final.log and
/tmp/lightweaver-expression-authoring-checkpoint.log).

Deliveryb7945467 returned for bounded authority fixes before integration:
no hardcoded ready access for foreign project; fresh exact preflight at run
before writes; validate full source envelope canonical hash; recheck source after
runtime verification; freeze runtime payload nested data. Same Sol/medium worker
adds adversarial tests for each, no protocol/firmware change. Root remains sole
integrator. UI install binding starts only after accepted helper returns.

Integrated authoring checkpoint complete at38ab49e4:2,596/2,596 library/unit
checks and production build passed;9/9 expression lifecycle browser tests
passed, including final real divided/mandala fixture. Logs above. No mutation
requests to card hosts occurred in suite. Source-edge helper38pass separate.
No further authoring polish needed before delivery integration. Resumption:
accept delivery authority correction, give exact API to sole UI owner for
Put scene on card + generic-save routing, then focused integrated delivery
journey with hardware fully mocked. No deploy/flash/physical playback proof.

Deliveryb7945467+83862d44 accepted/integrated as5c221a78+975ec591. Primary
64/64 focused integration tests pass. Verified actual firmware wiring-status
includes cardId/buildId (main.cpp runtimeWiringSafetyStatus), not invented proof.
Fresh access/identity/wiring preflight, full envelope validation, post-runtime
source re-read, frozen payload now enforced. UI integration next.

Final connected install assignment:existing UI task Sol/high, bounded to exact
source/runtime/React lifecycle glue where mistaken success could mislabel a
card; no new director. Own existing UI files and new browser integration test;
helper unchanged unless manager approves a demonstrated contract gap. Acceptance:
mocked card source-first path, pair/access failures no writes, unsupported scene
no writes, source or readback failure no false success, editing-during-install
preserves newer draft, correct generic Save to card with playbackSceneId, reload
unverified until fresh exact evidence. Return helper/transport mismatch before
bypassing evidence;20-minute convergence report; revert to medium for routine
correction. No deployment, real card calls, firmware changes or exhaustive Prove.

2026-09-22 owner reaffirmed end-to-end manager responsibility:continue all agreed
parts and bring every required owner question/physical observation back to this
manager task. Do not redirect owner to workers. Current install UI task active;
completion callback is the continuation mechanism (no unattended timer claimed).
Remaining outcome ledger beyond accepted authoring checkpoint:
- Connect/verify Put scene on card and generic updates with exact source/runtime.
- Reopen source from card in a second browser; simulated proof then real Bench.
- Try on lights remains an explicit separate, reversible rehearsal requirement;
  current production editor has no live action yet. Do not call install proof
  rehearsal proof or silently drop this from the journey.
- Show currently links to scene authoring; shared scene performance/picker is
  not implemented. Rich transitions, continuous group motion and recorded4096
  delivery remain unsupported; native cuts are the first slice, not full scope.
- Actual novice observation and physical playback/closed-browser/power-cycle
  proof require owner participation after concrete software candidate is ready.
- Firmware/SD/recorded expansion needs a concrete scoped proposal before action;
  current work does not authorize live hardware writes or deployment.
Manager continues independent implementation/verification and consolidates any
required decision here with recommendation and evidence.

Install UI1c748e28 reviewed, correction pending before integration. Core existing
transport binding verified in source. Concrete edge gaps returned same worker
Sol/medium:pristine New scene not in context before direct install;local On card
uses scene JSON only and ignores full-project/target evidence and concurrent
non-scene edits. Require context-flush before save/install and exact receipt
invalidation on layout/project/card change, retain earlier snapshot separately.
Test pristine create/install,non-scene edits during/after install,card switch,
plus actual installed/blocked desktop/phone screens. No generic scope growth.

Independent rehearsal prerequisite dispatch:reuse Layout task Terra/medium for
pure preview-frame->physical-output mapper. Own new sceneExpressionFrame.js and
tests only, no UI/network/session mutation. Match rendered pixel source refs to
compiled wiring exact order; reject missing/duplicate/out-of-range refs rather
than output truncated/misaddressed frame. Accept reversed/split/discontiguous
routes and mandala groups; source geometry never defines physical order. This
can finish independently of active install-UI corrections and makes subsequent
Try on lights integration concrete without overlapping files. Escalate unknown
frame authority/shape to manager. No actual LED commands. Cost unknown.

Rehearsal mapperf601f2b2 integrated as178911a8;primary28/28 focused tests pass.
Verified renderer callback provides smoothed whole-byte RGB (motionSmoothing
clampByte), mapped via exact segment stripId/sourceLed metadata to compiled
physical addresses. No frame is sent yet. Git worktree index required sandbox
escalation outside cwd; auto-review approved cherry-pick. Next:connect mapper to
existing reversible preview session after install UI correction settles.

Install UI1c748e28+53efd410 integrated as09aa23a2+ad4ca6bc. Primary55/55
expression/model/frame/delivery checks pass; worker19/19 browser+build passed.
Actual installed desktop inspected. One coherence gap visible:editor/topbar On
card but footer Save to card; same UI owner must prove/fix global indicator
against full source fingerprint before final acceptance (not ignore screenshot).

Next end-to-end workstream:Try on lights | same UI task Sol/medium | existing
renderer, exact frame mapper and transport session permit bounded integration |
explicit start/stop, verified identity/mapping, no source/config writes, restore
prior playback, no installed-state promotion, desktop/phone browser proof |
return transport/restoration contract gap before firmware change. Own only
scene-expression UI/helpers/new focused tests and minimal app props. Use exact
mapper178911a8, existing cardFrameStream/preview session with mandatory known
snapshot; prevent install/stream races and stale restore into another owner/card.
Stop/unmount/navigation/error tests; no real hardware. Final manager checkpoint
follows coherent connected journey, then real Bench/novice observation here.

Rehearsal7e3dec21 source review found physical preflight gap before acceptance:
ready card + same project ID does not prove draft Layout matches installed
wiring. Returned same UI worker Sol/medium for strict installed output/mapping
identity check using existing config/wiring authorities; mismatched count/pin/
reversal routes must emit zero frames and direct to install Layout first.
Unchanged topology with pattern-only edits remains usable. No automatic config
sync during rehearsal, no firmware fields. Worker17browser+12units+build evidence
retained but cannot prove this newly identified case. No real card commands.

Independent Show handoff dispatch:existing playback task Sol/medium, own
lw-show.jsx,new v3/ShowSceneLibrary.jsx/style and separate browser spec only.
Expose saved project expressionScenes as actual selectable named scenes in Show,
open existing shared SceneExpressionEditor with same source and supplied shell
actions (no duplicate editor/store). Preserve existing sound-reactive Show and
stop its own live stream before handing ownership to scene rehearsal. No sound
engine rewrite/audio-scene composition implied. Tests source identity/edit-return
continuity and no unsolicited hardware writes; return callback/ownership gap.
Main UI worker retains Lab/app/session edits; no overlapping source files.

Rehearsal topology82e54eff adds output/pin/count/direction checks but cannot
prove source mapping from run IDs alone (same ID/count can repoint source).
Manager fixed final authority contract:read validated exact-card editable
envelope,bound to installed status.projectFingerprint/contentHash;compile saved
Layout and compare ordered source keys to draft plus hardware topology. Allow
pattern-only draft edits. Missing/legacy source,unbound/newer source or source
mapping mismatch refuses rehearsal with install-first guidance. Same worker
Sol/medium owns correction;no invented firmware map/protocol. Tests include same
run ID/count/direction with changed strip/range. No real card writes.

Rehearsal7e3dec21+82e54eff+edbfd379 integrated as6a0b9c1a+74d329db+5dd9649b.
Primary72/72 focused expression tests pass (log
/tmp/lightweaver-expression-rehearsal-integrated.log). Installed-source envelope
validated and hash-bound to runtime before comparing compiled physical source
map; owner capability required, no automatic configuration change. Worker21
focused units/build pass; browser22/23 initially with brittle storage assertion
corrected and failing case rerun green. Final integrated browser checkpoint
awaits Show handoff and navigation guard. Show service403 recovered through same
worker; no work discarded. Browser slot now Show's; app owner coordinating
Show-host preview retention plus editor-close cleanup. No real card writes.

Showfd11317a integrated as3ccdc5d7 after Shell ownership guards774c60e3+ced9c615
(as002d82c7+5c10cebc). Shared collection/selection/save/edit continuity verified
by worker3 browser scenarios; primary reviewed source and both actual screens.
Screens reveal inherited Lab breadcrumb/Back label in Show plus clipped header
actions; returned bounded shared editor fix to UI owner, wrapper props to Show
owner. Existing3 scenarios do not exercise active rehearsal exit: requested
mocked success/failure restoration browser regression before acceptance. No
additional features dispatched. Final checkpoint waits only these concrete
corrections; then Bench/novice observations remain explicitly unperformed.

Final coherent expression batch complete locally: Show host props/test54852e90
integrated26393580, shared headerbcc03e03 integrated7dbb467d, mobile7838e017
integratedf66d873a. Primary inspected corrected desktop/phone screens. Checkpoint
2613units+72focused+build passed; browser37/38 then obsolete-entry test-only
correctiona4aedcaf integrated52ad00e0 and1/1 rerun passed. All38 scenarios have
passing evidence. No remaining active implementation assignments for this batch.
Bench/novice proof unperformed; not pushed, merged, deployed, or shipped.

2026-09-23 autonomous release authorized by Adrian: continue until launched;
no further routine approval needed. PR313 https://github.com/theyemingzhu/LED-Programming/pull/313
Current main integrated cleanly. Prototype moved out of public assets; expression
tests added to normal release suite. Operator guide added; advanced guide retained.
Release core/cloud/mapper/staging/freshness pass;2639unit tests pass. New scene38,
legacyShow11, recovery3, critical6, cloud73 browser cases passed. Existing notice
index-comparison race corrected/tested8pass; Layout unmocked-card fixture fixed6pass;
wiring lock fixture corrected4pass. Broad browser chunks116/116 and126/127
(the latter's known wiring fixture now corrected). Mobile33/41: eight failures
in private Lab naming/drawer/stateful interaction assigned original UI owner.
No merge/deploy claim yet. Hosted exhaustive runs stopped after new known
failures emerged, rerun once coherent corrections ready. Primary sole integrator.

Phone release correctionaeb1f534 integrated8ecd23a0: Edit/Evolve preserve compact
nonmodal controls, opening saved draft lands on Edit, Choose/Add to Patterns
expand full, compact sheet retains Save without oversized handoff panel.
Worker19/19 focusedmobile pass;primary inspected final phone capture. Full41
phone gate plus production/releaseUI now running. Wiring workspace defaults to
mocked/offline card access inaf979a46; assertions retained. Manual Tests dispatch
35755773372 passed source/production lanes so far; firmware version demand is
manual-dispatch conservative classification (no baseline), not a firmware-source
change. Exact origin/main..HEAD classification is firmwareBundleOnly=true.
Keep existing firmware version; normal main event will use exact baseline.

Release follow-up: all41 phone cases pass. Production67/68 then the isolated
LAN fixture correction passed its focused rerun. Broad releaseUI357/384 passed;
remaining cases were Card authority fixtures, retired Layout entry assertions,
Save/Saving copy, and three freshness tests invalidated by manager commits while
Vite was running. Final verification now freezes HEAD per browser run.
Corrected Card project-switch10 cases and Layout route/touch cases pass in the
145-case correction batch; manual handoff and passive-pairing remain unresolved.
Do not count static collection as browser proof.

Bounded followups retain Sol/medium owners: playback task owns Card test fixture
authority, accepts only unchanged explicit-pair/manual-Load behavior; editor task
owns CardInstallAction plus wiring-workspace tests. Inspection found compact Save
bypassed mappingReady/legacy-review while the full branch guarded it. Fix must
offer Finish Layout with concise reason, preserve valid staged installs and blank
discovery precedence, and prove no executable Save for incomplete mapping.
This is a real product correction, not a stale assertion to remove. No firmware,
compiler, or hardware write change authorized by this followup. Primary integrates
and runs hosted release gate after these concrete failures close. Not shipped.

Correction batch141/145 passes. Passive pairing failures are real, not remaining
fixture drift:30c8b484 bootstrap called owner connectTransport with empty expected
card ID and persisted identity without an owner click. Director decision: keep
two well-known-host read-only discovery, report found-unpaired, retain existing
explicit Connect for authority/persistence. Playback worker Sol/medium owns
studioCardBootstrap.js/test and first-action compatibility checks. Preserve
paired exact restore, bridge/update exclusions, no subnet sweep. Original Card
fixture init-script patch alone was insufficient and is not reported as a fix.
Manual-handoff helper separately fixed by seeding project/routes before initial
navigation(a46fa73d); focused browser proof pending. Wiring worker has browser
slot for red/green compact mapping guard. Primary does not run a second server.

Compact guard integrateda8d77c69(afterfixture3a2aab12): four red regressions
witnessed, four green, full24wiringpass; primary inspected card-finish-layout-guard
screen. Passive startup fixecaf0519 preserves read-only discovery and explicit
pairing;39focused units pass. Integrated2639unit+productionbuildpass. Six targeted
browserjourneys pass (pairing/bench/firstactions/manualLoad). ManualLoad regression
now seeds a real saved library match distinct from current workspace, uses the
single Setupbanner Load, and explicitly initializes abandonedintent state; the
separate real failed-claim test retains the refusal/circuit-breaker coverage.
No releaseUI failure is skipped. Final hosted launch:check follows fixtureclosure.

Finallocalmergechecks: six route/card smoke + four HTTPS bridge cases pass (one
fixture response-disposal teardown flake passed its single focused rerun);
78 journey/section/playlist cases pass after J01 explicitly pairs the discovered
card; two windowless and22preserving-update browsercases pass. J01 now counts13
deliberate clicks, including explicitpair. This last test-only correction is not
part of launch:check's selected browser specs; hosted35761730462 continues on the
identical product source at52f55470. No restart of that known-valid source run.
Allfourcardhandoffcases pass. Production merge/deploy/live proof remain pending.

## Release completion — 2026-09-23

**Shipped — Studio build 2048, firmware build 1939.** PR313 merged to
`f039ff8eb9014df19bb7287d2e2ca85d4f2bcbb4`; terminal origin/main was verified at
that revision. Exact-merge Tests 35765613236 passed all selected lanes. Production
deploy 35766592489 used real Cloudflare credentials and completed publication plus
its live check. Independent `PROD_CHECK_REQUIRED=1 npm run check:prod` passed:
strict no-store Studio marker 2048, all 63 staged Studio files, signed firmware
factory/update release graphs, production job, and private library denial.
Live: https://led.mandalacodes.com
Release evidence: https://github.com/theyemingzhu/LED-Programming/pull/313

Lab/Show share saved editable scenes and selection; steps target named Layout
areas; temporary rehearsal and verified native-card installation are separate
actions. Phone controls, incomplete-Layout save guard, and explicit card pairing
are included. No firmware flash or real-card commands were performed.

Remaining explicit limits: physical LED appearance/power-cycle playback and a
novice observation are unperformed. Unsupported richer expressions remain marked
preview-only; native delivery supports built-in card controls and timed cuts.
Legacy test debt: patterns-v3's removed `lw_local_chip_default` preference case
passed on retry in both hosted selections. The exact obsolete assumption and
evidence are recorded in PR313; no production failure was identified from it.
No active implementation assignment or launch blocker remains for this release.
This completion entry is a local documentation commit after live verification;
the production source remains the exact revision named above.
