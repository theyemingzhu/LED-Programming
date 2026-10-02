# Lightweaver card-first resume implementation plan

> For agentic workers: use the available executing-plans skill for execution, subject to AGENTS.md ownership and proportional verification. Use a bounded app owner and, only when needed, a separate firmware owner. Do not create an agent per checklist item.

**Goal:** Opening Studio recognises the connected card's installed state, resumes useful control without restarting setup, preserves browser drafts and playback, and presents consistent status everywhere.

**Architecture:** Extend the existing card evidence, lifecycle, setup journey and installed-control paths. Derive one shared session view from fresh card evidence and a separate browser-draft comparison; do not introduce a second transport, playback engine or competing lifecycle machine. A compact state code summarises evidence but never authorises writes by itself.

**Tech stack:** React/Vite Studio, existing local HTTP/card-page bridge, ESP32-S3 firmware, Node unit tests and Playwright browser regressions.

**Status:** Plan requested; implementation and release have not started under this plan. Source inspected at local HEAD `8bbf965f` on 2026-09-29, with unrelated work present. Recheck the execution base before edits.

---

## 1. Product outcome and scope

The reported failure: a card is visibly playing, but Studio opens a setup ladder, asks about counting pixels, and blocks pattern changes because its draft and the installed layout differ. The supplied screenshot reports Connected, 41 pixels on GPIO 18, Studio build 2302 and card firmware build 2160. These are screenshot observations, not fresh device measurements.

The desired first screen answers four questions: which card is connected, what it holds, what it reports playing, and what action is available now. It does not imply that visible output has been physically verified.

Example, only when supported by fresh evidence:

```text
Untitled Project                         Connected
On this card: 41 configured pixels · GPIO 18
Playing: [name reported by card]

[Installed playback controls]

Your draft has different sections.
[Review draft changes]  [Open installed project]

Checks: colour confirmation not recorded   [Review checks]
```

Do not fabricate a pattern name or show Playing merely because playbackReady is true. If only configuration is known, show Installed and the last known pattern with its freshness explicitly labelled.

Included: card-first entry, installed-versus-draft separation, consistent status/actions, scoped verification, reconnect recovery, capability-based compatibility, action readback and focused diagnostics.

Excluded: Pi runtime, automatic physical pixel detection, new cloud accounts/database/relay, client-player domain deployment, unrelated pattern/layout redesign, firmware replacement solely to improve screen routing. The separately approved client-player plan remains its own delivery; reuse shared controls and coordinate overlapping files.

## 2. Existing implementation and concrete gaps

All paths below are relative to repository root.

| Existing files | Responsibility / change boundary |
| --- | --- |
| `firmware/lightweaver-controller/src/LightweaverStorage.cpp` | Already emits cardId, bootId, readiness flags, provisionalSetup, project revision/fingerprint, wiring revision/digest, outputs and current pattern. Extend only for a proven missing contract. |
| `lightweaver/src/lib/cardReadiness.js`, `cardLink.js`, `cardJourneyEvidence.js` | Preserve exact-card transport authority and fresh evidence. Carry one coherent observation into consumers. |
| `lightweaver/src/lib/cardLifecycle.js` | Currently includes browser project matching in its ready state. Separate installed-control eligibility from draft edit eligibility without weakening existing edit gates. |
| `lightweaver/src/lib/setupJourneyInputs.js`, `setupJourney.js`, `cardFlowEntry.js` | Shared setup derivation already exists. Restrict setup routing to actual setup intent or missing installation; a draft conflict is not a blank card. |
| `lightweaver/src/lib/cardProjectResolver.js`, `cardProjectAdoption.js` | Match/reconstruct installed projects and preserve drafts. A reconstructed runtime project is not proof of complete original editor assets. |
| `lightweaver/src/lib/cardCustomerControls.js`, `cardLiveControl.js`, `cardActionAuthority.js` | Existing playback and edit authority. Keep installed controls and draft-targeted writes distinct. |
| `lightweaver/src/lib/cardInstallGate.js`, `cardCommissioningFlow.js` | Existing persisted verification and commissioning evidence. Scope validity to relevant configuration, preserving existing records. |
| `lightweaver/src/hooks/useCardStatus.js`, `useSetupJourney.js` | Feed consistent state and reconnect behavior; do not add a second polling loop. |
| `lightweaver/src/v3/app.jsx`, `lw-setup.jsx`, `lw-setup.css` | Entry routing, card screen, status presentation and actual mismatch copy. |
| `lightweaver/src/components/card/CardControlDrawer.jsx`, `lightweaver/src/components/SetupJourneyChip.jsx` | Reuse installed controls and align status/actions with the shell. |

