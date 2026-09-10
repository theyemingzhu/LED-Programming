# Patterns and Pattern Lab — diagnosis and implemented creative slice

Date: 2026-09-09. Mode: Sprint, approved autonomous implementation.
Initial diagnosis baseline: `5b10a41a`; reconciled implementation base: `51a7af3b`.
Product changes are local on `codex/pattern-creative-reviewed`; no release or physical hardware verification.

## Implementation result

The approved Slow color drift vertical slice is implemented: draggable palette,
color pickers, locks, accessible reorder arrows, Pace (2–12 minute loops),
Character, three related visual variations, Undo, quick rehearsal, precise timing,
Keep/Update/Save as new and visible reopening. Saved compositions remain private
browser drafts, accurately labelled; project-scoped scratch restores unsaved work.
Fine tune retains advanced Lab controls.

Patterns now has one name/save area, stable updates and renames, capacity refusal,
delete/Undo with playlist restoration, full Lab handoff and linked recipe metadata.
Native color, playback and section settings survive repeated edit roundtrips.
Live preview follows native and streamed selections until stopped; Piece/Strip
only changes display positions. New Mandelbrot/Lotus recipes honor palettes and
animate on one-dimensional layouts; legacy recipes retain prior appearance.

Color journeys currently play live from Studio and require the tab to remain open.
Recording and standalone minute-long color journey playback are unsupported and
explicitly explained. Section-scoped Lab output remains disabled until physical
patch-to-zone mapping can be verified; the existing Patterns route remains available.
Actual physical hues/GRB order and strip playback remain Bench observations.

Primary checkpoint: 2,465 unit tests passed and production build passed. Browser
regressions cover creative/save/reload, original advanced handoff, native settings,
preview switching/stopping, and view geometry. Desktop and 390px phone screens
were inspected directly. Recovered checkout verified with 19/19 desktop scenarios,
5/5 Mobile Chrome creative scenarios, and a fresh production build. Recovery used
the exact stashed tracked snapshot (4896c040) plus new files; no source fixes were lost.

Adrian's follow-up: the differently marked Mandelbrot tile does not display live
on his physical strip when clicked. This confirms physical selection-to-play
continuity as a priority; it does not establish that an explicitly started stream
fails. The phone badge means Studio streaming; lightning means native card
playback. The separate Preview on Lights action is present in the inspected UI.
Whether that action succeeds on Adrian's card remains untested. The separate
question about the location of the color mismatch remains open.

## Outcome and recommendation

Adrian should be able to choose a pattern, tweak it, give the result a name,
save it, reopen it, and continue editing without losing its appearance or
wondering which Save button matters. Advanced Lab editing should continue that
same design. Transitions should connect saved looks; evolution should change
one look over time.

Build reliability and editing continuity first, then improve the controls and
advanced authoring. A broad visual redesign or adding another generator library
first would leave the existing data-loss and rendering defects underneath it.
Preserve ESP32-only runtime and existing firmware interfaces. Any new persisted
metadata needs an explicit compatibility design before implementation; no backend
architecture, migration, firmware release or flashing is implied by this plan.

## Evidence ledger

Confirmed means demonstrated in current code, a focused executable probe, or the
actual browser as stated. These are scoped findings, not exhaustive product proof.
Paths below are relative to `lightweaver/`.

