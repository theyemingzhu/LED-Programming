# Complete GPIO pattern integration plan

Date: 2026-09-25. Audited local source: `5deb1535`, branch
`codex/multi-output-pattern-workflow`. Owner: primary manager/integrator.
Status: **plan ready for implementation; current local feature is not release-ready**.

This plan covers the complete software path for giving connected GPIO strips
the same or different patterns, starting in Bench Discovery or an existing
artwork. It also covers every existing consumer of the resulting project,
mapping, playback, and installation state. It is an implementation plan, not
authorization to deploy, flash hardware, or start the long Prove run.

## 1. What completion means

An owner can count several strips, see each GPIO and measured count, choose one
pattern for all measured strips or a different pattern for each, keep those
choices, reopen the project, and install them on the intended card. Existing
artwork follows the same pattern-selection behavior without losing its geometry,
routes, saved looks, or scenes. The card subsequently plays the installed result
without Studio or internet.

The ordinary route must not require editing JSON, knowing zone IDs, or repairing
Advanced wiring to make a normal supported topology independent. Unsupported
topologies or patterns must explain the affected section and the next action.

Completion requires three distinct forms of evidence:

- Automated software evidence: mappings, persistence, controls, installation,
  readback, recovery, and browser interaction agree.
- Observed hardware evidence: the expected physical outputs actually render,
  stop, restore, and restart with the intended patterns.
- Release evidence: the integrated revision is merged, deployed with real
  credentials, and independently verified live. Local tests are not deployment.

## 2. Current foundation and newly identified blockers

Already implemented locally:

- Canonical patch-to-compiled-zone mapping preserves section choices.
- Combined startup looks preserve independent patterns without overriding an
  explicitly enabled playlist.
- Patterns shows GPIO scope, target-before-bank ordering, and usable phone cards.
- Bench provisions per-GPIO zones, supports pattern audition and Keep, carries
  measured geometry into its final package, and checks installation readback.
- Some transport, unmount, and project-switch guards are present.

Existing evidence at this source: five integrated Chromium journeys passed,
the production build passed, and 2709/2715 unit tests passed. The six failures
were reproduced on the unchanged Windows baseline. Physical output and offline
restart were not observed. These results remain valid for the cases exercised;
they do not establish the missing cases below.

**New source/runtime contract blocker:**
`restoreBenchPatternSnapshot()` always sends a final sync command. Per-zone
restoration already sets sync false. When the baseline is also false, the
firmware rejects that redundant sync-only request with HTTP 422,
`command affects zero outputs`. The permissive mock accepted it. Normal
multi-output Stop/Keep/install restoration can therefore fail on the real card.
Fix this before release; reproduce it with firmware-faithful tests first.

**New scope blocker:** the Bench chooser and whole-piece operation use
`session.benchLayout`, which contains provisioned ports. Saved measured parts
contain confirmed ports only. The chooser must not imply that all provisioned
ports are measured, or silently drive unconfirmed ports during a measured-strip
audition.

**New rendering blocker:** provisional startup leaves `fadeScale` at zero.
Discovery's external frames bypass that factor. Ending the stream resumes the
internal renderer, but pattern-only zone/compiled selection does not rearm the
fade or clear global blackout; an active stream can also retain output ownership.
`record()` currently starts stream shutdown without awaiting it. Consequently,
pattern readback can match while physical output remains dark or externally
controlled. These are confirmed code paths; physical reproduction is still
unperformed. The fix needs an explicit, power-safe handoff, not a brighter
recovery command used as a shortcut.

Other items below are marked as required implementation, required proof, or
conditional repair. An untested edge is not automatically a confirmed defect.

## 3. Contracts every workstream must preserve

1. **One mapping model.** Physical outputs/runs, artwork strips/sections, patch
   IDs, and runtime zone IDs retain their distinct purposes. Derive their
   relationship through the existing compiler and section model. Do not add a
   second persistent `outputLooks` store that competes with patch playback.
2. **Explicit scope.** An output may contain several sections; one section may
   span several outputs. The UI shows this honestly. All means the stated
   eligible target set; an unknown/missing target never falls back to all.
