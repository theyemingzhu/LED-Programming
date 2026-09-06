# Unified card journey — acceptance ledger (J01–J14)

Source: `docs/plans/2026-09-05-unified-card-journey.md`, "Full build acceptance
and closure" and "Existing proof machinery to extend". This ledger attaches
actual test names to J01–J14, states what is simulated versus what still needs
a real card or phone, and records status **scoped to this worktree revision**:

```
git rev-parse --short HEAD  →  bd3c61f8
```

Status vocabulary, used exactly as defined in the plan: `not run` /
`automated passed` / `physical pending` / `blocked`. Per this build's own
rule, **`automated passed` is claimed only for a test actually run in this
session with JSON-reporter stats** (shown under each row that earns it). Every
other row that cites an existing suite is marked `not run` — those suites are
part of the repository's CI gates and most likely pass there, but "most likely"
is not the same evidence, and this ledger does not borrow it. Rows needing a
real card or phone are `physical pending`, always — no waiver here turns an
unperformed hardware observation into a pass.

## This session's own runs (the only rows entitled to "automated passed")

```
cd "/Users/adrianrasmussen/Documents/Files/2 Areas/Coding/led/.claude/worktrees/lightweaver-audit-refinement-9a5034/lightweaver" && npx playwright test tests/journey-continuity.spec.ts --project=chromium --workers=1 --reporter=json
```
Run twice back to back for stability: both times `{"expected":4,"skipped":0,"unexpected":1,"flaky":0}`.
The one deterministic `unexpected` is **[J05]**, and it is a real finding (see
Risks below), not a flake — repeated in isolation it fails identically every
time.

```
cd "/Users/adrianrasmussen/Documents/Files/2 Areas/Coding/led/.claude/worktrees/lightweaver-audit-refinement-9a5034/lightweaver" && npx playwright test tests/card-state-matrix.spec.ts --project=chromium --workers=1 --reporter=json
```
Result: `{"expected":65,"skipped":5,"unexpected":0,"flaky":0}` — green after the
cardSimulator.ts wiring-test lifecycle extension (the 5 skipped are the
pre-existing `test.fixme` `stale-firmware` cells awaiting the owner's trust
decision, unrelated to this work).

One transient failure was seen and is not reported as a finding: a full-suite
run of journey-continuity.spec.ts once showed `[J08]` failing with
`net::ERR_CONNECTION_REFUSED` reaching the dev server; re-run of that one test
in isolation passed immediately. Per the standing host-contention rule
(THINKING.md 2026-08-20), a byte-identical repeat failure would be
determinism, but a connection refusal that vanishes on retry, on a machine
running a concurrent conductor Playwright regression against the same dev
server, is contention — logged, not treated as a defect.

## The ledger

