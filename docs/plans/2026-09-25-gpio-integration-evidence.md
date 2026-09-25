# GPIO integration implementation evidence

Plan: [Complete integration plan](2026-09-25-gpio-pattern-integration-plan.md).
Starting revision: `90f630e9`; tested integration commit: `b53df14d`.
This is a Sprint implementation record, not a
release or a physical-light observation. The primary agent maintains this file.

## Ownership and integration

- Sol App: Layout conversion, section identity, saved looks/scenes, Patterns.
- Sol Bench: counted-output scope, preview/restore, measured installation.
- Sol Firmware: provisional native rendering and existing playback consumers.
- Manager: contracts, independent integration review, Windows tools, checkpoint.

At most three workers run at once. Browser ownership passes from App to Bench
before the integrated browser run. All source changes share the working tree.

## Verified tooling foundation (GP-09)

Commit `7084e8b2` fixes Windows command invocation and test portability.

- Reproduced all six prior failures in the four affected library test files.
- Those files pass **92/92** with Node 22.23.3 after the corrections.
- Development workflow, command resolver, and Rollup repair tests pass **9/9**.
- The documented development CLI successfully lists the ten Layout Divide
  browser tests through the real npm/Playwright entry point on Windows.
- Installed Rollup binding loads successfully; no repair download was necessary.
- New tooling tests are included in `npm run test:unit` for future checkpoints.

Exact-byte firmware assets are protected by Git attributes. The test firmware
fixture was restored from its existing Git blob, not regenerated or re-signed.
PEM comparison checks exact DER key bytes. Text-only source/header checks accept
LF and CRLF. The production signer is unchanged: Windows proves refusal where
POSIX owner-only permissions cannot be established. Successful signing remains
the existing Linux CI gate; Linux CI was not executed during this local turn.

Logs: `%TEMP%/lw-gpio-portability-red.log`,
`%TEMP%/lw-gpio-portability-green.log`, `%TEMP%/lw-gpio-tooling.log`.

## Integration evidence

The integrated application checkpoint and focused browser results passed below.
Worker results remain separate from physical observations and production delivery.

### Native implementation (GP-07/08)

The firmware worker reports a successful `pio run -e esp32-s3-n16r8` build:
RAM 68.8%, flash 35.1%. Native arm policy tests pass 3/3 and live-look persistence
tests pass 7/7 using WSL's C++ compiler. Windows PlatformIO native execution lacks
the host compiler; this is not a Windows-native test result. The native arm,
live-look and playlist suites are registered in the Linux CI workflow.

Eight existing firmware contracts pass: provisional Bench project, playlist
combination looks, control synchronization order, pattern runtime state, WLED
command readiness, WLED realtime policy, wiring stage/active transaction and
recover-lights endpoint. The WLED realtime host-compiler check ran under WSL.

Provisional native playback now requires a separate exact-zone arming command,
ready output and explicit dim/current limits. Unarmed provisional outputs remain
dark, including the SD frame path. Ordinary installed playback bypasses this
temporary mask. Status exposes ownership, arm state and fade for verification.

Remembered manual playback is bound to the exact boot-selected configuration
digest and confirmed installation identity. Candidate probation cannot apply or
overwrite the previous confirmed overlay. Direct configuration replacement clears
pending old writes. Legacy unbound records and records containing identifiers
that exceed the existing live-state storage limit are rejected, preserving the
installed startup configuration. Worst-case encoded record: 3867/3968 bytes.

### Review and test scope

Sol workers own application, Bench and firmware changes. A Luna worker performed
read-only acceptance inventory and transport/restoration review. The manager
reviewed cross-boundary identity, restoration and physical-address preservation.
Reviews caught and repaired stale Undo reference replacement, lost sampled LED
coordinates, split path-length metadata, duplicate patch identifiers and locked
wiring mutation. Bench review covered stale restoration deltas, native no-op
refusals, measured-only scope, lost install replies and stored versus live
playlist readback.

The independent topology oracle in `sectionRunConversion.test.js` derives
expected `(GPIO, output address, original LED)` tuples from explicit 2/3/4-output
fixtures, unequal lengths and alternating directions. Other tests separately
cover one output, disjoint runs and exact package/readback maps. These are
independent assertions, not one shared fixture imported by every test suite.

### Integrated checkpoint

With all three source owners frozen, the manager ran Node 22.23.3:

```text
node scripts/lightweaver-dev.mjs checkpoint
node scripts/lightweaver-dev.mjs focused tests/layout-run-separation.spec.ts tests/layout-divide.spec.ts tests/strip-discovery.spec.ts tests/patterns-v3.spec.ts --grep "Layout separates|GPIO pattern workflow|a section spanning|an edit made during verification|two GPIOs can|wrong GPIO pattern|counting uses|card already holding|divide"
```

