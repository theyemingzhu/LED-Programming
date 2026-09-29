# Symmetry sides (replaces mirror sets v1)

Owner-approved 2026-09-29. Mockup: https://claude.ai/artifact/W6QmSyG176STPH8Gt1Seta (boards A, C, and the two Patterns boards; B contributes only the tap-a-strip gesture).

## What the owner does

1. **Layout, once.** At the top of the existing strip list in the Layout inspector: `Symmetry: None · 2 sides · 4 sides`. Choosing 2 or 4 places every strip into a side using the artwork's geometry (Studio's best guess). Each side is a group in the sidebar; strips drag between sides and up/down within a side. **Order within a side is the order the pattern flows through it.** A strip in no side is **On its own** and always plays its own pattern. The artwork shows each side's tint and a flow number (1, 2, 3) on every strip; tapping a strip on the artwork selects it in the sidebar. For 4 sides: `Each side runs: The same way round · As a mirror image`.
2. **Offer.** When the artwork looks symmetrical and the piece has no symmetry yet, the Layout canvas shows one card: "This piece has two matching sides." `Mirror the two sides` (primary) / `Choose sides myself` / `Keep as drawn`. Dismissal is remembered per project.
3. **Patterns, per look.** Above the existing section list: `In this look, the sides: Mirror each other · Play their own`. Mirror: one section "Both sides, mirrored" plus On-its-own strips. Own: one section per side (flowing through its strips) plus On-its-own strips. The choice is saved with each look, so a playlist can alternate.

Copy rules: text only, no icons, no em-dashes, "side", "on its own", "mirror each other", "play their own".

## Shared contract (every package codes against exactly this)

### Project data
```js
layout.symmetry = null | {
  fold: 2 | 4,
  orientation: 'mirror' | 'same',        // 2 sides default 'mirror', 4 sides default 'same'
  sides: [{ id: 'side-1', label: 'Left side', stripIds: ['strip-3', 'strip-4'] }, ...]  // exactly `fold` sides, ordered
}
// strips in no side are "on their own"
pattern.sidesMirrored: boolean            // live choice for the look being edited; default true when symmetry is set
devices.standaloneController.looks[].sidesMirrored: boolean   // saved per look
layout.symmetryOfferDismissed: boolean
```
Side labels: 2 sides split left/right -> "Left side"/"Right side"; split top/bottom -> "Top side"/"Bottom side"; 4 sides -> "Side 1".."Side 4". Owner may rename (later).
Flip rule: side index i (0-based) plays flipped when `orientation === 'mirror' && i % 2 === 1`.

### `lightweaver/src/lib/pieceSymmetry.js` (WP-B owns; do NOT confuse with the existing `lib/symmetry.js`, the Fold geometry)
```
normalizeSymmetry(value, strips?) -> symmetry | null
validateSymmetry(sym, strips, wiring) -> { ok, errors: [{ code, message, sideId?, stripId? }] }
  codes: symmetry-fold, symmetry-side-count, symmetry-strip-missing, symmetry-strip-twice,
         symmetry-strip-kaleidoscope, symmetry-strip-split, symmetry-side-empty
sideOfStrip(sym, stripId) -> sideId | null
setSymmetryFold(sym, fold, strips, suggestion?) -> sym | null   // fold 0 = None -> null
moveStripToSide(sym, stripId, sideId | null, index?) -> sym      // null = on its own
reorderSide(sym, sideId, stripIds) -> sym
sideFlipped(sym, sideIndex) -> boolean
migrateMirrorSetsToSymmetry(mirrorSets, strips) -> sym | null    // v1 data: one set of 2 or 4 members -> that fold, one strip per side; anything else -> null
remapSymmetryStripIds(sym, oldToNew: Map) -> sym
```
ProjectContext exposes `layoutSymmetry`, `setLayoutSymmetry(value)` (normalizes, records NO history: call `pushLayoutHistory()` first), `sidesMirrored`, `setSidesMirrored(bool)`. Reducer action `LayoutActions.SET_SYMMETRY`.

### Compile
`compileWiring({ wiring, strips, groups, symmetry })`: each side becomes ONE zone `{ id: side.id, label: side.label, ranges: [one per strip, in stripIds order], continuous: true }`. On-its-own strips compile exactly as today. `mirrorSets` is no longer read (v1 data is migrated on load).

`deriveSectionTargets(..., { symmetry, sidesMirrored })`: mirrored -> one target `{ id: 'side-1', zoneId: 'side-1', kind: 'section', label: 'Both sides, mirrored', mirroredSides: ['side-2', ...] }` + on-its-own targets; own -> one target per side (label = side label) + on-its-own targets.

