# Pattern Lab, Show, and card playback: one usable workflow

Research date: 2026-09-22. Source baseline: `ff000001`.
Manager: current task; job record: `LIGHTWEAVER_WORKBOARD.md`.
Scope: research and product recommendation, not implementation or release.

## Recommendation

Make a named scene the thing Adrian creates, rehearses, installs and revises.
Patterns is the shared collection, Lab edits the visual source, Show performs
with that source, Playlist arranges supported scenes, and Card holds verified
published versions. Preserve the distinct workspaces but stop making Adrian
manually translate their separate save and playback concepts.

Assumption pending user preference: prioritize an installation that starts by
itself when powered on. Live performance and timed music are separate delivery
requirements, not interchangeable meanings of "play".

## Owner direction: understandable through design

Adrian clarified that a first-time user must understand the product without
knowing its implementation. Ease comes from button hierarchy, titles, placement,
continuity and visible outcomes. Long explanations are not the solution.
This supersedes any interpretation that additional status prose or a guided
technical checklist would satisfy the integration goal.

Design the normal journey around the work the person recognizes:
choose a scene → change it → try it on the lights → keep it on the card.
These are connected actions, not four mandatory wizard pages. A returning user
can go straight to their scene. Do not require a manual Playlist detour just to
install one scene; handle required runtime membership behind the intended action.

- Keep the artwork and scene name in a stable place throughout editing,
  rehearsal and delivery. The editor should feel like the same object opened
  from the collection, not another application with another copy of the work.
- Establish one dominant next action per state. Use a labeled primary button
  for the main commitment; secondary actions remain visually subordinate.
  Try on lights is a reversible, clearly active control beside the preview;
  Put on card / Update on card is a separate deliberate commitment.
- Keep navigation, scene tools and hardware status in separate, consistent
  locations. A global card button must never appear to save the current Show
  when that operation cannot include it. Keep object-specific actions with the
  object rather than relying on a distant footer.
- Make the title area answer which artwork and scene are open, with one compact
  saved/changed indicator. Show installed status beside the install action.
  Do not stack diagnostic ribbons or technical compatibility categories into
  the normal creative screen.
- Group controls by what they change. Colors live beside the palette; movement
  and pace live together; section selection stays attached to the artwork.
  Reveal exact timing, layers and diagnostics only when relevant.
- Preserve selection, name, editing context and return destination on every
  transition. After keeping a scene, visibly select it in the collection.
  After installation, show the acknowledged scene and offer playback there.
  Errors remain at the attempted action and preserve all editing work.
- Show only truthful available actions. An unsupported standalone design needs
  a short inline reason and a useful alternative, not a successful-looking
  install button, a silent downgrade or a long explanation of render engines.
- Use text with icons for consequential actions, comfortable touch targets and
  distinct active/disabled/progress states. Color alone never conveys state.
  Keep action placement consistent on phone and desktop; avoid hidden footer
  dependencies or hover-only discovery.

Acceptance is behavioral: give a new person the task of choosing a scene,
changing its colors, trying it on lights, installing it, and reopening it later.
Do not narrate the interface. Record wrong turns, hesitation, accidental writes
and lost context. The design passes when the person can complete that path and
identify what is saved versus currently playing. Automated click tests and our
own screen review support this; they do not substitute for novice observation.

Next design deliverable: one connected, clickable first-use scene journey with
real content and empty/disconnected/changed/installing/failed states, followed
by the same journey on phone. Review the relationships and transitions before
expanding to Show and recorded delivery. This is a product design requirement;
no implementation or deployment is claimed by updating this brief.

## Owner expansion: expression over time and across the artwork

Adrian requires multi-step pattern and color expression, connected directly to
Layout and multi-strip structures, including one strip divided into three
sections and mandala arrangements. This extends the novice journey beyond a
single look's palette. These are proposed interaction requirements, not claims
about implemented runtime support.

Keep space and time legible together: the artwork shows WHERE; a compact visual
step sequence shows WHEN; the selected step's controls show WHAT. Selecting a
named section on the artwork or its matching row highlights the same target.
Users can select the whole piece, individual sections, or explicitly named groups
such as Inner ring and Petals without re-entering pixel ranges or output pins.
Use Layout's stable identities and current mapping; never create a second,
independent strip definition inside the creative editor.

Example A: one strip divided into three named sections. Select all three to run
one continuous traveling pattern, or give each a distinct behavior within the
same time step. Visually distinguish a pattern that travels across the selection
from one repeated independently in each section. Physical wiring and artistic
arrangement must not be conflated.

Example B: mandala. Select center/ring/petal groups from the actual layout. Build
a step with a quiet center and outward-moving petals, then a later step where
rings brighten and colors change. Offer whole-selection changes and local
overrides with clear selection feedback. Mirroring, repetition and phase offsets
must have an explicit supported meaning; do not infer radial structure merely
because multiple strips exist.

