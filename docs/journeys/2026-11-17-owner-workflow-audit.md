# Lightweaver full-app workflow inventory

2026-11-17 · source baseline `a73e56e1` · primary manager

This is supporting evidence for [the ordered plan and scope](owner-workflow.md),
not a second execution plan. No product code or card contents changed.

## Coverage and limits

Source review covered Card/connection/installer/support, Layout/import/drawing/
wiring, Patterns/saved stacks, Lab, Playlist, Show/expression scenes, Mapper,
Projects/backups, customer Player, firmware local page and startup behavior.
The historical Pi visitor app is outside the active ESP32-only product.

Rendered local Studio screens were inspected at 1440×1000 and 390×844 with a
44-LED, two-circle project and no connected card. Desktop routes: Card, Layout,
Patterns, Lab, Playlist, Show, Mapper shell; phone: Card, Layout, Patterns,
Playlist, Show. Drawing mode and Projects were opened. This is representative
screen inspection, not every state, actual LED proof, or a production audit.
The first desktop Card capture was blank during loading; a later capture waited
for its primary control. An initial attempt to open Projects clicked the inert
breadcrumb; the icon button is the actual entrance. This is discoverability
friction, not a proven broken action. Embedded Mapper internals and expanded
support states were inspected in source, not fully walked.

Local screen evidence is in:
`/Users/adrianrasmussen/.codex/visualizations/2026/11/17/01a1e7c9-9a2a-76e0-bc65-f202513a921a/workflow-audit/`.
`screen-inventory.json` records route text and viewport metrics. Root-page width
matched viewport width in the sampled states; this does not prove that nested
panels never clip or scroll. Patterns measured 2385px page height at 390×844.
Other screens often use internally scrolling panels.

Customer Player was also inspected at both viewports using an isolated mock card
with three complete-look entries. A→B→C→A sent `combo-b`, `combo-c`, `combo-a`,
each with `syncZones:true`, and updated the active heading. See
`customer-switch-evidence.json`. The fixture checks commands/labels, not multi-zone
rendering. Its phone view places the look choices below the first viewport,
behind decorative artwork and tuning controls. The desktop screenshot was taken
after selecting A and retains the browser's scroll position; it is not a fresh
first-paint claim. No real network card was contacted. Online library unavailability
in the isolated preview is not evidence of a production outage.

## Purpose and disposition inventory

