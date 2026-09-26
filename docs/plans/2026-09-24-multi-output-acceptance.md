# Multi-output pattern acceptance matrix (2026-09-24)

Scope: acceptance criteria for assigning different patterns to multiple GPIO outputs on one Lightweaver card. The user-facing flow must let an owner load/select a pattern per output, retain the assignment, and install it for standalone card playback. This is a product acceptance note, not a design for a single card configuration session.

Current guidance reviewed: [Pattern Lab user guide](../pattern-lab-user-guide.md) describes Layout, named targets, scene assignment, save/rehearse/install, and explicitly notes that some shared moving-pattern cases are preview-only. Existing scene authoring is described per target/area; the guide does not yet present the direct task “choose a pattern for each physical GPIO output.” Physical output routing remains Layout’s concern.

The matrix below records the initial audit, before this Sprint's corrections.
The implementation found two concrete failures: compiled wiring uses zone IDs
that differ from editable patch IDs, dropping per-section settings; and a plain
startup look replaces each zone's pattern at boot. The correction uses the
existing section identity mapping for live section settings and saved combined
looks, and creates a combined startup look when required to preserve authored
section settings. Enabled autoplay retains its explicit playlist behavior.
The user guide now includes the direct Patterns workflow, and the UI shows each
section's GPIO assignment with instructions. Final integrated evidence is in
`LIGHTWEAVER_WORKBOARD.md`; hardware playback is not an automated pass.

The September 25 continuation adds a browser journey for two GPIOs: select the
same pattern for all sections, change one section, Keep, reload, change it again,
and inspect the installed output lengths, zone patterns, and combined startup.
That journey passes at 390px. Design target now precedes the bank in DOM order;
phone controls are reachable and pattern names remain readable. A separate
browser case verifies that a section spanning GPIOs explains its shared scope
and opens the corresponding strip in Layout. These checks supplement the
historical gaps below; they do not prove physical output or offline restart.

Bench Discovery now provisions a zone per GPIO, offers temporary same/per-GPIO
patterns after counting, and retains kept choices in measured project patches.
Its final package includes measured strips, patches, and wiring. Verification
compares card identity, ordered outputs, zone ranges/patterns, startup look, and
known-good wiring. The combined five-case browser run passes, including a real
two-GPIO counting/selection/Keep path and a readback failure that refuses Keep.
The production build passes. The complete unit run passes 2709/2715; its six
remaining Windows baseline failures predate these changes.

