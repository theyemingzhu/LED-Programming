# One coherent Lightweaver card journey

## 2026-09-05 audit deltas and handoff

- Source inventory was checked against local repair revision `0af4b750`; the initial root snapshot was `d1a25c13`. On handoff, fetched `origin/main` is `2747224f201955cc6c2cee69a96bbf2ff5f9e98b`. Compare intervening changes before implementing; these audits do not describe every change in the newer main revision.
- The reproduced gap is inconsistent journey inputs: Card Home passes active `wiringStatus`, while the reminder does not. Physical confirmation itself is already implemented. The commissioning panel is reachable through the active automatic installer; do not delete it as legacy.
- Reuse preserving-update evidence, bounded reconnect, commissioning leases, project reconstruction, transactional test mode, and autosave quarantine. The E01–E14 ledger records exact sources; B0 reconciles them with the chosen implementation baseline.
- This handoff publishes planning artifacts only. Execute the bounded B0–B5 integration scope and J01–J14 applicable checks when the handoff prompt is used. Shipping, firmware flashing and exhaustive Prove retain their separate authorization rules.

Status: expanded build blueprint for review, based on source audits and one focused decision reproduction. This document defines the complete integration scope below; it is not a claim that the build is complete. No product changes, release, firmware write, or physical proof authorized or performed by this audit.

## The problem to solve

Adrian should not have to coordinate setup screens, connection tools, firmware updates, and recovery. Each step must present one primary action, carry out its machine work, verify the result, and lead to the next unfinished step. A temporary failure should stay inside that step and preserve completed work.

This is not a request to fix every defect or build another wizard. Existing journey, routing, commissioning, and recovery code should be reconciled around one authoritative decision. Existing design and playback tools remain available; linear progression applies to guided card setup, not all creative navigation.

## Audit scope and evidence

Root checkout: `d1a25c13`, with pre-existing uncommitted work left intact. Newer repair checkout inspected: `.worktrees/update-to-playback` at `0af4b750`, clean when checked. These are local source snapshots, not a claim about what is currently deployed. Earlier real-card observations are historical evidence from the existing repair plan, not repeated hardware verification.

The existing [update-to-playback repair plan](2026-09-05-update-to-playback-repair.md) describes an actual completed firmware update followed by stale version display and a stalled connection/setup handoff. The workboard records subsequent local repairs. Do not reimplement those findings without comparing the chosen integration revision.

A remaining decision-consistency risk was reproduced with the newer pure journey function: given the same connected card and ready lifecycle, adding exact active `wiringStatus` yields `confirm-visible-lights / setupComplete=false`; omitting it yields `open-patterns / setupComplete=true`. Card Home supplies this input; `SetupJourneyChip` does not. Evidence: newer `lightweaver/src/v3/lw-setup.jsx:417`, `src/components/SetupJourneyChip.jsx:30`, `src/lib/setupJourney.js:291`. This demonstrates a decision mismatch with a synthetic fixture; it does not establish how often that state occurs on a real card.

Existing foundations worth keeping: `cardFlowEntry.js` centralizes user intents, `setupJourney.js` derives the next task, `cardCommissioningFlow.js` persists ongoing work, and `firmwareUpdateRecovery.js` already bounds reconnect attempts and checks card identity. Consolidation should extend these foundations rather than add a competing progress record.

Three bounded audits used `gpt-5.4-mini`, the cheapest available agent model. No deeper agent was needed. Their static findings were used as planning evidence, not runtime defect claims:

- Root `src/v3/lw-setup.jsx:810` and `:868` offer connection options alongside recovery/connect actions; `src/lib/connectPanelRouting.js:22` can route lifecycle problems back to Setup. This is a candidate circular route to exercise with button-level tests, not proof that every displayed secondary action is wrong. Keep advanced diagnostics when useful, without making them necessary for ordinary continuation.
- Root `src/components/card/CardCommissioningPanel.jsx:518` had the older reconnect shape. The newer checkout already adds bounded reconnect planning. Likewise, exact-build display, persisted installation evidence, and network-update readiness have newer repairs in `footerFirmwareStatus.js`, `installFirmwareEvidence.js`, and `firmwareUpdatePlan.js`. Treat these as integration work to retain, not new repair assignments.
- Root `tests/install-update-plan.spec.ts:43`, `tests/setup-adopt-card-project.spec.ts:38`, and `tests/production-setup.spec.ts:73` cover valuable simulated slices. `tests/card-state-matrix.spec.ts:1` explicitly uses simulation; `tests/live-card-states.spec.ts:135` covers a real-card pattern tap. The audit did not establish one continuous real-card update-to-saved-playback proof. Mocked tests remain useful; the missing evidence is continuity through handoffs and actual hardware behavior, not the mere presence of mocks.

Source paths in these bullets are relative to `lightweaver/`. Confirm line locations and reproduction against the selected integration revision before assigning fixes.

## The proposed default experience

| Current situation | Primary action or status | Machine work and next destination |
| --- | --- | --- |
| Card not identified | Connect card | Obtain required browser permission; identify the exact card; read installed firmware, network and project state. |
| Identified, compatible firmware | Checking card… | Skip installation; continue to unfinished setup or existing playback. An optional newer release is maintenance, not an automatic setup blocker. |
| Firmware update required or selected | Update card | Choose the supported preserving method from evidence; write, restart, reconnect, verify the running release, then return to the interrupted task. |
| Saved Wi-Fi exists | Connecting… | Try the saved network and known addresses automatically. Ask for a network change only when necessary or selected. |
| Blank card | Set up lights | Find outputs; obtain physical colour/count confirmation; retain verified results. Do not confuse missing project with broken firmware. |
| Lights known, artwork placement unfinished | Place lights | Open the existing layout tool at the unfinished work; return to the same setup journey. |
| Project ready to test | Test on card | Send the intended configuration; verify exact readback; ask for one physical observation. |
| Physical test confirmed | Save to card | Make the tested installation durable and confirm the saved identity before advancing. |
| Existing installation verified | Open patterns | Play using the existing installation; do not rerun setup merely because Studio reopened or an update completed. |
| Interrupted operation | Checking what completed… | Read the card before repeating a write; resume the same task or show one specific required action. |