| Surface/control | Job it serves | Recommendation before implementation |
| --- | --- | --- |
| Card / installer | Identity, first flash, update and connection handoff | Keep; distinguish new-card setup from returning installation. Do not repeat completed setup. |
| Find strips / colour / count / power | Establish actual physical outputs and safe limits | Keep; show compact facts beside the selected output. Detailed tests belong in a focused setup view. |
| Import SVG / Draw / primitives | Three legitimate artwork starting points | Keep as clear Layout choices. Geometry is central to this user's workflow. |
| Artwork layers / strips / sections | Reference geometry, real LEDs and controllable portions | Preserve distinctions; connect them by highlighting, naming and a compact mapping summary. |
| LED dots / Light / Heat / glow direction | Emitter locations, appearance and coverage visualization | Keep; cluster as preview modes. Do not confuse them with pattern colour/speed tuning. |
| Wiring / GPIO / ranges / direction | Physical routing and multiple sections per output | Keep beside the selected path or in a focused connections view. Use connectors only where they clarify physical relationships. |
| Specs / build sheet | Fabrication, density, hardware and wiring reference | Keep as an ordinary focused destination; replace folding presentation without losing information. |
| Layout Import/Export | Project transfer, overlapping global project controls | Integrate project-file operations into Projects; keep SVG import beside artwork creation. |
| Mapper | Separate path authoring and legacy project/effect format | Preserve. Studio transfer is geometry-only; effects remain in Mapper. Explain this at transfer. |
| Pattern catalogue | Discover reusable effects | Keep; compact thumbnails, filtering and selected-target context. Do not let catalogue density displace the complete artwork preview. |
| Project stacks | Save all section appearances together | Make this the clearly named complete Look. Preserve underlying compatibility and IDs. |
| Lab | Custom patterns, layers, evolution, private drafts and recordings | Keep discoverable; entry from the selected effect and a clear return. Earlier hiding of Lab caused discoverability problems. |
| Lab compatibility / diagnostics | Explain native, streamed or recorded playback | Keep a concise verdict visible; details on a focused screen. Do not replace an execution warning with an ambiguous icon. |
| Playlist | Manual order, timed duration, fade and card capacity | Keep; prioritize complete looks and order. Technical chip-config export can move to Support. |
| Show modes / voices / scenes | Live audio composition and performance; reusable timed scenes | Preserve separate purposes. Ordinary look playback must not depend on sound completion. |
| Projects / draft / file / online saves | Different persistence destinations and portable assets | Keep destinations clear; consolidate entrances and expose exactly where work is saved. |
| Customer Player | Daily A/B/C switching, optional tuning and timed playback | Keep separate from making/setup. Put complete-look selection first and provide an obvious installation handoff. |
| Card-local player | Local fallback and control without public-site dependency | Keep; verify fresh offline use and reconnect. Do not substitute the deferred Pi visitor app. |
| Technician logs / JSON / recovery | Diagnose and recover installations | Preserve in Support; ordinary use should not compete with these controls. |
| Workshop / batch production | Manufacturing jobs, identity binding and pass records | Keep outside ordinary single-artwork setup. Preserve access for technicians. |

No function is currently recommended for outright deletion. Some duplicate
entrances and presentation can be consolidated after preserving their jobs.

## Observed screen friction

1. **Preview does not explain the whole piece consistently.** Patterns displays
   “On my piece” yet its inspected preview is a straight colour strip; Layout and
   Lab show the actual two-circle geometry. Recommendation: establish one reliable
   whole-artwork preview and show the selected section within it. Keep strip view
   as a purposeful alternate view, labeled as such.
2. **Phone priority is wrong for fast pattern work.** Setup/install actions,
   preview, section list and stack controls consume the first viewport; catalogue
   and tuning are further down. A narrower rail and clustered contextual actions
   may recover space without deleting capabilities. Verify with long names too.
3. **Phone Layout toolbar competes with the artwork.** Import/draw, zoom, file
   operations and Mapper wrap across rows. Consolidating global file operations
   and compact familiar zoom/fit icons can preserve the canvas. Essential SVG/Draw
   choices still need understandable labels.
4. **Terminology changes across surfaces.** Patterns & Looks, Project stacks,
   scenes, patterns and combos are not interchangeable. Distinguish reusable
   effect, complete look and timed composition before changing labels.
5. **Playlist mixes ordinary and technical actions.** “Copy chip config,” address,
   download and install sit beside daily authoring controls. Preserve these jobs,
   but move technical export/address repair to their proper context.
6. **Saving is hard to locate by sight.** A text breadcrumb says Projects but is
   inert; an icon opens Projects. Icons can reduce clutter, but this example shows
   why unfamiliar destination icons need a visible label or stronger grouping.
7. **State messaging occupies repeated space.** Connection is in the fixed footer
   and some screen content; phone footer also carries firmware/build facts and a
   preview modifier. Keep a clear connection state; consider secondary build and
   preview-calibration information in a focused status/preferences view.
8. **Disclosure structures conflict with owner preference.** Wiring details,
   Card Hardware/Advanced, Patterns advanced colour and Lab diagnostics include
   folding/expanding presentation. Preserve the work through focused views,
   compact visible controls or ordinary navigation; no replacement accordions.

## Missing journey steps and risks

- Import check: transformed/repeated vector shapes must appear correctly;
  distinguish artwork outlines from actual LED paths. Set scale/density and
  reconcile estimated counts with physical counts.