- Complete unit checkpoint: **2746/2746 passed**, zero failures or skips.
- Production Vite build: **passed**. Existing large-chunk advisory remains.
- Integrated Chromium: **18/18 passed**, including exact LED coordinates after
  split/Undo/Redo/reopen, ten existing Layout Divide cases, same/different choices
  through Keep/reload/install, spanning-section navigation, edit during install,
  measured Bench patterns, wrong readback refusal, ruler and existing-card setup.
- Complete Bench Chromium suite: **24/24 passed**, including reload/resume,
  start-over, card restart, adding strips, count/capacity limits and color quiz.
  This second run reused the existing verified workspace preview on port 4173
  with `LIGHTWEAVER_TEST_PORT=4173` and exited normally. Four cases overlap the
  integrated selection; these are 38 distinct browser scenarios, not 42.
- Playwright's managed Windows Vite teardown hung after all assertions. Stopping
  only that verified test server let the runner finish normally with exit 0 and
  `.last-run.json` reporting `passed`. This was not a forced successful test exit.
- Manager inspected actual 390px Layout before/after, Patterns target and Bench
  ruler screenshots. Geometry, GPIO targeting and count controls are visible.

Logs: `%TEMP%/lw-gpio-integration-checkpoint.log`,
`%TEMP%/lw-gpio-integration-browser.log`,
`%TEMP%/lw-gpio-final-bench-browser.log`. Stable screenshots copied to
`%TEMP%/lightweaver-gpio-integrated-evidence/` before subsequent browser runs.

### Acceptance matrix and limits

| Plan dimension | Automated evidence | Remaining proof |
| --- | --- | --- |
| Topology | Independent 2/3/4-output address oracle, one-output and same-GPIO fixtures, conversion and Divide browser cases | Physical address/order confirmation |
| Capacity | Full unit suite includes compiler/runtime capacity and invalid-target refusals; no capacity expansion | Real board-specific pin behavior |
| Pattern scope | Same/different/change-one source, package and browser assertions; measured-only audition and unchanged-zone units | Appearance of each actual strip |
| Bench | Count/ruler/install browser fixtures; legacy-setting preservation and direct/bridge install unit fixtures | Real bridge session and physical observations |
| Native commands | Native arm 3/3, dispatcher contracts, faithful sync-false refusal and restoration units | Live stream handoff on hardware |
| Temporary session | Lost replies, authority checks, Stop/control/blackout restoration and transport cancellation units | Browser-to-real-bridge interruption/restoration |
| Durability | Complete units, saved-reference migration, Keep/reload, exact-coordinate Undo/Redo browser proof | Independent cloud/backup browser matrix was not rerun |
| Install | Immutable snapshot, known-good/readback checks, wrong map/card, candidate recovery and edit-mid-install tests | Physical candidate rollback/power interruption |
| Startup | Live-look native persistence 7/7; stored startup/playlist versus current playback tests | Offline cold restart and actual SD source priority |
| Other consumers | Eight firmware contracts plus complete JS units | Physical knobs/realtime/SD transitions and full browser consumer matrix |
| Browser/transport | Chromium, 390px, keyboard Divide and mocked direct card; direct/bridge helper tests | Actual phone/Safari and live HTTPS bridge |
| Shipping/cache | Local production build only | Release, embedded card Studio bundle, live cache/build proof |
| Novice use | Programmatic user journeys only | Unassisted human observation |

Automation review declined stopping the pre-existing preview because process
ownership was uncertain. It was left running and reused successfully; no test
or implementation remains blocked by that refusal. No extra preview remains
from this integration run.

The ordinary implemented flow is: count and confirm GPIOs in Bench, choose a
shared pattern or per-GPIO patterns, Keep, then install the measured project.
Bench offers the 30 core native patterns it can faithfully run in the temporary
configuration and links to the full Patterns workspace. An artwork section that
spans GPIOs can be separated at its existing run boundaries in Layout first.
Grouped or custom/overlapping topology requires the displayed repair step.

Older firmware cannot provide the new native arm/readback contract and receives
an update explanation. Local implementation does not make the capability
available on an already-flashed card; it needs the preserving firmware release
path and observed Bench acceptance before claiming delivery.

## Gates not established by local automation

Real-strip appearance, physical pin/order/color confirmation, power interruption,
offline cold restart, supported phone/Safari behavior on actual devices, and
unassisted novice use require observed evidence. None is marked passed here.
No firmware release, card flash, push, merge, production deployment, or exhaustive
Prove run is authorized merely by proceeding with this implementation plan.
