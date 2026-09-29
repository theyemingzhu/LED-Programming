# Mirror strips: concept and build plan

One survey fact changes the premise, so it goes first. The card already plays a multi-range zone as a mirror: `renderZone` (main.cpp:1732) calls `renderZoneSlice` once per range, with `zoneLeds = leds + range.start` and `count = range.count`, on one shared zone clock. Every range restarts the pattern at index 0. So "several strips, one zone" is a same-direction mirror on every card in the field today, and the Patterns screen already shows one chip for such a zone. The feature is mostly plumbing that mechanism to an explicit owner choice. No firmware change ships in v1.

## 1. Decision

A **mirror set** is a named group of two to six strips that play as one. You pick it in Layout: select a strip, choose Mirror with, tick the strips that should match it. From then on the set is one section on the Patterns screen, one zone on the card, and every member shows the same pattern at the same moment. Each member plays from its own LED 1, so left and right wings drawn from the centre outward are mirror images; two strips drawn the same way run the same way. Unequal counts stretch to fit. Strips stay wired exactly as they are; pins never matter. Stored once at piece level as `layout.mirrorSets`, the foundation the queued Symmetry mode will later write into.

## 2. What the owner does

Everything happens in the Layout inspector (`DrawModePanel.jsx`), under the selected strip's More actions menu, next to Duplicate strip. Nothing is added above the strip list and no second primary appears.

**Make a 2-way mirror (three clicks).** Select the left wing. More actions, then **Mirror with…**. The menu closes and a short checklist replaces it inside the selected strip's editor, one row per other strip: name, LED count, a checkbox. Tick "Right wing". A **Done** button closes the checklist. The selected strip's row now carries the line **Mirrors: Right wing**, and the right wing's row carries **Mirrors: Left wing**. That line is a button; pressing it reopens the checklist.

**4-way.** Same checklist, tick three strips. The set is named after its members ("Left wing and 3 more") and can be renamed from the checklist header, which is an editable name field like the strip name.

**Direction.** The checklist carries one sentence: "Each strip plays from its own LED 1. Use Flip path on a strip to run it the other way." No flip control is added; path direction already owns this and Reverse data already owns which end the wire enters.

**Unequal counts.** Allowed. When counts differ the checklist shows "41 and 38 LEDs. The pattern stretches to fit each strip." Nothing else changes.

**Patterns screen.** The set appears as one section chip labelled with the set name and its combined LED count. The help line under a selected mirrored section reads: "These 2 strips mirror each other. Open in Layout to change which strips mirror." with the existing Open this strip in Layout link. Looks, playlists and the card page all address the set as one zone.

**Undo.** Untick a strip in the checklist, or press **Stop mirroring** at the checklist foot to dissolve the set. Both go through layout history, so Undo reverses them. Removing a strip drops it from its set; a set left with one member dissolves silently.

**Blocked cases** show as disabled rows with a title: a strip with Reflection points ("Remove its reflection points first"), a strip in a layer group ("Ungroup it first"), and any strip once the set would need more than six card ranges.

## 3. Data model

Persisted at piece level in `layout.mirrorSets` (new key on ProjectContext state, added to `serializeProject` at ProjectContext.jsx:902, spread through by `migrateProject`). Project version stays 3: absent means no sets.

```json
"mirrorSets": [
  { "id": "mirror-1", "name": "Four arms",
    "members": ["strip-3", "strip-5", "strip-7", "strip-9"] }
]
```

The first member is the lead: the Studio preview renders it and copies to the rest. Order is display order only; the card treats all members alike.

Rules, enforced by `validateMirrorSets(mirrorSets, strips, wiring, layerGroups)` in the new `lib/mirrorSets.js` (errors carry a code and a plain message, same shape as `validateWiring`):

- `mirror-set-size`: two to six members.
- `mirror-member-missing`: every member is an existing strip id.
- `mirror-member-twice`: a strip belongs to at most one set.
- `mirror-member-grouped`: a member may not also be in `layerGroups` (both would claim the zone identity).
- `mirror-member-kaleidoscope`: a member may not have `kaleidoscope.enabled` (v1 restriction; the lookup is zone-indexed and untested across a shared zone).
- `mirror-set-ranges`: the members' wiring runs together may not exceed `maxRangesPerZone` (6), the cap `normalizeCardRuntimeConfig` already throws on.

`normalizeMirrorSets` drops invalid entries on load rather than failing the project. `migrateStripIdNamespace` (projectModel.js:221) gains one line remapping `mirrorSets[].members` alongside patchBoard, wiring, layerGroups and sectionFamilies. Deleting a strip and Split into separate strips remove the id from its set; Duplicate strip never copies membership.

## 4. Studio preview

`renderPixelFrame` (frameEngine.js:166) gains one option, `mirrorSets = []`, and one call before `return`: `applyMirrorSets({ framePixels, stripFrames, strips: visibleStrips, mirrorSets })` from the new `lib/mirrorFrame.js`. Each member is still rendered normally in the main loop (cheap, and it keeps `globalIdx` and `pixelCount` untouched); the pass then overwrites every non-lead member in place. Copying colours, not re-evaluating, is the only correct approach because `evalPixel` receives `nx, ny` and a global index, so a re-evaluation on the twin's coordinates would not match.