### Card runtime config (additions only)
- `zones[].continuous: true` — the zone's ranges form ONE pattern run in range order (pattern index and count span all ranges).
- `zones[].mirrorOf: '<zoneId>'`, `zones[].mirrorFlip: boolean` — on the live zones AND on `looks[].zones[]` entries: after rendering, this zone copies the source zone's logical pixels, stretched to its own length, reversed when `mirrorFlip`. Internal rendering only; Art-Net/WLED/HTTP frames are never touched.
- Studio emits `mirrorOf` for sides 2..n when the look (or live state) has `sidesMirrored`, pointing at `side-1`, with `mirrorFlip` from the flip rule. Own looks emit no `mirrorOf`.
- Firmware reports `capabilities.symmetrySides: 1`. Studio refuses to install a config using `continuous` or `mirrorOf` on a card without it, with the message "Update this card to play mirrored sides." (same pattern as `assertCardKaleidoscopeSupport`), and `cardIdentity.normalizeEvidenceCapabilities` keeps the key.
- Release: firmware VERSION 1.1.47 -> 1.2.0 (+ pinned literal in `tests/firmware-version-policy.mjs`).

### Studio preview
`renderPixelFrame({ ..., symmetry, sidesMirrored })`: a side renders as one continuous run across its strips (stripProgress runs 0..1 across the whole side in order); when `sidesMirrored`, sides 2..n copy side 1's colours stretched to their length, reversed per the flip rule. On-its-own strips render normally. Replaces `mirrorSets` in every preview/bake/recording path.

## Work packages (disjoint files; each in its own worktree)

- **WP-A firmware (Opus).** `firmware/lightweaver-controller/**`, `tests/firmware-version-policy.mjs`, firmware test files. Continuous zones, `mirrorOf`/`mirrorFlip` on zones and look zones, parse + strict validation, capability flag, RuntimeConfig byte cost stated, VERSION bump. Run `ci:firmware-sensitive` and a local compile.
- **WP-B model, compile, card contract (Sonnet).** `lib/pieceSymmetry.js`(+test), `lib/mirrorSets.js`, `lib/mirrorSetRules.js` (retire to migration only), `lib/projectModel.js`, `state/ProjectContext.jsx`, `state/layoutReducer.js`, `lib/wiringCompiler.js`, `lib/cardRuntimeContract.js`, `lib/cardRuntimeProject.js`, `lib/sectionLookModel.js`, `lib/cardPushClient.js`, `lib/cardIdentity.js`, `lib/cardProjectResolver.js`, `lib/cardDeployment.js`, `lib/export.js`, `lib/sceneExpressionDelivery.js`, `scene-expression/sceneExpressionPreviewTopology.js`, `components/card/CardCommissioningPanel.jsx`, `v3/app.jsx`, `tests/*.mjs` node specs it breaks or needs.
- **WP-C preview paths (Sonnet).** `lib/mirrorFrame.js`, `lib/frameEngine.js`, `v3/PatternPreview.jsx`, `lib/patternPiecePreview.js`, `lib/patternLabPatternAdapter.js`, `pattern-lab/**`, `lib/sceneExpressionRecording.js`, `lib/lwseqBake.js`, `lib/patternLabHandoff.js`, `lib/cardRecordedMedia.js`, `lib/aiPatternDraft.js`, `v3/lw-playlist.jsx`, `v3/lw-show.jsx`, `scene-expression/SceneExpressionEditor.jsx`, their tests.
- **WP-D Layout sidebar and canvas (Opus).** `components/layout/**`, `lib/mirrorPartners.js`, new `lib/symmetrySuggest.js` (+tests; `suggestSymmetry(strips, fold, artwork?) -> { sides, confidence }` using `mirrorPartners` and `artworkSymmetry`), `tests/layout-mirror.spec.ts` (rewrite as `layout-symmetry.spec.ts`), one line in `package.json`. Removes the v1 "Mirror with…" menu item and checklist.
- **WP-E Patterns (Sonnet).** `v3/lw-pattern.jsx`, `lib/mirrorSectionCopy.js`, `tests/patterns-v3.spec.ts`, `tests/patterns-section-row.spec.ts`. The per-look choice, section labels, saving `sidesMirrored` into looks.

Order: all five in parallel against this contract; manager merges B first, then C, D, E, A; full gate once; one PR; ship; firmware release signs after merge.