These are behavior contracts, not approved final labels. Detailed discovery may need several physical observations, one at a time. Updating a configured card must not trigger new-card commissioning.

## One decision shared by every surface

Derive one current journey result from the same observed card identity, boot/build evidence, connection state, project identity, active operation and physical confirmations. Card Home, footer, reminder, installer and recovery views consume that result instead of assembling different subsets of evidence.

The result must state: current step, primary action, whether machine work is active, reason for a block, recovery action, and destination after success. Separate facts that are currently easy to conflate: reachable, authorized, update-capable, configured, and playable. A successful HTTP connection is not proof of playable lights.

Keep evidence provenance and freshness: installed build comes from the selected card, available build comes from the verified release, and a remembered pre-update version is not current after a restart. During verification say so. USB and LAN evidence must identify the same card before they can complete the same operation.

Completed steps are invalidated only by relevant changes. A changed pixel count can invalidate the wiring test; reopening the browser should not erase it. A project conflict is a project choice, not a reason to reconnect or reinstall firmware.

## Recovery within the step

- Automatically retry bounded reads, reconnect to the same card, refresh stale evidence, detect an already-completed operation, and resume its saved destination.
- Check operation status before retrying any write whose response was lost. Do not blindly repeat installation or credential submission.
- Every wait has a deadline, visible progress, and a terminal explanation with one useful next action. Retrying must not discard known progress.
- User actions remain necessary for browser USB/network permissions, unavailable credentials, physical wiring observations, and choosing between conflicting projects.
- Factory erase is never an automatic repair. Keep it in explicit advanced recovery with the established recovery-record requirement. Identity mismatches and integrity failures stop mutation.
- Keep Stop available during live-light operations; a single primary setup action must not hide essential control.

## Button and ownership rules

Every setup button gets a small transition record: starting state, intent, owning flow, operation, success evidence, next state, interruption behavior, and regression scenario. This record is the shared acceptance contract for implementation and tests.

One primary action per guided state. Multiple entry points may open the same action, but must not create parallel implementations or independent completion flags. Connection UI owns permission/transport; update UI owns preserving release installation; discovery owns physical strip evidence; layout owns placement; project installation owns test/save. The shared journey decides which owner is active and where it returns.

## Implementation sequence after blueprint agreement

The detailed work packages below replace the original five-step outline as the execution contract. Keep this one document authoritative for this integration build. Earlier plans remain evidence/history; they are not additional automatic work queues.

1. Choose one integration revision and classify earlier repairs as present, pending release, superseded, or still missing. Avoid repeating work from older checkouts.
2. Define the transition table and unify the evidence supplied to the existing journey decision. Add agreement checks across its consumers, including the reproduced wiring-test discrepancy.
3. Complete update → restart → exact-version verification → return to the original task. Keep configured and blank cards distinct. Reuse the existing preserving and bounded-recovery machinery.
4. Complete discovery → placement → test → confirm → save → playback. Remove redundant prompts and old routes only when their replacement handles the same required state.
5. Run one integrated journey checkpoint, then the proportionate actual-screen and card observations. Deployment remains a separate release request.

Use at most three independent implementation owners: Studio journey integration; firmware contracts only where a demonstrated gap requires firmware changes; and journey acceptance tests/docs. The primary integrates and alone edits the workboard. Cheap agents handle bounded inventory/test tasks; deeper investigation is reserved for persistent state, firmware integrity, or disagreements spanning card and Studio.

Adrian's cost preference: use the cheapest capable agents by default, including future implementation. Escalate only for a concrete unresolved issue; do not repeat the whole audit with a more expensive model. Implementation remains outside this planning audit's scope.

## Acceptance matrix

| Scenario | Required observable outcome |
| --- | --- |
| Compatible blank card | Connect → light setup; no unnecessary firmware install or AP detour. |
| Working configured card | Recognize installation → playback; no repeated setup. |
| Configured card update | Preserve configuration → verify new running build → return to playback/original task. |
| First reconnect fails | Recover within the same step, then advance once; bounded failure if still unreachable. |
| Reply lost after successful write | Read back completion; avoid duplicate write. |
| Browser reload during operation | Recover the exact card/operation and resume the unfinished step. |
| Active light test | All setup surfaces agree that physical confirmation remains pending. |
| Different card or changed project | Explain the conflict and preserve progress; do not silently replace or erase. |
| Restart after saved installation | Read back installation and resume playback; physical lights confirmed separately. |

Use stateful journey tests that retain one simulated card across button clicks, failures and reloads; avoid replacing it with an already-successful fixture between steps. Record browser permission gestures and physical observations separately from avoidable navigation clicks. Hardware outcomes require actual observation and cannot be passed by a simulated card.

Success means Adrian can complete or resume these journeys without knowing recovery routes, all surfaces agree on the next action and installed version, and completed setup survives return visits. A large passing test count alone is not this evidence.

## Completeness improvements from the second review

The first draft omitted enough detail to permit another round of disconnected fixes. This revision adds seven concrete protections:

1. **A bounded whole-product map:** setup, everyday editing, project persistence, firmware maintenance, recovery, and advanced entry points all have a place in the same build.
2. **An existing-build ledger:** every work item starts from active code and prior fixes, not old unchecked boxes. Reuse, consolidate, retire, verify, and genuinely new work are distinct dispositions.
3. **A full transition contract:** backward navigation, cancellation, reload, late responses, stale evidence, and concurrent operations are specified alongside the happy path.
4. **A data-preservation contract:** browser drafts, installed projects, physical confirmations, temporary tests, and backups cannot silently replace each other.
5. **A compatibility and environment matrix:** desktop, phone, public Studio, card-local Studio, offline operation, cached releases, and update transport limitations are explicit.
6. **Named integration deliverables and agent ownership:** work is organized around finished journeys with fixed interfaces and no simultaneous editing of shared Studio files.
7. **Finite completion evidence:** every work package has acceptance scenarios, release status, and separate machine/physical proof. No open-ended “fix everything” queue is needed.

## Whole-product scope and navigation

“Totality of the build” means completing the interconnection of the existing ESP32-only product, not implementing every roadmap idea. The following table is the scope boundary. A discovered defect is included when it prevents one of these journeys or violates its preservation/safety contract; unrelated enhancement requests remain outside this build.

| Surface or journey | Owns | Required connection to the rest of the product |
| --- | --- | --- |
| Card Home and setup | Current card diagnosis and one next task | Returning from every executor recomputes the same journey; no second setup ladder. |
| Connection Center | Permission, exact-card identification and transport | Close automatically once its task is verified; return to the requested operation, not generic setup. |
| Firmware maintenance | Preserving update, new-card installation and explicit recovery | Choose from actual capability and configuration; verify running release, then resume. |
| Discovery | GPIO, colour order, count and temporary physical tests | Carry discovered facts into the existing design without re-entry or overwriting an established layout. |
| Layout | Artwork placement, geometry, direction and wiring edits | Physical changes invalidate only relevant proof and use the shared test/save action. |
| Patterns and Lab | Select/create supported looks | Distinguish Studio preview from acknowledged physical state; return edits to the same project and shared save path. |
| Playlist | Ordering, timing and startup behavior | Retain looks and edits through saves/reconnects; card readback proves the installed result. |
| Show | Existing show/streaming workflow | Preserve its current supported behavior; explain temporary control ownership and return to saved playback when stopped. Do not add new live-host architecture. |
| Project/library/import/export | Editable project copies and their persistence | Name browser, file, optional cloud, and card copies accurately; conflicts never silently overwrite. Offline card use must not require cloud login. |
| Local card page | Standalone daily use and local fallback | Same card/build/project truth; stable control and recovery when public internet is absent. |
| Workshop/production | Existing technician/batch workflow | Preserve compatibility routes and signed-job checks; never insert it into ordinary customer setup. |
| Support/recovery | Specific failed operation and bounded diagnostic record | Advanced tools remain reachable but are not required clicks in the normal journey. |

The current Studio rail is defined in newer `src/v3/app.jsx:120`: Card, Layout, Patterns, Lab, Playlist and Show. Discovery is a task destination. Inspect actual route wiring before treating an older component as a second active customer path; for example, `lw-card.jsx:844–845` places the technician flasher and older installer guide behind tools.

Allow free creative navigation. “A only leads to B” means one clear guided next action from the current state, not disabling Back, Cancel, Stop, or the ability to design offline.

## Existing plans and integration baseline

Before the first implementation edit, the primary records one exact integration SHA, its dirty/clean state, relevant pending commits, and the separately verified deployed revision. Do not infer deployment from a local branch or an old workboard entry. Do not reset or sweep other tasks' worktrees.

| Existing source | How this build uses it |
| --- | --- |
| `docs/plans/2026-09-05-update-to-playback-repair.md` and newer repair checkout | Preserve implemented version, reconnect, blank-card and saved-network repairs; rerun missing handoff evidence, not the old assignment list. |
| `todo/plans/software-first-card-flow.md` | Reconcile its 13 findings individually. Transactional test mode, owner grants and reconstruction may already have implementations; unchecked prose is not evidence of absence. |
| `docs/superpowers/plans/2026-08-31-card-home-effortless.md` | Keep existing one-status/one-primary-action work; confirm old test failures against the chosen revision. |
| `docs/roadmap.md`, `TODO.md`, customer-runtime guide | Extract still-relevant behavior; resolve contradictory historical claims, including USB-only versus preserving Wi-Fi update and older auxiliary-window guidance. Do not automatically implement the entire backlog. |
| `docs/development-workflow.md`, deployment checklist, workflow guides | Keep verification/release rules intact. This proposal does not weaken signing, physical proof, or shipping definitions. |

For each candidate item record: ID, observed behavior, active source, disposition (`reuse`, `consolidate`, `retire`, `new gap`, `proof missing`), implementing revision if known, proposed owner, and acceptance scenario. Use `unverified` when evidence is absent. The ledger is a section of this plan or its implementation evidence attachment, not a second competing workboard.

### Initial existing-build ledger

All paths below are relative to the newer checkout at `0af4b750`. “Present” means source inspected; it is not a new test pass or shipment claim. This is the starting inventory, not authorization to replace these modules.