Mapping: for twin pixel `i` of `n` and lead length `m`, the source is `round(i * (m - 1) / (n - 1))` (identity when counts match, stretch when they differ). Each `stripFrames` entry keeps its `id` and gets its `leds[]` colours and `avgR/avgG/avgB` recomputed; `framePixels` is overwritten at the twin's global offset, which the pass derives by summing `pts.length` in visible-strip order. Direction needs no flag: a member's LED 1 is wherever its path starts, exactly as the card sees it. Callers that pass `strips` from the project (`PatternPreview.jsx`, `patternLabPatternAdapter.js`, sequence baking) pass `layout.mirrorSets`; the Geometry fold (`symSettings`) and Kaleidoscope continue to apply to the lead before the copy.

## 5. Card runtime

**Decision: (b), compile to one multi-range zone. No firmware change, no capability flag, no VERSION bump.** Rejected (a), the copy step at `copyCanvasToPhysicalOutputs`, on these facts:

- The zone mechanism already renders each range as an identical, clock-shared slice (renderZone → renderZoneSlice, verified above). A copy step would re-implement what the card does.
- (a) would silently overwrite Art-Net, WLED and HTTP-stream pixels on the twins; those sources own every pixel and a Madrix user maps their own symmetry. With (b) external frames are untouched, which keeps the contract honest.
- (a) needs a new config key, a `capabilities` flag, a Studio gate in `cardPushClient.js`, and a signed release; (b) needs none. Every card that accepts `zones[].ranges` (the strict validator at LightweaverStorage.cpp:1130 already permits up to `LW_MAX_RANGES_PER_ZONE`) plays a mirror set today, so there is no older-firmware case to gate.
- Config bytes shrink. A zone costs roughly 150 bytes (id, label, patternId, brightness, speed, hue fields); an extra range costs about 24. A 4-way set replaces four zones with one zone of four ranges, saving around 380 bytes of the 3968 budget. `classifyCardChanges` (cardDeployment.js:144) sees a zone change, so mirroring is a visual change and never asks for a physical re-test.

Config shape: unchanged. `compileWiring` (wiringCompiler.js:66) takes a new `mirrorSets` argument and folds it into `zoneByStripId` exactly as `groups` are folded, so the set's zone is `{ id: "mirror-1", label: "Four arms", ranges: [{start,count} x4] }`. Production callers that compile without `groups` today (`cardRuntimeProject.js:48`, `sectionLookModel.js:24`, `patternPiecePreview.js:54`, `sceneExpressionDelivery.js:101`, `sceneExpressionPreviewTopology.js:70`, `export.js:108`) all pass `mirrorSets`; `ProjectContext.jsx:496` passes both. Note for the manager: today `groups` reach the card only through ProjectContext's compiled wiring, so this package also closes that gap for mirror sets.

Frame behaviour by source: native patterns render per range from index 0 on one clock (mirror, stretch on unequal counts). Studio live frames and baked sequences arrive already mirrored by section 4 and copy 1:1 through the `canvasIsPhysical` path. Art-Net and WLED pass through untouched. Each strip is still in wiring once, so the duplicate-source checks in `sceneExpressionFrame.js:112`, `sceneExpressionNative.js:181` and `sceneExpressionTargets.js:252` are unaffected.

Release path: `firmwareBundleOnly`. The Studio bundle embedded in the card is the only firmware-lane touch, so the site deploys in about ten minutes and nothing goes in `firmware-queue`. A per-range `reversed` flag in firmware (72 bytes on RuntimeConfig) stays a v2 option only if owners find Flip path insufficient.

## 6. Build plan

Shared contract, coded against by every package without talking:

```
lib/mirrorSets.js (WP1 owns)
  normalizeMirrorSets(sets) -> [{id,name,members}]
  validateMirrorSets(sets, strips, wiring, layerGroups) -> {ok, errors:[{code,message,setId?,stripId?}]}
  mirrorSetForStrip(sets, stripId) -> set | null
  addMirrorMembers(sets, leadId, memberIds) -> sets   // creates or extends the lead's set
  removeMirrorMember(sets, stripId) -> sets           // dissolves sets left with one member
  renameMirrorSet(sets, setId, name) -> sets
  remapMirrorSetStripIds(sets, oldToNew:Map) -> sets
  defaultMirrorSetName(set, strips) -> string         // "Left wing and 3 more"
layoutReducer action: { type: 'SET_MIRROR_SETS', mirrorSets }   // whole normalized array
ProjectContext exposes: layoutMirrorSets, setLayoutMirrorSets(value)
compileWiring({ wiring, strips, groups, mirrorSets }) -> zones use set id and name
renderPixelFrame({ ..., mirrorSets })
Copy: "Mirror with…", "Done", "Stop mirroring", "Mirrors: {names}",
      "Each strip plays from its own LED 1. Use Flip path on a strip to run it the other way."
```