3. **Same pattern is defined.** It means the same selected pattern and intended
   controls on the selected targets. It does not promise identical animation
   phase or one continuous moving image across disjoint strips. Those stronger
   behaviors require explicit existing capability or a separate future feature.
4. **Counts remain facts.** Probe headroom is never promoted to a measured count.
   Pin, count, range, direction, order, and source-LED associations survive every
   conversion. Respect control-pin reservations and the connected card's limits.
5. **Separate states.** Draft, kept project, temporary preview, confirmed live
   playback, installed runtime, and editable card backup are not interchangeable.
   Status comes from verified evidence and is invalidated by relevant edits.
6. **Exact authority.** Every write belongs to an identified card, transport,
   project, boot/session, and current operation. A stale response cannot save
   into another project, restore into another card, or certify a newer draft.
7. **Restoration is an operation.** Capture before the first write, including all
   fields the operation changes; serialize writes, stop streaming deliberately,
   restore only while ownership is still valid, and verify the restored result.
   Missing acknowledgement requires readback, not an automatic duplicate write.
8. **Install one immutable snapshot.** Editable source and compiled runtime must
   describe that snapshot. Report saved-but-not-installed and partial failures
   truthfully. Known-good wiring and exact readback are prerequisites for success.
9. **Explicit playback precedence.** Installed startup, enabled playlist, saved
   combined looks, temporary overrides, remembered live state, and existing SD
   playback have documented precedence. A prior manual override must not silently
   replace a newly installed design.
10. **No silent capacity loss.** Derive limits from the shared contract and card
    capabilities; reject or explain unsupported output, pixel, zone, range,
    look, playlist, and storage sizes before sending a truncated package.

The repository manifest currently declares four outputs, twelve zones, six
ranges per zone, and 3968 config bytes. Its pixel ceiling is not a promise that
every connected firmware or installation supports that count or performance;
apply the connected card's lower limits and measured runtime constraints.

## 4. Integration map

| Boundary | Existing source to extend or prove | Required outcome |
| --- | --- | --- |
| Count → measured project | `StripDiscoveryPanel.jsx`, `stripDiscovery.js`, `discoveryCommit.js`, `benchConfig.js` | Only confirmed ports/counts become measured sections; choices follow their GPIOs. |
| Artwork → independent controls | `useLayoutStrips.js`, `stripSplit.js`, `wiringModel.js`, `wiringCompiler.js`, `patchBoard.js` | Guided separation preserves physical mapping, geometry, and references. |
| Target → chosen look | `sectionLookModel.js`, `lw-pattern.jsx`, `connectedSections.js` | All/selected behavior agrees with compiled zones and supported pattern scope. |
| Choice → durable source | `ProjectContext.jsx`, `projectModel.js`, project repository/transfer and library helpers | Save/reopen/import/export/copy/cloud/card-source routes retain the same choices. |
| Source → native runtime | `cardRuntimeProject.js`, `cardRuntimeContract.js`, `cardStoragePayload.js` | Correct ranges, controls, startup/playlist behavior, and capacity refusal. |
| Temporary playback → restore | `benchPatternAudition.js`, `cardTransport.js`, `cardBridge.js`, preview-session helpers | Same contract on direct and bridge paths, including failures and ownership loss. |
| Install → confirmed state | `cardSetupDeploy.js`, `cardDeployment.js`, `cardProjectSave.js`, `CardInstallAction.jsx`, wiring safety helpers | One consistent installation meaning and source/runtime readback. |
| Saved sections → Lab/Show/Playlist | scene-expression target/project/native/delivery helpers, `cardPlaylist.js` | Existing references remain valid or require an explicit repair before playback. |
| Runtime → other controls | firmware `main.cpp`, `LightweaverWeb.cpp`, WLED JSON/WS, realtime and sequence handlers | Existing controls preserve explicit selected/global scope and takeover behavior. |
| Local change → public/offline surfaces | Vite/card-Studio build, service worker/build graph, release workflows | Public Studio, card-hosted Studio and recovery UI expose compatible behavior. |

Paths in this table are relative to `lightweaver/src/` or
`firmware/lightweaver-controller/src/` as appropriate. The packages, tests and
release scripts named below remain authoritative; do not duplicate them.