| ID | Finding and evidence | Consequence |
| --- | --- | --- |
| P01 | **Confirmed:** `Sculpt in Lab` passes only patternId (`src/v3/lw-pattern.jsx:2761`); Lab gives that ID precedence over the current look (`src/pattern-lab/PatternLabScreen.jsx:582`). | Current color, speed, brightness, modifiers, look name/identity and section context do not travel into Lab. |
| P02 | **Confirmed by executable round trip:** `recipeFromLook`/`lookFromRecipe` lose native fields. Aurora hue32/saturation0/hueShift80 returns hue0/saturation198/hueShift0; playback survives. See `src/lib/patternLabFromLook.js:12` and `patternLabHandoff.js:107`. | Even passing the full look is insufficient. Native Lab preview automatically sends the reconstructed look, so opening it can change the LEDs. |
| P03 | **Confirmed by executable save probe:** the thirteenth Patterns look silently removes the oldest (`src/lib/sectionLookModel.js:177`). Lab instead refuses at capacity (`patternLabHandoff.js:469`). | Lost saved work and potentially invalid playlist references. Capacity must be checked before any mutation. |
| P04 | **Confirmed source behavior:** both Patterns Save actions force fresh IDs (`src/v3/lw-pattern.jsx:1830–1863`); saved tiles lack update/rename/delete actions. | Iteration creates duplicates; a renamed or updated look cannot retain its playlist identity through the UI. |
| P05 | **Confirmed source behavior:** Patterns tweaks live in component `draftLooks`, while `updatePreviewLook` marks the project edited (`lw-pattern.jsx:1364`). That scratch state is absent from project serialization. | Project dirty/autosave signals can imply protection that does not cover the current tweaks. Navigation/reload recovery needs a focused browser regression. |
| P06 | **Confirmed source behavior:** Lab working recipe and undo are component state. Saved drafts support inline naming, explicit Replace, Save as new, and undo, but have no content-based clean/dirty comparison (`PatternLabScreen.jsx:936,1289`; `patternLabDraftActions.js:68`). | Existing machinery is useful, but unsaved work is fragile and unchanged saves can duplicate. Preserve the working recipe locally and distinguish Saved from Unsaved changes. |
| P07 | **Confirmed source behavior:** Use in Project always makes a unique saved look; normalized saved looks retain no recipe link (`patternLabHandoff.js:474,560`; `sectionLookModel.js:145`). | Repeated handoff duplicates; reopening the playable look cannot recover the full editable design. A portable, backwards-compatible recipe association is a design prerequisite. |
| P08 | **Confirmed worker/geometry probe; browser symptom observed:** horizontal geometry normalizes Y to zero. Mandelbrot then samples one uniform escape band; Lotus misses the central bloom. Mandelbrot: one color on a horizontal fixture versus 14 on a grid. Actual 41-pixel browser preview was very dim olive; Lotus rendered dim pink. | These patterns are rendering, but their default presentation on a straight strip looks broken. Center degenerate sampling axes or offer an explicitly labelled strip adaptation; preserve real artwork coordinates. |
| P09 | **Confirmed:** Piece/Strip rewrites the geometry before the worker (`PatternLabScreen.jsx:710,1650`; `PatternLabPreview.jsx:315`). Fixed-time frames differ. | A view switch changes pattern output and can change physical streamed frames. Render in original geometry; flatten display coordinates only. |
| P10 | **Confirmed frame comparison:** Mandelbrot and Lotus use hard-coded HSV (`patterns-library.js:1050,1084`); red-only and blue-only recipe palettes give identical frames. | A visible Color control can fail to recolor the preview. Advertise and implement a defined color behavior per pattern; do not silently recolor every existing design. |
| P11 | **Confirmed source behavior:** native looks auto-preview; nonnative looks require Preview on Lights (`PatternLabPreview.jsx:375,425`). Actual browser displayed that button for both reported patterns. | Clicking a lower tile has different physical behavior. Use a persistent, explicit Live preview state that works across supported engines. |
| P12 | **Confirmed:** tile images are static CSS gradients; motion in both reported patterns uses a slow normalized clock (`frameEngine.js:228`). Worker probes finished in milliseconds. | Thumbnail expectation and actual output diverge; slow animation resembles a frozen preview. Use sampled thumbnails and test motion over meaningful time intervals. |
| P13 | **Confirmed source boundary:** Lab evolution records to sequence assets, while Playlist fade/dwell operates on its supported look entries (`patternLabHandoff.js:575`; `src/v3/lw-playlist.jsx:257`). | “Evolve this look” and “Fade between looks” need separate explanations and a truthful path for playing recorded designs. Do not promise arbitrary native/recorded transitions before checking the runtime contract. |

No RGB/GRB configuration mutation was found in the audited Lab path. Lab emits
logical RGB; firmware applies configured channel order at the output boundary.
Focused firmware color-order tests passed. Literal calibration loss remains an
unconfirmed separate possibility. Ask whether Adrian sees the mismatch on the
physical LEDs, the browser, or both; one optional question is pending.

An actual browser console also reported a project repository content-hash mismatch.
This is a separate persistence lead, not a proven cause of Lab preview failure;
reproduce it in an isolated fixture before attaching it to this work.

## Proposed human workflow

**Patterns:** Browse → select a built-in pattern or My look → tweak beside a
persistent preview → name → Save look. Reopening My look shows **Update [name]**
and **Save as new**. Rename changes its label and retains its ID. Delete identifies
playlist uses and is recoverable with Undo. Built-ins remain source patterns;
the first save creates a personal look.