| J | Scenario | Tests that cover it today | Simulated / physical | Status (at `bd3c61f8`) | Gap |
| --- | --- | --- | --- | --- | --- |
| J01 | Fresh compatible blank card → saved installation, no firmware detour | `tests/setup-ladder.spec.ts:114` ("blank card enters shared light discovery before Layout"); `tests/card-state-matrix.spec.ts` Tier 1/1C `factory-blank` cells (connect + no project to play, so 1C is skipped for this state by its own guard); `tests/setup-adopt-card-project.spec.ts:86` (adopts a *legacy* card project, not a blank-card discover→layout→save chain); `tests/production-setup.spec.ts` (Bench/production commissioning, a related but distinct worker flow, not the owner-facing Studio one) | Simulated (browser + card simulator); Bench flow is its own harness | **automated passed (partial)** — `tests/journey-j01.spec.ts` `[J01-partial]` 3/3 through connect → discover → count → colour confirmed → ladder past "find lights" (fixers A1 + F1, 2026-09-06). Placement → test → confirm → play remains (execution plan F4). | No single continuous J01 test existed end-to-end (discover → layout → test → confirm → save → play) against one simulated card in one file. The pieces above cover separate segments. This suite (B5) did not add one — flagged, not built, because it is a genuinely new test (out of the "extend existing coverage" brief) rather than a wiring gap; see Follow-ups. |
| J02 | Existing configured card → return visit: recognize installed project, reload does not restart onboarding | **`tests/journey-continuity.spec.ts` "[J02] a returning browser recognizes the installed project without re-onboarding"** (new, this session) | Simulated, one card carried across a click, a reload, and a screen change | **automated passed** (see run above) | None found. A browser holding only card identity (no project) genuinely reaches `data-journey-complete="true"` on first connect against a matching card, survives a reload, and the chip stays absent on Patterns. |
| J02 (negative) | A card holding a *different* project must never silently replace real open work | **`tests/journey-continuity.spec.ts` "[J02] a card holding a different project never silently replaces open work"** (new, this session); weaker existing coverage at `tests/card-state-matrix.spec.ts:299-304` (Tier 3, see Risks) | Simulated | **automated passed** (see run above) | Passes only because this test's own fixture describes a *valid* project (see Risks — the shared fixture does not). |
| J03 | Preserving update of a configured card: capture identity/config, update, reboot, verify running build, return to original task | `tests/preserving-firmware-update.spec.ts:112,178,189,195` | Simulated | **automated passed** — conductor checkpoint 2026-09-06 (see "Checkpoint run" below) | Return-to-original-task after an update is not yet asserted (execution plan ticket B1). |
| J04 | Update transport/preflight variants (current, optional, required, unsupported USB, unavailable release, blank, damaged storage) | `tests/install-update-plan.spec.ts` (all rows); `tests/connection-center-quality.spec.ts:310,338,358,381,416,435,993,1023` | Simulated | **automated passed** — conductor checkpoint 2026-09-06 | Optional-update copy is not truthful for a playable card (execution plan ticket B2). |
| J05 | Lost reply / reconnect timeout / reload — one bounded retry, no duplicate writes, no erased progress | **`tests/journey-continuity.spec.ts` "[J05] a slow reconnect settles unaided, and a lost reply after a real write is not duplicated"** (new, this session); reconnect timing also covered by `tests/card-state-matrix.spec.ts` `slow-to-answer` Tier 1/1C cells (which this run's own run above proved green) | Simulated | **automated passed** — both halves, after the conductor fixed the duplicate write (see "Update 2026-09-06" below) | The reconnect settles unaided every time (part of the "automated passed" run above). The lost-reply half is genuinely red: after `card.respondThenDrop('/api/control')`, Studio sends the identical control body (`patternId, revision` and all) **twice**. Reproduced 3/3 runs, byte-identical each time — determinism, not host noise. Root cause not diagnosed (out of this package's file boundary — `src/lib/cardLiveControl.js` is Studio-owned), but the symptom is exact: a successful write whose HTTP reply never arrives is retried as a brand-new command rather than read back first, contradicting the plan's own transition rule ("A successful write followed by lost readback is 'verification pending,' not automatically 'write failed'"). |
| J06 | Edit/save while state changes — pattern/playlist/wiring edits use the correct save/test path; a newer draft survives an old response or expired authority | `tests/patterns-v3.spec.ts:661,684,735` ("rapid duplicate Install clicks start only one card write", "an edit made during verification remains a draft…", "a rejected Install preserves canonical Studio state and the current draft"); `tests/studio-hardening.spec.ts:403,437,449,471,490,510` (exact-revision install, retry after failure, acknowledgement cannot install an unrelated later edit); `tests/cloud-card-provider.spec.ts:284,334,356` (epoch/precondition races) | Simulated | not run (this session) | Existing suite; not executed here. |
| J07 | Temporary physical test then normal save — end/abandon the test, roll back only its own candidate, retain later edits; production save uses the full intended wiring | `tests/studio-hardening.spec.ts:527,561` ("staged light test restores the last Studio-confirmed look after a lost activation response", "bounded marker failure releases the stream back to the last Studio-confirmed look"); this session's **`tests/journey-continuity.spec.ts` "[J13]"** exercises the same probation/rollback lifecycle from the journey-agreement angle (does the UI *say* the right thing), not the candidate-rollback mechanics themselves | Simulated | **automated passed** — `tests/journey-edits.spec.ts` `[J06]` and `[J07]` 6/0 with `--repeat-each 3` (fixer A3, 2026-09-06); J13 angle also green | The wiring-test *lifecycle* (testing → confirm/rollback/expiry) is what this build's H5 hole names and what `cardSimulator.ts` now models; J07's specific "retain later edits made during the test" is covered by `studio-hardening.spec.ts`, not re-verified here. |
| J08 | Back/Cancel/double-click/two tabs/card swap — one write owner, correct destination, no accidental replace | **`tests/journey-continuity.spec.ts` "[J08] a double click on one pattern tile reaches the card exactly once"** (new, this session); `tests/one-owner-per-question.spec.ts` (whole file); `tests/studio-route.spec.ts` (route agreement on hand-off/back) | Simulated | **automated passed** for double-click, replace-guard, card swap and two overlapping tabs (`tests/journey-ownership.spec.ts`, 6/0 repeat 3, after F2 added the cross-tab write lease) "[J08] a card holding a different project never rewrites open work that has not described its strip yet" (see "Update 2026-09-06"); `one-owner-per-question.spec.ts` also ran green in the conductor's batch | Only the double-click slice of J08 was built and run this session; Back/Cancel/two-tabs/card-swap are covered by the cited existing suites, not re-verified here. |
| J09 | Project persistence and transfer — browser/file/card/cloud copies correctly labeled; quota, unknown schema, divergent handoff preserve data | `tests/project-recovery-fixtures.spec.ts` (whole file); `tests/cloud-project-library.spec.ts:953-1192`; `tests/cloud-card-provider.spec.ts:146-170` | Simulated | **automated passed** for `project-recovery-fixtures.spec.ts` (conductor checkpoint 2026-09-06); cloud suites not run | Quota / partial-backup labels remain execution plan ticket C1. |
| J10 | Offline and version-skew environments — supported browser/local path stays usable; cached/new bundle mismatch cannot corrupt or force setup | `tests/windowless-offline-studio.spec.ts:3`; `tests/windowless-service-worker.test.mjs:9`; `tests/windowless-card-bundle.test.mjs:10,61` | Simulated (offline emulation; node-level bundle/service-worker tests) | **automated passed** — `windowless-playwright.config.ts` 1/1 and `test:windowless:tooling` 8/8 (conductor, 2026-09-06) | Version-skew mid-operation remains execution plan ticket C2. |
| J11 | Daily use across surfaces — Patterns A/B, Playlist save/play, Lab handoff, Show stop/control handback agree with installed state | `tests/patterns-v3.spec.ts` (search/preview/install rows); `tests/playlist-storage.spec.ts` (whole file); `tests/pattern-lab-*.spec.ts` (11 files); `tests/show-screen.spec.ts:318-684` | Simulated | **automated passed** for `playlist-storage`, `show-screen`, `pattern-lab-handoff`, `layout-send-to-card`, `patterns-v3`, `card-control-drawer` (conductor runs 2026-09-06); other Lab suites not run | The playlist timeout fixture had to stop pre-showing the requested row once lost replies are settled by read-back (`d4c404a8`). |
| J12 | Power cycle, update rollback, storage interruption — known-good survives; microSD boot precedence where used | `tests/preserving-firmware-update.spec.ts:178` (rollback names restored build); firmware node tests `firmware/lightweaver-controller/tests/wiring-promotion-power-loss.mjs`, `current-limit-wiring-evidence.mjs`, `firmware-boot-health.mjs` | Simulated (software); firmware node harness models power-loss timing, not real power interruption | not run (this session); the physical half is always **physical pending** | Existing suite; not executed here. Actual power-cycle-on-hardware is out of this package's scope entirely (firmware bench work). |
| J13 | UI agreement and accessibility — every setup surface shows the same task/build/operation outcome | **`tests/journey-continuity.spec.ts` "[J13] every setup surface agrees on an active light test, and agrees again once it ends"** (new, this session) | Simulated | **automated passed** (see run above) | This closes the exact E02/H5 gap the plan's audit reproduced: Card Home and the Patterns/Playlist chip now agree on `data-journey-task`/`data-journey-complete` during an active light test AND after the card's own probation clock ends it unconfirmed. Desktop/phone visual inspection and screen-reader status were not performed (no screen proof this session — see the return packet). |
| J14 | Release and old-entry continuity — legacy routes reach their canonical owner; exact live Studio/firmware release graph proven after ship | `scripts/firmware-update-release.test.mjs` (whole file); `scripts/production-job-consistency.test.mjs` (whole file); `scripts/ci-release-owed.test.mjs` (whole file) | Node-level script tests; live proof needs a real deploy | not run (this session) | Existing suite; not executed here. Live release-graph proof is always **physical/deploy pending** — this package does not ship or flash anything, per its own file boundary. |