## 5. Work packages and acceptance

### GP-00 — Freeze semantics and reusable fixtures

Owner: manager with App A and Bench B. Type: required contract work.

Record the identity/target relationship, All behavior, supported pattern classes,
startup precedence, and draft/preview/installed states above as executable
fixtures. Use one-, two-, three-, and four-output projects with unequal counts,
reversed runs, several sections on one output, and a section spanning outputs.
Keep expected physical LED addresses independently specified so tests do not
merely repeat the implementation.

Done when each later package can consume the same fixture and expected physical
map. No schema change or new authority layer is approved implicitly by this plan.

### GP-01 — Repair Bench commands against the real firmware contract

Owner: Bench B. Type: release-blocking implementation. Depends on GP-00.
Files: `benchPatternAudition.js`, its tests, and the Bench panel call sites.

- Reproduce the redundant-sync 422. Send a sync mutation only when fresh state
  differs, then verify; handle already-restored state as successful readback.
- Restrict the measured chooser and All operation to confirmed ports. When only
  some provisioned ports are confirmed, use explicit zone targets rather than
  a global broadcast. Preserve other zones and never derive counts from headroom.
- Await stream shutdown and explicitly transfer rendering ownership from the
  provisional stream/blackout state to native pattern output. Resolve the zero-
  fade issue with Firmware C before choosing the implementation. Preserve the
  dim Bench brightness and current limit. Do not blindly use recover-lights:
  that handler enforces at least 0.65 brightness and changes additional state.
  Restore and verify every global/zone/source field the chosen handoff changes.
- Make mocks enforce native refusal, target, sync, stream and blackout behavior.

Done when single/multiple GPIO Stop, Keep, Keep/install and failure recovery pass
against firmware-shaped responses, including baseline sync false, partial ports,
missing zones, dropped replies and unchanged/unselected outputs. Real rendering
is additionally required in GP-11.

### GP-02 — Complete the preview and legacy-upgrade lifecycle

Owner: Bench B. Type: required integration/proof; repair failures found.
Files: Bench panel/helper, `benchInstall.js`; narrowly assigned transport helpers.
Depends on GP-01 before final integration.

Prove direct, HTTPS-to-card bridge, and local-origin behavior; fresh authority on
every mutation; card/boot/project changes; rapid taps; disconnect/reconnect;
Stop/close/navigation/background; pending-write cancellation; and failed restore.
Retain a visible restore failure without a false saved/installed state.

An explicit legacy one-zone upgrade must preserve confirmed answers, output
ordering, chipset, color order, controls, supply/current limits and artwork.
Recover from interrupted/rejected upgrades without repeating the entire count.
Do not silently update configuration on a pattern tap.

Done when the direct and bridge browser journeys exercise actual controls and
readbacks, an older multi-output setup upgrades once, and failed/stale operations
produce zero unauthorized writes or cross-project source changes.

### GP-03 — Make independent output sections a guided Layout operation

Owner: App A. Type: required implementation. Depends on GP-00.
Files: Layout hooks/UI, split/wiring/patch helpers, section-family operations.

Replace the current Advanced-wiring dead end with a previewable action for
separating a logical section at its existing output/run boundaries. Reuse the
current section-family and physical-run model. Show resulting section names,
GPIOs, counts, and affected looks/scenes before applying; provide Undo.

Preserve every source LED, global/physical order, reversed direction, geometry,
and intended hidden/off state. Refuse ambiguous duplicate/overlapping mappings
with a specific repair action. Apply actual change classification: a logical
target change must not invent a physical rewiring requirement, while genuine
physical-map changes must invalidate the appropriate verification.

Produce an explicit old-to-new identity map for GP-05/06. All/same-pattern actions
must not merge geometry simply to make effects equal.

The Layout audit confirms that layer groups can compile several strips into one
zone; the current look model takes that zone's first member patch. Conflicting
member patterns therefore require an explicit grouping change or a precise
refusal. Preserve group membership and existing scene-expression constraints;
do not redefine GPIO as zone identity or silently discard other member choices.