Show **Saved**, **Unsaved changes**, or a concrete save error beside the name.
Recover the in-progress draft after navigation/reload using the existing local
workspace mechanism. Saving a draft must not imply it is installed on the card.
Show **Saved in this project** and **On the card** as separate, readable states.

**Lab:** Edit in Lab carries the complete selected look and its editable source.
The same name/save controls remain visible. Everyday color/speed/brightness
controls come first; pattern-specific controls such as Petals and Zoom follow;
advanced diagnostics stay collapsed. Leaving and reopening restores the draft.
Returning to Patterns updates the linked look when requested, with Save as new
as the explicit alternative.

**Preview:** Browser preview always works independently of card availability.
The physical Live preview toggle has a clear state across native and streamed
patterns; streaming limitations and reconnect failures appear next to it.
Changing the view never changes the generated frame. Distinguish Starting,
Playing, Paused and Failed. Short-strip and spatial previews explain which
geometry they use. No automatic channel permutation belongs in the browser.

**Time:** “Evolve this look” exposes character, amount, duration, and a scrubber
over the existing evolution engine. “Fade between looks” uses the existing
Playlist hold/fade model. Extend recorded-design integration only after its
playback and storage contracts have been verified.

## Build sequence and ownership

### Creative direction revision — Adrian's follow-up

#### Superseding UX direction: effortless play first

Latest instruction: Adrian wants this effortless, fun and engaging, and is open
to a new UI/UX. An authored timeline as the primary interface would put too much
composition work on him. The explicit timing model below remains implementation
and optional fine-tuning capability; it is not the default user journey.

Proposed main interaction: **choose a visual starting point → play → keep**.
Use a small curated set of editable compositions, rendered on the actual piece,
with names that explain the experience (e.g. Slow color drift, Traveling glow,
Breathing color). These are ingredient combinations with intentional defaults,
not additional opaque pattern IDs. A failed or unsuitable rendering must never
be presented as a successful variation.

Keep three creative controls visible initially:
- **Colors:** a few attractive combinations plus direct color choice. Dragging
  swatches orders the journey; individual color locking supports exploration.
- **Pace:** a continuous slow-to-lively control for the journey, with a readable
  duration hint. Motion retains a useful independent default. Exact timings are
  available through one optional Details control.
- **Character:** restrained-to-expressive variation within the selected
  composition, with defined mappings rather than an arbitrary all-knobs macro.

**Try a variation** offers three small previews of related alternatives. Keep
locked ingredients, make a bounded change, show a short explanation such as
“Same colors, softer movement,” and retain the previous version for instant
comparison/Undo. Candidate rendering and deterministic parameter variation are
sufficient for the first version; a network AI service or prompt-writing task is
not required. Do not stream all candidate previews to the card: only the selected
candidate owns physical output, under the persistent Live preview state.

One **Keep this look** action saves a complete editable composition with a
suggested name; naming is optional friction, not a mandatory dialog. Reopening
exposes Update and Save as new. Save success must reflect durable local storage,
and card deployment remains a distinct truthful status. “Make it mine” should be
possible without understanding recipes, baking, oscillators or keyframes.

For long changes, show a small visual Beginning → Later → Return overview and
a clearly labelled quick rehearsal; let the user enjoy the whole arc without
waiting minutes. **Fine tune** reveals exact stops, holds, fades and section
timing only when wanted. No wizard or mandatory multi-step setup for each look.

Build one working vertical slice around Slow color drift: palette → Pace →
related variation → live preview → Keep → reopen. Judge it by how quickly Adrian
gets a look he wants to keep and whether exploration feels predictable and
reversible. Do not build a full new interface/catalogue before testing this slice
on the actual screen. This supersedes making a timeline the first creative UI.

Adrian endorsed the repair/editing direction and clarified the desired outcome:
help compose interesting light over long periods, including deliberate sequences
of colors and slow fades. Ease of saving alone is not an adequate outcome.
Treat creative composition as a central deliverable, not optional final polish.
The authored interaction below is the proposed first creative slice; repair
authorization does not imply a firmware deployment or migration.

