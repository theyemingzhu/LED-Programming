# Lightweaver workboard

This is the compact cross-session source of truth. Only the primary agent edits
this file. Sub-agents return results, tests, commits, and blockers to the primary
agent, which integrates the evidence here. Keep entries short; detailed Bench and
Prove records belong in their session folders.

Status values: `queued`, `active`, `needs-eyes`, `blocked`, `done`.

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

### 2026-09-25 Complete GPIO integration plan (queued implementation)

Adrian requested a comprehensive plan for all affected integrations and agent
ownership. Plan: [Complete GPIO pattern integration](docs/plans/2026-09-25-gpio-pattern-integration-plan.md).
Baseline `5deb1535`; manager source review, returned Bench Sol audit and Luna
verification inventory. A separate read-only Layout Sol review was requested;
the manager independently verified the Layout constraints used in this plan.
No implementation, suite execution, deployment or hardware action in this
planning turn. At most three workers; manager remains sole integrator.

**Release-blocking findings supersede any inference of complete readiness from
the prior narrow tests:** Bench restore sends a redundant false-sync command
that native firmware rejects with 422; provisional zero fade/blackout/stream
ownership can leave matching pattern readback physically dark; measured chooser
and Whole piece use provisioned rather than confirmed ports. Prior mock/browser
passes did not model these native behaviors. Physical reproduction remains
unperformed; this is source/runtime-contract evidence, not a visual hardware pass.

Next build: GP-00 fixtures → GP-01 Bench corrections with Firmware C's early
arming diagnosis; App A builds GP-03 guided independent sections in parallel.
Then complete chooser/persistence/shared install, restart and other consumer
contracts, portability and full acceptance matrix. GP-11 handles separately
authorized hardware/release/Prove gates. Current local branch is not release-ready.

### 2026-09-25 Same/different GPIO patterns and Bench Discovery (implemented locally)

Adrian requests deeper end-to-end product work: easily assign the same or
different patterns to GPIO strips and load patterns from Bench Discovery.
Sprint continuation, not an exhaustive Prove run or a physical-card setup.
Base is `2eb3af47`, including the compiled-zone/startup corrections above.

Reused two Sol tasks at medium reasoning: Studio worker
`01a0d750-d4a2-71c0-94ee-69bdd43ab44a` owns normal-project Patterns, shared look
model/runtime helpers and targeted tests; Bench worker
`01a0d750-c4fc-7ee2-82ce-fe716e1c17d6` now owns StripDiscoveryPanel, Bench
config/install/commit helpers and targeted tests. No overlapping source edits.
Studio has first browser slot; Bench must wait for handoff. Manager integrates
and owns docs/workboard/checkpoint. Known unrelated Windows checkpoint failures
remain documented; no release, hardware writes, or firmware flash authorized.

Acceptance: actual same/all and different/per-section interaction; independent
edit retention; save/reload/install payload/readback; Bench counted-port handoff
to patterns; clear temporary versus installed status; exact-card authority and
uncounted discovery limits retained. Physical appearance is a separate gate.

Confirmed Bench gaps: multi-output discovery config has one zone; the final
measured setup installer passes outputs without measured strips/patches/wiring,
again producing one full-piece zone. Approved bounded correction: per-output
provisional zones with dim combined startup; explicit temporary pattern audition
after counting; carry chosen looks into measured source and final install.
Legacy single-zone setups need an explicit update path, not target fallback.
Existing artwork is preserved; persistence needs exact mapping or Layout handoff.
Normal Patterns same/different/reload/install journey already passes; remaining
usability work makes scope visible and links a section spanning multiple GPIOs
directly to the existing Layout separation flow without changing zone semantics.

Normal Patterns continuation integrated as `1b88c7f6` (worker `6e51f688`):
Design target precedes Pattern bank in DOM order; adjacent scope text explains
same/all versus selected-section changes. Multi-GPIO sections link to their
selected strip in Layout. At 390px the preview no longer covers controls and
two-column pattern cards retain readable names. Three focused browser tests
passed, including same/different/Keep/reload/installed GPIO payload. Manager
inspected desktop and phone screenshots. A wiring run split is not itself a
new pattern section; advanced run restructuring can still be required in Layout.
Physical appearance remains unobserved.