| ID / capability | Existing implementation | Disposition and required integration | Package / proof |
| --- | --- | --- | --- |
| E01 — Intent routing | `lightweaver/src/lib/cardFlowEntry.js`: `resolveCardIntent`, `openCardFlow`; active app, connection and creative-screen callers | **Consolidate:** use existing intent routing for equivalent buttons; preserve entry intent through the executor. | B1 / J01, J05, J08 |
| E02 — Next task and card readiness | `src/lib/setupJourney.js:279`, `cardLifecycle.js:156`, `cardActionAuthority.js`: `deriveCardAction` (under `lightweaver/`) | **New integration gap:** share full evidence with all consumers. `resumeDestination` appears only in the journey producer in the inspected source; implement/align return intent through existing routing rather than treating that field as already effective. | B1 / J13 |
| E03 — Physical confirmation | `lightweaver/src/v3/lw-setup.jsx:423,1007` supplies wiring status and renders the confirmation branch | **Reuse/consolidate:** confirmation already exists; fix missing evidence in other consumers, not rebuild it. | B1, B3 / J01, J13 |
| E04 — Installed/release identity | `lightweaver/src/lib/footerFirmwareStatus.js`, `installFirmwareEvidence.js`, `firmwareUpdatePlan.js`; app footer and Connection Center callers | **Reuse:** newer exact-build comparison, restart evidence persistence and readiness gate; close whole update/readback flow proof. | B2 / J03–J05 |
| E05 — Commissioning and reconnect | `lightweaver/src/lib/cardCommissioningFlow.js`: `writeCardCommissioning`, `claimCardRestoration`, `verifyCardRestorationMutation`; `firmwareUpdateRecovery.js:78` | **Reuse:** durable flow, migration, leases/generation checks and bounded exact-card recovery. Integrate UI timeout/ownership messages. | B2, B4 / J05, J08 |
| E06 — Active installer executor | `lightweaver/src/v3/lw-card.jsx:968` → `AutomaticInstallScreen` → `lw-flash.jsx:1332` → `CardCommissioningPanel` | **Retain:** still an active path despite the older component name. Unify its return/status contract; do not retire on filename alone. | B2 / J03, J04 |
| E07 — Discovery/adoption | `lightweaver/src/lib/discoveryCommit.js`: `discoveryProjectParts`, `projectSkeletonFromCardStatus`; `cardProjectAdoption.js:102`: `reconstructInstalledCardState` | **Reuse:** counts/outputs and installed looks reconstruction are present. Verify continuity into existing layout and truthful partial/full backup labels. A separate “import looks” button is not automatically required. | B3, B4 / J01, J02, J09 |
| E08 — Project test/save | `lightweaver/src/components/card/CardInstallAction.jsx`; `components/layout/shared/CardPushControl.jsx`; `src/lib/cardSetupDeploy.js:112`: `deploySetupToCard` | **Consolidate:** retain established normal and temporary setup write paths with a common user-facing operation outcome; verify exact project readback and late-response handling. | B3 / J01, J06 |
| E09 — Layout and creative content | `lightweaver/src/components/LayoutScreen.jsx`, layout hooks; `src/lib/cardPatternBank.js`, `cardPlaylist.js`, `sectionLookModel.js`, `cardLiveControl.js`; active Patterns/Playlist/Show screens | **Reuse:** creative tools remain. Audit shared save/preview/Stop handoffs; no separate per-screen installers or feature rewrite. | B3 / J06, J11 |
| E10 — Temporary test mode | `lightweaver/src/lib/testStrip.js:71,96,204`; app, Patterns and Playlist save callers | **Reuse/proof missing:** session activation and candidate-specific rollback, production-save protection already exist. Verify every active preview entry uses the intended mode and preserves later edits. | B3 / J07 |
| E11 — Project copies and recovery | `lightweaver/src/lib/projectStorage.js`: `readRestorableProjectJson`, `quarantineAutosavePayload`, `saveCurrentProjectToLibraryGuarded`; `projectTransfer.js`, `projectAssociation.js`, project dialogs | **Reuse:** guarded persistence, import/export and associations. Clarify copy status and complete conflict/quota/return-visit tests. | B4 / J02, J09 |
| E12 — Public/local handoff and shell updates | `lightweaver/src/lib/projectHandoff.js`: encrypted expiring handoff/conflict helpers; `offlineUpdate.js`: `createOfflineUpdateController`; `studioFreshness.js` | **Reuse/proof missing:** shell update guards and local handoff exist. `offlineUpdate.js` updates the Studio service worker, not card firmware. Verify deferred refresh, offline entry and version skew together. | B4 / J09, J10 |
| E13 — Firmware update and known-good state | `firmware/lightweaver-controller/src/LightweaverFirmwareUpdate.cpp:781,921,941` uses inactive partition/write completion/boot selection; `main.cpp` has candidate probation and storage readiness | **Reuse/proof missing:** preserve signed A/B and wiring recovery mechanisms. Firmware-update probation and wiring-test probation are separate contracts; physical interruption evidence is still required. | B2, B4 / J03, J12 |
| E14 — Saved network and blank classification | `firmware/lightweaver-controller/src/main.cpp:405,2703,2749`; newer commissioning reconnect planning | **Reuse/proof missing:** carry actual saved-network/blank-state evidence into the journey; do not label all non-playable cards as corrupt or old. | B2 / J01, J04, J05 |

Primary verification corrected two audit-helper conclusions: wiring confirmation does have a live caller, and commissioning is still reachable from the active installer. Assertions that these paths were dead were rejected. Likewise, absence of an extra button is not itself a defect when the existing consolidated action already performs the work.

Proposed precedence after approval: repository instructions and safety/release contracts → this build's journey/ownership contract → implementation evidence and tests. Historical documents are context. Source reveals current behavior; it does not automatically define desired behavior. Update contradictory customer instructions as part of completion.

## Transition and evidence contract

The existing journey implementation should have one canonical snapshot assembler and one derived result shared by consumers. Do not make the central result a new firmware authority: the card continues to enforce every write. Transports and task executors retain their specialist implementations.

Each transition record must contain:

| Field | Required meaning |
| --- | --- |
| State and intent | Exact starting condition and what the user requested; keep the original return destination. |
| Evidence | Card ID, relevant boot/build identity, project head, operation/generation, freshness and physical confirmation when applicable. |
| Action owner | One executor and one active write owner for this card/operation. |
| User work | Only unavoidable permission, choice, credentials or physical observation. |
| Machine work | Allowed probes, write, readback, reconnect and continuation. |
| Success | Explicit result observed on the same card; no success based solely on a completed upload or optimistic UI update. |
| Time bound | Reuse existing operation deadlines first; choose and test any changed timeout explicitly. No infinite wait or repeated automatic page reload. |
| Failure | Recoverable transport failure, user action required, conflict, incompatible state, integrity failure or unknown write outcome. |
| Exit/resume | What Back, Cancel, navigation, reload and browser sleep do at this phase. |
| Invalidation | Exactly which changes invalidate completion, authority and pending responses. |
| Proof | Test scenario ID plus physical proof requirement, if any. |