## Checkpoint run (conductor, 2026-09-06, revision `d4c404a8`)

Chromium, `--project=chromium --workers=1 --reporter=json`:

- `preserving-firmware-update, install-update-plan, connection-center-quality, playlist-storage, project-recovery-fixtures, show-screen, footer-build-status, studio-route, card-edit-handoff, pattern-lab-handoff, layout-send-to-card` → `{"expected":115,"unexpected":4}` at `f28d4999`; the four were `playlist-storage` cases broken by an over-broad read-back, fixed in `d4c404a8`; `playlist-storage + journey-continuity + card-control-drawer` → `{"expected":27,"unexpected":0}` afterwards.
- `windowless-playwright.config.ts` → `{"expected":1,"unexpected":0}`.
- Earlier the same day: 13-file batch `{"expected":259,"unexpected":0,"skipped":5}`; focused 12-file batch `{"expected":244,"unexpected":0,"skipped":5}`; unit 2285/2285; production build.

Real-card screen inspection (read-only, card `lw-b0fe81f61b44` at 192.168.18.70, firmware 1524): desktop Card Home reads setup complete with task `open-patterns` and "Installed project matches"; Patterns shows no chip; phone (375 px) Card Home has one primary action and no horizontal overflow. No card write.

## Contradictory or obsolete assertions found

