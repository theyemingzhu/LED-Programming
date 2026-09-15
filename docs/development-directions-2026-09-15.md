# Three development directions for Lightweaver

Research date: 2026-09-15. Source baseline: `18479a01`.

## Recommendation

Start with **artwork-aware Pattern Lab**. It offers a substantial creative
improvement by connecting capabilities already present in the app. Next, build
**standalone Color Journeys** when the priority is a finished piece that keeps
performing after the laptop closes. Choose **artwork handoff and service** when
the next piece is being delivered, sold, or maintained by someone else.

These are three development choices, not an instruction to build all three.
Research covered the active Studio, mapper, card firmware, installer/desktop
bridge, project-library APIs, production/support surfaces, tests and strategy
records. This was targeted source inspection, not an exhaustive code audit,
fresh browser evaluation, hardware test, or production verification.

| Direction | Main benefit | First increment | Relative scope |
| --- | --- | --- | --- |
| Artwork-aware Pattern Lab | Compose directly on the sculpture | Edit one existing named section in Lab | Medium, browser-first |
| Standalone Color Journeys | Rich authored work survives closing Studio | One bounded journey format rendered on-card | Large, firmware and Studio |
| Artwork handoff and service | Deliver and recover a piece without reconstructing its history | Portable per-piece handoff package | Small–medium first increment |

## 1. Artwork-aware Pattern Lab

**Experience:** select “Petals” on the artwork, develop their light and movement,
then select “Centre” and give it a different character. Keep the result without
losing the rest of the composition.

### What already exists

- Layout already provides named groups and precise selection:
  `lightweaver/src/components/layout/modes/DrawModePanel.jsx:690`.
- Patterns has section selection and physical identification:
  `lightweaver/src/v3/lw-pattern.jsx:1595`.
- Show already has named motif Voices, audio bands, character, depth and repeat
  controls: `lightweaver/src/v3/ShowVoices.jsx:195`.
- Lab handoff already preserves section looks:
  `lightweaver/src/lib/patternLabHandoff.js:106`.

### The actual gap

Lab's geometry omits the project section-target vocabulary
(`PatternLabScreen.jsx:760`); its target diagnostic only considers whole-piece
targets matched (`:936`). Section physical preview is deliberately blocked
(`PatternLabPreview.jsx:310`). The creative surfaces have useful ingredients,
but Lab does not yet let the artist work directly through the same named parts.

### First increment

Bring existing section targets into Lab, preserve the selected section when
opening it from Patterns, add artwork selection and a Piece/Section control,
and dim unselected sections for context. Save edits through the existing
section-aware handoff. Begin with compatible simple looks; keep the existing
Patterns route for physical section preview until direct Lab preview is proven.

**Acceptance:** edit Centre, Keep, return to Patterns, and reload: Centre retains
the edit and Petals remains unchanged. Deleted or changed target IDs produce an
explicit unresolved-target state. Whole-piece editing continues to work. Check
desktop and phone screens; verify any changed physical targeting separately.

**Later:** a small visual composition with two or three independently evolving
motifs, reusable artistic variations, and matching Show controls. Preserve the
current navigation and artist vocabulary. This is not a proposal to rebuild
existing symmetry detection or motif Voices.

**Agents:** Sol medium owns the Lab UI and bounded target/handoff implementation.
Keep shared Lab files with that one owner. Astra directs the target-identity
and persistence contract before implementation and accepts integration. A
second Sol worker is useful only after a frozen contract gives it an independent
test-file boundary. No firmware agent for the first browser increment.

## 2. Standalone Color Journeys

**Experience:** author an amber → violet → blue journey, install it, close the
laptop, and let the piece continue its deliberate long fades and movement.

### What already exists

The card already has native playback, timed playlists, saved controls, optional
microSD sequences, and signed preserving firmware updates. Adding those again
would waste work. Some Lab evolution and layered effects already have a
deterministic sequence path.

### The actual gap

Color Journeys explicitly require Studio and cannot be recorded:
`lightweaver/src/lib/patternLabCompatibility.js:518` and
`lightweaver/src/lib/lwseqBake.js:319`. The bounded authoring model already has
2–8 RGB stops with hold/fade durations and easing (`colorJourney.js:24`).

The difficult part is fidelity: its movement uses both artwork x and y
coordinates (`patternLabPatternAdapter.js:154`), while the native renderer has
a different spatial interface. Merely interpolating colors or increasing
playlist transition time would not reproduce the authored result.

### First increment

Define one versioned native journey format, its limits, and its exact preview
contract. Prefer a compact evaluator over storing every frame. Budget and test
a compiled per-pixel spatial phase if retaining today's motion; alternatively,
offer an explicitly distinct card-compatible mode with its own matching preview.
Never silently simplify an existing journey.

Budget against the existing 3,968-byte configuration limit
(`LightweaverHardwareContract.h:16`) and boot-allocated pixel buffers; avoid
per-frame flash writes or an unbounded timeline.