Bench implementation integrated as `8cc77e8b` (worker `b06b03a6`): separate
provisional GPIO zones, temporary pattern audition, explicit legacy setup update,
snapshot/restore, Keep and combined Keep/install, measured geometry in final
package, preserved authored-layout handoff, exact outputs/zones/startup and
known-good wiring readback. Worker focused Node 52/52 passed. Initial browser
proof checked rendering only; manager required a follow-up interaction test.
Integrated `e1410fd6` (worker `a2563c5b`) adds two-GPIO whole-piece → individual
pattern → Keep → actual saved counts/patches → measured runtime-package proof,
plus failed readback refusing Keep. It fixes explicit transport forwarding and
guards asynchronous results against a changed Studio project. The no-write-after-
unmount preflight check passes.

Final integrated Chromium journeys **5/5 pass**, including normal Patterns,
multi-GPIO scope handoff, Bench same/different/Keep/package, failed readback, and
counting controls at desktop/390px. Node22 checkpoint: **2709/2715 pass**, with
only the same six unrelated Windows baseline failures already reproduced on
unchanged main (CRLF fixtures and POSIX signing-key permissions). No new unit
failures. Four relevant firmware contracts pass; no firmware source/release
artifacts changed. Final production build passed (5.56s). Logs use
`%TEMP%/lw-gpio-bench-checkpoint-*`. Both worker tasks are idle and browser test
servers stopped. Physical multi-output/offline restart and novice-use observation
remain needs-eyes; software verification does not pass those gates.
Committed locally; not pushed, deployed, or physically verified.

### 2026-09-24/25 General multi-output pattern workflow (implemented locally)

Adrian requests a product-wide fix: separate GPIO strips need independent
patterns and a clear way to load them; configuring one physical card is not the
requested outcome. Sprint mode supersedes initial Bench intake. No card changes
or flash performed. Base: main `9f053a02` (build 2118), includes PR339.
Integrated worker `30766195` as `20a6298e` on
`codex/multi-output-pattern-workflow`. Committed locally; not pushed or deployed.

Manager delegates two isolated tasks using GPT-6 Sol: firmware routing/runtime
diagnosis (high reasoning) and Studio assignment/loading workflow (medium).
Firmware owns its source/contracts; Studio owns browser source/focused tests.
Manager owns integration, documentation, workboard and one integrated checkpoint.
Acceptance: distinct patterns on distinct mapped outputs, correct compiled pixel
ranges, persistence/reload and standalone-install semantics, discoverable UI,
and truthful unsupported-state handling. Physical LED proof remains separate.
No release, version bump, signing, or hardware flash is part of this Sprint.

Firmware task `01a0d750-c4fc-7ee2-82ce-fe716e1c17d6`; Studio task
`01a0d750-d4a2-71c0-94ee-69bdd43ab44a` owned the single browser slot. Luna QA
returned `docs/plans/2026-09-24-multi-output-acceptance.md`. Studio found the
initial concrete defect: runtime zones retain independent looks but implicit
startup selects a single pattern that firmware applies across all zones.
Both defects are corrected. Explicit playlist intent is retained.
Three unequal compiled GPIO regression exposed a second confirmed cause:
compiled zone IDs do not match patch IDs used to recover section playback, so
all compiled sections fell back to the global pattern. The correction uses
the canonical zone/patch relation for current settings and saved combined looks.
Firmware worker confirmed existing combo-zone playback and five focused
contracts pass. No firmware change needed for the startup defect. Direct config
save clears remembered live looks even for the same revision; a pre-existing
same-revision wiring-candidate restoration trap is tracked separately and must
not be confused with proof of this browser fix. User guide now explains the
per-section Patterns workflow and explicit timed-playlist behavior.

