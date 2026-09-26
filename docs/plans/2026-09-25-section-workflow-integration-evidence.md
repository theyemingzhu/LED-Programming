# Native section workflow integration

Date: 2026-09-25. Status: implemented and verified locally; not deployed.

Scope: integrate the approved compact section workflow into the existing Studio
screens, with previews derived from real Layout geometry. Implementation follows
[the refined plan](2026-09-25-refined-section-workflow-plan.md), U0–U4. Continuous
flow and general layered card delivery remain separate renderer/compiler packages;
this presentation batch does not claim to implement those capabilities.

## Ownership

- Sol high: Patterns, read-only section projection, stable-identity navigation.
- Sol medium: Layout rows, miniature geometry and compiled wiring inventory.
- Sol medium: measured Bench output presentation and scoped pattern choices.
- Manager: boundary review, integrated checkpoint, evidence and workboard.

## Integration requirements

| Contact | Required evidence |
| --- | --- |
| Layout → Patterns | Exact section identity; preserve other sections; explicit return and focus |
| Geometry → miniature | Actual arbitrary path geometry; no ring-specific assumption; bounded phone layout |
| Wiring → inventory | Compiled output-relative spans, inactive gaps and reversed runs; no duplicated whole-strip counts |
| Patterns → saved look | Same/different, copy-all, Undo, Keep/reload; complete saved mix and Lab recipe retained |
| Patterns → card package | Direct Install includes current draft and per-zone startup; old completion cannot erase newer draft |
| Bench → Patterns/Layout/install | Confirmed counts only; truthful temporary/kept state; Stop/restore and embedded/direct completion retained |
| Lab/Playlist consumers | Existing complete-look identity and compatibility stay authoritative |

## Evidence

Integrated checkpoint: 2748/2748 library tests passed and the production Vite
build passed. Final production build after the UI corrections also passed.
Historical identity reproduction passed; nine focused projection, copy-to-all,
section-target and wire-order checks passed. The section-target source assertion
was updated to reflect removal of the redundant visible cap without changing the
hardware limit contract.

Browser integration covered 39 distinct Chromium cases. The first group passed
21 cases; its old duplicate-row expectation failed and was corrected. The second
group passed 17 cases, including that repaired run-separation case; its remaining
old spanning-row assertion was corrected and passed in a final four-case run.
The phone toolbar regression separately witnessed red (three rows versus the
existing two-row cap), then passed after its layout and focus order were fixed.
No assertions about pixel tuples, saved identity, Undo or runtime payloads were
removed to accommodate the row consolidation.

Verified contacts include:

- Layout → exact Patterns target → Layout focus, plus rejection of stale project
  handoffs; grouped geometry uses one canonical target.
- Multiple GPIOs, multiple runs of one strip, inactive address gaps, physical
  reorder, separation, Undo/Redo and reload.
- Actual open-curve/branch preview; one preview renderer; desktop and phone
  toolbar bounds; 390px and 320px overflow checks and daylight tokens.
- Same/different/copy-to-all, common section look differing from the saved global
  default, Keep/reload, current-draft Install and independent startup zone patterns.
- Duplicate Install prevention, edits during verification, rejected installs,
  card-project replacement and shared preview status vocabulary.
- Bench confirmed-output choices, exact measured package, wrong readback refusal,
  counting handoff and accessible Stop. Native controls use current theme tokens.
- Lab native-look handoff and honest bake requirement; Playlist compact controls
  and status. This does not assert general layered or continuous-flow card support.

Manager inspected actual desktop/phone screenshots for Layout, arbitrary-path
Patterns, section scope and bank return, and themed Bench. Durable screenshots
are under the conversation's `section-integration` visualization directory.
Build output has the existing large-chunk advisory; it is not a build failure.

## Remaining acceptance and planned packages

Hardware
appearance, physical identification/restoration and offline restart require human
observation and are not inferred from mocked browser tests. No card flash,
firmware signing, production deployment or exhaustive Prove run is part of this
batch. Existing concurrent firmware thumbnail work is outside this change.