Each time step may contain simultaneous behaviors on different areas. Pattern
changes and color changes must be independently authorable; transitions can
change one while retaining the other. Use a simple step row first, expanding
area tracks only when the composition needs them. Reorder/duplicate steps and
preview transitions without losing artwork selection or scene identity.

Editing Layout later must preserve references when possible and visibly identify
missing/changed areas. Never silently retarget a lost section to the whole piece.
Offer a focused reassignment interaction and revalidate physical mapping,
sequence assets and installation readiness. A wiring edit is not a creative
parameter edit and continues to use the existing guarded install workflow.

Prototype acceptance: without technical explanation, create a three-section
piece with different simultaneous behaviors; switch to one pattern traveling
across all three; build a two-step mandala expression; return to Layout and back
without losing targeting. Then show whether the exact composition can be
installed on the selected card. Do not promise general per-area multi-step
native playback or native/recorded blending until the runtime contract supports
and verifies it. Preserve current ESP32-only architecture.

## What exists now

Supported native looks and bounded whole-piece Color Journeys have a project-to-
card path. Color Journeys are no longer universally browser-only; older notes
are stale. Lab's Add to Patterns is a project handoff, not card installation.
The native compiler checks physical wiring, geometry, recipe restrictions and
storage. Actual installation also depends on the connected card's capabilities.

Complex Lab designs can be rendered to LWSEQ, with an exported controller package
and a manual microSD delivery path. This is not a universal fallback: the current
baker rejects source geometry over 1,024 pixels, although native journey tests
cover 4,096. See `lightweaver/src/lib/lwseqBake.js:325`,
`patternLabWorkerProtocol.js:19`, and the native browser evidence below.

Show currently runs a browser music/performance engine. Its Voices compositions
are stored separately by project ID in browser storage; tuning defaults have
another storage key. Show does not automatically become a standalone card scene.
See `lightweaver/src/v3/lw-show.jsx:407` and
`lightweaver/src/lib/showComposition.js:24`. The separation protects live control:
knob movements must not continuously change the installed project fingerprint.
That constraint must survive any integration work.

The actual Show screen says "Everything saves itself" while the global footer
can say "Save to card". Those refer to different data. Lab can show "Standalone
ready" when disconnected. These are tangible delivery ambiguities, even when
the underlying guards correctly prevent an unsupported install.

An additional source-level fidelity gap needs first-milestone attention: Lab
applies its Movement macro to preview geometry, while ordinary native look
conversion carries color/brightness/speed but not that motion transform. This is
a concrete missing conversion path, not measured physical divergence in this
session. Either preserve the authored behavior in the target runtime or classify
that variation as requiring recording/Studio. See `patternLabLookColor.js:6`,
`patternLabPatternAdapter.js:208` and the detailed Lab audit.

Detailed source audits: [Lab](2026-09-22-pattern-lab-research.md) and
[Show/card](2026-09-22-show-card-research.md).

## Adrian's concrete journey

Example: prepare a six-minute amber/violet scene for an artwork, then adjust it
at the installation the next day.

1. Open the artwork. Its mapped LEDs, sections, physical order and installed
   card identity should already be established. Wiring setup is an installation
   prerequisite, not a repeated creative task.
2. Choose a starting scene and open Lab. See it on the actual artwork. Choose
   colors, pace and character; expose detailed pattern controls on demand.
3. Preview on lights explicitly. Clearly display whether the card is rendering
   the scene itself or Studio is streaming frames. A live preview does not
   prove the scene has been permanently installed.
4. Keep the named scene. Preserve its editable recipe and stable identity.
   Show "Saved in this project" and its current delivery capability.
5. For an ambient installation, add supported scenes to Playlist, set timing
   and choose intended startup behavior. For a live performance, open the same
   source in Show and add music response. Shared source use is proposed work;
   it is not available for arbitrary Lab recipes in today's Show.
6. Choose Install on card. Review exact scene revisions, target card, playback
   method, capacity and any changes from the current installation. Transfer and
   read back the expected version. Baked delivery must verify the actual file,
   not merely that a config contains its filename.
7. Run from the card with Studio closed. Power cycle and observe the lights.
   That is the acceptance test for standalone use; a browser preview is not.
8. Reopen the same scene tomorrow. Edit, compare and Undo. Update the existing
   scene or explicitly Save as new. Show "Changes not on card" until the new
   version is installed. A failed update retains the previous working version.

## How loading works today

- Native supported Lab design: Add to Patterns, star the saved look into Playlist,
  then the existing shared card
  installation/update flow. A saved browser draft alone never reaches the card.
  Native Color Journeys require compatible firmware and a recipe/layout that
  passes the compiler. No general firmware reflash is needed for ordinary look
  edits on a compatible card.