Confirmed source issue: `lw-setup.jsx` describes wiring changes when only the installed and open project IDs agree in a broader mismatch branch. Replace this inference with an explicit comparison result. The actual reason for the screenshot's mismatch still requires a fresh card snapshot; do not claim a live root cause from this code inspection.

## 3. State contract and invariants

Add `lightweaver/src/lib/cardSessionView.js` as a pure composition layer over existing evidence/readiness/lifecycle functions, plus `cardSessionView.test.js`. It must not perform I/O, keep an independent cache, or duplicate the transport state machine. Keep existing exported interfaces compatible while callers migrate.

Proposed internal output shape (not a mandatory new firmware payload):

```js
{
  schemaVersion: 1,
  identity: { cardId, bootId },
  observation: { observedAt, freshness },
  connection: { state, reason },
  installation: { state, projectId, revision, fingerprint, wiringDigest },
  playback: { state, patternId, source },
  draft: { relationship, changedDomains },
  checks: { count, colour, direction },
  capabilities: { installedControl, draftEdit, projectReadback },
  summaryCode,
  primaryAction
}
```

`freshness`: checking / current / stale. Reuse existing transport failure thresholds; do not introduce arbitrary independent expiration timers. A reconnect, changed card identity or changed boot invalidates current command evidence until read again.

`installation.state`: unknown / empty / provisional / installed / recovery. Distinguish safe defaults over a stored project from an empty card.

`playback.state`: unknown / playing / paused / externally-driven / fault. Derive only from explicit available runtime evidence; readiness is capability, not proof of active playback. Preserve blackout/zero-brightness as a separate reported condition, not automatic failure.

`draft.relationship`: none / matches / differs / unknown. `changedDomains` can contain wiring, sections, patterns, playlist or metadata only when corresponding fields are comparable. Fingerprint-only disagreement produces differs with unspecified domain; absent data produces unknown. Do not reconstruct a fingerprint and claim byte identity.

`checks` values: confirmed / not-recorded / invalidated / unknown, each with its relevant configuration binding and evidence source. Automated readback and human confirmation remain distinct.

Suggested `summaryCode` values: CHECKING, DISCONNECTED, WRONG_CARD, EMPTY, SETUP_IN_PROGRESS, INSTALLED_READY, RECOVERY_REQUIRED, UNSUPPORTED. Draft disagreement is a separate field and never replaces INSTALLED_READY. Codes are diagnostic conveniences; raw validated evidence and existing command authority remain decisive.

Invariants:

1. Card facts describe the exact connected card; browser draft facts describe the open draft.
2. No GET, route change, background read, project comparison or reconnect writes to the card.
3. No installed control may derive a pattern ID or section range from an unmatched browser draft.
4. No new success or verified claim is inferred from missing fields, local cache, playbackReady or project ID alone.
5. Old responses cannot replace newer observations. Bind asynchronous results to selected card, connection generation and boot; discard pre-switch/pre-reconnect responses.
6. Unknown/unsupported states preserve inspection and draft editing; enable only actions justified by existing capability and identity evidence.
7. A changed boot invalidates transient command evidence, not durable physical confirmation bound to unchanged hardware configuration.

## 4. Entry and action policy

| Situation | Destination / behavior |
| --- | --- |
| Fresh Studio entry, usable installed card | Card home with installed controls; no compulsory setup ladder. |
| Explicit Patterns/Layout/Playlist deep link | Preserve requested screen and draft; show installed context and relevant mismatch notice. Never force a route change after a delayed poll. |
| Legacy auto-generated setup link from a mismatch | Resolve to installed card home after fresh evidence unless a real setup operation is active. Preserve intentional setup actions. |
| No reachable card | Keep draft/navigation usable; show Connect or Reconnecting. Cached installation is labelled Last seen and cannot authorise writes. |
| Confirmed empty card | Start first-time setup. |
| Temporary discovery configuration | Resume its recorded step; do not present it as a commissioned installation. |
| Installed card, different/unsaved draft | Installed controls remain available if independently authorised; preserve draft and offer Review draft changes. |
| Safe mode, fault, pending update/probation | Show the precise recovery/progress state; retain relevant existing safety gates. |
| Older firmware, incomplete evidence | Show known facts and supported actions; explain the specific missing capability. Never label unknown state empty. |
| Different card at the remembered address | Block mutation; require existing explicit card selection/identity flow. |