**New confirmed constraint:** `src/lib/cardPlaylist.js:18` and firmware
`LightweaverTypes.h:36` cap playlist fades at 10,000 ms. Fade is playlist-wide,
not per transition. Firmware stores it as uint16_t, so merely raising the UI
maximum cannot support multi-minute native fades. Lab recipe normalization and
evolution sampling constrain duration to 300–900 seconds. Existing evolution
selects preset trajectories and seeded variation; it does not author explicit
color destinations at owner-chosen times. Supersedes the assumption that exposing
existing fade and evolution controls is enough for Adrian's creative request.

**Proposed first creative slice: Color journey.** Begin with three visible color
stops, each with a color, Hold duration, and Fade to next duration. Display an
editable timeline with literal seconds/minutes. Let Adrian choose the colors
first, then add movement. Provide a useful starting composition, not a blank
technical editor. Example 6-minute loop:

| Segment | Hold | Fade to next |
| --- | --- | --- |
| Warm amber | 30 seconds | 90 seconds to violet |
| Deep violet | 30 seconds | 90 seconds to blue |
| Blue | 30 seconds | 90 seconds back to amber |

Allow steady fade or gentle ease-in/out. The color interpolation path and
brightness must be visually checked at intermediate times: two attractive
endpoints do not ensure an attractive fade. The final fade is part of the saved
loop, not an abrupt jump back to the first color.

Keep three independent time scales legible: the overall journey in minutes,
movement across the piece in seconds, and subtle texture variation. A longer
journey must not freeze every movement or require lowering a master speed slider.
Offer whole-piece fades first, then delayed movement between existing sections
(for example center first, outer sections later). Never infer artwork structure
from a straight strip; use actual mapped sections and explain when absent.

Add richer composition progressively: a restrained background with a moving
accent; gradual changes in brightness/density; calm passages and occasional
highlights; bounded variation around the authored sequence. Randomness is an
optional ingredient, with a repeatable seed, not a replacement for authorship.

Preview controls: scrub to any moment, play a selected transition, compare real
time with clearly labelled accelerated rehearsal, and preview on the actual
piece. Rehearsal speed changes observation only; saved timing stays intact.
Starting compositions should be editable examples with a short explanation of
their ingredients. Later suggestions can change one ingredient at a time with
Undo; an AI prompt box is not required to make the first version useful.

**Architecture decision before implementation of long fades:** keep the authored
journey independent of output method. Prove minute-scale color interpolation in
the browser using the existing frame-render/stream boundary, then verify the
existing recording path's duration, size and playback limits for standalone use.
Do not promise a long recording fits. If efficient autonomous journeys require
native firmware support, return a bounded protocol/storage proposal; do not
silently expand this UI task into firmware migration. Existing projects and
native playback must retain their current behavior.

**Creative acceptance:** Adrian can build the explicit six-minute example,
change one stop and one fade duration, keep independent motion, save/reopen it
unchanged, preview any transition without waiting six minutes, and understand
whether it requires Studio to remain open. Endpoint/midpoint samples and the
loop boundary are deterministic; a Bench observation judges the physical fade.
Follow with one artwork-aware composition using existing sections, once the
basic color journey works. This is the first creative deliverable after the
data-preservation and preview foundations, before a broad catalogue redesign.

### Batch A — preserve edits and output

One Studio owner handles saved-look lifecycle, capacity, exact Patterns→Lab
handoff, and reversible native conversion. This is one connected persistence
boundary, so do not divide those files between simultaneous workers.

An independent rendering owner handles sampling/display separation, the two
reported geometry cases, palette capability and clock diagnosis in the renderer
libraries. Return any necessary `PatternLabScreen.jsx`/`PatternLabPreview.jsx`
integration as a proposed patch for the Studio owner; only one writer per file.

The primary owns test integration, documentation and the workboard. A bounded
test worker is useful only after the interface contract is frozen, and owns
separate browser spec files. At most three workers; no redundant review pass.

Acceptance:
- The thirteenth save refuses with an actionable message and preserves every
  saved look, active look, and playlist entry. Updating at capacity succeeds.
- Patterns→Lab→Patterns retains all supported fields, section assignments,
  name and identity. Unsupported conversion is explained before changing output.
- Piece/Strip has byte-identical generated and outgoing frames at fixed time.
- Mandelbrot/Lotus produce finite, visible output on 41-pixel horizontal and
  spatial fixtures. Loading/error states finish truthfully; rapid switching is
  latest-selection-wins. Palette controls change output where advertised.
- Native color settings, including zero saturation and enabled modifiers,
  round-trip unchanged until deliberately edited. RGB order remains untouched.
