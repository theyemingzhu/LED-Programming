# Parallel Lightweaver delivery — 2026-11-17

Manager worktree: `/Users/adrianrasmussen/.codex/worktrees/27e4/led`.
Baseline: `a73e56e12c9947499f422b56d3679e2604b581f2`.
All six chats created on local host with `gpt-6.1-sol`, medium effort; immediate wait snapshot confirmed each active. No completion claimed.

User authorized new parallel chats and manager coordination. These replace the earlier three-worker capacity assumption: separate chats have independent execution. Shared checkout requires strict file ownership; no worker commits, pushes, deployment or hardware writes. Manager owns integration. Shared schema/state/global shell/firmware edits remain reserved.

| Stream | Chat ID | State | Handoff |
| --- | --- | --- | --- |
| Lightweaver — setup and update readiness | `01a1e7ec-bc9e-7383-b3fc-0a02d19624a6` | active | parallel-readiness.md |
| Lightweaver — complete looks and safe changes | `01a1e7ec-c1cc-7fa0-8bf6-914300de505f` | active | parallel-saved_looks.md |
| Lightweaver — visual layout and connections | `01a1e7ec-c7eb-7cb1-a899-5e47a52d4015` | active | parallel-layout.md |
| Lightweaver — customer A B C player | `01a1e7ec-ce4e-7a01-8718-4074cc4b3c7f` | active | parallel-player.md |
| Lightweaver — sound execution clarity | `01a1e7ec-d61b-72c2-99a4-879b0257f7b4` | active | parallel-sound.md |
| Lightweaver — UI organization and visual proposals | `01a1e7ec-e0fa-7291-a0b9-a13fc1028f18` | active | parallel-ui_structure.md |

## Scope briefs

### Lightweaver — setup and update readiness

You are the Studio readiness owner. Own only lightweaver/src/lib/cardCommissioningFlow.js, its direct tests, and NEW readiness-specific helper/tests with unique names. Inspect connection/update UI and firmware read-only. Finish a tested model of arrival/resume readiness separating compatible vs update-required vs unverified from per-task unfinished state, preserving existing interface behavior. First reproduce gaps against existing arrival tests; implement bounded helper/model fixes only, not a new global architecture or forced wizard. No edits to app.jsx, lw-card.jsx, shared project model, update machinery or firmware. Report exact integration points for UI owner. Must include lights-verified/layout-missing, optional update, older project/newer firmware and post-update evidence unknown. Do not infer a newer version always requires update.

### Lightweaver — complete looks and safe changes

You are the Studio persistence/complete-look owner. Own only lightweaver/src/lib/projectStacks.js, sectionLookModel.js, cardRuntimeProject.js, cardProjectSave.js, cardProjectRepository.js, projectTransfer.js and their directly corresponding tests. Finish focused baseline proof and bounded fixes for complete A/B/C assignments/symmetry/tuning preservation and explicit invalidation on section add/split/remove/reorder. Inspect current tests first; do not add tests merely mirroring implementation. Preserve formats/API and stable IDs. Do not edit projectModel.js, providers, customer controls, UI, layout helpers or firmware. Report unresolved startup and whole-look customer adjustment semantics instead of inventing product decisions. Include recovery/recording backup limitations; no schema migration.

### Lightweaver — visual layout and connections