Neither was deleted or "fixed" outside this package's file boundary. Both are
reported here, quoted, with the reasoning for why they read differently than
their own stated intent.

1. **`lightweaver/tests/card-state-matrix.spec.ts:59-71`** — the `'other-project-open'`
   fixture:
   ```js
   localStorage.setItem('lw_autosave_v3', JSON.stringify({
     id: 'lwproj-open-work',
     name: 'Open work',
     layout: { starterPending: false, strips: [{ id: 'strip-a', pixels: 60, pin: 21 }] },
   }));
   ```
   This payload has **no `version` field**. `migrateProject`
   (`lightweaver/src/lib/projectModel.js:393-398`) only accepts
   `version === PROJECT_VERSION` (currently `3`) or the legacy `1`/`2` shapes;
   anything else returns `null` and Studio silently boots
   `createDefaultProject()` instead. So the browser state that `docs/card-state-matrix.md`
   describes as *"real work that must not be silently replaced"* never actually
   becomes the open project — Studio opens a brand-new default project on every
   test that uses this fixture.
2. **`lightweaver/tests/card-state-matrix.spec.ts:299-304`** — the assertion
   this fixture feeds:
   ```js
   const open = await page.evaluate(() => { ... JSON.parse(localStorage.getItem('lw_autosave_v3') ...)?.id ... });
   expect(open, 'Studio replaced the owner's open work without being asked').toBe('lwproj-open-work');
   ```
   This reads the **raw stored string**, not what Studio actually opened. It
   passes today, but it would pass identically even if Studio replaced the
   in-memory project entirely and had not yet re-serialized autosave — which is
   close to what this session found actually happens (see the finding above):
   with the fixture's shape, Studio's real in-memory project is the untouched
   default, distinct from the stored bytes the assertion reads back. The
   assertion is not false, but it is not proof of what its own name claims.
   `journey-continuity.spec.ts`'s `seedOtherProjectOpen` fixes both problems
   (adds `version: 3` and a `portRoles` entry, see its doc comment) so its own
   J02-negative test asserts the real guarantee.