| Case | Acceptance behavior | Existing evidence | Gap / acceptance still needed |
|---|---|---|---|
| Two outputs | Create two GPIO outputs on one card, with separate visible names and a selected pattern for each. | `wiringCompiler.test.js`: “compiler supports four outputs and split ranges with unique global offsets”; `gpioAssignments.test.js`: “split physical runs can route to three separate GPIO outputs”. | No end-to-end user flow proves choosing two independent output patterns and seeing them on the intended output. |
| Three outputs | Repeat with three outputs; each retains its own assignment while editing the others. | Same compiler and GPIO planner tests above. | No three-output pattern-assignment regression. |
| Different lengths | Use, for example, 24, 60, and 37 pixels. Each assignment renders/compiles for its own output length; no padding, truncation, or cross-output offset leak. | `wiringCompiler.test.js`: “compiler supports four outputs and split ranges with unique global offsets”; `cardStoragePayload.test.js`: size/compaction bounds. | Compiler routing evidence does not prove distinct effects adapt to each physical output’s length in the installed runtime. Add mixed-length fixture and readback assertion. |
| Output routing | Pattern A, B, C arrive at the intended GPIO in the wiring order. Reordering/changing a route must update the target mapping and invalidate stale install evidence. | `wiringModel.test.js`: route/verification validation and “per-run verification survives normalize, JSON save/load, and history-style cloning”; `wiringCompiler.test.js`: physical direction and output identity. | Need an integrated mapping assertion from output assignment through serialized card package and runtime output routing. |
| Independent effects | Assign visibly distinct effects to each output, change one, and prove the others retain their pattern and parameters. Provide a clear output selector or output rows with per-output “Load pattern” action. | `sceneExpression.test.js`: “assignments inherit independent leaf fields…”; `sceneExpressionTargets.test.js`: “catalog exposes divided-strip and mandala group targets…”; `expression-scene-install.spec.ts`: exact native scene install coverage. | Scene target/leaf assignment is adjacent capability, but no acceptance test ties each *physical output* to independently selected and persisted pattern state. The UI guide needs this direct workflow. |
| Save and reload | Save the project, reload Studio, and recover all output identities, lengths, routes, selected pattern IDs, and per-output parameters. A changed draft must not be shown as installed. | `wiringModel.test.js`: JSON save/load; `cardProjectSave.test.js`: deliberate card save; `expression-scene-install.spec.ts`: “editing during install retains the newer draft…” and “a later project edit… invalidates current On card”. | Add multi-output fixture to project save/reload and assert assignments survive along with wiring. |
| Standalone install | “Put on card” installs all output assignments as one coherent configuration, then confirms exact readback. Partial failure is reported as saved/not installed or install failed; do not claim the card is current after POST alone. | `sceneExpressionDelivery.test.js`: exact source/runtime readback and saved-not-installed cases; `expression-scene-install.spec.ts`: “installs exact scene source and runtime only after verified readbacks”. | Existing evidence is scene-centric. Add a multi-output package integration case and make install summary enumerate outputs/patterns. |
| Global actions | Define each global action explicitly. Global **Stop/Pause/Resume** may affect all outputs only when labeled as global; a per-output action changes only its selected output. Global save/install includes every configured output. | `cardPlaylist.test.js`: playlist verbs/config; `cardLiveControl.test.js`: playlist control transport; `sceneExpressionDelivery.test.js`: project-wide install workflow. | No multi-output contract says what global playback actions do when outputs have independent patterns. Specify and test all-output versus selected-output semantics. |
| Offline playback boundary | Once installed, the card can play every assigned output from its local runtime without Studio, internet, or an active browser bridge. Studio is needed to edit/load/install; physical playback proof requires card/hardware observation. | `cardRuntimeProject.colorJourney.test.js`: saved authored journey compiles and survives compact serialization; `cardPlaylist.test.js`: standalone playlist configuration. | These are serialization/logic tests, not proof that each GPIO independently plays offline. Add runtime contract coverage; record real card observation separately. |
| Actionable errors | Missing/unsupported pattern, unavailable output, invalid route, length/capacity overflow, stale source, card offline, and runtime refusal each name the affected output and offer a next action. Preserve card-originated reasons; never silently skip an output or report success without confirmation. | `wiringCompiler.test.js`: structured missing-strip errors and mapping readiness; `cardAction.test.js`: bounded card-action failure classification; `benchInstall.test.js`: bounded offline/error copy and card refusal; `cardStoragePayload.test.js`: exact capacity errors. | Existing error tests are component-level and mostly singular-output. Add multi-output failure cases proving which output failed and that other outputs’ state is not falsely reported as installed. |

Suggested focused regression fixture: outputs “Left” (GPIO 16, 24 LEDs), “Center” (GPIO 17, 60 LEDs), and “Right” (GPIO 18, 37 LEDs), with three distinct supported patterns. Change only Center’s pattern, save/reload, install, and verify all three identities, lengths, pattern IDs, parameters, and route targets. Then remove Studio/network and verify standalone playback per output on hardware. The hardware portion is an observation gate; automated serialization or browser tests cannot mark it passed.

The initial audit found useful foundations without an integrated GPIO workflow.
The subsequent browser and package tests now cover that software path. Physical
GPIO rendering, offline restart, and unassisted novice use remain observation
gates; no real card was written or flashed during this Sprint.