Evidence: 12 focused Node tests, existing card-runtime contract, five firmware
contracts, and 3/3 section-row Chromium cases pass. Real Patterns screen inspected
by the worker; GPIO labels and instructions render correctly. Three unequal GPIO
outputs retain distinct patterns through compiled config, compact storage, and
JSON project reload into a saved combo. All preview/test processes are stopped.

Integrated checkpoint: production build passed. Node 22 unit suite: 2,699/2,705
pass, six failures reproduced unchanged on base `9f053a02` (92 targeted baseline
tests: 86 pass, same six fail). Failures are the aesthetic-law source scan,
three firmware-release fixture/key checks, deployment header line endings, and
the signing fixture's POSIX permission check on Windows. This is not a green
full checkpoint. Logs: `%TEMP%/lw-multi-output-node22-unit.log`,
`%TEMP%/lw-multi-output-baseline-windows.log`, `%TEMP%/lw-multi-output-build.log`.
System Node 24 hung existing bridge tests; stopped those processes and used CI's
Node 22. Windows newline conversion changed a tracked signed ticket signature;
restored its exact 87 Git bytes to build. No release artifact was regenerated.
The optional Rollup helper requests a nonexistent Windows package; the direct
Vite build succeeds using the correctly installed native dependency.

Follow-ups: fix baseline Windows verification portability before claiming a
green checkpoint; assess same-revision wiring-candidate NVS restoration as a
separate firmware issue. Physical/offline LED playback remains unobserved.

### 2026-09-25 Layout, GPIO, and card pattern fixes (done locally)

Reproduced the screenshot's unverified-bridge install failure: HTTPS Studio's
verified direct connection was lost during wiring checks. Installation now keeps
its transport through preflight, test, confirmation, and rollback. Section
patterns, zone synchronization, and test-strip operations also retain transport;
exact-card identity safeguards remain intact.

Three divided sections expose independent GPIO selectors; physical cut runs
have a GPIO selector in Specs. Moving a family frees its previous empty output.
Verified three-output compilation, browser assignment/reload, and physical-cut
routing. Artboard labels and selected closed-shape interiors now support drag;
return-to-origin restores geometry and simple selection does not consume undo.
Install hover help uses the existing portal tooltip above the artboard.

Final integrated checkpoint: 2,700 unit tests and production build passed
(`/tmp/lw-sprint-checkpoint.log`). Focused browser regressions passed for HTTPS
install/rollback and direct/bridge patterns (4), GPIO routing (3), and new
artboard interactions (4); existing first-LED, kaleidoscope drag, and zoom-selection
checks pass. Real screens inspected: `/tmp/lw-sprint-gpio.png`,
`/tmp/lw-sprint-layout-hover.png`, and `/tmp/lw-sprint-layout-drag.png`. Source reviewed and
`git diff --check` clean. Release authorized by Adrian's “push main” request;
integration, release gate, deployment, and independent live proof are in progress.

Release PR339: first full launch run 36090781248 passed earlier source, browser,
cloud, production and unit stages, then release-UI ended with 392 passing and two
failed stale assertions. Corrected the second zoom-limit label hit-target
expectation and the current “Continue after setup” handoff copy/action. Complete
zoom spec (3) and blocked-popup regression (1) pass; product source is unchanged.
Full launch gate is being rerun before merge.

**Needs-eyes:** On the user's actual card, confirm patterns on each of the three
wired GPIOs and offline playback after installation. Connection type and exact
pins were requested but not supplied. No firmware change, card write, or flash
was performed. Resume by checking the configured card and observing one output
at a time; preserve its installed project and Wi-Fi configuration.

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
integrated; final candidate gate pending. The separate shipping task owns
merge, protected signing, deployment, and live proof; this task owns readiness.
The connected card is a configured fixture, not an authorized blank/spare.
Fresh-install physical proof remains unperformed. Current scope is the canonical
`led.mandalacodes.com` origin; custom client domains need separate trust design.

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