Transition rules:

- Going Back or closing a panel must not erase completed work. For a write already committed to the card, closing UI does not mean undoing it. Reopen by reading the operation, not starting another one.
- Cancel is phase-specific: stop a cancellable transfer, request supported abort, or explain that a completed write/reboot is being verified. Never promise cancellation can undo flashed bytes.
- Double-clicks and two entry points join the same pending operation. A late reply from a prior card, project revision, boot or operation cannot advance the current journey.
- A second tab or browser must acquire the existing appropriate authority; it cannot silently race a configuration/update writer. Show the specific current conflict and how to resume after ownership is released.
- On foreground/resume, refresh relevant evidence before mutation. A remembered progress marker can resume navigation, but cannot prove the card still has that state.
- Unknown firmware is not old firmware. Higher build number alone is not an update compatibility policy. Distinguish compatible, required update, optional update, release unavailable and identity unverifiable.
- A successful write followed by lost readback is “verification pending,” not automatically “write failed.” Read the exact operation/project before offering a retry.

## Preservation and invalidation matrix

| Event | Preserve | Invalidate/recheck |
| --- | --- | --- |
| Browser reload or return visit | Draft, selected card, resumable operation, confirmed installation evidence | Live connection/authority and current card state. |
| Firmware update | Wi-Fi, exact project, looks, wiring, settings and limits on preserving paths | Running firmware identity, boot authority and stale pre-update observations. |
| Pattern or playlist edit | Wiring proof and unrelated design state | Relevant installed content match; save through existing acknowledged path. |
| GPIO/count/direction/colour/current-limit change | Draft and previous known-good installation | Physical test for the changed configuration. |
| Temporary test-strip session ends | All later creative edits and saved production design | Its own unconfirmed candidate only; never roll back another operation's candidate. |
| Card swap or changed project head | Both editable copies, pending evidence and original expected identity | Write authority and automatic adoption; ask a project/card choice. |
| Storage quota/private mode or invalid/newer project format | Recoverable raw data and existing good copies | “Saved” claim; explain persistence limits and offer export/recovery. |
| Public↔local-origin handoff | Exact project envelope and return intent | Revalidate identity, expiry, one-use handoff and conflicts at destination. |
| Power loss during save/update | Previous known-good card state using existing atomic/rollback mechanisms | Pending success claim; inspect recovered state after reboot. |

Do not label reconstructed card configuration as a complete editable backup unless it contains the complete project. Name partial reconstruction and preserve/import the missing artwork or authoring data. Card storage, browser save and cloud save remain distinct states even when their buttons are consolidated.

Existing reuse evidence: newer `src/lib/testStrip.js` already uses session storage, records its own activation, rolls back only that candidate, and applies the shortened runtime only to preview (`runtimePackageForCardOperation`). `src/lib/projectStorage.js` already has backup reads, unsupported-version handling and raw autosave quarantine. These need integration coverage, not wholesale replacement.

## Environments and unsupported paths

| Environment | Required behavior | Proof |
| --- | --- | --- |
| Desktop Chrome/Edge public Studio | Supported direct local access, permission allow/deny/revoke, exact card, preserving USB where available | Stateful browser tests plus named real browser/card run. |
| Safari and iOS/iPadOS | Supported card-local/same-tab path; unsupported USB leads to one valid device/browser handoff | Actual named device/browser observation; no mocked claim of platform support. |
| Android Chrome/PWA | Supported local path, background/resume and cold offline behavior after preparation | Actual device observation plus automated lifecycle cases. |
| Card AP without internet | Card-local control and saved playback; no dependency on fetching public assets or release metadata | AP/offline observation and card-bundle tests. |
| Internet lost after load | Local playback survives; online-only work explains its dependency and retains draft | Simulated outage plus physical playback observation. |
| New browser/device with no cached site | Explain the supported first-entry path; a public site cannot be assumed to load offline on first use | Fresh-profile/device scenario; no promise based on a warm cache. |
| Private mode/storage failure | Truthful save limits, intact existing copies, usable export | Browser storage-failure cases. |
| Cached old Studio/new firmware or reverse | Compatibility policy blocks only unsupported actions; safe read/control/recovery remains available where supported | Version-skew fixtures and signed bundle compatibility checks. |
| New Studio release during active update/save | Preserve draft and operation; defer disruptive refresh and verify a coherent release afterward | Freshness monitor active-operation tests plus reload/resume scenario. |

Use the existing supported transport capability checks. Do not hard-code “all browsers can do this,” require technical local URLs in the customer flow, or remove a required browser gesture in pursuit of zero clicks. Package availability and signature verification govern offline firmware updates; no network means no promise to obtain an uncached release.

## Diagnostic and usability acceptance

Show one persistent explanation beside the action. A later successful unrelated request must not clear it. Distinguish reconnecting, permission needed, wrong card, project conflict, release unavailable, unsupported firmware, rolled back, and verification pending.

Record a bounded local diagnostic trail: journey step, operation ID, expected/observed card and build, transition reason, elapsed time and outcome. Reuse existing diagnostics before creating storage. Exclude credentials, tokens, project contents and private network details from exported support records; do not introduce remote telemetry as part of this build.

For each reference journey record the expected deliberate clicks. Automatic completion must require no extra navigation, reconnect or generic Continue click unless the browser requires a new gesture. Compare every variant of the same state against that budget. Do not force a fixed total across genuinely different physical setups.