Done when supported cross-GPIO and same-GPIO multi-section examples can become
independent using ordinary controls, Undo restores them, and physical-address
mapping is unchanged wherever the operation promises it is unchanged.

### GP-04 — Finish one consistent pattern chooser and supported-pattern policy

Owner: App A after GP-03; Bench B integrates the shared chooser by handoff.
Type: required UX integration. Files: pattern catalog/section model, Patterns UI,
Bench chooser and scoped styles. Depends on GP-00; GP-01 before Bench delivery.

Bench currently offers a small fixed list. Reuse the authoritative compatible
pattern catalog with search, readable names/previews, measured GPIO rows, counts,
and clear current/saved/temporary labels. Support the same built-in patterns and
controls promised by the installed firmware. Identify saved combined looks,
custom recipes, sequences, and preview-only designs separately; do not silently
substitute a built-in effect for something that cannot be installed exactly.

Make whole-piece versus selected-target scope apparent before selection. Keep
the phone target selector reachable, keyboard order logical, and failure text
beside the relevant action. Provide a direct handoff to the full Patterns editor.

Done when a first-time user can choose same → different → change one → Keep
without knowing zone terminology, and compatibility/capacity failures offer a
specific next action. Browser proof plus observed novice use are separate gates.

### GP-05 — Preserve references and project data through every editing route

Owner: App A, sequential ownership of `ProjectContext.jsx` and shared helpers.
Type: required integration/proof; repairs as needed. Depends on GP-03 identity map.

Migrate or explicitly block affected patch playback, saved combined looks,
section selections, scene-expression leaf/group targets, playlist references,
section families, and wiring links after split/combine/delete/reorder/count edits.
Do not silently retarget an old scene to all outputs or drop an orphan reference.

Splitting retains the first strip ID and creates additional IDs. Expand inherited
playback and every saved look's patch references through the identity map, and
migrate strip-keyed scene assignments in the same transaction. Validate production
job backups separately because their restore schema accepts exact keys.

Prove Undo/Redo, autosave, explicit project save, reload/reopen, JSON export/import,
project copy/templates, existing cloud/library routes and editable card backup.
Copies must not inherit authority to mutate the original card. Preserve source
revision/fingerprint semantics and show drafts as distinct from installed state.

Done when independently specified fixtures round-trip through each supported
repository without changed counts/routes/choices, and stale asynchronous saves
cannot mutate a different project. Migration, if needed, is versioned and tested
against old fixtures; no gratuitous schema version bump.

### GP-06 — Unify runtime packaging and installation completion

Owner: Bench B for deployment helpers; App A hands over runtime/section helpers
only after GP-05. Type: required integration. Depends on GP-01, GP-05.

Use the established Test & Install contract for final installation from Layout,
Patterns, Playlist and Bench. Temporary Bench provisioning remains explicitly
provisional. Audit the separate `deploySetupToCard` route for semantic parity;
reuse shared orchestration rather than maintaining competing success rules.

Snapshot the complete intended project once. Preserve matching editable source
and compiled runtime, exact card/project identity, output order, range/LED map,
chosen controls, combined startup and explicit playlist intent. Compare stored
look definitions as well as current playback; a coincidentally matching running
pattern does not prove the saved restart result. Include storage/capability
preflight, staged/activate/confirm/rollback, dropped replies, retry, and edits
during installation. Same-total wrong-pin/wrong-zone configurations must fail.

If arming requires a new firmware capability, negotiate it explicitly: newer
Studio with older firmware offers the supported preserving update/handoff and
does not pretend the new path works. Retain compatibility for older Studio with
newer firmware where promised. Test mixed cached/public/card-hosted versions.

Done when every entry point reports the same pending/saved/not-installed/current
states, partial failure preserves a recoverable known-good setup, and readback
can distinguish the installed snapshot from a newer draft. Final wiring changes
still require the existing physical confirmation gate.

### GP-07 — Prove restart precedence and repair firmware only where needed

Owner: Firmware C. Type: required native proof; conditional implementation.
Files: firmware runtime/storage/live-look/playlist/sequence code and host tests.
Early arming diagnosis depends on GP-00 and blocks GP-01; final persistence proof
depends on a stable intended config from GP-06.

