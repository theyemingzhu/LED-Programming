# Lightweaver workboard

This is the compact cross-session source of truth. Only the primary agent edits
this file. Sub-agents return results, tests, commits, and blockers to the primary
agent, which integrates the evidence here. Keep entries short; detailed Bench and
Prove records belong in their session folders.

Status values: `queued`, `active`, `needs-eyes`, `blocked`, `done`.

## Sprint queue

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
