# Refined section, pattern and output workflow

Date: 2026-09-25. Status: U0–U4 integrated and verified locally; U5–U8 remain
planned. See [implementation evidence](2026-09-25-section-workflow-integration-evidence.md).
Design covers arbitrary artwork, ordering, continuous flow and layered patterns.
Based on [Git forensics](2026-09-25-gpio-history-forensics.md), the current live
Studio, and two Sol audits of historical interactions and present integration.
The primary manager owns this plan. Concurrent firmware work is outside it.

## Design decision

Adrian's refinement: this must belong to the current Studio design, support
arbitrary artwork, respect Layout and Patterns as distinct workspaces, preserve
reordering, and support both motion flowing between sections and patterns built
from multiple patterns. The sections on ordering, flow and composition below
extend the original UI-only scope. Both section mixes and overlapping effect
layers are planned; their runtime capabilities are explicitly distinguished.

Recover the older workflow's visibility and direct manipulation within the
current application. The owner should see **what part, which output, how many
LEDs, and which pattern** together, select the part, change its look, and install.
One shared section data projection and one contextual pattern chooser should serve
that journey, with each screen retaining its existing structure. Wiring edits remain in Layout; choosing patterns remains in
Patterns or Bench's bounded audition; installation uses existing verified paths.

The default screen is a quiet overview. Editing reveals the controls relevant
to the selection. Detailed address ranges, alternate actions and diagnostics
appear on demand. Artwork remains prominent and the selected target is obvious.

This extends the shipped September "Sections without effort" work rather than
reintroducing its completed tasks. Section derivation, GPIO ordering, uneven
divide, identify-section, copy-to-all and saved mixes already exist. Their
semantics and useful parts should survive the design pass.

## What to integrate, why, and where

| Priority | Historical benefit / present issue | Integration | Visual cost paid by removing or consolidating |
| --- | --- | --- | --- |
| P0 | June targets showed section, count, pattern and range together; present facts are scattered | Replace the existing target presentation with compact section rows: name, GPIO/count, current pattern with a small static swatch | Replace chips plus repeated selected-target statistics; do not append another dashboard |
| P0 | July showed explicit wire inventory; owners could see the physical setup | Bench completion and Layout show reported/measured outputs and mapped sections, using the existing GPIO grouping | Replace repeated count/output summaries; no extra required "how many wires" question when discovery already knows |
| P0 | Earlier section-local controls made scope clear | A row's pattern action selects the exact section and reveals/focuses the existing bank; use the same chooser behavior in Bench | Replace standalone instructional paragraphs with one selected-scope line; no second pattern catalog |
| P0 | Older patch board exposed address/routing relationships | One Wiring details disclosure shows section, output-relative LED span and direction, with Edit in Layout | Move low-frequency mapping facts out of the main rows and consolidate existing disclosures |
| P0 | Preview, saved mix and installed card state can be confused | One local action/status area distinguishes draft, preview, kept look and verified install; preserve direct Install | Consolidate repeated save/status blocks and competing primary actions |
| P1 | June mix cards exposed their constituent section patterns | Saved mix shows up to two concise section→pattern pairs plus an expandable full summary, including modified tuning | Enhance the existing mix card; no new mix library or second save bar |
| P1 | Earlier inline actions avoided losing the selected part on navigation | Layout → Change pattern selects that same section in Patterns, remembers return location and restores focus | Contextual link replaces generic navigation and repeated explanations |
| P1 | Undo and physical identification build confidence | Reuse existing Undo and identify-section behavior; make selection feedback clear and restore any temporary hardware change | One selected-item action, not an always-visible test toolbar |
| Later | June pattern drag-to-target and Randomize existed | Optional desktop drop only after tap/keyboard parity; scoped color/motion suggestions only with a real user need | No drag-only workflow; no permanent Randomize button in this pass |

The old live-preview checkbox is intentionally excluded: it could make a pattern
tap appear broken. Existing named mixes and Send split preview are retained,
not rebuilt under new names. The current artwork-aware preview is stronger than
the early preview and remains the rendering source. Richness belongs in useful
interactions, not more panels, icons or animated thumbnails.

## Screen ownership and ordinary journeys

**Bench: discover and confirm the physical strips.** Count a strip once. Confirmed
outputs appear with their actual GPIO and measured count; provisioned headroom
does not appear as a confirmed strip. Completion offers same or different native
patterns using the compact rows. Stop stays accessible while physical audition
owns playback. Embedded setup continues to Layout without forcing installation;
standalone Bench can install the measured result through its existing handler.
Renaming or editing an existing artwork must never be replaced by discovery's
starter geometry.