First determine whether an existing safe command can rearm provisional native
playback at the intended dim brightness without touching unselected outputs. If
not, implement a narrow firmware contract with explicit admission, affected
outputs, current limits, acknowledgement and rendering-state readback. Avoid
making every pattern selection implicitly bypass provisional output policy.

Reproduce direct config save and staged activation/confirmation/rollback with
the same and changed revisions/fingerprints. The previous audit identified a
same-revision staged-config/remembered-live-look risk; determine exact behavior
before deciding the repair. Ensure a stale remembered override cannot resurrect
old per-zone patterns over a newly installed configuration.

Cover cold boot, power loss, invalid saved state, missing/invalid SD, valid SD
priority, playlist pause/resume, and zone identity changes. Explicitly document
whether temporary previews can survive reboot and how they are cleared. Exercise
the production parser/dispatcher/storage paths, not only source-text assertions.

Done when startup priority has executable native evidence and physical restart
proof. No firmware bump/sign/flash merely because this workstream exists. If a
firmware change is necessary, test it, then use the protected preserving release
path at the separately authorized release boundary.

### GP-08 — Integrate every existing playback consumer

Owner: App A for Lab/Show/Playlist; Firmware C for card controls/protocols.
Type: required non-regression proof; conditional fixes. Depends on GP-05/07.

Check named native scenes and timed cuts, saved combined looks, playlist steps,
card-local visitor selection, installed card-hosted Studio, rotary/next/previous,
brightness, blackout/Stop, recovery, WLED JSON/WS segment controls, and existing
realtime/SD paths. Identify global actions clearly. Supported selected-section
actions must affect only that section, including disjoint physical ranges.

Takeover and release must have one documented owner and restoration rule. Verify
existing Art-Net/realtime routes do not corrupt saved independent patterns; this
does not authorize building new Madrix, Pi, recording, or WLED features. For
unsupported segment/recipe modes, reject honestly rather than flattening scopes.

Done when representative transitions between these existing consumers preserve
mapping, stored project state, and intended playback precedence.

### GP-09 — Repair Windows verification without weakening release checks

Owner: CI/docs D, with App A handoff for test-only edits under `src/lib/`.
Type: required tooling repair before claiming a green Windows checkpoint.
Can run independently of feature implementation.

- Normalize text-only source scans/header assertions where line endings are
  irrelevant; keep exact-byte signed fixtures and signatures exact.
- Make firmware fixture/key tests portable without accepting altered binaries,
  signatures, tickets, or production keys.
- Use meaningful platform-appropriate permission tests for signing fixtures;
  retain production signer security. If a production signer is Linux-only,
  prove it there and state that boundary instead of bypassing its checks.
- Fix Windows invocation in `scripts/lightweaver-dev.mjs` and the native Rollup
  package resolver so the documented checkpoint command actually works.

Done when the six known failures have proper fixes or an explicit supported-
platform execution contract, Windows/Linux CI demonstrates the result, and no
security assertion has been weakened to manufacture green output.

### GP-10 — Build the integrated acceptance suite and evidence record

Owner: QA E; application owners implement any product repairs.
Type: required proof. Fixture work starts after GP-00; final run after GP-01–09.

Use the matrix below. Add only meaningful missing regressions; reuse existing
tests. Mocks must refuse invalid/no-op operations like firmware, model blackout,
streams and candidate rollback, and return independently updated state. Browser
tests must click the real user actions, await durable source, and examine actual
requests/readback; no manufactured fallback counts or replacement project data.

Done when every mandatory row has result, revision, command/browser, evidence
path and limitations. Test names alone or screenshots of unused controls are not
interaction proof. One stable preview and one browser owner at a time.

### GP-11 — Observe hardware, publish, and verify the exact release

Owner: manager/release D; Firmware C handles machine diagnostics; Adrian supplies
one physical observation at a time. Type: required delivery, separately gated.
Depends on passing applicable GP-10 checks and explicit release authorization.

Observe independent/same patterns on unequal real strips; verify pin/count/order/
direction/color, change-one retention, Stop/restore, loss/reconnect, and offline
cold restart. Record card/boot/build IDs, source/config fingerprints, supply/current
limit, topology, commands, and human observations separately. Preserve configured
cards; use the preserving updater only if firmware proof requires it.