Default resume applies once per initial entry/card selection. Subsequent observations update the screen in place. Do not steal navigation when a read finishes.

Action vocabulary:

- **Control installed project:** opens controls backed by fresh installed pattern/section data, without replacing the draft.
- **Open installed project:** resolves the original editor project when available; otherwise offers the recoverable card copy, clearly identifying missing original assets. Preserve the current draft with existing save/recovery machinery before switching. If recovery saving fails, keep the draft open and installed controls accessible.
- **Preview on lights:** temporary, explicit live action. If it changes playback mode or pauses a playlist, describe that at the control before activation. Use supported restoration behavior; do not promise automatic restoration on legacy cards that cannot provide it.
- **Save to card:** persistent change with a concrete difference summary and existing validation. Configuration/section changes retain required testing/install safety. Show success only after matching readback.
- **Review checks:** optional inspection of physical confirmation except when the attempted action requires a specific unverified/changed configuration.

After an uncertain write: say Result not confirmed, reread the card, do not blindly retry a mutation. Readback may settle success; a conflict keeps the draft and explains the mismatch. All controls preserve exact-card targeting and current authority checks.

## 5. Verification retention and optional card persistence

First browser delivery reuses current stored evidence; it must not claim verification follows the card to another browser unless the card actually stores it.

| Change | Checks to retain / invalidate |
| --- | --- |
| Pattern, hue, speed, brightness, playlist, project name | Retain count, colour and direction where physical configuration is unchanged. |
| Output GPIO, chipset or pixel count | Invalidate affected output's physical checks; preserve unrelated outputs and networking. |
| Colour order/calibration | Invalidate relevant colour confirmation; retain count where mapping is unchanged. |
| Section mapping/direction | Invalidate affected section/direction confirmation; do not automatically invalidate physical output count. |
| Card identity change | Do not reuse another card's confirmations. |
| Firmware update or reboot | Reread state; retain compatible durable configuration-bound checks, recheck only if semantics/configuration changed. |
| Physical strip rewired without software change | Cannot detect reliably; provide an explicit Recheck lights action. Never claim automatic physical verification. |

Inspect existing verification bindings before changing storage. Keep legacy records intact; grant retained confirmation only when their existing evidence binds the relevant configuration. Unsupported/ambiguous legacy records display Not recorded or Unknown, not failure and not automatic success.

If cross-browser retention is missing, return a precise contract-gap finding before implementing firmware persistence. A follow-on card record would contain schema version, card ID, check type, relevant configuration digest, explicit human-confirmation provenance and optional timestamp (a card need not have a trusted clock). Write only on explicit confirmation, never on polling; validate exact target and current digest, write atomically, preserve Wi-Fi/project data and include records in preserving-update tests. That persistent API change requires separate scope approval; the browser resume improvement does not wait for it.

## 6. Build sequence and ownership

Primary owns integration, workboard and docs. `lightweaver-app` owner edits Studio source. Firmware owner alone edits firmware source. No mapper edits. Do not split shared app files among simultaneous workers. Coordinate with the active client-player work before modifying shared controls or app routing; use its final integrated interface or a non-overlapping base, not a competing implementation.

### Task 1 — Capture the failing behavior and baseline

- [ ] Recheck Git status, current workboard and in-progress shared-file ownership; preserve unrelated changes. Select an appropriate checkout only at implementation time.
- [ ] Read a fresh status/configuration snapshot through the existing connection to the exact card if available; record card/build/boot, project/wiring identity and reported playback. Redact network credentials. If unavailable, use the screenshot as reported evidence and labelled fixtures, never fabricated live proof.
- [ ] Create `lightweaver/tests/card-first-resume.spec.ts` using the established card-workspace/adoption fixtures. Model an installed 41-pixel GPIO18 card, a same-ID mismatched draft, and an active installed pattern.
- [ ] Assert initial entry exposes installed controls, does not require counting, preserves the draft, and sends zero mutating card commands. Run it and witness the existing failure before production edits.

Run from `lightweaver/`:

```sh
node scripts/lightweaver-dev.mjs focused tests/card-first-resume.spec.ts
```

### Task 2 — Shared session view and truthful comparisons