**Layout: structure, counts and routing.** Preserve the canvas and existing
connected-family editor. The section list presents physical output groups and
lets the owner rename/reorder/reassign through the existing controls. Changing
wiring invalidates its verification. A pattern link transfers the exact target
to Patterns. A section spanning GPIOs gets a contextual Separate action only
where independent sections are needed; the existing preview and Undo preserve
physical LED addresses. Grouped/custom overlaps show their specific repair path.
No second count, range or GPIO editor appears inside Patterns.

**Patterns: choose and tune appearance.** All sections shows the actual shared
pattern or **Mixed**. Selecting All does not overwrite the saved/draft differences.
The existing selection action may audition or identify the target on the card;
that temporary behavior must still restore correctly. Choosing a pattern with All selected applies
it to all eligible sections. Selecting one row scopes pattern and tuning to that
section and leaves all others unchanged. The selected scope appears once above
the bank. Copy to all copies the selected look, including its tuning, through the
existing helper and can be undone. On desktop the existing bank is focused; on a
phone a single contextual chooser uses that same bank and returns focus to the
origin row. A second modal must not stack over a Bench overlay.

**Card: install and recover.** Keep this look saves a reusable named look in the
project; it is optional when the owner simply wants to install current edits.
Install captures the current intended snapshot and uses the current authorization,
preflight, candidate recovery, readback and revision checks. There is no mandatory
Keep → Install double step. Layout changes follow wiring verification; appearance
changes take the appropriate existing path. A later edit remains a newer draft
if an older snapshot finishes installing.

**Playlist and Show: consume existing looks and sections.** Reuse names/order and
mix summaries. Preserve playlist references on rename/update, and keep delete/use
warnings where those actions occur. Do not introduce another assignment editor
or alter native scene semantics in the U0–U4 presentation batch. Later flow and
layer packages extend the complete-look contract once, then these screens consume
it through their existing references and delivery checks.

## Visual and interaction rules

- Row at rest: section name; one muted GPIO/count line; one labeled pattern
  action. A swatch is supplementary, never the only pattern identifier.
- Patterns is section-first. Layout is output-first. A section spanning outputs
  appears once as an editable section with multiple route labels; do not duplicate
  its controls under each output or imply separate patterns already exist.
- Default surface has at most one expanded editor and one filled primary action.
  Address tables, direction/seam details and advanced controls are collapsed.
- Keep, rename, save-as-new and delete use the existing look transaction. Keep
  is a secondary action when Install is available; management actions belong in
  the selected look's menu, with Undo-delete still discoverable after deletion.
- Keep card connection identity in its existing chrome. Show local workflow
  state near the action. Do not repeat the same warning in a banner, tile, footer
  and toast; field errors stay with their field and actionable recovery uses the
  existing notice owner.
- Reuse General Sans, Spline Sans Mono for numbers, warm surfaces and existing
  spacing/color tokens. No new accent palette, borders around every fact, nested
  cards, ornamental badges or simultaneous animated mini-previews.
- Layout may animate selection feedback briefly (roughly 120–180 ms) without
  moving controls. Respect reduced motion, preserve scroll, and keep focus order
  equal to reading order. No smooth scroll that hides the originating section.
- All essential actions work by tap and keyboard at 390px; 320px gets no
  horizontal overflow. Touch targets are at least 44px. No hover-only essential
  controls, long-press dependency or drag-only reordering.

## State and integration contracts

Use `sectionTargetsForProject` / the ProjectContext-derived section list and
`compiledWiring` as inputs. Extend their read-only projection as needed instead
of inventing another saved section list. A presentation row needs source patch
identity, runtime zone identity, label, effective look, LED count, output IDs,
pins and spans, plus measured/mapped/verified evidence. These are distinct fields.
Output pins are physical addresses, not section identities.

Reuse `sectionLookModel.js`, `connectedSections.js`, `sectionRunConversion.js`,
`wiringCompiler.js`, `cardSectionSync.js` and the existing snapshot/history paths.
The documented July identity reproduction must continue to pass. The original
overview/chooser batch needs no new project schema, zone kind or firmware field.
Flow and compositing extend authoring/runtime contracts as specified below; they
must not be disguised as a display-only change or another independent state store.