You are the lightweaver-app Layout owner. Own lightweaver/src/components/LayoutScreen.jsx, components/layout/**, and lib/layoutFrameMapping.js plus directly relevant layout tests. Exclude shared styles outside layout, app.jsx, project state, saved-look compiler and Mapper source. Finish a coherent compact Layout improvement using existing contracts: SVG/DIY/shape entry clarity, distinguish artwork vs LED paths, selection/connection/count/direction context and purpose-preserving toolbar organization. Source audit found wrapped phone toolbar and duplicate project import/export. First capture current screen with representative artwork, make bounded changes that preserve features; inspect resulting desktop and 390px phone screens and test affected behavior. Do not blindly remove controls; explain jobs and integrate only genuine duplicate entrances. No accordions/expanders. No changes to structural identity/order semantics without coordinated contract. Preserve existing vector artwork and warn/clarify replacement effects using current mechanisms.

### Lightweaver — customer A B C player

You are the lightweaver-app customer Player owner. Own lightweaver/src/client/ClientApp.jsx, client.css and direct client UI tests; clientModel.js only for presentation-safe behavior with unchanged command contract. No edits to clientTransport/clientPairing, shared cardCustomerControls, firmware or Studio. Finish a compact customer view putting installed complete-look choices A/B/C within first phone viewport, clear active look, brightness/off and optional playlist. Preserve all existing functions including saved tuning; relocate secondary tuning with ordinary navigation if useful, no accordions. Decorative pattern art is not faithful preview; do not imply it is. Preserve whole-look syncZones calls and exact-card protections. Test desktop/phone with realistic long names, simulated A/B/C transitions and focused existing tests. Flag temporary edit/reconnect semantics if not safely resolvable within owned files.

### Lightweaver — sound execution clarity

You are the lightweaver-app sound owner. Own only lightweaver/src/v3/lw-show.jsx, sound-specific local styles if uniquely scoped, lib/showComposition.js and direct Show/composition tests. Inspect Lab/firmware read-only. Finish truthful visible execution labels for live browser streaming vs recorded motion/native playback wherever already represented in Show, preserve modes/voices and control handback. Investigate separate localStorage composition portability; only bounded existing-helper export/import wiring is in scope if no schema/shared-state changes and it can be tested. Otherwise deliver exact proven gap and integration recommendation, not a migration. Do not implement standalone microphone firmware or modify Lab/shared project transfer. Core looks must not be gated on sound. Verify actual screen, focused tests, and avoid adding clutter or accordions.

### Lightweaver — UI organization and visual proposals

You are the UI organization designer. Read all relevant screens but DO NOT edit product source. Own only docs/journeys/parallel-ui-organization.md and files under docs/journeys/ui-proposals/. Finish matched current/proposed visual comparisons with same representative artwork and desktop/phone viewport for shared navigation, saved/installed/current state and complete-look editor/Playlist organization. Incorporate six ongoing streams without duplicating their implementations. Propose compact controls, icons with labels where unfamiliar, selection connectors, purposeful backgrounds and clustering. Every proposed move/removal must state original purpose and preserved destination; no accordions. Include explicit screen route/entry/return map and actionable next-wave file ownership. Do not build a full alternative app or new backend. Produce actual viewable artifacts and focused recommendations, not another broad source audit.

## Resumption

Use wait_threads with the six IDs and hostId local for a compact status snapshot; retain returned cursors for subsequent bounded waits. Read completed handoff files, review exact owned diffs and integrate dependencies before combined tests. Do not assume completed worker output is integrated or shipped. Keep one current task register in LIGHTWEAVER_WORKBOARD.md; this file is the dispatch/ownership reference. No automatic release is authorized.


## Coordination checkpoint — second increments started

All six first-pass handoffs were read by the manager. Initial saved-look diffs
and Player/organization screenshots were reviewed. Workers reported focused passes;
manager combined acceptance is still pending. Initial source changes are local,
uncommitted and unshipped. All six next turns were confirmed active via wait_threads.

Adrian explicitly authorized workers to message the manager when needed. Manager
chat: `01a1e7c9-9a2a-76e0-bc65-f202513a921a`, host `local`. This supersedes the
initial brief's restriction on messages back: report concrete blockers, shared
contract decisions and ready handoffs, not heartbeats. Authorization is verifiable
in the manager chat's direct user message beginning “Leave the code for now.”
The code is set aside and was not forwarded.

| Owner | First increment | Active next increment / expanded boundary |
| --- | --- | --- |
| Readiness | Additive tested arrival model; 218 focused checks reported | Wire Card Home resume/update labels. Exclusively owns minimal app.jsx wiring, lw-card.jsx, useSetupJourney.js and CardFacts.jsx this wave; no global navigation redesign. |
| Saved looks | Canonical ID/legacy assignment/collision fixes; 3,119 unit checks reported | Exclusively owns projectModel.js and direct tests to preserve saved assignments through explicit legacy namespace renames. No storage-format migration. |
| Layout | Compact create/view toolbar, selected-strip connection facts, import replacement confirmation; 10 final focused browser checks reported | Split-inherited assignment review using existing mechanisms; resolve two stale layout selectors. Escalate missing persistence contract before inventing fields. |
| Player | A/B/C visible on phone, focused tuning and playlist, labels for active/off/offline; 12 browser + 8 model checks and build reported | Read-only/existing-harness proof of multi-zone tuning and reboot semantics. No further styling or behavior changes while product semantics remain unresolved. |
| Sound | Explicit live/native/recorded labels and phone transport; 17 browser checks reported | Separate validated Voices export/import with clean-browser restore and malformed/wrong-project rejection. Existing Show/model ownership only. |
| UI organization | Six matched current/proposed comparisons, route/purpose map | Now owns lw-pattern.jsx, lw-playlist.jsx, ProjectStackSummary and scoped styles/tests. Fix per-look mirror review/canonical dirty checks first, then bounded complete-look organization. No app.jsx/routes/global CSS changes. |

Cross-stream decisions still open: startup default versus resume-last semantics;
whole-look relative versus absolute customer tuning; grouped-section stable IDs;
persisted review after split transactions. These block only dependent changes,
not the independent work above. Physical multi-GPIO playback, restart, offline
fallback and fresh backup recovery remain bench proof, not simulated passes.

Manager integration order: legacy IDs and section helpers → per-look editor
review; readiness projection → truthful Card Home; isolated Layout/Player/Show
presentation can integrate alongside these. Run combined checks against settled
files once; never infer final integration from each worker's isolated success.

## Split-review decision raised

Layout reports Separate existing runs preserves physical mapping and clones
assignments. A durable human-review marker does not currently exist, but absence
of that marker is not itself proof that this equivalent transaction is unsafe.
Manager directed Layout/persistence to establish whether semantics actually change
before adding a gate. No new stored fields or blanket invalidation approved.
Editor continues existing per-look compatibility fixes. The user's instruction to
leave the code referred to a verification code, not a development pause; clarified
to the affected owners.

## Subsequent integration findings

Legacy namespace migration finished with 180 affected tests reported. Readiness
Card Home wiring finished with 15 browser and 218 unit checks reported; separate
post-update signal still requires minimal producer/consumer coordination.

Player host-harness/source investigation found live/save zone-scope inconsistency
and boot look-identity/state mismatch. User questions are pending for relative vs
uniform tuning and default vs last-look startup. No behavior change authorized
by inferred preference; worker prepares exact minimal implementation proposal.
Other work remains active. These are blockers to release claims about tuning and
restart, not reasons to stall the whole build.

## Post-update evidence integration approved

Readiness owner may edit lw-flash.jsx/app.jsx and its unique persistence helper
to retain correlated update completion before session clearing. Scope: exact card,
signed build, nonempty matching installed head/fingerprint, boot provenance. No
provider/updater/firmware/project-format edits. Exclude rollback and empty bootstrap.
Notice is advisory and must not grant or block playback independently of existing
gates; reconnect/readback alone does not prove A/B/C physical recall. Test mismatches,
reload, idempotence and storage failure. No fabricated full-verification clearing.

## Policies resolved and ownership expanded

Adrian explicitly chose relative whole-look adjustments preserving section
differences, and configured-default startup with saved settings. Player owner now
exclusively owns the minimal firmware/runtime/storage/API/bridge and client
capability changes plus tests. Effort raised to Sol high for the cross-runtime
contract. Preserve v1 absolute meanings, consistent live/save target scope and
existing limits/recording gates. Default boot must skip unrelated old live overlay.
No hardware writes, release VERSION bump, commits or deployment. New mandatory
migration/scope expansion needs manager review. Other owners informed.