- Baked supported Lab design: bake the exact recipe, complete the project/package
  handoff, unpack the package directly onto the mounted microSD with the existing
  `npm run standalone:unpack -- <package.json> <mounted-SD-directory>` command.
  It writes `/lightweaver.json` and verified content-addressed sequence files. Keep the generated
  metadata/sidecars together. Validate the exact-card config and physical wiring;
  then verify card selection and playback. There is no seamless universal
  browser-to-SD asset upload in this researched workflow. The generated package
  contains one sequence, not a combined native/recorded playlist; a valid SD
  project takes precedence over internal flash at boot. Inserting it is a
  project selection, not simply adding another file to the existing playlist.
- Show: select connected artwork, sound source, Modes or Voices, adjust the
  response, and explicitly Play on the lights. The browser supplies the engine
  and audio. Saving mode defaults or the ordinary project does not install this
  Show engine for autonomous music response.

## Adjustments should have clear consequences

| Adjustment | Meaning | Proposed commit behavior |
| --- | --- | --- |
| Master brightness, stop, selected installed scene | Operate the installation now | Immediate acknowledged control; persistence explicitly stated |
| Palette, pace, character, layers, section assignment | Change authored scene | Rehearse draft; Save scene; Update card |
| Music sensitivity, band assignment, response depth | Change Show performance | Save named performance; live host still required |
| Pixel count, pins, direction, color order, current limit | Change installation | Existing guarded physical setup and verification |

For baked RGB frames, the design's palette, layers and motion have already been
rendered. Editing those requires the source and a fresh bake. Expose only runtime
controls actually supported by that player. Do not show a palette slider that
cannot change the installed sequence. Separate live brightness from baked
brightness, preview compensation, calibration and electrical limits.

## Build order and exit criteria

1. **Complete the native scene lifecycle first.** Unify scene name, source link,
   save state and exact installed revision across Lab, Patterns and Card. Resolve
   preview-to-native parameter fidelity before claiming a scene is ready. Keep
   existing roundtrip functionality; fill the delivery/status gaps rather than
   rebuild it. Acceptance: create → install → close browser → power cycle →
   reopen → edit → update, with stable playlist identity and failure recovery.
2. **Make Show work portable and recoverable.** Add named save/reopen/export
   for complete performances and explicit "requires Studio" status. Integrate
   it into project backup without letting continuous live knob changes invalidate
   card authority. Separate editable design revision from published runtime
   identity; adapt existing storage instead of moving volatile data blindly.
3. **Connect shared scene sources to Show deliberately.** Define the supported
   renderer/parameter contract, artwork-area references and audio modulation.
   Start with one representative native-compatible scene. Reject unsupported
   combinations visibly; don't pretend Show and Lab already use one renderer.
4. **Finish recorded delivery for the actual installation size.** Resolve the
   1,024-source-pixel bake limit, bounded-memory rendering, asset transfer,
   verification, replacement and selection at 4,096 pixels before promising it.
   A ten-minute RGB recording at 24fps and 4,096 pixels is about 177 MB before
   packaging (4096 × 3 × 24 × 600). Merely raising the limit is inadequate.
   Test sustained SD playback, interruption and file recovery on hardware.
5. **Add richer arrangement only on proven delivery paths.** Validate native/
   recorded transitions and explicit startup selection before treating arbitrary
   scenes as interchangeable playlist entries. Live microphone response and
   fixed-song recording require different runtime contracts. Lighting-only
   recordings do not imply audio playback or synchronization after restart.

The first milestone is one finished physical scene lifecycle, not more effects
or an expanded timeline. UI integration comes first; broader firmware/asset
architecture needs a concrete separately approved implementation scope.

## External research applied narrowly

WLED presets demonstrate a useful distinction between saved scene settings and
optional master brightness/segment bounds. Adopt that explicitness rather than
making every scene selection rewrite installation settings.
Source: https://kno.wled.ge/features/presets/

xLights separates editable sequence source from player files and provides an
explicit target-aware upload step. Its glossary states rendered FSEQ is not an
editable source. Apply the source-plus-delivery distinction to recipes/LWSEQ;
this is not a recommendation to introduce FPP or a Raspberry Pi.
Sources:
https://manual.xlights.org/xlights/chapters/chapter-five-menus/tools/fpp-connect
https://manual.xlights.org/xlights/appendicies/glossary

## Evidence and limits

- Fresh focused Node run: 50/50 passed across Color Journey native compilation,
  card runtime packaging, Lab handoff, and Show composition tests.
- Fresh Chromium run: 12/12 passed across `color-journey-standalone.spec.ts`
  and `pattern-lab-look-roundtrip.spec.ts`. Includes 4,096-pixel fixtures,
  capability/readback simulation, save/reload and linked editable looks.
- Inspected actual Show Modes/Voices screen in local browser; inspected rendered
  Lab desktop fixture screenshot. No audio capture or Play on lights activated.
- Source findings do not prove the deployed website or physical firmware matches
  this checkout. No hardware playback, power-cycle, SD throughput or physical
  color acceptance was performed. No product code changed and no deployment.