- [ ] Add pure view derivation and tests in `cardSessionView.js` / `cardSessionView.test.js`. Use normalized existing evidence and explicit inputs; inject observation time into fixtures rather than relying on wall-clock sleeps.
- [ ] Extend `cardLifecycle.js`, `cardJourneyEvidence.js` and `setupJourneyInputs.js` only as necessary to expose installed readiness separately from draft compatibility. Preserve their current exports and all exact-target safety checks.
- [ ] Test installed-ready plus differing draft, fingerprint-only disagreement, unknown fields, provisional setup, safe mode, wrong card, same-IP replacement and old-boot responses.
- [ ] Confirm state transitions with deterministic fixtures: current to stale to checking to current; delayed observations cannot reverse a card switch.

Focused command:

```sh
node --test src/lib/cardSessionView.test.js src/lib/cardLifecycle.test.js src/lib/cardJourneyEvidence.test.js src/lib/setupJourneyInputs.test.js
```

Required test assertions, using the task's fixtures and derived output:

```js
assert.equal(view.summaryCode, 'INSTALLED_READY');
assert.equal(view.draft.relationship, 'differs');
assert.equal(view.capabilities.installedControl, true);
assert.equal(view.capabilities.draftEdit, false);
assert.deepEqual(fingerprintOnlyView.draft.changedDomains, []);
assert.equal(staleView.observation.freshness, 'stale');
assert.equal(staleView.capabilities.installedControl, false);
```

### Task 3 — Card-first entry and draft preservation

- [ ] Change `app.jsx`, `lw-setup.jsx`, `setupJourney.js`, `cardFlowEntry.js` and their existing tests to apply the entry table. Use the shared view; remove the same-ID-implies-wiring-change copy.
- [ ] Reuse `CardControlDrawer.jsx` and `cardCustomerControls.js` for installed controls. Check their inputs come from installed readback even when a different project is open.
- [ ] Reuse `cardProjectAdoption.js` for explicit project switching and recovery. Label reconstructed card copies as partial when original editor content is absent; never silently overwrite the current draft.
- [ ] Add regression cases for matching draft, different project, unavailable full editor project, failed recovery save, explicit deep links and late arriving status.
- [ ] Witness the Task 1 regression green and inspect the actual desktop and phone screens before continuing.

### Task 4 — Consistent status, action feedback and reconnect

- [ ] Migrate card-home status, shell/footer card status, setup chip and mismatch banners to the shared view. Leave firmware build/version comparison in its existing firmware-status model; an available update is not itself a playback failure.
- [ ] Update affected action labels and explanatory text to the vocabulary above. A disabled action identifies its specific blocker and a useful next action.
- [ ] Preserve route, selection, draft and playback during reconnect. Keep last-known values visible with a stale label and disable unsupported mutations until fresh evidence returns.
- [ ] Retain existing transport polling; guard asynchronous reads against old connection/card generations. Do not add repeated toasts or announce every poll to assistive technology; announce meaningful connection/action transitions only.
- [ ] Test card updates from another tab/control surface: next fresh observation updates current playback without overwriting the draft. A stale edit is refused/reconciled rather than applied to a new installation.
- [ ] Verify a slider/preview does not accidentally send a draft pattern ID or silently stop an installed playlist. Reuse any already-integrated client-player fix rather than duplicate it.

Tests: extend `card-first-resume.spec.ts`, `card-workspace.spec.ts`, `card-edit-handoff.spec.ts`, plus focused `cardActionAuthority.test.js` and `cardLiveControl.authority.test.js` cases where authority behavior changes.

### Task 5 — Scoped physical-check retention

- [ ] Inspect `cardInstallGate.js`, `cardCommissioningFlow.js` and persisted project fields; add failing tests for the invalidation table before modifying record interpretation.
- [ ] Implement relevant-domain comparison without blanket invalidation on unrelated project revision changes. Keep existing install and wiring mutation gates intact.
- [ ] Represent absent evidence truthfully and allow installed playback inspection/control independently where safe. Retain full setup requirements for blank/provisional cards.
- [ ] Add reload and legacy-record fixtures. Verify pattern/playlist/name changes preserve applicable checks and real wiring changes invalidate only affected checks.
- [ ] Record whether cross-browser verification is already supported. If not, finish the browser delivery with an explicit limitation and the bounded optional firmware scope from section 5.

Focused command:

```sh
node --test src/lib/cardInstallGate.test.js src/lib/cardCommissioningFlow.test.js src/lib/setupJourney.test.js src/lib/cardProjectAdoption.test.js
```