- Replacement check: SVG import resets strips, patching, counts and groups after
  parsing, with undo history. Explain replacement and recheck affected looks.
- Physical mapping: first LED, direction, cuts/jumps, section boundaries, symmetry
  sides and animation flow are distinct from GPIO and playlist order.
- Complete-look handoff: choose the customer-visible set, name A/B/C clearly,
  deliver a paired link, identify the installed version, and provide local access.
- Manual/timed behavior: selecting a look, pausing a playlist, dwell/fade and
  startup choice need explicit, consistent semantics.
- Startup coherence: firmware restores previous zone tuning/mirroring while
  retaining configured startup identity. Prove one coherent look after power-on;
  decide resume-last versus default before changing behavior.
- Customer adjustments: Player reads initial control values from the first zone.
  Define whether whole-look brightness/speed adjustments preserve section
  differences. Pending edits clear on selection/reconnect; make persistence clear.
- Portable recovery: a project file can embed verified recording media; legacy
  files can lack bytes and require re-recording. Library backup and card recovery
  must not be promised as equivalent without separate clean-restore checks.
- Preview truth: customer decorative thumbnails are index-generated art, not
  artwork previews. Label/replace appropriately rather than implying fidelity.

## Sound: separate development lane

| Path | Evidence | Boundary / remaining work |
| --- | --- | --- |
| Live Show | `lw-show.jsx` analyzes microphone/song/demo input and streams frames | Browser must remain active. Prove permission, silence, stop, connection loss and control handback. |
| Show composition | `showComposition.js` stores by project ID in separate localStorage | Not established as part of ordinary project backup. Integrate or explicitly expose portable save; don't imply project save covers it. |
| Expression scenes | Scene editor supports native-compatible installation or Flow recording | Timed composition is not live listening. Keep compatibility gates and source freshness checks. |
| Offline WAV lanes | Pattern Lab analysis and `lwseqBake.js` sample saved lanes | Fixed recorded motion, not response to new audio. Prove recording → media install → restart. |
| Card-native listening | `LightweaverRecipe.cpp` rejects audio recipe input as bake-only | Standalone live listening is unfinished/separate; requires input, firmware contract and hardware proof. |

Core visual layout, native looks, customer switching and non-audio recovery can
progress without this lane. If an item requires sound/recording support, explain
its execution needs at selection and installation, not after failed playback.

## Source anchors

- `lightweaver/src/v3/app.jsx`: navigation and Projects toolbar; `lw-card.jsx`:
  setup/support purpose; `components/card/ClientPlayerLink.jsx`: paired handoff.
- `components/layout/hooks/useLayoutImport.js`: SVG normalization and reset;
  `components/layout/modes/DrawModePanel.jsx`: path/count authoring;
  `lib/layoutFrameMapping.js`: physical preview mapping.
- `mapper/MapperScreen.jsx`: geometry-only transfer; `v3/lw-pattern.jsx`:
  section assignments, saved stacks and presentation.
- `lib/projectStacks.js`, `lib/cardRuntimeProject.js`: complete-look compilation.
- `client/ClientApp.jsx`, `client/clientModel.js`, `lib/cardCustomerControls.js`:
  selection, temporary edits, syncZones and first-zone controls.
- `firmware/lightweaver-controller/src/main.cpp`, startup restore around
  lines 3439–3515; `LightweaverWeb.cpp`: card-local player/bridge.
- `v3/lw-show.jsx`, `lib/showComposition.js`, `lib/projectTransfer.js`,
  `lib/libraryBackup.js`: sound/persistence boundaries.

## Evidence still required before calling the flow complete

Real multi-GPIO A/B/C switching; mixed independent/mirrored sides; complete tuning
recall; startup power-cycle; phone disconnect/reconnect; fresh offline access;
clean-browser backup restore; connected physical preview. Current screenshots
and mocks do not establish any of these physical outcomes.