- With Live preview already on, selecting native→Mandelbrot→Lotus keeps the
  strip following the selection without a hidden second play action. Show
  acknowledgement, connection/stream errors and Stop beside the preview. Keep
  explicit opt-in for the first physical preview; test that stale streams stop
  when switching engines and that the previous effect cannot remain silently
  labelled as the newly selected one. Physical success still needs Bench proof.

### Batch B — make saving and reopening obvious

Build the shared name/dirty/save UI, stable-ID Update/Rename, explicit Duplicate,
Delete/Undo, draft recovery, and an editable recipe association. First define
how recipe links survive normalization, project export/import and old project
loads. Use additive compatible metadata in existing storage if feasible;
escalate any required schema migration as a concrete scope decision.

Acceptance:
- Tweak, name, save, reopen, rename and update can be completed on desktop and
  phone without discovering a hidden second save location.
- Update preserves count and playlist references; Duplicate creates a fresh ID;
  Rename preserves timing/order; Delete/Undo restores exact references.
- Navigation/reload recovers unsaved work. Quota/error cases never say Saved.
- A saved Lab design reopens with its complete recipe; repeated Update does not
  create more looks. One atomic controller update covers look and playlist edits.

### Batch C — expose creative time controls

Make existing evolution understandable, add sampled thumbnails and capability
filters, and polish Playlist fade/hold. Specify the smallest supported path for
recorded designs to be found and played. Do not add another timeline engine or
unverified firmware playback mode. If arbitrary recorded/native transitions
require firmware work, deliver the browser improvements first and bring back
that separate proposal.

Acceptance: a saved evolution restores seed, controls and duration; scrubbing
matches deterministic playback; a two-look fade is previewable; every playback
button accurately says whether the browser must remain open or recording is
required. Unsupported operations give a useful reason.

## Verification and physical follow-up

For each bug: focused red regression, smallest fix, focused green, actual screen.
After each coherent batch: one integrated checkpoint and relevant browser cases,
with one stable preview. Do not run Prove or the release gate during editing.

Investigation evidence: all catalog snippets compiled; real worker probes rendered
Mandelbrot/Lotus at 384 samples in approximately 7.3/5.1 ms on this machine.
46 focused Node tests and two firmware color host checks passed in the diagnostic
worker. The primary independently reproduced the lossy native round trip and
thirteenth-save eviction, inspected the implicated code, and viewed both reported
patterns in the real public browser. These are diagnostic checks, not proof of
fixed behavior. Browser preview on the physical card was not activated for the
two reported patterns; no physical hue gate was passed.

Bench after the browser repair: Adrian observes one exact saved look before and
after opening Lab, then native→streamed→Stop behavior and actual RGB hues. Ask
for one observation at a time. Ship only on a separate release instruction.

## External inspiration

- [WLED Web UI](https://kno.wled.ge/basics/web-ui/): named preset saving,
  searchable effects and context-sensitive controls. Borrow the compact editing
  loop; keep Lightweaver's artwork and section workflow.
- [WLED presets](https://kno.wled.ge/features/presets/): explicit saved state and
  naming. Use clear Update/Save as new actions without exposing preset slot IDs.
- [WLED JSON playlist API](https://kno.wled.ge/interfaces/json-api/): per-step
  duration and transition. Reuse Lightweaver's existing fade/hold surface.
- [Firestorm](https://github.com/simap/Firestorm): named pattern selection and
  sequence membership. Make browsing, playing, and adding to a sequence distinct.

These are established design references checked on 2026-09-09, not a claim of
new features in the last 30 days. No external code was imported.

## Original investigation record

Applied Manager Playbook v2 and Research an idea recipe v1, adapted to Adrian's
existing project and requested diagnosis/build plan. No audience question was
needed: this is Adrian's own authoring workflow. Scope is investigation now;
the proposed batches are the implementation handoff.

Workers: Astra/high for rendering, physical-output and conversion diagnosis;
Sol/medium for editing/persistence audit; Luna/low for bounded public-source
collection. Routing followed actual available host models. Each produced an
independent read-only deliverable; measured token/cost totals are unavailable.
Existing unrelated working-tree edits were preserved.

The original proposal above was subsequently authorized and implemented as the
Slow color drift slice. Remaining physical observations belong to Bench; releasing
these changes requires a separate shipment instruction.