Proposed shared presentation components (names provisional): `SectionSummaryRow`,
`SectionPatternChooser`, `OutputSummary`, `SavedMixSummary`. Presentation receives
data and callbacks. It never calls the card. Shared chooser data uses the current
bank's identity/compatibility metadata; Bench restricts it to the core native
patterns supported by its provisional configuration. Show an unavailable choice
with its reason when useful; never silently substitute a different effect.

Layout target handoff must carry a valid project/generation and stable section
identity. Resolve that identity on arrival; if removed or made uneditable, explain
the change and require a new selection. Do not silently select All. A geometry
strip may resolve to several independent targets; show those children for the
owner to choose rather than guessing. Clear stale handoffs on project switch.

Preserve preview ownership by card, boot, project and generation. Stop, navigation,
chooser closure and scope changes must use the existing serialized cleanup where
appropriate. Section identify must not race a pattern audition. A missing card
zone during a section-specific edit must not quietly fall back to global output;
surface the install/repair action and preserve unrelated sections.

Keep two facts separate even when rendered on one line: project persistence and
card playback. For example, "Previewing on card · not kept" differs from "Kept
in project · not installed". "Installed" requires exact successful readback and
matching snapshot. No card or stale identity still allows project editing/Keep.
Fresh wiring disagreement replaces Install with its existing verification action.
Do not create a new error or pairing workflow.

## Work packages and agents

At most three workers plus the primary manager. Prefer Sol medium for bounded
UI work; Sol high only for identity, preview ownership or installation changes.
Luna inventories acceptance and catches duplicates. Manager integrates source,
reviews boundaries and alone updates the workboard. No routine Astra worker.

| Package | Owner and file boundary | Dependency | Reviewable result |
| --- | --- | --- | --- |
| U0: projection and interaction contract | Sol App; `sectionLookModel.js`, ProjectContext-derived fields, focused tests | First | One read-only row model; differing IDs, multi-output section and same-output sections modeled correctly |
| U1: compact Patterns and saved mixes | Sol App; `src/v3/lw-pattern.jsx`, pattern styles, new shared presentation components | U0 | Existing target/stat blocks replaced; one bank, explicit scope, recognizable mix cards and optional Keep |
| U2: Layout overview and target handoff | Sol Layout; `DrawModePanel.jsx`, Layout hooks/styles and navigation tests | U0; App finishes shared-state edits first | Output inventory, one mapping disclosure and exact-target round trip with focus restoration |
| U3: Bench chooser and completion | Sol Bench; `StripDiscoveryPanel.jsx`, discovery styles/helpers/tests | Shared chooser frozen by U1 | Confirmed-only targets, consistent choices, preserved Stop/restore and embedded/direct completion behavior |
| U4: integration and acceptance | Manager plus Luna inventory; owners repair their files | U1–U3 | One checkpoint, focused journey/visual evidence and honest hardware list |

Build in two coherent batches. Batch A is U0, compact rows/scope from U1 and U2;
test the useful main flow before additional polish. Batch B completes saved-mix
summaries, Bench reuse and action/status consolidation. Within each batch run one
integrated checkpoint after focused regressions and actual screen inspection.
Do not rotate several agents through `lw-pattern.jsx` or ProjectContext at once.

No firmware change is expected for the overview/chooser batch. Native continuous
flow and broader layer delivery require their own compiler/firmware work and
proof. A demonstrated native contract defect receives a bounded assignment. The existing
GPIO integration's firmware release, embedded-card Studio delivery and physical
acceptance gates remain separate; a browser mockup cannot close them.

## Acceptance before calling the integration complete

1. Same → different → change one → back to same works for unequal outputs and
   for multiple sections sharing an output; opening a scope alone does not mutate
   the saved/draft look. Temporary audition/identify restores the correct playback.
2. One section across GPIOs is labeled honestly; Separate/Undo preserves physical
   tuples and saved references. Grouped/custom cases have an actionable refusal.
3. Section selection reaches the bank in one action; choosing an item changes
   only the intended target. Keyboard return focus and phone scrolling are stable.
4. Keep/reload, direct Install without Keep, reopen, mix update/rename/delete/undo
   and playlist references preserve the intended identities and looks.
5. Unconfirmed Bench outputs never receive preview commands; Stop/close/restart
   and wrong-card/readback failures remain truthful. No global fallback from a
   missing section, no duplicate install or new preview stream leak.