**WP1 Model and compile. Sonnet, moderate. First; WP2 and WP4 start in parallel with it, WP3 after it.**
Files: `lib/mirrorSets.js` (new) + `lib/mirrorSets.test.js`, `lib/projectModel.js`, `lib/wiringCompiler.js`, `state/layoutReducer.js`, `state/ProjectContext.jsx`, `lib/cardRuntimeProject.js`, `lib/sectionLookModel.js`, `lib/patternPiecePreview.js`, `lib/sceneExpressionDelivery.js`, `scene-expression/sceneExpressionPreviewTopology.js`, `lib/export.js`, `tests/section-targets.mjs`, `tests/card-section-sync.mjs`.
Tests to add: every validation code above turns red on its input; a 4-way set compiles to one zone with four ranges and `deriveSectionTargets` yields one section carrying the lead's patch id; a 2-way set's runtime config is smaller than the unmirrored one; strip-id remap survives `migrateStripIdNamespace`; serialize then migrate round-trips `mirrorSets`. Run: `npm run test:unit` and `npm run ci:pr-lane-node-specs`.

**WP2 Studio preview. Sonnet, quick. Parallel with WP1.**
Files: `lib/mirrorFrame.js` (new) + `lib/mirrorFrame.test.js`, `lib/frameEngine.js`, `v3/PatternPreview.jsx`, `lib/patternLabPatternAdapter.js`.
Tests: with a set of two equal strips, twin `leds` equal lead `leds` byte for byte for any pattern id; 41 to 38 stretch maps ends to ends; a set with the lead hidden leaves twins rendering themselves; `kaleidoscopeParity.test.js` still green. Run: `npm run test:unit`.

**WP3 Layout inspector. Opus, moderate. After WP1 lands.**
Files: `components/layout/modes/DrawModePanel.jsx`, `components/layout/hooks/useLayoutStrips.js`, `components/layout/divide-strip.css` (or the panel's own stylesheet), `tests/layout-mirror.spec.ts` (new).
Judgment: the checklist must read as a bounded detail inside the selected editor per `.impeccable/surfaces/layout-inspector.md`, phone width 390 included, text labels only, no glyph, no second primary. Tests: three-click 2-way; 4-way with rename; Undo restores; deleting a member shrinks the set; disabled rows carry their titles; canvas labels unchanged. Screenshot at 300px and 390px inspector widths. Run: add the spec to `ci:browser-smoke` in `package.json` (WP3 owns that one line).

**WP4 Patterns screen and the name collision. Sonnet, quick. Parallel with WP1.**
Files: `v3/lw-pattern.jsx`, `v3/lw-shared.jsx`, `tests/patterns-v3.spec.ts` (line 2437), `tests/patterns-section-row.spec.ts`.
Work: the help line for a mirrored section (keyed by zone id prefix `mirror-`, no new prop needed); rename the Geometry chip label `Mirror` to `Fold` (id `mirror` and saved `symSettings` unchanged) so "Mirror" means one thing in the product. Tests: the help line appears for a mirrored section and the GPIO-spanning copy does not; the chip renames without changing behaviour. Run: `npm run ci:browser-smoke`.

**WP5 Docs. Sonnet, quick. Last.**
Files: `docs/music-reactive-build-plan.md` (one paragraph under the queued Symmetry mode: it writes `layout.mirrorSets`), `TODO.md` (v2 items: per-range reverse in firmware; Kaleidoscope on a member), `THINKING.md` entry recording the choice of zones over a copy step.

Order: WP1, WP2, WP4 in parallel; WP3 when WP1 is merged; WP5 after WP3. Before dispatch, re-measure that `renderZoneSlice` still restarts per range on current main.

## 7. Risks and what Adrian must overrule

- **The word.** Default: "Mirror" goes to the strip feature and the Geometry chip becomes "Fold". Overrule if the chip name matters more; then the strip feature ships as "Play together" and nothing else changes.
- **No flip control.** Default: direction comes from Flip path. If owners expect a switch on the set, v2 adds `reversed` on `PixelRange` in firmware (72 bytes, capability flag, VERSION bump).
- **Firmware coordinate patterns.** Colour-journey recipes read `globalStart` (LightweaverPatterns.cpp:286), so a twin can shift phase by its offset. Accepted for v1; measure on the bench card before calling the feature shipped.
- **Kaleidoscope members excluded.** Default: excluded until tested on hardware.

## Manager notes (verified 2026-09-29, before dispatch)

- Verified by reading firmware `renderZone` (main.cpp:1732-1812): each range of a zone calls `renderZoneSlice` with `leds + range.start`, from index 0, on one `advanceZoneAnimationClock` per zone. The multi-range-zone mirror is real.
- `coalesceZoneRanges` / `canCoalesceZoneRanges` (wiringCompiler.js:53) only merge ranges of the SAME strip id, so two mirrored strips never fuse into one range.
- Added rule for WP1: `mirror-member-split` — every member must compile to exactly one continuous range (a member split across runs/outputs would restart its pattern mid-strip). Disabled-row copy: "Join this strip's wiring into one run first".
- Owner clarification: pins never appear in the mirror UI; mirroring is by strip.
- Each builder works in its own git worktree (one writer per worktree); the manager merges branches into `claude/mirror-strips-symmetry-0ece56`.