Inspect real desktop and phone screens for one primary action, readable progress/errors, keyboard and touch access, focus after navigation, screen-reader status, and Stop availability. “Disabled” must have a discoverable reason. Avoid timed automatic navigation while the user is entering data; only advance when the active task has completed.

## Work packages, agents and dependency order

The primary is the conductor: owns the integration baseline, shared contracts, this plan, workboard, final review and release coordination. Agents return evidence, not independent definitions of the product. Default agent model is `gpt-5.4-mini`; escalate a specific unresolved persistence/firmware/authority question to `gpt-5.6-sol` or the primary before expanding work. Do not rerun routine inventory on expensive models.

| Package | Agent and exact ownership | Deliverable and dependency | Completion evidence |
| --- | --- | --- | --- |
| B0 — Reconcile existing work | Primary + read-only inventory helpers | Freeze one baseline; classify old findings and active routes. Precedes all implementation. | Every assigned item has current source and reuse/new-gap status. |
| B1 — Shared journey decision | Studio agent, exclusive `lightweaver/src/` including colocated tests | Canonical evidence snapshot/result, intent routing, return destination, shared visible status. | Active-light-test discrepancy fails then passes; consumers agree for blank/configured/recovering states. |
| B2 — Firmware/network completion | Same Studio agent for browser code; firmware agent exclusively `firmware/lightweaver-controller/src/` and its firmware-only tests when a contract gap requires changes | Preserving update → exact running build → original task, network reuse and safe timeout. Agree contract before parallel implementation; depends on B1 result shape. | Current/older/blank/corrupt/update-interrupted cases; config preserved; no duplicate write; physical update evidence separately. |
| B3 — Setup and everyday editing | Same Studio agent after B1/B2, still exclusive `lightweaver/src/` | Discovery → layout → light test → save → Patterns/Playlist/Lab; transactional test mode and accurate edit/readback state. | One stateful card through setup and subsequent edit/save/reload; no re-entry of known counts; late replies cannot undo newer edits. |
| B4 — Persistence and environment continuity | Same Studio agent after conflicting B2/B3 source edits; firmware owner only for demonstrated local-serving/storage gap | Public/local/offline handoff, project conflict, Back/Cancel/resume, compatible-version behavior. Reuse existing repositories and handoff. | Return visit, quota, partial backup, two tabs, wrong card and offline/version-skew cases. |
| B5 — Journey acceptance and documentation | Test/docs agent: `lightweaver/tests/`, integration test fixtures, `lightweaver/scripts/`, root `scripts/`, `docs/`; no product source or workboard | Starts fixtures from B0 and agreed B1 contract in parallel. One continuous simulator, transition matrix, environment evidence, reconciled instructions. Primary owns this plan while test/docs agent works elsewhere. | Scenario IDs below map to actual tests/observations; no contradictory obsolete UI assertions remain in affected suites. |
| B6 — Integrated checkpoint and shipment | Primary integrates; release tooling edits by test/docs agent only if necessary | One coherent checkpoint; proportionate Bench proof; release workflow on explicit shipping instruction. | Exact revision, required gates, signed artifacts if needed, deploy and independent live proof; both build numbers reported. |

At most three helpers run at once. The Studio work is deliberately sequential where it shares app state and routing. Do not assign one agent per screen: that would recreate competing flow decisions. A firmware agent can work independently only after the shared contract is fixed; if firmware already meets it, use no firmware implementation slot. Existing mapper source ownership stays with a dedicated mapper agent if a demonstrated adapter defect requires it; schedule that task after a slot frees, with no unrelated mapper redesign.

Before each agent begins, hand over: baseline SHA, exact files it may edit, relevant transition IDs, existing functions to reuse, agreed input/output shape, focused test, and prohibited scope. If it needs another owner's file, stop that edit and return the dependency to the primary. Tests and production source owners agree observable behavior before either hard-codes a fixture.

## Full build acceptance and closure

| ID | Continuous scenario | Pass condition |
| --- | --- | --- |
| J01 | Fresh compatible blank card → saved installation | Connect, discover, carry counts into layout, test, physically confirm, save and play without firmware detour. |
| J02 | Existing configured card → return visit | Recognize installed project, preserve/adopt the right copy, play; reload does not restart onboarding. |
| J03 | Preserving update of configured card | Capture before identity/config, update, reboot, verify running build and retained config, return to original task. |
| J04 | Update transport/preflight variants | Already-current, optional newer, required update, unsupported USB, unavailable release, blank and damaged storage select truthful safe actions. |
| J05 | Lost reply/reconnect timeout/reload | Confirm actual outcome, bounded retry, one useful fallback; no duplicate writes or erased progress. |
| J06 | Edit/save while state changes | Pattern/playlist and wiring edits follow correct save/test paths; newer draft survives old response and authority expiry. |
| J07 | Temporary physical test then normal save | End/abandon test, roll back its own candidate if needed, retain later edits; production save uses full intended wiring. |
| J08 | Back/Cancel/double click/two tabs/card swap | One write owner, phase-correct cancel, correct destination, no accidental replace or mutation of another card. |
| J09 | Project persistence and transfer | Browser/file/card/optional cloud copies correctly labeled; quota, unknown schema and divergent handoff preserve data. |
| J10 | Offline and version-skew environments | Supported browser/local path remains usable; cached/new bundle mismatch cannot silently corrupt or force setup. |
| J11 | Daily use across existing surfaces | Patterns A/B, Playlist save/play, Lab handoff, Show stop/control handback and local-card controls agree with installed state. Unsupported content is explained before save. |
| J12 | Power cycle, update rollback and storage interruption | Exact known-good installation survives supported recovery; machine state and physical output recorded separately. Includes existing microSD boot precedence where that mode is used. |
| J13 | UI agreement and accessibility | Every setup surface shows the same task/build/operation outcome; desktop/phone and keyboard/touch journey inspected. |
| J14 | Release and old-entry continuity | Relevant legacy routes reach their canonical owner; production and advanced paths retained; exact live Studio/firmware release graph proven after ship. |