6. Desktop and 390px screens have one obvious next action, no competing expanded
   surfaces, no duplicated section statistics, and no clipped controls. Test
   long names, four outputs, supported section capacity and empty/error states.
7. User-facing hardware evidence stays pending until a person observes separate
   strips, restore and offline restart. Novice acceptance needs an uncoached user.

Reuse focused coverage in `patterns-v3.spec.ts`, `patterns-section-row.spec.ts`,
`layout-run-separation.spec.ts`, connected-section and ordering specs,
`strip-discovery.spec.ts`, section look/copy/flash and deployment tests. Add only
the missing interaction and ambiguity cases. Run the proportional checkpoint;
this plan does not authorize the exhaustive Prove run or a release.

## Illustrative sketch and decision

The conversation contains an interactive sketch of compact section rows, scoped
choice, copy-to-all, Undo, optional Keep and direct Install. It sends no card
commands and simplifies the bank and installation to illustrate interaction.
It is not a pixel-perfect finished screen or proof of product integration.
The sketch now uses arbitrary path sections, neutral names and the existing
Studio's warm OKLCH/clay token values and tighter control shapes. This is a
component interaction reference; production uses the existing classes and full
Layout/Patterns screens, not this independent wrapper. Local sketch checks were
rerun at 736, 390 and 320px: scoped edit leaves other rows
unchanged, copy-all, Undo and direct simulated install work; no horizontal overflow
or JavaScript errors. Phone screenshot inspected. Existing product appearance and
full supported states still need the implementation's screen review.

Recommended first implementation: **the compact section overview, exact-target
pattern action and mapping details**, replacing the current duplicated facts.
Then improve saved-mix recognition and bring Bench onto the same presentation.
Desktop drag and Randomize remain optional, outside the initial build.

## Integration with the current style and screen structure

The live entry is `src/main.jsx` → `src/v3/app.jsx`. The archived `src-v3/`
screens are reference material only. Preserve the current rail, screen headers,
toolbar positions, design tokens, pattern bank and canvas/preview engines.

| Existing location | Exact integration |
| --- | --- |
| Patterns `lw-pattern.jsx`, `.pm-target` | Replace the target chips and repeated three-stat card with the compact section presentation. Consolidate helper paragraphs rather than appending a new panel |
| Patterns `.pm-browse` | Keep its search, categories and pattern cards. Row action calls the existing `selectTarget`, then focuses this bank; show selected scope once |
| Patterns `.pm-aside` / `.pm-instrument` | Keep artwork-aware preview and tuning. The sketch's miniature paths are not a replacement renderer |
| Patterns `.pm-actions`, `.pm-tune-pane` | Install remains the primary action; Keep remains available without competing primary styling; preserve inline error ownership |
| Existing `.pmcard` for saved looks | Show concise constituent pattern/layer summary inside the existing card. Do not add another gallery |
| Layout `.la-gpio-group`, `.la-strip-row`, `.la-strip-detail` | Reuse output groups, selected-row inspector, GPIO assignment and physical move controls. Consolidate facts within these elements |
| Layout connected-family editor | Reuse its current per-section GPIO/pattern/count controls; do not add a second Layout pattern editor |
| Pattern Lab controls beside its existing preview | Add the missing layer-authoring section here. Patterns opens the selected look via its existing Lab handoff and returns to the same look/target |

Style ownership: `v3-styles.css` and `v3-console-shared.css` supply General Sans,
Spline Sans Mono, warm surfaces, clay action color and live-state tokens.
`v3-patterns-console.css`, `v3-patterns-extra.css`, `v3-layout-console.css` and
their existing component scopes own the changes. Use `--lw-live-ink` for live
text, not the bright fill token. Ordinary selection is not evidence of playback.
Shared Styles for Playlist must not change unintentionally.

Mobile integration needs an explicit adjustment: below 900px, existing CSS
places the sticky preview/instrument before `.pm-main`. Replacing target rows
alone does not make selection easy to reach. Keep a compact preview and selected
scope visible; let the bank and editor use the remaining screen. Review DOM,
reading and focus order together, including the sticky pane and 44px controls.
Do not create a second sticky action bar or cover the scoped error notice.

## Arbitrary artwork and ordering

Names come from the project/import and remain editable. New unnamed parts use
Section 1, Section 2 and so on. A real piece named Outer ring retains that name;
the interface must not assume every piece is concentric or infer left/right from
its shape. Render the actual SVG paths and sampled LEDs. Test open curves, lines,
branches, disjoint shapes, unequal sections and a ring as one ordinary fixture.