3. **`lightweaver/src/lib/setupJourney.js:241-259`** — production source, not a
   test, but its own comment is now stale:
   > "`confirm-visible-lights` in SETUP_TASK_IDS is unreachable for the same
   > reason [`verification` is supplied by NO production caller]."

   This is accurate for the `nextVerificationAction` path the comment is
   about, but `confirm-visible-lights` is independently reachable through
   `exactWiringTest` (same file, lines 292-302) whenever the card is mid a real
   wiring-probation window — which is exactly what this session's `[J13]` test
   exercises and which the cardSimulator.ts wiring lifecycle now makes
   testable. A future reader trusting the comment's "unreachable" at face
   value could delete `confirm-visible-lights` from `SETUP_TASK_IDS` believing
   nothing produces it; something does. Not edited (production source is
   outside this package's file boundary) — flagged here instead.

## Update 2026-09-06 — the two reported defects are fixed (conductor, Studio boundary)

Both findings below were real and are now closed in this build; the bullets are
kept as the record of how they were found.

- **Duplicate write on lost reply (J05) — fixed.** Root cause was not the retry
  loop but the host-rediscovery re-post inside `sendLivePreviewToCard`
  (`src/lib/cardLiveControl.js`): after a dropped reply it rediscovered the card
  on another address and posted the same `/api/control` again. Now every path
  that would resend first READS the card (`readBackLivePreview`: `/api/zones`,
  honouring the same zone→whole-strip fallback the write used) and treats a
  card already showing the requested pattern as the acknowledgement.
  `retryWhileTransient` gained a `readBack` option used by the Patterns screen
  and the card control drawer. Control patches the read cannot verify
  (brightness, colour) still retry, because their values come back in the
  card's own units.
- **Silent project replacement on first card read — fixed.** `adoptWiringFromCard`
  in `lw-setup.jsx` now runs only where nothing can be lost: the open project is
  the card's own project (same id) or an untouched starter (`starterPending`
  not yet false). The card-state-matrix `other-project-open` fixture also gained
  `version: 3` so it is a project Studio actually opens.
- **Double click — deduped at the intent.** A second tap on the same tile while
  the first send is in flight joins it (`inFlightPreview` in `lw-pattern.jsx`)
  instead of issuing a second command; the J08 case was timing-dependent before.

Proof, conductor's runs (Chromium, `--reporter=json`): J05 + both J08 cases
`--repeat-each 4` → `{"expected":12,"unexpected":0}`; the batch of 13 spec
files (journey-continuity, patterns-v3, card-control-drawer, card-state-matrix,
setup-ladder, setup-adopt-card-project, setup-card-reconstruction,
setup-find-card, setup-led-count, card-workspace, pattern-controls-live,
studio-hardening, one-owner-per-question) →
`{"expected":259,"skipped":5,"unexpected":0,"flaky":0}`; unit 2285/2285;
production build. `journey-continuity.spec.ts` is now part of
`ci:browser-smoke`, so it runs on every pull request.

## Risks / follow-ups (as found — see the update above for what is now fixed)