Then implement compilation, capability detection, preserving installation and
readback, native rendering, and a clear startup policy. Old cards must continue
to identify unsupported recipes honestly. Define manual override/resume behavior
as part of the design: today's firmware restores playlist state but deliberately
retains the startup look until the next dwell (`main.cpp:3232`), and manual look
selection pauses autoplay. Those are current policies, not proven defects.

**Acceptance:** shared time-sampled fixtures match preview and firmware output;
bounds, unsupported firmware and interrupted writes preserve the previous
installation. On hardware, close Studio, interrupt Wi-Fi, power-cycle, and
exercise the knob. Confirm color, movement, responsiveness and the specified
restart behavior physically. Automated parity cannot pass these observations.

**Later:** native motif compositions, or compact audio features streamed from a
phone to a card-owned composition. On-card microphones require a separate
hardware decision. Opening-hour schedules require a deliberate clock and
offline-time policy; they are not part of this increment.

**Agents:** Astra high owns the runtime schema, firmware renderer, memory/flash
budget, startup and compatibility decisions. After that contract is fixed,
Sol medium owns Studio compilation/controls, and another Sol medium owns
independent parity fixtures and firmware-contract tests. Primary Astra remains
the sole integrator. This is where stronger reasoning earns its cost.

## 3. Artwork handoff and service

**Experience:** finish a piece and export one coherent handoff package: how to
use it, what was installed, which physical checks were observed, and how to
recover or explain a problem months later.

### What already exists

Production captures exact card/project/build/physical evidence and exports JSON
and CSV. Project-library revision restore and backups also exist; a new generic
backup/history system is unnecessary. Card support already has a local
connection log (`lightweaver/src/v3/lw-card.jsx:780`).

### The actual gap

Production records remain browser-local until explicitly exported
(`components/production/ProductionPassRecord.jsx:16`). Those records, project
files, support logs, and customer instructions are separate artifacts. The
printable handoff still directs customers to `lightweaver.local`
(`docs/handoff-card.md:26`), while the current runtime names the public Studio as
the single remembered starting address (`docs/lightweaver-customer-runtime.md:3`).

### First increment

Generate a per-piece package from existing exports: a human-readable handoff
sheet with the canonical Studio URL/QR, a project snapshot, an installation
record when one exists, and an optional sanitized support report. Show observed,
machine-read, stale and missing evidence distinctly. An imported record is
historical information, never authority to write to a connected card.

Provide this within the existing Projects/Card surfaces. Start file-based;
do not require new accounts, a fleet service, or automatic uploads. Use the
next real handoff to discover whether cloud attachment or replacement history
earns its cost, consistent with the roadmap's conditional record/history gate
(`docs/roadmap.md:154`).

**Acceptance:** open the package on a fresh browser and identify the exact piece,
saved project and recorded installation without the original browser storage.
Unperformed physical checks remain unconfirmed. Sensitive credentials are absent;
missing files and mismatched card identity cannot yield false completion.
Inspect the printed sheet and phone destination during the next actual handoff.

**Later:** replacement-card comparison, service notes and repeatable project
starting points, only when repeated deliveries demonstrate the need.

**Agents:** Sol medium owns export assembly and the existing UI entry point.
Astra reviews schema, provenance, redaction and the separation between historical
evidence and current card authority. Luna low can independently update customer
copy and fixture inventories once the contract is settled; primary owns root
coordination documents. Firmware work is unnecessary for the first increment.

## Other improvements to include only where they support the chosen direction

- Close preview/physical color discrepancies with measured parity and a real
  strip observation; the workboard still distinguishes these from fixed UI bugs.
- Preserve the compact editor and editable card facts; the latest thinking log
  explicitly rejects another numbered setup ladder.
- Let artists keep several named music compositions: the data model supports
  them, but Show currently opens the first and saves a single-element list
  (`lightweaver/src/v3/lw-show.jsx:407`). This is a useful smaller follow-up to
  the artwork-aware direction.
- Improve touch interaction on the exact changed surfaces, not a speculative
  app-wide redesign.
- Reconcile stale backlog statements during related work. Accounts/library,
  preserving OTA, Lab workers and modular mapper code have evolved beyond older
  TODO descriptions.
- Keep release build identity and strict live proof. This research does not
  diagnose production from old release notes or initiate an exhaustive Prove run.

## External reference check

WLED already documents segment-aware presets, and LedFx documents capturing
device/virtual configurations as scenes. My inference: another generic effect
catalog or scene list would be a weaker distinction than artwork-aware authoring
and a dependable finished-piece experience.

- [WLED presets](https://kno.wled.ge/features/presets/)
- [LedFx scenes](https://docs.ledfx.app/en/latest/settings/scenes.html)

These are reference capabilities, not evidence about demand for Lightweaver.

## Research routing and completion

Manager skill and Playbook v3 used. Explicit collaboration selections: Sol medium
for creative workflow assessment; Astra high for firmware/autonomy reasoning;
Luna low for documented needs and stale-backlog collection. Tools accepted all
three selections; separate actual-model telemetry and costs were unavailable.
Primary inspected the decisive source anchors and synthesized this report.

No application code changed, tests or hardware gates claimed, release initiated,
or implementation workers launched. Next step: select a direction; recommended
first build is section-aware Lab authoring with existing verified handoff.