On authorized shipment: required PR gates → merge → protected signer if needed →
credentialed production deploy → strict no-store release marker and exact build-
graph verification on terminal `origin/main`. Verify public and card-hosted/offline
surfaces according to changed assets. Report Studio and firmware build numbers.

Public deployment alone does not update a firmware-embedded Studio bundle.
Include `scripts/build-card-studio.mjs` and the embedded bundle/version contract
when that surface needs the new UI. Build/sign/update it through the approved
release path, or clearly identify it as still on the older supported workflow.
Do not present the public-site change as delivery to every offline card.

The exhaustive Prove run is a later frozen-target run under
`docs/workflows/prove.md`: normally at least twenty minutes plus hardware work,
with explicit authorization, a session record and honest NOT RUN/WAIVED gates.
Preparing this matrix does not start it.

## 6. Agents, ownership and execution order

| Role | Model | Owns | Does not own |
| --- | --- | --- | --- |
| Manager | Primary; Astra only for necessary cross-boundary decisions | Contracts, priorities, workboard, ownership handoffs, integration and acceptance | Routine delegated implementation |
| App A: Layout/Patterns | Sol medium; high only for identity migration | GP-03/04/05 and application half of GP-08; Layout/Patterns/shared section source | Bench panel, transport helpers, firmware |
| Bench B: lifecycle/install | Sol medium; high for authority/persistence | GP-01/02/06; Bench panel/helpers, deployment orchestration and its tests | Layout transformations, firmware |
| Firmware C | Sol high | GP-07 and native half of GP-08; firmware source/native tests | Studio source, release signing |
| CI/docs D | Sol medium; narrow security decision escalated as needed | GP-09, scripts/workflows/docs and release machinery | Changing app behavior or weakening signing policy |
| QA E | Luna for inventory/matrix/docs; Sol for browser/native fixtures | GP-10 tests and reproducible evidence | Independently rewriting product behavior |

These are roles, not six simultaneous workers. Use **at most three useful
workers plus the manager**. Reuse the existing Studio task
`01a0d750-d4a2-71c0-94ee-69bdd43ab44a` and Bench task
`01a0d750-c4fc-7ee2-82ce-fe716e1c17d6`. Rotate the third slot. Existing source
ownership in `AGENTS.md` still applies; A/B are non-overlapping subdivisions of
the lightweaver-app role. Do not touch `led-art-mapper/app/src/` without a separately
bounded mapper-owner task if an actual import/export dependency requires it.

| Wave | Concurrent work | Integration gate |
| --- | --- | --- |
| 0 | Manager + A/B settle GP-00; Luna inventories test evidence | Written contracts/fixtures and release-blocker reproductions |
| 1 | A: GP-03; B: GP-01/02; C: early GP-07 arming diagnosis, then D takes that slot for GP-09 | Native playback is visibly armed at dim limits; Stop/Keep works against native semantics; section transformation is lossless |
| 2 | A: GP-04/05; B: GP-06 deployment portions; C: GP-07 native diagnosis | Identity map/reference migration and stable intended runtime agree |
| 3 | A/B finish chooser/install handoff; C: GP-08 native consumers; QA slot when one finishes | All touched consumers obey the same scope/state contracts |
| 4 | QA/owners: GP-10; manager integrates | One checkpoint per coherent batch, complete final matrix and known issues |
| 5 | GP-11 hardware/release under its authorizations | Exact live revision/build evidence and separately recorded hardware result |

Shared-file handoffs are explicit: A finishes section/runtime model edits before
B integrates GP-06 there; B exclusively owns transport/deployment helpers during
that integration. `ProjectContext.jsx` has one writer. QA test-file ownership is
also assigned before dispatch. The manager alone edits the workboard and decides
whether a new native bug actually requires firmware changes.

Each dispatch includes one bounded outcome, exact files, dependencies, a failing
regression or proof question, acceptance checks and a stop condition. Return a
commit plus commands/results, screen evidence, caveats and integration notes.
At twenty minutes without a working result, identify the bottleneck and split or
simplify the task. Do not run a full release suite per edit.