### Task 6 — Integrated acceptance and handoff

- [ ] Review one integrated diff for authority regressions, accidental duplicate state/polling and collisions with client-player work.
- [ ] Run the focused affected browser cases, then one integrated checkpoint. Repair failures with focused checks before rerunning the checkpoint.
- [ ] Inspect one stable real browser preview at desktop and phone widths; capture the screenshot scenario, mismatch view, reconnect state and empty-card entry. Confirm readable labels, keyboard access, focus retention and no clipped controls.
- [ ] For real-card proof, read the exact card before and after opening/reloading/reconnecting Studio. Verify unchanged installed configuration and no navigation-driven mutation. Ask Adrian for one observation that playback continued when machine actions are ready; do not mark visual hardware proof yourself.
- [ ] Record verified behavior, exact revision, fixture versus live evidence, any pending visual observation and one next action on the workboard. Stop at the requested delivery boundary.

Commands from `lightweaver/`:

```sh
node scripts/lightweaver-dev.mjs checkpoint
node scripts/lightweaver-dev.mjs preview
```

Stop the interactive preview before a browser suite that owns the same port. Use only one stable preview on 4173. Firmware compilation/contracts are required only if firmware or its wire contract actually changes; do not bump/sign/rebuild/flash firmware for this browser batch.

## 7. Acceptance matrix

| Case | Required evidence |
| --- | --- |
| Screenshot scenario | Installed controls open; draft disagreement accurately described; no mandatory recount; zero entry writes. |
| Exact project match | Resume without setup detour or unnecessary save. |
| Pattern-only draft edits | Report draft changes; preserve count/colour/direction evidence. |
| Same ID, missing fingerprint | Unknown match where appropriate; no invented wiring mismatch or false verification. |
| Different project / unsaved draft | Installed controls target card IDs; draft remains recoverable; no implicit adoption. |
| Empty/provisional card | Correct setup or resumable commissioning step remains available. |
| Disconnect/reconnect/reboot | Screen remains; stale values labelled; fresh exact-card observation restores supported controls. |
| Replacement card / late response | No cross-card write or stale adoption. |
| Legacy/unknown capability | Known facts visible; unsupported action explained; no forced update for an optional feature. |
| External source / blackout / paused | Accurate reported state; not falsely marked failed or playing from readiness alone. |
| Uncertain write / changed project | No false Saved; readback reconciliation and preserved draft. |
| Reload and second browser | Local evidence retained; cross-browser claims limited to actual card-backed data. |
| Layout change | Affected checks invalidated; existing wiring safety retained. |
| Consistency | Header, footer, chip and buttons agree for every fixture. |
| Navigation and controls | Navigation never mutates; intentional playback changes target installed data and show their persistence/playlist effects. |

Definition of built: all applicable automated cases pass, the actual combined screen is inspected, and remaining real-device/human evidence is explicitly distinguished. No claim of complete editor recovery from runtime-only data.

## 8. Delivery, estimate and release boundary

Working estimate for browser-only implementation: 2–4 hours including focused regressions and screen inspection, subject to shared client-player changes and the existing authority complexity. Reassess after the first 20 minutes; report immediately if the forecast exceeds twice the estimate. A firmware persistence extension receives its own estimate after the exact gap is established.

Use two coherent implementation milestones: (1) installed-versus-draft state, resume and safe control; (2) status consistency, reconnect and scoped check retention. Keep focused tests within each milestone and one integrated checkpoint for the complete candidate. Do not add serial review pipelines or parallel agents sharing app files.

This request authorises a plan, not production deployment or hardware flashing. If implementation is requested, complete the browser candidate and evidence. If shipping is subsequently requested, run the established release gate (`node scripts/lightweaver-dev.mjs release`, including the launch requirements), hand the exact immutable revision to the durable release runner, and verify its persisted revision/state/resumption path before saying publishing in background. Do not keep a model polling CI.

Release proof uses the deployed candidate's recorded build graph and strict no-store `studio-release.json`, not mutable local preview. Report Shipped only after main integration, real deployment and independent live proof, naming Studio and firmware commit-count build numbers. Preserve signed updates, exact-card targeting and configuration; never introduce login or physical-button requirements for update/reboot.

Rollback: retain the prior immutable release candidate; use the existing authorised release process if rollback is needed. Browser record handling must remain backward compatible so rollback cannot destroy drafts or verification. A failed release blocks that release, not unrelated editing.