- **Duplicate write on lost reply (J05).** See the J05 row above. Reproduction:
  `installed-match` card, `card.respondThenDrop('/api/control', { times: 1 })`,
  tap a pattern tile. The card's own request log shows the identical
  `/api/control` body (same `patternId`, same `revision`) posted twice. This
  contradicts the plan's transition rule that a successful-write-lost-reply is
  "verification pending," to be resolved by reading the operation back, not by
  resending it. Needs a Studio-side fix in whatever issues the retry in
  `src/lib/cardLiveControl.js` — outside this package's file boundary.
- **`adoptWiringFromCard` silently replaces an entire project, id included, on
  first card read (found while building the J02-negative test).** In
  `lightweaver/src/v3/lw-setup.jsx`, the auto-adopt-wiring effect (distinct
  from the gated "adopt by default" effect a few hundred lines below it) calls
  `applyCardParts` unconditionally whenever the open project's `portRoles`
  does not yet name a strip (`alreadyDescribed === false`) — regardless of
  whether the card's project is the same one open in Studio. `applyCardParts`,
  when `replaceProject` exists and the card reports any strips, replaces the
  *entire* project — including `id` — with `confirmDiscard: () => true`
  (no owner gate at all). A project with genuine layout content but nothing
  yet recorded in `portRoles` is indistinguishable, to this guard, from an
  untouched default, and gets overwritten by the first card it ever meets.
  This directly touches the plan's own preservation matrix row ("Card swap or
  changed project head → preserve both editable copies … ask a project/card
  choice") and its J08 pass condition ("no accidental replace or mutation of
  another card['s project]"). Reproduced by seeding `lw_autosave_v3` with a
  real, versioned, non-trivial project that had not yet described its strip in
  `portRoles` — its `id` was silently overwritten with the card's project id
  before any owner action. Worked around in this session's own fixture (added
  a `portRoles` entry) so the J02-negative test could exercise its intended
  target (the resolution-offer banner) instead of this separate defect; not
  fixed, since `lw-setup.jsx` is outside this package's file boundary.
- **J01 has no single continuous test.** The plan's acceptance table describes
  one uninterrupted scenario (connect → discover → layout → test → confirm →
  save → play) against one simulated card. No existing file does this end to
  end, and this package did not add one — the brief for B5 was to extend
  existing proof machinery for the scenarios explicitly enumerated in the
  handoff prompt (J02, J05, J08, J13, plus documentation), and J01 was not one
  of them. Flagged rather than built, so the next reader does not assume it
  exists.
- **Screen proof: none.** No desktop/phone visual inspection was performed
  this session (see the return packet). J13's accessibility half (keyboard,
  screen-reader status) is unverified.
- **Physical proof: none.** Every row above marked `physical pending` remains
  genuinely unperformed. This package never touches hardware.

## Integrated checkpoint (director, 2026-09-06, revision `faf55185` + closing docs)

Chromium, 30 spec files (`strip-discovery, journey-continuity, journey-edits,
journey-ownership, journey-j01, journey-readback, card-state-matrix,
patterns-v3, card-workspace, setup-ladder, setup-adopt-card-project,
setup-card-reconstruction, setup-find-card, setup-led-count, playlist-storage,
preserving-firmware-update, connection-center-quality, card-control-drawer,
studio-hardening, one-owner-per-question, project-recovery-fixtures,
footer-build-status, studio-route, card-edit-handoff, layout-send-to-card,
install-update-plan, pattern-controls-live, show-screen, screen-smoke,
workflow`) → `{"expected":451,"skipped":5,"unexpected":6,"flaky":0}` in 18 min.
The six: five footer/build assertions expected `Studio 1604` and read `1603`
because a docs commit landed mid-run and moved the commit count the build
number is derived from (self-inflicted, not a defect); one connection-center
case is the documented contention flake. Isolated rerun of exactly those six:
`{"expected":6,"unexpected":0}`. Windowless config: `{"expected":2,"unexpected":0}`.
Unit 2361/2361; production build. No hardware, deploy or push.