Tests should compose actual production decisions/executors where practical with one stateful simulated card, preserving its storage, boot identity and operation state across clicks. Inject failures at real interfaces; do not manually mark the next step successful. Use representative schema-valid blank/configured/corrupt fixtures; a “ready” fixture missing required project identity is invalid proof. Keep focused unit tests for hard transitions, but avoid duplicating every UI assertion at every layer.

### Existing proof machinery to extend

Paths here are relative to the newer checkout. Inspect fixtures before reusing them; source coverage and simulated success do not count as live hardware evidence.

| Reuse | Extend for | Limits |
| --- | --- | --- |
| `lightweaver/tests/card-state-matrix.spec.ts`, `setup-ladder.spec.ts`, `card-workspace.spec.ts` | J01, J02, J05, J13 with one evolving card fixture and consistent consumer assertions | Retire obsolete visible-UI assertions only after the desired behavior is agreed. |
| `lightweaver/tests/preserving-firmware-update.spec.ts`, colocated firmware/commissioning unit tests | J03–J05, J08: delayed reconnect, lease conflict, reload, wrong card and retained project | Simulated update is not power-cut or preservation proof on hardware. |
| `lightweaver/tests/windowless-offline-studio.spec.ts`, `windowless-service-worker.test.mjs`, `windowless-card-bundle.test.mjs` | J09/J10: offline, handoff, active-operation shell update and incompatible assets | Browser/device permission behavior must be observed on the named platform. |
| `scripts/bench-check.test.mjs`, `scripts/live-card-pattern-verify.test.mjs`, `lightweaver/tests/live-card-states.spec.ts` | Classification, exact-card readback, pattern A/B/Stop and retained state in Bench runs | Run hardware-mutating portions only in the authorized Bench/release context; LED observation remains Adrian's. |
| `scripts/firmware-update-release.test.mjs`, `scripts/production-job-consistency.test.mjs` | J14: signed release chain, faithful production fixtures and workflow ordering | No new release counter or parallel deploy mechanism. |
| Existing checkpoint/release scripts and `check:prod` | B6 integrated evidence and exact production proof | Use existing proportional tiers; do not run every gate after every button fix. |

### Remaining evidence tasks, not new product questions

B0 must establish the chosen integration/deployed revisions, active legacy links, current shipping blockers, and the capability/browser policy already implemented. B5 must attach actual test names to J01–J14 and distinguish simulated, inspected-screen and observed-card results. B2/B4 must resolve any protocol discrepancy with the firmware owner before edits. None of these unknowns justify inventing another implementation or asking Adrian to debug the software.

If a real product choice remains after inspecting existing decisions, the primary presents one concrete choice with its consequence. Otherwise use the defaults in this blueprint. No blanket “approve every step” process is introduced.

Track each row as `not run`, `automated passed`, `physical pending`, `passed`, `blocked`, or `waived with explicit reason/approval`. Scope each status to a revision and named environment. A waiver does not turn an unperformed hardware observation into a pass. This plan does not invoke the exhaustive Prove run; if later required, invoke it through its existing authorization rule.

The build is integration-complete only when B0–B5 deliverables and applicable automated journey rows pass, affected real screens are inspected, and all required physical observations are passed or explicitly outstanding in the handoff. Do not call it fully proven with physical requirements outstanding. Shipment additionally requires B6: tested integrated `origin/main`, terminal signer commit when applicable, real production deployment, no-store release marker and exact staged/live files, with Studio and firmware commit-count build numbers. Existing release blockers remain blockers.

Freeze feature scope during final verification. Any newly discovered issue must name the acceptance row it blocks; otherwise record it for later. This keeps “thorough” finite and prevents the build from becoming another endless series of unrelated repairs.

## 2026-09-05 B0 — integration baseline (conductor record)

Recorded before the first implementation edit, as the blueprint requires.