Ordering has several meanings; a generic drag handle must never change all of
them implicitly:

| Order | Where it belongs | What changing it may affect |
| --- | --- | --- |
| Artwork layer/stack order | Layout's existing artwork list | Canvas drawing order; no rewiring |
| Physical wire order and direction | Layout's existing GPIO/run controls | LED address map; invalidate wiring verification and use verified install |
| Pattern flow order | The selected pattern/layer's Flow controls, with Layout showing the route | Logical motion A → C → B; keep GPIO/run addresses unchanged |
| Effect layer order | Lab's new layer stack | Which effect blends above which; keep geometry and wiring unchanged |
| Time/playlist order | Existing Playlist/Show step editor | Which complete look happens next; no spatial reordering |

The current section row order is derived from existing patch/wiring structures;
there is no independent arbitrary display order to repurpose safely. Keep those
existing behaviors. If later needed, an optional presentation order is separate
authoring metadata, never `output.runIds` under a cosmetic drag action.

Reuse physical Move up/down the wire and drag controls. Within Flow use ordered
target chips plus accessible Move earlier/later and Reverse direction. Within
Layers use Move above/below. Contextual labels, Undo and preview make each change
explicit without adding five permanent toolbars. A family boundary reorder is
not a physical cut/rejoin unless the owner performs the corresponding Layout edit.

## Continuous flow and stacked patterns: current truth

| Capability | Current implementation | Required work |
| --- | --- | --- |
| Different patterns on different sections | Existing section looks / compiled native zone combinations | Integrate the clearer UI and preserve identity/startup/readback fixes |
| Same pattern on several sections | Independent zone/range rendering | Do not label this continuous flow; local coordinates can restart at each range |
| Continuous motion across selected sections | Scene Expression stores/resolves the intent and physical references, but current preview and native compiler explicitly reject it | Implement the shared logical-domain renderer, preview and card delivery before enabling the promise |
| Multiple patterns blended on the same LEDs | Pattern Lab recipe, worker and bounded compositor support layers; visible layer editor is missing | Build Lab stack controls and integrate save/reopen/edit handoff |
| Layered Pattern Lab look on the card | Existing compatibility marks these recipes as requiring a baked sequence; handoff validates a completed bake | Surface exact sequence/media requirements; prove the applicable package/storage/playback route |
| Direct native delivery of general Lab layers | Firmware has a distinct recipe layer renderer, but Lab does not translate into it | Implement and verify a bounded compiler; existing native code alone is not proof of compatibility |
| Fading from one pattern to another in time | Separate from spatial flow; native Scene Expression currently accepts cut transitions | Reuse existing temporal editor; unsupported transitions need their own exact delivery path, not a misleading Flow switch |

Relevant evidence: `sceneExpressionTargets.js`, `sceneExpressionNative.js`,
`scene-expression/sceneExpressionEditorModel.js`, `patternLabCompositor.js`,
`patternLabPatternAdapter.js`, `patternLabCompatibility.js`, `patternLabHandoff.js`,
firmware `main.cpp`, `LightweaverPatterns.cpp` and `LightweaverRecipe.cpp`.
Color Journey has specialized native coordinate behavior; it does not establish
continuous behavior for every other effect.

## Proposed flow interaction and renderer contract

For a selected supported pattern or effect layer, reveal **Flow** in its current
tuning/editor area. Default behavior is Repeat in each section. Choosing Flow
across sections reveals only the participating sections, their order and direction.
Show the same route over the existing artwork preview. Selection is a set of
stable area/section identities, not a list of current labels or GPIO numbers.

Use Scene Expression's existing continuous/repeat intent and area references as
the starting contract. Extend it only where ordered targets/direction cannot
already be represented. Freeze a small, versioned domain contract before coding
two renderers. Derive one ordered logical pixel sequence from source identities,
then map those pixels to compiled output addresses. Reversal affects logical
motion, not installed wiring, unless physical direction was explicitly edited.

All participating sections use one timebase and cumulative logical position.
Unequal section lengths contribute their actual LED counts; normalized progress
must not restart at each section, range or GPIO. Define wrap/end behavior and
zero/one-pixel cases. A boundary between disjoint artwork paths is an explicit
logical jump, not an invented physical connection. The first version supports
one ordered chain; branching paths need an explicit future distribution rule.