## 7. Required acceptance matrix

Use deterministic boundary cases plus representative combinations; do not run
an indiscriminate Cartesian product of every pattern, browser and topology.

| Dimension | Mandatory cases | Proof |
| --- | --- | --- |
| Topology | 1/2/3/4 outputs; unequal lengths; multiple sections on one GPIO; one section across GPIOs; reversed/disjoint runs | Independent physical-address oracle + browser split/Undo |
| Capacity | Zero/missing target, reserved pin, duplicate/overlap, exact supported bounds and one-over output/pixel/zone/range/look/byte limits | Preflight refusal with affected target; no truncation |
| Pattern scope | Same all, different each, edit one, return to same, parameter-only edit, unsupported recipe/sequence | Requests + unselected state unchanged + UI scope |
| Bench | Partial confirmed ports, real measured counts, old one-zone setup, retry/resume, current limit/chipset/color preservation | Direct and bridge user journeys + exact saved source |
| Native command semantics | Sync false/true and unchanged sync; blackout; stream active/ending; missing zone; refused selection | Production dispatcher/native fixture; faithful browser mock |
| Temporary session | Rapid inputs, lost reply, delayed readback, Stop, close, project/card/boot switch, reconnect, failed restore | No stale or unintended writes; truthful status |
| Durability | Keep/reload/reopen, Undo/Redo, split/delete/reorder, copy/import/export/cloud/card backup | Exact mapping, choices, references and ownership round-trip |
| Install | Playback-only vs wiring edit, wrong-card/same-total-wrong-map, staged/confirmed/rollback, partial source/runtime save, edit mid-install | Exact intended snapshot and known-good state; recoverable failure |
| Startup | New install, prior manual override, same/new revision, playlist, invalid state, SD precedence, cold boot | Native persistence tests + observed offline power cycle |
| Other consumers | Lab/Show native scene, playlist combo, card page, knobs, WLED JSON/WS and enabled realtime/SD takeover | Correct selected/global effect and return state |
| Browser/transport | Desktop Chromium, direct/local origin, public HTTPS bridge, 390px touch, keyboard; supported phone/Safari handoffs | Automated supported routes + real-device observation per checklist |
| Shipping/cache | Public build marker/assets, card-hosted Studio compatibility, offline cache refresh/recovery | Exact deployed graph/builds; no stale UI claim |
| Novice use | Same → different → Keep → install → reopen without coaching | Human observation with friction recorded, not assumed |

Relevant existing test starting points: `patterns-v3.spec.ts`,
`patterns-section-row.spec.ts`, `strip-discovery.spec.ts`, Layout divide/wiring
specs, scene-expression lifecycle/install specs, project library/transfer tests,
`cardRuntimeProject.multiOutput.test.js`, `benchPatternAudition.test.js`,
`benchMeasuredInstall.test.js`, `cardConnection.test.js`, wiring/compiler/storage
tests and firmware provisional/combo/control/persistence contracts.

## 8. Gates and scope limits

For each implementation defect: witness focused red → implement → focused green
→ inspect the actual screen when UI changed. At a coherent checkpoint run the
complete library units and production build, relevant interaction specs, and
native contracts when their wire/source boundary changed. Fix the documented
Windows runner first or record the equivalent Node22 commands truthfully.

For shipment, use `docs/deployment-checklist.md` and the release gate; do not
substitute a local successful build or mocked card for live/hardware evidence.
For Prove, use its explicit frozen-target workflow and record every missing gate.

Not included merely because they are adjacent: new Pi runtime, multi-card project
ownership, additional GPIO/RMT capacity, new chipset combinations, new protocols,
new Art-Net/recording infrastructure, or arbitrary continuous phase-synchronized
effects across outputs. Existing supported versions of these consumers must not
regress, but expanding their product scope needs a demonstrated requirement.

The immediate next build is **GP-01**, paired with Firmware C's arming diagnosis,
and GP-03 in parallel after GP-00 fixtures. GP-09 takes the third slot when the
native diagnosis hands back. Do not ship the current local Bench path before
its restoration, rendering-handoff and confirmed-port scope blockers are fixed.