| Fact | Value | How it was established |
| --- | --- | --- |
| Integration branch | `claude/lightweaver-audit-refinement-9a5034`, isolated worktree | `git worktree list` |
| Baseline revision | `aba1e6f5` = `origin/main` `2747224f` + the planning docs cherry-picked from `codex/unified-card-journey-handoff` (`c9baeac4`) | `git log`, `git fetch origin main` |
| Working tree | clean at start | `git status --short` empty |
| Pending repairs | `codex/update-to-playback` is already contained in `main` (merged as PR #216); nothing from it is pending | `git branch --merged main` |
| Delta since the audit snapshot `0af4b750` | No change under `lightweaver/src/`, `firmware/lightweaver-controller/src/` (except the generated Studio bundle header), or `scripts/bench-check*`. Changes are `.github/workflows/test.yml`, the signed release artifacts from the #216 signer, `scripts/ci-changed-lanes.*`, `scripts/production-job-consistency.test.mjs`, three Playwright configs, `layout-hardening.spec.ts`, `patterns-v3.spec.ts`. The E01–E14 source inventory therefore still describes current `main`. | `git diff --stat 0af4b750 main` |
| Deployed Studio | build **1551**, source revision `0e299ff5`, read live with no-cache | `curl https://led.mandalacodes.com/studio-release.json` |
| Local `main` commit count | **1560** — `main` is nine commits ahead of what is live; the next ship carries them | `git rev-list --count main` |
| Unit baseline | `npm run test:unit` → 2262 tests, 2262 pass, 0 fail, 11.8 s | run in this worktree at `aba1e6f5` |
| B2 Node lanes at baseline | `test:firmware-update:unit` 19/19; `test:firmware-update:firmware` five contract suites pass (ticket, state, web contract, boot health, blank readiness); `scripts/bench-check.test.mjs` + `ci-release-owed.test.mjs` 15/15; native contracts `update-blank-readiness`, `saved-network-reuse`, `card-page-request-deadline`, `wifi-project-preservation` pass | run in this worktree; simulated — not hardware proof |

### Ledger reconciliation at `aba1e6f5`

Every row was re-read in the current source, not carried from the audit.

| ID | Status at baseline | What was verified |
| --- | --- | --- |
| E01 | present | `src/lib/cardFlowEntry.js` resolves intents; chip, footer and screens call `openCardFlow`. |
| E02 | **gap confirmed** | `deriveSetupJourney` has three consumers with three input sets: `lw-setup.jsx:417` passes `resolution` + `wiringStatus`; `SetupJourneyChip.jsx:30` and `app.jsx:1142` (`openSetupTask`) pass neither. `resumeDestination` is produced at `setupJourney.js:328,409` and consumed nowhere. Card Home learns "light test active" only through the `onWiringTestActiveChange` prop callback (`lw-card.jsx:913`), a component-scoped second channel. |
| E03 | present | `lw-setup.jsx:425,1007` — confirmation branch renders from the journey's `confirm-visible-lights` task. |
| E04 | present | `footerFirmwareStatus.js` + `installFirmwareEvidence.js` wired in `app.jsx:1116–1137`; verification settles on exact card/boot evidence. |
| E05 | present | `firmwareUpdateRecovery.js` bounds reconnect to 45 s with exponential backoff and terminal blockers; `cardCommissioningFlow.js` holds the durable flow. |
| E06 | present | `lw-card.jsx:968` → automatic installer → commissioning panel (not re-audited beyond route). |
| E07 | present | `discoveryCommit.js`, `cardProjectAdoption.js`; Setup auto-adopts only where nothing can be lost (`lw-setup.jsx:576–634`). |
| E08 | present | `CardInstallAction.jsx`, `CardPushControl.jsx` wrap writes in `withStudioHardwareOperation`, which is the existing invalidation bus (`lw-hardware-operation-active`). |
| E09–E12 | present, not re-audited | Out of B1's path; covered by existing suites listed in the acceptance ledger. |
| E13, E14 | present; physical proof pending | Firmware repairs from #216 are in `main`; native contracts above pass; hardware preservation/power-cut still Bench evidence. |

### Test harness fact the audit missed

`lightweaver/tests/harness/cardSimulator.ts` is already the "one stateful simulated card" the blueprint asks for (mutable state, refusals, reboot, offline, bridge relay). Its one journey-relevant hole: after `/api/wiring/activate` it still answers `staged`, so no browser test could put a card into the live light-test state that the E02 discrepancy depends on. B5 extends the simulator before writing the agreement scenario.

### Owners used in this run

Cheapest capable, per the blueprint: one Studio owner (deeper model, because B1 is the cross-boundary shared-authority change Sprint reserves the deeper model for), one test/docs owner (balanced model), no firmware owner — no firmware contract gap was demonstrated at baseline. The conductor owns this plan, the workboard, `package.json` script lanes and integration.

## Blueprint iteration — holes found by the conductor's survey (additive)

The blueprint is kept whole; these rows extend it. Each names the concrete mechanism the blueprint left abstract, so the next reader cannot re-invent it.

| # | Hole in the blueprint | What this build does about it | Package |
| --- | --- | --- | --- |
| H1 | "One canonical snapshot assembler" named no mechanism, so each consumer would keep assembling its own subset. | A module-scoped evidence store (`src/lib/cardJourneyEvidence.js`, same pattern as `cardLink.js`) holds the card's wiring status, status envelope and project resolution, keyed by **card id + boot id**; `src/lib/setupJourneyInputs.js` is the one assembler every consumer calls. Evidence from another boot is not evidence. | B1 |
| H2 | Freshness/invalidation was a table with no trigger. | The existing `lw-hardware-operation-active` event (already fired by every card write) marks the store stale; the hook re-reads once per (card, boot, operation). No polling loop is added. | B1 |
| H3 | Component-scoped prop callbacks (`onWiringTestActiveChange`, `onPrimaryActionChange`, `onLoadOfferChange`) are a second journey channel that only exists while Setup is mounted — the same class of defect THINKING.md 2026-08-07 records for routing. | Card Home reads "light test active" from the shared journey; callbacks are removed where every caller is updated, otherwise retained and listed. | B1 |
| H4 | `resumeDestination` is documented as "align through routing" but nothing says where the return intent lives. | `src/lib/cardReturnIntent.js` (sessionStorage, one-use, card-scoped) remembers the working screen a card flow was opened from; Setup's completion primary resolves stored intent → journey `resumeDestination` → Patterns, and its label names the destination. No timed navigation. | B2 |
| H5 | J13 ("all setup surfaces agree during an active light test") was listed with no way to put a simulated card into that state. | Simulator gains the firmware's real wiring-test lifecycle (`testing` / `awaiting-confirmation`, probation, confirm, rollback, expiry) and `beginWiringTest()`; the agreement spec asserts one `data-journey-task` across the chip and Card Home. | B5 |
| H6 | B5 named no CI lane. THINKING.md 2026-08-31 shows a spec outside the PR gate rots for weeks. | `tests/journey-continuity.spec.ts` is added to `ci:browser-smoke` so it runs on every PR. | B5 (conductor edits `package.json` scripts) |
| H7 | Reads were unbounded in the blueprint's "double entry points join the same pending operation" rule (it covered writes only). | The evidence store's refresh is single-flight per (card, boot, tick); Setup publishes its own read so the chip never double-reads the same card. | B1 |
| H8 | "Bounded local diagnostic trail" — `src/lib/cardLinkJournal.js` already exists and is not mentioned. | Reuse it; journey transitions should append there rather than to new storage. Recorded as follow-up, not done in this run. | later |