The same descriptor must drive preview, baked frames and supported native
rendering. Treat its IDs/order/directions as persistent authoring data; define
migration, split/merge/delete behavior and reference repair. Layout transforms
either preserve the route through the returned identity map or report a broken
reference. They must not silently move an effect to All sections.

Delivery phases: truthful Studio rendering first; validated complete baked output
where supported; then a native subset using shared coordinates or render-once
and scatter. Select the native implementation after measuring frame time, memory
and storage on ESP32-S3. Built-ins that cannot honor a logical domain remain
explicitly unsupported for native Flow. One pattern per zone is not sufficient.

## Proposed composition interaction

Patterns selects, applies and manages complete looks. **Edit layers in Lab**
uses the existing Lab handoff, preserving look identity and selected scope.
Lab owns construction: one base plus a bounded stack of additional pattern
layers using the existing recipe limits and compositor. No parallel composer
is added to Layout, Patterns or Show.

The stack is collapsed until the owner chooses Layers/Add layer. At rest each
row shows pattern name, target and enabled state. Selecting one layer reveals
pattern choice, opacity and blend in the existing inspector; tuning follows
that selected layer. Reorder through Move above/below and optional drag, with
Undo. The base sits below the overlays; composition applies bottom-to-top.
Reuse supported blend modes rather than inventing new math. Expose a simple
default first, with other blend choices on the selected layer only.

Support section-based mixes and overlapping layers as distinct compositions:
"Section A: Fire, Section B: Ocean" assigns effects to separate areas; "Ocean +
Sparkle at 30%" combines effects on the same target. Saved cards identify which
kind is present and summarize it. A layer may eventually use a shared Flow domain
across its selected sections once the flow renderer is implemented. Arbitrarily
nested mixes are excluded initially to avoid cycles and unbounded resource costs.

Persist the full recipe and its target references. Keep/reopen, update/save-as-new,
Undo, export/import, card backup and Playlist references must preserve it. A
simplified single-pattern thumbnail or fallback look must never overwrite the
layer recipe. Apply brightness/gamma/current limits at the established output
stage after composition, with CPU and memory bounded by current contracts.

For standalone playback, use the existing compatibility/bake/package pipeline
only after verifying exact recipe, geometry, asset hash and media availability.
Before baking, show duration/size when it affects a meaningful choice. If direct
native compilation is added, negotiate it via actual capability/readback and
compare output with the Studio compositor. Do not enable Install merely because
the firmware happens to contain a different layer renderer.

## Additional implementation packages and proof

The original U0–U4 remains the compact-UI foundation. These additions are actual
features, not decorative controls or an implicit firmware release:

| Package | Agent / ownership | Depends on | Completion evidence |
| --- | --- | --- | --- |
| U5: ordered flow contract and preview | Sol high on rendering/identity; scene target and preview domain files | U0, explicit domain contract | One pulse crosses unequal/reversed/disjoint section and GPIO boundaries without reset; wire addresses unchanged |
| U6: Lab layer editor and persistence | Sol medium UI + high for persistent references; PatternLabControls and recipe/handoff owner | U0; compositor contract | Add/reorder/mute/blend/opacity; Undo, save/reopen and full recipe round trips |
| U7: standalone flow/layer delivery | Sol high compiler/firmware; manager integration | U5/U6 canonical fixtures | Honest capability checks, complete bake or native parity, budgets, exact install/readback, restart evidence |
| U8: cross-screen composition integration | Sol App plus manager/Luna inventory | U1–U3, U5–U7 as supported | Generic artwork, Layout↔Patterns↔Lab target/selection continuity, one look in Playlist/Show, no new duplicate editor |

Run at most three workers concurrently. One author owns shared recipe/target
files at a time. Flow's descriptor is agreed before firmware and browser work
diverge. Layer UI can run alongside Flow preview; native delivery follows their
contracts. This extends delivery into Batch C (truthful Flow preview and Lab
authoring) and Batch D (standalone delivery and cross-screen acceptance).

Additional acceptance: separate artwork/physical/flow/layer/temporal order changes
must not mutate another order; flow must use a common clock/position and preserve
physical tuples; layer order is tested with non-commutative blends; disabled/zero-
opacity layers and section masks behave exactly; brightness/gamma is applied once;
recipes survive identity migrations; old firmware and missing media remain honest.
Actual card-render/restore/cold-start observations are distinct from pixel-oracle
tests. No completion claim for native Flow or layered playback before those paths
are implemented and tested. No signing, flash or deployment is authorized by
this design refinement alone.
